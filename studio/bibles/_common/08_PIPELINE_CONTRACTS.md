# 08 — Pipeline Contracts

Tahap-tahap pipeline, human gate, dan format data antar tahap. Setiap tahap hanya membaca file dari tahap sebelumnya dan menulis file miliknya sendiri. Dengan begitu tahap bisa diulang, diganti, atau dikerjakan manual tanpa merusak tahap lain.

Kontrak ini diimplementasikan sebagai skema zod di `studio/core/contracts.js`, dan urutan tahapnya di `studio/core/pipeline.js`. Kalau dokumen dan kode berbeda, **kode yang benar** dan dokumen ini wajib diperbarui. Nama file di implementasi: `visual_beats.json` (S5a), `shotlist.plan.json` (S5b), `asset_plan.json` + `shotlist.assets.json` + `asset_report.json` (S6), `shotlist.flow.json` + `flow_results.json` (S8), `shotlist.final.json` (S9), `render.json` (S11).

## 1. Alur

```
S0  Topic Scout        → topics.json
G1  ── manusia memilih topik ──
S1  Deep Research      → research.json
S2  Story Architect    → outline.json
S3  Scriptwriter       → script.json
G2  ── manusia menyetujui script ──
S4  Voice              → vo/ + vo_timing.json
S5  Visual Director    → shotlist.json
S6  Asset Researcher   → asset_candidates.json (+ database aset)
S7  Flow Director      → flow_specs.json
G3  ── manusia menyetujui shot plan ──
S8  Generate           → flow_results.json (+ file Flow)
S9  Motion Builder     → motion/ (komposisi HyperFrames + render)
S10 Editor             → edl.json + audio_plan.json
S11 Rough Cut Render   → renders/rough_vN.mp4
S12 QC                 → qc_report.json
G4  ── manusia me-review rough cut ──
S13 Revision           → kembali ke tahap yang relevan
S14 Final              → renders/final.mp4 + credits.json + upload.json
```

Kenapa VO dibuat sebelum shot plan: durasi setiap kalimat VO menentukan durasi shot. Shot plan yang dibuat sebelum VO pasti meleset.

## 2. Struktur folder proyek

```
studio/projects/<project_id>/
  brief.json
  topics.json
  research.json
  outline.json
  script.json
  vo/            narasi per paragraf (wav) + vo_full.wav
  vo_timing.json
  shotlist.json
  asset_candidates.json
  flow_specs.json
  flow_results.json
  motion/
  edl.json
  audio_plan.json
  renders/
  qc_report.json
  credits.json
  gates.json     log keputusan manusia
```

`project_id`: `<GENRE>-<slug>-<yyyymmdd>`, misalnya `MIL-carrier-survivability-20261004`.

## 3. Human gate

| Gate | Setelah | Manusia memutuskan | Ditulis ke |
|---|---|---|---|
| G1 | S0 | Topik mana yang dikerjakan | `gates.json` + `brief.json` |
| G2 | S3 | Script disetujui, atau direvisi dengan catatan | `gates.json` |
| G3 | S7 | Shot plan, porsi Flow, dan budget disetujui | `gates.json` |
| G4 | S12 | Rough cut disetujui, atau direvisi dengan catatan bertimestamp | `gates.json` |

Format entri `gates.json`:

```json
{ "gate": "G2", "decision": "revise", "by": "rei", "at": "2026-10-05T09:12:00Z",
  "notes": [{ "ref": "S-04-03", "note": "Paragraf ini terlalu panjang, pecah jadi dua" }] }
```

`decision`: `approve` · `revise` · `reject`.

## 4. Kontrak per tahap

### brief.json

```json
{
  "project_id": "MIL-carrier-survivability-20261004",
  "genre": "military",
  "title_working": "Why Aircraft Carriers Are So Hard to Sink",
  "central_question": "How can a ship worth tens of billions survive when everyone knows where it is?",
  "target_duration_min": 25,
  "language": "en",
  "audience_notes": "General audience interested in defense; no prior knowledge assumed",
  "overrides": [{ "param": "01.6.transitions", "value": "...", "reason": "..." }],
  "flow_budget": { "planned_shots": 20, "max_generations": 120 },
  "sponsor_slot": null
}
```

