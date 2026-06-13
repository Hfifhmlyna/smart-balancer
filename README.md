# Smart Load Balancer — Distributed Systems Project

## Perbedaan dari Versi Standar

| Fitur | Versi Standar | Versi Ini (Smart) |
|-------|--------------|-------------------|
| Algoritma | Round Robin | **Weighted Round Robin** |
| Nama service | server1/2/3 | **app1/app2/app3** |
| Nama container | load-balancer | **gateway** |
| Port dashboard | 3000 | **8080** |
| Server weight | Sama semua | **3 : 2 : 1** |
| Theme dashboard | Light | **Dark Modern** |
| Response time tracking | Tidak | **Ya** |
| Avg response stats | Tidak | **Ya** |
| Auto-simulate requests | Tidak | **Ya (built-in)** |

---

## Struktur Proyek

```
smart-balancer/
├── node-app/          ← Satu Dockerfile untuk 3 backend
│   ├── Dockerfile
│   ├── package.json
│   └── server.js
├── gateway/           ← Load Balancer (Weighted Round Robin)
│   ├── public/
│   │   └── index.html
│   ├── Dockerfile
│   ├── package.json
│   └── server.js
└── docker-compose.yml
```

---

## Cara Menjalankan di Docker Desktop

### Prasyarat
- Docker Desktop terinstall dan berjalan
- PowerShell / CMD / Git Bash

### Langkah 1 — Clone / Siapkan Folder
Pastikan struktur folder sudah seperti di atas.

### Langkah 2 — Build & Jalankan
```bash
cd smart-balancer
docker-compose up --build
```

Tunggu hingga semua container STATUS = **healthy**.

### Langkah 3 — Buka Dashboard
Buka browser: **http://localhost:8080**

---

## Cara Uji Failover

### Matikan satu server:
```bash
docker stop smart-app2
```
→ Dashboard otomatis menampilkan NODE-APP-2 OFFLINE.
→ Traffic dialihkan ke NODE-APP-1 dan NODE-APP-3.

### Matikan dua server:
```bash
docker stop smart-app1
docker stop smart-app2
```
→ Semua traffic ke NODE-APP-3 saja.

### Matikan semua server:
```bash
docker stop smart-app1 smart-app2 smart-app3
```
→ Response: `{ "message": "Semua server backend offline..." }`

### Nyalakan kembali:
```bash
docker start smart-app2
```
→ Dalam ~2 detik dashboard akan menampilkan ONLINE kembali.

---

## Penjelasan Weighted Round Robin

Server mendapat traffic proporsional dengan bobotnya:

- NODE-APP-1 → weight 3 → ~50% request
- NODE-APP-2 → weight 2 → ~33% request
- NODE-APP-3 → weight 1 → ~17% request

Berguna untuk server dengan spesifikasi berbeda (CPU/RAM lebih besar → weight lebih tinggi).

---

## Perintah Berguna

```bash
# Lihat log semua container
docker-compose logs -f

# Lihat log gateway saja
docker-compose logs -f gateway

# Stop semua
docker-compose down

# Stop + hapus image
docker-compose down --rmi all

# Status container
docker ps
```

---

## API Endpoints

| Endpoint | Keterangan |
|----------|-----------|
| `GET /` | Dashboard monitoring |
| `GET /gateway/status` | Status JSON semua server |
| `GET /api/data` | Request yang di-proxy ke backend |
| `GET /api/stats` | Statistik backend |
