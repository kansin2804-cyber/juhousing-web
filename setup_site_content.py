#!/usr/bin/env python3
"""One-time / re-run patch: wire index.html to site-content.json (no admin UI)."""

from __future__ import annotations

import re
from pathlib import Path

HTML = Path(__file__).resolve().parent / "html" / "index.html"


def replace_logo(html: str) -> str:
    if 'id="ju-brand-logo"' in html:
        return html
    return re.sub(
        r'<img src="data:image/png;base64,[^"]+"',
        '<img id="ju-brand-logo" src="logo.png"',
        html,
        count=1,
    )


def patch_hero(html: str) -> str:
    html = html.replace(
        "Premium Wooden House",
        '<span id="ju-hero-badge">Premium Wooden House</span>',
        1,
    )
    html = re.sub(
        r"(<h1 class=\"text-balance[^>]+>)\s*보이지 않는 1%의 차이가 100년의 주거 가치를 결정합니다\s*(</h1>)",
        r'\1<span id="ju-hero-title">보이지 않는 1%의 차이가 100년의 주거 가치를 결정합니다</span>\2',
        html,
        count=1,
    )
    html = re.sub(
        r"(<p class=\"text-base sm:text-lg md:text-2xl text-gray-200[^>]+>)\s*북미산 최상급 SPF[^<]+\s*(</p>)",
        r"\1<span id=\"ju-hero-subtitle\">북미산 최상급 SPF 구조목과 정밀 데이터 시공으로 완성하는 하이엔드 목조주택</span>\2",
        html,
        count=1,
    )
    return html


def patch_competencies(html: str) -> str:
    if 'id="ju-cards"' in html:
        return html.replace(
            ">Core Competencies</h2>",
            ' id="ju-competencies-label">Core Competencies</h2>',
            1,
        ).replace(
            ">제이유 하우징의 차별화된 스펙</h3>",
            ' id="ju-competencies-title">제이유 하우징의 차별화된 스펙</h3>',
            1,
        )
    html = html.replace(
        ">Core Competencies</h2>",
        ' id="ju-competencies-label">Core Competencies</h2>',
        1,
    )
    html = html.replace(
        ">제이유 하우징의 차별화된 스펙</h3>",
        ' id="ju-competencies-title">제이유 하우징의 차별화된 스펙</h3>',
        1,
    )
    pattern = (
        r'<div class="grid grid-cols-1 md:grid-cols-3 gap-10">.*?</div>\s*</div>\s*</section>\s*'
        r'<!-- Construction Process'
    )
    repl = (
        '<div id="ju-cards" class="grid grid-cols-1 md:grid-cols-3 gap-10"></div>\n'
        "        </div>\n"
        "    </section>\n\n"
        "    <!-- Construction Process"
    )
    return re.sub(pattern, repl, html, count=1, flags=re.DOTALL)


def patch_faq(html: str) -> str:
    html = html.replace(
        'id="faq-heading"',
        'id="ju-faq-heading"',
        1,
    )
    pattern = (
        r'(<div class="flex flex-col gap-3 sm:gap-4">).*?(</div>\s*</div>\s*</section>\s*'
        r'<!-- Footer / Contact -->)'
    )
    repl = r'\1\n                <div id="ju-faq-list" class="flex flex-col gap-3 sm:gap-4"></div>\n            \2'
    return re.sub(pattern, repl, html, count=1, flags=re.DOTALL)


