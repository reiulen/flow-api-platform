# 03 — Visual Language

Aturan per tipe visual. Setiap shot di `shotlist.json` wajib punya satu `visual_type` dari daftar ini.

## 1. Enam tipe visual (+ satu)

| Kode | Tipe | Fungsi | Sumber |
|---|---|---|---|
| `REAL` | Real operational footage | Bukti dan realisme. **Aset paling berharga** | Arsip pemerintah, lihat `04` |
| `ARCHIVAL` | Footage atau foto arsip | Sejarah, generasi lama, keputusan politik | Arsip nasional, NASA, Prelinger |
| `NEWS` | Footage berita atau peristiwa | "Ini benar-benar terjadi" | Hanya kalau lisensinya jelas, lihat `04` |
| `FLOW` | Rekonstruksi sinematik generated | Hal yang tidak bisa difilmkan atau tidak tersedia | Flow API, lihat `05` |
| `TECH` | Visualisasi teknis | Menjelaskan sistem yang tidak terlihat | HyperFrames (2D/Three.js), Blender (nanti) |
| `MAP` | Peta informasi sinematik | Orientasi geografi dan sistem | HyperFrames + D3, MapLibre bake |
| `TYPE` | Kartu teks atau angka | Memperkuat informasi | HyperFrames |

Jangan meniru grafis berita, chyron, atau logo media lain.

### Target porsi durasi [v0.1]

| Tipe | Target |
|---|---|
| `REAL` + `ARCHIVAL` + `NEWS` | 45–55% |
| `MAP` + `TECH` | 30–40% |
| `FLOW` | 5–15% |
| `TYPE` dan breathing shot | 2–5% |

## 2. Prioritas sumber visual

Untuk setiap kebutuhan visual, cari berurutan dan berhenti di tingkat pertama yang memenuhi:

1. `REAL` yang relevan dan sesuai platform/varian.
2. `ARCHIVAL` kalau konteksnya historis.
3. `MAP` atau `TECH` kalau tujuannya menjelaskan.
4. `FLOW`. Hanya kalau 1–3 tidak tersedia atau tidak bisa memvisualisasikan momen itu.

**`FLOW` tidak pernah dipakai sebagai bukti.** Shot `FLOW` yang menggambarkan peristiwa nyata spesifik wajib diberi label di layar (lihat bagian 8).

## 3. Kesesuaian visual dengan narasi

- Visual tidak boleh sekadar mengulang kata benda di VO. Kalau VO bilang "radar", jangan otomatis tampilkan radar. Tunjukkan apa yang radar *lakukan* atau *hasilkan*.
- **Kontinuitas platform:** kalau VO membahas varian tertentu (misalnya kelas Ford), semua shot `REAL` di kalimat itu harus varian yang sama. Shot varian lain dianggap misinformasi visual.
- Setiap rangkaian (sequence) harus punya progresi visual: wide → detail → konteks, atau sebab → akibat. Tidak boleh lima shot acak dengan subjek yang sama.

## 4. Footage dan motion bergantian

Pola yang membuat penonton berkata "oh, sekarang gue ngerti apa yang baru gue lihat":

```
REAL: pesawat mendarat di dek
 → TECH: diagram dek dan kabel penahan
 → REAL: kru dek
 → TECH: cara kerja arresting gear
 → REAL: pendaratan berikutnya, sekarang penonton paham apa yang terjadi
```

## 5. MAP — peta informasi sinematik

### Render

Peta dirender dengan MapLibre GL (open source) di atas citra satelit, frame per frame di Chrome headless. Setiap frame baru diambil setelah semua tile termuat, dan tile disimpan di cache disk, jadi render ulang selalu identik. Kode: `studio/core/geo.js` dan `studio/motion/geo/`.

Look peta dikunci di `styles/*.json` bagian `geo`: kemiringan kamera, drift (rotasi dan zoom pelan sepanjang shot), grading citra, warna laut, garis batas, dan grain.

Elemen yang tersedia: label pelat negara, penanda chokepoint (menyala, cincin berdenyut, cincin putus-putus berputar), wilayah berwarna (solid, atau **arsiran** untuk wilayah yang baru direbut/diperebutkan), rute neon dengan panah dan pulsa cahaya yang mengalir, pipeline neon dengan aliran yang bergerak, cincin jangkauan, ikon kapal/pesawat/rudal yang bergerak di jalurnya, **callout angka** yang menempel di lokasinya ("−95%", "$83.2 BILLION"), **grid piktogram** (orang, barel, koin, kapal, pesawat, tank, rudal: sebagian berwarna dari total, misalnya populasi vs warga negara), **pie** yang menyapu masuk, **inset** peta vektor di pojok untuk front atau lokasi kedua, dan legenda. Angka di peta diletakkan di samping negara yang dibandingkan, dan nilainya hanya dari klaim. Peta tidak memakai judul (seperti referensi), kecuali `geo.show_title`.

Look mengikuti peta RealLifeLore (diamati frame per frame di `references/00_REFERENCE_ANALYSIS.md` §Bahasa visual):

