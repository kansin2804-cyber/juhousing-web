# SEO / Trust checklist (Phase 3)

## Canonical NAP (사이트·네이버·구글 비즈니스 동일)

아래 문자열을 **띄어쓰기·하이픈까지 동일**하게 맞춥니다.

| 항목 | 값 |
|------|-----|
| 상호 | 제이유 하우징 |
| 영문 | JU Housing |
| 주소 | 경기도 양주시 부흥로 2128 |
| 전화 | 010-2951-0431 |
| 이메일 | kansin2804@gmail.com |
| 사업자등록번호 | 279-66-00830 |
| 대표 | 주승환 |

JSON-LD `PostalAddress`는 `streetAddress=부흥로 2128` + `addressLocality=양주시` + `addressRegion=경기도`로 분해합니다. 프로필 한 줄 주소는 위 전체 문자열을 사용하세요.

## Schema on homepage

- `HomeAndConstructionBusiness` — NAP / sameAs / areaServed
- `Service` — 북미식 경량 목조주택 시공
- `FAQPage` — `site-content.json` FAQ와 동기화 (`site-render.js`가 런타임에도 갱신)

## Intent titles

홈: `가평·양주·화성·양평 목조주택 시공 | 제이유 하우징`  
지역 랜딩은 이미 권역 intent title 유지.

## Perf notes (홈)

- hero `preload` + `fetchpriority=high`
- Pretendard `preconnect`
- hero onload/onerror console 제거
- sitemap core `lastmod` 갱신

## Manual (코드 밖)

1. Google Business Profile NAP = 위 표
2. 네이버 스마트플레이스 / 지도 NAP = 위 표
3. Search Console / 네이버 서치어드바이저에 sitemap 재제출
4. Lighthouse 모바일 점수 확인 (특히 LCP = hero image)
