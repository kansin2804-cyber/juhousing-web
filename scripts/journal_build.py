#!/usr/bin/env python3
"""JU Housing journal builder — Naver Blog → self-hosted magazine.

Purpose (P5): Move flagship blog content from `m.blog.naver.com/ju-housing`
to `juhousing.co.kr/journal/` so the domain accumulates its own SEO authority.

Pipeline:
  1) Fetch RSS feed of the Naver blog (public syndication endpoint).
  2) Save all recent post metadata to `posts.json` (used by the hub page).
  3) For each pilot POST_ID in PILOT_IDS: fetch mobile blog HTML, extract
     Naver Smart Editor `se-main-container`, convert to clean semantic HTML,
     and write to `html/journal/posts/<id>/index.html` with full SEO metadata
     (canonical, og:*, article schema, breadcrumb).
  4) Re-render `html/journal/index.html` (magazine hub) from posts.json.
  5) Append journal URLs to `html/sitemap.xml`.

Idempotent: safe to re-run. Rate-limits Naver fetches (0.6s between calls).

Usage:
    python3 scripts/journal_build.py                # full build
    python3 scripts/journal_build.py --rss-only     # refresh metadata only
    python3 scripts/journal_build.py --index-only   # rebuild hub only

Owner-content note:
    The Naver blog `ju-housing` is owned by JU Housing. Republishing owner
    content on the owned domain is a legitimate SEO consolidation strategy.
    A backlink to the Naver original is preserved on each self-hosted post.
"""

from __future__ import annotations

import argparse
import html as html_module
import json
import re
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

from bs4 import BeautifulSoup, NavigableString

ROOT = Path(__file__).resolve().parent.parent
HTML_ROOT = ROOT / "html"
JOURNAL_ROOT = HTML_ROOT / "journal"
POSTS_ROOT = JOURNAL_ROOT / "posts"
POSTS_JSON = JOURNAL_ROOT / "posts.json"
SITEMAP_PATH = HTML_ROOT / "sitemap.xml"

RSS_URL = "https://rss.blog.naver.com/ju-housing.xml"
NAVER_BLOG_ID = "ju-housing"
MOBILE_POST_URL = f"https://m.blog.naver.com/{NAVER_BLOG_ID}/{{pid}}"
CANONICAL_ORIGIN = "https://juhousing.co.kr"

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

# Pilot post IDs — cornerstone SEO + topical coverage (20 = 5 original + 15 expansion).
# Order = hub "Editor's Pick" display order.
PILOT_IDS = [
    # --- Original 5 ---
    "224348078251",  # 목조주택 시공의 모든 것 (건축 철학)
    "224344095586",  # 경사지 목조주택 3가지 이유 (가평 매칭)
    "224329789225",  # 평당 500만 → 800만 추가공사비 (financial-detail 매칭)
    "224328996633",  # SPF 구조재 검수 (framing-detail 매칭)
    "224304488035",  # 기초 콘크리트 타설 (시공 실무)
    # --- Expansion +15 (guides first, then field diaries) ---
    "224342684575",  # 땅 살 때 필수 체크 (토지·허가)
    "224199188560",  # SPF 가문비·소나무·전나무 강도 차이
    "224200173301",  # 아르곤 가스 창호 유통기한
    "224200289431",  # Low-E 코팅 횟수와 냉난방비
    "224198058660",  # 폼건 세척과 단열 1mm
    "224198435979",  # 습도계 핀형 vs 비파괴형
    "224199163408",  # 열화상 카메라 누수·단열 결손
    "224199360590",  # 건조 갈라짐 vs 치명 결함
    "224200035664",  # 철물 접합부·탄화층 내화
    "224201503627",  # 측량 아끼다 철거 위험
    "224206340677",  # 고단열 오버히팅·EVB
    "224196014498",  # 목조주택 바닥 소음
    "224219119040",  # 화성 현장 외장 마감 (사이딩·징크)
    "224268737535",  # 횡성 둔내면 현장 (골조~외장)
    "224250620452",  # 충주 노은면 현장 (골조~징크)
]

# Local mirror for og:image / hub thumbs (avoids hotlinking Naver CDN).
JOURNAL_IMAGES_DIR = HTML_ROOT / "images" / "journal"
JOURNAL_IMAGES_URL = "/images/journal"

RATE_LIMIT_SECONDS = 0.6


def _fetch(url: str, timeout: int = 15) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def _clean_text(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip())


# Zero-width spacer characters (U+200B, U+FEFF, non-breaking space variants) used
# by Naver Smart Editor as visual line spacers. We strip them for empty-check.
_ZW_RE = re.compile(r"[\u200b\u200c\u200d\ufeff\u2060]+")
_URL_ONLY_RE = re.compile(r"^https?://[^\s]+$")


def _visible_text(s: str) -> str:
    """Strip zero-width chars + collapse whitespace to test if paragraph is empty."""
    return _ZW_RE.sub("", (s or "")).strip()


