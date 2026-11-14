"""Generate placeholder thumbnails for every template.

Each card in the gallery needs an image. Real preview renders are expensive, so
this script paints a deterministic gradient card with the template number and
name for every template in the catalog. Run it after seeding:

    python scripts/generate_template_thumbnails.py

Re-running is safe - it simply overwrites the placeholder JPEGs.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from PIL import Image, ImageDraw, ImageFilter, ImageFont  # noqa: E402

CATALOG_PATH = BACKEND_DIR / "app" / "seed" / "catalog.json"
OUT_DIR = BACKEND_DIR / "storage" / "static" / "templates"

W, H = 360, 640

# One colour pair per category so the gallery reads as a grid of families.
PALETTE = {
    "Camera": ((0x1A, 0x3A, 0x6E), (0x23, 0x2A, 0x5C)),
    "Text/Headline": ((0x3A, 0x14, 0x2E), (0x6E, 0x1A, 0x3A)),
    "UI/Social": ((0x0E, 0x3A, 0x46), (0x14, 0x2A, 0x5C)),
    "Lists/Data": ((0x24, 0x2C, 0x18), (0x14, 0x4A, 0x3A)),
    "Reels/Images": ((0x2A, 0x1A, 0x5C), (0x5C, 0x1A, 0x4A)),
    "Grade/Transitions": ((0x10, 0x1A, 0x24), (0x1A, 0x2A, 0x44)),
    "Fun": ((0x5C, 0x3A, 0x10), (0x3A, 0x1A, 0x4A)),
}
FALLBACK = ((0x1A, 0x3A, 0x6E), (0x23, 0x2A, 0x5C))

FONT_CANDIDATES = [
    Path(r"C:\Windows\Fonts\arialbd.ttf"),
    Path(r"C:\Windows\Fonts\arial.ttf"),
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
    Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf"),
]
FONT_REGULAR = [
    Path(r"C:\Windows\Fonts\arial.ttf"),
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    Path("/System/Library/Fonts/Supplemental/Arial.ttf"),
]


def _font(paths: list[Path], size: int) -> ImageFont.FreeTypeFont:
    for p in paths:
        if p.exists():
            try:
                return ImageFont.truetype(str(p), size)
            except OSError:
                continue
    return ImageFont.load_default(size)


def gradient(c0: tuple[int, int, int], c1: tuple[int, int, int], w: int, h: int) -> Image.Image:
    img = Image.new("RGB", (w, h))
    px = img.load()
    for y in range(h):
        f = y / max(h - 1, 1)
        row = tuple(int(c0[i] + (c1[i] - c0[i]) * f) for i in range(3))
        for x in range(w):
            px[x, y] = row
    return img


def make_card(number: int, name: str, fx: str, category: str) -> Image.Image:
    c0, c1 = PALETTE.get(category, FALLBACK)
    img = gradient(c0, c1, W, H).convert("RGBA")

    # soft glow blob behind the number
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([W * 0.12, H * 0.30, W * 0.88, H * 0.66], fill=(255, 255, 255, 34))
    glow = glow.filter(ImageFilter.GaussianBlur(40))
    img = Image.alpha_composite(img, glow)

    draw = ImageDraw.Draw(img)

    # faint grid lines for depth
    for y in range(0, H, 40):
        draw.line([(0, y), (W, y)], fill=(255, 255, 255, 12), width=1)

    big = _font(FONT_CANDIDATES, 190)
    small = _font(FONT_CANDIDATES, 40)
    tiny = _font(FONT_REGULAR, 22)

    num = f"{number:02d}"
    bbox = draw.textbbox((0, 0), num, font=big)
    draw.text(
        ((W - (bbox[2] - bbox[0])) / 2, H * 0.30),
        num,
        font=big,
        fill=(255, 255, 255, 235),
    )

    # name (wrapped)
    label_font = _font(FONT_CANDIDATES, 34)
    words = name.split()
    lines: list[str] = []
    current = ""
    for word in words:
        trial = f"{current} {word}".strip()
        if draw.textlength(trial, font=label_font) <= W - 60:
            current = trial
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)

    y = H * 0.64
    for line in lines[:2]:
        bbox = draw.textbbox((0, 0), line, font=label_font)
        draw.text(
            ((W - (bbox[2] - bbox[0])) / 2, y),
            line,
            font=label_font,
            fill=(0xE8, 0xF2, 0xFF, 255),
        )
        y += 42

    # cyan accent bar + fx name
    draw.rounded_rectangle([W * 0.22, H * 0.845, W * 0.78, H * 0.855], radius=3, fill=(0x22, 0xD3, 0xEE, 220))
    bbox = draw.textbbox((0, 0), fx, font=tiny)
    draw.text(
        ((W - (bbox[2] - bbox[0])) / 2, H * 0.885),
        fx,
        font=tiny,
        fill=(0x9F, 0xC4, 0xE8, 220),
    )

    return img.convert("RGB")


def main() -> int:
    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    count = 0
    for item in catalog["templates"]:
        card = make_card(item["number"], item["name"], item["fx"], item["category"])
        card.save(OUT_DIR / f"{item['number']}.jpg", "JPEG", quality=88)
        count += 1
    print(f"Wrote {count} placeholder thumbnails to {OUT_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
