"""Website consult chatbot ↔ n8n webhook wiring (ju-webhooks.js + workflow contract)."""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from harness.conftest import HTML, WEB_ROOT

WORKFLOWS = Path("/home/ju/workflows")
N8N_WEBHOOK_BASE = "https://n8n.juhousing.co.kr/webhook"
CHAT_PATH = "consult-chat"
INTAKE_PATH = "blog-consult"
ESTIMATE_PATH = "estimate-guide"
JU_WEBHOOKS = HTML / "js" / "ju-webhooks.js"
CHAT_WORKFLOW = WORKFLOWS / "zPY9EBN2yQW1wLWm.json"
INTAKE_WORKFLOW = WORKFLOWS / "Hpg9ZTSwiMs4HTmA.json"

CONSUMER_FILES = {
    "chatbot_js": HTML / "js" / "consult-chatbot.js",
    "index": HTML / "index.html",
    "consult_page": HTML / "consult.html",
    "estimate_page": HTML / "estimate.html",
}

FRONTEND_FILES = {
    **CONSUMER_FILES,
    "ju_webhooks": JU_WEBHOOKS,
    "webhook_guard": HTML / "js" / "webhook-guard.js",
    "chatbot_css": HTML / "css" / "consult-chatbot.css",
}


def _read(path: Path) -> str:
    assert path.is_file(), f"missing {path}"
    return path.read_text(encoding="utf-8")


def _webhook_urls(text: str) -> set[str]:
    return set(re.findall(r"https://n8n\.juhousing\.co\.kr/webhook/[a-z0-9-]+", text))


@pytest.mark.parametrize("name,path", list(FRONTEND_FILES.items()), ids=list(FRONTEND_FILES))
def test_consult_assets_exist(name: str, path: Path) -> None:
    assert path.is_file(), f"consult asset missing: {name}"


def test_ju_webhooks_defines_all_paths() -> None:
    js = _read(JU_WEBHOOKS)
    for path in (CHAT_PATH, INTAKE_PATH, ESTIMATE_PATH):
        assert path in js, f"ju-webhooks.js missing path {path}"
    assert "window.JUWebhooks" in js
    assert f"{N8N_WEBHOOK_BASE}" in js


def test_webhook_urls_only_in_ju_webhooks_among_consumers() -> None:
    """Hardcoded n8n webhook URLs must not appear outside ju-webhooks.js."""
    for name, path in CONSUMER_FILES.items():
        found = _webhook_urls(_read(path))
        assert not found, f"{name} must use JUWebhooks, not hardcoded URLs: {found}"


def test_consumers_use_ju_webhooks_global() -> None:
    chatbot = _read(CONSUMER_FILES["chatbot_js"])
    assert "JUWebhooks" in chatbot
    assert "wh.consultChat" in chatbot
    assert "wh.blogConsult" in chatbot

    index = _read(CONSUMER_FILES["index"])
    assert "ju-webhooks.js" in index
    assert "JUWebhooks.blogConsult" in index

    consult = _read(CONSUMER_FILES["consult_page"])
    assert "ju-webhooks.js" in consult
    assert "JUWebhooks.blogConsult" in consult

    estimate = _read(CONSUMER_FILES["estimate_page"])
    assert "ju-webhooks.js" in estimate
    assert "JUWebhooks.estimateGuide" in estimate


def test_index_loads_chatbot_stack() -> None:
    index = _read(CONSUMER_FILES["index"])
    assert "consult-chatbot.js" in index
    assert "consult-chatbot.css" in index
    assert "webhook-guard.js" in index
    assert "consult-form" in index or "consultModalBackdrop" in index


def test_chatbot_js_behavior_unchanged() -> None:
    js = _read(CONSUMER_FILES["chatbot_js"])
    assert "JUWebhookGuard" in js
    assert "website_chatbot" in js
    assert "data.reply" in js or "data.message" in js


def test_chatbot_land_diagnosis_wiring() -> None:
    js = _read(CONSUMER_FILES["chatbot_js"])
    assert "LAND_REPORT_URL" in js
    assert "/website/land/report" in js
    assert "내 땅 진단" in js
    assert "setLandDiag" in js
    assert "fetchLandReport" in js

    index = _read(CONSUMER_FILES["index"])
    assert "/land.html" in index
    assert "내 땅 진단" in index

    land = HTML / "land.html"
    assert land.is_file(), "missing public land.html"
    land_html = land.read_text(encoding="utf-8")
    assert "/website/land/report" in land_html
    assert "법률 자문" in land_html

    sitemap = (HTML / "sitemap.xml").read_text(encoding="utf-8")
    assert "https://juhousing.co.kr/land.html" in sitemap