def _slugify(text: str) -> str:
    text = re.sub(r"[^\w\s가-힣-]", "", text).strip().lower()
    return re.sub(r"[\s_]+", "-", text)[:60] or "post"


def _esc(s: str | None) -> str:
    return html_module.escape(s or "", quote=True)


# ----------------------------------------------------------------------------
# Step 1: RSS fetch + metadata
# ----------------------------------------------------------------------------

def fetch_rss_metadata() -> list[dict]:
    """Fetch RSS feed and normalize items to a list of dicts."""
    xml_bytes = _fetch(RSS_URL)
    root = ET.fromstring(xml_bytes)
    channel = root.find("channel")
    items = []
    for it in channel.findall("item"):
        link = _clean_text((it.findtext("link") or ""))
        # Post id: last path segment before any query string
        pid_match = re.search(r"/(\d{6,})(?:\?|$)", link)
        pid = pid_match.group(1) if pid_match else ""
        pub_raw = it.findtext("pubDate") or ""
        try:
            pub_dt = parsedate_to_datetime(pub_raw)
            pub_iso = pub_dt.astimezone(timezone.utc).isoformat()
            pub_display = pub_dt.strftime("%Y.%m.%d")
        except Exception:
            pub_iso = ""
            pub_display = ""
        category = _clean_text(it.findtext("category") or "")
        tags_raw = _clean_text(it.findtext("tag") or "")
        tags = [t.strip() for t in tags_raw.split(",") if t.strip()]
        items.append({
            "pid": pid,
            "title": _clean_text(it.findtext("title") or ""),
            "category": category,
            "tags": tags,
            "description": _clean_text(it.findtext("description") or ""),
            "pub_iso": pub_iso,
            "pub_display": pub_display,
            "naver_url": f"https://blog.naver.com/{NAVER_BLOG_ID}/{pid}" if pid else link,
            "author": _clean_text(it.findtext("author") or NAVER_BLOG_ID),
        })
    return items


# ----------------------------------------------------------------------------
# Step 2: Full HTML fetch + Smart Editor extraction
# ----------------------------------------------------------------------------

# Naver Smart Editor components we care about
SE_TEXT = "se-text"
SE_IMAGE = "se-image"
SE_QUOTE = "se-quotation"
SE_OGLINK = "se-oglink"
SE_HORIZONTAL = "se-horizontalLine"


def _extract_se_content(soup: BeautifulSoup) -> str:
    """Convert Naver Smart Editor DOM to clean semantic HTML."""
    root = soup.select_one(".se-main-container")
    if not root:
        return ""

    out_parts: list[str] = []
    # Walk direct children (each is a se-component)
    for comp in root.select("div.se-component"):
        classes = comp.get("class", [])
        if SE_TEXT in classes:
            html_frag = _render_text_component(comp)
            if html_frag:
                out_parts.append(html_frag)
        elif SE_IMAGE in classes:
            html_frag = _render_image_component(comp)
            if html_frag:
                out_parts.append(html_frag)
        elif SE_QUOTE in classes:
            quote_text = _clean_text(comp.get_text(" ", strip=True))
            if quote_text:
                out_parts.append(
                    f'<blockquote class="border-l-4 border-blue-500 pl-4 py-2 my-4 text-slate-700 italic">{_esc(quote_text)}</blockquote>'
                )
        elif SE_HORIZONTAL in classes:
            out_parts.append('<hr class="my-8 border-slate-200">')
        elif SE_OGLINK in classes:
            a = comp.find("a")
            if a and a.get("href"):
                url = a["href"]
                if not url.startswith(("http://", "https://")):
                    continue
                title = _clean_text(a.get_text(" ", strip=True)) or url
                out_parts.append(
                    f'<p class="my-3"><a href="{_esc(url)}" target="_blank" rel="noopener nofollow" class="text-blue-700 underline break-all">{_esc(title)}</a></p>'
                )
    return "\n".join(out_parts)


def _render_text_component(comp) -> str:
    """Render a se-text component as HTML paragraphs / headings.

    Handles Naver quirks:
    - `​` (U+200B zero-width space) is used as visual spacer → skip.
    - `<b>`-only paragraphs of moderate length → promote to <h3>.
    - Bare URL paragraphs (followed by oglink component) → skip to avoid dupes.
    - Font-size class `se-fs-fs{N}` where N>=24 → also promote to <h3>.
    """
    paragraphs = comp.select("p.se-text-paragraph")
    if not paragraphs:
        return ""
    out: list[str] = []
    for p in paragraphs:
        classes = " ".join(p.get("class", []))
        text = p.get_text(" ", strip=True)
        vtext = _visible_text(text)
        if not vtext:
            continue
        if _URL_ONLY_RE.match(vtext):
            continue

        html_inner = _render_inline(p)
        if not html_inner.strip():
            continue

        # Heading detection:
        #  (a) explicit large font class, OR
        #  (b) entire paragraph is bold + concise (<80 chars) → likely section heading
        fs_match = re.search(r"se-fs-fs(\d+)", classes)
        font_size = int(fs_match.group(1)) if fs_match else 15
        is_big = font_size >= 24
        b_el = p.find(["b", "strong"])
        b_only = (
            b_el is not None
            and _visible_text(b_el.get_text(" ", strip=True)) == vtext
            and len(vtext) < 80
        )
        is_heading = is_big or b_only

        if is_heading:
            heading_text = _esc(vtext)
            out.append(
                f'<h3 class="text-xl sm:text-2xl font-bold text-slate-900 mt-8 mb-3 tracking-tight">{heading_text}</h3>'
            )
        else:
            out.append(
                f'<p class="text-slate-700 leading-relaxed my-3">{html_inner}</p>'
            )
    return "\n".join(out)


