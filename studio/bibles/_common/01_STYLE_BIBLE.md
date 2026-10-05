# 01 — Style Bible

Identitas visual dan ritme editing yang berlaku untuk semua dokumenter. Angka-angkanya berasal dari `references/00_REFERENCE_ANALYSIS.md`.

## 1. Identitas

**Formula:** real footage + arsip + rekonstruksi sinematik + peta + visualisasi teknis + motion yang terkendali + sound design yang kuat + pacing manusia.

**Target:** penonton merasa menonton dokumenter studio profesional, bukan video AI yang kebetulan panjang.

**Prinsip utama:** cerita menentukan visual. Visual tidak boleh menentukan cerita.

Pola yang secara eksplisit kita hindari:

> VO → stock footage → zoom → stock footage → peta → shot AI → teks raksasa → whoosh → ulangi.

## 2. Dua mode visual

Setiap scene di shot plan wajib punya `mode`.

### Mode CINEMATIC

Dipakai untuk: opening, pergantian act, membangun ketegangan, memperkenalkan hardware atau produk, menunjukkan skala, menunjukkan bahaya, ending, dan beat emosional.

- Shot ditahan lebih lama dan narasi lebih jarang.
- Ambience dan musik memegang peran besar.
- Teks hampir tidak ada.

### Mode INFORMATION

Dipakai untuk: geografi, cara kerja sistem, perbandingan jarak atau angka, logistik, arsitektur sistem, timeline, ekonomi, dan ancaman.

- Visual harus membantu otak memahami informasi, bukan sekadar indah.
- Peta, diagram, dan visualisasi teknis dibangun bertahap mengikuti narasi.
- Footage berfungsi sebagai bukti dari apa yang baru dijelaskan.

## 3. Ritme visual

Video 20–30 menit terasa seperti film karena tipe visualnya bergantian. Contoh urutan yang sehat:

```
CINEMATIC → REAL FOOTAGE → MAP → TECHNICAL → ARCHIVAL → CINEMATIC
→ REAL FOOTAGE → MAP → TENSION → FLOW RECONSTRUCTION → REAL FOOTAGE → QUIET ENDING
```

Pola inti dari referensi: **visual penjelas yang panjang → rangkaian footage bukti → kembali ke visual penjelas.**

| Parameter | Nilai [v0.1] |
|---|---|
| Rangkaian footage di antara dua visual penjelas | 4–10 shot |
| Tipe visual yang sama berturut-turut | Maks 90 dtk, kecuali peta yang terus berkembang |

## 4. Purpose tag dan density

Setiap scene punya `purpose`:

| Tag | Arti |
|---|---|
| `E` | Evidence: bukti, "ini benar-benar terjadi" |
| `I` | Information: menjelaskan |
| `C` | Cinematic: suasana, skala, emosi |
| `T` | Transition: jembatan antar bagian |
| `R` | Reset: ruang bernapas |

Aturan yang bisa dicek otomatis:

- Maks **4 scene `I` berturut-turut.**
- Setelah blok density `high` lebih dari **90 dtk**, wajib ada scene `R` atau `C`.
- Setiap act punya minimal satu scene `C` atau `R`.
- Density (`high`, `medium`, `low`) harus bervariasi. Tidak boleh lebih dari 4 menit di level yang sama.

## 5. Durasi shot

| Kelas shot | Durasi [v0.1] | Untuk |
|---|---|---|
| Fast | 1–3 dtk | Peluncuran, manuver, aksi intens. Hanya dalam rangkaian aksi |
| Normal | 3–7 dtk | B-roll, footage bukti, orang, pabrik |
| Hold | 7–15 dtk | Establishing, skala, satelit |
| Hero | 15–25 dtk | Shot yang memang sangat kuat |
| Explainer | 15–40 dtk | Peta dan visualisasi teknis, **wajib ada perubahan di dalamnya setiap 3–6 dtk** |

Target keseluruhan [v0.1]:

| Metrik | Target | Referensi |
|---|---|---|
| ASL (rata-rata durasi shot) | 7–10 dtk | Saudi 8.3 dtk |
| Median shot footage | 4–6 dtk | Saudi 4.9 dtk |
| % waktu di shot < 3 dtk | ≤ 8% | Saudi 4% |
| Porsi peta + visualisasi teknis | 30–40% | Saudi 35% |

