# 07 — QC System

Delapan QC pass setelah rough cut. Setiap pass ditandai **otomatis** (bisa dicek mesin dengan aturan pasti), **agent** (dinilai model berdasarkan bible), atau **manusia** (tidak bisa didelegasikan).

Hasilnya ditulis ke `qc_report.json` (lihat `08`). Video baru boleh ke final cut kalau tidak ada temuan `blocker`.

## Tingkat temuan

| Level | Arti |
|---|---|
| `blocker` | Wajib diperbaiki sebelum publikasi |
| `major` | Seharusnya diperbaiki. Kalau tidak, manusia wajib menyetujui pengecualiannya |
| `minor` | Catatan untuk revisi berikutnya |

## Pass 1 — Fakta (agent + manusia)

- Setiap klaim di script punya `claim_id` yang ada di `research.json`. **Otomatis**, blocker kalau tidak ada.
- Angka penting memenuhi aturan sumber di `02` §5. **Agent**.
- Kata di narasi sesuai tingkat keyakinan (`reported` → "reportedly", dan seterusnya). **Agent**.
- Manusia memeriksa sampel 10 klaim terpenting.

## Pass 2 — Akurasi visual (agent + manusia)

- Platform/varian di metadata shot sama dengan yang disebut VO. **Otomatis** dari `shotlist.json`, blocker kalau beda.
- Shot `FLOW` lolos `HARDWARE_QC` genre. **Agent** (dari frame sampel) **+ manusia**.
- Footage `unverified` tidak dipakai saat VO menyebut platform spesifik. **Otomatis**.

## Pass 3 — Cerita (agent + manusia)

- Central question muncul di 60 detik pertama dan dijawab di act 7. **Agent**.
- Setiap act berakhir dengan dorongan ke act berikutnya. **Agent**.
- Tidak ada bagian lebih dari 2 menit tanpa informasi baru. **Agent**.
- Manusia: "Apakah ada bagian di mana gue mulai bosan?" Dicatat dengan timestamp.

## Pass 4 — Pacing (otomatis)

Dihitung dari EDL final dengan tools yang sama seperti `references/tools/`:

| Cek | Batas [v0.1] | Level |
|---|---|---|
| ASL keseluruhan | 7–10 dtk | major |
| % waktu di shot < 3 dtk | ≤ 8% | major |
| Shot statis tanpa perubahan | ≤ 6 dtk | major |
| Shot explainer tanpa perubahan internal | ≤ 6 dtk tanpa perubahan | major |
| `I` berturut-turut | ≤ 4 | major |
| Blok density high tanpa `R`/`C` | ≤ 90 dtk | major |
| Rasio transisi per mode | Sesuai `01` §6 | minor |
| Black beat | 3–6 | minor |
| Porsi tipe visual | Sesuai `03` §1 | major |
| Porsi `FLOW` | ≤ 15% | blocker kalau > 20% |

## Pass 5 — Relevansi footage (agent)

- Setiap shot punya alasan untuk ada (`purpose` + `vo_ref`).
- Tidak ada visual yang sekadar mengulang kata benda di VO.
- Setiap rangkaian punya progresi (`03` §3).
- Tidak ada shot yang sama dipakai lebih dari sekali dalam 10 menit, kecuali sebagai motif yang disengaja.

## Pass 6 — Deteksi rasa AI (manusia, dibantu agent)

Agent membuat daftar kandidat dan manusia memutuskan.

- Shot `FLOW` dengan artefak, kesempurnaan berlebihan, atau gaya blockbuster.
- Narasi dengan klise AI (`02` §4).
- Grafis generik atau dekoratif.
- Pola "VO → stock → zoom → stock" yang berulang.

**Pertanyaan manusia:** "Ada shot yang langsung terasa AI?"

## Pass 7 — Audio (otomatis + manusia)

| Cek | Batas | Cara |
|---|---|---|
| Integrated loudness | −14 ±1 LUFS | Otomatis (ebur128) |
| True peak | ≤ −1 dBTP | Otomatis |
| LRA | 4–7 LU | Otomatis |
| Narasi (% durasi) | 80–88% | Otomatis (VAD) |
| Jeda ≥ 1 dtk | 2–4 per menit | Otomatis (VAD) |
| Cakupan musik | ≤ 75% | Otomatis dari timeline audio |
| Breathing room ≥ 3 dtk | Minimal 1 per 4 menit | Otomatis (VAD) |
| VO selalu jelas, tidak tertutup musik | — | Manusia |
| Kenyamanan setelah 10+ menit | — | Manusia |

## Pass 8 — Selera manusia (manusia)

Pertanyaan terakhir:

> **"Apakah ini terasa seperti editor manusia yang sengaja memilih setiap shot?"**

Kalau jawabannya tidak, video direvisi. Catatan manusia di pass ini dipakai untuk memperbarui bible (`01`–`06`) setelah setiap video.

## Setelah setiap video

1. Ukur video final dengan `references/tools/` dan simpan metriknya.
2. Bandingkan metrik dengan feedback manusia, lalu sesuaikan parameter [v0.1] yang terbukti salah.
3. Catat perubahan bible di `CHANGELOG` bagian bawah file yang diubah.
