# 06 — Audio Bible

Separuh rasa sinematik datang dari audio. Dokumen ini mengatur VO, musik, ambience, SFX, silence, dan mixing.

## 1. Lima layer

| Layer | Isi | Peran |
|---|---|---|
| 1. VO | Narasi | Utama. Selalu jelas |
| 2. Musik | Bed dan cue | Emosi. Tidak boleh terus menyala |
| 3. Ambience | Laut, angin, hangar, pabrik, room tone, dengung mesin | Membuat visual terasa nyata |
| 4. SFX | Pesawat, mekanik, radar, pintu, switch | Detail realis, subtle |
| 5. Accent | Impact pelan, low boom, riser, pulse elektronik | Menandai beat penting. Jarang dipakai |

## 2. Voice over

### Suara

- Narator dokumenter: tenang, cerdas, yakin. Tidak terlalu announcer, tidak terlalu bersemangat.
- Opsi produksi, berurutan dari yang terbaik: rekaman manusia → voice clone berkualitas tinggi yang sudah diuji → TTS terbaik yang tersedia.
- TTS wajib lolos tes dengar 3 menit tanpa terasa capek sebelum dipakai untuk video penuh.

### Dinamika

Dinamika datang dari **performa**, bukan dari menurunkan volume:

- `[TONE: quiet]`: lebih pelan dan intim. Level hasil mix tetap terjaga.
- `[TONE: firm]`: lebih tegas untuk pernyataan penting.
- Jeda (`[PAUSE]`, `[BEAT]`) adalah alat dinamika utama.

Level VO dijaga konsisten dengan kompresi ringan (`audio.vo_chain`: highpass 70 Hz, kompresor 2:1). Penonton tidak boleh harus menaikkan atau menurunkan volume.

Jeda dari script (`[PAUSE]`, `[BEAT]`) dikirim ke Inworld sebagai tag `<break time="…s" />`, yang benar-benar menghasilkan jeda (diukur: 1,5 dtk → ±2 dtk hening). Teks `...` hanya memberi ±0,7 dtk, jadi tidak dipakai untuk engine yang mendukung tag break.

Narasi dikirim per ±90 dtk (beberapa segmen sekaligus) lalu dipotong lagi per segmen. Di antara segmen dipasang break 3,0 dtk (±3,5 dtk hening), lebih panjang dari jeda mana pun di script, jadi titik potong ditemukan dari audio saja, bukan dari tebakan posisi kata (yang meleset pada kalimat penuh angka seperti "60-0061" atau "APQ-188"). Jeda di akhir segmen dilebur ke break itu lalu dikembalikan ke ujung segmen setelah dipotong, jadi `[BEAT]` penutup tidak hilang. Diuji di run B-52: dengan cara lama 7 dari 17 potongan gagal dipotong; potongan tersulit dengan cara baru terpotong bersih dan ditranskripsi ulang persis sesuai teksnya.

Narasi dikirim per ±90 dtk (beberapa segmen sekaligus) lalu dipotong lagi per segmen. Di antara segmen dipasang break 3,0 dtk (±3,5 dtk hening), lebih panjang dari jeda mana pun di script, jadi titik potong ditemukan dari audio saja, bukan dari tebakan posisi kata (yang meleset pada kalimat penuh angka seperti "60-0061" atau "APQ-188"). Jeda di akhir segmen dilebur ke break itu lalu dikembalikan ke ujung segmen setelah dipotong, jadi `[BEAT]` penutup tidak hilang. Diuji di run B-52: dengan cara lama 7 dari 17 potongan gagal dipotong; potongan tersulit dengan cara baru terpotong bersih dan ditranskripsi ulang persis sesuai teksnya.

### Target ritme [v0.1]

Lihat `02` §4: narasi 80–88% durasi, jeda ≥ 1 dtk 2–4 per menit, dan narasi tanpa jeda maks 30 dtk.

## 3. Musik

### Peta cue

Musik dirancang per act sebagai daftar cue, bukan satu lagu panjang.

| Fungsi | Karakter |
|---|---|
| Investigation | Low drone, sparse |
| Engineering | Pulse halus, ritmis, tidak mengganggu VO |
| Scale | Ambient orkestral, luas |
| Threat | Ketegangan frekuensi rendah |
| Action | Perkusi terkendali, **bukan** trailer bombastis |
| Ending | Ambient, piano minimal, atmosferik |

### Library saat ini

12 track Kevin MacLeod (incompetech.com), CC BY 4.0, dua per fungsi, dipilih dari deskripsi komposer lalu diaudisi oleh model audio sebagai music supervisor ("apakah bersaing dengan narasi?"). Semua lolos 4–5/5. Mars dan himne Air Force Band yang dulu ada di library dinilai 1/5 dan dikeluarkan dari `index.json` (file masih ada di disk).

