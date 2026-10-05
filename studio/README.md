# Studio — Sistem Produksi Dokumenter

Generator dokumenter otomatis di samping Flow API. Satu pipeline untuk semua genre. Perbedaan antar genre hanya ada di *style profile* dan *bible pack*. Topik dan footage boleh berbeda di setiap video, tapi gaya, ritme editing, dan audio selalu sama.

## Cara kerja konsistensi

| Keputusan | Siapa yang memutuskan | Di mana |
|---|---|---|
| Topik, riset, narasi, apa yang tampil per kalimat | LLM, dengan instruksi yang sudah dirakit lengkap (tanpa membaca skill atau kode) | `core/prompts.js` |
| Durasi shot, cut, transisi, jeda, black beat, kartu angka | Editor engine deterministik | `core/engine/editor.js` |
| Semua angka selera (ASL, rasio, loudness, warna, font, transisi) | Style profile | `styles/base.json` + `styles/<genre>.json` |
| Grafis (diagram, kartu angka, label, judul) | Template HyperFrames yang dikunci, hanya diisi data | `motion/templates/` |
| Peta | MapLibre di atas citra satelit yang di-grade, kamera 3D yang hidup, dirender frame per frame | `motion/geo/`, `core/geo.js` |
| Prompt Flow | Dirakit dari spesifikasi shot + style, tidak pernah ditulis bebas | `core/stages/flow.js` |
| Grading, grain, mixing, loudness | Renderer ffmpeg deterministik | `core/render.js` |
| Lolos atau tidak | QC otomatis + gate | `core/stages/qc.js`, `core/pipeline.js` |

Input yang sama selalu menghasilkan shot list, grafis, dan mix yang sama. Grafis yang identik dirender sekali lalu di-cache.

## Alur

```
topics → new → research → outline → script → [G2] → voice → visual → shotlist
       → assets → [G3] → flow → motion → edit → render → qc → [G4] → final
```

Setiap tahap menulis file JSON sesuai kontrak di `core/contracts.js`. Kalau sebuah tahap gagal atau menunggu, `studio run` melanjutkan dari titik itu. Tahap yang input-nya tidak berubah dilewati.

## Perintah

```bash
npm run studio -- doctor                                   # cek ffmpeg, HyperFrames, key, library, Flow API
npm run studio -- topics --genre military --count 8        # usulan topik + skor (cek footage ke DVIDS/NASA)
npm run studio -- new --genre military --topic T-001       # buat proyek dari topik
npm run studio -- run <project>                            # jalankan / lanjutkan
npm run studio -- batch --genre military --count 5         # pilih 5 topik terbaik yang belum dipakai, produksi semuanya
npm run studio -- status [project]
npm run studio -- gate <project> G4 approve                # persetujuan manusia
npm run studio -- flow-runner --watch                      # (mode queue) jalankan di Mac yang menjalankan Flow API
npm run test:studio
```

## Konfigurasi (`.env`)

| Variabel | Default | Arti |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | LLM untuk riset, script, visual, QC |
| `STUDIO_LLM_MODEL` | `claude-opus-5-5` | |
| `STUDIO_VOICE_PROVIDER` | `edge` | `edge`, `elevenlabs` (`ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`), `file` (rekaman manusia di `vo/<seg>.source.wav`) |
| `STUDIO_FLOW_MODE` | `direct` | `direct` (Flow API di mesin yang sama), `queue` (cloud menulis antrean, `flow-runner` di Mac yang mengeksekusi), `off` |
| `FLOW_API_KEY`, `STUDIO_FLOW_BASE_URL` | | akses ke Flow API |
| `DVIDS_API_KEY`, `NARA_API_KEY`, `PEXELS_API_KEY`, `PIXABAY_API_KEY` | | sumber footage (NASA dan Wikimedia tanpa key) |
| `STUDIO_MAP_PROVIDER`, `MAPTILER_KEY` | `maptiler` kalau key ada, selain itu `gibs` | citra satelit untuk peta: `maptiler`, `gibs` (NASA Blue Marble, sampai zoom 8), `s2cloudless` (Sentinel-2 2016, CC BY), `local` (folder tile sendiri) |
| `CHROME_EXECUTABLE_PATH` | Chrome di Mac | browser untuk render peta |
| `STUDIO_GATE_G2/G3/G4` | `auto/auto/manual` | `auto` lolos kalau cek otomatis lolos, `manual` selalu menunggu manusia |

Musik dan ambience berlisensi ditaruh di `library/` (lihat `library/README.md`).

## Folder

```
studio/
  cli.js               perintah
  core/                pipeline (kontrak, tahap, editor engine, renderer)
  styles/              style profile mesin (sumber semua angka selera)
  motion/templates/    template grafis HyperFrames
  bibles/              versi manusia dari aturan yang sama
  references/          analisis video referensi + tools
  library/             musik/ambience/footage berlisensi (tidak di-commit)
  projects/            output per video (tidak di-commit)
  assets/              database + cache footage dan grafis (tidak di-commit)
```

Kalau aturan di bible berubah, perbarui juga `styles/*.json` dan `core/prompts.js`. Mesin hanya membaca keduanya.
