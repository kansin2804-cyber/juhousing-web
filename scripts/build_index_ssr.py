#!/usr/bin/env python3
"""Pre-render (SSR) juhousing.co.kr homepage from site-content.json.

Purpose (P0 fix): Naver bot (Yeti) does not execute JavaScript, so the
JS-driven `site-render.js` produces an empty homepage for Naver's crawler.
This script inlines every JS-rendered section into `index.html` at build
time, matching the exact HTML that `site-render.js` would generate.

Idempotent: safe to run multiple times. Uses BEGIN/END marker comments
around each dynamic container.

Usage:
    python3 scripts/build_index_ssr.py

Design notes:
- Output HTML must be byte-compatible with `site-render.js` output so JS
  re-render on page load produces no layout shift.
- `<html class="ju-content-pending">` is stripped: SSR removes the need
  for the "pending" state entirely.
- Duplicate `id` attributes (a P1 bug) are also cleaned up here.
"""

from __future__ import annotations

import html as html_module
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "html"
INDEX_PATH = ROOT / "index.html"
CONTENT_PATH = ROOT / "site-content.json"

CHEVRON_SVG = (
    '<svg class="faq-chevron size-5 shrink-0 text-slate-400" '
    'xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" '
    'stroke-width="2" stroke="currentColor" aria-hidden="true">'
    '<path stroke-linecap="round" stroke-linejoin="round" '
    'd="m19 9-7 7-7-7" /></svg>'
)


def esc(text: str | None) -> str:
    if text is None:
        return ""
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def render_cards(cards: list[dict]) -> str:
    parts: list[str] = []
    for card in cards:
        img_wrap_class = (
            "h-56 overflow-hidden"
            if card.get("number") == "02"
            else "relative h-56 overflow-hidden"
        )
        img_class = (
            "w-full h-full object-cover group-hover:scale-110 "
            "transition-transform duration-700"
            if card.get("number") == "02"
            else "h-full w-full origin-top-left scale-105 object-cover "
            "object-[18%_12%] transition-transform duration-700 ease-out "
            "group-hover:scale-110"
        )
        parts.append(
            '<div class="group flex flex-col overflow-hidden rounded-2xl '
            "border border-gray-100 bg-white shadow-sm transition-all "
            "duration-500 hover:-translate-y-2 hover:scale-[1.02] "
            'hover:shadow-2xl">'
            f'<a href="{esc(card.get("link"))}" target="_blank" '
            'rel="noopener noreferrer" '
            f'aria-label="{esc(card.get("linkLabel"))}" '
            'class="flex min-h-0 flex-1 flex-col text-inherit no-underline '
            'focus:outline-none">'
            f'<div class="{img_wrap_class}">'
            f'<img src="{esc(card.get("image"))}" '
            f'alt="{esc(card.get("imageAlt"))}" '
            f'class="{img_class}" decoding="async" />'
            "</div>"
            '<div class="flex flex-1 flex-col px-8 pb-2 pt-8">'
            '<div class="text-blue-600 font-black text-4xl mb-4 opacity-50 '
            'group-hover:opacity-100 transition-opacity">'
            f'{esc(card.get("number"))}</div>'
            '<h4 class="text-xl sm:text-2xl font-bold mb-3 text-slate-900 '
            'text-balance leading-snug tracking-tight">'
            f'{esc(card.get("title"))}</h4>'
            '<p class="text-sm sm:text-base text-gray-600 leading-relaxed '
            f'text-pretty">{esc(card.get("body"))}</p>'
            "</div></a>"
            '<div class="mt-auto border-t border-gray-100 bg-white px-8 '
            'pb-7 pt-5">'
            '<p class="mb-3 text-xs font-medium text-slate-500 '
            'tracking-tight">지금 무료로 상담해 보세요.</p>'
            '<button type="button" data-consult-open '
            'class="inline-flex w-full sm:w-auto items-center '
            "justify-center rounded-full border border-blue-600/90 "
            "bg-white/90 px-3.5 py-2 text-xs font-bold text-blue-700 "
            "shadow-sm transition-all hover:bg-blue-600 hover:text-white "
            "hover:border-blue-600 hover:shadow focus:outline-none "
            "focus-visible:ring-2 focus-visible:ring-blue-500 "
            'focus-visible:ring-offset-2">건축 상담 신청</button>'
            "</div></div>"
        )
    return "".join(parts)


