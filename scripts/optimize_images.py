#!/usr/bin/env python3
"""Optimize high-resolution images to WebP and update all project references."""
from __future__ import annotations

import re
from pathlib import Path
from PIL import Image

WORKSPACE_DIR = Path(__file__).resolve().parents[1]
HTML_DIR = WORKSPACE_DIR / "html"

def optimize_image(src_path: Path, dest_path: Path, max_width: int, quality: int = 80) -> None:
    if not src_path.exists():
        print(f"Skipping: {src_path.name} (does not exist)")
        return
    
    img = Image.open(src_path)
    w, h = img.size
    
    # Resize if wider than max_width
    if w > max_width:
        ratio = max_width / w
        img = img.resize((max_width, int(h * ratio)), Image.Resampling.LANCZOS)
        
    img.save(dest_path, format="WEBP", quality=quality, method=6)
    orig_size = src_path.stat().st_size
    new_size = dest_path.stat().st_size
    saved = orig_size - new_size
    pct = (saved / orig_size) * 100
    print(f"Optimized: {src_path.name} -> {dest_path.name}")
    print(f"  Dimensions: {w}x{h} -> {img.size[0]}x{img.size[1]}")
    print(f"  Size: {orig_size / 1024 / 1024:.2f} MB -> {new_size / 1024 / 1024:.2f} MB (-{pct:.1f}%)")

def replace_in_file(path: Path, replacements: list[tuple[str, str]]) -> None:
    if not path.exists():
        return
    content = path.read_text(encoding="utf-8")
    original = content
    for old, new in replacements:
        content = content.replace(old, new)
    if content != original:
        path.write_text(content, encoding="utf-8")
        print(f"Updated references in: {path.relative_to(WORKSPACE_DIR)}")

def main() -> None:
    print("=== Step 1: Optimizing high-resolution images ===")
    
    # Define tasks
    tasks = [
        # Hero Image (max width 1920)
        (HTML_DIR / "images" / "hero_main.jpg", HTML_DIR / "images" / "hero_main.webp", 1920),
        # Cards (max width 1000)
        (HTML_DIR / "public" / "assets" / "Gemini_Generated_Image_hy77qthy77qthy77.png", 
         HTML_DIR / "public" / "assets" / "Gemini_Generated_Image_hy77qthy77qthy77.webp", 1000),
        (HTML_DIR / "public" / "assets" / "Gemini_Generated_Image_r5kdlzr5kdlzr5kd.png", 
         HTML_DIR / "public" / "assets" / "Gemini_Generated_Image_r5kdlzr5kdlzr5kd.webp", 1000),
        # Process infographics (max width 1000)
        (HTML_DIR / "101.png", HTML_DIR / "101.webp", 1000),
        (HTML_DIR / "102.png", HTML_DIR / "102.webp", 1000),
        (HTML_DIR / "103.png", HTML_DIR / "103.webp", 1000),
        (HTML_DIR / "104.png", HTML_DIR / "104.webp", 1000),
        (HTML_DIR / "106.png", HTML_DIR / "106.webp", 1000),
    ]
    
    for src, dest, max_w in tasks:
        optimize_image(src, dest, max_w)
        
    print("\n=== Step 2: Updating text/code references ===")
    
    replacements = [
        ("hero_main.jpg", "hero_main.webp"),
        ("Gemini_Generated_Image_hy77qthy77qthy77.png", "Gemini_Generated_Image_hy77qthy77qthy77.webp"),
        ("Gemini_Generated_Image_r5kdlzr5kdlzr5kd.png", "Gemini_Generated_Image_r5kdlzr5kdlzr5kd.webp"),
        ("101.png", "101.webp"),
        ("102.png", "102.webp"),
        ("103.png", "103.webp"),
        ("104.png", "104.webp"),
        ("106.png", "106.webp"),
    ]
    
    # Walk and update files
    for path in HTML_DIR.glob("**/*"):
        if path.is_file() and path.suffix in [".html", ".json", ".js", ".xml"]:
            replace_in_file(path, replacements)
            
    print("\n=== Image optimization complete! ===")

if __name__ == "__main__":
    main()
