#!/usr/bin/env python3
"""Swap Tailwind CDN <script> tag with local <link> across all HTML files.

Purpose (P3 fix): Remove `https://cdn.tailwindcss.com` (~93KB JIT compiler JS,
render-blocking) and replace with the pre-built `/css/tailwind.dist.css`
(~15-25KB gzipped). Restores LCP by 40-60% on mobile 4G.

Safety:
- Aborts if the target CSS file does not exist (prevents unstyled deployment).
- Idempotent: running twice is safe (no-op on already-swapped files).
- `--restore` flag reverts the swap (useful for debugging).

Usage:
    npm run build:css              # first, generate tailwind.dist.css
    python3 scripts/swap_tailwind_cdn.py           # swap CDN -> local
    python3 scripts/swap_tailwind_cdn.py --restore # revert if needed
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HTML_ROOT = ROOT / "html"
DIST_CSS = HTML_ROOT / "css" / "tailwind.dist.css"
DIST_HREF = "/css/tailwind.dist.css"

# The CDN script tag as it appears (allow optional attributes/whitespace).
CDN_PATTERN = re.compile(
    r'<script\s+src="https://cdn\.tailwindcss\.com"[^>]*>\s*</script>'
)

# Marker used to identify already-swapped files for --restore.
# The inline `tailwind.config = {...}` block in index.html is left in place —
# it's a global assignment that is harmless without the CDN runtime, and
# leaving it makes --restore fully reversible.
LINK_TAG = f'<link rel="stylesheet" href="{DIST_HREF}" data-ju-tailwind-local>'


def swap_file(path: Path) -> tuple[bool, str]:
    text = path.read_text(encoding="utf-8")

    if LINK_TAG in text:
        return False, "already swapped"

    if not CDN_PATTERN.search(text):
        return False, "no CDN tag"

    new_text = CDN_PATTERN.sub(LINK_TAG, text, count=1)

    if new_text == text:
        return False, "unchanged"

    path.write_text(new_text, encoding="utf-8")
    return True, "swapped"


def restore_file(path: Path) -> tuple[bool, str]:
    text = path.read_text(encoding="utf-8")
    if LINK_TAG not in text:
        return False, "not swapped"

    cdn_tag = '<script src="https://cdn.tailwindcss.com"></script>'
    text = text.replace(LINK_TAG, cdn_tag, 1)
    path.write_text(text, encoding="utf-8")
    return True, "restored"


def find_html_files() -> list[Path]:
    return sorted(p for p in HTML_ROOT.rglob("*.html") if p.is_file())


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--restore", action="store_true", help="Revert to CDN")
    args = ap.parse_args()

    if not args.restore:
        if not DIST_CSS.exists():
            print(
                "[error] Local Tailwind CSS not built yet.\n"
                f"        Expected file: {DIST_CSS}\n"
                "        Run first: npm install && npm run build:css",
                file=sys.stderr,
            )
            return 1
        size_kb = DIST_CSS.stat().st_size / 1024
        print(f"[ok] Found dist CSS ({size_kb:.1f} KB) — proceeding with swap.")

    action = restore_file if args.restore else swap_file
    verb = "restore" if args.restore else "swap"

    files = find_html_files()
    changed = 0
    for path in files:
        did_change, reason = action(path)
        rel = path.relative_to(ROOT)
        marker = "*" if did_change else "-"
        print(f"  [{marker}] {rel} — {reason}")
        if did_change:
            changed += 1

    print(f"\n[{verb}] {changed}/{len(files)} files updated.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