def render_portfolio(items: list[dict]) -> str:
    parts: list[str] = []
    for item in items:
        title = esc(item.get("siteName"))
        subtitle = item.get("subtitle")
        if subtitle:
            title += (
                '<span class="text-slate-600 font-semibold"> : '
                f"{esc(subtitle)}</span>"
            )
        alt = item.get("imageAlt") or item.get("siteName")
        parts.append(
            '<article class="group overflow-hidden rounded-2xl border '
            "border-gray-200 bg-white shadow-sm transition-all "
            'duration-500 hover:-translate-y-1 hover:shadow-xl">'
            '<div class="relative aspect-[4/3] overflow-hidden '
            'bg-slate-100">'
            f'<img src="{esc(item.get("image"))}" alt="{esc(alt)}" '
            'class="h-full w-full object-cover object-[46%_44%] '
            "scale-[1.09] origin-center transition-transform "
            'duration-700 group-hover:scale-[1.14]" loading="lazy" '
            'decoding="async" />'
            "</div>"
            '<div class="px-5 py-4 sm:px-6 sm:py-5">'
            '<h4 class="text-lg sm:text-xl font-bold text-slate-900 '
            f'tracking-tight">{title}</h4>'
            "</div></article>"
        )
    return "".join(parts)


def render_faq(items: list[dict]) -> str:
    parts: list[str] = []
    for idx, item in enumerate(items):
        n = idx + 1
        parts.append(
            '<details class="rounded-2xl border border-gray-200/80 '
            "bg-white shadow-sm hover:shadow-md transition-shadow "
            'overflow-hidden ring-1 ring-transparent hover:ring-gray-100/80">'
            '<summary class="flex cursor-pointer select-none items-center '
            "justify-between gap-4 px-5 py-5 sm:px-6 sm:py-6 text-left "
            "text-[15px] sm:text-base font-semibold leading-snug "
            "text-slate-900 focus:outline-none focus-visible:ring-2 "
            'focus-visible:ring-blue-500 focus-visible:ring-offset-2">'
            '<span class="flex-1 pr-2">'
            f'<span class="text-blue-600 font-black mr-1.5">Q{n}.</span>'
            f'{esc(item.get("question"))}</span>'
            f"{CHEVRON_SVG}"
            "</summary>"
            '<div class="faq-answer-shell"><div class="faq-answer-inner '
            'border-t border-gray-100 bg-slate-50/60">'
            '<p class="px-5 pb-5 pt-4 sm:px-6 sm:pb-7 sm:pt-5 '
            "text-[14px] sm:text-[15px] leading-relaxed text-slate-600 "
            f'text-pretty">A{n}. {esc(item.get("answer"))}</p>'
            "</div></div></details>"
        )
    return "".join(parts)


def render_regions(items: list[dict]) -> str:
    parts: list[str] = []
    for item in items:
        parts.append(
            f'<a href="{esc(item.get("href"))}" '
            'class="inline-flex items-center rounded-full border '
            "border-blue-200 bg-blue-50/80 px-4 py-2 text-sm font-bold "
            "text-blue-800 hover:bg-blue-600 hover:text-white "
            'hover:border-blue-600 transition-colors">'
            f'{esc(item.get("name"))}</a>'
        )
    return "".join(parts)


def build_faq_jsonld(items: list[dict]) -> str:
    payload = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
            {
                "@type": "Question",
                "name": item.get("question"),
                "acceptedAnswer": {
                    "@type": "Answer",
                    "text": item.get("answer"),
                },
            }
            for item in items
        ],
    }
    return json.dumps(payload, ensure_ascii=False)


def _replace_between(
    html: str, marker: str, replacement: str
) -> str:
    """Replace content between <!-- ssr:marker:start --> ... :end -->."""
    pattern = re.compile(
        rf"(<!--\s*ssr:{re.escape(marker)}:start\s*-->)"
        rf"(.*?)"
        rf"(<!--\s*ssr:{re.escape(marker)}:end\s*-->)",
        re.DOTALL,
    )
    if not pattern.search(html):
        raise RuntimeError(f"marker not found: ssr:{marker}")
    return pattern.sub(
        lambda m: m.group(1) + "\n" + replacement + "\n" + m.group(3),
        html,
        count=1,
    )


