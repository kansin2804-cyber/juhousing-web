# Homepage CTA Analytics (GA4)

Measurement ID: `G-X1X65GX1TP` (`html/js/ga-core.js`)

## Event

All CTA interactions send:

- event name: `ju_cta_click`
- params:
  - `cta_id` — action type
  - `cta_placement` — where on the page
  - `cta_label` — visible label (truncated)
  - `page_path`
  - optional `source`

## cta_id values

| cta_id | Meaning |
|--------|---------|
| `consult_open` | Open consult modal |
| `consult_submit` | Submit consult form |
| `consult_submit_success` | Server/webhook accepted |
| `estimate_link` | Click estimate/budget guide |
| `phone_call` | Click `tel:` |
| `philosophy_scroll` | Hero secondary → philosophy |
| `diagnosis_open` | Cost diagnosis modal |
| `chat_open` | Chat / SMS entry |
| `chat_intake_success` | Chat intake success |
| `estimate_calc_submit` | Estimate calculator submit |

## cta_placement values (homepage)

| placement | Location |
|-----------|----------|
| `nav` | Desktop header consult |
| `mobile_nav` | Mobile menu consult |
| `hero` | Hero primary consult |
| `hero_secondary` | Hero “시공 철학 보기” |
| `about` | About section CTA |
| `philosophy` | Philosophy section CTA |
| `mid` | Mid-page consult CTA |
| `mid_secondary` | Mid-page estimate link |
| `final` | Final consult CTA |
| `final_secondary` | Final phone CTA |
| `competency_card` | Spec card consult buttons |

## GA4 exploration tip

1. Reports → Engagement → Events → `ju_cta_click`
2. Add secondary dimension / breakdown: `cta_placement`
3. Funnel suggestion:
   - `consult_open` → `consult_submit` → `consult_submit_success`
   - compare conversion by `cta_placement` (hero vs mid vs final)

## Local verify

In browser DevTools:

```js
// temporary peek
window.dataLayer.filter(x => x[0] === 'event' || (x.event === 'ju_cta_click'))
```

Or install GA Debugger / watch Network to `google-analytics.com/g/collect`.
