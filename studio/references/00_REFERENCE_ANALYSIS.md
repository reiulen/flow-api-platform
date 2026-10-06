# 00 — Reference Analysis

Analisis terukur dua video referensi. Angka di sini jadi dasar parameter di Style Bible (`01`), Audio Bible (`06`), dan QC (`07`).

| | Saudi | Finland |
|---|---|---|
| Judul | *Why Everything is Going Wrong for Saudi Arabia* | *Finland's Most Sinister Unsolved Mystery* |
| Gaya | Geopolitik, peta + footage (gaya RealLifeLore) | True crime, ilustrasi animasi (Nexpo) |
| Durasi total | 25:20 | 36:43 |
| Durasi inti yang dianalisis | 23:30 (tanpa segmen sponsor 23:30–25:20) | 33:20 (tanpa promo pembuka 0:00–0:50, midroll 18:38–19:10, outro 34:43+) |

## Metode dan batasan

- Video diturunkan ke 240p/15 fps, lalu dianalisis di 64×36. Transisi dideteksi dari perubahan histogram warna dengan dua jendela: ±0.27 dtk untuk cut dan dissolve pendek, ±2 dtk untuk dissolve lambat. Semua hasil dicek visual lewat sheet before/after.
- Audio dari salinan AAC mono 64 kbps. Voice activity detection memakai Silero VAD. Level adalah RMS per 100 ms. Loudness memakai EBU R128.
- **Akurasi.** Posisi transisi ±1 frame (±0.07 dtk). Di Finland, beberapa pergantian adegan di dalam dissolve yang gelap lolos dari deteksi (sekitar 2 dari 15 di jendela 8–16 menit yang dicek manual), jadi jumlah adegan sebenarnya kira-kira 10% lebih banyak. Angka loudness dari salinan 64 kbps itu perkiraan.
- **Belum terukur:** jenis dan pergantian musik, dan SFX.
- **Narasi Saudi (ditambahkan 6 Okt 2026):** ditranskripsi per 5 menit lewat model audio di 9router (`code_rei`), lalu dibaca utuh. Transkrip lengkap tidak disimpan di repo; di sini hanya analisis dan kutipan pendek.
- **Bahasa visual Saudi (ditambahkan 6 Okt 2026):** contact sheet setiap 15 dtk untuk seluruh video, ditambah crop frame peta di resolusi asli, lalu dibandingkan berdampingan dengan render peta kita dari spesifikasi yang sama.
- Tools dan data mentah ada di `tools/` dan `data/`, jadi analisis bisa diulang untuk referensi berikutnya.

## Angka utama

| Metrik | Saudi | Finland |
|---|---:|---:|
| Jumlah shot/adegan (inti) | 168 | 44 (+21 black beat) |
| Rata-rata durasi shot (ASL) | **8.3 dtk** | **41 dtk** |
| Median durasi shot | 5.2 dtk | 37 dtk |
| Transisi per menit | 7.3 | 2.2 |
| % waktu di shot < 3 dtk | 4% | 0.4% |
| % waktu di shot 3–7 dtk | 28% | 2% |
| % waktu di shot 7–15 dtk | 28% | 3% |
| % waktu di shot 15–25 dtk | 18% | 4% |
| % waktu di shot 25–60 dtk | 22% | 34% |
| % waktu di shot > 60 dtk | 0% | 56% |
| Hard cut | 26% | 8% |
| Dissolve pendek (≈0.4–0.8 dtk) | 68% | 6% |
| Dissolve lambat (beberapa detik) | 5% | 70% |
| Fade lewat hitam | 2% | 16% |
| Black beat (layar hitam) | 1 | 21, total ≈3 menit |
| Narasi (% durasi inti) | **95%** | **73%** |
| Jeda ≥ 1 dtk per menit | ≈0 | 4.9 |
| Jeda 2–4 dtk / > 4 dtk (seluruh video) | 0 / 0 | 31 / 12 |
| Narasi tanpa jeda ≥ 1 dtk (median / p90 / maks) | hampir seluruh video | 7 / 21 / 39 dtk |
| Music bed di jeda narasi, relatif ke VO | −24 dB | −23 dB |
| Jeda yang benar-benar hening | 2% | 7.5% |
| Integrated loudness | ≈ −17 LUFS | ≈ −15 LUFS |
| Loudness range (LRA) | **2.2 LU** | **6.7 LU** |