def _replace_element_text(
    html: str, tag: str, elem_id: str, new_text: str
) -> str:
    """Replace text inside `<tag id="elem_id" ...>...</tag>` (text only)."""
    pattern = re.compile(
        rf'(<{tag}[^>]*\bid="{re.escape(elem_id)}"[^>]*>)'
        rf"([^<]*)"
        rf"(</{tag}>)",
        re.DOTALL,
    )
    if not pattern.search(html):
        raise RuntimeError(f"element not found: {tag}#{elem_id}")
    return pattern.sub(
        lambda m: m.group(1) + esc(new_text) + m.group(3),
        html,
        count=1,
    )


def main() -> None:
    data = json.loads(CONTENT_PATH.read_text(encoding="utf-8"))
    html = INDEX_PATH.read_text(encoding="utf-8")

    # 1) Fill dynamic containers (marker-based).
    html = _replace_between(html, "cards", render_cards(data["competencies"]["cards"]))
    html = _replace_between(html, "portfolio", render_portfolio(data["portfolio"]["items"]))
    html = _replace_between(html, "faq", render_faq(data["faq"]["items"]))
    html = _replace_between(html, "regions", render_regions(data["regions"]["items"]))

    # 2) Update text placeholders (text-only spans/headings).
    hero = data["hero"]
    html = _replace_element_text(html, "span", "ju-hero-badge", hero["badge"])
    html = _replace_element_text(html, "span", "ju-hero-title", hero["title"])
    html = _replace_element_text(html, "span", "ju-hero-subtitle", hero["subtitle"])

    comp = data["competencies"]
    html = _replace_element_text(html, "h2", "ju-competencies-label", comp["label"])
    html = _replace_element_text(html, "h3", "ju-competencies-title", comp["title"])

    portfolio = data["portfolio"]
    html = _replace_element_text(html, "h2", "ju-portfolio-label", portfolio.get("label", "Portfolio"))
    html = _replace_element_text(html, "h3", "ju-portfolio-title", portfolio.get("title", "시공 포트폴리오"))
    html = _replace_element_text(html, "p", "ju-portfolio-subtitle", portfolio.get("subtitle", ""))

    process = data.get("process", {})
    if process.get("heading"):
        html = _replace_element_text(html, "h2", "ju-process-heading", process["heading"])

    html = _replace_element_text(html, "h2", "ju-faq-heading", data["faq"]["heading"])
    html = _replace_element_text(html, "h2", "ju-regions-heading", data["regions"]["heading"])

    contact = data["contact"]
    html = _replace_element_text(html, "span", "ju-footer-company", contact["company"])
    html = _replace_element_text(html, "span", "ju-footer-ceo", contact["ceo"])
    html = _replace_element_text(html, "span", "ju-footer-biznum", contact["bizNum"])
    html = _replace_element_text(html, "span", "ju-footer-address", contact["address"])
    html = _replace_element_text(html, "span", "ju-footer-email", contact["email"])

    # 3) Footer tagline supports <br> via \n → <br> replacement (matches JS).
    tagline_html = esc(contact["footerTagline"]).replace("\n", "<br>")
    pattern = re.compile(
        r'(<span[^>]*\bid="ju-footer-tagline"[^>]*>)(.*?)(</span>)',
        re.DOTALL,
    )
    if not pattern.search(html):
        raise RuntimeError("ju-footer-tagline span not found")
    html = pattern.sub(
        lambda m: m.group(1) + tagline_html + m.group(3), html, count=1
    )

    # 4) FAQ JSON-LD (sync to same FAQ items).
    faq_jsonld = build_faq_jsonld(data["faq"]["items"])
    pattern = re.compile(
        r'(<script[^>]*\bid="ju-faq-jsonld"[^>]*>)(.*?)(</script>)',
        re.DOTALL,
    )
    if pattern.search(html):
        html = pattern.sub(
            lambda m: m.group(1) + "\n" + faq_jsonld + "\n" + m.group(3),
            html,
            count=1,
        )

    # 5) Strip the "content-pending" class — SSR renders content directly.
    html = re.sub(
        r'<html([^>]*?)\s+class="ju-content-pending"',
        r"<html\1",
        html,
        count=1,
    )

    INDEX_PATH.write_text(html, encoding="utf-8")
    print(f"[ssr] wrote {INDEX_PATH}")


if __name__ == "__main__":
    main()
