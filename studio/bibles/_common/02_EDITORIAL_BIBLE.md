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

Gayanya santai dan enak didengar, seperti teman pintar yang menjelaskan sesuatu yang menarik: kontraksi, menyapa penonton dengan "you", pertanyaan retoris, sesekali komentar kering. Tidak kaku, tidak formal, tidak akademis.

### Nada

Penjelas yang cerdas, yakin, dan conversational, dengan sudut pandang yang jelas. Rujukannya narasi RealLifeLore (lihat `references/00_REFERENCE_ANALYSIS.md` §Narasi): seperti teman pintar yang sudah membaca semua laporan dan memahami petanya. Bukan salesman, bukan hype, tidak mengglorifikasi.

- ❌ "THIS IS THE MOST POWERFUL WEAPON EVER CREATED!"
- ✅ "At first glance, an aircraft carrier seems almost absurdly vulnerable."
- ✅ "Geopolitically, this is all utterly disastrous for them." (opini yang didukung bukti, diucapkan lugas)

### Hook (act 1)

1. Kalimat pertama: taruhannya, saat ini, sekuat yang diizinkan klaim.
2. Eskalasi: pukulan kedua ("As if X wasn't enough, … now …").
3. Skenario terburuk dibuat konkret dengan satu gambaran fisik ("it would almost landlock them").
4. Baru kemudian kontradiksi, pertanyaan inti, dan janji mekanisme yang akan dijelaskan film.

### Pola kalimat

- **Pertanyaan → kontradiksi → penjelasan.**
- Variasikan panjang kalimat. Kalimat pendek dipakai untuk penekanan:
  > "It is enormous. Its position can be tracked. And yet, for decades, navies have kept building them."
- Kalimat panjang membangun rantai sebab-akibat, kalimat pendek mendaratkannya.
- **Setiap angka kunci diberi pembanding** supaya skalanya terasa: "more than 30 times over", "about 4% of the entire world's supply", "nearly double", "five times larger than Yemen's whole economy".
- Logika dibawa oleh penyambung lisan: "Now,", "But", "And then,", "Meanwhile,", "Indeed,", "Unfortunately for them, however,".
- Humor kering boleh sekitar sekali per act, tidak pernah soal korban. Orang pertama hanya untuk menuntun ("like I mentioned earlier").
- Angka dibulatkan kalau presisinya tidak menambah apa-apa ("almost 1,100 feet"). Angka presisi tetap dipakai kalau presisinya justru poinnya, dan ditaruh juga di kartu teks.
- Hindari superlatif tanpa sumber, misalnya "most advanced" atau "unstoppable". Superlatif harus punya klaim di belakangnya.
- Act 7: jabarkan opsi yang tersisa dan harga masing-masing, lalu tutup dengan satu kalimat lugas yang akan diulang penonton.
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

### Edit naskah utuh

Act ditulis satu per satu, jadi setelah semua act jadi, ada satu putaran editor yang membaca naskah sebagai satu film (`runScriptEdit`, hasil di `script_edits.json`, draf asli di `script.draft.json`). Editor memperbaiki, berurutan:

1. **Hook:** taruhannya konkret di kalimat pertama, lalu dinaikkan, membuka pertanyaan, dan menjanjikan jawaban.
2. **Momentum:** setiap act dibuka dengan belokan atau pertanyaan baru dan ditutup dengan open loop yang dibayar act berikutnya.
3. **Payoff:** setiap janji atau pertanyaan dijawab.
4. **Pengulangan:** fakta, angka, gambaran, atau pembuka kalimat yang sama di dua tempat.
5. **Ritme:** tiga segmen berturut-turut dengan bentuk kalimat yang sama.
6. **Bahasa lisan:** kalimat yang terasa seperti tulisan.

Pengaman: editor hanya boleh mengubah teks segmen, maksimal 30 edit. Edit ditolak kalau menambah angka atau nama yang tidak ada di segmen itu atau di klaimnya, melanggar markup, mengubah panjang lebih dari sekitar 35%, atau membuat act gagal lint. Kalau editor gagal, draf tetap dipakai.

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
| `reported` | Satu sumber tier 2 | Kalimat langsung (sumber ada di deskripsi) |
| `estimated` | Analisis atau perkiraan tier 3 | Kata angka lunak: "around", "roughly", "nearly", "an estimated" |
| `disputed` | Sumber bertentangan | Angka dengan sumber terbaik + "around"; sebutkan siapa mengklaim apa hanya kalau perbedaannya penting bagi cerita |

Tingkat keyakinan menentukan **apa yang boleh diklaim**, bukan berapa banyak kata pelindung yang diucapkan. Run pertama (B-52) memakai "reportedly" 29 kali dan total 61 kata pelindung dalam 3.204 kata; narasinya jadi terdengar seperti catatan kaki. Aturan sekarang:

- Atribusi menyebut nama, sekali, hanya untuk klaim pihak berkonflik/lembaga ("the Pentagon says"), rencana atau prakiraan yang bisa batal, dan kutipan. Tidak pernah "analysts say", "according to analysts", "figures vary by source".
- Kuota: maksimal satu frasa pelindung/atribusi per ±200 kata, tidak pernah dua dalam satu kalimat. Lint script menolak act yang melewati kuota.
- Tidak membacakan daftar. Maksimal tiga item per kalimat; kategori diganti satu contoh hidup atau dua hal yang dikontraskan. Lint menandai kalimat berbentuk daftar.

## 6. Hal sensitif

Prinsipnya: **lugas, tidak menyensor.** Fakta yang bersumber disebut terang-terangan, termasuk yang tidak nyaman: siapa pelakunya, siapa yang kena, berapa korban, apa yang gagal, berapa biayanya, siapa yang untung. Sebut nama. Tidak ada eufemisme ("kinetic action", "collateral damage", "insiden"), tidak ada moralisasi, tidak ada disclaimer tambahan. Batasnya hanya ini:

- Konflik yang sedang berlangsung: hindari footage korban yang bisa dikenali, jangan memihak tanpa sumber, dan bedakan klaim pihak yang berperang dari fakta yang terverifikasi.
- Tidak membuat konten yang bisa menjadi panduan operasional serangan, misalnya cara menembus sistem pertahanan tertentu secara spesifik. Kita menjelaskan konsep, bukan menulis instruksi.
- Tidak mengglorifikasi kekerasan dan tidak bercanda soal korban. Footage tempur dipakai untuk menjelaskan, bukan tontonan.