def _render_inline(p_el) -> str:
    """Render paragraph contents, keeping links + <br> + basic emphasis."""
    parts: list[str] = []
    for node in p_el.children:
        if isinstance(node, NavigableString):
            parts.append(_esc(str(node)))
        elif getattr(node, "name", None) == "br":
            parts.append("<br>")
        elif getattr(node, "name", None) == "a":
            href = node.get("href", "")
            if href and href.startswith(("http://", "https://")):
                inner = _esc(node.get_text(" ", strip=True) or href)
                # Preserve backlinks to juhousing.co.kr, mark external as nofollow
                is_own = "juhousing.co.kr" in href
                rel = "noopener" if is_own else "noopener nofollow"
                parts.append(
                    f'<a href="{_esc(href)}" target="_blank" rel="{rel}" class="text-blue-700 underline">{inner}</a>'
                )
            else:
                parts.append(_esc(node.get_text(" ", strip=True)))
        elif getattr(node, "name", None) in {"b", "strong"}:
            parts.append(f"<strong>{_esc(node.get_text(' ', strip=True))}</strong>")
        elif getattr(node, "name", None) in {"i", "em"}:
            parts.append(f"<em>{_esc(node.get_text(' ', strip=True))}</em>")
        elif hasattr(node, "get_text"):
            parts.append(_esc(node.get_text(" ", strip=True)))
    return "".join(parts).strip()


def _render_image_component(comp) -> str:
    """Extract image URL + alt/caption from a se-image component."""
    img = comp.find("img")
    if not img:
        return ""
    src = img.get("data-lazy-src") or img.get("src") or ""
    if not src or src.startswith("data:"):
        return ""
    # Naver serves image via postfiles.pstatic.net — keep external for now.
    # (Future work: mirror locally to avoid hotlink fragility.)
    alt = img.get("alt", "") or comp.get("data-caption", "") or ""
    caption_el = comp.select_one(".se-caption")
    caption = _clean_text(caption_el.get_text(" ", strip=True)) if caption_el else ""
    figure = ['<figure class="my-6">']
    figure.append(
        f'<img src="{_esc(src)}" alt="{_esc(alt or caption or "본문 이미지")}" '
        f'class="w-full h-auto rounded-xl border border-slate-200" '
        f'loading="lazy" decoding="async" referrerpolicy="no-referrer">'
    )
    if caption:
        figure.append(
            f'<figcaption class="mt-2 text-xs text-slate-500 text-center">{_esc(caption)}</figcaption>'
        )
    figure.append("</figure>")
    return "\n".join(figure)


def fetch_full_post(pid: str) -> tuple[str, str]:
    """Fetch full post HTML and return (body_html, first_image_url)."""
    url = MOBILE_POST_URL.format(pid=pid)
    html_bytes = _fetch(url)
    soup = BeautifulSoup(html_bytes, "lxml")
    body_html = _extract_se_content(soup)

    # First image for og:image — MUST come from se-image (real content),
    # NOT se-oglink (auto-generated backlink preview from Naver proxy).
    first_img = ""
    root = soup.select_one(".se-main-container")
    if root:
        img_el = root.select_one("div.se-component.se-image img")
        if img_el:
            first_img = img_el.get("data-lazy-src") or img_el.get("src") or ""

    return body_html, first_img


def _image_ext_from_url(url: str, content_type: str = "") -> str:
    ct = (content_type or "").lower()
    if "png" in ct:
        return ".png"
    if "webp" in ct:
        return ".webp"
    if "gif" in ct:
        return ".gif"
    path = urllib.parse.urlparse(url).path.lower()
    for ext in (".jpg", ".jpeg", ".png", ".webp", ".gif"):
        if path.endswith(ext):
            return ".jpg" if ext == ".jpeg" else ext
    return ".jpg"


