"""Stand-in basemap for environments without satellite tiles (tests, demos).

Builds a Web-Mercator image for a lon/lat box from a low-resolution Blue Marble colour texture,
a sharper land mask and a topography map, adding hillshade and fine noise so it reads like
imagery at 1080p. Production uses real tiles (see studio/core/geo.js providers).

usage: python3 make_standin_basemap.py <textures_dir> <out.jpg> <west> <south> <east> <north> [width]
"""
import math
import sys

import numpy as np
from PIL import Image, ImageFilter

tex, out = sys.argv[1], sys.argv[2]
west, south, east, north = map(float, sys.argv[3:7])
W = int(sys.argv[7]) if len(sys.argv) > 7 else 4096

merc = lambda lat: math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
y0, y1 = merc(north), merc(south)
H = int(W * (y0 - y1) / math.radians(east - west))

lon = np.linspace(west, east, W)[None, :].repeat(H, 0)
yy = np.linspace(y0, y1, H)[:, None].repeat(W, 1)
lat = np.degrees(2 * np.arctan(np.exp(yy)) - math.pi / 2)


def sample(img, bilinear=True):
    a = np.asarray(img, dtype=np.float32)
    h, w = a.shape[:2]
    fx = (lon + 180) / 360 * w - 0.5
    fy = (90 - lat) / 180 * h - 0.5
    if not bilinear:
        return a[np.clip(fy.round().astype(int), 0, h - 1), np.clip(fx.round().astype(int), 0, w - 1)]
    x0 = np.floor(fx).astype(int); y0_ = np.floor(fy).astype(int)
    dx = (fx - x0)[..., None] if a.ndim == 3 else fx - x0
    dy = (fy - y0_)[..., None] if a.ndim == 3 else fy - y0_
    x0 = np.clip(x0, 0, w - 1); x1 = np.clip(x0 + 1, 0, w - 1)
    y0c = np.clip(y0_, 0, h - 1); y1c = np.clip(y0_ + 1, 0, h - 1)
    return (a[y0c, x0] * (1 - dx) * (1 - dy) + a[y0c, x1] * dx * (1 - dy) + a[y1c, x0] * (1 - dx) * dy + a[y1c, x1] * dx * dy)


color = sample(Image.open(f"{tex}/earth_color_2048x1024.jpg").convert("RGB")) / 255
mask_img = Image.open(f"{tex}/earth_landocean_4050x2025.png").convert("L")
land = 1 - sample(mask_img) / 255  # mask is white for water
land = np.clip((land - 0.5) * 4 + 0.5, 0, 1)
topo = sample(Image.open(f"{tex}/topography_2048x1024.png").convert("L")) / 255

rng = np.random.default_rng(7)
def fractal(octaves=6):
    acc = np.zeros((H, W), np.float32)
    amp, total = 1.0, 0.0
    for o in range(octaves):
        s = 2 ** (o + 3)
        g = rng.random((max(2, H * s // W + 2), s + 2)).astype(np.float32)
        acc += amp * np.asarray(Image.fromarray((g * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC), np.float32) / 255
        total += amp
        amp *= 0.55
    return acc / total

noise = fractal()
height = topo * 0.7 + noise * 0.3
gy, gx = np.gradient(height * 40)
shade = np.clip(0.75 + (-gx * 0.7 - gy * 0.7) * 0.9, 0.35, 1.35)

desert = color * (0.85 + 0.3 * noise[..., None])
land_rgb = np.clip(desert * shade[..., None], 0, 1)
coast = np.asarray(Image.fromarray((land * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(W / 600)), np.float32) / 255
deep = np.array([0.03, 0.06, 0.10]); shallow = np.array([0.08, 0.20, 0.26])
water = deep + (shallow - deep) * np.clip(coast * 1.6, 0, 1)[..., None] * 0.6
water = water * (0.9 + 0.2 * noise[..., None])
rgb = land_rgb * land[..., None] + water * (1 - land[..., None])
Image.fromarray((np.clip(rgb, 0, 1) * 255).astype(np.uint8)).save(out, quality=92)
print(out, W, H)