**Aturan emas: jangan memaksa cut.** Shot boleh terus berjalan selama masih ada yang hidup di dalamnya (kamera bergerak, objek bergerak, air bergerak, cahaya berubah, atau informasi bertambah). Shot statis tanpa perubahan apa pun maksimal 6 dtk.

## 6. Transisi

Keputusan default [v0.1]: **transisi mengikuti mode** (opsi 3 di `00`). Bisa diubah sebelum pilot.

| Konteks | Transisi default |
|---|---|
| Di dalam rangkaian footage sejenis | Hard cut |
| Antar sumber footage berbeda di mode INFORMATION | Dissolve pendek 0.4–0.6 dtk |
| Peta → footage, footage → peta | Dissolve pendek 0.4–0.6 dtk |
| Rangkaian aksi di mode CINEMATIC | Hard cut |
| Lompatan waktu atau masuk arsip | Dissolve 1–2 dtk |
| Pergantian act | Fade lewat hitam atau dissolve lambat 1.5–3 dtk |
| Visual yang sejenis (pesawat → pesawat, radar → radar, satelit → peta) | Match cut |
| Whip atau push | Sangat jarang, maks 2 per video |
| Glitch, zoom transition, light leak | Tidak dipakai |

Yang dicek QC:

- Rasio transisi dihitung **per mode**, bukan untuk seluruh video.
- Setiap transisi selain hard cut dan dissolve pendek wajib punya alasan di kolom `transition_reason`.

## 7. Black beat

Layar hitam singkat dipakai untuk menandai pergantian act.

| Parameter | Nilai [v0.1] |
|---|---|
| Jumlah per video | 3–6 |
| Durasi | 0.5–3 dtk, maks 6 dtk dengan kartu judul |
| Penempatan | Hanya di pergantian act atau tepat sebelum pengungkapan besar |

## 8. Warna

**Base:** warna dokumenter natural sesuai footage. Tidak ada grade biru, teal-orange, atau merah untuk seluruh video.

**Accent di grafis hanya untuk informasi:**

| Warna | Arti |
|---|---|
| Merah | Ancaman, musuh, bahaya |
| Kuning/amber | Peringatan, perhatian |
| Cyan | Sensor, data, deteksi |
| Putih | Informasi netral, label |

Kalau warna merah muncul, penonton harus tahu itu penting. Palet base per genre ditentukan di `GENRE.md`.

## 9. Typography

Fungsinya memperkuat informasi, bukan dekorasi.

- Bentuknya angka besar plus label kecil. Contoh: `$13 BILLION` / `CONSTRUCTION COST`.
- Muncul 1–3 dtk lalu hilang.
- Maks 2 baris dan 6 kata per kartu.
- Rata-rata maks 1 kartu angka per menit.
- Font: sans-serif teknis yang bersih (keluarga grotesk/mono). Font final dikunci di genre pack.
- Label peta memakai huruf kapital, kecil, dan berjarak lebar.

Yang tidak dipakai: HUD gaya game, typography TikTok, teks raksasa ala thumbnail YouTube, emoji animasi, teks chrome 3D, dan teks yang bergetar atau glitch.

## 10. Opening

| Waktu | Isi |
|---|---|
| 0:00–0:15 | Misteri sinematik. Boleh tanpa narasi (cold open 8–20 dtk) |
| 0:15–0:35 | Kontradiksi |
| 0:35–0:50 | Pertanyaan inti |
| 0:50–1:20 | Bukti visual bahwa pertanyaan itu nyata |
| 1:20+ | Judul atau kartu pembuka, lalu cerita dimulai |

Kalimat pembuka yang dilarang: "Today we're going to talk about…", "In this video…", "Hey guys…".

## 11. Ending

- Ending menjawab pertanyaan inti. Bukan ringkasan.
- Ditutup dengan shot sinematik yang tenang, musik turun, dan ambience.
- Tanpa "thanks for watching" atau ajakan subscribe di narasi. End screen YouTube ditempatkan di 10–20 dtk terakhir, di atas visual yang tenang.

## 12. Thumbnail, judul, dan hook

Ketiganya harus menyatu: visual utama thumbnail muncul di 60 detik pertama, dan pertanyaan di judul dijawab di ending. Thumbnail memakai maks 3 kata.