def mirror_og_image(pid: str, remote_url: str) -> str:
    """Download remote og image to /images/journal/{pid}.{ext} and return local absolute URL.

    Idempotent: if a local file already exists for this pid, reuse it.
    Falls back to hero_main.webp on any download failure.
    """
    fallback = f"{CANONICAL_ORIGIN}/images/hero_main.webp"
    if not remote_url or not remote_url.startswith(("http://", "https://")):
        return fallback

    JOURNAL_IMAGES_DIR.mkdir(parents=True, exist_ok=True)

    # Reuse existing mirrored file for this pid (any extension).
    for existing in JOURNAL_IMAGES_DIR.glob(f"{pid}.*"):
        if existing.is_file() and existing.stat().st_size > 0:
            return f"{CANONICAL_ORIGIN}{JOURNAL_IMAGES_URL}/{existing.name}"

    try:
        req = urllib.request.Request(
            remote_url,
            headers={
                "User-Agent": USER_AGENT,
                "Referer": f"https://m.blog.naver.com/{NAVER_BLOG_ID}/",
            },
        )
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = resp.read()
            content_type = resp.headers.get("Content-Type", "")
        if not data or len(data) < 500:
            print(f"[mirror] {pid}: empty/too-small image ({len(data)} bytes)")
            return fallback
        ext = _image_ext_from_url(remote_url, content_type)
        # Compress large PNG/JPEG payloads to WebP for og:image (target <150KB).
        if len(data) > 180_000 or ext == ".png":
            try:
                from io import BytesIO
                from PIL import Image

                img = Image.open(BytesIO(data)).convert("RGB")
                if img.width > 1200:
                    nh = int(img.height * 1200 / img.width)
                    img = img.resize((1200, nh), Image.Resampling.LANCZOS)
                buf = BytesIO()
                img.save(buf, "WEBP", quality=72, method=6)
                data = buf.getvalue()
                ext = ".webp"
            except Exception as compress_exc:  # noqa: BLE001
                print(f"[mirror] {pid}: compress skipped — {compress_exc}")
        dest = JOURNAL_IMAGES_DIR / f"{pid}{ext}"
        dest.write_bytes(data)
        print(f"[mirror] {pid}: saved {dest.relative_to(ROOT)} ({len(data)} bytes)")
        return f"{CANONICAL_ORIGIN}{JOURNAL_IMAGES_URL}/{dest.name}"
    except Exception as exc:  # noqa: BLE001
        print(f"[mirror] {pid}: download failed — {exc}")
        return fallback


# ----------------------------------------------------------------------------
# Step 3: Render individual post pages
# ----------------------------------------------------------------------------

