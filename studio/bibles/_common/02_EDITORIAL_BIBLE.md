# 02 — Editorial Bible

Cara memilih topik, membangun cerita, menulis narasi, dan menjaga fakta.

## 1. Pemilihan topik

Pipeline mengusulkan topik dan manusia yang memilih (human gate G1).

Setiap usulan topik ditulis sebagai `topic_candidate` (lihat `08`) dan dinilai dengan skor 1–5 per kriteria:

| Kriteria | Pertanyaan |
|---|---|
| Kontradiksi | Apakah ada paradoks yang membuat orang penasaran? ("Kenapa X masih dipakai padahal semua orang tahu kelemahannya?") |
| Mekanisme | Apakah ada sistem yang bisa dijelaskan langkah demi langkah? |
| Ketersediaan footage | Apakah ada footage nyata yang cukup dan legal? |
| Kedalaman sumber | Apakah ada sumber tier 1–2 yang cukup untuk 20+ menit? |
| Relevansi | Apakah topik ini dibicarakan sekarang, atau abadi (evergreen)? |
| Visualisasi | Apakah ada sesuatu yang hanya bisa dipahami lewat peta atau diagram? |
| Risiko | Apakah ada risiko misinformasi, isu sensitif, atau masalah lisensi? (skor terbalik) |

Topik dengan skor ketersediaan footage ≤ 2 tidak boleh lolos tanpa catatan eksplisit dari manusia, karena video akan jatuh ke footage generated yang berlebihan.

Format judul: pertanyaan atau klaim yang mengandung kontradiksi. Contoh: *Why Aircraft Carriers Are So Hard to Sink*, bukan *The History of the USS Nimitz*.

## 2. Pertanyaan inti

Setiap video punya satu **central question** yang menjadi mesin cerita. Seluruh act bergerak menuju jawabannya.

Contoh:

> Bagaimana mungkin kapal seharga puluhan miliar dolar tetap bisa bertahan, padahal semua orang tahu di mana posisinya?

## 3. Struktur act

Satu skeleton yang dikunci. Durasi untuk video sekitar 25 menit, dan diskalakan proporsional untuk durasi lain.

| Act | Nama | Waktu | Isi | Mode dominan |
|---|---|---|---|---|
| 1 | Hook | 0:00–1:20 | Misteri, kontradiksi, pertanyaan inti, bukti | CINEMATIC |
| 2 | Context & Scale | 1:20–5:00 | Ukuran, biaya, jangkauan, sejarah singkat | INFORMATION + arsip |
| 3 | Mechanism | 5:00–11:00 | Cara kerja, langkah demi langkah | INFORMATION + teknis |
| 4 | System | 11:00–14:00 | Bagaimana bagian-bagian bekerja bersama | Peta + real footage |
| 5 | Threat | 14:00–18:00 | Masalah: apa yang bisa mengalahkannya | Real footage + tension |
| 6 | Response | 18:00–22:00 | Bagaimana sistem merespons. Bagian spektakel | Flow reconstruction + teknis |
| 7 | Limits & Implication | 22:00–25:00 | Kelemahan, apa yang berubah, jawaban akhir | Real footage → CINEMATIC tenang |

Aturan:

- Setiap act berakhir dengan pertanyaan atau ketegangan yang mendorong ke act berikutnya.
- Act 7 wajib membahas keterbatasan. Tidak ada sistem yang sempurna, dan video yang tidak mengakui ini terasa seperti iklan.
- Slot sponsor, kalau ada, ditempatkan di pergantian act 2→3 atau 4→5, tidak pernah di act 1.

## 4. Narasi

### Nada

Tenang, cerdas, dan yakin. Narator dokumenter, bukan salesman.

- ❌ "THIS IS THE MOST POWERFUL WEAPON EVER CREATED!"
- ✅ "At first glance, an aircraft carrier seems almost absurdly vulnerable."

