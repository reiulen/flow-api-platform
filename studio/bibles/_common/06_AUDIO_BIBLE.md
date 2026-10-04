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

Level VO dijaga konsisten dengan kompresi ringan. Penonton tidak boleh harus menaikkan atau menurunkan volume.

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

### Aturan [v0.1]

| Parameter | Nilai |
|---|---|
| Cakupan musik | Maks 75% durasi |
| Bagian tanpa musik (VO + ambience saja) | Minimal 1 per 5 menit, 20–60 dtk |
| Level bed di bawah VO | −20 sampai −26 dB relatif ke VO (referensi: −23/−24) |
| Bed saat breathing room tanpa VO | Naik 6–10 dB dari level bed |
| Pergantian cue | Di pergantian scene atau beat, bukan di tengah kalimat |
| Lagu dengan vokal | Tidak dipakai di bawah VO |

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