POST_TEMPLATE = """<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="icon" href="/favicon.png" type="image/png">
    <title>{title_esc} | 제이유 하우징 저널</title>
    <meta name="description" content="{desc_esc}">
    <meta name="keywords" content="{keywords_esc}">
    <link rel="canonical" href="{canonical}">
    <meta property="og:title" content="{title_esc} | 제이유 하우징 저널">
    <meta property="og:description" content="{desc_esc}">
    <meta property="og:url" content="{canonical}">
    <meta property="og:type" content="article">
    <meta property="og:site_name" content="제이유 하우징">
    <meta property="og:image" content="{og_image}">
    <meta property="og:image:alt" content="{title_esc}">
    <meta property="og:locale" content="ko_KR">
    <meta property="article:published_time" content="{pub_iso}">
    <meta property="article:author" content="제이유 하우징">
    <meta property="article:section" content="{category_esc}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:image" content="{og_image}">
    <meta name="twitter:image:alt" content="{title_esc}">
    <script type="application/ld+json">
    {{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{{"@type":"ListItem","position":1,"name":"홈","item":"https://juhousing.co.kr/"}},{{"@type":"ListItem","position":2,"name":"저널","item":"https://juhousing.co.kr/journal/"}},{{"@type":"ListItem","position":3,"name":"{title_json}","item":"{canonical}"}}]}}
    </script>
    <script type="application/ld+json">
    {{"@context":"https://schema.org","@type":"Article","headline":"{title_json}","datePublished":"{pub_iso}","author":{{"@type":"Organization","name":"제이유 하우징","url":"https://juhousing.co.kr/"}},"publisher":{{"@type":"Organization","name":"제이유 하우징","logo":{{"@type":"ImageObject","url":"https://juhousing.co.kr/logo.png"}}}},"mainEntityOfPage":{{"@type":"WebPage","@id":"{canonical}"}},"image":"{og_image}","articleSection":"{category_json}","keywords":"{keywords_json}"}}
    </script>
    <link rel="stylesheet" href="/css/tailwind.dist.css">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css">
    <script defer src="/js/ga-core.js"></script>
    <script defer src="/js/ga-events.js"></script>
</head>
<body class="bg-slate-50 text-slate-900 min-h-screen" style="font-family:Pretendard,sans-serif;">
    <header class="bg-[#1a237e] text-white px-4 py-5">
        <div class="max-w-3xl mx-auto flex items-center justify-between gap-4">
            <div>
                <p class="text-xs text-blue-200 font-semibold tracking-wide">JU HOUSING · 저널</p>
                <h1 class="text-lg sm:text-xl font-bold leading-snug">{title_esc}</h1>
            </div>
            <a href="/journal/" class="text-sm text-blue-200 hover:text-white underline underline-offset-4 shrink-0 whitespace-nowrap">저널 홈</a>
        </div>
    </header>
    <main class="max-w-3xl mx-auto px-4 py-8 sm:py-10">
        <nav class="text-sm text-slate-500 mb-4" aria-label="breadcrumb">
            <a href="/" class="hover:text-blue-700">홈</a>
            <span class="mx-1">/</span>
            <a href="/journal/" class="hover:text-blue-700">저널</a>
            <span class="mx-1">/</span>
            <span class="text-slate-800 font-medium">{title_esc}</span>
        </nav>

        <article class="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-4">
            <div class="flex flex-wrap items-center gap-2 text-xs">
                <span class="inline-flex items-center rounded-full bg-blue-50 border border-blue-100 px-3 py-1 font-semibold text-blue-700">{category_esc}</span>
                <time datetime="{pub_iso}" class="text-slate-500">{pub_display}</time>
            </div>
            <h2 class="text-2xl sm:text-3xl font-extrabold text-slate-900 leading-snug tracking-tight">{title_esc}</h2>
            <div class="text-sm text-slate-500 border-b border-slate-100 pb-3">작성자: 제이유 하우징</div>

            <div class="prose-content pt-2">
{body_html}
            </div>

            <div class="mt-8 border-t border-slate-200 pt-5 space-y-2 text-xs text-slate-500">
                <p>이 글은 <a href="{naver_url}" target="_blank" rel="noopener nofollow" class="text-blue-700 underline">제이유 하우징 네이버 블로그 원문</a>을 자체 도메인으로 재구성한 것입니다.</p>
                <p>태그: {tags_html}</p>
            </div>
        </article>

        <section class="mt-8 rounded-2xl bg-[#1a237e] text-white p-6 sm:p-8 space-y-3">
            <h3 class="text-lg sm:text-xl font-extrabold">이 주제에 관한 상담이 필요하시면</h3>
            <p class="text-blue-100 text-sm leading-relaxed">부지·평수·요구 스펙만 남겨 주셔도 1차 예산 가이드(참고용)를 안내합니다.</p>
            <div class="flex flex-wrap gap-3">
                <a href="/consult.html" class="inline-flex items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-bold text-[#1a237e] hover:bg-blue-50">건축 상담 신청</a>
                <a href="/estimate.html" class="inline-flex items-center justify-center rounded-full border border-white/40 px-5 py-2.5 text-sm font-bold text-white hover:bg-white/10">예산 가이드</a>
                <a href="tel:010-2951-0431" class="inline-flex items-center justify-center rounded-full border border-white/40 px-5 py-2.5 text-sm font-bold text-white hover:bg-white/10">010-2951-0431</a>
            </div>
        </section>

        <nav class="mt-8 text-sm" aria-label="관련 페이지">
            <p class="font-semibold text-slate-800 mb-2">관련 스펙 상세</p>
            <ul class="flex flex-wrap gap-x-4 gap-y-2">
                <li><a class="text-blue-700 underline" href="/framing-detail.html">정밀 프레이밍</a></li>
                <li><a class="text-blue-700 underline" href="/exterior-detail.html">외장 시스템</a></li>
                <li><a class="text-blue-700 underline" href="/financial-detail.html">투명 정산</a></li>
                <li><a class="text-blue-700 underline" href="/journal/">저널 전체 보기</a></li>
            </ul>
        </nav>
    </main>
    <footer class="max-w-3xl mx-auto px-4 pb-12 pt-8 text-xs text-slate-500 space-y-1">
        <p>제이유 하우징 · 경기도 양주시 부흥로 2128 · 대표전화 010-2951-0431</p>
        <p><a href="/terms.html" class="hover:text-blue-700">이용약관</a> · <a href="/privacy.html" class="hover:text-blue-700">개인정보처리방침</a></p>
    </footer>
</body>
</html>
"""


def render_post_page(post: dict, body_html: str, og_image: str) -> str:
    canonical = f"{CANONICAL_ORIGIN}/journal/posts/{post['pid']}/"
    keywords = ", ".join((post.get("tags") or [])[:20]) or "목조주택, 전원주택, 제이유 하우징"
    tags_html = " · ".join(
        f'<span class="text-slate-600">#{_esc(t)}</span>'
        for t in (post.get("tags") or [])[:15]
    ) or '<span class="text-slate-600">#목조주택</span>'

    if not og_image:
        og_image = f"{CANONICAL_ORIGIN}/images/hero_main.webp"

    return POST_TEMPLATE.format(
        title_esc=_esc(post["title"]),
        title_json=json.dumps(post["title"], ensure_ascii=False)[1:-1],
        desc_esc=_esc(post.get("description", "")[:180]),
        keywords_esc=_esc(keywords),
        keywords_json=json.dumps(keywords, ensure_ascii=False)[1:-1],
        canonical=canonical,
        og_image=_esc(og_image),
        pub_iso=post["pub_iso"],
        pub_display=post["pub_display"],
        category_esc=_esc(post.get("category", "저널")),
        category_json=json.dumps(post.get("category", "저널"), ensure_ascii=False)[1:-1],
        naver_url=_esc(post["naver_url"]),
        body_html=body_html or "<p class='text-slate-500 italic'>본문 준비 중입니다.</p>",
        tags_html=tags_html,
    )