### topics.json (S0)

```json
{
  "generated_at": "2026-10-04T08:00:00Z",
  "candidates": [{
    "topic_id": "T-001",
    "title": "Why Aircraft Carriers Are So Hard to Sink",
    "central_question": "...",
    "angle": "Survivability is a layered system, not armor",
    "scores": { "contradiction": 5, "mechanism": 5, "footage": 5, "sources": 4,
                "relevance": 4, "visualization": 5, "risk": 2 },
    "footage_evidence": ["DVIDS: 1,200+ carrier flight ops videos (query: 'flight operations CVN')"],
    "key_sources": ["CRS report RL32665 (Navy Force Structure)"],
    "risks": ["Avoid specifics that read as targeting guidance"]
  }]
}
```

Skor mengikuti `02` §1. `footage_evidence` wajib berisi bukti pencarian nyata, bukan perkiraan.

### research.json (S1)

```json
{
  "sources": [{
    "source_id": "SRC-014",
    "tier": 1,
    "title": "...",
    "publisher": "Congressional Research Service",
    "url": "https://...",
    "date": "2025-03-12",
    "accessed": "2026-10-04",
    "notes": "..."
  }],
  "claims": [{
    "claim_id": "C-031",
    "text": "The Ford-class carrier is about 1,106 feet (337 m) long.",
    "value": { "number": 337, "unit": "m" },
    "sources": ["SRC-002"],
    "confidence": "confirmed",
    "context": "Length overall; Nimitz-class is ~1,092 ft",
    "conflicts": []
  }],
  "chronology": [{ "date": "2017-07-22", "event": "...", "sources": ["SRC-005"] }],
  "open_questions": ["Exact CIWS count per hull varies by refit"]
}
```

`confidence`: `confirmed` · `reported` · `estimated` · `disputed` (lihat `02` §5).

### outline.json (S2)

```json
{
  "central_question": "...",
  "answer": "Survivability comes from layered distance, not from being hard to hit.",
  "acts": [{
    "act": 1,
    "name": "Hook",
    "target_s": 80,
    "goal": "Establish the contradiction",
    "beats": [{ "beat_id": "B-01-01", "summary": "...", "claims": ["C-001"], "mode": "CINEMATIC" }],
    "exit_tension": "If it's so easy to find, why hasn't anyone sunk one?"
  }]
}
```

### script.json (S3)

```json
{
  "version": 3,
  "words": 3250,
  "est_duration_s": 1460,
  "segments": [{
    "seg_id": "S-01-03",
    "act": 1,
    "beat_id": "B-01-01",
    "text": "It is enormous. [PAUSE 0.6] Its position can be tracked. [BEAT] And yet, for decades, navies have kept building them.",
    "claims": ["C-004", "C-005"],
    "tone": "quiet",
    "purpose": "C",
    "density": "low",
    "pron": [{ "word": "Bab-el-Mandeb", "say": "bahb el MAN-deb" }]
  }]
}
```

Markup di `text` mengikuti `02` §4. Setiap kalimat faktual wajib punya `claims`.

### vo_timing.json (S4)

```json
{
  "voice": { "kind": "tts|human|clone", "id": "..." },
  "segments": [{
    "seg_id": "S-01-03",
    "file": "vo/S-01-03.wav",
    "start_s": 41.20,
    "end_s": 49.85,
    "words": [{ "w": "It", "s": 41.20, "e": 41.31 }]
  }],
  "total_s": 1462.4
}
```

Timing per kata didapat dari TTS (kalau tersedia) atau forced alignment.

### shotlist.json (S5)

