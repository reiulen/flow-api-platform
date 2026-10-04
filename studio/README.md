# Studio — Sistem Produksi Dokumenter

Sistem produksi dokumenter yang berjalan di samping Flow API. Satu pipeline untuk semua genre. Perbedaan antar genre hanya ada di *bible pack*.

```
studio/
  AGENTS.md            aturan untuk agent yang bekerja di studio/
  bibles/
    _common/           01–08: aturan yang berlaku untuk semua dokumenter
    military/          override militer + daftar sumber + QC hardware
    tech/              override tech (belum ditulis)
  references/          analisis video referensi (00) + tools analisis
  core/                (langkah 2) kontrak zod, tahap pipeline, render
  assets/              (langkah 2) database aset + file
```

## Urutan bible

| File | Isi |
|---|---|
| `references/00_REFERENCE_ANALYSIS.md` | Angka terukur dari video referensi, dasar semua parameter |
| `_common/01_STYLE_BIBLE.md` | Identitas, mode visual, pacing, transisi, warna, typography |
| `_common/02_EDITORIAL_BIBLE.md` | Pemilihan topik, struktur cerita, hook, script, standar fakta |
| `_common/03_VISUAL_LANGUAGE.md` | Enam tipe visual, peta, visualisasi teknis, motion, 3D |
| `_common/04_ASSET_SYSTEM.md` | Sourcing, lisensi, metadata, penamaan, kontinuitas |
| `_common/05_FLOW_PROMPT_SYSTEM.md` | Spesifikasi shot Flow, kamera, realisme, QC footage generated |
| `_common/06_AUDIO_BIBLE.md` | VO, musik, ambience, SFX, silence, mixing, loudness |
| `_common/07_QC_SYSTEM.md` | Delapan QC pass, cek otomatis vs cek manusia |
| `_common/08_PIPELINE_CONTRACTS.md` | Tahap pipeline, human gate, format data JSON, integrasi Flow API |
| `<genre>/GENRE.md` | Override per genre. Nilai di sini mengalahkan `_common` |

## Cara membaca aturan

1. `_common` adalah default.
2. `<genre>/GENRE.md` menimpa parameter yang disebut eksplisit.
3. Brief proyek (`brief.json`, lihat `08`) boleh menimpa untuk satu video saja, dan wajib menulis alasannya.

Parameter bertanda **[v0.1]** masih sementara. Nilainya dikunci setelah pilot Aircraft Carrier.
