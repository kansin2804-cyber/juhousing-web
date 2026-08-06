"""site-content.json minimal schema + link integrity."""

from __future__ import annotations

import json

import pytest

from harness.conftest import HTML, SITE_CONTENT, WEB_ROOT


@pytest.fixture
def content() -> dict:
    assert SITE_CONTENT.is_file(), "missing html/site-content.json"
    data = json.loads(SITE_CONTENT.read_text(encoding="utf-8"))
    assert isinstance(data, dict)
    return data


def test_site_content_meta(content: dict) -> None:
    meta = content.get("meta", {})
    assert meta.get("title"), "meta.title required"
    assert meta.get("description"), "meta.description required"
    assert meta.get("ogUrl"), "meta.ogUrl required"


def test_site_content_contact(content: dict) -> None:
    contact = content.get("contact", {})
    assert contact.get("phone"), "contact.phone required"
    assert contact.get("company"), "contact.company required"


def test_competencies_cards(content: dict) -> None:
    cards = content.get("competencies", {}).get("cards", [])
    assert len(cards) >= 3, "competencies.cards should have >=3 items"
    for i, card in enumerate(cards):
        assert card.get("title"), f"card[{i}] missing title"
        assert card.get("body"), f"card[{i}] missing body"


def test_faq_items(content: dict) -> None:
    items = content.get("faq", {}).get("items", [])
    assert len(items) >= 2
    for i, item in enumerate(items):
        assert item.get("question") and item.get("answer"), f"faq[{i}] incomplete"


def test_region_links_resolve(content: dict) -> None:
    for item in content.get("regions", {}).get("items", []):
        href = item.get("href", "")
        assert href.startswith("/"), f"region href must be site-relative: {href}"
        rel = href.lstrip("/")
        path = HTML / rel
        assert path.is_file(), f"region link missing file: {rel}"


def test_competency_detail_links_resolve(content: dict) -> None:
    for card in content.get("competencies", {}).get("cards", []):
        link = card.get("link")
        if not link:
            continue
        rel = link.lstrip("/")
        assert (HTML / rel).is_file(), f"competency link missing: {rel}"


def test_site_render_js_exists() -> None:
    assert (HTML / "js" / "site-render.js").is_file()


def test_about_and_philosophy_sections(content: dict) -> None:
    about = content.get("about") or {}
    assert about.get("title"), "about.title required"
    assert about.get("body"), "about.body required"
    assert len(about.get("points") or []) >= 3

    philosophy = content.get("philosophy") or {}
    assert philosophy.get("title"), "philosophy.title required"
    assert len(philosophy.get("pillars") or []) >= 3


def test_cta_blocks(content: dict) -> None:
    mid = content.get("midCta") or {}
    final = content.get("finalCta") or {}
    assert mid.get("title") and mid.get("primaryLabel")
    assert final.get("title") and final.get("primaryLabel")


def test_index_has_about_philosophy_anchors() -> None:
    index = (HTML / "index.html").read_text(encoding="utf-8")
    assert 'id="about-section"' in index
    assert 'id="philosophy-section"' in index
    assert 'id="mid-cta-section"' in index
    assert 'id="final-cta-section"' in index


def test_index_html_references_site_content() -> None:
    index = (HTML / "index.html").read_text(encoding="utf-8")
    assert "site-content.json" in index or "site-render.js" in index


def test_docker_compose_has_nginx() -> None:
    text = (WEB_ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    assert "nginx" in text