# ----------------------------------------------------------------------------
# Step 4: Render journal hub (index.html)
# ----------------------------------------------------------------------------

HUB_TEMPLATE = """<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="icon" href="/favicon.png" type="image/png">
    <title>제이유 하우징 저널 | 목조주택·전원주택 시공 인사이트</title>
    <meta name="description" content="제이유 하우징이 발행하는 목조주택·전원주택 시공 인사이트. 함수율 19% 미만 KD 구조재, ±0.5mm 레이저 프레이밍, 투명 원가 정산, 지역별 시공 노하우까지. 예비 건축주가 반드시 알아야 할 실전 가이드.">
    <meta name="keywords" content="목조주택 저널, 전원주택 매거진, 목조주택 시공 팁, 목조주택 평당가, 목조주택 추가공사비, 경사지 목조주택, SPF 구조재, 함수율 19%, 기초 콘크리트, 제이유 하우징">
    <link rel="canonical" href="https://juhousing.co.kr/journal/">
    <meta property="og:title" content="제이유 하우징 저널 | 목조주택 시공 인사이트">
    <meta property="og:description" content="함수율·프레이밍·정산·지역별 시공 노하우 — 예비 건축주 실전 가이드.">
    <meta property="og:url" content="https://juhousing.co.kr/journal/">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="제이유 하우징">
    <meta property="og:image" content="https://juhousing.co.kr/images/hero_main.webp">
    <meta property="og:image:width" content="1920">
    <meta property="og:image:height" content="1071">
    <meta property="og:image:alt" content="제이유 하우징 저널 — 목조주택 시공 인사이트">
    <meta property="og:locale" content="ko_KR">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:image" content="https://juhousing.co.kr/images/hero_main.webp">
    <script type="application/ld+json">
    {{"@context":"https://schema.org","@type":"CollectionPage","name":"제이유 하우징 저널","description":"목조주택·전원주택 시공 인사이트 매거진","url":"https://juhousing.co.kr/journal/","publisher":{{"@type":"Organization","name":"제이유 하우징","url":"https://juhousing.co.kr/","logo":{{"@type":"ImageObject","url":"https://juhousing.co.kr/logo.png"}}}},"inLanguage":"ko-KR"}}
    </script>
    <link rel="stylesheet" href="/css/tailwind.dist.css">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css">
    <script defer src="/js/ga-core.js"></script>
    <script defer src="/js/ga-events.js"></script>
</head>
<body class="bg-slate-50 text-slate-900 min-h-screen" style="font-family:Pretendard,sans-serif;">
    <header class="bg-[#1a237e] text-white px-4 py-6">
        <div class="max-w-4xl mx-auto flex items-center justify-between gap-4">
            <div>
                <p class="text-xs text-blue-200 font-semibold tracking-wide">JU HOUSING</p>
                <h1 class="text-xl sm:text-2xl font-extrabold leading-snug">저널 · Journal</h1>
                <p class="text-sm text-blue-100 mt-1">목조주택 시공 인사이트 · 예비 건축주 실전 가이드</p>
            </div>
            <a href="/" class="text-sm text-blue-200 hover:text-white underline underline-offset-4 shrink-0">홈으로</a>
        </div>
    </header>
    <main class="max-w-4xl mx-auto px-4 py-8 sm:py-10 space-y-8">
        <nav class="text-sm text-slate-500" aria-label="breadcrumb">
            <a href="/" class="hover:text-blue-700">홈</a>
            <span class="mx-1">/</span>
            <span class="text-slate-800 font-medium">저널</span>
        </nav>

        <section class="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
            <p class="text-blue-700 font-black text-sm tracking-wide">제이유 하우징 저널 · Editor's Note</p>
            <h2 class="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-2 mb-4 leading-snug tracking-tight">1mm의 정밀함, 10년의 노하우, 100편의 실전 기록</h2>
            <p class="text-slate-600 leading-relaxed text-pretty">
                제이유 하우징 저널은 목조주택·전원주택 시공 현장에서 축적된 실전 노하우를 정리한 인사이트 매거진입니다.
                <strong>캐나다 목재협회(CWC) 규격 구조재</strong>, <strong>함수율 19% 미만 KD 건조목</strong>, <strong>레이저 ±0.5mm 프레이밍</strong>, <strong>실시간 원가 정산</strong>까지 —
                예비 건축주가 시공사를 선택하고 계약·시공·정산 단계를 안전하게 통과하는 데 필요한 실전 지식을 발행합니다.
            </p>
        </section>

        <section aria-labelledby="pilot-heading" class="space-y-4">
            <h2 id="pilot-heading" class="text-xl sm:text-2xl font-extrabold text-slate-900">주요 기사 (Editor's Pick)</h2>
            <p class="text-sm text-slate-600">아래는 자체 도메인에서 전문(全文) 열람이 가능한 기사입니다. 이 외 최근 발행 기사는 아래 <a href="#recent" class="text-blue-700 underline">최근 발행 목록</a>에서 원문(네이버 블로그)으로 이동합니다.</p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
{pilot_cards}
            </div>
        </section>

        <section id="recent" aria-labelledby="recent-heading" class="space-y-4">
            <h2 id="recent-heading" class="text-xl sm:text-2xl font-extrabold text-slate-900">최근 발행 (50건)</h2>
            <p class="text-sm text-slate-600">RSS로 자동 수집한 목록입니다. 클릭 시 네이버 블로그 원문으로 이동합니다. 이관 우선순위가 정해진 기사부터 순차적으로 자체 도메인에 전문 이전 예정입니다.</p>
            <ul class="space-y-3">
{recent_items}
            </ul>
        </section>

        <section class="rounded-2xl bg-[#1a237e] text-white p-6 sm:p-8 space-y-4">
            <h3 class="text-xl font-extrabold">기사 주제에 관한 상담</h3>
            <p class="text-blue-100 text-sm leading-relaxed">저널에서 다룬 내용을 실제 현장에 적용하고 싶으신가요? 무료 상담을 통해 부지·평수·요구 스펙에 맞는 1차 가이드를 안내합니다.</p>
            <div class="flex flex-wrap gap-3">
                <a href="/consult.html" class="inline-flex items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-bold text-[#1a237e] hover:bg-blue-50">건축 상담 신청</a>
                <a href="/estimate.html" class="inline-flex items-center justify-center rounded-full border border-white/40 px-5 py-2.5 text-sm font-bold text-white hover:bg-white/10">예산 가이드</a>
                <a href="tel:010-2951-0431" class="inline-flex items-center justify-center rounded-full border border-white/40 px-5 py-2.5 text-sm font-bold text-white hover:bg-white/10">010-2951-0431</a>
            </div>
        </section>

        <p class="text-xs text-slate-500 text-center pt-4">
            원문 블로그: <a href="https://m.blog.naver.com/ju-housing" target="_blank" rel="noopener" class="text-blue-700 underline">m.blog.naver.com/ju-housing</a>
        </p>
    </main>
    <footer class="max-w-4xl mx-auto px-4 pb-12 text-xs text-slate-500 space-y-1">
        <p>제이유 하우징 · 경기도 양주시 부흥로 2128 · 대표전화 010-2951-0431</p>
        <p><a href="/terms.html" class="hover:text-blue-700">이용약관</a> · <a href="/privacy.html" class="hover:text-blue-700">개인정보처리방침</a></p>
    </footer>
</body>
</html>
"""