## Saudi: arsitektur informasi

**Pola dasarnya peta panjang, lalu ledakan footage, lalu kembali ke peta.**

- Peta mengisi **35% durasi** (24 shot, median 18 dtk, rata-rata 22 dtk, terpanjang 55 dtk). Shot non-peta median 4.9 dtk.
- Peta nggak terasa diam karena **di dalamnya terus berubah**: wilayah diwarnai, rute digambar, label muncul, kamera zoom. Sekitar 60% frame Saudi punya gerakan yang terlihat.
- Di antara dua peta biasanya ada 4–12 shot footage berdurasi 3–7 dtk yang menjadi bukti dari apa yang baru dijelaskan peta: konvoi, kilang, kapal, politisi, reruntuhan.
- Jenis visual: peta (dominan), footage berita/lapangan, citra satelit, grafik data (produksi minyak), dan beberapa establishing shot drone. Hampir tanpa kartu teks.
- Pembukaan langsung masuk peta dengan narasi. Tempo transisi di 5 menit pertama (23 transisi) lebih rendah dari bagian tengah (37–43 per 5 menit), karena pembuka didominasi peta panjang.
- **Transisi default-nya dissolve pendek**, bukan hard cut. Ini dicek frame per frame: pergantian footage-ke-footage dan peta-ke-footage umumnya cross-dissolve 0.4–0.8 dtk. Hard cut dipakai di dalam satu rangkaian footage yang sejenis.
- **Narasinya nyaris tanpa napas.** VO terisi 95% dan hampir tidak ada jeda ≥ 1 dtk dalam 23 menit. Music bed jalan terus sekitar 24 dB di bawah suara. LRA 2.2 LU berarti dinamikanya sangat datar.

## Finland: atmosfer

**Polanya adegan ilustrasi yang ditahan sangat lama, transisi pelan, dan jeda yang disengaja.**

- Seluruh visual berupa ilustrasi animasi dengan palet merah, hitam, dan putih. Nggak ada footage nyata kecuali foto korban di pembuka.
- **56% durasi ada di adegan lebih dari 60 detik.** Gerakan di dalam adegan sangat lambat (drift dan parallax pelan), hampir nggak terdeteksi di resolusi analisis. Adegan panjang ini bertahan karena narasi bercerita dan suasana suaranya, bukan karena visual yang bergerak.
- **Transisi hampir selalu pelan:** dissolve lambat (70%) atau fade lewat hitam (16%). Hard cut cuma 6 kali di seluruh video.
- **Black beat dipakai sebagai tanda bab:** 21 kali, termasuk kartu judul di atas hitam ("UNDER THE MIDNIGHT SUN", "JUNE 4TH, 1960").
- **Narasinya bernapas.** VO 73%, ada hampir 5 jeda ≥ 1 dtk per menit, 31 jeda 2–4 dtk, dan 12 jeda > 4 dtk. Satu kalimat panjang jarang lewat 20 dtk tanpa jeda.
- Dibuka dengan **cold open sekitar 20 dtk tanpa narasi**: lanskap danau, foto korban, dan suasana. Ada juga **title sequence sekitar 23 dtk tanpa narasi** di 2:10.
- LRA 6.7 LU, tiga kali Saudi. Ada bagian pelan, bagian penuh, dan 7.5% jeda yang benar-benar hening.

## Saudi: bahasa visual (RealLifeLore)

**Peta**

