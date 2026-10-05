# Aturan agent — studio/

Folder ini adalah sistem produksi dokumenter, bukan UI dashboard. Aturan untuk agent yang bekerja di sini:

1. Baca `README.md`, lalu bible yang relevan dengan tahap yang sedang dikerjakan. Selalu baca `_common` dulu, lalu `bibles/<genre>/GENRE.md`. Nilai genre yang menang.
2. `design.md` di root repo hanya berlaku untuk UI web (`web/`), termasuk halaman Studio di sana. Aturan itu tidak berlaku untuk video, script, atau bible.
3. Semua output antar tahap mengikuti format di `bibles/_common/08_PIPELINE_CONTRACTS.md`. Jangan mengarang field baru. Kalau butuh field baru, perbarui kontraknya dulu.
4. Fakta: setiap klaim di script wajib punya entri di `research.json` lengkap dengan sumber dan tingkat keyakinan. Jangan pernah mengisi angka dari ingatan.
5. Visual: real footage mengalahkan footage generated kalau tersedia dan relevan. Footage generated selalu ditandai `reconstruction`.
6. Lisensi: aset dengan status lisensi `unknown` tidak boleh dipakai di render yang akan dipublikasikan.
7. Gate (G2 script, G3 shot plan, G4 rough cut) diatur lewat `STUDIO_GATE_*`. Gate `manual` selalu menunggu manusia. Gate `auto` hanya lolos kalau semua cek otomatisnya lolos. Default G4 `manual`: tidak ada video yang jadi final tanpa ditonton manusia.
8. Pipeline studio tidak boleh mengubah `src/` (Flow API). Panggil lewat API atau job queue-nya.

## Saat pipeline berjalan

Agent produksi (LLM di dalam pipeline) tidak membaca skill, bible, atau kode. Semua yang dibutuhkan sudah dirakit di `core/prompts.js` dan `styles/*.json`. Kalau sebuah aturan bible diubah, ubah juga kedua file itu, lalu jalankan `npm run test:studio`.

Yang menentukan waktu dan selera (durasi shot, transisi, jeda, mix) adalah kode deterministik, bukan LLM. Jangan memindahkan keputusan itu ke prompt.
