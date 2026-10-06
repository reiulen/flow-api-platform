# 04 — Asset System

Cara mencari, mencatat, memberi lisensi, dan memakai ulang aset (footage, foto, audio, data peta).

## 1. Prinsip

1. **Lisensi dulu, baru estetika.** Aset bagus tanpa lisensi jelas tidak boleh masuk render publik.
2. **Metadata wajib.** Aset tanpa metadata lengkap tidak boleh dipakai di shot plan.
3. **Pakai ulang.** Database aset dibangun sekali dan dipakai di banyak video, jadi setiap video baru tidak mulai dari nol.
4. **Sumber resmi di atas stok.** Untuk hardware spesifik, footage resmi lebih akurat daripada stok yang labelnya sering salah.

## 2. Status lisensi

| Status | Arti | Boleh di render publik? |
|---|---|---|
| `public_domain` | Karya pemerintah AS, atau kedaluwarsa | Ya, dengan kredit yang diminta sumber |
| `open_commercial` | Lisensi terbuka yang mengizinkan komersial (OGL v3, CC0, CC BY) | Ya, dengan atribusi sesuai lisensi |
| `stock_licensed` | Lisensi stok (Pexels, Pixabay, berbayar) | Ya, sesuai syarat platform |
| `share_alike` | CC BY-SA | Ya, tapi cek dampak share-alike. Default hindari untuk footage utama |
| `non_commercial` | CC BY-NC, ESA, NATO, dan sejenisnya | **Tidak.** Channel yang dimonetisasi adalah penggunaan komersial |
| `editorial_only` | Hanya untuk berita | **Tidak**, kecuali ada izin tertulis |
| `fair_use_candidate` | Klip berita atau pihak ketiga yang dipakai untuk dikomentari | Hanya dengan persetujuan manusia per klip, maks 10 dtk, dan harus dikomentari langsung |
| `unknown` | Belum jelas | **Tidak** |

Catatan penting:

- **Karya pemerintah AS tidak otomatis bebas.** Arsip seperti NARA bisa memuat materi pihak ketiga yang masih dilindungi hak cipta. Status ditetapkan per item, bukan per arsip.
- **Orang yang bisa dikenali.** Beberapa lisensi (misalnya UK OGL) tidak mencakup data pribadi. Hindari close-up orang sipil yang bisa dikenali kecuali dari sumber resmi untuk konteks publik.
- **Insignia dan logo** di footage resmi boleh tampil sebagai bagian dari footage. Tidak boleh dipakai seolah channel kita didukung militer tersebut.

## 3. Sumber umum (semua genre)

| Sumber | Isi | Lisensi umum | Akses |
|---|---|---|---|
| NASA Image & Video Library | Antariksa, roket, citra bumi, aeronautika | Umumnya tidak berhak cipta. Kredit NASA, tanpa kesan endorsement | API publik `images-api.nasa.gov`, tanpa key |
| NASA Earth Observatory, Landsat/USGS | Citra satelit | Public domain | Download/API |
| Natural Earth | Data vektor peta | Public domain | Download |
| Copernicus DEM, SRTM | Data elevasi untuk terrain/hillshade | Bebas dengan atribusi | Download |
| Wikimedia Commons | Campuran, termasuk banyak salinan media pemerintah | **Per file**: wajib cek template lisensinya | API publik |
| Internet Archive / Prelinger | Film arsip, edukasi, industri, dan pemerintah | Banyak public domain, tapi **cek per item** | Publik |
| Pexels, Pixabay | Stok umum | Lisensi platform (komersial OK) | API key gratis |

**Stok umum (Pexels, Pixabay) hanya untuk:** suasana (laut, langit, kota, pabrik generik, tangan di keyboard). **Tidak untuk** hardware spesifik, karena labelnya sering salah.

Sumber khusus genre ada di `bibles/<genre>/SOURCES.md`.

## 4. Metadata aset

Setiap aset disimpan di database aset (SQLite, langkah 2) dengan field berikut:

```json
{
  "asset_id": "MIL-CAR-0012",
  "kind": "video",
  "source": "DVIDS",
  "source_url": "https://www.dvidshub.net/video/...",
  "source_id": "123456",
  "license": "public_domain",
  "credit": "U.S. Navy video by MC2 ...",
  "visual_type": "REAL",
  "subject": "Aircraft carrier flight operations",
  "platform": "Gerald R. Ford-class (CVN-78)",
  "variant": "CVN-78",
  "country": "USA",
  "year": 2023,
  "location": "Atlantic Ocean",
  "description": "F/A-18E launches from bow catapult, wide shot from island",
  "quality": "A",
  "resolution": "1920x1080",
  "fps": 29.97,
  "duration_s": 94.2,
  "orientation": "landscape",
  "best_ranges": [{ "in": 12.0, "out": 21.0, "note": "clean launch, no text overlay" }],
  "mood": ["scale", "power"],
  "burned_in_text": false,
  "factual_confidence": "confirmed",
  "identified_by": "source_caption",
  "reconstruction": false,
  "tags": ["catapult", "launch", "F/A-18E", "flight deck"],
  "added_at": "2026-10-04"
}
```

### Nilai yang dibatasi

| Field | Nilai |
|---|---|
| `quality` | `A` siap dipakai full screen. `B` layak, dengan crop atau stabilisasi. `C` hanya untuk montage cepat atau latar. `X` jangan dipakai |
| `factual_confidence` | `confirmed` (caption sumber resmi) · `likely` (diidentifikasi visual, belum diverifikasi) · `unverified` |
| `identified_by` | `source_caption` · `visual_id` · `human` |

