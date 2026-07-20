"""nginx default.conf static checks."""

from __future__ import annotations

from pathlib import Path

import pytest

from harness.conftest import WEB_ROOT

NGINX_CONF = WEB_ROOT / "nginx" / "default.conf"


def test_nginx_conf_exists() -> None:
    assert NGINX_CONF.is_file()


def test_nginx_proxies_render_server() -> None:
    text = NGINX_CONF.read_text(encoding="utf-8")
    assert "host.docker.internal:8000" in text
    assert "location /website/" in text


def test_nginx_csp_allows_n8n() -> None:
    text = NGINX_CONF.read_text(encoding="utf-8")
    assert "n8n.juhousing.co.kr" in text


def test_nginx_media_reels_alias() -> None:
    text = NGINX_CONF.read_text(encoding="utf-8")
    assert "/media/reels/" in text
