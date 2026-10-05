# Genre Pack — Military

**Nama gaya:** Cinematic Military Engineering Documentary.

Dokumenter yang menjelaskan bagaimana sistem militer modern bekerja, dengan visual sinematik dan arsitektur informasi yang sangat jelas.

**Bukan:** channel sejarah militer, kompilasi footage perang, channel berita geopolitik, explainer stock footage, atau "AI military cinematic".

Nilai di file ini mengalahkan `_common`.

## Override parameter

| Parameter | `_common` | Military [v0.1] | Alasan |
|---|---|---|---|
| `01` §8 palet base | Natural | Steel gray, navy, ocean blue, desert tan, beton, hitam industri | Believable, tidak sinematik berlebihan |
| `01` §9 font | Grotesk/mono | Grotesk teknis (mis. Inter Tight, IBM Plex Sans Condensed) + mono untuk angka (IBM Plex Mono) | Rasa publikasi teknis. Final dikunci saat pilot |
| `03` §8 label | `RECONSTRUCTION` | `RECONSTRUCTION` untuk peristiwa atau hardware spesifik, `ILLUSTRATIVE` untuk skenario hipotetis | — |
| `03` §1 porsi `REAL`+`ARCHIVAL`+`NEWS` | 45–55% | 50–60% | Footage militer resmi berlimpah |
| `05` §1 porsi Flow | 5–15% | 5–12% | Akurasi hardware sulit dijaga |

## Arti warna di grafis

| Warna | Arti militer |
|---|---|
| Merah | Ancaman, pihak lawan, rudal datang |
| Kuning/amber | Peringatan, zona sengketa |
| Cyan | Sensor: radar, sonar, datalink |
| Putih | Pasukan atau aset sendiri yang netral, label |
| Hijau | Hanya untuk "berhasil/aman" (intersepsi berhasil). Jarang dipakai |

Kalau ada dua pihak, pakai **biru keabuan untuk pihak A** dan **merah untuk ancaman terhadap subjek**. Hindari warna bendera.

## Peta militer: lapisan standar

Block HyperFrames yang dibangun sekali dan dipakai ulang:

- `range-ring`: radius radar atau senjata, lingkaran mengembang dengan label jarak.
- `layered-defense`: cincin pertahanan berlapis (outer, middle, inner) di sekitar aset.
- `strike-group`: formasi kapal dengan ikon sederhana dan konsisten.
- `trajectory`: lintasan rudal atau pesawat tergambar dengan kecepatan relatif yang masuk akal.
- `patrol-zone`: area patroli atau CAP.
- `chokepoint`: selat atau titik sempit dengan rute yang melewatinya.

Ikon: siluet top-down sederhana, monokrom, dan proporsi relatif yang benar (kapal induk lebih besar dari destroyer). Tidak memakai simbol NATO APP-6 kecuali bagian itu memang membahas simbologi.

## Musik

Dominan: investigation, engineering pulse, scale, dan threat. Action hanya di act 6. Tidak ada drum trailer atau choir epik.

## Aturan khusus militer

1. **Tidak mengglorifikasi kekerasan.** Footage tempur nyata dipakai untuk menjelaskan, bukan sebagai tontonan. Tidak ada korban yang bisa dikenali.
2. **Tidak memihak tanpa sumber.** Klaim pihak yang berkonflik ditulis sebagai klaim, dengan atribusi.
3. **Konsep, bukan panduan.** Jelaskan prinsip (misalnya pertahanan berlapis, saturasi). Jangan menulis instruksi spesifik untuk mengalahkan sistem nyata, jangan menyusun koordinat atau celah operasional, dan jangan merangkai informasi sensitif menjadi panduan.
4. **Spesifikasi rahasia** selalu ditulis sebagai perkiraan, dengan sumber (`02` §5).
5. **Kontinuitas platform** dicek paling ketat: varian, negara, dan era harus cocok dengan VO (`03` §3).
6. **Insignia dan bendera** di footage resmi boleh tampil. Channel tidak boleh terlihat sebagai channel resmi militer mana pun.

## File terkait

- `SOURCES.md`: arsip footage militer dan status lisensinya.
- `HARDWARE_QC.md`: checklist akurasi hardware untuk shot Flow dan identifikasi footage.
