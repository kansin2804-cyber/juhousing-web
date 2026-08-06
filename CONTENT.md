# 제이유 하우징 홈페이지 — Cursor 편집 가이드

관리자 화면 없이 **Cursor + JSON + 이미지 폴더**로 내용을 바꿉니다.

## 핵심 파일

| 파일 | 용도 |
|------|------|
| `html/site-content.json` | 히어로, 회사소개, 시공철학, CTA, 카드, FAQ, 지역, 연락처, SNS, SEO |
| `html/site-content-process.json` | 시공 5단계 상세 글 (HTML 조각) |
| `html/js/site-render.js` | JSON → 화면 반영 (건드릴 일 거의 없음) |
| `html/framing-detail.html` 등 | 강점 카드 상세 (404 방지) |
| `html/regions/*.html` | 지역/키워드 랜딩 (가평·양주·화성·양평) |
| `html/sitemap.xml` | 검색엔진 URL 목록 |
| `html/logo.png` | 상단 로고 |
| `html/images/hero_main.jpg` | 메인 히어로 배경 |
| `html/101.png` … `106.png` | 시공 프로세스 인포그래픽 |

## 자주 하는 수정

### 히어로 문구/사진

`site-content.json`:

```json
"hero": {
  "image": "images/hero_main.jpg",
  "title": "메인 제목",
  "subtitle": "부제목"
}
```

사진만 바꿀 때: `images/hero_main.jpg` 파일을 같은 이름으로 교체.

### 강점 카드 (3개)

`site-content.json` → `competencies.cards[]`  
각 항목: `title`, `body`, `image`, `imageAlt`, `link`

### FAQ 추가

`site-content.json` → `faq.items` 배열에 객체 추가:

```json
{ "question": "질문", "answer": "답변" }
```

### 시공 단계 긴 글

`site-content-process.json` → `articles["1"]` ~ `["5"]`  
값은 HTML 문자열 (`<article>...</article>`).

### 전화번호

`site-content.json` → `contact.phone`, `contact.phoneDisplay`  
한 번 수정하면 푸터·링크에 자동 반영.

## Cursor에게 이렇게 요청

- 「site-content.json FAQ 2번 답변을 …로 바꿔줘」
- 「히어로 사진을 이 파일로 교체해줘」
- 「3번 카드 제목/본문 수정해줘」

## 주의

- `index.html`에 로고 base64 넣지 마세요 → `logo.png` 사용
- 카드/FAQ를 index.html에 직접 쓰지 마세요 → JSON 사용
- 구조가 깨지면: `python3 setup_site_content.py` (재패치용, 평소 불필요)
