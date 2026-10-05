# Military — Sumber Footage dan Arsip

Daftar sumber per prioritas, dengan status lisensi untuk channel YouTube yang **dimonetisasi** (penggunaan komersial). Status mengikuti `_common/04_ASSET_SYSTEM.md` §2.

> **Penting.** Status di sini adalah aturan umum sumbernya. Lisensi tetap dicek **per item**: caption, watermark, dan catatan hak cipta di halaman aset. Setiap baris bertanda *perlu verifikasi* wajib dicek ulang di halaman syarat resminya sebelum dipakai di render publik pertama.
>
> Terakhir diverifikasi: 2026-10-04.

## Prioritas 1 — Pemerintah AS (public domain)

| Sumber | Isi | Lisensi | Akses | Key |
|---|---|---|---|---|
| **DVIDS** (dvidshub.net) | Video, foto, dan audio resmi seluruh cabang militer AS. Sumber utama kita | Public domain, boleh komersial. Diminta kredit ke fotografer/unit. Cek item yang punya catatan hak cipta lain | API (`api.dvidshub.net`) + download | **Ya**, gratis, daftar di situs API |
| **NARA** (catalog.archives.gov) | Film dan foto sejarah: Perang Dunia, Perang Dingin, program senjata | Umumnya public domain, **tapi NARA tidak menjamin status**. Ada materi pihak ketiga yang masih berhak cipta. Cek per item | Catalog API | Ya, gratis (minta lewat email ke Catalog_API@nara.gov) |
| **NASA Image & Video Library** | Roket, peluncuran, citra bumi, aeronautika, uji coba | Umumnya tidak berhak cipta. Kredit NASA. Tidak boleh terkesan didukung NASA, dan logo NASA tidak dipakai | `images-api.nasa.gov` | Tidak |
| **Naval History and Heritage Command** (history.navy.mil) | Foto dan arsip sejarah Angkatan Laut AS | Mayoritas public domain, sebagian koleksi donasi berhak cipta | Situs | Tidak |
| **US Army Center of Military History**, Air Force Historical Support Division | Foto sejarah, peta, dokumen | Umumnya public domain | Situs | Tidak |
| **Smithsonian Open Access** | Foto pesawat, artefak (Air and Space Museum) | Item bertanda CC0 saja | API (api.data.gov) | Ya, gratis |
| Situs resmi cabang (navy.mil, af.mil, army.mil, marines.mil, defense.gov) | Foto dan video rilis | Public domain. Sebagian besar juga ada di DVIDS | Situs | Tidak |

## Prioritas 2 — Pemerintah lain dengan lisensi terbuka

| Sumber | Isi | Lisensi | Status |
|---|---|---|---|
| **UK Defence Imagery** (defenceimagery.mod.uk) | Foto dan video MOD Inggris: Royal Navy, RAF, Army | Open Government Licence v3, boleh komersial dengan atribusi. **Tidak mencakup orang yang bisa dikenali** | Boleh, dengan syarat |
| **Kementerian Pertahanan Rusia** (mil.ru / function.mil.ru) | Foto dan video rilis resmi | CC BY 4.0 menurut catatan Wikimedia Commons | *perlu verifikasi*. Perhatikan konteks propaganda |
| **Kementerian Pertahanan Jepang / JMSDF / JASDF** | Foto kapal dan pesawat | Syarat penggunaan standar pemerintah Jepang (kompatibel CC BY) | *perlu verifikasi* |
| **Korea Selatan (KOGL)** | Foto militer resmi | Tergantung tipe KOGL: tipe 1 boleh komersial, tipe lain tidak | *perlu verifikasi per item* |
| **Bundesarchiv** (lewat Wikimedia Commons) | Foto sejarah Jerman | CC BY-SA 3.0 DE untuk foto yang didonasikan ke Commons | `share_alike`: hindari untuk footage utama |

## Prioritas 3 — Arsip campuran (cek per item)

| Sumber | Isi | Catatan |
|---|---|---|
| **Wikimedia Commons** | Banyak salinan media pemerintah, terkurasi per kategori (lihat halaman *Commons:Military-related image resources*) | Ikuti template lisensi per file. Bagus untuk menemukan sumber asli |
| **Internet Archive** (Prelinger dan koleksi pemerintah) | Film edukasi dan industri, film pelatihan militer lama | Banyak public domain, tapi status ditentukan per film. Kualitas sering rendah, cocok sebagai tekstur arsip |
| **Library of Congress** | Foto, film, dan peta sejarah | Banyak "no known restrictions". Cek per item |

## Prioritas 4 — Stok (hanya untuk suasana)

| Sumber | Pakai untuk | Jangan untuk | Key |
|---|---|---|---|
| Pexels | Laut, langit, kota, pabrik generik | Hardware spesifik (label sering salah) | Ya, gratis |
| Pixabay | Sama | Sama | Ya, gratis |

## Citra satelit dan data peta

| Sumber | Lisensi | Catatan |
|---|---|---|
| Landsat (USGS), NASA Worldview / Earth Observatory | Public domain | Resolusi sedang, bagus untuk wilayah |
| Copernicus Sentinel-1/-2 (data mentah) | Bebas, termasuk komersial, dengan atribusi | Atribusi "Contains modified Copernicus Sentinel data [tahun]" |
| Natural Earth | Public domain | Batas negara, garis pantai, relief |
| Copernicus DEM, SRTM | Bebas dengan atribusi | Terrain dan hillshade |
| Satelit komersial resolusi tinggi (Maxar, Planet, dll.) | Berbayar | Hanya dengan lisensi. Gambar yang beredar di berita tidak otomatis boleh dipakai |

## Tidak dipakai di channel yang dimonetisasi

| Sumber | Alasan |
|---|---|
| **NATO Multimedia** | Syaratnya melarang penggunaan komersial atau promosi |
| **ESA** (termasuk yang CC BY-SA IGO) | Penggunaan komersial butuh izin tertulis terpisah |
| **Imperial War Museum** | Akses gratis untuk non-komersial. Komersial wajib lisensi berbayar |
| Footage berita (TV, kantor berita) | Berhak cipta dan rawan Content ID. Hanya lewat lisensi, atau `fair_use_candidate` dengan persetujuan manusia per klip |
| Video YouTube atau media sosial orang lain | Berhak cipta. Hanya untuk *menemukan* sumber aslinya |
| Footage dari video game atau simulator | Berhak cipta dan menyesatkan sebagai bukti |

## API key yang dibutuhkan

| Key | Untuk | Cara dapat | Tahap |
|---|---|---|---|
| `DVIDS_API_KEY` | Pencarian dan metadata footage militer AS | Daftar di api.dvidshub.net | S0, S6 |
| `NARA_API_KEY` | Pencarian arsip nasional AS | Email ke Catalog_API@nara.gov | S6 |
| `SMITHSONIAN_API_KEY` | Open Access | api.data.gov | S6 (opsional) |
| `PEXELS_API_KEY` | Stok suasana | pexels.com/api | S6 |
| `PIXABAY_API_KEY` | Stok suasana | pixabay.com/api/docs | S6 |

Semua key disimpan di `.env`, tidak pernah di-commit, dan didaftarkan di `.env.example` tanpa nilai.
