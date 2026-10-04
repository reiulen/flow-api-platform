# Military — Hardware QC

Checklist akurasi hardware untuk dua hal:

1. **Shot Flow:** setiap hasil generate dicek sebelum di-approve (`_common/05` §7).
2. **Identifikasi footage:** memastikan footage benar-benar platform atau varian yang disebut VO (`_common/04` §4).

Penonton niche militer sangat teliti. Satu kesalahan yang jelas (pulau kapal di sisi yang salah, jumlah mesin yang salah) bisa merusak kredibilitas seluruh video.

## Cara pakai

- Sebelum membuat `flow_spec`, Flow Director mengambil 2–4 ciri kunci platform dari daftar di bawah dan memasukkannya ke `subject_constraints`.
- Saat QC, setiap ciri dicek di frame sampel (awal, tengah, akhir). Satu pelanggaran ciri kunci berarti `rejected`.
- Kalau platform tidak ada di daftar ini, Flow Director menulis ciri kuncinya dari foto resmi (DVIDS atau situs resmi) dan menambahkannya ke file ini.

## Ciri umum per jenis

### Kapal induk (supercarrier AS: Nimitz, Ford)

- Satu island superstructure, di **sisi kanan (starboard)**. Pada kelas Ford, island lebih kecil dan posisinya lebih ke belakang dibanding Nimitz.
- Dek landing bersudut (angled deck) di **sisi kiri (port)**.
- Dek datar tanpa ski-jump. Ski-jump adalah ciri kapal induk STOBAR/STOVL seperti kelas Queen Elizabeth atau Kuznetsov.
- Kelas Queen Elizabeth (Inggris) punya **dua island**.
- Skala: pesawat di dek terlihat kecil. Lebar dek jauh lebih besar dari panjang pesawat.

### Kapal permukaan lain

- Destroyer/frigate: satu tiang utama, sistem peluncur vertikal (VLS) berupa panel datar di dek (bukan rak rudal terbuka), meriam tunggal di haluan.
- Haluan dan buritan proporsional. Tidak ada kapal yang "terlalu panjang" atau melengkung.
- Nomor lambung (hull number) tidak boleh berupa teks acak. Lebih baik tidak terbaca daripada salah.

### Pesawat tempur

- Jumlah mesin dan exhaust sesuai tipe (F-35: 1, F/A-18: 2, F-22: 2 dengan nozzle persegi).
- Jumlah dan bentuk ekor vertikal (F-35/F-22/F/A-18: 2 dan miring. F-16: 1).
- Bentuk sayap, canard (hanya pada tipe tertentu seperti Rafale, Eurofighter, Gripen, J-10), dan posisi intake.
- Kanopi satu kursi atau dua kursi sesuai varian.
- Tidak ada senjata yang menggantung di bawah pesawat siluman yang sedang dalam konfigurasi siluman.

### Kapal selam

- Bentuk lambung silinder dengan sail (menara) tunggal.
- Posisi hydroplane sesuai kelas (di sail atau di haluan).
- Tidak ada asap, cerobong, atau dek terbuka seperti kapal permukaan.

### Rudal dan intersepsi

- Rudal jelajah terbang rendah dan horizontal. Rudal balistik melengkung tinggi.
- Booster dan exhaust proporsional. Tidak ada jejak asap raksasa yang menutupi langit.
- Intersepsi digambarkan dari jarak jauh dan singkat. Tidak ada bola api gaya film.

### Drone

- Ukuran dan konfigurasi sesuai kelas: MALE (sayap panjang, satu propeller pendorong), loitering munition (kecil), quadcopter (empat rotor).

## Kesalahan AI yang paling sering

| Kesalahan | Cek di |
|---|---|
| Island kapal induk di sisi kiri atau ganda | Kapal induk |
| Kapal induk dengan ski-jump padahal yang dimaksud supercarrier AS | Kapal induk |
| Pesawat hibrida (sayap satu tipe, ekor tipe lain) | Pesawat |
| Jumlah mesin, ekor, atau roda berubah antar frame | Semua |
| Teks, nomor, dan insignia acak atau terbalik | Semua |
| Meriam atau rudal di posisi mustahil | Kapal |
| Skala salah (pesawat sebesar setengah dek) | Kapal induk |
| Asap, api, dan ledakan berlebihan | Semua |
| Kamuflase atau warna yang tidak dipakai negara tersebut | Semua |

## Identifikasi footage

- Default-nya, percaya caption sumber resmi (`identified_by: source_caption`) untuk platform dan lokasi.
- Footage tanpa caption yang jelas diidentifikasi dengan checklist di atas dan ditandai `factual_confidence: likely` sampai dicek manusia.
- Footage yang tidak bisa diidentifikasi tidak dipakai saat VO menyebut platform spesifik.
