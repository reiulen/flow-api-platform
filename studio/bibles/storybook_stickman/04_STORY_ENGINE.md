# Story Engine: storybook stickman tanpa footage, tanpa gambar generate

Genre `storybook_stickman` (`styles/storybook_stickman.json`) tidak memakai Flow atau footage. Setiap shot adalah satu scene yang digambar HyperFrames dari kosakata tertutup (`core/story.js` → `motion/story/*.js`). Satu video = satu **kit** (wajah, baju, palet, tulisan tangan) yang unik, dan semua scene video itu memakai kit yang sama.

## Hasil bedah referensi (DISCIPLINE, animated short, 2:38)

| Aspek | Temuan | Dipakai di engine |
|---|---|---|
| Frame | Letterbox sinematik, latar hampir hitam, vignette, grain halus | `kit.bars`, vignette, grain 5% |
| Warna | Satu aksen jenuh (merah) di atas netral gelap. Hangat hanya muncul di momen balik (matahari terbit) | `palette.accent`, `time: dawn` hanya untuk titik balik |
| Karakter | Tubuh "bean" off-white, anggota gerak tebal bulat, kepala menyatu, alis dan mulut yang ekspresif (gigi menggertak, keringat), satu aksesori beraksen | rig di `hero.js`: gradasi 3 lapis, rim light aksen, 13 ekspresi, 25 pose |
| Garis | Bergetar seperti digambar tangan | filter displacement dengan seed berubah 8 fps |
| Struktur | Hari ditandai kecil di kiri atas: DAY 1, 47, 150, 365, lalu 3, 12, 64, 150, 270 | `tag`, naik tidak rapi |
| Kritikus batin | Siluet hitam dengan outline merah menyala, menunjuk tokoh | `shadow: true` |
| Teks | Hanya ±12 baris untuk 158 detik. Tuduhan huruf kecil bertulis tangan warna aksen, kalimat kecil putih di atas | `say` (tulis tangan, ditulis dari kiri ke kanan), `line` |
| Ritme | ±24 scene, rata-rata 6 detik. Hard cut. Frame putih saat pukulan kena | `shot_s` 3.2 sampai 6.8, transisi `cut`, `flash` |
| Alat cerita | Prop yang membawa makna: jam 5:00, kalender coretan X, samsak, tangga | 26 prop, argumen `calendar:12`, `alarm_clock:5:00` |
| Bingkai | Adegan pembuka dan penutup sama (kamar, alarm 5:00) tapi berubah | Act 6 membalik gambar Act 1 |
| Copy | Tuduhan, lalu pembalikan memakai kata yang sama: "Nobody is coming to save you. So save yourself." Penutup: "Day one, or one day. You decide." | aturan `editorial.rules` |

## Bedah kedua: ritme, suara, dan interaksi (frame per frame dan spektrum)

| Temuan di referensi | Angkanya | Dipakai di engine |
|---|---|---|
| Montase potong tepat di beat | 35 cut terdeteksi; di 0:30-0:39 dan 1:37-1:50 jaraknya 1,25 s (2 beat pada 96 bpm); 0:00-0:30 hampir tanpa cut | `montageCut(seed)`: 1,2 / 1,25 / 1,33 / 1,5 s, tiap video punya grid sendiri |
| Set-up kamera yang sama dipakai berulang | kamar+jam 5:00, sofa+hp, meja, kulkas, jalan, samsak, kalender, cermin, tangga; angka DAY loncat | `SETUPS` + `montageSpecs`: loop kegagalan (state low) dijawab loop kerja (state up) dengan bingkai yang sama |
| Close-up dan insert | jam alarm raksasa bertulis SNOOZE, tangan membanting tombol, wajah menggertak dengan "DAY 1." | `slam`, `zoom: close`, prop `clock_big`, `calendar` di tengah |
| Penanda keputusan | headband merah baru muncul setelah alarm dibanting | `kit.gearOnResolve`: aksesori hanya dipakai di scene setelah act `resolve_act` |
| Interaksi nyata | sarung tinju kena samsak, samsak berayun, bunga api; tangan meraih jam; huruf-huruf berhamburan di sekitar samsak; bayangan di cermin | timeline bersama (`timeline.js`), IK tangan, fx `letters`, refleksi di prop `mirror` |
| Musik satu lagu utuh | kunci A minor (A C E F G), warna Bb di bagian berat, selesai di C mayor; pulsa kick/hat mengikuti cut; klimaks 5 dB lebih keras (-20 jadi -15 dB RMS); roll tick yang makin cepat di 0:11-0:13 dan 2:00-2:02; hening sebelum fade | `core/score.js`: arc per act, kick di tiap cut montase, sidechain pada kick, tick roll di akhir act, level per act |
| SFX sedikit dan jelas | alarm 2,1 kHz di detik 5, selebihnya musik | `core/sfx.js`: hanya suara dari interaksi (alarm, banting, pukul, langkah, push-up, ketik), tanpa whoosh di tiap cut dan tanpa noise latar |
| Gaya gambar | perabot datar, garis tipis abu, tanpa bayangan jatuh, cut keras tanpa fade | tanpa drop-shadow, `montage_cut` = cut keras tanpa fade |

