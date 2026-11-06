"""Builds transparent logo assets and PWA icons from the master logo image.
Usage: python3 scripts/make-brand-assets.py path/to/master-logo.png
(Master art is the Menewoa flower + wordmark on an off-white background.)"""
import sys
import numpy as np
from PIL import Image

src = sys.argv[1]
img = np.array(Image.open(src).convert("RGB")).astype(float)
H, W, _ = img.shape
BG = np.array([245, 244, 239.0]); WINE = np.array([124, 24, 38.0]); CREAM = np.array([244, 238, 205.0])

# alpha = how far the pixel is along the bg -> wine axis
v = WINE - BG
t = ((img - BG) @ v) / (v @ v)
alpha = np.clip(t, 0, 1)
# the cream flower centre is close to the background, so protect it explicitly
r, g, b = img[..., 0], img[..., 1], img[..., 2]
cream = (r > 232) & (g > 224) & (b > 190) & (b < 226) & (r - b > 18)
# keep only the cream blob inside the flower area (largest component near flower centre)
ys, xs = np.nonzero(cream[: int(H * .6)])
cy, cx = np.median(ys), np.median(xs)
yy, xx = np.mgrid[0:H, 0:W]
rad = np.sqrt(((ys - cy) ** 2 + (xs - cx) ** 2)).max()
centre = cream & (((yy - cy) ** 2 + (xx - cx) ** 2) <= (rad + 2) ** 2)
rgba = np.zeros((H, W, 4))
rgba[..., :3] = WINE
rgba[..., 3] = alpha * 255
rgba[centre, :3] = CREAM
rgba[centre, 3] = 255
full = Image.fromarray(rgba.astype(np.uint8), "RGBA")

def bbox(a, y0=0, y1=None):
    sub = a[y0:y1, :, 3] > 24
    rows = np.nonzero(sub.any(1))[0]; cols = np.nonzero(sub.any(0))[0]
    return cols[0], rows[0] + y0, cols[-1] + 1, rows[-1] + 1 + y0

arr = np.array(full)
# split flower / wordmark at the clear gap between them
rowsum = (arr[..., 3] > 24).any(1)
gap = [y for y in range(int(H * .5), int(H * .65)) if not rowsum[y]]
split = gap[len(gap) // 2] if gap else 718
mark = full.crop(bbox(arr, 0, split)); 
lock = full.crop(bbox(arr))

def pad(im, p):
    out = Image.new("RGBA", (im.width + 2 * p, im.height + 2 * p), (0, 0, 0, 0)); out.paste(im, (p, p)); return out

def recolor_light(im):
    """Dark-mode variant: wine -> Light Sand, cream centre -> wine."""
    a = np.array(im).copy(); isc = (a[..., 0] > 200) & (a[..., 2] < 230) & (a[..., 3] > 200)
    a[..., :3] = [245, 235, 208]; a[isc, :3] = [127, 1, 31]; a[isc, 3] = 255
    return Image.fromarray(a, "RGBA")

def save(im, name, maxw):
    if im.width > maxw: im = im.resize((maxw, round(im.height * maxw / im.width)), Image.LANCZOS)
    im.save(f"public/brand/{name}", optimize=True); print(name, im.size)

mark = pad(mark, 6); lock = pad(lock, 8)
save(mark, "logo-mark.png", 512); save(recolor_light(mark), "logo-mark-light.png", 512)
save(lock, "logo-lockup.png", 1024); save(recolor_light(lock), "logo-lockup-light.png", 1024)

# ---- PWA / favicon icons: wine flower on Light Sand ------------------------
SAND = (245, 235, 208, 255)
def icon(size, fill_ratio, name, rounded=False):
    canvas = Image.new("RGBA", (size, size), SAND)
    m = mark.copy(); s = size * fill_ratio / max(m.size)
    m = m.resize((round(m.width * s), round(m.height * s)), Image.LANCZOS)
    canvas.alpha_composite(m, ((size - m.width) // 2, (size - m.height) // 2))
    canvas.convert("RGB").save(f"public/icons/{name}", optimize=True); print("icons/" + name)
icon(192, .72, "icon-192.png"); icon(512, .72, "icon-512.png")
icon(192, .56, "icon-maskable-192.png"); icon(512, .56, "icon-maskable-512.png")   # inside the 80% safe zone
icon(180, .72, "apple-touch-icon.png"); icon(48, .86, "favicon-48.png")