```json
{
  "sequences": [{
    "seq_id": "Q-01-02",
    "act": 1,
    "sequence_look": "overcast dawn, open ocean",
    "shots": [{
      "shot_id": "CAR01-A1-003",
      "seg_refs": ["S-01-03"],
      "vo_ref": { "from_word": "It", "to_word": "tracked" },
      "start_s": 41.2,
      "duration_s": 8.0,
      "mode": "CINEMATIC",
      "purpose": "C",
      "density": "low",
      "visual_type": "FLOW",
      "need": {
        "subject": "Aircraft carrier alone at sea",
        "platform": "Nimitz/Ford-class (generic US supercarrier)",
        "action": "steaming slowly",
        "mood": ["scale", "isolation"]
      },
      "asset_id": null,
      "flow_spec_id": "CAR01-A1-003",
      "motion_id": null,
      "transition_in": "dissolve_short",
      "transition_reason": null,
      "label": "RECONSTRUCTION"
    }]
  }]
}
```

`visual_type`: `REAL` · `ARCHIVAL` · `NEWS` · `FLOW` · `TECH` · `MAP` · `TYPE` (lihat `03`).
`transition_in`: `cut` · `dissolve_short` · `dissolve` · `dissolve_slow` · `fade_black` · `match_cut` · `whip`.
Wajib diisi salah satu dari `asset_id`, `flow_spec_id`, atau `motion_id` sebelum G3.

### asset_candidates.json (S6)

```json
{
  "shots": [{
    "shot_id": "CAR01-A2-011",
    "candidates": [{
      "asset_id": "MIL-CAR-0012",
      "range": { "in": 12.0, "out": 21.0 },
      "relevance": 0.9,
      "license": "public_domain",
      "why": "Exact platform, clean launch"
    }],
    "status": "found"
  }]
}
```

`status`: `found` · `weak` (hanya kandidat C) · `none` (ganti ke `FLOW`/`TECH`/`MAP`).

### flow_specs.json (S7)

Setiap spec berisi semua field `05` §3, ditambah `prompt` hasil rakitan dan `api` yang siap dikirim:

```json
{
  "specs": [{
    "shot_id": "CAR01-A1-003",
    "spec": { "purpose": "...", "subject": "...", "subject_constraints": ["..."], "...": "..." },
    "prompt": "8-second documentary reconstruction. ...",
    "api": {
      "endpoint": "POST /v1/videos",
      "idempotency_key": "CAR01-A1-003:v1",
      "body": { "prompt": "...", "aspectRatio": "16:9", "resolution": "1080p",
                "duration": 8, "mode": "frames", "count": 2,
                "projectKey": "MIL-carrier-survivability-20261004" }
    }
  }]
}
```

### flow_results.json (S8)

```json
{
  "results": [{
    "shot_id": "CAR01-A1-003",
    "attempt": 1,
    "job_id": "job_...",
    "outputs": [{ "file": "flow/CAR01-A1-003_v1_a.mp4", "qc": "approved_with_trim",
                  "range": { "in": 0.8, "out": 7.6 }, "issues": [] },
                { "file": "flow/CAR01-A1-003_v1_b.mp4", "qc": "rejected",
                  "issues": ["island on wrong side"] }],
    "selected": "flow/CAR01-A1-003_v1_a.mp4"
  }]
}
```

### edl.json (S10)

Timeline final yang bisa langsung dirender:

```json
{
  "fps": 30,
  "resolution": "1920x1080",
  "duration_s": 1500.0,
  "video": [{
    "clip_id": "V-0042",
    "shot_id": "CAR01-A2-011",
    "src": "assets/military/carrier/MIL-CAR-0012.mp4",
    "src_in": 12.0,
    "src_out": 18.5,
    "start_s": 312.4,
    "transition_in": { "type": "dissolve_short", "dur_s": 0.5 },
    "reframe": { "scale": 1.0, "x": 0, "y": 0, "move": null },
    "nat": true,
    "label": null
  }],
  "overlays": [{ "motion_id": "TYPE-COST-01", "start_s": 330.0, "dur_s": 2.5 }]
}
```