## Siapa memutuskan apa

| Keputusan | Pemutus |
|---|---|
| Scene apa untuk kalimat ini (env, pose, wajah, prop, teks) | LLM, memilih kata dari kosakata (`vocabText()`), dalam `storyVisualPrompt` |
| Kosakata sah, perbaikan jawaban salah, varian kalau jawaban gagal | `core/story.js` (`normalizeScene`, `sceneFromText`, `varyScenes`) |
| Wajah, baju, warna, font video ini | `buildKit(seed)`, seed = id project. Tidak ada dua video mirip (diuji 400 seed) |
| Durasi shot, potongan, bagian lanjutan scene | editor engine (`pushStory`, `partSpec`) |
| Gerak, kamera, tulisan, teks muncul | `motion/story/scene.js`, fungsi murni dari waktu |
| Gagal render | `storyFrameOk` mendeteksi frame kosong, shot digambar ulang sebagai `safeScene` |

## Anti-slop, ditegakkan kode

- Tidak ada em dash di teks layar (`clean()` mengganti jadi koma).
- Palet ungu/pink (hue 250 sampai 345) dilewati. Aksen tunggal per video.
- Dua scene bertetangga tidak boleh punya env+pose+prop yang sama; tiga scene berturut di ruangan yang sama dipaksa ganti waktu atau kamera.
- `say` maksimal 5 kata, `line` 12 kata, prop maksimal 3, fx maksimal 2.
- Angka penanda cerita (Day 47, 5:00) tidak butuh klaim. Angka lain tetap wajib bersumber.

## Menambah kosakata

1. Tambah gambar di `motion/story/` (pose di `hero.js`, env di `envs.js`, prop di `props.js`).
2. Tambah kata di `VOCAB` (`core/story.js`). Tes `every vocabulary word has a drawing in the rig` gagal kalau salah satunya tertinggal.
3. Cek visual: `node studio/scripts/story-sheet.js scratch/sheet seed poses|envs|props|faces`.

## Mengunci identitas channel

`style.story.kit` boleh mengunci bidang kit (contoh `{"hue": 20, "headgear": "headband", "bars": true}`) bila satu channel ingin satu tokoh tetap. Tanpa kunci, tiap video mendapat kit sendiri.

## Bedah ketiga: "Motivation Will Fail You" dan perbaikan v5

- Alat cerita baru yang diadaptasi, bukan disalin: **meter berjalan** di tengah atas (`MOTIVATION` turun lewat Act 2 sampai 4, lalu `HABIT` naik setelah titik balik). Dijalankan editor (`assignMeters`, `linkMeters` di `core/story.js`), bukan LLM, jadi konsisten di ratusan video. Label dipilih dari topik (`meterLabelFor`). `style.story.meter: false` mematikannya.
- Prop `chart_two`: satu garis spike lalu mati, satu garis kecil yang tidak berhenti, di atas garis GOAL. Dipakai sebagai sisipan Act 6.
- State montase `hype`: set-up yang sama dengan `up` (energik, bangun, lari) tetapi tanpa ikat kepala, karena ikat kepala hanya penanda keputusan.
- Kasur: ukuran kasur sesuai tokoh, selimut digambar per frame (napas, lutut menendang saat alarm, ditarik menutupi kepala atau dilempar), lengan meraih jam, lalu tokoh duduk (`lie_bed` ke `sit_bed` meluncur, tidak melompat). Meja: kepala bertumpu di lengan di atas meja.
- Gerak: boil garis (displacement 8 fps) dibuang dari tokoh dan hanya tersisa satu wobble beku di perabot; pergantian tempat (berbaring, duduk, berdiri) diinterpolasi; kamera dijepit supaya tidak pernah menampilkan area di luar set.
- Contoh film: `studio/scripts/examples/day-eight.json`.

## Format panjang (8 menit), twist, dan akhir bahagia

