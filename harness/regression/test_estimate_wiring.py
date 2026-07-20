"""Website estimate page ↔ nginx /website/* ↔ render_server wiring."""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from harness.conftest import HTML, WEB_ROOT

RENDER_SERVER = Path("/home/ju/n8n-media/render_server.py")
NGINX_CONF = WEB_ROOT / "nginx" / "default.conf"
ESTIMATE_HTML = HTML / "estimate.html"
JU_WEBHOOKS = HTML / "js" / "ju-webhooks.js"


def _read(path: Path) -> str:
    assert path.is_file(), f"missing {path}"
    return path.read_text(encoding="utf-8")


def test_estimate_html_uses_website_proxy_paths() -> None:
    html = _read(ESTIMATE_HTML)
    assert "/website/estimate-guide" in html
    assert "/website/estimate-lead" in html
    assert "JUWebhooks.estimateGuide" in html


def test_estimate_html_loads_ju_webhooks_registry() -> None:
    html = _read(ESTIMATE_HTML)
    assert "ju-webhooks.js" in html


def test_nginx_proxies_website_estimate_routes() -> None:
    conf = _read(NGINX_CONF)
    assert "location /website/" in conf
    assert "host.docker.internal:8000" in conf


def test_render_server_declares_website_estimate_handlers() -> None:
    text = _read(RENDER_SERVER)
    assert "/website/estimate-guide" in text
    assert "/website/estimate-lead" in text
    assert "_handle_website_estimate_guide" in text


def test_ju_webhooks_estimate_guide_matches_contract_path() -> None:
    js = _read(JU_WEBHOOKS)
    assert "estimateGuide" in js
    assert "estimate-guide" in js


def test_estimate_html_no_hardcoded_render_server_host() -> None:
    html = _read(ESTIMATE_HTML)
    assert not re.search(r"https?://127\.0\.0\.1:8000", html)
    assert "host.docker.internal" not in html
