import sys, json
import numpy as np
import soundfile as sf

wd = sys.argv[1]
FPS = 15
cuts = json.load(open(f"{wd}/cuts.json"))
dur = cuts["duration"]
T = [0.0] + [c["t"] for c in cuts["cuts"]] + [dur]
a = np.fromfile(f"{wd}/small.rgb", dtype=np.uint8).reshape(-1, 36, 64, 3)
luma = a.mean((1, 2, 3))

# segments; tag near-black segments as black beats
segs = []
for s, e in zip(T[:-1], T[1:]):
    fr = luma[int(s * FPS):max(int(s * FPS) + 1, int(e * FPS))]
    segs.append(dict(s=s, e=e, d=e - s, black=bool(np.median(fr) < 10)))
shots = [x["d"] for x in segs if not x["black"]]
blacks = [x for x in segs if x["black"]]
sh = np.array(shots)

out = {}
out["duration_min"] = round(dur / 60, 2)
out["transitions"] = len(cuts["cuts"])
kinds = {}
for c in cuts["cuts"]:
    kinds[c["kind"]] = kinds.get(c["kind"], 0) + 1
out["transition_kinds"] = kinds
out["shots"] = len(shots)
out["asl_s"] = round(float(sh.mean()), 1)
out["median_shot_s"] = round(float(np.median(sh)), 1)
out["shot_pct"] = {k: round(float(np.percentile(sh, k)), 1) for k in (10, 25, 75, 90)}
bins = [0, 3, 7, 15, 25, 60, 1e9]
labels = ["<3s", "3-7s", "7-15s", "15-25s", "25-60s", ">60s"]
cnt, _ = np.histogram(sh, bins)
time_in, _ = np.histogram(sh, bins, weights=sh)
out["shot_len_hist"] = {l: dict(n=int(c), pct_time=round(100 * t / sh.sum(), 1)) for l, c, t in zip(labels, cnt, time_in)}
out["black_beats"] = dict(n=len(blacks), avg_s=round(float(np.mean([b["d"] for b in blacks])), 1) if blacks else 0)
out["cuts_per_min"] = round(len(cuts["cuts"]) / (dur / 60), 2)

# per 5-min window
win = []
for w0 in np.arange(0, dur, 300):
    n = sum(1 for c in cuts["cuts"] if w0 <= c["t"] < w0 + 300)
    win.append(n)
out["transitions_per_5min"] = win

# ---------- audio ----------
y, sr = sf.read(f"{wd}/a16.wav", dtype="float32")
hop = sr // 10  # 100 ms
nb = len(y) // hop
rms = np.sqrt((y[:nb * hop].reshape(nb, hop) ** 2).mean(1) + 1e-12)
db = 20 * np.log10(rms + 1e-9)
sp = json.load(open(f"{wd}/speech.json"))
speech_t = sum(s["end"] - s["start"] for s in sp)
out["speech_pct"] = round(100 * speech_t / dur, 1)
gaps = []
for a_, b_ in zip(sp[:-1], sp[1:]):
    gaps.append((a_["end"], b_["start"]))
if sp:
    gaps = [(0.0, sp[0]["start"])] + gaps + [(sp[-1]["end"], dur)]
gl = np.array([g[1] - g[0] for g in gaps])
gb = [0, 0.5, 1, 2, 4, 1e9]
gc, _ = np.histogram(gl, gb)
out["pause_hist"] = dict(zip(["<0.5s", "0.5-1s", "1-2s", "2-4s", ">4s"], map(int, gc)))
out["pauses_ge1s_per_min"] = round(int((gl >= 1).sum()) / (dur / 60), 2)

def lvl(s, e):
    i, j = int(s * 10), int(e * 10)
    seg = db[i:j]
    return float(np.median(seg)) if len(seg) else -99

voice_lvl = float(np.median([lvl(s["start"], s["end"]) for s in sp]))
out["voice_level_db"] = round(voice_lvl, 1)
# bed level: inside short pauses (0.3-1.5s), trimmed by 80ms each side
bed = [lvl(g[0] + 0.08, g[1] - 0.08) for g in gaps if 0.3 <= g[1] - g[0] <= 1.5]
bed = np.array(bed)
out["bed_under_vo_rel_db_median"] = round(float(np.median(bed) - voice_lvl), 1)
out["pauses_near_silent_pct"] = round(100 * float((bed < voice_lvl - 40).mean()), 1)
# breathing rooms: non-speech >= 3s, with level
br = []
for g in gaps:
    if g[1] - g[0] >= 3:
        br.append(dict(t=round(g[0], 1), d=round(g[1] - g[0], 1), rel_db=round(lvl(g[0], g[1]) - voice_lvl, 1)))
out["breathing_rooms"] = dict(n=len(br), total_s=round(sum(b["d"] for b in br), 1), list=br)
# speech run lengths (continuous narration until a >=1s pause)
runs, cur = [], None
for s in sp:
    if cur and s["start"] - cur[1] < 1.0:
        cur[1] = s["end"]
    else:
        if cur:
            runs.append(cur[1] - cur[0])
        cur = [s["start"], s["end"]]
if cur:
    runs.append(cur[1] - cur[0])
runs = np.array(runs)
out["vo_run_s"] = dict(median=round(float(np.median(runs)), 1), p90=round(float(np.percentile(runs, 90)), 1), max=round(float(runs.max()), 1))
# loudness dynamics over time (per minute median of non-silent 100ms frames, rel voice)
pm = []
for m0 in range(0, int(dur // 60) + 1):
    seg = db[m0 * 600:(m0 + 1) * 600]
    pm.append(round(float(np.percentile(seg, 50)) - voice_lvl, 1))
out["per_min_median_rel_db"] = pm
json.dump(out, open(f"{wd}/metrics.json", "w"), indent=1)
print(json.dumps({k: v for k, v in out.items() if k not in ("breathing_rooms",)}, indent=1))
print("breathing rooms:", [(b["t"], b["d"], b["rel_db"]) for b in br])