- Genre ini sekarang default 8 menit (`default_minutes` di style; CLI `--minutes` tetap menang). Contoh film 8 menit: `studio/scripts/examples/day-eight-long.json` (128 shot, dibangun dengan `story-demo.js`; `--stills <dir>` memotret satu frame per scene supaya film panjang bisa dilihat sebelum dirender).
- Twist tetap satu per film dan dijalankan kode (`assignTwist`): setelah penuduh (`shadow`) muncul di Act 2 sampai 4, tiga scene tunggal pertama di Act 5 menampilkan penuduh dekat (`near`), kecil (`child`), lalu berubah warna jadi kembaran tokoh (`ally`). Sesudahnya kembaran berjalan di samping tokoh di semua scene lantai (`ally_follow`). Ceritanya: suara yang menuduh dia malas adalah bagian dirinya yang tidak pernah menyerah (yang masih menyalakan alarm).
- Akhir bahagia: Act 6 adalah bagian paling keras dan paling terang (mayor, kepadatan penuh, level 0.98); Act 5 pindah dari phrygian ke dorian supaya putarannya terdengar.
- Tengah film harus panjang dan spesifik: minimal empat kemunduran di tempat atau jam berbeda (hujan, lembur, sofa, minggu yang terlewat, tahun yang terlewat). Aturan ini ada di `editorial.rules`.

## Bedah keempat: kenapa v7 terasa membosankan (diukur, bukan perasaan)

Dibandingkan dengan "Motivation Will Fail You" (diukur frame demi frame):

| ukuran | referensi | v7 | v8 |
|---|---|---|---|
| energi gerak per frame (di luar cut) | 3,26 | 1,10 | 2,79 |
| potongan per menit | 27 | 27 | 27 |
| saturasi rata-rata | 0,34 | 0,31 | naik, dan mengikuti meter |

Jadi masalahnya bukan jumlah potongan atau warna rata-rata. Masalahnya: tokoh kecil dan diam di ruangan gelap, kamera statis, caption panjang di setiap shot, musik sintetis yang datar. Yang diubah:

- **Mood `vivid`** (default 62%): langit navy dengan jendela menyala, dusk ungu-oranye, dawn peach; gedung tiga lapis dengan parallax. Warna ikut meter: saat motivasi habis dunia jadi abu-abu, saat HABIT naik warna kembali.
- **Aura emas dan percikan** di sekitar tokoh, kekuatannya mengikuti meter (sama seperti referensi).
- **Tokoh besar** (zoom `mid` default), kamera selalu bergerak (sway, punch-in tiap cut, denyut di beat musik), background parallax.
- **Teks:** DAY besar di tengah atas, meter di bawahnya, caption pendek di bawah (maksimal sekitar tujuh kata, tidak di setiap shot).
- **Musik asli berlisensi per act** (`core/music-plan.js`, `core/music-bed.js`): satu lagu per act dari `library/music`, dipotong di bar yang sesuai beat-nya, di-crossfade, loudness disamakan. Tempo yang terukur stabil dipakai menentukan panjang cut montase (dua beat), sehingga gambar dipotong tepat di beat. Act 6 memakai kembali lagu Act 2 (callback). Lapisan ritme sintetis (kick di cut, tick roll, riser, impact di awal Act 5 dan 6) ditumpuk di atasnya. Kredit CC BY otomatis masuk ke deskripsi.

## Bedah kelima: tenang (v13)

Ukuran dari DISCIPLINE dan DOPAMINE (bukan Motivation Will Fail You, yang memang lebih ramai):
gerak global antar frame hampir nol (still_ratio 0,91–0,98, jitter p90 = 0), perubahan piksel 0,8–1,9 %.
Versi sebelumnya (punch-in tiap cut, denyut di beat, shake saat pukulan, flash putih, dip hitam tiap cut, grain 12 fps) memberi jitter p90 2,2 px dan terasa bergetar.

Aturan sekarang (kode, bukan prompt):
- Kamera: satu dorongan pelan (maks 4 %), tanpa denyut beat, tanpa shake, tanpa flash per pukulan. Zoom `wide` default, `mid` 1,12, `close` 1,4; zoom selalu dibatasi isi frame (tokoh, prop, kasur) dan tidak ada letterbox.
- Antar scene: hard cut. Fade hanya untuk judul.
- Musik: hanya trek berlisensi, tanpa kick/riser/impact buatan. Dua trek tenang per film (act 1–3 dan act 4–6), diputar tanpa putus di act yang berbagi trek, ganti trek sekali di titik terendah.
- SFX: hanya bunyi yang bagian dari cerita (alarm, banting, pukulan, langkah, ketikan, notifikasi), semuanya pelan di bawah musik.
- Label hari berurutan naik; tidak boleh mundur.
