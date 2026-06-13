const express = require('express');
const http    = require('http');
const path    = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Konfigurasi Backend ───────────────────────────────────────────────────────
const BACKENDS = [
  { id: 'NODE-APP-1', host: 'app1', port: 4000, weight: 3, online: false, requests: 0, totalResponseTime: 0 },
  { id: 'NODE-APP-2', host: 'app2', port: 4000, weight: 2, online: false, requests: 0, totalResponseTime: 0 },
  { id: 'NODE-APP-3', host: 'app3', port: 4000, weight: 1, online: false, requests: 0, totalResponseTime: 0 },
];

let totalProxied     = 0;
let failoverCount    = 0;
let weightedQueue    = [];   // antrian WRR
let wrrIndex         = 0;

// ── Weighted Round Robin ─────────────────────────────────────────────────────
function buildWeightedQueue() {
  const active = BACKENDS.filter(b => b.online);
  if (active.length === 0) return [];
  const queue = [];
  active.forEach(b => {
    for (let i = 0; i < b.weight; i++) queue.push(b);
  });
  // Shuffle agar distribusi tidak blok
  for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [queue[i], queue[j]] = [queue[j], queue[i]];
  }
  return queue;
}

function pickServer() {
  const active = BACKENDS.filter(b => b.online);
  if (active.length === 0) return null;

  if (weightedQueue.length === 0 || wrrIndex >= weightedQueue.length) {
    weightedQueue = buildWeightedQueue();
    wrrIndex = 0;
  }

  // pastikan server masih online
  let attempts = 0;
  while (attempts < weightedQueue.length) {
    const candidate = weightedQueue[wrrIndex % weightedQueue.length];
    wrrIndex++;
    if (candidate.online) return candidate;
    attempts++;
  }
  return active[0]; // fallback
}

// ── Health Check ─────────────────────────────────────────────────────────────
function checkHealth(backend) {
  return new Promise(resolve => {
    const options = {
      hostname: backend.host,
      port:     backend.port,
      path:     '/health',
      method:   'GET',
      timeout:  3000,
    };
    const req = http.request(options, res => {
      let data = '';
      res.on('data', d => (data += d));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ ok: res.statusCode === 200, data: json });
        } catch { resolve({ ok: false }); }
      });
    });
    req.on('error', () => resolve({ ok: false }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false }); });
    req.end();
  });
}

async function runHealthChecks() {
  let changed = false;
  for (const b of BACKENDS) {
    const prev = b.online;
    const result = await checkHealth(b);
    b.online = result.ok;
    if (b.online && result.data) {
      b.serverUptime   = result.data.uptime;
      b.serverRequests = result.data.totalRequests;
    }
    if (prev !== b.online) {
      changed = true;
      failoverCount++;
      console.log(`[HEALTH] ${b.id} → ${b.online ? 'ONLINE ✓' : 'OFFLINE ✗'} | Failover #${failoverCount}`);
    }
  }
  if (changed) {
    weightedQueue = [];
    wrrIndex = 0;
    console.log('[WRR] Antrian direset karena perubahan status server');
  }
}

setInterval(runHealthChecks, 2000);
runHealthChecks();

// ── Proxy Helper ──────────────────────────────────────────────────────────────
function proxyRequest(backend, req, res) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const options = {
      hostname: backend.host,
      port:     backend.port,
      path:     req.url,
      method:   req.method,
      headers:  { ...req.headers, host: `${backend.host}:${backend.port}` },
      timeout:  5000,
    };

    const proxyReq = http.request(options, proxyRes => {
      res.setHeader('X-Served-By',    backend.id);
      res.setHeader('X-Backend-Host', backend.host);
      res.setHeader('X-Algorithm',    'Weighted-Round-Robin');
      res.statusCode = proxyRes.statusCode;
      Object.entries(proxyRes.headers).forEach(([k, v]) => res.setHeader(k, v));

      proxyRes.pipe(res);
      proxyRes.on('end', () => {
        const rt = Date.now() - start;
        backend.requests++;
        backend.totalResponseTime += rt;
        totalProxied++;
        resolve(rt);
      });
    });

    proxyReq.on('error', reject);
    proxyReq.on('timeout', () => { proxyReq.destroy(); reject(new Error('timeout')); });

    if (req.body && Object.keys(req.body).length > 0) {
      proxyReq.write(JSON.stringify(req.body));
    }
    proxyReq.end();
  });
}

// ── Routes ────────────────────────────────────────────────────────────────────

// Status dashboard API
app.get('/gateway/status', (req, res) => {
  const active = BACKENDS.filter(b => b.online).length;
  res.json({
    algorithm:    'Weighted Round Robin',
    activeBackends: active,
    totalBackends:  BACKENDS.length,
    totalProxied,
    failoverCount,
    servers: BACKENDS.map(b => ({
      id:           b.id,
      host:         b.host,
      port:         b.port,
      weight:       b.weight,
      online:       b.online,
      requests:     b.requests,
      avgResponseMs: b.requests > 0
        ? Math.round(b.totalResponseTime / b.requests)
        : 0,
      serverUptime:    b.serverUptime    || 0,
      serverRequests:  b.serverRequests  || 0,
    })),
  });
});

// Proxy semua /api/* ke backend
app.all('/api/*', async (req, res) => {
  const server = pickServer();
  if (!server) {
    return res.status(503).json({
      success: false,
      message: 'Semua server backend offline. Silakan coba beberapa saat lagi.',
      timestamp: new Date().toISOString(),
    });
  }

  try {
    await proxyRequest(server, req, res);
  } catch (err) {
    console.error(`[PROXY] Error ke ${server.id}: ${err.message}`);
    server.online = false;
    weightedQueue = [];
    wrrIndex = 0;

    // Failover ke server lain
    const fallback = pickServer();
    if (!fallback) {
      return res.status(503).json({
        success: false,
        message: 'Semua server backend offline.',
        timestamp: new Date().toISOString(),
      });
    }
    try {
      await proxyRequest(fallback, req, res);
    } catch {
      res.status(502).json({ success: false, message: 'Bad Gateway' });
    }
  }
});

// Serve dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.GATEWAY_PORT || 8080;
app.listen(PORT, () => {
  console.log(`[GATEWAY] Smart Load Balancer berjalan di port ${PORT}`);
  console.log(`[GATEWAY] Algoritma: Weighted Round Robin`);
  console.log(`[GATEWAY] Backend: ${BACKENDS.map(b => `${b.id}(w=${b.weight})`).join(', ')}`);
});
