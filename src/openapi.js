export function createOpenApiSpec(config = {}) {
  const host = config.host || '127.0.0.1';
  const port = config.port || 8787;
  const baseUrl = `http://${host}:${port}`;

  return {
    openapi: '3.1.0',
    info: {
      title: 'Flow API Platform',
      version: '1.0.0-alpha.2',
      description: `
## 🌊 Selamat Datang di Flow API Platform!

Platform ini membungkus sesi browser Google Flow menjadi **REST API** yang siap pakai dengan dukungan **durable jobs**, retry ber-jitter, multi-account pooling, circuit breaker, dan signed webhooks.

### 🔑 Autentikasi
Gunakan header **Bearer Token** pada setiap request (kecuali endpoint publik seperti \`/healthz\`, \`/openapi.json\`, \`/docs\`, dan \`/reference\`):
\`\`\`http
Authorization: Bearer <FLOW_API_KEY>
\`\`\`
Di Swagger UI ini, klik tombol **Authorize** di kanan atas dan masukkan API Key Anda!

---

### 🚀 Alur Kerja Cepat (Quickstart):
1. **Daftarkan Akun Chrome**: \`POST /v1/accounts\` dengan label dan profileName unik.
2. **Login Google**: Jalankan \`POST /v1/accounts/{id}/setup\` atau lewat CLI \`npm run login -- <id>\`.
3. **Generate Gambar/Video**:
   - Gambar: \`POST /v1/images\` (mengembalikan \`job_id\` dengan status \`queued\`).
   - Video: \`POST /v1/videos\`.
4. **Pantau Hasil**:
   - Polling: \`GET /v1/jobs/{id}\` hingga \`state\` menjadi \`completed\`.
   - Webhook: Sertakan \`replyUrl\` saat submit job. Platform akan mengirim POST request saat selesai dengan signature HMAC-SHA256.

---

### 🛡️ Idempotency
Sertakan header \`Idempotency-Key\` (misal: UUID atau hash permintaan) pada \`POST /v1/images\` dan \`POST /v1/videos\` untuk mencegah generasi ganda jika jaringan Anda terputus.
      `.trim(),
      contact: {
        name: 'Flow API Platform Team',
      },
    },
    servers: [
      {
        url: '/',
        description: 'Server Saat Ini (Relative Origin)',
      },
      {
        url: baseUrl,
        description: `Direct Loopback (${host}:${port})`,
      },
      {
        url: `http://localhost:${port}`,
        description: `Localhost (localhost:${port})`,
      },
    ],
    tags: [
      {
        name: 'Generations',
        description: 'Antrean dan eksekusi pembuatan Gambar dan Video AI melalui Google Flow.',
      },
      {
        name: 'Jobs',
        description: 'Pelacakan status job, riwayat event, dan pembatalan generasi.',
      },
      {
        name: 'Accounts',
        description: 'Manajemen akun Google Flow, isolasi profil Chrome, setup login, dan kuota kredit.',
      },
      {
        name: 'Routing & Projects',
        description: 'Konfigurasi strategi multi-akun (exhaust_first, balanced, round_robin, project_sticky) dan binding project.',
      },
      {
        name: 'Flow Reads',
        description: 'Query langsung ke Google Flow untuk model aktif, sisa kredit, daftar project, dan konten media.',
      },
      {
        name: 'System',
        description: 'Pemeriksaan kesehatan server dan metadata OpenAPI.',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'API Key',
          description: 'Masukkan API Key Anda (FLOW_API_KEY) yang terkonfigurasi di file .env',
        },
      },
      responses: {
        BadRequest: {
          description: 'Input request tidak valid atau gagal validasi',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
        },
        Unauthorized: {
          description: 'API key tidak valid atau header Authorization tidak disertakan',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
        },
        NotFound: {
          description: 'Resource yang dicari tidak ditemukan',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
        },
        ServiceUnavailable: {
          description: 'Tidak ada akun Flow sehat yang siap melayani request',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
        },
      },
      schemas: {
        ErrorDetail: {
          type: 'object',
          properties: {
            fieldErrors: {
              type: 'object',
              additionalProperties: { type: 'array', items: { type: 'string' } },
            },
            formErrors: {
              type: 'array',
              items: { type: 'string' },
            },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              required: ['code', 'message', 'requestId'],
              properties: {
                code: { type: 'string', example: 'validation_error' },
                message: { type: 'string', example: 'Input akun tidak valid' },
                requestId: { type: 'string', example: 'req-42' },
                details: { $ref: '#/components/schemas/ErrorDetail' },
              },
            },
          },
        },
        Account: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'acc_7b66ec07-5ee8-4c07-b355-32e67df1407f' },
            label: { type: 'string', example: 'Primary' },
            email: { type: 'string', nullable: true, example: 'creator@gmail.com' },
            profileName: { type: 'string', example: 'primary' },
            projectId: { type: 'string', nullable: true, example: '866504a3-4b68-4501-9214-e0eec0dfdfaa' },
            status: {
              type: 'string',
              enum: ['ready', 'paused', 'action_required', 'exhausted'],
              example: 'ready',
            },
            priority: { type: 'integer', example: 10, description: 'Urutan prioritas (lebih kecil = didahulukan pada exhaust_first)' },
            consecutiveFailures: { type: 'integer', example: 0 },
            maxConcurrency: { type: 'integer', example: 1 },
            activeJobs: { type: 'integer', example: 0 },
            healthScore: { type: 'integer', example: 100 },
            circuitOpenUntil: { type: 'string', nullable: true, format: 'date-time' },
            creditsRemaining: { type: 'integer', nullable: true, example: 250 },
            creditsCheckedAt: { type: 'string', nullable: true, format: 'date-time' },
            exhaustedAt: { type: 'string', nullable: true, format: 'date-time' },
            lastUsedAt: { type: 'string', nullable: true, format: 'date-time' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        AccountInput: {
          type: 'object',
          required: ['label', 'profileName'],
          properties: {
            label: { type: 'string', minLength: 1, maxLength: 80, example: 'Primary' },
            email: { type: 'string', format: 'email', example: 'creator@example.com' },
            profileName: {
              type: 'string',
              pattern: '^[a-zA-Z0-9_-]{1,64}$',
              example: 'primary',
              description: 'Nama folder profil Chrome lokal (hanya huruf, angka, underscore, minus)',
            },
            projectId: { type: 'string', format: 'uuid', example: '866504a3-4b68-4501-9214-e0eec0dfdfaa' },
            maxConcurrency: { type: 'integer', enum: [1], default: 1 },
            priority: { type: 'integer', minimum: 1, maximum: 1000, default: 100, example: 10 },
          },
          example: {
            label: 'Primary',
            profileName: 'primary',
            priority: 10,
          },
        },
        AccountUpdate: {
          type: 'object',
          properties: {
            label: { type: 'string', minLength: 1, maxLength: 80, example: 'Primary Cadangan' },
            priority: { type: 'integer', minimum: 1, maximum: 1000, example: 20 },
            projectId: { type: 'string', format: 'uuid', example: '866504a3-4b68-4501-9214-e0eec0dfdfaa' },
            status: { type: 'string', enum: ['ready', 'paused', 'action_required'], example: 'ready' },
          },
          example: {
            priority: 20,
            status: 'ready',
          },
        },
        ImageInput: {
          type: 'object',
          required: ['prompt'],
          properties: {
            prompt: {
              type: 'string',
              minLength: 1,
              maxLength: 20000,
              example: 'Cinematic photograph of rice terraces at sunrise, golden light, misty morning, 8k resolution photorealistic',
            },
            model: {
              type: 'string',
              enum: ['nano-banana-2-lite', 'nano-banana-2', 'nano-banana-pro'],
              default: 'nano-banana-2-lite',
              description: 'Model gambar Google Flow:\n- `nano-banana-2-lite`: 🍌 Nano Banana 2 Lite (Default)\n- `nano-banana-2`: 🍌 Nano Banana 2\n- `nano-banana-pro`: 🍌 Nano Banana Pro',
              example: 'nano-banana-2-lite',
            },
            aspectRatio: {
              type: 'string',
              enum: ['16:9', '4:3', '1:1', '3:4', '9:16'],
              default: '16:9',
              description: 'Rasio aspek gambar (16:9, 4:3, 1:1, 3:4, 9:16)',
              example: '16:9',
            },
            count: {
              type: 'integer',
              enum: [1, 2, 3, 4],
              default: 1,
              description: 'Jumlah gambar yang dihasilkan sekaligus (x1, x2, x3, x4)',
              example: 1,
            },
            accountId: {
              type: 'string',
              description: 'Target ID akun tertentu (opsional, jika kosong otomatis di-route)',
              example: 'acc_7b66ec07-5ee8-4c07-b355-32e67df1407f',
            },
            projectId: {
              type: 'string',
              format: 'uuid',
              description: 'Flow project UUID yang ditargetkan (opsional)',
              example: '866504a3-4b68-4501-9214-e0eec0dfdfaa',
            },
            projectKey: {
              type: 'string',
              pattern: '^[a-zA-Z0-9_.:-]{1,128}$',
              description: 'Kunci project virtual yang terikat ke akun tertentu lewat project-bindings',
              example: 'campaign-client-a',
            },
            seed: {
              type: 'integer',
              minimum: 0,
              example: 42,
            },
            references: {
              type: 'array',
              items: { type: 'string' },
              maxItems: 10,
              description: 'URL referensi gaya gambar',
            },
            replyUrl: {
              type: 'string',
              format: 'uri',
              description: 'Webhook HTTPS tujuan pengiriman hasil saat selesai',
              example: 'https://my-domain.com/webhooks/flow',
            },
          },
          example: {
            prompt: 'Cinematic photograph of rice terraces at sunrise, golden light, misty morning, 8k resolution photorealistic',
            model: 'nano-banana-2-lite',
            aspectRatio: '16:9',
            count: 1,
          },
        },
        VideoInput: {
          type: 'object',
          required: ['prompt'],
          properties: {
            prompt: {
              type: 'string',
              minLength: 1,
              maxLength: 20000,
              example: 'Slow aerial push through morning fog above green tea plantation',
            },
            model: {
              type: 'string',
              enum: ['omni-1-1-flash', 'veo-3-1-lite', 'veo-3-1-fast', 'veo-3-1-quality'],
              default: 'omni-1-1-flash',
              description: 'Model video Google Flow:\n- `omni-1-1-flash`: Omni 1.1 Flash (Default, hemat kredit)\n- `veo-3-1-lite`: Veo 3.1 - Lite\n- `veo-3-1-fast`: Veo 3.1 - Fast\n- `veo-3-1-quality`: Veo 3.1 - Quality',
              example: 'omni-1-1-flash',
            },
            mode: {
              type: 'string',
              enum: ['frames', 'ingredients'],
              default: 'frames',
              description: 'Mode pembuatan video di Flow:\n- `frames`: Frame to Frame (Urutan frame visual)\n- `ingredients`: Bahan / Ingredients (Referensi bahan)',
              example: 'frames',
            },
            aspectRatio: {
              type: 'string',
              enum: ['16:9', '9:16'],
              default: '16:9',
              description: 'Rasio aspek video (16:9 Landscape atau 9:16 Portrait)',
              example: '16:9',
            },
            resolution: {
              type: 'string',
              enum: ['1080p', '720p', '360p'],
              default: '720p',
              description: 'Pilihan resolusi video:\n- `1080p`: 1080p Full HD (Scale/Upscale via Veo 3.1 - Upsampler 1080P)\n- `720p`: 720p Standar HD (Default)\n- `360p`: 360p Hemat Kredit',
              example: '720p',
            },
            duration: {
              type: 'integer',
              enum: [4, 6, 8, 10],
              default: 8,
              description: 'Pilihan durasi video dalam detik (4, 6, 8, atau 10 detik)',
              example: 8,
            },
            count: {
              type: 'integer',
              enum: [1, 2, 3, 4],
              default: 1,
              description: 'Jumlah variasi video yang dihasilkan sekaligus (x1, x2, x3, x4)',
              example: 1,
            },
            startImage: {
              type: 'string',
              description: 'URL gambar awal sebagai frame acuan awal video (Image-to-Video / Frame 1)',
              example: 'https://storage.googleapis.com/example/start.png',
            },
            endImage: {
              type: 'string',
              description: 'URL gambar akhir untuk Frame-to-Frame interpolation (membutuhkan startImage)',
              example: 'https://storage.googleapis.com/example/end.png',
            },
            accountId: { type: 'string', example: 'acc_7b66ec07-5ee8-4c07-b355-32e67df1407f' },
            projectId: { type: 'string', format: 'uuid', example: '866504a3-4b68-4501-9214-e0eec0dfdfaa' },
            projectKey: { type: 'string', example: 'campaign-client-a' },
            references: {
              type: 'array',
              items: { type: 'string' },
              maxItems: 7,
              description: 'URL bahan/elemen visual referensi untuk mode ingredients',
            },
            replyUrl: {
              type: 'string',
              format: 'uri',
              example: 'https://my-domain.com/webhooks/flow',
            },
          },
          example: {
            prompt: 'Slow aerial push through morning fog above green tea plantation',
            model: 'omni-1-1-flash',
            mode: 'frames',
            aspectRatio: '16:9',
            resolution: '720p',
            duration: 8,
            count: 1,
          },
        },
        VideoChainInput: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              minLength: 1,
              maxLength: 20000,
              description: 'Prompt dasar video jika menggunakan 1 prompt untuk seluruh durasi panjang (engine akan otomatis merangkai kontinuitas kamera antarsegmen).',
              example: 'Slow cinematic aerial push through morning fog above green tea plantation, lush terraced hills',
            },
            prompts: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array prompt per segmen untuk storyboard multi-shot presisi. Setiap prompt mewakili 1 segmen video berturutan.',
              example: [
                'Slow aerial push through morning fog above green tea plantation, misty golden hour',
                'Camera glides lower, brushing past dew-covered emerald tea leaves as sunlight breaks through',
                'Close-up focus on a young tea bud glistening with fresh dew drops, soft bokeh background',
              ],
            },
            targetDuration: {
              type: 'integer',
              minimum: 8,
              maximum: 120,
              default: 20,
              description: 'Target total durasi video gabungan dalam detik (misal: 15, 20, 30, 45, 60 detik). Engine akan membagi menjadi segmen 10 dtk, mengekstrak frame terakhir, dan menggabungkannya secara lossless via FFmpeg.',
              example: 30,
            },
            segmentDuration: {
              type: 'integer',
              minimum: 4,
              maximum: 10,
              default: 10,
              description: 'Durasi tiap segmen dalam detik (Omni 1.1 Flash: 10 detik max).',
              example: 10,
            },
            model: {
              type: 'string',
              enum: ['omni-1-1-flash', 'veo-3-1-lite', 'veo-3-1-fast'],
              default: 'omni-1-1-flash',
              description: 'Model video yang digunakan untuk setiap segmen chaining.',
              example: 'omni-1-1-flash',
            },
            aspectRatio: {
              type: 'string',
              enum: ['16:9', '9:16', '1:1', '4:3', '3:4'],
              default: '16:9',
              description: 'Rasio aspek video.',
              example: '16:9',
            },
            resolution: {
              type: 'string',
              enum: ['720p', '360p'],
              default: '720p',
              description: 'Resolusi tiap segmen video.',
              example: '720p',
            },
            accountId: {
              type: 'string',
              description: 'ID akun Flow khusus untuk memproses chaining ini (opsional).',
              example: 'acc_42cb28bd-754d-4c94-a4a5-88a5314c155e',
            },
            projectId: {
              type: 'string',
              format: 'uuid',
              description: 'Flow Project ID khusus untuk generasi ini (opsional).',
            },
            replyUrl: {
              type: 'string',
              format: 'uri',
              description: 'Webhook callback URL yang dipanggil saat seluruh video selesai digabungkan.',
              example: 'https://webhook.site/my-callback',
            },
          },
        },
        UpscaleInput: {
          type: 'object',
          properties: {
            jobId: {
              type: 'string',
              description: 'ID job video/gambar sebelumnya yang ingin di-scale ke 1080p',
              example: 'job_48f79d94-efd0-44f9-b06e-756c02b7ae94',
            },
            mediaId: {
              type: 'string',
              description: 'ID media Google Flow langsung jika tidak menggunakan jobId',
              example: 'med_9a8b7c6d5e',
            },
            targetResolution: {
              type: 'string',
              enum: ['1080p', '4k', '2k'],
              default: '1080p',
              description: 'Target resolusi scaling:\n- `1080p`: Veo 3.1 - Upsampler 1080P (Video)\n- `4k`: Veo 3.1 - Upsampler 4K (Video) / 4k (Gambar)\n- `2k`: 2K (Gambar)',
              example: '1080p',
            },
            type: {
              type: 'string',
              enum: ['video', 'image'],
              default: 'video',
              description: 'Tipe media (video atau image)',
              example: 'video',
            },
            accountId: {
              type: 'string',
              description: 'Target ID akun Flow spesifik',
              example: 'acc_7b66ec07-5ee8-4c07-b355-32e67df1407f',
            },
            projectId: {
              type: 'string',
              format: 'uuid',
              description: 'Flow project UUID yang ditargetkan',
            },
            replyUrl: {
              type: 'string',
              format: 'uri',
              description: 'Webhook tujuan pengiriman hasil upscale',
              example: 'https://my-domain.com/webhooks/flow',
            },
          },
          example: {
            jobId: 'job_48f79d94-efd0-44f9-b06e-756c02b7ae94',
            targetResolution: '1080p',
            type: 'video',
          },
        },
        Job: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'job_4c995f90-1c09-43c7-8742-0fbc1476fa35' },
            type: { type: 'string', enum: ['image', 'video'], example: 'image' },
            state: {
              type: 'string',
              enum: ['queued', 'running', 'retrying', 'action_required', 'completed', 'failed', 'cancelled'],
              example: 'completed',
            },
            accountId: { type: 'string', nullable: true, example: 'acc_7b66ec07-5ee8-4c07-b355-32e67df1407f' },
            request: { type: 'object' },
            result: {
              type: 'object',
              nullable: true,
              properties: {
                projectId: { type: 'string', example: '866504a3-4b68-4501-9214-e0eec0dfdfaa' },
                media: {
                  type: 'array',
                  items: { type: 'string' },
                  example: ['https://storage.googleapis.com/flow-media-bucket/gen_01.mp4'],
                },
              },
            },
            error: { type: 'object', nullable: true },
            replyUrl: { type: 'string', nullable: true },
            checkpoint: { type: 'object', nullable: true },
            attempts: { type: 'integer', example: 1 },
            maxAttempts: { type: 'integer', example: 4 },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            completedAt: { type: 'string', nullable: true, format: 'date-time' },
          },
        },
        JobEvent: {
          type: 'object',
          properties: {
            state: { type: 'string', example: 'submitted' },
            detail: { type: 'object', nullable: true },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        RoutingPolicy: {
          type: 'object',
          properties: {
            strategy: {
              type: 'string',
              enum: ['balanced', 'round_robin', 'exhaust_first', 'project_sticky'],
              example: 'exhaust_first',
            },
            minCredits: { type: 'integer', minimum: 0, default: 1, example: 1 },
            autoFailover: { type: 'boolean', default: true, example: true },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        RoutingInput: {
          type: 'object',
          required: ['strategy'],
          properties: {
            strategy: {
              type: 'string',
              enum: ['balanced', 'round_robin', 'exhaust_first', 'project_sticky'],
              example: 'exhaust_first',
            },
            minCredits: { type: 'integer', minimum: 0, maximum: 1000000, default: 1, example: 1 },
            autoFailover: { type: 'boolean', default: true, example: true },
          },
          example: {
            strategy: 'exhaust_first',
            minCredits: 1,
            autoFailover: true,
          },
        },
        ProjectBinding: {
          type: 'object',
          properties: {
            projectKey: { type: 'string', example: 'brand-alpha' },
            accountId: { type: 'string', example: 'acc_7b66ec07-5ee8-4c07-b355-32e67df1407f' },
            flowProjectId: { type: 'string', nullable: true, format: 'uuid' },
            allowFailover: { type: 'boolean', example: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        ProjectBindingInput: {
          type: 'object',
          required: ['projectKey', 'accountId'],
          properties: {
            projectKey: {
              type: 'string',
              pattern: '^[a-zA-Z0-9_.:-]{1,128}$',
              example: 'brand-alpha',
            },
            accountId: {
              type: 'string',
              minLength: 5,
              example: 'acc_7b66ec07-5ee8-4c07-b355-32e67df1407f',
            },
            flowProjectId: {
              type: 'string',
              format: 'uuid',
              nullable: true,
              example: '866504a3-4b68-4501-9214-e0eec0dfdfaa',
            },
            allowFailover: {
              type: 'boolean',
              default: true,
              example: true,
            },
          },
          example: {
            projectKey: 'brand-alpha',
            accountId: 'acc_7b66ec07-5ee8-4c07-b355-32e67df1407f',
            allowFailover: true,
          },
        },
      },
    },
    paths: {
      '/healthz': {
        get: {
          tags: ['System'],
          summary: 'Health check service',
          description: 'Mengecek ketersediaan server flow-api-platform tanpa memerlukan autentikasi.',
          security: [],
          responses: {
            200: {
              description: 'Layanan berjalan normal',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      ok: { type: 'boolean', example: true },
                      service: { type: 'string', example: 'flow-api-platform' },
                      version: { type: 'string', example: '1.0.0-alpha.2' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/openapi.json': {
        get: {
          tags: ['System'],
          summary: 'Dapatkan spesifikasi OpenAPI 3.1 JSON',
          description: 'Mengunduh atau membaca spesifikasi OpenAPI lengkap dari platform ini.',
          security: [],
          responses: {
            200: {
              description: 'OpenAPI 3.1 schema dokumen',
              content: { 'application/json': { schema: { type: 'object' } } },
            },
          },
        },
      },
      '/v1/images': {
        post: {
          tags: ['Generations'],
          summary: 'Antrekan pembuatan gambar (Queue Image Generation)',
          description: `
Mendaftarkan permintaan generasi gambar ke sistem durable jobs. 
- Status awal adalah \`queued\` (HTTP 202 Accepted).
- Worker di latar belakang akan mengklaim job dan menjalankannya pada profil Chrome Flow yang aktif.
- Jika header \`Idempotency-Key\` disertakan dan request identik sudah pernah dikirim, endpoint akan mengembalikan job yang sudah ada dengan HTTP 200 OK.
- Jika \`replyUrl\` disertakan, respons pertama akan menyertakan \`webhookSecret\` (simpan untuk memverifikasi HMAC signature).
          `.trim(),
          parameters: [
            {
              name: 'wait',
              in: 'query',
              required: false,
              schema: { type: 'boolean', default: false },
              description: 'Jika bernilai true, server akan menahan koneksi HTTP hingga proses generate selesai dan langsung mengembalikan hasil gambar (Synchronous mode).',
            },
            {
              name: 'Idempotency-Key',
              in: 'header',
              required: false,
              schema: { type: 'string', maxLength: 200 },
              description: 'Kunci unik opsional untuk mencegah duplikasi (kosongkan jika ingin selalu generate job baru)',
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/x-www-form-urlencoded': {
                schema: { $ref: '#/components/schemas/ImageInput' },
              },
              'application/json': {
                schema: { $ref: '#/components/schemas/ImageInput' },
                examples: {
                  default: {
                    summary: 'Prompt Gambar (🍌 Nano Banana 2 Lite)',
                    value: {
                      prompt: 'Cinematic photograph of rice terraces at sunrise, golden light, misty morning, 8k resolution photorealistic',
                      model: 'nano-banana-2-lite',
                      aspectRatio: '16:9',
                      count: 1,
                    },
                  },
                  pro: {
                    summary: 'Prompt Gambar Pro (🍌 Nano Banana Pro)',
                    value: {
                      prompt: 'Hyperrealistic studio portrait of a futuristic cyberpunk character, neon lighting, highly detailed',
                      model: 'nano-banana-pro',
                      aspectRatio: '1:1',
                      count: 2,
                    },
                  },
                },
              },
            },
          },
          responses: {
            202: {
              description: 'Job berhasil dimasukkan ke antrean (Accepted)',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: { $ref: '#/components/schemas/Job' },
                      reused: { type: 'boolean', example: false },
                      webhookSecret: { type: 'string', example: 'secret_abc123_token' },
                    },
                  },
                },
              },
            },
            200: {
              description: 'Job identik sebelumnya dikembalikan via Idempotency-Key',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: { $ref: '#/components/schemas/Job' },
                      reused: { type: 'boolean', example: true },
                    },
                  },
                },
              },
            },
            400: { $ref: '#/components/responses/BadRequest' },
            401: { $ref: '#/components/responses/Unauthorized' },
            409: {
              description: 'Idempotency conflict (kunci sama dipakai untuk request dengan payload berbeda)',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
          },
        },
      },
      '/v1/videos': {
        post: {
          tags: ['Generations'],
          summary: 'Antrekan pembuatan video (Queue Video Generation)',
          description: `
Mendaftarkan permintaan generasi video (misal dengan Veo model atau Omni Flash) ke antrean durable jobs.
Dapat memilih model, mode (Frame to Frame atau Bahan), rasio aspek (16:9 / 9:16), resolusi (720p, 360p, atau 1080p), durasi (4, 6, 8, 10 dtk), dan count.
          `.trim(),
          parameters: [
            {
              name: 'wait',
              in: 'query',
              required: false,
              schema: { type: 'boolean', default: false },
              description: 'Jika bernilai true, server akan menahan koneksi HTTP hingga proses generate selesai dan langsung mengembalikan hasil video (Synchronous mode).',
            },
            {
              name: 'Idempotency-Key',
              in: 'header',
              required: false,
              schema: { type: 'string', maxLength: 200 },
              description: 'Kunci unik opsional untuk mencegah duplikasi (kosongkan jika ingin selalu generate job baru)',
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/x-www-form-urlencoded': {
                schema: { $ref: '#/components/schemas/VideoInput' },
              },
              'application/json': {
                schema: { $ref: '#/components/schemas/VideoInput' },
                examples: {
                  default: {
                    summary: 'Prompt Video (Omni 1.1 Flash 8 dtk)',
                    value: {
                      prompt: 'Slow aerial push through morning fog above green tea plantation',
                      model: 'omni-1-1-flash',
                      mode: 'frames',
                      aspectRatio: '16:9',
                      resolution: '720p',
                      duration: 8,
                      count: 1,
                    },
                  },
                  scale1080p: {
                    summary: 'Prompt Video 1080p (Scale to 1080p Full HD)',
                    value: {
                      prompt: 'Cinematic drone shot of turquoise ocean waves hitting volcanic black sand beach',
                      model: 'veo-3-1-fast',
                      mode: 'frames',
                      aspectRatio: '16:9',
                      resolution: '1080p',
                      duration: 8,
                      count: 1,
                    },
                  },
                  portraitVideo: {
                    summary: 'Prompt Video Portrait 9:16 (Story / TikTok)',
                    value: {
                      prompt: 'Macro shot of water droplets rolling on a vibrant green monstera leaf in rain',
                      model: 'omni-1-1-flash',
                      mode: 'frames',
                      aspectRatio: '9:16',
                      resolution: '720p',
                      duration: 6,
                      count: 1,
                    },
                  },
                },
              },
            },
          },
          responses: {
            202: {
              description: 'Job video berhasil diantrekan',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: { $ref: '#/components/schemas/Job' },
                      reused: { type: 'boolean', example: false },
                      webhookSecret: { type: 'string' },
                    },
                  },
                },
              },
            },
            200: {
              description: 'Hasil video selesai (Synchronous mode saat ?wait=true)',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: { $ref: '#/components/schemas/Job' },
                      reused: { type: 'boolean', example: false },
                    },
                  },
                },
              },
            },
            400: { $ref: '#/components/responses/BadRequest' },
            401: { $ref: '#/components/responses/Unauthorized' },
          },
        },
      },
      '/v1/videos/chain': {
        post: {
          tags: ['Generations'],
          summary: 'Buat Video Panjang / Multi-Shot Chaining (Long-Form Continuous Video)',
          description: `
Menghasilkan video berdurasi panjang (15s, 20s, 30s, hingga 60s+) yang melebihi batas native 10 detik Flow secara konsisten dan mulus.

### Mekanisme Chaining:
1. Menghasilkan Segmen 1 (0-10 dtk) berdasarkan prompt awal.
2. Mengekstrak frame paling akhir (last frame) secara presisi dengan FFmpeg (\`-sseof -0.1\`).
3. Mengunggah frame tersebut ke slot **Start Frame** pada Flow mode Frames untuk Segmen 2 (10-20 dtk).
4. Mengulangi proses tersebut untuk setiap segmen berikutnya sesuai storyboard atau prompt kontinuitas.
5. Menggabungkan seluruh segmen secara lossless tanpa re-encoding (\`ffmpeg -f concat -c copy\`) menjadi file master utuh.
6. Menyediakan URL video master siap streaming dengan dukungan HTTP 206 Partial Content (Range).
          `.trim(),
          parameters: [
            {
              name: 'wait',
              in: 'query',
              required: false,
              schema: { type: 'boolean', default: false },
              description: 'Tahan koneksi HTTP hingga video selesai digenerate (Synchronous).',
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/VideoChainInput' },
                examples: {
                  multiShotStoryboard: {
                    summary: '30s Multi-Shot Storyboard (3 Segmen x 10 dtk)',
                    value: {
                      prompts: [
                        'Slow aerial push through morning fog above green tea plantation, misty golden hour',
                        'Camera glides lower, brushing past dew-covered emerald tea leaves as sunlight breaks through',
                        'Close-up focus on a young tea bud glistening with fresh dew drops, soft bokeh background',
                      ],
                      targetDuration: 30,
                      segmentDuration: 10,
                      model: 'omni-1-1-flash',
                      aspectRatio: '16:9',
                    },
                  },
                  singlePromptContinuous: {
                    summary: '20s Single Prompt Continuous Camera Push (2 Segmen)',
                    value: {
                      prompt: 'Cinematic drone shot flying through a neon-lit cyberpunk city in heavy rain at night',
                      targetDuration: 20,
                      model: 'omni-1-1-flash',
                      aspectRatio: '16:9',
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Hasil video chaining berhasil dibuat (jika wait=true).',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Job' },
                },
              },
            },
            202: {
              description: 'Job video_chain berhasil dimasukkan ke antrean.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Job' },
                },
              },
            },
          },
        },
      },
      '/v1/media/chains/{jobId}/{filename}': {
        get: {
          tags: ['Generations'],
          summary: 'Stream atau Unduh Video Master / Segmen / Frame Chaining',
          description: 'Mengalirkan (streaming) video master hasil gabungan atau segmen individual dengan dukungan HTTP Range headers (206 Partial Content).',
          parameters: [
            {
              name: 'jobId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'ID job video chaining.',
            },
            {
              name: 'filename',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'Nama file yang ingin diunduh atau diputar (misal: master.mp4, segment_0.mp4, frame_0.png).',
              example: 'master.mp4',
            },
            {
              name: 'download',
              in: 'query',
              required: false,
              schema: { type: 'boolean', default: false },
              description: 'Jika bernilai true, mengembalikan header Content-Disposition attachment untuk langsung mengunduh file.',
            },
          ],
          responses: {
            200: {
              description: 'File video/gambar utuh.',
            },
            206: {
              description: 'Partial content streaming byte range untuk video player.',
            },
            404: {
              description: 'File tidak ditemukan.',
            },
          },
        },
      },
      '/v1/videos/upscale': {
        post: {
          tags: ['Generations'],
          summary: 'Scale / Upscale video ke 1080p (Scale Video to 1080p)',
          description: `
Melakukan scaling resolusi video yang telah dibuat sebelumnya ke resolusi 1080p Full HD menggunakan model resmi **Veo 3.1 - Upsampler 1080P**.
Anda dapat menyertakan \`jobId\` generasi video sebelumnya atau \`mediaId\` langsung dari Google Flow.
          `.trim(),
          parameters: [
            {
              name: 'wait',
              in: 'query',
              required: false,
              schema: { type: 'boolean', default: false },
              description: 'Jika bernilai true, server akan menahan koneksi HTTP hingga proses upscale selesai dan langsung mengembalikan hasil video 1080p.',
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/x-www-form-urlencoded': {
                schema: { $ref: '#/components/schemas/UpscaleInput' },
              },
              'application/json': {
                schema: { $ref: '#/components/schemas/UpscaleInput' },
                examples: {
                  byJobId: {
                    summary: 'Scale ke 1080p via Job ID',
                    value: {
                      jobId: 'job_48f79d94-efd0-44f9-b06e-756c02b7ae94',
                      targetResolution: '1080p',
                      type: 'video',
                    },
                  },
                  byMediaId: {
                    summary: 'Scale ke 1080p via Media ID Flow',
                    value: {
                      mediaId: 'med_9a8b7c6d5e',
                      targetResolution: '1080p',
                      type: 'video',
                    },
                  },
                },
              },
            },
          },
          responses: {
            202: {
              description: 'Job upscale video berhasil diantrekan',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: { $ref: '#/components/schemas/Job' },
                      reused: { type: 'boolean', example: false },
                    },
                  },
                },
              },
            },
            200: {
              description: 'Job upscale video selesai (Synchronous mode saat ?wait=true)',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: { $ref: '#/components/schemas/Job' },
                      reused: { type: 'boolean', example: false },
                    },
                  },
                },
              },
            },
            400: { $ref: '#/components/responses/BadRequest' },
            401: { $ref: '#/components/responses/Unauthorized' },
            404: { $ref: '#/components/responses/NotFound' },
          },
        },
      },
      '/v1/jobs': {
        get: {
          tags: ['Jobs'],
          summary: 'Daftar semua antrean job',
          description: 'Melihat daftar job dengan opsi filter berdasarkan status (state) dan batasan limit.',
          parameters: [
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', default: 50, minimum: 1, maximum: 200 },
              description: 'Jumlah maksimal job yang ditampilkan (default 50, max 200)',
            },
            {
              name: 'state',
              in: 'query',
              schema: {
                type: 'string',
                enum: ['queued', 'running', 'retrying', 'action_required', 'completed', 'failed', 'cancelled'],
              },
              description: 'Filter menurut status job saat ini',
            },
          ],
          responses: {
            200: {
              description: 'Daftar job berhasil diambil',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/Job' },
                      },
                    },
                  },
                },
              },
            },
            401: { $ref: '#/components/responses/Unauthorized' },
          },
        },
      },
      '/v1/jobs/{id}': {
        get: {
          tags: ['Jobs'],
          summary: 'Ambil status dan riwayat event job',
          description: 'Mengambil informasi lengkap job, payload request, hasil media, status checkpoint, dan timeline perubahannya.',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'ID job (contoh: job_4c995f90-1c09-43c7-8742-0fbc1476fa35)',
              example: 'job_4c995f90-1c09-43c7-8742-0fbc1476fa35',
            },
          ],
          responses: {
            200: {
              description: 'Detail job ditemukan',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: { $ref: '#/components/schemas/Job' },
                      events: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/JobEvent' },
                      },
                    },
                  },
                },
              },
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            404: {
              description: 'Job tidak ditemukan',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
          },
        },
      },
      '/v1/jobs/{id}/cancel': {
        post: {
          tags: ['Jobs'],
          summary: 'Batalkan job antrean',
          description: 'Membatalkan job yang masih berstatus queued atau belum dieksekusi final.',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              example: 'job_4c995f90-1c09-43c7-8742-0fbc1476fa35',
            },
          ],
          responses: {
            200: {
              description: 'Job berhasil dibatalkan',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: { $ref: '#/components/schemas/Job' },
                    },
                  },
                },
              },
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            404: { $ref: '#/components/responses/NotFound' },
            409: {
              description: 'Job tidak dapat dibatalkan (sedang berjalan aktif atau sudah selesai)',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
          },
        },
      },
      '/v1/accounts': {
        get: {
          tags: ['Accounts'],
          summary: 'Daftar semua akun browser Flow',
          description: 'Mengambil semua akun yang terdaftar dalam database lokal beserta status kesehatan dan sisa kreditnya.',
          responses: {
            200: {
              description: 'Daftar akun',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/Account' },
                      },
                    },
                  },
                },
              },
            },
            401: { $ref: '#/components/responses/Unauthorized' },
          },
        },
        post: {
          tags: ['Accounts'],
          summary: 'Daftarkan akun browser baru',
          description: `
Mendaftarkan profil Chrome lokal baru. Setelah mendaftar:
1. Panggil \`POST /v1/accounts/{id}/setup\` untuk memicu jendela login Chrome, ATAU
2. Jalankan CLI: \`npm run login -- <id>\`
          `.trim(),
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AccountInput' },
                examples: {
                  default: {
                    summary: 'Contoh input akun baru',
                    value: {
                      label: 'Primary',
                      profileName: 'primary',
                      priority: 10,
                    },
                  },
                },
              },
            },
          },
          responses: {
            201: {
              description: 'Akun berhasil didaftarkan',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: { $ref: '#/components/schemas/Account' },
                      next: { type: 'string', example: 'POST /v1/accounts/acc_xxx/setup lalu login pada Chrome yang terbuka' },
                    },
                  },
                },
              },
            },
            400: { $ref: '#/components/responses/BadRequest' },
            401: { $ref: '#/components/responses/Unauthorized' },
          },
        },
      },
      '/v1/accounts/{id}': {
        patch: {
          tags: ['Accounts'],
          summary: 'Perbarui info atau status akun',
          description: 'Mengubah label, prioritas, status (ready, paused, action_required), atau projectId terkait akun.',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              example: 'acc_7b66ec07-5ee8-4c07-b355-32e67df1407f',
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AccountUpdate' },
                examples: {
                  default: {
                    summary: 'Contoh update status akun',
                    value: {
                      priority: 20,
                      status: 'ready',
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Akun berhasil diperbarui',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: { $ref: '#/components/schemas/Account' },
                    },
                  },
                },
              },
            },
            400: { $ref: '#/components/responses/BadRequest' },
            401: { $ref: '#/components/responses/Unauthorized' },
            404: { $ref: '#/components/responses/NotFound' },
          },
        },
      },
      '/v1/accounts/{id}/setup': {
        post: {
          tags: ['Accounts'],
          summary: 'Mulai proses setup / login browser',
          description: 'Membuka Google Chrome dengan profil akun ini dan menavigasi ke halaman flow.google.com untuk login manual.',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              example: 'acc_7b66ec07-5ee8-4c07-b355-32e67df1407f',
            },
          ],
          responses: {
            202: {
              description: 'Setup dimulai',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'object',
                        properties: {
                          accountId: { type: 'string' },
                          state: { type: 'string', example: 'waiting_for_login' },
                          url: { type: 'string' },
                        },
                      },
                      message: { type: 'string', example: 'Selesaikan login langsung di jendela Chrome akun ini.' },
                    },
                  },
                },
              },
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            404: { $ref: '#/components/responses/NotFound' },
          },
        },
      },
      '/v1/accounts/{id}/setup/status': {
        get: {
          tags: ['Accounts'],
          summary: 'Cek status proses login browser',
          description: 'Mengecek apakah sesi browser akun sudah berhasil login ke Google Flow atau masih menunggu autentikasi.',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              example: 'acc_7b66ec07-5ee8-4c07-b355-32e67df1407f',
            },
          ],
          responses: {
            200: {
              description: 'Status setup akun',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'object',
                        properties: {
                          accountId: { type: 'string' },
                          state: { type: 'string', enum: ['waiting_for_login', 'ready'], example: 'ready' },
                          url: { type: 'string' },
                        },
                      },
                      account: { $ref: '#/components/schemas/Account' },
                    },
                  },
                },
              },
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            404: { $ref: '#/components/responses/NotFound' },
          },
        },
      },
      '/v1/accounts/{id}/credits/refresh': {
        post: {
          tags: ['Accounts'],
          summary: 'Refresh saldo kredit akun dari Flow',
          description: 'Mengakses Flow via browser untuk membaca kuota kredit terkini dan memperbaruinya di database lokal.',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              example: 'acc_7b66ec07-5ee8-4c07-b355-32e67df1407f',
            },
          ],
          responses: {
            200: {
              description: 'Kredit akun berhasil diperbarui',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: { $ref: '#/components/schemas/Account' },
                      credits: {
                        type: 'object',
                        properties: {
                          remaining: { type: 'integer', example: 350 },
                          raw: { type: 'object' },
                        },
                      },
                    },
                  },
                },
              },
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            404: { $ref: '#/components/responses/NotFound' },
          },
        },
      },
      '/v1/accounts/{id}/verify': {
        post: {
          tags: ['Accounts'],
          summary: 'Verifikasi autentikasi sesi browser',
          description: 'Memastikan sesi login Google pada akun ini masih valid. Jika valid, menandai akun berstatus ready.',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              example: 'acc_7b66ec07-5ee8-4c07-b355-32e67df1407f',
            },
          ],
          responses: {
            200: {
              description: 'Akun terverifikasi dan berstatus ready',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: { $ref: '#/components/schemas/Account' },
                    },
                  },
                },
              },
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            404: { $ref: '#/components/responses/NotFound' },
            409: {
              description: 'Sesi kedaluwarsa atau butuh login ulang',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
          },
        },
      },
      '/v1/routing': {
        get: {
          tags: ['Routing & Projects'],
          summary: 'Ambil kebijakan routing multi-akun saat ini',
          description: 'Melihat konfigurasi strategi alokasi akun (balanced, round_robin, exhaust_first, project_sticky).',
          responses: {
            200: {
              description: 'Kebijakan routing',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: { $ref: '#/components/schemas/RoutingPolicy' },
                    },
                  },
                },
              },
            },
            401: { $ref: '#/components/responses/Unauthorized' },
          },
        },
        put: {
          tags: ['Routing & Projects'],
          summary: 'Ubah kebijakan routing multi-akun',
          description: `
Mengatur strategi scheduler:
- \`exhaust_first\`: Habiskan kredit akun dengan priority terkecil terlebih dahulu, lalu beralih otomatis.
- \`balanced\`: Pilih akun dengan beban terendah dan kredit terbanyak.
- \`round_robin\`: Rotasi akun bergantian secara berimbang.
- \`project_sticky\`: Utamakan akun yang terikat ke projectKey tertentu.
          `.trim(),
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RoutingInput' },
                examples: {
                  default: {
                    summary: 'Contoh konfigurasi exhaust_first',
                    value: {
                      strategy: 'exhaust_first',
                      minCredits: 1,
                      autoFailover: true,
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Kebijakan routing berhasil disimpan',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: { $ref: '#/components/schemas/RoutingPolicy' },
                    },
                  },
                },
              },
            },
            400: { $ref: '#/components/responses/BadRequest' },
            401: { $ref: '#/components/responses/Unauthorized' },
          },
        },
      },
      '/v1/project-bindings': {
        get: {
          tags: ['Routing & Projects'],
          summary: 'Daftar binding projectKey ke akun',
          description: 'Melihat pemetaan projectKey virtual ke accountId Google Flow tertentu.',
          responses: {
            200: {
              description: 'Daftar binding',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/ProjectBinding' },
                      },
                    },
                  },
                },
              },
            },
            401: { $ref: '#/components/responses/Unauthorized' },
          },
        },
        put: {
          tags: ['Routing & Projects'],
          summary: 'Ikat projectKey ke akun tertentu',
          description: 'Menentukan bahwa request dengan projectKey tertentu akan diarahkan ke akun spesifik.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ProjectBindingInput' },
                examples: {
                  default: {
                    summary: 'Contoh binding project',
                    value: {
                      projectKey: 'client-agency-alpha',
                      accountId: 'acc_7b66ec07-5ee8-4c07-b355-32e67df1407f',
                      allowFailover: true,
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Binding berhasil disimpan',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: { $ref: '#/components/schemas/ProjectBinding' },
                    },
                  },
                },
              },
            },
            400: { $ref: '#/components/responses/BadRequest' },
            401: { $ref: '#/components/responses/Unauthorized' },
            404: { $ref: '#/components/responses/NotFound' },
          },
        },
      },
      '/v1/models': {
        get: {
          tags: ['Flow Reads'],
          summary: 'Daftar model AI dan statusnya di Flow (Clean Mapped)',
          description: `
Membaca daftar model resmi dan status ketersediaannya dari akun Google Flow.
Secara default, data proto internal Google diubah menjadi format REST yang ramah pengembang dengan kategori terstruktur (\`videoModels\`, \`imageModels\`, \`audioModels\`) dan \`quickList\` siap pakai.
Jika ingin melihat payload mentah protobuf asli, kirimkan parameter \`raw=true\`.
          `.trim(),
          parameters: [
            {
              name: 'accountId',
              in: 'query',
              required: false,
              schema: { type: 'string' },
              description: 'Pilih akun tertentu untuk membaca model (opsional, default: akun sehat teratas)',
            },
            {
              name: 'raw',
              in: 'query',
              required: false,
              schema: { type: 'boolean', default: false },
              description: 'Set true jika ingin melihat raw data protobuf asli dari Google Flow',
            },
          ],
          responses: {
            200: {
              description: 'Daftar model yang sudah di-mapping ramah pengembang',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'object',
                        properties: {
                          summary: {
                            type: 'object',
                            properties: {
                              defaultImageModel: { type: 'string', example: 'narwhal_display' },
                              defaultVideoModel: { type: 'string', example: 'veo_3_1_lite' },
                              totalVideoModels: { type: 'integer', example: 8 },
                              totalImageModels: { type: 'integer', example: 5 },
                              totalAudioModels: { type: 'integer', example: 1 },
                            },
                          },
                          quickList: {
                            type: 'object',
                            properties: {
                              defaultImageModel: { type: 'string', example: 'narwhal_display' },
                              defaultVideoModel: { type: 'string', example: 'veo_3_1_lite' },
                              videoGenerationModels: {
                                type: 'array',
                                items: {
                                  type: 'object',
                                  properties: {
                                    id: { type: 'string', example: 'abra' },
                                    name: { type: 'string', example: 'Omni 1.1 Flash' },
                                    status: { type: 'string', example: 'online' },
                                  },
                                },
                              },
                              imageGenerationModels: {
                                type: 'array',
                                items: {
                                  type: 'object',
                                  properties: {
                                    id: { type: 'string', example: 'nano_banana_pro' },
                                    name: { type: 'string', example: '🍌 Nano Banana Pro' },
                                    status: { type: 'string', example: 'online' },
                                  },
                                },
                              },
                              upscalers: {
                                type: 'array',
                                items: {
                                  type: 'object',
                                  properties: {
                                    id: { type: 'string', example: 'veo_3_1_upsampler_1080p' },
                                    name: { type: 'string', example: 'Veo 3.1 - Upsampler 1080P' },
                                    type: { type: 'string', example: 'video' },
                                  },
                                },
                              },
                            },
                          },
                          videoModels: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                id: { type: 'string', example: 'abra' },
                                name: { type: 'string', example: 'Omni 1.1 Flash' },
                                category: { type: 'string', example: 'video' },
                                status: { type: 'string', example: 'online' },
                                available: { type: 'boolean', example: true },
                                aliases: { type: 'array', items: { type: 'string' } },
                                variantCount: { type: 'integer', example: 12 },
                                variants: {
                                  type: 'array',
                                  items: {
                                    type: 'object',
                                    properties: {
                                      id: { type: 'string', example: 'abra_t2v_4s' },
                                      mode: { type: 'string', example: 'text_to_video' },
                                      durationSeconds: { type: 'integer', example: 4 },
                                      resolution: { type: 'string', example: '720p' },
                                      aspectRatios: { type: 'array', items: { type: 'string' } },
                                      creditCost: { type: 'integer', example: 7 },
                                      available: { type: 'boolean', example: true },
                                      features: { type: 'object' },
                                    },
                                  },
                                },
                              },
                            },
                          },
                          imageModels: { type: 'array', items: { type: 'object' } },
                          audioModels: { type: 'array', items: { type: 'object' } },
                        },
                      },
                    },
                  },
                },
              },
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            503: { $ref: '#/components/responses/ServiceUnavailable' },
          },
        },
      },
      '/v1/credits': {
        get: {
          tags: ['Flow Reads'],
          summary: 'Cek saldo kredit akun (Semua akun atau akun spesifik)',
          description: `
Membaca sisa kredit Flow langsung dari Google.
- Jika \`accountId\` dikosongkan (default): membaca dan mengupdate saldo kredit **seluruh akun aktif** sekaligus, serta menghitung total kredit.
- Jika \`accountId\` diisi: membaca saldo untuk akun spesifik tersebut.
          `.trim(),
          parameters: [
            {
              name: 'accountId',
              in: 'query',
              required: false,
              schema: { type: 'string' },
              description: 'ID akun tertentu (opsional, jika kosong akan memeriksa semua akun)',
            },
          ],
          responses: {
            200: {
              description: 'Snapshot saldo kredit akun',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            accountId: { type: 'string' },
                            label: { type: 'string' },
                            profileName: { type: 'string' },
                            status: { type: 'string' },
                            remaining: { type: 'integer', nullable: true },
                            checkedAt: { type: 'string' },
                          },
                        },
                      },
                      totalCreditsRemaining: { type: 'integer', example: 689 },
                      accountCount: { type: 'integer', example: 3 },
                    },
                  },
                },
              },
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            503: { $ref: '#/components/responses/ServiceUnavailable' },
          },
        },
      },
      '/v1/credits/refresh': {
        post: {
          tags: ['Flow Reads'],
          summary: 'Refresh saldo kredit semua akun sekaligus',
          description: 'Memicu pembacaan ulang kredit langsung ke Google Flow untuk seluruh akun aktif (atau akun tertentu jika accountId diberikan).',
          parameters: [
            {
              name: 'accountId',
              in: 'query',
              required: false,
              schema: { type: 'string' },
              description: 'ID akun tertentu (opsional, jika kosong refresh semua akun)',
            },
          ],
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    accountId: { type: 'string', description: 'ID akun tertentu (opsional, "all" atau kosong untuk semua akun)', example: 'all' },
                  },
                },
                examples: {
                  all: {
                    summary: 'Refresh semua akun',
                    value: {},
                  },
                  specific: {
                    summary: 'Refresh akun tertentu',
                    value: { accountId: 'acc_7b66ec07-5ee8-4c07-b355-32e67df1407f' },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Hasil refresh saldo kredit',
              content: { 'application/json': { schema: { type: 'object' } } },
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            503: { $ref: '#/components/responses/ServiceUnavailable' },
          },
        },
      },
      '/v1/projects': {
        get: {
          tags: ['Flow Reads'],
          summary: 'Daftar project di Google Flow (Clean Mapped)',
          description: `
Membaca daftar project yang tersimpan pada akun Google Flow.
Proto timestamp diubah menjadi ISO 8601 string (\`updatedAt\`), metadata dirapikan ke dalam objek \`projects\`.
Kirim parameter \`raw=true\` jika ingin response mentah protobuf.
          `.trim(),
          parameters: [
            {
              name: 'accountId',
              in: 'query',
              required: false,
              schema: { type: 'string' },
            },
            {
              name: 'pageSize',
              in: 'query',
              required: false,
              schema: { type: 'integer', default: 21, maximum: 100 },
            },
            {
              name: 'pageToken',
              in: 'query',
              required: false,
              schema: { type: 'string' },
            },
            {
              name: 'raw',
              in: 'query',
              required: false,
              schema: { type: 'boolean', default: false },
              description: 'Set true jika ingin melihat raw data protobuf asli dari Google Flow',
            },
          ],
          responses: {
            200: {
              description: 'Daftar project Flow yang sudah di-mapping',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'object',
                        properties: {
                          projects: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                id: { type: 'string', example: '8f5d96f8-ccf2-4d5f-8877-a133d9998870' },
                                title: { type: 'string', example: 'Aug 07, 11:32 AM' },
                                updatedAt: { type: 'string', format: 'date-time', example: '2026-08-07T04:32:30.947Z' },
                                authorId: { type: 'string', nullable: true, example: 'b6cb231a-0bf6-4147-b437-643ec3980756' },
                              },
                            },
                          },
                          total: { type: 'integer', example: 21 },
                          nextPageToken: { type: 'string', nullable: true },
                        },
                      },
                    },
                  },
                },
              },
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            503: { $ref: '#/components/responses/ServiceUnavailable' },
          },
        },
      },
      '/v1/projects/{id}/contents': {
        get: {
          tags: ['Flow Reads'],
          summary: 'Daftar konten/media di dalam project Flow (Clean Mapped)',
          description: `
Mengambil aset generasi gambar, video, dan sample suara yang ada dalam suatu project Google Flow.
Telah diparsing menjadi URL langsung, ukuran file, resolusi dimensi gambar, dan pilihan model yang aktif.
Kirim parameter \`raw=true\` jika ingin response mentah protobuf.
          `.trim(),
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'ID project Flow (UUID)',
              example: '866504a3-4b68-4501-9214-e0eec0dfdfaa',
            },
            {
              name: 'accountId',
              in: 'query',
              required: false,
              schema: { type: 'string' },
            },
            {
              name: 'raw',
              in: 'query',
              required: false,
              schema: { type: 'boolean', default: false },
              description: 'Set true jika ingin melihat raw data protobuf asli dari Google Flow',
            },
          ],
          responses: {
            200: {
              description: 'Konten project Flow yang sudah di-mapping',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'object',
                        properties: {
                          projectId: { type: 'string', example: '866504a3-4b68-4501-9214-e0eec0dfdfaa' },
                          found: { type: 'boolean', example: true },
                          selectedModels: {
                            type: 'object',
                            nullable: true,
                            properties: {
                              imageModel: { type: 'string', example: 'narwhal_display' },
                              videoModel: { type: 'string', example: 'abra' },
                            },
                          },
                          mediaCount: { type: 'integer', example: 7 },
                          voiceCount: { type: 'integer', example: 27 },
                          media: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                id: { type: 'string' },
                                type: { type: 'string', example: 'image' },
                                createdAt: { type: 'string', format: 'date-time' },
                                fileSizeBytes: { type: 'integer', example: 327611 },
                                width: { type: 'integer', example: 1819 },
                                height: { type: 'integer', example: 1023 },
                                urls: { type: 'array', items: { type: 'string' } },
                              },
                            },
                          },
                          voices: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                id: { type: 'string', example: 'achernar' },
                                name: { type: 'string', example: 'Achernar' },
                                description: { type: 'string', example: 'Female, soft, high pitch' },
                                sampleUrl: { type: 'string', example: 'https://gstatic.com/aitestkitchen/voices/samples/Achernar.wav' },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            503: { $ref: '#/components/responses/ServiceUnavailable' },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
  };
}

export function renderScalarHtml(openApiJsonUrl = '/openapi.json', title = 'Flow API Reference') {
  return `<!doctype html>
<html lang="en">
  <head>
    <title>${title}</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🌊</text></svg>">
    <style>
      body {
        margin: 0;
        background: #0f172a;
      }
    </style>
  </head>
  <body>
    <script
      id="api-reference"
      data-url="${openApiJsonUrl}"
      data-configuration='{"theme":"purple","layout":"modern","darkMode":true,"showSidebar":true}'
      src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"
    ></script>
  </body>
</html>`;
}