- Citra satelit natural yang hangat dan kontras: gurun oranye, laut dangkal toska, laut dalam navy gelap. Vignette berat di tepi. Border negara garis putih tegas.
- Overlay neon jenuh di atas citra: rute magenta/merah muda dan cyan, pipeline mint/hijau, inti garis hampir putih dengan glow lebar, panah di ujung rute.
- Wilayah kekuasaan berwarna pekat (merah tua, hijau, kuning), sekitar 75–85% opacity. Wilayah yang baru direbut diberi **arsiran**.
- Label negara: pelat gelap hangat, huruf kondensed kapital dengan jarak huruf lebar, ukurannya kecil dibanding frame. Label rute dan titik kritis: kotak berwarna peran dengan teks putih. Kota: teks putih dengan garis bawah berwarna dan garis penunjuk.
- Chokepoint: cincin merah putus-putus yang berdenyut, kadang tanda X.
- **Infografik hidup di atas peta:** pie chart "−95%" di samping rute, grid ikon orang untuk populasi, grid barel/koin untuk ekspor dan anggaran ("2025 SAUDI MILITARY SPENDING $83.2 BILLION"), lencana bernomor di sepanjang rute, inset peta dalam kotak.
- Peta tidak pernah diberi judul. Legenda kecil di kiri bawah.

**Grafik data**

- Latar hampir hitam, grid tipis, judul kondensed kapital putih besar di kiri atas ("SAUDI OIL PRODUCTION", subjudul "2023-PRESENT"), bar magenta atau garis neon, tag nama seri berwarna di ujung garis, anotasi peristiwa dengan kotak merah ("IRAN WAR STARTS / HORMUZ CLOSES"), baris sumber kecil di kiri bawah.
- Sesekali tangkapan layar tabel (Wikipedia) dengan baris yang disorot.

**Footage**

- Warna natural, tanpa grading berat. Footage berita, drone, militer resmi, foto politisi. Logo sumber pihak ketiga sering terlihat.
- Dissolve antar sumber sering menghasilkan double exposure peta-di-atas-footage.

## Saudi: narasi

- **Tempo ±170 kata/menit** (±850 kata per 5 menit, stabil sepanjang video). Kalimat panjang dengan banyak anak kalimat, diselingi kalimat pendek penutup.
- **Hook (0:00–0:50):** taruhan di kalimat pertama ("Saudi Arabia is currently experiencing one of the worst years in its entire national history"), eskalasi ("As if … wasn't enough, … now …"), skenario terburuk yang dibuat fisik ("it would effectively almost landlock them… like the engine of their entire economy grinding down to a halt"), lalu pivot ("Unfortunately for them, however, nightmares like this can sometimes become reality").
- **Angka selalu diberi skala:** "soaring more than 30 times over", "about 4% of the entire global supply of oil", "a population nearly double", "nearly five times larger than Yemen's entire collective annual economic output", "the eighth-largest military budget in the world".
- **Punya sudut pandang dan humor kering:** "a crisis almost entirely of Saudi Arabia's own making", "something that would only work out in a Tom and Jerry cartoon, and yet here we are", "responded to with nothing other than thoughts and prayers".
- **Penyambung lisan** membawa argumen: "Now,", "Meanwhile,", "Indeed,", "And then,", "So,", "Moreover,". Orang pertama sesekali ("like I talked about earlier").
- **Struktur:** krisis hari ini → geografi dan mekanisme (selat, pipeline) → angka dampak → asal-usul ("born around three decades ago") → perbandingan demografi → kronologi eskalasi → retaknya koalisi → politik AS → semua opsi buruk → penutup ("stuck between a very big rock and a very hard place") → segue sponsor.

## Yang kita ambil untuk dokumenter militer

Rekomendasi v0.1. Angka final dikunci di `01_STYLE_BIBLE.md` dan `06_AUDIO_BIBLE.md` setelah pilot.

| Parameter | Target v0.1 | Dasar |
|---|---|---|
| ASL keseluruhan | 7–10 dtk | Saudi 8.3. Kita sedikit lebih lambat untuk ruang sinematik |
| Median shot footage | 4–6 dtk | Saudi 4.9 |
| Shot peta dan visualisasi teknis | 15–40 dtk, **wajib ada perubahan di dalamnya** tiap 3–6 dtk | Saudi: peta median 18 dtk, maks 55 dtk |
| Cinematic hold (establishing, skala) | 8–20 dtk, maks sekitar 25 dtk | Di antara Saudi dan Finland |
| Porsi peta + visualisasi teknis | **30–40% durasi** | Saudi 35%. Spec sebelumnya (15–20%) terlalu rendah |
| Rangkaian footage di antara visual penjelas | 4–10 shot | Saudi 4–12 |
| Narasi (% durasi) | **80–88%** | Saudi 95% terlalu padat untuk 25 menit, Finland 73% terlalu lambat untuk konten teknis |
| Jeda ≥ 1 dtk | 2–4 per menit | Di antara keduanya |
| Breathing room ≥ 3 dtk tanpa narasi | Minimal 1 per 3–4 menit, plus 3–8 dtk di setiap pergantian act | Finland |
| Cold open tanpa narasi | 8–20 dtk | Finland |
| Black beat | 3–6 per video, hanya untuk pergantian act | Finland memakai 21, tapi itu khas true crime |
| Music bed di bawah VO | −20 sampai −26 dB relatif ke VO | Keduanya sekitar −23/−24 |
| Master loudness | −14 LUFS integrated | Standar YouTube |
| Loudness range | 4–7 LU | Saudi 2.2 terlalu datar, Finland 6.7 |