def render_pilot_card(post: dict, thumb_url: str | None = None) -> str:
    thumb = thumb_url or f"{CANONICAL_ORIGIN}/images/hero_main.webp"
    href = f"/journal/posts/{post['pid']}/"
    return (
        '<article class="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm hover:-translate-y-1 hover:shadow-lg transition-all">'
        f'<a href="{href}" class="flex flex-col flex-1 no-underline text-inherit">'
        '<div class="relative aspect-[16/9] overflow-hidden bg-slate-100">'
        f'<img src="{_esc(thumb)}" alt="{_esc(post["title"])}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" decoding="async" referrerpolicy="no-referrer">'
        '</div>'
        '<div class="p-5 sm:p-6 flex flex-1 flex-col">'
        f'<span class="text-xs font-bold text-blue-700 uppercase tracking-wide">{_esc(post.get("category", "저널"))}</span>'
        f'<h3 class="mt-2 text-base sm:text-lg font-bold text-slate-900 leading-snug tracking-tight">{_esc(post["title"])}</h3>'
        f'<p class="mt-2 text-xs sm:text-sm text-slate-600 leading-relaxed line-clamp-3">{_esc(post.get("description", "")[:150])}</p>'
        f'<time class="mt-4 text-xs text-slate-500" datetime="{post["pub_iso"]}">{post["pub_display"]}</time>'
        '</div></a></article>'
    )


def render_recent_item(post: dict) -> str:
    return (
        '<li class="border border-slate-200 rounded-xl bg-white px-4 py-3 hover:bg-slate-50 transition-colors">'
        f'<a href="{_esc(post["naver_url"])}" target="_blank" rel="noopener" class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 no-underline text-inherit">'
        '<div class="min-w-0 flex-1">'
        f'<span class="text-[10px] font-bold text-blue-700 uppercase tracking-wide">{_esc(post.get("category", "저널"))}</span>'
        f'<p class="text-sm font-semibold text-slate-900 mt-0.5 truncate">{_esc(post["title"])}</p>'
        '</div>'
        f'<time class="text-xs text-slate-500 shrink-0" datetime="{post["pub_iso"]}">{post["pub_display"]}</time>'
        '</a></li>'
    )