`nat`: audio asli klip ikut di-mix sebagai natural sound (hanya footage REAL/ARCHIVAL/NEWS). Shot tanpa media ditutup oleh klip tetangganya: pertama dengan sisa waktu bersih di shot sumber yang sama (tidak pernah melewati cut di sumber), lalu dengan perlambatan maks sampai 0,7×. Durasi dissolve dibatasi oleh sisa waktu bersih klip sebelumnya.

`asset_plan.json`: `totals` (`groups`, `candidates_considered`, `planned`, `downloaded_new`, `reviewed`, `used_assets`, `unused_fetched`) dan `groups[]` per kebutuhan visual (`group`, `seq_ids`, `need`, `narration`, `shots`, `wanted`, `planned_by`, `better_query`, `picks[]` dengan `source`, `source_id`, `title`, `look_for`, `fetched`, `used`). `asset_report.json` per shot: `status`, `asset_id`, `source`, `score` (teks), `relevance` (0–3 dari review visual), `reviewed`, `license`, `group`, plus `totals` yang sama. `credits.json` berisi `footage`, `audio` (musik dan ambience dari library), dan `sources`.

### audio_plan.json (S10)

```json
{
  "vo": "vo/vo_full.wav",
  "music_cues": [{ "cue_id": "M-03", "file": "music/...", "start_s": 300.0, "end_s": 420.0,
                   "function": "engineering", "bed_db_rel_vo": -23 }],
  "no_music": [{ "start_s": 420.0, "end_s": 455.0 }],
  "ambience": [{ "file": "...", "start_s": 300.0, "end_s": 330.0, "gain_db": -18 }],
  "sfx": [{ "file": "...", "at_s": 333.2, "gain_db": -20, "why": "radar tick on sweep" }],
  "silence_beats": [{ "at_s": 455.0, "dur_s": 1.2 }]
}
```

### qc_report.json (S12)

```json
{
  "render": "renders/rough_v2.mp4",
  "metrics": { "asl_s": 8.6, "speech_pct": 84.1, "flow_pct": 11.2, "lufs": -14.2, "lra": 5.1 },
  "findings": [{
    "pass": 4,
    "level": "major",
    "at_s": 612.0,
    "rule": "01.4 max 4 consecutive I",
    "detail": "6 consecutive I scenes from 10:12 to 11:40",
    "fix_stage": "S5"
  }],
  "human_required": [6, 8]
}
```

## 5. Integrasi dengan Flow API

Flow API berjalan di Mac (Chrome dengan sesi login). Ada dua cara pipeline mengirim job ke sana:

| Mode | Kapan | Cara |
|---|---|---|
| `direct` | Pipeline berjalan di Mac yang sama | Panggil job queue internal atau `POST /v1/videos` di `localhost`, lalu terima hasil lewat `replyUrl` webhook atau polling `/v1/jobs/:id` |
| `queue` | Pipeline atau agent berjalan di cloud | Cloud menulis `flow_specs.json` ke repo. Runner di Mac membaca spec yang belum diproses, mengirimnya ke API lokal, lalu menulis `flow_results.json`. Tidak ada port yang dibuka ke internet |

Aturan untuk kedua mode:

- `Idempotency-Key` = `<shot_id>:v<attempt>`. Retry tidak akan generate dobel.
- Kredit dicek di awal batch (`GET /v1/credits`). Batch berhenti kalau budget di `brief.json` habis.
- File hasil diunduh ke `projects/<id>/flow/` dan **tidak di-commit** ke git (lihat `.gitignore` di langkah 2).

## 6. LLM per tahap

Setiap tahap memanggil LLM lewat satu antarmuka provider yang bisa diganti per tahap (konfigurasi di `.env`). Default awal: tahap yang paling butuh penalaran dan tulisan panjang (S1, S2, S3, S12) memakai model terkuat yang tersedia, dan tahap mekanis (S6 ranking, S7 perakitan prompt) memakai model yang lebih murah.