def patch_footer(html: str) -> str:
    html = re.sub(
        r'(<p class="text-slate-400 max-w-sm[^>]+>)(.*?)(</p>)',
        r'\1<span id="ju-footer-tagline">\2</span>\3',
        html,
        count=1,
        flags=re.DOTALL,
    )
    html = html.replace(
        "<p>대표: 주승환 (CEO Joo Seung-hwan)</p>",
        '<p>대표: <span id="ju-footer-ceo">주승환 (CEO Joo Seung-hwan)</span></p>',
        1,
    )
    html = html.replace(
        "경기도 양주시 부흥로 2128",
        '<span id="ju-footer-address">경기도 양주시 부흥로 2128</span>',
        1,
    )
    html = re.sub(
        r'href="tel:010-2951-0431"([^>]*>)010-2951-0431',
        r'href="tel:01029510431"\1<span data-ju-phone>010-2951-0431</span>',
        html,
    )
    html = re.sub(
        r'href="sms:010-2951-0431"',
        r'href="sms:010-2951-0431" data-ju-sms-link',
        html,
    )
    html = html.replace(
        'href="https://m.blog.naver.com/ju-housing"',
        'id="ju-social-naver" href="https://m.blog.naver.com/ju-housing"',
        1,
    )
    html = html.replace(
        'href="https://www.instagram.com/juhousig?igsh=MWlpamwyY3FrcXltZw=="',
        'id="ju-social-instagram" href="https://www.instagram.com/juhousig?igsh=MWlpamwyY3FrcXltZw=="',
        1,
    )
    html = html.replace(
        'href="https://open.kakao.com/o/s3ODJdti"',
        'id="ju-social-kakao" href="https://open.kakao.com/o/s3ODJdti"',
        1,
    )
    html = html.replace(
        'href="https://youtu.be/cpo_Fo3ma-4?si=UefMNkZ4Ge3bCM4O"',
        'id="ju-social-youtube" href="https://youtu.be/cpo_Fo3ma-4?si=UefMNkZ4Ge3bCM4O"',
        1,
    )
    return html


def patch_process(html: str) -> str:
    html = html.replace(
        'id="process-heading"',
        'id="ju-process-heading"',
        1,
    )
    if "function bootProcess" in html:
        return html
    start = html.index("    <script>\n(function () {\n    var timeline = document.querySelector('#process-section .process-timeline');")
    end = html.index("})();\n    </script>\n\n</body>", start)
    block = html[start:end]
    # Remove embedded STEP_ARTICLE object
    art_start = block.index("    var STEP_ARTICLE = {")
    art_end = block.index("\n    };", art_start) + len("\n    };")
    block = block[:art_start] + block[art_end:]
    inject = (
        "    fetch('site-content-process.json', { cache: 'no-store' })\n"
        "        .then(function (res) { return res.ok ? res.json() : {}; })\n"
        "        .then(function (data) { bootProcess((data && data.articles) || {}); })\n"
        "        .catch(function () { bootProcess({}); });\n\n"
        "    function bootProcess(STEP_ARTICLE) {\n"
    )
    block = block.replace(
        "    if (!timeline) return;\n\n",
        "    if (!timeline) return;\n\n" + inject,
        1,
    )
    block = block.replace(
        "    hidePanel();\n})();",
        "    hidePanel();\n    }\n})();",
        1,
    )
    return html[:start] + block + html[end:]


def patch_phones(html: str) -> str:
    html = html.replace(
        'class="sticky-header__phone-mobile"',
        'data-ju-phone-link class="sticky-header__phone-mobile"',
        1,
    )
    html = html.replace(
        'class="sticky-header__quick-call"',
        'data-ju-phone-link class="sticky-header__quick-call"',
        1,
    )
    return html


def patch_head(html: str) -> str:
    if "ju-content-pending" not in html:
        html = html.replace(
            "<html lang=\"ko\">",
            "<html lang=\"ko\" class=\"ju-content-pending\">",
            1,
        )
    if "js/site-render.js" not in html:
        html = html.replace(
            "</head>",
            '    <script defer src="js/site-render.js"></script>\n</head>',
            1,
        )
    return html


def main() -> None:
    html = HTML.read_text(encoding="utf-8")
    html = replace_logo(html)
    html = patch_head(html)
    html = patch_hero(html)
    html = patch_competencies(html)
    html = patch_faq(html)
    html = patch_footer(html)
    html = patch_phones(html)
    html = patch_process(html)
    HTML.write_text(html, encoding="utf-8")
    print(f"patched {HTML} ({HTML.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