## Keputusan yang perlu lu ambil: hard cut atau dissolve

Spec sebelumnya menetapkan **hard cut 70–80%**. Data kedua referensi berkata lain: Saudi memakai hard cut hanya 26% (sisanya dissolve pendek), Finland 8%.

Pilihannya:

1. **Ikuti referensi.** Dissolve pendek (0.4–0.6 dtk) jadi default antar sumber footage. Hard cut di dalam satu rangkaian dan untuk penekanan. Hasilnya lebih halus dan lebih "dokumenter YouTube".
2. **Pertahankan spec.** Hard cut jadi default dan dissolve hanya untuk perpindahan waktu atau suasana. Hasilnya lebih tegas, lebih "broadcast/militer", dan lebih berbeda dari referensi.
3. **Campuran per mode.** Mode INFORMATION (peta, teknis, bukti footage) memakai pola Saudi. Mode CINEMATIC memakai hard cut di rangkaian aksi dan dissolve lambat atau lewat hitam di pergantian act.

Rekomendasi: **opsi 3.** Opsi ini sesuai dengan dua mode visual di spec, dan tetap bisa dicek otomatis: rasio transisi dihitung per mode, bukan untuk seluruh video.

### Diterapkan dari analisis visual dan narasi (6 Okt 2026)

| Aspek | Ditiru | Dimodifikasi |
|---|---|---|
| Peta | Palet neon, rute tebal bercahaya, wilayah pekat, arsiran, label kecil, tanpa judul, callout angka di lokasi | Fakta dan koordinat tetap dari klaim; atribusi citra tetap dibakar ke frame |
| Grafik | Bingkai chart hitam, judul kondensed, bar/garis neon, anotasi peristiwa, baris sumber (`compare`, `trend` baru) | Nilai hanya dari klaim riset |
| Narasi | Formula hook, pembanding untuk setiap angka kunci, penyambung lisan, sudut pandang, humor kering sesekali | Tetap ada jeda napas dan cold open (RLL hampir tanpa jeda); tidak ada glorifikasi atau instruksi operasional; humor tidak pernah soal korban |
| Tempo | — | Tetap ±150 wpm mengikuti kecepatan TTS, bukan 170 |

## Yang sengaja tidak kita ambil

- **Gaya ilustrasi Finland.** Itu identitas Nexpo dan cocok untuk true crime. Yang kita ambil adalah ritmenya (cold open, jeda, transisi pelan di pergantian act), bukan visualnya.
- **Narasi Saudi yang nyaris tanpa napas.** Itu efektif untuk penonton RealLifeLore, tapi bertentangan dengan target kita bahwa video harus nyaman ditonton 20–30 menit.
- **Durasi adegan Finland (> 60 dtk).** Untuk konten teknis militer, adegan selama itu tanpa informasi baru akan terasa lambat.

## Catatan lain

- Kedua video punya slot sponsor atau promo (Saudi sekitar 2 menit di akhir, Finland di awal, tengah, dan akhir). Pipeline perlu menyediakan slot ini sejak shot plan supaya nggak memotong alur act.
- Analisis berikutnya yang berguna adalah transkrip kedua video untuk mengukur kata per menit, panjang kalimat, dan posisi pertanyaan atau hook. Ini butuh model speech-to-text, jadi perlu akses Hugging Face di network policy atau dijalankan di Mac.