| Fungsi | Track |
|---|---|
| Investigation | Echoes of Time v2, Ossuary 6 – Air |
| Scale | Lost Time, Crusade – Heavy Industry |
| Engineering | Rising Tide, Half Mystery |
| Threat | Stay the Course, Drums of the Deep |
| Action | The Descent, Stormfront |
| Ending | Floating Cities, Metaphysik |

CC BY mewajibkan kredit. Kredit ditulis otomatis ke `credits.json` dan deskripsi YouTube dari field `credit` dan `license` di `library/music/index.json`. Musik di-highpass 40 Hz karena beberapa drone punya rumble sub-bass.

### Aturan [v0.1]

| Parameter | Nilai |
|---|---|
| Cakupan musik | Maks 75% durasi |
| Bagian tanpa musik (VO + ambience saja) | Minimal 1 per 5 menit, 20–60 dtk |
| Level bed di bawah VO | −20 sampai −26 dB relatif ke VO, diukur seperti referensi: median RMS di jeda pendek (0,3–1,5 dtk) yang ada musiknya (referensi: −23/−24). Semua sumber disamakan dulu ke −20 LUFS; setelan `bed_db_rel_vo` −16 LU menghasilkan sekitar −25 dB dengan ukuran ini. Cek dengan `studio calibrate <project>` |
| Bed saat breathing room tanpa VO | Naik 6–10 dB dari level bed |
| Pergantian cue | Di pergantian scene atau beat, bukan di tengah kalimat |
| Lagu dengan vokal | Tidak dipakai di bawah VO |
| Carve untuk VO | Musik diberi EQ dip di sekitar 2,8 kHz (−4 dB) dan 250 Hz (`audio.music_eq`), supaya vokal tidak tertutup tanpa harus menurunkan bed |
| Pilihan track | Diacak deterministik per proyek di antara track dengan fungsi yang sama, jadi setiap video tidak memakai cue yang sama persis |

Contoh alur musik:

```
00:00 musik masuk
01:10 musik turun
01:30 ambience saja
01:50 musik kembali
03:20 tension
04:00 silence
04:03 hard cut
```

### Lisensi musik

- Musik harus berlisensi untuk YouTube yang dimonetisasi (library berlisensi atau komposisi sendiri).
- Musik generated hanya boleh dari layanan yang memberi hak komersial yang jelas.
- Setiap track dicatat di `credits.json`.

## 4. Ambience

- Setiap shot `REAL` dan `FLOW` punya ambience, kecuali di momen silence yang disengaja.
- Ambience dari footage asli dipakai kalau bersih. Kalau tidak, ganti dengan ambience library yang cocok.
- **Natural sound** (`audio.nat_sound`): audio asli setiap klip REAL/ARCHIVAL diletakkan persis di bawah klipnya, disamakan ke −20 LUFS (dibatasi −18/+9 dB), diberi fade pendek di setiap cut, lalu di-duck: `nat_db_rel_vo` (−24 dB) di bawah VO, `nat_gap_db` (−9 dB) di cold open, breathing room, dan act break. Footage FLOW tidak memakai audionya.
- Ambience disambung lewat crossfade antar shot di lokasi yang sama, supaya tidak putus setiap cut.

## 5. SFX

Subtle dan realis:

| Visual | SFX | Bukan |
|---|---|---|
| Radar | Tick halus | BEEP BEEP BEEP |
| Peta bergerak | Gerakan digital yang sangat halus | Whoosh |
| Pesawat | Audio pesawat asli kalau tersedia | Jet generik yang keras |
| Kapal | Dengung mekanik rendah | — |
| Garis atau lintasan tergambar | Tone naik yang sangat halus | Laser |

Aturan:

- **Tidak ada whoosh di setiap cut.**
- SFX accent (impact, boom, riser) maks sekitar 1 per menit, dan hanya di beat yang memang penting.

## 6. Silence

Silence adalah alat, bukan kesalahan.

| Jenis | Durasi | Kapan |
|---|---|---|
| Silence beat | 0.5–3 dtk | Setelah kalimat kunci ("And that's where the problem begins." → musik hilang → 1 dtk → cut) |
| Breathing room | ≥ 3 dtk tanpa VO, dengan ambience atau musik | Minimal 1 per 3–4 menit, dan di setiap pergantian act |
| Cold open | 8–20 dtk tanpa VO | Opening (opsional) |

## 7. Mixing dan loudness

| Parameter | Target |
|---|---|
| Integrated loudness master | −14 LUFS (±1) |
| True peak | ≤ −1 dBTP |
| Loudness range (LRA) | 4–7 LU (Saudi 2.2 terlalu datar, Finland 6.7) |
| VO | Selalu lebih dominan dari semua layer lain saat bicara |
| Ducking musik saat VO masuk | Attack 150–300 ms, release 400–800 ms |

Mixing dilakukan di HyperFrames audio (`hyperframes-audio`), lalu master dan pengukuran loudness lewat ffmpeg. Hasil pengukuran ditulis ke `qc_report.json`.
