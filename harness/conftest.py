from __future__ import annotations

from pathlib import Path

WEB_ROOT = Path(__file__).resolve().parents[1]
HTML = WEB_ROOT / "html"
SITE_CONTENT = HTML / "site-content.json"