### Pola kalimat

- **Pertanyaan → kontradiksi → penjelasan.**
- Variasikan panjang kalimat. Kalimat pendek dipakai untuk penekanan:
  > "It is enormous. Its position can be tracked. And yet, for decades, navies have kept building them."
- Satu ide per kalimat.
- Angka dibulatkan untuk narasi ("almost 1,100 feet"). Angka presisi ditaruh di kartu teks kalau perlu.
- Hindari superlatif tanpa sumber, misalnya "most advanced" atau "unstoppable".
- Hindari klise AI: "In a world where…", "Let's dive in", "game-changer", "delve", dan "It's not just X, it's Y".

### Kepadatan [v0.1]

| Metrik | Target | Referensi |
|---|---|---|
| Narasi (% durasi) | 80–88% | Saudi 95%, Finland 73% |
| Kecepatan bicara | 140–160 kata/menit | (belum diukur dari referensi) |
| Jumlah kata untuk 25 menit | ± 3.000–3.400 | |
| Jeda ≥ 1 dtk | 2–4 per menit | |
| Narasi tanpa jeda ≥ 1 dtk | Maks 30 dtk | Finland p90 21 dtk |

### Markup script

Script ditulis dengan penanda yang dibaca tahap VO dan editing:

```
[PAUSE 0.8]          jeda dalam detik
[BEAT]               jeda 1.5–3 dtk untuk visual atau musik
*kata*               penekanan
{PRON: Bab-el-Mandeb = bahb el MAN-deb}
[TONE: quiet]        quiet | normal | firm
```

## 5. Standar fakta

### Hierarki sumber

| Tier | Jenis | Boleh jadi fondasi klaim? |
|---|---|---|
| 1 | Primer: pemerintah, militer, pabrikan, laporan resmi, dokumen kongres/parlemen, dokumen pengadaan, paper teknis | Ya |
| 2 | Media dan lembaga sangat kredibel: Reuters, AP, BBC, publikasi pertahanan mapan, institusi riset | Ya |
| 3 | Analisis: think tank, pakar, publikasi spesialis | Ya, sebagai analisis, dengan atribusi |
| 4 | Penemuan saja: Reddit, blog, media sosial, YouTube, wiki | **Tidak.** Hanya untuk menemukan sumber tier 1–3 |

### Aturan klaim

- Setiap klaim faktual di script punya `claim_id` yang merujuk ke `research.json`.
- Angka penting (biaya, jarak, kecepatan, jumlah) butuh minimal **1 sumber tier 1** atau **2 sumber tier 2** yang independen.
- Kalau sumber berbeda, narasi menyebut rentangnya:
  > "The Navy says X. Independent estimates put it between Y and Z."
- Spesifikasi yang dirahasiakan tidak boleh ditulis seolah pasti. Pakai "estimated", "reported", atau "believed to be".
- Tanggal setiap sumber dicatat. Klaim berbasis sumber berumur lebih dari 3 tahun untuk topik yang cepat berubah wajib dicek ulang.

### Tingkat keyakinan

| Level | Arti | Cara di narasi |
|---|---|---|
| `confirmed` | Sumber tier 1, atau beberapa tier 2 yang sepakat | Kalimat langsung |
| `reported` | Satu sumber tier 2 | "according to…", "reportedly" |
| `estimated` | Analisis atau perkiraan tier 3 | "estimated", "analysts believe" |
| `disputed` | Sumber bertentangan | Sebutkan keduanya |

## 6. Hal sensitif

- Konflik yang sedang berlangsung: hindari footage korban yang bisa dikenali, jangan memihak tanpa sumber, dan bedakan klaim pihak yang berperang dari fakta yang terverifikasi.
- Tidak membuat konten yang bisa menjadi panduan operasional serangan, misalnya cara menembus sistem pertahanan tertentu secara spesifik. Kita menjelaskan konsep, bukan menulis instruksi.
