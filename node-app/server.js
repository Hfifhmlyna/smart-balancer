const express = require('express');
const app = express();

const SERVER_ID   = process.env.SERVER_ID   || 'NODE-APP-1';
const SERVER_PORT = process.env.SERVER_PORT || 4000;
const SERVER_WEIGHT = parseInt(process.env.SERVER_WEIGHT || '1');

let totalRequests = 0;
let startTime = Date.now();

app.use(express.json());

app.use((req, res, next) => {
  totalRequests++;
  const delay = Math.floor(Math.random() * 30);
  setTimeout(next, delay);
});

app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    serverId: SERVER_ID,
    weight: SERVER_WEIGHT,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    totalRequests,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/data', (req, res) => {
  res.json({
    success: true,
    server: SERVER_ID,
    weight: SERVER_WEIGHT,
    message: `Response dari ${SERVER_ID}`,
    requestNumber: totalRequests,
    processedAt: new Date().toISOString(),
    responseTimeMs: Math.floor(Math.random() * 50) + 10
  });
});

app.get('/api/stats', (req, res) => {
  res.json({
    serverId: SERVER_ID,
    totalRequests,
    weight: SERVER_WEIGHT,
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
  });
});

app.listen(SERVER_PORT, () => {
  console.log(`[${SERVER_ID}] Berjalan di port ${SERVER_PORT} | Weight: ${SERVER_WEIGHT}`);
});