Aturan:

- Footage dengan `factual_confidence: unverified` tidak boleh dipakai saat VO menyebut platform spesifik.
- Footage dengan `burned_in_text: true` (watermark, chyron) hanya boleh dipakai kalau teksnya bisa di-crop.

## 5. Penamaan

```
<GENRE>-<SUBJEK>-<NOMOR>      MIL-CAR-0012, MIL-F35-0103, TECH-GPU-0007
Shot Flow:  <PROYEK>-<ACT>-<NOMOR>   CAR01-A6-017
File:       assets/<genre>/<subjek>/<asset_id>.<ext>
```

## 6. Proses sourcing per video

Prinsipnya: **rencanakan dulu, baru unduh.** Setiap download makan waktu dan setiap klip yang diunduh harus di-review, jadi yang diunduh hanya klip yang sudah jelas gunanya.

1. **Kelompokkan kebutuhan.** Tahap Visual Director menulis kebutuhan visual per shot: subjek, platform, aksi, era. Shot dengan kebutuhan yang sama (lintas sequence) jadi satu kelompok, lengkap dengan kalimat narasinya, jumlah shot, dan durasinya.
2. **Cari metadata saja.** Setiap kelompok dicari sekali (maksimal 3 query per sumber, hasil di-cache). Belum ada yang diunduh. Kandidat dengan platform yang salah, lisensi yang tidak diizinkan, atau durasi di atas batas langsung dibuang. Yang tersisa maksimal 10 per kelompok, diurutkan dengan skor teks.
3. **Rencana aset (`asset_plan.json`).** Satu panggilan LLM teks per 8 kelompok membaca judul, deskripsi, tag, durasi, dan tahun setiap kandidat, lalu memilih klip yang memang memuat momen yang dibutuhkan, dengan urutan prioritas dan catatan `look_for` (apa yang diambil dari klip itu). Briefing, wawancara, upacara, paket berita, dan kompilasi tidak dipilih. Kalau tidak ada yang cocok, perencana tidak memilih apa pun dan mengusulkan satu query yang lebih tepat. Query itu dicari sekali, lalu direncanakan sekali lagi. Tanpa LLM, rencana diambil dari skor teks tertinggi.
4. **Download hanya yang direncanakan.** Klip utama setiap kelompok diunduh paralel (jumlahnya mengikuti kebutuhan shot, kira-kira 1 klip per 3 shot). Klip cadangan dari rencana baru diunduh kalau klip yang sudah ada tidak bisa mengisi sebuah shot. Ada batas download per video (`STUDIO_ASSET_MAX_DOWNLOADS`, default 1,5 kali jumlah klip yang dibutuhkan semua shot footage, minimal 6). Batas ini hanya pengaman: klip cadangan tetap baru diunduh kalau dibutuhkan. Ada juga batas waktu untuk seluruh tahap (`STUDIO_ASSET_TIME_BUDGET_MIN`, default 30 menit). Lewat dari itu, tidak ada download atau review baru: shot yang belum terisi jadi Flow atau ditinjau di G3, jadi tahap ini selalu selesai.
5. **Review visual, satu gambar per klip.** Metadata hanya bilang klip itu tentang apa, bukan isi setiap shot di dalamnya. Shot (hasil deteksi cut) yang cukup panjang untuk mengisi shot terpendek kelompoknya disusun jadi satu contact sheet (maksimal 12 frame), lalu dinilai sekali oleh model vision bersama tujuan pemakaiannya. Klip yang tidak punya shot cukup panjang ditolak tanpa panggilan model. Hasilnya disimpan di tabel `reviews`:
   - `relevance` 0–3: 3 = persis platform dan aksinya, 2 = platform benar dengan aksi atau sudut lain, 1 = konteks yang tidak menyesatkan, 0 = tidak relevan atau platform/varian lain.
   - `defects`: `slate`, `text` (caption, lower third, watermark), `talking_head`, `blank`, `poor`, `people`. Shot dengan defect tidak dipakai.
   - `taste` 0–2: kualitas sinematik frame, untuk memilih di antara shot yang sama relevannya.
   Pemilihan mengambil shot `relevance` ≥ 2 dulu, baru ≥ 1. Kalau review gagal, keputusan kembali ke pencocokan teks.
6. **Urutan cadangan: video → foto → motion → Flow.** Perencana juga melihat kandidat foto (foto resmi tokoh, penandatanganan, kerumunan, hardware), yang tampil dengan push-in pelan. Shot yang tetap tidak terisi mendapat peta atau chart yang menjelaskan kalimat narasinya (`motion_fill`, satu panggilan untuk semua shot kosong). Datanya hanya dari klaim narasi atau act-nya, dan grafik dengan angka yang tidak ada di klaim dibuang. Porsi peta dan chart dijaga di bawah batas `visual_mix.explainer` + 5%. Sisanya baru jadi Flow (rekonstruksi, berlabel) selama kuota Flow masih ada, atau ditandai `none` dan ditinjau di G3.

`asset_plan.json` mencatat untuk setiap kelompok: kandidat yang dibaca, klip yang dipilih beserta `look_for`, apakah diunduh, dan apakah terpakai. Bagian `totals` merangkum berapa kandidat dibaca, direncanakan, diunduh, di-review, dan terpakai.

## 7. Kredit

- Semua sumber dicatat di `credits.json` per video dan dirender sebagai daftar di deskripsi YouTube.
- Kredit di layar hanya untuk sumber yang mewajibkannya (misalnya atribusi basemap, CC BY).
