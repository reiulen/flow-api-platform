# 05 — Flow Prompt System

Cara merancang shot `FLOW`: dari spesifikasi shot, ke prompt, ke generate, sampai QC.

## 1. Kapan memakai Flow

Flow dipakai **hanya** kalau:

1. tidak ada real footage yang sah dan relevan (lihat urutan di `03` §2), atau
2. momen itu tidak mungkin difilmkan (misalnya rudal mendekati kapal, atau interior sistem), atau
3. butuh establishing shot sinematik yang nggak punya padanan footage (siluet di laut saat fajar).

Batas porsi: **5–15% durasi** [v0.1]. Kalau shot plan melewati 15%, tahap Visual Director wajib menulis alasannya dan G3 harus menyetujuinya.

## 2. Arah gaya: realisme dokumenter, bukan blockbuster

Kalau semua shot Flow punya cahaya sempurna, kamera sempurna, asap sempurna, simetri sempurna, dan fisika yang mustahil, penonton akan sadar itu AI.

Yang kita minta:

- Cahaya natural (mendung, fajar, siang yang datar). Bukan golden hour setiap shot.
- Kamera stabil dan pelan, seperti diambil dari kapal pendamping, helikopter, atau tripod.
- Kabut atmosfer, jarak, dan skala yang wajar.
- Ledakan, asap, dan api ditahan: kecil, jauh, atau tidak ada sama sekali.
- Komposisi sederhana dengan banyak ruang kosong.

## 3. Spesifikasi shot

Setiap shot Flow dimulai sebagai `flow_spec` di `shotlist.json` (lihat `08`). Prompt dirakit dari spesifikasi, tidak pernah ditulis bebas.

```yaml
shot_id: CAR01-A1-003
purpose: Visualize the carrier's scale and isolation before any explanation.
mode: CINEMATIC
reconstruction: true          # menggambarkan hardware nyata → label RECONSTRUCTION
subject: Modern nuclear-powered aircraft carrier, flat flight deck, island on starboard side
subject_constraints:          # dari genre HARDWARE_QC
  - single island superstructure on the right (starboard) side
  - angled landing area on the port side
  - no weapons firing
composition: Carrier occupies the central third of frame, large negative space of ocean around it
camera: ~1 m above sea level, long lens compression, extremely slow lateral tracking
lighting: Overcast early morning, soft natural light, light sea haze
motion: Ship moving slowly forward, realistic wake, gentle ocean swell
duration_s: 8
mood: imposing, controlled, serious
avoid: [explosions, fantasy weapons, exaggerated smoke, impossible geometry, text, HUD, lens flare, oversaturation]
references: []                # asset_id foto referensi kalau ada (mode ingredients)
```

## 4. Template prompt

Prompt dirakit dari spesifikasi dalam urutan tetap, dalam bahasa Inggris:

```
{duration}-second documentary {reconstruction ? "reconstruction" : "establishing shot"}.

{subject}. {subject_constraints as sentences}.

Composition: {composition}.
Camera: {camera}.
Lighting: {lighting}.
Motion: {motion}.

Natural military documentary cinematography. Photorealistic, restrained, serious.
{mood}.

Avoid: {avoid joined}.
```

Contoh hasil:

```
8-second documentary reconstruction.

A modern nuclear-powered aircraft carrier with a flat flight deck moving slowly through
open ocean. A single island superstructure sits on the right side of the deck. An angled
landing area runs along the left side. No weapons are firing.

Composition: the carrier occupies only the central third of the frame, surrounded by
large empty ocean.
Camera: positioned about one meter above sea level, long-lens compression, extremely slow
lateral tracking, completely stable.
Lighting: overcast early morning, soft natural light, subtle sea haze.
Motion: the ship moves slowly forward with a realistic wake and gentle ocean swell.

Natural military documentary cinematography. Photorealistic, restrained, serious.
The ship should feel enormous because of its relationship to the surrounding ocean,
not because of exaggerated perspective.

Avoid: explosions, fantasy weapons, exaggerated smoke, impossible ship geometry, text,
HUD overlays, lens flares, oversaturated colors.
```

## 5. Parameter Flow API

Dipetakan ke `POST /v1/videos` (skema `VideoInput` di `src/schemas.js`):

| Field spec | Field API | Default kita |
|---|---|---|
| prompt hasil rakitan | `prompt` | — |
| — | `aspectRatio` | `16:9` |
| — | `resolution` | `1080p` untuk shot final, `720p` untuk eksplorasi |
| `duration_s` | `duration` | 8 |
| `references` | `references` (maks 7) + `mode: "ingredients"` | `mode: "frames"` kalau tanpa referensi |
| start/end frame | `startImage`, `endImage` | Untuk kontinuitas antar shot |
| — | `count` | 2 (dua variasi per shot, pilih yang terbaik) |
| `shot_id` + versi | header `Idempotency-Key` | `CAR01-A1-003:v1` |
| proyek | `projectKey` | `<project_id>` |

## 6. Kontinuitas antar shot

- Satu subjek hardware dipakai di beberapa shot Flow → siapkan **1–3 gambar referensi** (foto resmi public domain atau frame generated yang sudah lolos QC), lalu pakai `mode: ingredients`.
- Shot yang harus nyambung → frame terakhir shot A dipakai sebagai `startImage` shot B.
- Cahaya, cuaca, dan waktu dalam satu sequence harus sama dan dicatat di `sequence_look` di shot plan.

## 7. QC hasil Flow

Alurnya: **generate → QC visual → approve/reject**. Hasil generate tidak pernah langsung masuk timeline.

| Cek | Gagal kalau |
|---|---|
| Akurasi hardware | Melanggar `subject_constraints` atau checklist `HARDWARE_QC.md` genre |
| Fisika | Objek berubah bentuk, menembus, melayang, skala tidak masuk akal |
| Artefak AI | Teks atau angka kacau, tangan atau wajah rusak, tekstur meleleh, kedipan |
| Gaya | Terlalu "film", terlalu saturasi, ledakan berlebihan, kamera goyang palsu |
| Durasi yang bisa dipakai | Bagian bersih kurang dari durasi yang dibutuhkan shot |

Hasil QC ditulis di `flow_results.json`: `approved`, `approved_with_trim` (beserta rentang in/out), atau `rejected` (beserta alasan).

Batas regenerate: maks **3 putaran per shot**. Setelah itu shot diganti tipe visualnya (`TECH`, `MAP`, atau footage lain) atau dibawa ke manusia.

Supaya putaran tidak terbuang:

- **Ciri platform sebelum generate pertama.** Shot yang menyebut platform tapi belum punya `subject_constraints` (misalnya shot footage yang jatuh ke Flow) mendapat 2–5 ciri pembeda platform itu (jumlah dan letak mesin, bentuk ekor, sisi island, dan sebagainya), ditulis sekali dengan bantuan checklist genre lalu disimpan di `assets/platform-constraints.json`. Video berikutnya memakai ciri yang sama, jadi penggambaran hardware konsisten di seluruh channel.
- **Retry membawa koreksi.** Masalah yang ditemukan QC pada percobaan yang ditolak dimasukkan ke prompt percobaan berikutnya ("The previous attempt was rejected. It must not happen again: ..."), jadi retry bukan lemparan dadu yang sama.

## 8. Budget

Setiap proyek mencatat `flow_budget` di `brief.json`:

- jumlah shot Flow yang direncanakan,
- maks generate (shot × count × putaran),
- kredit yang terpakai (dari `/v1/credits`).

Pilot dipakai untuk mengukur rasio reject yang sebenarnya, lalu angka budget dikunci.