# ----------------------------------------------------------------------------
# Step 5: Sitemap update
# ----------------------------------------------------------------------------

def update_sitemap(pilot_urls: list[str]) -> None:
    if not SITEMAP_PATH.exists():
        print(f"[sitemap] {SITEMAP_PATH} not found, skipping")
        return
    sm_text = SITEMAP_PATH.read_text(encoding="utf-8")

    entries_to_add: list[str] = []
    hub_url = f"{CANONICAL_ORIGIN}/journal/"
    if hub_url not in sm_text:
        entries_to_add.append(
            f"  <url>\n    <loc>{hub_url}</loc>\n    <changefreq>daily</changefreq>\n    <priority>0.8</priority>\n  </url>"
        )
    for u in pilot_urls:
        if u not in sm_text:
            entries_to_add.append(
                f"  <url>\n    <loc>{u}</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>"
            )
    if not entries_to_add:
        print("[sitemap] all journal URLs already present")
        return
    injection = "\n" + "\n".join(entries_to_add) + "\n"
    sm_text = sm_text.replace("</urlset>", f"{injection}</urlset>", 1)
    SITEMAP_PATH.write_text(sm_text, encoding="utf-8")
    print(f"[sitemap] added {len(entries_to_add)} entries")


# ----------------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--rss-only", action="store_true", help="Only refresh RSS metadata")
    ap.add_argument("--index-only", action="store_true", help="Only rebuild journal hub")
    ap.add_argument("--pilot-only", action="store_true", help="Only render pilot posts")
    args = ap.parse_args()

    JOURNAL_ROOT.mkdir(parents=True, exist_ok=True)
    POSTS_ROOT.mkdir(parents=True, exist_ok=True)

    # Step 1: RSS metadata
    if args.index_only and POSTS_JSON.exists():
        print("[rss] loading cached posts.json")
        posts = json.loads(POSTS_JSON.read_text(encoding="utf-8"))
    else:
        print(f"[rss] fetching {RSS_URL}")
        posts = fetch_rss_metadata()
        POSTS_JSON.write_text(
            json.dumps(posts, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(f"[rss] saved {len(posts)} items to {POSTS_JSON.relative_to(ROOT)}")

    if args.rss_only:
        return 0

    # Step 2 & 3: Fetch pilots + render pages
    pilot_urls: list[str] = []
    pilot_posts_with_thumbs: dict[str, tuple[dict, str]] = {}
    pid_to_post = {p["pid"]: p for p in posts}

    if not args.index_only:
        for pid in PILOT_IDS:
            post = pid_to_post.get(pid)
            if not post:
                print(f"[pilot] {pid}: not in RSS (skipped)")
                continue
            print(f"[pilot] fetching {pid}: {post['title'][:50]}")
            try:
                body_html, first_img = fetch_full_post(pid)
            except Exception as e:
                print(f"[pilot] {pid}: fetch failed — {e}")
                continue
            if not body_html:
                print(f"[pilot] {pid}: se-main-container not found")
                continue
            # Mirror first content image locally for og:image + hub thumb
            # (avoids hotlinking Naver CDN / domain authority stays on juhousing.co.kr).
            og_image = mirror_og_image(pid, first_img)
            page_html = render_post_page(post, body_html, og_image)

            post_dir = POSTS_ROOT / pid
            post_dir.mkdir(parents=True, exist_ok=True)
            (post_dir / "index.html").write_text(page_html, encoding="utf-8")
            print(
                f"[pilot] wrote {post_dir.relative_to(ROOT)}/index.html "
                f"({len(page_html)} bytes, body {len(body_html)} bytes)"
            )
            pilot_urls.append(f"{CANONICAL_ORIGIN}/journal/posts/{pid}/")
            pilot_posts_with_thumbs[pid] = (post, og_image)
            time.sleep(RATE_LIMIT_SECONDS)

    # Step 4: Render hub
    pilot_cards_html: list[str] = []
    for pid in PILOT_IDS:
        if pid in pilot_posts_with_thumbs:
            post, thumb = pilot_posts_with_thumbs[pid]
        else:
            post = pid_to_post.get(pid)
            thumb = None
            if not post:
                continue
        pilot_cards_html.append(render_pilot_card(post, thumb))

    recent_items_html = [render_recent_item(p) for p in posts]

    hub_html = HUB_TEMPLATE.format(
        pilot_cards="\n".join(pilot_cards_html) or '<p class="text-slate-500">준비 중입니다.</p>',
        recent_items="\n".join(recent_items_html),
    )
    (JOURNAL_ROOT / "index.html").write_text(hub_html, encoding="utf-8")
    print(f"[hub] wrote html/journal/index.html ({len(hub_html)} bytes)")

    # Step 5: Sitemap
    update_sitemap(pilot_urls)

    print("\n[done] journal build complete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
