"""Shot boundary detection tuned for documentary edits (hard cuts + short dissolves).
usage: python3 detect.py <workdir> [fast_threshold=0.3] [slow_threshold=0.3]
fast = cuts and dissolves up to ~1s; slow = dissolves of several seconds (use 0.2 for dark, low-contrast footage)
expects <workdir>/small.rgb (64x36 rgb24 @15fps). writes cuts.json + cutpairs_N.png
"""
import sys, json
import numpy as np
from PIL import Image, ImageDraw

wd = sys.argv[1]
TH = float(sys.argv[2]) if len(sys.argv) > 2 else 0.3
FPS, K = 15, 4
a = np.fromfile(f"{wd}/small.rgb", dtype=np.uint8).reshape(-1, 36, 64, 3)
n = len(a)
q = (a // 64).astype(np.int32)
idx = (q[..., 0] * 16 + q[..., 1] * 4 + q[..., 2]).reshape(n, -1)
H = np.zeros((n, 64), np.float32)
for i in range(n):
    H[i] = np.bincount(idx[i], minlength=64)
H /= H.sum(1, keepdims=True)
D = np.zeros(n, np.float32)
D[K:n - K] = 0.5 * np.abs(H[:n - 2 * K] - H[2 * K:]).sum(1)
adj = np.r_[0, 0.5 * np.abs(np.diff(H, axis=0)).sum(1)]
g = a.mean(-1)
luma = g.mean((1, 2))

def pick(sig, th, sep):
    cand = [i for i in range(1, n - 1) if sig[i] >= th and sig[i] >= sig[i - 1] and sig[i] >= sig[i + 1]]
    out = []
    for c in cand:
        if out and c - out[-1] < sep:
            if sig[c] > sig[out[-1]]:
                out[-1] = c
        else:
            out.append(c)
    return out

# slow dissolves: 2s half-window
KL = 30
DL = np.zeros(n, np.float32)
DL[KL:n - KL] = 0.5 * np.abs(H[:n - 2 * KL] - H[2 * KL:]).sum(1)
fast = pick(D, TH, FPS)
slow = [p for p in pick(DL, float(sys.argv[3]) if len(sys.argv) > 3 else 0.3, 3 * FPS) if all(abs(p - f) > 2 * FPS for f in fast)]
peaks = sorted(fast + slow)
slowset = set(slow)

cuts = []
for p in peaks:
    lo, hi = max(0, p - 12), min(n - 1, p + 12)
    tot = 0.5 * np.abs(H[lo] - H[hi]).sum()
    ratio = adj[lo:hi + 1].max() / max(tot, 1e-6)
    # width of the elevated region of adjacent-frame change ~ transition length
    kind = "cut" if ratio >= 0.55 else "dissolve"
    if p in slowset:
        kind = "slow_dissolve"
    dark = min(luma[lo:hi + 1]) < 8  # dip to black
    if dark:
        kind = "fade_black"
    cuts.append(dict(t=round(p / FPS, 2), D=round(float(D[p]), 2), ratio=round(float(ratio), 2), kind=kind))

json.dump(dict(duration=n / FPS, threshold=TH, cuts=cuts), open(f"{wd}/cuts.json", "w"))
np.save(f"{wd}/D.npy", D)
print("frames", n, "dur", round(n / FPS, 1), "cuts", len(cuts))

# verification sheets: before | after thumbnails per detected transition
Wt, Ht, per = 128, 72, 60
for s in range(0, len(cuts), per):
    sel = cuts[s:s + per]
    img = Image.new("RGB", (4 * (2 * Wt + 70), ((len(sel) + 3) // 4) * (Ht + 4)), "black")
    d = ImageDraw.Draw(img)
    for k, c in enumerate(sel):
        f = int(c["t"] * FPS)
        x, y = (k % 4) * (2 * Wt + 70), (k // 4) * (Ht + 4)
        off = 38 if c["kind"] == "slow_dissolve" else 15
        for j, ff in enumerate([max(0, f - off), min(n - 1, f + off)]):
            img.paste(Image.fromarray(a[ff]).resize((Wt, Ht)), (x + 70 + j * Wt, y))
        m, sec = divmod(c["t"], 60)
        d.text((x + 2, y + 2), f"{int(m)}:{sec:05.2f}\nD{c['D']}\n{c['kind']}", fill="yellow")
    img.save(f"{wd}/cutpairs_{s // per + 1}.png")