def test_webhook_guard_spam_fields_match_n8n() -> None:
    guard = _read(FRONTEND_FILES["webhook_guard"])
    assert "_hp_url" in guard
    assert "_ju_ts" in guard
    assert "enrichPayload" in guard


def test_nginx_csp_allows_n8n_fetch() -> None:
    conf = _read(WEB_ROOT / "nginx" / "default.conf")
    assert "connect-src" in conf
    assert "n8n.juhousing.co.kr" in conf


def _workflow_webhook_paths(path: Path) -> list[str]:
    data = json.loads(path.read_text(encoding="utf-8"))
    paths: list[str] = []
    for node in data.get("nodes", []):
        if "webhook" not in str(node.get("type", "")):
            continue
        wh = node.get("parameters", {}).get("path")
        if wh:
            paths.append(str(wh))
    return paths


def test_ju_webhooks_paths_match_n8n_exports() -> None:
    js = _read(JU_WEBHOOKS)
    assert CHAT_PATH in _workflow_webhook_paths(CHAT_WORKFLOW)
    assert INTAKE_PATH in _workflow_webhook_paths(INTAKE_WORKFLOW)
    assert CHAT_PATH in js and INTAKE_PATH in js


def test_n8n_chat_workflow_active_and_path() -> None:
    assert CHAT_WORKFLOW.is_file(), "missing [웹] 웹사이트 상담 챗봇 export"
    data = json.loads(CHAT_WORKFLOW.read_text(encoding="utf-8"))
    assert data.get("active") is True
    assert CHAT_PATH in _workflow_webhook_paths(CHAT_WORKFLOW)
    blob = json.dumps(data)
    assert "juhousing.co.kr" in blob, "CORS allowedOrigins should include production domain"


def test_n8n_intake_workflow_has_blog_consult() -> None:
    assert INTAKE_WORKFLOW.is_file()
    data = json.loads(INTAKE_WORKFLOW.read_text(encoding="utf-8"))
    assert data.get("active") is True
    assert INTAKE_PATH in _workflow_webhook_paths(INTAKE_WORKFLOW)


def test_n8n_workflows_parse_reply_shape() -> None:
    chat = json.loads(CHAT_WORKFLOW.read_text(encoding="utf-8"))
    blob = json.dumps(chat)
    assert '"reply"' in blob or "reply" in blob, "consult-chat workflow should return reply field"


def test_consult_modal_uses_webhook_guard() -> None:
    index = _read(CONSUMER_FILES["index"])
    assert "JUWebhookGuard.validateBeforeSubmit" in index
    assert "consult_modal" in index


def test_chat_intake_rate_limit_and_enrich_payload() -> None:
    """Chat intake: rate limit before submit + enrichPayload for n8n spam filter."""
    js = _read(CONSUMER_FILES["chatbot_js"])
    assert "JUWebhookGuard.enrichPayload" in js
    assert "submitIntake" in js
    assert "checkRateLimit('chat_intake'" in js or 'checkRateLimit("chat_intake"' in js


@pytest.mark.parametrize(
    "path",
    sorted((HTML / "regions").glob("*.html")),
    ids=lambda p: p.name,
)
def test_region_pages_include_chat_stack(path: Path) -> None:
    html = _read(path)
    assert "ju-webhooks.js" in html
    assert "webhook-guard.js" in html
    assert "consult-chatbot.js" in html
    assert "consult-chatbot.css" in html
    assert "data-ju-chat-open" in html


DETAIL_PAGES = (
    HTML / "framing-detail.html",
    HTML / "exterior-detail.html",
    HTML / "financial-detail.html",
)


@pytest.mark.parametrize("path", DETAIL_PAGES, ids=[p.name for p in DETAIL_PAGES])
def test_detail_pages_include_chat_stack(path: Path) -> None:
    html = _read(path)
    assert "ju-webhooks.js" in html
    assert "webhook-guard.js" in html
    assert "consult-chatbot.js" in html
    assert "consult-chatbot.css" in html
    assert "data-ju-chat-open" in html


def test_no_render_server_dead_consult_chat_route() -> None:
    """AI chat uses n8n consult-chat webhook — not render_server proxy."""
    render_server = Path("/home/ju/n8n-media/render_server.py")
    text = _read(render_server)
    assert "/website/consult-chat" not in text
    assert "website_consult_chat" not in text


def test_frontend_does_not_call_render_server_for_chat() -> None:
    chatbot = _read(CONSUMER_FILES["chatbot_js"])
    assert "/website/consult-chat" not in chatbot
    assert "JUWebhooks" in chatbot
    assert "wh.consultChat" in chatbot
