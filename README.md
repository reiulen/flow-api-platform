# Flow API Platform

Fondasi API lokal/self-hosted untuk mengotomasi akun Google Flow milik sendiri. Proyek ini membungkus sesi browser Flow menjadi REST API dengan durable jobs, retry, idempotency, multi-account scheduling, circuit breaker, polling, dan signed webhooks.

> Status: `1.0.0-alpha.2`. Infrastruktur ketahanan sudah berjalan dan diuji. Adapter Flow masih memakai private RPC + UI fallback, sehingga contract test dengan akun nyata wajib dilakukan setiap kali Flow berubah. Ini bukan API resmi Google dan tidak membypass login, CAPTCHA, kuota, kredit, atau entitlement.

## Arsitektur

```text
Client
  │ Bearer key + Idempotency-Key
  ▼
Fastify API ── validation ── rate limit ── SSRF protection
  │
  ▼
SQLite WAL ── jobs ── leases ── checkpoints ── event history
  │
  ├── account scheduler / health score / circuit breaker
  ├── Flow browser + private RPC adapter
  ├── result poller
  └── HMAC webhook dispatcher + retry/dead-letter
```

Checkpoint `submitted` disimpan sebelum polling. Jika worker mati setelah menekan Generate, retry hanya melanjutkan polling dan tidak mengirim generation kedua.

## Instalasi

Persyaratan: macOS, Google Chrome, Node.js 22.5+.

```bash
cd /Users/reihanpraja/Documents/Codex/2026-09-30/role-x20/outputs/flow-api-platform
npm install
cp .env.example .env
```

Buat secret:

```bash
openssl rand -base64 48 | tr -d '\n'   # FLOW_API_KEY; ambil minimal 32 karakter
openssl rand -base64 32                 # FLOW_MASTER_KEY
```

Masukkan nilainya ke `.env`, kemudian:

```bash
npm start
```

Untuk Affiliate Studio, jalankan 9router dan hubungkan akun ChatGPT/Codex dari dashboard 9router. Buat API key lokal dari dashboard, lalu isi konfigurasi berikut di `.env`:

```bash
NINE_ROUTER_BASE_URL=http://127.0.0.1:20128/v1
NINE_ROUTER_API_KEY=isi-dari-dashboard-9router
# Opsional. Kosongkan agar aplikasi memilih model Codex/combo vision terbaik dari katalog aktif.
NINE_ROUTER_MODEL=
NINE_ROUTER_TIMEOUT_MS=90000
```

Jangan commit API key 9router. Affiliate Studio sengaja gagal dengan pesan konfigurasi yang jelas jika 9router atau key belum tersedia. Pipeline ini tidak kembali ke prompt template lokal karena fallback tersebut dapat mengarang atribut dan klaim produk.

Alur Affiliate Studio adalah `9router/Codex planning → frame referensi per shot → review/regenerate → persetujuan → Google Flow`. Pembuatan draft tidak langsung memakai kredit video Flow. Durasi total yang tersedia adalah 10, 14, 18, 20, 24, 26, dan 30 detik; engine membaginya otomatis menjadi klip Omni 4, 6, 8, atau 10 detik lalu menerapkan last-frame chaining.

Secara default API dan worker berjalan dalam satu proses pada `127.0.0.1:8787`. Untuk deployment terpisah, set `FLOW_EMBEDDED_WORKER=false`, jalankan `npm start`, lalu `npm run worker`.

## Dokumentasi API Interaktif (Swagger & Scalar)

Setelah server berjalan (`npm start`), buka dokumentasi interaktif di browser:

