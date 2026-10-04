# Audit teknis Flow web

Tanggal observasi: 30 September 2026. Target: `https://flow.google.com/` dan halaman project yang telah terautentikasi.

## Ringkasan arsitektur

- Frontend: aplikasi Google Angular/Bōq bernama `AiSandboxAngularFrontend`.
- Build yang teramati: `boq_labs-ai-sandbox-frontend_20260928.12_p0`.
- Transport utama: POST form ke `/_/AiSandboxAngularFrontend/data/batchexecute`.
- Payload: envelope `f.req` berisi RPC ID dan proto-JSON positional array.
- Bootstrap dinamis: `window.WIZ_global_data` menyediakan build label, session routing value, dan anti-CSRF token.
- Autentikasi: cookie sesi Google pada origin Flow. Engine tidak mengekspor cookie/token ke API client.
- Media: URL hasil dapat berasal dari storage Google dan sebaiknya dianggap signed/short-lived.
- Generation: beberapa service terpisah dipakai untuk image, video, audio, creation agent, serta polling status.

## Service yang ditemukan

### Project dan konten

- `AiSandbox.CreateProject` — `jHPbke`
- `AiSandbox.DeleteProject` — `QI2zvc`
- `AiSandbox.GetProject` — `ngNC2`
- `AiSandbox.SearchUserProjects` — `OylIJd`
- `AiSandbox.UpdateProjectInfo` — `o8DA4`
- `FlowService.GetProjects` — `UpteDb`
- `FlowService.GetProjectContents` — `Zzl0ze`
- `FlowService.GetModels` — `HTrJv`
- `FlowService.ListModelStatuses` — `yBhWQ`

### Media dan generation

- `FlowService.BatchGenerateImages` — `ogiZ0b`
- `FlowService.BatchGenerateAudio` — `no0P6`
- `FlowService.CancelMediaGeneration` — `CK0Pk`
- `FlowService.GetMedia` — `as29s`
- `FlowService.GetMediaUrl` — `uurnC`
- `FlowService.ListMedia` — `bOKtO`
- `FlowService.UploadImage` — `maseQ`
- `FlowService.UploadVideo` — `a3UfBf`
- `VideoFxService.GetCredits` — `nzlxg`
- `VideoFxService.BatchAsyncGenerateVideoText` — `YhhmEf`
- `VideoFxService.BatchAsyncGenerateVideoStartImage` — `eb1hJf`
- `VideoFxService.BatchAsyncGenerateVideoStartAndEndImage` — `nprQif`
- `VideoFxService.BatchAsyncGenerateVideoReferenceImages` — `MZZa6b`
- `VideoFxService.BatchAsyncGenerateVideoEditVideo` — `jIps6`
- `VideoFxService.BatchAsyncGenerateVideoExtendVideo` — `fZytfe`
- `VideoFxService.BatchAsyncGenerateVideoUpsampleVideo` — `p0UkFb`
- `VideoFxService.BatchCheckAsyncVideoGenerationStatus` — `jwpduf`

### Scene/workflow dan agent

- Scene: create, get, list, copy, update, dan batch delete ditemukan pada `FlowService`.
- Workflow: get, list, copy, update, batch update, serta attach-to-scene ditemukan pada `FlowService`.
- Creation Agent menggunakan service terpisah, termasuk list session.
- Applet Agent menggunakan service terpisah untuk applet, version, dan saved shared applet.
- Streaming agent menggunakan RPC `L2jnw` untuk `FlowService/StreamGenerateContent`.

## Stabilitas dan risiko

RPC ID, array field position, bootstrap key, dan selector UI bukan kontrak publik. Strategi ketahanan engine:

1. Registry allowlist terpusat agar drift dapat diperbaiki pada satu file.
2. Read-only RPC dan mutasi dipisahkan; mutasi default off.
3. Satu mutex per browser profile untuk menghindari race antar navigasi.
4. API lokal memakai bearer key dan bind ke loopback secara default.
5. Error browser/RPC disanitasi agar cookie, token, atau log Chrome tidak bocor.
6. UI automation dipakai untuk create/generate karena lebih mudah divalidasi daripada proto internal yang berubah.
7. Parser `batchexecute` diuji terhadap framing panjang + envelope `wrb.fr`.

## Yang sengaja tidak dilakukan

- Tidak menyalin cookie, `SAPISID`, token CSRF, atau kredensial akun.
- Tidak membypass login, CAPTCHA, paywall, kredit, kuota, atau entitlement model.
- Tidak menjalankan generation saat audit karena akan mengonsumsi kredit akun.
- Tidak mengekspos delete project pada REST facade awal.

Untuk production dengan SLA, gunakan API Google resmi yang sesuai. Facade ini cocok untuk otomasi akun sendiri dan harus diperlakukan sebagai integrasi tidak resmi yang memerlukan contract monitoring.
