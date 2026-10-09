"""
Brand assets from the master logo (docs/brand/aquatwin-logo.png, 1254 x 1254 app-icon tile).

  public/brand/aquatwin-icon-{1024,512,256,192,128}.png   the tile, as supplied
  public/brand/aquatwin-mark-{1024,512}.png               the droplet alone, transparent
  public/brand/aquatwin-mark.svg                          vector trace of the droplet
  public/brand/aquatwin-mark-outline.json                 contour paths (video draw-on)
  src/app/favicon.ico                                     16 / 32 / 48 px
  src/app/icon.png                                        512 px tile
  src/app/apple-icon.png                                  180 px, opaque square (iOS masks it)

The transparent mark is recovered by "un-blending" the tile's dark-navy
background: alpha follows the colour distance from a smooth background
estimate, and partially covered edge pixels get their colour restored.

Usage:  python scripts/brand/make_assets.py
"""

from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "docs" / "brand" / "aquatwin-logo.png"
BRAND = ROOT / "public" / "brand"
APP = ROOT / "src" / "app"

# Background navy at the tile's top and bottom (sampled), and the distance at
# which a pixel counts as fully foreground (darkest mark colour is ~125 away).
FULL = 92.0
EDGE = 9.0


def resize(im: Image.Image, size: int) -> Image.Image:
    return im.resize((size, size), Image.LANCZOS)