- **Swagger UI**: [http://127.0.0.1:8787/docs](http://127.0.0.1:8787/docs) (bisa juga langsung akses `http://127.0.0.1:8787/`)
- **Modern Scalar Reference**: [http://127.0.0.1:8787/reference](http://127.0.0.1:8787/reference) (atau `/scalar`)
- **OpenAPI 3.1 Spec (JSON)**: [http://127.0.0.1:8787/openapi.json](http://127.0.0.1:8787/openapi.json)

> **Tips:** Di Swagger UI / Scalar, klik tombol **Authorize** di kanan atas lalu masukkan `FLOW_API_KEY` Anda untuk langsung mencoba mengeksekusi request ("Try it out") dari browser!

## Menambahkan akun Flow

```bash
curl -X POST http://127.0.0.1:8787/v1/accounts \
  -H "Authorization: Bearer $FLOW_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"label":"Primary","profileName":"primary"}'
```

Gunakan ID yang dikembalikan:

```bash
npm run login -- acc_xxx
```

Login dilakukan langsung pada Chrome lokal. Cookie tidak dikirim ke API client maupun pihak ketiga. Setelah login, CLI menandai akun `ready`. Endpoint verify juga tersedia:

```bash
curl -X POST http://127.0.0.1:8787/v1/accounts/acc_xxx/verify \
  -H "Authorization: Bearer $FLOW_API_KEY"
```

Jangan menyalin folder `profiles/`; folder tersebut mengandung sesi Google.

### Guided login seperti konsep UseAPI

Selain CLI, platform dapat membuka browser setup melalui API:

```bash
curl -X POST http://127.0.0.1:8787/v1/accounts/acc_xxx/setup \
  -H "Authorization: Bearer $FLOW_API_KEY"

curl http://127.0.0.1:8787/v1/accounts/acc_xxx/setup/status \
  -H "Authorization: Bearer $FLOW_API_KEY"
```

Ulangi registrasi dan setup untuk kelima akun. Setiap akun mendapatkan folder profil Chrome sendiri. Password, cookie, dan token tidak pernah diminta lewat REST API.

Untuk membuat lima slot akun sekaligus dengan priority `10–50` dan mode `exhaust_first`:

```bash
npm run accounts:init
```

Perintah akan mencetak lima perintah `npm run login -- acc_xxx` yang perlu dijalankan satu per satu.

## Pool lima akun dan pergantian kredit

Tersedia empat strategi:

- `exhaust_first`: gunakan akun dengan priority terkecil sampai kreditnya habis, lalu pindah otomatis.
- `balanced`: pilih akun sehat dengan beban terendah dan kredit terbanyak.
- `round_robin`: rotasi akun secara bergantian.
- `project_sticky`: project key otomatis melekat pada satu akun.

Contoh: habiskan akun pertama, kemudian akun kedua dan seterusnya:

```bash
curl -X PUT http://127.0.0.1:8787/v1/routing \
  -H "Authorization: Bearer $FLOW_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"strategy":"exhaust_first","minCredits":1,"autoFailover":true}'
```

Daftarkan akun dengan priority `10`, `20`, `30`, `40`, dan `50`. Priority dapat diubah:

```bash
curl -X PATCH http://127.0.0.1:8787/v1/accounts/acc_xxx \
  -H "Authorization: Bearer $FLOW_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"priority":10}'
```

Refresh kredit akun secara manual:

```bash
curl -X POST http://127.0.0.1:8787/v1/accounts/acc_xxx/credits/refresh \
  -H "Authorization: Bearer $FLOW_API_KEY"
```

Worker juga memperbarui kredit setelah generation. Jika UI melaporkan kredit habis, akun diberi status `exhausted`, dikeluarkan dari scheduler, dan job dicoba pada akun berikutnya tanpa dikirim dua kali.

### Mengunci project ke akun

```bash
curl -X PUT http://127.0.0.1:8787/v1/project-bindings \
  -H "Authorization: Bearer $FLOW_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "projectKey":"brand-a-social",
    "accountId":"acc_xxx",
    "flowProjectId":"00000000-0000-0000-0000-000000000000",
    "allowFailover":true
  }'
```

Kirim `projectKey` yang sama pada request image/video. Jika `allowFailover=false`, job menunggu akun tersebut; jika `true`, scheduler boleh memakai akun sehat lain ketika akun utama habis atau circuit-nya terbuka.

## Generation API

### Image

```bash
curl -X POST http://127.0.0.1:8787/v1/images \
  -H "Authorization: Bearer $FLOW_API_KEY" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: campaign-42-image-1' \
  -d '{
    "prompt":"Cinematic rice terraces at sunrise",
    "model":"nano-banana-pro",
    "aspectRatio":"16:9"
  }'
```

### Video (Single Clip)

```bash
curl -X POST http://127.0.0.1:8787/v1/videos \
  -H "Authorization: Bearer $FLOW_API_KEY" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: campaign-42-video-1' \
  -d '{
    "prompt":"Slow aerial push through morning fog",
    "model":"omni-1-1-flash",
    "aspectRatio":"16:9",
    "duration":10,
    "replyUrl":"https://example.com/hooks/flow"
  }'
```

### Video Chaining (Continuous Long-Form / Multi-Shot Storyboard)

Menghasilkan video berdurasi panjang (**15 dtk, 20 dtk, 30 dtk, hingga 60 dtk+**) yang melebihi batas native 10 detik Google Flow dengan konsistensi adegan yang mulus:
1. Menghasilkan Segmen 1 (0-10 dtk) via Flow.
2. Mengekstrak frame terakhir (last frame) sebagai PNG berkualitas tinggi via FFmpeg (`-sseof -0.1`).
3. Mengunggah frame tersebut secara otomatis ke slot **Start Frame** pada mode `Frames` untuk Segmen 2 (10-20 dtk).
4. Mengulangi proses tersebut untuk setiap segmen berikutnya.
5. Menggabungkan (concatenate) semua segmen secara instan dan lossless (`ffmpeg -f concat -c copy`) menjadi `master.mp4`.
6. Menyediakan URL video master siap streaming dengan dukungan HTTP 206 Partial Content (Range).

**Contoh: Storyboard Multi-Shot 30 Detik (3 Segmen x 10 dtk)**
```bash
curl -X POST http://127.0.0.1:8787/v1/videos/chain \
  -H "Authorization: Bearer $FLOW_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "prompts": [
      "Slow aerial push through morning fog above green tea plantation, misty golden hour",
      "Camera glides lower, brushing past dew-covered emerald tea leaves as sunlight breaks through",
      "Close-up focus on a young tea bud glistening with fresh dew drops, soft bokeh background"
    ],
    "targetDuration": 30,
    "segmentDuration": 10,
    "model": "omni-1-1-flash",
    "aspectRatio": "16:9"
  }'
```

**Contoh: Single Prompt Continuous Push 20 Detik (2 Segmen)**
```bash
curl -X POST http://127.0.0.1:8787/v1/videos/chain \
  -H "Authorization: Bearer $FLOW_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "prompt": "Cinematic drone shot flying through a neon-lit cyberpunk city in heavy rain at night",
    "targetDuration": 20,
    "model": "omni-1-1-flash",
    "aspectRatio": "16:9"
  }'
```

**Hasil Job Video Chaining:**
```json
{
  "type": "video_chain",
  "masterUrl": "/v1/media/chains/job_xxx/master.mp4",
  "downloadUrl": "/v1/media/chains/job_xxx/master.mp4?download=true",
  "totalDuration": 30,
  "segmentsCount": 3,
  "segments": [
    {
      "index": 0,
      "duration": 10,
      "prompt": "Slow aerial push...",
      "url": "https://flow-content.google/video/...",
      "segmentUrl": "/v1/media/chains/job_xxx/segment_0.mp4",
      "lastFrameUrl": "/v1/media/chains/job_xxx/frame_0.png"
    }
  ]
}
```

Video master dapat langsung diputar pada elemen `<video src="http://127.0.0.1:8787/v1/media/chains/job_xxx/master.mp4">` dengan dukungan seeking instan via HTTP 206 Partial Content.

Jika `replyUrl` dipakai, respons pertama mengembalikan `webhookSecret` satu kali. Simpan secret tersebut. Signature dikirim sebagai:

```text
x-flow-timestamp: UNIX_SECONDS
x-flow-signature: v1=HMAC_SHA256(secret, "timestamp.rawBody")
```

### Status, riwayat, cancel

```bash
curl -H "Authorization: Bearer $FLOW_API_KEY" http://127.0.0.1:8787/v1/jobs/job_xxx
curl -H "Authorization: Bearer $FLOW_API_KEY" 'http://127.0.0.1:8787/v1/jobs?state=running'
curl -X POST -H "Authorization: Bearer $FLOW_API_KEY" http://127.0.0.1:8787/v1/jobs/job_xxx/cancel
```

State machine: `queued → running → completed`, dengan cabang `retrying`, `action_required`, `failed`, atau `cancelled`.

## Endpoint baca

- `GET /v1/models`
- `GET /v1/credits`
- `GET /v1/projects`
- `GET /v1/projects/:id/contents`
- `GET /v1/accounts`
- `GET /openapi.json`
- `GET /healthz`

Gunakan `GET /v1/credits` tanpa parameter untuk memeriksa dan memperbarui sisa kredit seluruh akun aktif sekaligus (lengkap dengan total kredit). Gunakan query `accountId=acc_xxx` untuk memilih akun tertentu.

## Ketahanan dan keamanan

- API bind ke loopback secara default.
- Perbandingan bearer token dilakukan constant-time.
- Master key harus tepat 32 byte dan melindungi webhook secret dengan AES-256-GCM.
- Log meredaksi header authorization.
- SQLite memakai WAL, foreign keys, busy timeout, persistent leases, dan crash reconciliation.
- Tiga kegagalan akun membuka circuit selama lima menit.
- Retry memakai exponential backoff + jitter.
- Webhook hanya HTTPS, menolak credential URL, private/loopback IP, dan redirect.
- Webhook gagal dicoba maksimal delapan kali lalu masuk state `dead`.
- Satu akun dibatasi satu generation bersamaan untuk mencegah tab/browser race; concurrency dicapai melalui beberapa akun.
- `Idempotency-Key` mencegah duplikasi request dari client.

## Batasan alpha yang masih perlu dibuktikan

- Selector UI dan posisi field proto Google adalah kontrak privat dan dapat berubah.
- Pemetaan pilihan model/aspect ratio perlu contract test pada setiap varian akun/locale.
- Result detection saat ini membandingkan snapshot project dan URL media baru.
- Upload asset, character, voice, video extend/upscale, dashboard admin, dan Postgres/Redis horizontal mode belum termasuk alpha ini.
- CAPTCHA tidak dipecahkan oleh platform. Jika Google meminta verifikasi, job/account menjadi `action_required`.

Sebelum menyebut layanan ini setara UseAPI secara produksi, lakukan canary generation nyata, restart/chaos test, soak test 24–72 jam, rotasi secret, serta uji perubahan bundle Flow. Detail hasil reverse engineering ada di [AUDIT-REVERSE-ENGINEERING.md](./AUDIT-REVERSE-ENGINEERING.md).

## Pengujian

```bash
npm run check
npm test
```

Test saat ini mencakup AES-GCM, signature HMAC, parser `batchexecute`, database WAL, idempotency, leasing, checkpoint, account acquisition, dan completion state.
