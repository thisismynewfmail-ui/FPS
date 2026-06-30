#!/usr/bin/env python3
"""
Asset pipeline for the zombie-survival FPS.

Responsibilities
----------------
1. Process the two provided RGB sprite sheets (white background, 3x4 walk
   layout) into transparent RGBA sheets, preserving interior white details
   such as the peaceful NPC's hair bow.
2. Derive tinted zombie variants (sprinter / tank) from the basic zombie.
3. Generate tileable, power-of-two world textures with a retro palette,
   dithering and seamless wrapping (grass, dirt, road, concrete, brick,
   office wall, ceiling, wood, metal, crate).
4. Generate first-person weapon view sprites, item pickups and a muzzle flash.

Everything is written into ./assets so the game can load it from a single
directory. Re-running is idempotent.

Usage:  python3 tools/gen_assets.py
"""
import os
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEX_DIR = os.path.join(ROOT, "assets", "textures")
SPR_DIR = os.path.join(ROOT, "assets", "sprites")
WPN_DIR = os.path.join(SPR_DIR, "weapons")
ITEM_DIR = os.path.join(SPR_DIR, "items")
for d in (TEX_DIR, SPR_DIR, WPN_DIR, ITEM_DIR):
    os.makedirs(d, exist_ok=True)


# --------------------------------------------------------------------------
# Tileable noise helpers
# --------------------------------------------------------------------------
def _smooth(t):
    return t * t * (3 - 2 * t)


def tileable_noise(size, period, seed):
    """Seamless value noise: a `period`x`period` random lattice that wraps,
    bilinearly + smoothstep interpolated up to `size`x`size`."""
    rng = np.random.default_rng(seed)
    grid = rng.random((period, period)).astype(np.float64)
    coords = np.arange(size) * (period / size)
    x0 = np.floor(coords).astype(int)
    fx = coords - x0
    x0m = x0 % period
    x1m = (x0 + 1) % period
    sfx = _smooth(fx)

    gx = grid[np.ix_(x0m, x0m)]  # placeholder, replaced below
    # interpolate along x then y using outer construction
    # Build 2D by interpolating rows then columns.
    # rows: for each lattice row, interpolate along x
    rowsa = grid[:, x0m]          # (period, size)
    rowsb = grid[:, x1m]          # (period, size)
    rows = rowsa * (1 - sfx) + rowsb * sfx   # (period, size)
    cola = rows[x0m, :]           # (size, size)
    colb = rows[x1m, :]
    out = cola * (1 - sfx[:, None]) + colb * sfx[:, None]
    return out


def fbm(size, seed, periods=(4, 8, 16, 32, 64), gains=(0.5, 0.25, 0.15, 0.07, 0.03)):
    acc = np.zeros((size, size))
    for i, p in enumerate(periods):
        if p > size:
            continue
        acc += gains[i] * tileable_noise(size, p, seed + i * 101)
    acc -= acc.min()
    if acc.max() > 0:
        acc /= acc.max()
    return acc


def lerp_palette(t, stops):
    """t in [0,1] -> rgb. stops = list of (pos, (r,g,b))."""
    t = np.clip(t, 0, 1)
    out = np.zeros(t.shape + (3,))
    for i in range(len(stops) - 1):
        p0, c0 = stops[i]
        p1, c1 = stops[i + 1]
        m = (t >= p0) & (t <= p1)
        if not m.any():
            continue
        local = (t[m] - p0) / max(1e-6, (p1 - p0))
        for k in range(3):
            out[m, k] = c0[k] + (c1[k] - c0[k]) * local
    out[t <= stops[0][0]] = stops[0][1]
    out[t >= stops[-1][0]] = stops[-1][1]
    return out


def dither(arr, amount=8.0, seed=0):
    rng = np.random.default_rng(seed)
    n = (rng.random(arr.shape[:2]) - 0.5) * amount
    return arr + n[..., None]


def quantize(arr, levels=16):
    step = 255.0 / (levels - 1)
    return np.round(arr / step) * step