def background_estimate(rgb: np.ndarray, fg: np.ndarray) -> np.ndarray:
    """Smooth background: inpaint the foreground on a downscaled copy, then blur."""
    h, w = fg.shape
    small = cv2.resize(rgb.astype(np.uint8), (w // 4, h // 4), interpolation=cv2.INTER_AREA)
    mask = cv2.resize(fg.astype(np.uint8) * 255, (w // 4, h // 4), interpolation=cv2.INTER_NEAREST)
    mask = cv2.dilate(mask, np.ones((7, 7), np.uint8))
    filled = cv2.inpaint(small, mask, 9, cv2.INPAINT_TELEA)
    filled = cv2.GaussianBlur(filled, (0, 0), 6)
    return cv2.resize(filled, (w, h), interpolation=cv2.INTER_CUBIC).astype(np.float64)


def extract_mark(tile: np.ndarray) -> np.ndarray:
    rgb = tile[..., :3].astype(np.float64)
    # Stay well clear of the tile's anti-aliased rounded border.
    inside = cv2.erode((tile[..., 3] > 250).astype(np.uint8), np.ones((121, 121), np.uint8)) > 0
    rough_bg = np.array([3.0, 22.0, 53.0])
    rough_fg = (np.linalg.norm(rgb - rough_bg, axis=2) > 28) & inside
    bg = background_estimate(rgb, rough_fg)
    dist = np.linalg.norm(rgb - bg, axis=2)
    alpha = np.clip((dist - EDGE) / (FULL - EDGE), 0.0, 1.0)
    alpha[~inside] = 0.0
    # Un-blend partially covered pixels: c = bg + (p - bg) / alpha.
    a = np.maximum(alpha, 1e-3)[..., None]
    colour = np.clip(bg + (rgb - bg) / a, 0, 255)
    colour = np.where(alpha[..., None] > 0.999, rgb, colour)
    out = np.zeros_like(tile, dtype=np.uint8)
    out[..., :3] = colour.round().astype(np.uint8)
    out[..., 3] = (alpha * 255).round().astype(np.uint8)
    return out


def crop_square(im: np.ndarray, pad: float = 0.04) -> np.ndarray:
    ys, xs = np.nonzero(im[..., 3] > 8)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    side = int(max(y1 - y0, x1 - x0) * (1 + 2 * pad))
    cy, cx = (y0 + y1) // 2, (x0 + x1) // 2
    canvas = np.zeros((side, side, 4), np.uint8)
    sy, sx = cy - side // 2, cx - side // 2
    for y in range(side):
        yy = sy + y
        if 0 <= yy < im.shape[0]:
            xa, xb = max(sx, 0), min(sx + side, im.shape[1])
            canvas[y, xa - sx : xb - sx] = im[yy, xa:xb]
    return canvas


def gradient_stops(im: np.ndarray, mask: np.ndarray, n: int = 7) -> list[tuple[float, str]]:
    ys = np.nonzero(mask.any(axis=1))[0]
    y0, y1 = ys.min(), ys.max()
    stops = []
    for i in range(n):
        t = i / (n - 1)
        yc = int(y0 + t * (y1 - y0))
        band = slice(max(y0, yc - 12), min(y1 + 1, yc + 13))
        sel = mask[band] & (im[band][..., 3] > 250)
        if sel.sum() < 20:
            continue
        c = im[band][sel][:, :3].mean(axis=0)
        stops.append((round(t, 3), "#%02x%02x%02x" % tuple(int(v) for v in c)))
    return stops


def contour_paths(mask: np.ndarray, scale: float, eps: float = 0.6) -> list[dict]:
    contours, hierarchy = cv2.findContours(mask.astype(np.uint8), cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    out = []
    for i, c in enumerate(contours):
        if cv2.contourArea(c) < 150:
            continue
        c = cv2.approxPolyDP(c, eps, True).reshape(-1, 2)
        pts = [(round(float(x) * scale, 2), round(float(y) * scale, 2)) for x, y in c]
        d = "M" + " L".join(f"{x} {y}" for x, y in pts) + " Z"
        x, y, w, h = cv2.boundingRect(c)
        out.append(
            {
                "d": d,
                "hole": bool(hierarchy[0][i][3] >= 0),
                "bbox": [round(x * scale, 1), round(y * scale, 1), round(w * scale, 1), round(h * scale, 1)],
                "length": round(float(cv2.arcLength(c.reshape(-1, 1, 2), True)) * scale, 1),
            }
        )
    return out


def main() -> None:
    BRAND.mkdir(parents=True, exist_ok=True)
    raw = np.array(Image.open(SRC).convert("RGBA"))
    # The master carries faint grain that costs a lot of PNG bytes and is
    # invisible at icon sizes; an edge-preserving filter removes it.
    rgb = cv2.bilateralFilter(np.ascontiguousarray(raw[..., :3]), 7, 12, 5)
    tile = np.dstack([rgb, raw[..., 3]])
    tile_im = Image.fromarray(tile)

    # 1. The tile, as supplied.
    for s in (1024, 512, 256, 192, 128):
        resize(tile_im, s).save(BRAND / f"aquatwin-icon-{s}.png", optimize=True)
    resize(tile_im, 256).save(APP / "icon.png", optimize=True)

    # iOS draws its own rounded mask and fills transparency with black, so the
    # touch icon is a full square in the tile's own navy.
    navy = Image.new("RGBA", tile_im.size, (3, 22, 53, 255))
    navy.alpha_composite(tile_im)
    resize(navy.convert("RGB"), 180).save(APP / "apple-icon.png", optimize=True)

    # Manifest maskable icon: the mark with safe-zone padding on the navy square.
    ico = [resize(tile_im, s) for s in (16, 32, 48)]
    ico[2].save(APP / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)], append_images=ico[:2])

    # 2. The droplet alone.
    mark = crop_square(extract_mark(tile))
    mark_im = Image.fromarray(mark)
    for s in (1024, 512):
        resize(mark_im, s).save(BRAND / f"aquatwin-mark-{s}.png", optimize=True)

    maskable = Image.new("RGBA", (512, 512), (3, 22, 53, 255))
    m = resize(mark_im, 300)
    maskable.alpha_composite(m, (106, 106))
    maskable.convert("RGB").save(BRAND / "aquatwin-maskable-512.png", optimize=True)

    # 3. Vector trace of the droplet (viewBox 0 0 100 100). The three bars join
    #    the ring at the bottom, so they are separated geometrically: erode the
    #    filled droplet by the ring's thickness and keep the low components.
    side = mark.shape[0]
    scale = 100.0 / side
    alpha = mark[..., 3] > 127
    outer, _ = cv2.findContours(alpha.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    outer = max(outer, key=cv2.contourArea)
    filled = np.zeros(alpha.shape, np.uint8)
    cv2.drawContours(filled, [outer], -1, 1, cv2.FILLED)
    runs = []
    for frac in np.linspace(0.66, 0.82, 9):
        row = alpha[int(side * frac)]
        xs = np.nonzero(row)[0]
        run = xs[0]
        while run + 1 < side and row[run + 1]:
            run += 1
        runs.append(run - xs[0] + 1)
    thickness = int(min(runs))
    k = 2 * (thickness + 3) + 1
    inner = cv2.erode(filled, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))) > 0
    n, labels, stats, cents = cv2.connectedComponentsWithStats((alpha & inner).astype(np.uint8), 8)
    bars = np.zeros(alpha.shape, bool)
    for j in range(1, n):
        if stats[j, cv2.CC_STAT_AREA] > 400 and cents[j][1] > side * 0.62:
            bars |= labels == j
    drop = alpha & ~bars
    drop_stops = gradient_stops(mark, drop)
    bar_stops = gradient_stops(mark, bars, 4)
    drop_paths = contour_paths(drop, scale)
    bar_paths = contour_paths(bars, scale)

    def grad(gid: str, stops: list[tuple[float, str]]) -> str:
        s = "".join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in stops)
        return f'<linearGradient id="{gid}" x1="0" y1="0" x2="0" y2="1">{s}</linearGradient>'

    def compound(paths: list[dict]) -> str:
        return " ".join(p["d"] for p in paths)

    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="AquaTwin">'
        f"<defs>{grad('aqt-drop', drop_stops)}{grad('aqt-bars', bar_stops)}</defs>"
        f'<path fill="url(#aqt-drop)" fill-rule="evenodd" d="{compound(drop_paths)}"/>'
        f'<path fill="url(#aqt-bars)" fill-rule="evenodd" d="{compound(bar_paths)}"/>'
        "</svg>\n"
    )
    (BRAND / "aquatwin-mark.svg").write_text(svg, encoding="utf-8")
    (BRAND / "aquatwin-mark-outline.json").write_text(
        json.dumps(
            {
                "viewBox": [0, 0, 100, 100],
                "dropGradient": drop_stops,
                "barGradient": bar_stops,
                "drop": drop_paths,
                "bars": bar_paths,
            },
            indent=1,
        ),
        encoding="utf-8",
    )
    print("ring thickness:", thickness, "of", side, "| components:", n - 1, "drop paths:", len(drop_paths), "bar paths:", len(bar_paths))
    print("drop stops:", drop_stops)
    print("bar stops:", bar_stops)
    for f in sorted(BRAND.iterdir()):
        print(f"{f.name:34s} {f.stat().st_size / 1024:8.1f} KB")
    for f in ("favicon.ico", "icon.png", "apple-icon.png"):
        print(f"app/{f:30s} {(APP / f).stat().st_size / 1024:8.1f} KB")


if __name__ == "__main__":
    main()
