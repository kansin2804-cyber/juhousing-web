# JU Website — Agent Harness

제이유 하우징 공개 사이트 (nginx :8081, JSON 콘텐츠).

## 검증 (Harness Validation)

```bash
cd /home/ju/ju_website
make harness-offline   # pytest only
make harness-smoke     # n8n consult + render_server estimate (spam-safe)
make harness-cross-stack  # render + nginx + n8n (3-tier)
make harness           # pytest + live smoke
```

### Live smoke 환경 변수

| Variable | Default |
|---|---|
| `JU_WEBSITE_N8N_WEBHOOK_BASE` | `https://n8n.juhousing.co.kr/webhook` |
| `JU_WEBSITE_RENDER_BASE` | `http://127.0.0.1:8000` |
| `JU_WEBSITE_HARNESS_BASE_URL` | `http://127.0.0.1:8081` (nginx, cross-stack) |
| `JU_CROSS_STACK_REQUIRE_LIVE` | unset (tier down → skip) |
| `JU_WEBSITE_HARNESS_REQUIRE_LIVE` | unset (n8n 없으면 smoke skip) |

Live smoke는 **spam-filter 경로**만 사용 (`_ju_ts:0`) — NVIDIA AI 호출·실제 상담 접수 없음.

## Harness 게이트 (공통 감시 대상)

- `html/site-content.json` — meta, contact, competencies, FAQ
- region·competency 링크 → 실제 HTML 파일 존재
- `nginx/default.conf` — render_server proxy, CSP n8n, reels alias
- `docker-compose.yml` nginx 서비스
- `html/timber-designer/` — Three.js 3D CAD 엔진 및 라이브러리 정합성 (test_timber_designer.py)
- **상담 챗봇 ↔ n8n** — `test_consult_chatbot.py` (consult-chat / blog-consult 3-file wiring)
- **공개 견적** — `test_estimate_wiring.py` + `harness/smoke/estimate_render.sh` (`/website/estimate-guide` → render_server)

### 상담 챗봇 n8n 연동 (Producer 체크리스트)

**URL 정본:** `html/js/ju-webhooks.js` (`window.JUWebhooks`) — 다른 파일에 webhook URL 하드코딩 금지

| Check | Frontend | n8n workflow |
|---|---|---|
| AI 채팅 | `consult-chatbot.js` → `JUWebhooks.consultChat` | `workflows/zPY9EBN2yQW1wLWm.json` |
| 상담 접수 | `index.html` / `consult.html` / `regions/*.html` → `JUWebhooks.blogConsult` | `workflows/Hpg9ZTSwiMs4HTmA.json` |
| 견적 fallback | `estimate.html` → `JUWebhooks.estimateGuide` | `dDNTfFvS2HYT9hBg.json` |
| 스팸 방어 | `webhook-guard.js` + 챗봇 intake `checkRateLimit('chat_intake')` | workflow spam filter node |
| CSP | `nginx/default.conf` `connect-src` → `n8n.juhousing.co.kr` | CORS `allowedOrigins` |

변경 시 **양쪽** 검증: `ju_website` + `workflows` harness-offline

**AI 채팅은 n8n 직결** — `render_server` `/website/consult-chat` 라우트 사용 안 함 (견적만 `/website/estimate-*` 프록시)

## 에이전트 팀 (Agent Team)

작업 공간 내에 정의된 에이전트 역할군입니다. [harness](file:///home/ju/ju_website/.agents/skills/harness/SKILL.md) 메타 스킬에 의해 관리됩니다.

| 에이전트명 | 정의 파일 | 역할 |
|---|---|---|
| [Orchestrator](file:///home/ju/ju_website/.agents/agents/orchestrator.md) | `.agents/agents/orchestrator.md` | 작업 분할 및 총괄 조율 |
| [UI Builder](file:///home/ju/ju_website/.agents/agents/ui_builder.md) | `.agents/agents/ui_builder.md` | HTML 마크업, JSON 콘텐츠 동기화 |
| [Backend Keeper](file:///home/ju/ju_website/.agents/agents/backend_keeper.md) | `.agents/agents/backend_keeper.md` | Nginx 인프라, n8n 연동 API 및 DB |
| [QA Agent](file:///home/ju/ju_website/.agents/agents/qa_agent.md) | `.agents/agents/qa_agent.md` | 리그레션 테스트 (`make harness-offline`) 검증 |

## 스킬 목록 (Agent Skills)

| 스킬명 | 경로 | 설명 |
|---|---|---|
| [harness](file:///home/ju/ju_website/.agents/skills/harness/SKILL.md) | `.agents/skills/harness/` | 에이전트 팀 구성 및 스킬 자동 설계 (메타 스킬) |
| [zero_error_core_skills](file:///home/ju/ju_website/.agents/skills/zero_error_core_skills/SKILL.md) | `.agents/skills/zero_error_core_skills/` | 제로 에러 프론트엔드/코딩 원칙 |
| [n8n_database_integrity_keeper](file:///home/ju/ju_website/.agents/skills/n8n_database_integrity_keeper/SKILL.md) | `.agents/skills/n8n_database_integrity_keeper/` | 데이터베이스 및 n8n 백엔드 무결성 유지 |

연동 API: `/home/ju/n8n-media/render_server.py` (:8000)

## Cursor Rules

- `.cursor/rules/timber-designer-3d.mdc` — Three.js CAD 엔진·치수 계산·렌더러 보호
- `.cursor/rules/seo-content-guard.mdc` — SEO·site-content.json·sitemap·region 페이지
- `.cursor/rules/consult-chatbot-safety.mdc` — 상담 챗봇·webhook·CSP 연동 보호

## Git & Cursor Hooks

`html/`, `nginx/`, `harness/` 편집 후 → `make harness-offline` 자동 실행  
끄기: `export JU_WEBSITE_HARNESS_HOOK=off`  
로그: `harness/.hook-state/last-run.log`

