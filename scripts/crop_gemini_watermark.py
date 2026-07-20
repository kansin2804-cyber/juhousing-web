#!/usr/bin/env python3
"""Crop Gemini corner watermark from portfolio PNGs (minimal edge trim)."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

PORTFOLIO_DIR = Path(__file__).resolve().parents[1] / "html" / "images" / "portfolio"


def corner_has_watermark(im: Image.Image, corner: str = "br", frac: float = 0.12) -> bool:
    w, h = im.size
    fw, fh = int(w * frac), int(h * frac)
    if corner == "br":
        box = (w - fw, h - fh, w, h)
    else:
        box = (0, h - fh, fw, h)
    sub = im.convert("RGB").crop(box)
    sw, sh = sub.size
    bright_corner = 0
    bright_total = 0
    for y in range(sh):
        for x in range(sw):
            r, g, b = sub.getpixel((x, y))
            if max(r, g, b) > 210:
                bright_total += 1
                in_corner = y >= sh * 0.55 and (
                    x >= sw * 0.55 if corner == "br" else x < sw * 0.45
                )
                if in_corner:
                    bright_corner += 1
    if bright_total < 15 or bright_total > sw * sh * 0.12:
        return False
    return bright_corner >= 6


def crop_file(path: Path) -> str:
    im = Image.open(path)
    w, h = im.size
    crop_bottom = max(55, min(120, int(h * 0.065)))
    crop_right = max(70, min(180, int(w * 0.07)))
    crop_left = max(50, min(140, int(w * 0.045))) if corner_has_watermark(im, "bl") else 0
    if corner_has_watermark(im, "br"):
        crop_right = max(crop_right, max(80, min(200, int(w * 0.075))))
        crop_bottom = max(crop_bottom, max(60, min(130, int(h * 0.07))))
    out = im.crop((crop_left, 0, w - crop_right, h - crop_bottom))
    out.save(path, format="PNG", optimize=True)
    return f"{path.name}: {w}x{h} -> {out.size[0]}x{out.size[1]} (L{crop_left} R{crop_right} B{crop_bottom})"


def main() -> None:
    for path in sorted(PORTFOLIO_DIR.glob("portfolio-*.png")):
        print(crop_file(path))


if __name__ == "__main__":
    main()