- Citra satelit hangat dan kontras (gurun oranye, laut dangkal toska, laut dalam navy gelap), vignette berat, border negara putih tegas.
- Overlay neon jenuh: rute magenta/merah muda, cyan, mint; inti garis hampir putih dengan glow lebar.
- Wilayah kekuasaan berwarna pekat (merah tua, hijau, kuning, biru) sekitar 78% opacity, dengan palet terpisah di `geo.fills`.
- Label pelat kecil (Oswald 21–26 px, huruf kapital berjarak), latar gelap hangat. Label rute dan titik kritis memakai kotak berwarna peran.

Sumber citra (`STUDIO_MAP_PROVIDER`):

| Provider | Detail maksimum | Lisensi |
|---|---|---|
| `maptiler` | Sangat tinggi | Berbayar/terbatas. Atribusi "© MapTiler © OpenStreetMap contributors" wajib tampil di layar dan dibakar otomatis ke frame. Cek syarat paket sebelum monetisasi |
| `gibs` | Zoom 8 (regional) | NASA Blue Marble, bebas dipakai dengan kredit NASA |
| `s2cloudless` | Zoom 15 | Sentinel-2 cloudless 2016 oleh EOX, CC BY 4.0, atribusi wajib |
| `local` | Sesuai tile | Tile milik sendiri |

### Peta berlapis

Peta berkembang mengikuti narasi dan tidak pernah langsung menampilkan semuanya. Setiap lapisan muncul tepat saat VO membutuhkannya:

```
L1 dunia → L2 wilayah → L3 lokasi subjek → L4 formasi/sistem
→ L5 jangkauan → L6 ancaman → L7 intersepsi/respons
```

### Aturan peta

- Gerakan kamera pelan dan halus (ease in-out). Zoom maks 1 level per 2 dtk.
- Label minimal: maks 6 label aktif di layar, huruf kapital kecil, dan tidak menumpuk.
- Batas negara bersih, tipis, dan netral.
- Zona ancaman memakai merah dan muncul hanya saat dibahas.
- Ada perubahan setiap 3–6 dtk: lapisan baru, garis tergambar, label muncul, atau kamera bergerak.
- Tidak ada glow dekoratif, partikel, lens flare, atau bloom.
- Citra basemap wajib punya atribusi di layar, dan sumbernya harus aman untuk penggunaan komersial (lihat `04`).
- Proyeksi peta konsisten dalam satu video.

## 6. TECH — visualisasi teknis

Dipakai untuk: cutaway, exploded view, sistem mekanik, arsitektur internal, radar, mesin, propulsi, panduan rudal, dan struktur.

**Tidak dipakai** untuk "lihat objeknya berputar 360°". Kalau cuma itu, real footage lebih baik.

Data berbasis angka memakai bingkai chart gaya referensi: latar hampir hitam dengan grid tipis, judul Oswald kapital besar di kiri atas, subjudul dan satuan di bawahnya, bar atau garis neon, tag seri berwarna di ujung garis, anotasi peristiwa (garis putus-putus dan tag merah), dan baris sumber di kiri bawah. Template: `compare` (perbandingan kategori) dan `trend` (angka berubah dari waktu ke waktu, bar atau garis, 1–3 seri). Nilainya hanya dari klaim riset.

Pola utama untuk sistem adalah diagram alur yang dianimasikan:

```
INCOMING THREAT → DETECTION → TRACKING → INTERCEPTOR → KILL / MISS
```

Aturan:

- Gaya low-poly atau line-art yang bersih. Tidak berpura-pura fotorealistik.
- Palet mengikuti accent di `01` (merah ancaman, cyan sensor, putih info).
- Masuk dan keluar visualisasi teknis idealnya lewat match cut dari atau ke real footage subjek yang sama.

## 7. Motion graphics

Motion harus punya makna:

| Motion | Makna | Status |
|---|---|---|
| Lingkaran mengembang | Jangkauan radar atau senjata | ✅ |
| Garis memanjang | Jarak, rute | ✅ |
| Lintasan tergambar | Pergerakan rudal atau pesawat | ✅ |
| Bar tumbuh | Anggaran, jumlah | ✅ |
| Hitungan angka naik | Statistik | ✅, maks 1 per menit |
| Logo berputar, partikel, teks berkilau | Tidak ada | ❌ |

## 8. Label rekonstruksi

- Shot `FLOW` yang menggambarkan peristiwa, lokasi, atau hardware nyata spesifik wajib memakai label kecil di sudut bawah: `RECONSTRUCTION` atau `ILLUSTRATIVE`. Teks lengkapnya ditentukan genre pack.
- Shot `FLOW` yang murni atmosferik (laut, langit, siluet jauh tanpa klaim peristiwa) tidak wajib dilabel, tetapi tetap tercatat di metadata.
- Video yang memakai `FLOW` realistis wajib dicentang "altered or synthetic content" saat upload ke YouTube.

## 9. Kamera untuk shot non-footage

Ini berlaku untuk shot `FLOW`, `MAP`, dan `TECH`.

| Fungsi | Rasa lensa | Gerakan |
|---|---|---|
| Establishing | 24–35 mm, wide | Sangat pelan |
| Hardware beauty | 50–85 mm, kompresi | Slide atau orbit pelan |
| Detail/macro | 90–120 mm | Push pelan atau statis |
| Skala | Aerial wide | Sangat pelan |
| Tension | Low angle | Push pelan dan terkendali |
| Teknis | Statis atau terkendali | Tanpa handheld palsu |