def retro_pixelate(img, factor=2):
    """Downscale then nearest-upscale for chunky pixels."""
    w, h = img.size
    small = img.resize((max(1, w // factor), max(1, h // factor)), Image.BILINEAR)
    return small.resize((w, h), Image.NEAREST)


def save_tex(name, arr, pixelate=2):
    arr = np.clip(arr, 0, 255).astype(np.uint8)
    img = Image.fromarray(arr, "RGB")
    if pixelate > 1:
        img = retro_pixelate(img, pixelate)
    img.save(os.path.join(TEX_DIR, name))
    print("  texture", name, img.size)


# --------------------------------------------------------------------------
# World textures (all 256x256, tileable, power-of-two)
# --------------------------------------------------------------------------
S = 256


def gen_grass():
    n = fbm(S, seed=11)
    n2 = fbm(S, seed=23, periods=(32, 64), gains=(0.6, 0.4))
    t = n * 0.7 + n2 * 0.3
    rgb = lerp_palette(t, [
        (0.0, (32, 54, 24)),
        (0.4, (54, 84, 36)),
        (0.7, (78, 112, 48)),
        (1.0, (104, 140, 66)),
    ])
    rgb = dither(quantize(rgb, 12), 10, seed=1)
    save_tex("grass.png", rgb)


def gen_dirt():
    n = fbm(S, seed=31)
    rgb = lerp_palette(n, [
        (0.0, (58, 42, 28)),
        (0.5, (96, 70, 44)),
        (1.0, (132, 100, 66)),
    ])
    rgb = dither(quantize(rgb, 12), 10, seed=2)
    save_tex("dirt.png", rgb)


def gen_road():
    n = fbm(S, seed=41, periods=(16, 32, 64), gains=(0.5, 0.3, 0.2))
    rgb = lerp_palette(n, [
        (0.0, (28, 28, 30)),
        (0.6, (46, 46, 50)),
        (1.0, (66, 66, 70)),
    ])
    # cracks: dark thin lines from a separate high-freq threshold
    cr = tileable_noise(S, 24, 77)
    crack = (np.abs(cr - 0.5) < 0.02)
    rgb[crack] = (16, 16, 18)
    rgb = dither(quantize(rgb, 10), 8, seed=3)
    save_tex("road.png", rgb)


def gen_concrete():
    n = fbm(S, seed=51)
    rgb = lerp_palette(n, [
        (0.0, (96, 96, 100)),
        (0.5, (128, 128, 132)),
        (1.0, (158, 158, 162)),
    ])
    # stains
    st = fbm(S, seed=52, periods=(8, 16), gains=(0.6, 0.4))
    rgb -= ((st > 0.7)[..., None] * 22)
    rgb = dither(quantize(rgb, 12), 7, seed=4)
    save_tex("floor_concrete.png", rgb)


def gen_brick():
    """Running-bond red brick, tileable (even brick count)."""
    bw, bh = 64, 32          # brick incl mortar
    mortar = 4
    img = np.zeros((S, S, 3))
    base_mortar = np.array([60, 58, 54])
    img[:] = base_mortar
    rng = np.random.default_rng(61)
    for row in range(S // bh):
        y0 = row * bh
        offset = (bw // 2) if (row % 2) else 0
        x = -offset
        while x < S:
            for bx in (x, x + S):  # wrap copies
                shade = rng.integers(-18, 18)
                color = np.array([150, 64, 48]) + shade
                xx0 = bx + mortar // 2
                xx1 = bx + bw - mortar // 2
                yy0 = y0 + mortar // 2
                yy1 = y0 + bh - mortar // 2
                xa, xb = max(0, xx0), min(S, xx1)
                ya, yb = max(0, yy0), min(S, yy1)
                if xa < xb and ya < yb:
                    img[ya:yb, xa:xb] = color
            x += bw
    n = fbm(S, seed=62, periods=(16, 32), gains=(0.6, 0.4))
    img += (n[..., None] - 0.5) * 26
    img = dither(quantize(img, 14), 6, seed=5)
    save_tex("wall_brick.png", img, pixelate=1)


def gen_office_wall():
    """Replacement for the provided (blank) wall_inside_office.png:
    a tileable painted-panel office interior wall."""
    img = np.zeros((S, S, 3))
    base = np.array([150, 150, 138])         # warm beige drywall
    img[:] = base
    n = fbm(S, seed=71, periods=(16, 32, 64), gains=(0.5, 0.3, 0.2))
    img += (n[..., None] - 0.5) * 18
    # faint vertical paneling seams every 64px (tileable)
    for x in range(0, S, 64):
        img[:, max(0, x - 1):x + 1] -= 26
    # scuffs near the bottom
    scuff = fbm(S, seed=72, periods=(8, 16), gains=(0.6, 0.4))
    ymask = (np.arange(S)[:, None] > S * 0.72)
    img -= ((scuff > 0.6) & ymask)[..., None] * 28
    img = dither(quantize(img, 14), 6, seed=6)
    save_tex("wall_inside_office.png", img, pixelate=2)


def gen_ceiling():
    img = np.zeros((S, S, 3))
    img[:] = (150, 150, 152)
    # drop-ceiling grid every 128 -> 2 tiles
    for x in range(0, S, 128):
        img[:, max(0, x - 2):x + 2] = (96, 96, 98)
    for y in range(0, S, 128):
        img[max(0, y - 2):y + 2, :] = (96, 96, 98)
    n = fbm(S, seed=81, periods=(16, 32), gains=(0.6, 0.4))
    img += (n[..., None] - 0.5) * 16
    img = dither(quantize(img, 12), 5, seed=7)
    save_tex("ceiling.png", img, pixelate=2)


def gen_wood():
    """Vertical planks."""
    img = np.zeros((S, S, 3))
    plank = 42
    rng = np.random.default_rng(91)
    grain = fbm(S, seed=92, periods=(8, 16, 32), gains=(0.5, 0.3, 0.2))
    for px in range(0, S, plank):
        shade = rng.integers(-16, 16)
        base = np.array([120, 84, 50]) + shade
        img[:, px:px + plank] = base
        img[:, max(0, px - 1):px + 1] = (54, 36, 22)   # gap line
    # horizontal grain streaks
    img += (grain[..., None] - 0.5) * 30
    img = dither(quantize(img, 14), 7, seed=8)
    save_tex("wood.png", img, pixelate=1)


def gen_metal():
    img = np.zeros((S, S, 3))
    n = fbm(S, seed=101, periods=(16, 32, 64), gains=(0.5, 0.3, 0.2))
    rgb = lerp_palette(n, [
        (0.0, (78, 82, 90)),
        (0.5, (112, 118, 128)),
        (1.0, (150, 156, 166)),
    ])
    # rivets at corners of a 64 grid (tileable)
    yy, xx = np.mgrid[0:S, 0:S]
    for gy in range(0, S, 64):
        for gx in range(0, S, 64):
            d = (xx - gx) ** 2 + (yy - gy) ** 2
            rgb[d < 16] = (60, 64, 70)
            rgb[(d >= 16) & (d < 36)] = (170, 176, 186)
    rgb = dither(quantize(rgb, 14), 5, seed=9)
    save_tex("metal.png", rgb, pixelate=1)


def gen_crate():
    img = np.zeros((S, S, 3))
    img[:] = (120, 84, 50)
    g = fbm(S, seed=111, periods=(16, 32), gains=(0.6, 0.4))
    img += (g[..., None] - 0.5) * 26
    # plank lines + border frame
    border = 10
    img[:border] = img[-border:] = (70, 48, 28)
    img[:, :border] = img[:, -border:] = (70, 48, 28)
    img[S // 2 - 4:S // 2 + 4, :] = (70, 48, 28)
    img[:, S // 2 - 4:S // 2 + 4] = (70, 48, 28)
    # diagonal brace
    draw_img = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(draw_img)
    d.line([(border, border), (S - border, S - border)], fill=(70, 48, 28), width=8)
    d.line([(S - border, border), (border, S - border)], fill=(70, 48, 28), width=8)
    img = np.asarray(draw_img).astype(float)
    img = dither(quantize(img, 14), 6, seed=10)
    save_tex("crate.png", img, pixelate=1)


# --------------------------------------------------------------------------
# Sprite sheet processing (white background -> alpha)
# --------------------------------------------------------------------------
def flood_key(rgb, near=244, sat_max=14, preserve_top=0.0):
    """Return RGBA where background-connected near-white becomes transparent.
    Enclosed near-white pockets are also cleared, except within the top
    `preserve_top` fraction of EACH of the 4 rows (keeps a white hair bow)."""
    h, w, _ = rgb.shape
    lum = rgb.mean(axis=2)
    sat = rgb.max(axis=2) - rgb.min(axis=2)
    whiteish = (lum >= near) & (sat <= sat_max)

    # BFS flood fill from all border pixels through white regions
    from collections import deque
    visited = np.zeros((h, w), dtype=bool)
    dq = deque()
    for x in range(w):
        for y in (0, h - 1):
            if whiteish[y, x] and not visited[y, x]:
                visited[y, x] = True
                dq.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if whiteish[y, x] and not visited[y, x]:
                visited[y, x] = True
                dq.append((y, x))
    while dq:
        y, x = dq.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx] and whiteish[ny, nx]:
                visited[ny, nx] = True
                dq.append((ny, nx))

    alpha = np.where(whiteish & visited, 0, 255).astype(np.uint8)

    # clear enclosed white pockets too, except the protected top band per row
    rows = 4
    rh = h // rows
    protect = np.zeros((h, w), dtype=bool)
    if preserve_top > 0:
        for r in range(rows):
            y0 = r * rh
            y1 = y0 + int(rh * preserve_top)
            protect[y0:y1, :] = True
    pocket = whiteish & (~visited) & (~protect)
    alpha[pocket] = 0

    out = np.dstack([rgb.astype(np.uint8), alpha])
    return out


def dehalo(rgba, passes=3, lum_t=200, sat_t=24):
    """Remove the leftover light/low-saturation anti-aliased ring (the white
    'halo') left by background keying. Each pass erodes opaque edge pixels that
    are both light and near-greyscale — i.e. white-bg blend pixels — while
    leaving the character's coloured/dark edges (and the white bow's interior)
    intact. Uses 8-connectivity so corners are cleaned too."""
    arr = rgba.copy()
    for _ in range(passes):
        a = arr[..., 3]
        rgb = arr[..., :3].astype(int)
        lum = rgb.mean(axis=2)
        sat = rgb.max(axis=2) - rgb.min(axis=2)
        opq = a > 0
        trans = ~opq
        nbr = np.zeros_like(trans)
        nbr[1:, :] |= trans[:-1, :]; nbr[:-1, :] |= trans[1:, :]
        nbr[:, 1:] |= trans[:, :-1]; nbr[:, :-1] |= trans[:, 1:]
        nbr[1:, 1:] |= trans[:-1, :-1]; nbr[:-1, :-1] |= trans[1:, 1:]
        nbr[1:, :-1] |= trans[:-1, 1:]; nbr[:-1, 1:] |= trans[1:, :-1]
        halo = opq & nbr & (lum > lum_t) & (sat < sat_t)
        arr[halo, 3] = 0
    return arr


def erode_alpha(rgba, px=1):
    """Shrink the silhouette by `px` pixels. The source art has a light
    anti-aliased rim one pixel wide; against a dark scene that reads as a white
    border. Peeling the outermost ring exposes the art's intended dark outline.
    8-connectivity so corners erode evenly."""
    arr = rgba.copy()
    a = arr[..., 3]
    for _ in range(px):
        opq = a > 0
        trans = ~opq
        nbr = np.zeros_like(trans)
        nbr[1:, :] |= trans[:-1, :]; nbr[:-1, :] |= trans[1:, :]
        nbr[:, 1:] |= trans[:, :-1]; nbr[:, :-1] |= trans[:, 1:]
        nbr[1:, 1:] |= trans[:-1, :-1]; nbr[:-1, :-1] |= trans[1:, 1:]
        nbr[1:, :-1] |= trans[:-1, 1:]; nbr[:-1, 1:] |= trans[1:, :-1]
        a = np.where(opq & nbr, 0, a)
    arr[..., 3] = a
    return arr


def alpha_bleed(rgba, iters=16):
    """Flood the colour of opaque pixels outward into the fully-transparent
    region (edge padding). The keyed-out background is still WHITE in RGB
    (alpha 0); any later bilinear filtering — e.g. the bundle's downscale — would
    blend that white back into the silhouette and recreate a halo. After bleeding
    there is no white left to blend, so edges stay clean at any filter/scale."""
    arr = rgba.astype(np.float32).copy()
    h, w, _ = arr.shape
    rgb = arr[..., :3]
    known = arr[..., 3] > 0

    def shift(a, dy, dx):
        out = np.zeros_like(a)
        ys = slice(max(0, dy), h + min(0, dy)); xs = slice(max(0, dx), w + min(0, dx))
        yt = slice(max(0, -dy), h + min(0, -dy)); xt = slice(max(0, -dx), w + min(0, -dx))
        out[ys, xs] = a[yt, xt]
        return out

    dirs = [(1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)]
    for _ in range(iters):
        unknown = ~known
        if not unknown.any():
            break
        sumc = np.zeros_like(rgb); cnt = np.zeros((h, w), np.float32)
        for dy, dx in dirs:
            k = shift(known.astype(np.float32), dy, dx)
            c = np.stack([shift(rgb[..., i], dy, dx) for i in range(3)], axis=2)
            sumc += c * k[..., None]; cnt += k
        fill = unknown & (cnt > 0)
        rgb[fill] = sumc[fill] / cnt[fill][..., None]
        known = known | fill
    arr[..., :3] = np.clip(rgb, 0, 255)
    return arr.astype(np.uint8)


def process_sheet(src, dst, preserve_top=0.0):
    rgb = np.asarray(Image.open(src).convert("RGB"))
    rgba = flood_key(rgb, preserve_top=preserve_top)
    rgba = dehalo(rgba)
    rgba = erode_alpha(rgba, 1)     # peel the light anti-aliased rim
    rgba = alpha_bleed(rgba)
    img = Image.fromarray(rgba, "RGBA")
    img.save(os.path.join(SPR_DIR, dst))
    print("  sprite", dst, img.size)
    return rgba


def tint_sheet(rgba, dst, mul=(1, 1, 1), add=(0, 0, 0), gamma=1.0):
    arr = rgba.astype(np.float32)
    rgb = arr[..., :3]
    if gamma != 1.0:
        rgb = (rgb / 255.0) ** gamma * 255.0
    rgb = rgb * np.array(mul) + np.array(add)
    arr[..., :3] = np.clip(rgb, 0, 255)
    img = Image.fromarray(arr.astype(np.uint8), "RGBA")
    img.save(os.path.join(SPR_DIR, dst))
    print("  sprite", dst, img.size)


# --------------------------------------------------------------------------
# First-person weapon view sprites (pixel art, held lower-right)
# --------------------------------------------------------------------------
WPN_W, WPN_H = 320, 256
SKIN = (198, 152, 112)
SKIN_D = (150, 108, 74)
SKIN_L = (222, 178, 138)


def _fist(d, cx, top, w=78, h=66):
    """A gripping fist centred at cx, its top edge at `top`."""
    x0, x1 = cx - w // 2, cx + w // 2
    d.rounded_rectangle([x0, top, x1, top + h], radius=10, fill=SKIN, outline=SKIN_D, width=2)
    # finger ridges
    fw = w // 4
    for i in range(4):
        fx = x0 + i * fw
        d.line([(fx + fw, top + 4), (fx + fw, top + h - 6)], fill=SKIN_D, width=2)
        d.ellipse([fx + 3, top - 4, fx + fw - 1, top + 12], fill=SKIN_L, outline=SKIN_D)
    # thumb
    d.ellipse([x1 - 8, top + h // 2 - 12, x1 + 16, top + h // 2 + 14], fill=SKIN, outline=SKIN_D)


def gen_weapon_pistol():
    img = Image.new("RGBA", (WPN_W, WPN_H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx = 168
    # barrel/slide pointing up
    d.rectangle([cx - 16, 70, cx + 16, 150], fill=(54, 58, 66), outline=(26, 28, 32), width=2)
    d.rectangle([cx - 10, 64, cx + 10, 78], fill=(70, 74, 82))                # front sight block
    d.rectangle([cx - 18, 150, cx + 22, 176], fill=(40, 42, 48), outline=(22, 24, 28))  # frame
    d.rectangle([cx - 14, 176, cx + 6, 210], fill=(34, 30, 28))              # grip down into fist
    d.arc([cx - 2, 168, cx + 34, 204], 270, 90, fill=(30, 32, 36), width=5)  # trigger guard
    _fist(d, cx - 4, 188)
    img.save(os.path.join(WPN_DIR, "pistol.png"))
    print("  weapon pistol.png")


def gen_weapon_shotgun():
    img = Image.new("RGBA", (WPN_W, WPN_H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx = 160
    d.rectangle([cx - 13, 40, cx - 3, 200], fill=(60, 42, 28), outline=(30, 20, 12))   # twin barrels
    d.rectangle([cx + 3, 40, cx + 13, 200], fill=(66, 46, 30), outline=(30, 20, 12))
    d.rectangle([cx - 22, 150, cx + 22, 178], fill=(48, 32, 20), outline=(26, 18, 10)) # pump grip
    d.rectangle([cx - 18, 196, cx + 18, 240], fill=(70, 50, 32), outline=(34, 22, 12)) # stock/receiver
    _fist(d, cx - 30, 150, w=62, h=54)     # forward hand on pump
    _fist(d, cx + 6, 206)                   # trigger hand
    img.save(os.path.join(WPN_DIR, "shotgun.png"))
    print("  weapon shotgun.png")


def gen_weapon_rifle():
    img = Image.new("RGBA", (WPN_W, WPN_H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx = 162
    d.rectangle([cx - 7, 36, cx + 7, 150], fill=(40, 42, 46), outline=(20, 22, 26))    # barrel
    d.rectangle([cx - 16, 150, cx + 18, 196], fill=(34, 36, 40), outline=(18, 20, 24)) # receiver
    d.polygon([(cx - 16, 196), (cx + 4, 196), (cx + 4, 250), (cx - 30, 250)],
              fill=(46, 40, 34), outline=(24, 20, 16))                                  # banana mag
    d.rectangle([cx + 12, 178, cx + 40, 250], fill=(40, 42, 46), outline=(20, 22, 26))  # stock
    _fist(d, cx - 28, 150, w=60, h=52)
    _fist(d, cx + 22, 200)
    img.save(os.path.join(WPN_DIR, "rifle.png"))
    print("  weapon rifle.png")


def gen_weapon_sniper():
    img = Image.new("RGBA", (WPN_W, WPN_H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx = 160
    d.rectangle([cx - 6, 20, cx + 6, 150], fill=(34, 38, 34), outline=(16, 18, 16))    # long barrel
    d.rectangle([cx - 20, 96, cx + 20, 116], fill=(20, 22, 20), outline=(10, 12, 10))  # scope tube
    d.ellipse([cx - 24, 98, cx - 12, 114], fill=(60, 90, 120))                          # lens glint
    d.rectangle([cx - 16, 150, cx + 16, 196], fill=(40, 44, 40), outline=(20, 22, 20)) # bolt receiver
    d.rectangle([cx + 6, 188, cx + 36, 250], fill=(54, 46, 36), outline=(28, 22, 16))  # wood stock
    _fist(d, cx + 18, 200)
    img.save(os.path.join(WPN_DIR, "sniper.png"))
    print("  weapon sniper.png")


def gen_weapon_bat():
    img = Image.new("RGBA", (WPN_W, WPN_H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # bat rising from lower-right to upper-centre
    d.line([(250, 250), (150, 50)], fill=(150, 110, 64), width=30)
    d.line([(250, 250), (150, 50)], fill=(180, 138, 86), width=16)
    d.ellipse([128, 30, 174, 76], fill=(184, 142, 90), outline=(112, 82, 50), width=2)
    _fist(d, 232, 196)
    img.save(os.path.join(WPN_DIR, "bat.png"))
    print("  weapon bat.png")


def gen_muzzle():
    img = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx, cy = 64, 64
    for r, col in ((46, (255, 210, 90, 180)), (30, (255, 240, 160, 230)),
                   (16, (255, 255, 230, 255))):
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=col)
    # spikes
    for ang in range(0, 360, 45):
        a = math.radians(ang)
        d.line([cx, cy, cx + math.cos(a) * 60, cy + math.sin(a) * 60],
               fill=(255, 220, 120, 200), width=6)
    img.save(os.path.join(WPN_DIR, "muzzle.png"))
    print("  weapon muzzle.png")


# --------------------------------------------------------------------------
# Item pickups (billboards)
# --------------------------------------------------------------------------
def gen_ammo_box(name, accent):
    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rectangle([10, 22, 54, 54], fill=(72, 60, 40), outline=(30, 24, 14), width=2)
    d.rectangle([10, 22, 54, 32], fill=accent)                       # lid stripe
    d.rectangle([26, 14, 38, 24], fill=(48, 40, 26), outline=(24, 18, 10))  # handle
    d.line([14, 44, 50, 44], fill=accent, width=3)
    img.save(os.path.join(ITEM_DIR, name))
    print("  item", name)


def gen_health():
    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rectangle([10, 16, 54, 52], fill=(225, 225, 220), outline=(120, 120, 116), width=2)
    d.rectangle([28, 24, 36, 44], fill=(200, 30, 30))               # red cross
    d.rectangle([20, 30, 44, 38], fill=(200, 30, 30))
    img.save(os.path.join(ITEM_DIR, "health.png"))
    print("  item health.png")


def gen_blood():
    img = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse([6, 6, 26, 26], fill=(150, 12, 12, 255))
    d.ellipse([12, 12, 20, 20], fill=(190, 30, 20, 255))
    img.save(os.path.join(SPR_DIR, "blood.png"))
    print("  sprite blood.png")


# --------------------------------------------------------------------------
def main():
    print("Generating world textures...")
    gen_grass(); gen_dirt(); gen_road(); gen_concrete()
    gen_brick(); gen_office_wall(); gen_ceiling(); gen_wood(); gen_metal(); gen_crate()

    print("Processing provided sprite sheets...")
    zombie = process_sheet(
        os.path.join(ROOT, "npc_spritesheet_zombie_basic.png.png"),
        "zombie_basic.png", preserve_top=0.0)
    process_sheet(
        os.path.join(ROOT, "npc_spritesheet_peacefull.png"),
        "npc_peaceful.png", preserve_top=0.34)   # protect white bow

    print("Deriving zombie variants...")
    # Sprinter: paler, sickly green, slightly desaturated -> "fresh" runner
    tint_sheet(zombie, "zombie_sprinter.png", mul=(0.95, 1.05, 0.9), add=(20, 8, 4), gamma=0.95)
    # Tank: darker, heavier green tone
    tint_sheet(zombie, "zombie_tank.png", mul=(0.7, 0.85, 0.65), add=(0, 6, 0), gamma=1.05)

    print("Generating weapon view sprites...")
    gen_weapon_pistol(); gen_weapon_shotgun(); gen_weapon_rifle()
    gen_weapon_sniper(); gen_weapon_bat(); gen_muzzle()

    print("Generating items...")
    gen_ammo_box("ammo_pistol.png", (210, 200, 90))
    gen_ammo_box("ammo_shotgun.png", (210, 120, 60))
    gen_ammo_box("ammo_rifle.png", (90, 170, 90))
    gen_ammo_box("ammo_sniper.png", (120, 140, 210))
    gen_health()
    gen_blood()

    print("Done.")


if __name__ == "__main__":
    main()
