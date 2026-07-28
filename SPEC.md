# SPEC — 중성원자 연구 지형도

작성 기준일: 2026-07-27

## 1. 목적
중성원자/Rydberg 분야에서 노력이 어디에 몰려 있고 어떤 방향들이 서로 이어지는지를,
신규 진입자가 20분 안에 파악하게 하는 인터랙티브 지도.

**비목표**: 전수 조사 아님. 인용 네트워크 시각화 아님. 실시간 자동 수집 아님.

## 2. 데이터 모델
`data/` 아래 세 파일. 코드와 완전히 분리하고, 스키마는 `src/data/schema.ts` 의 zod 로
정의해 빌드/검증 시 강제한다.

### 2.1 `fields.json` — 가지 (1차 9개, 2단계 계층 허용)
필드:
- `id` (string) — 하위 가지는 `parent.child` 형태 (예: `qec.ldpc`)
- `parent` (string | null) — 1차 가지는 null
- `ko`, `en` (string) — 이름
- `color` (string) — hex. 근거는 그 분야가 실제로 쓰는 레이저 선(파장).
- `wavelength_nm` (number | null) — 색의 근거가 되는 대표 파장. 이론/CS 성격의
  가지(`classical`)는 비스펙트럼이므로 null.
- `wavelength_note` (string, optional) — 어떤 전이/용도의 선인지, 비가시광 여부.
- `adjacent` (string[]) — 원형 배치 순서 최적화에 쓰는 인접 희망 목록.
- `blurb` (string) — 한 문단 설명.

**색을 파장에서 뽑는 이유**: 임의 팔레트는 정보가 없지만 파장은 그 분야 실험의
실제 물리량이다. 범례가 곧 스펙트럼이 된다. (813/1013/1064 nm 등은 비가시광 →
근사 표현이라는 각주 필요. `wavelength_note` 에 기록.)

1차 가지 9개: `sim`, `qec`, `gate`, `scale`, `transport`, `clock`, `cooling`,
`molecules`, `classical`.

### 2.2 `entities.json` — 노드
필드: `id`, `kind`("group"|"work"), `label`, `label_ko`(null 가능), `byline`,
`venue`, `year`, `fields`(string[]), `weight`(1–5), `weight_rationale`(string),
`thesis`(string), `refs`(최소 1개), `verified`(YYYY-MM-DD).

- `refs`: `{ type: "doi"|"arxiv", value: string }` 배열, **최소 1개 필수**.
- `verified`: 사람이 눈으로 확인한 날짜. **필수**.
- `weight` 는 인용수가 아니라 "이 방향을 규정한 정도". `weight_rationale` 에 근거 명시.

### 2.3 `edges.json` — 관계
필드: `from`, `to` (entity id), `rel`.
`rel` 은 5종으로 제한: `proposes→implements`, `extends`, `alternative-to`,
`spinoff`, `contests`.
`contests` = 논쟁 지점(예: MIS 양자이득 주장 ↔ 고전 알고리즘 반박). 지도의 핵심 정보.

## 3. 레이아웃 규칙 (수식대로 구현, 임의 해석 금지)

```
앵커:    n개 1차 가지를 원주에 등간격 배치. 각도 순서는 adjacent 관계의
         인접 위반 수를 최소화하도록 정렬 (작은 n이므로 완전탐색 가능).
목표점:  node.target = mean(해당 노드가 속한 1차 가지들의 앵커 좌표)
힘:      forceX/Y(target, 0.085) + forceCollide(r+7) + forceManyBody(-26)
반지름:  r = 5 + 3.2 * weight            // 선형
가지선:  fields.length >= 2 인 노드만, 각 소속 가지 앵커로 곡선 연결
```

### 3.1 축퇴(degeneracy) 해결 — (A)+(B) 동시 적용
서로 반대편 두 가지에 걸친 노드와 다섯 가지 전부에 걸친 노드가 둘 다 정중앙에
놓이는 문제. 해결:
- **(A) 반경 보정**: 소속 가지 수 `k` 로 구분.
  - `k == 2`: 두 앵커 사이 호(arc) 위에 배치 (둘레 쪽).
  - `k >= 3`: 중심 근처 "허브 링" 안에 배치 (중앙).
- **(B) 링 세그먼트**: 모든 노드 테두리를 소속 가지 수만큼 색 분할.
(A)가 배치 정보를, (B)가 중복 확인을 준다.

**⚠ 의도된 예외 — 되돌리지 말 것.** 위 §3 의 `node.target = mean(앵커 좌표)` 를 문자 그대로
읽으면 인접 두 앵커에 걸친 노드는 **현(chord) 중점** `R·cos(Δ/2)` 에 놓여야 한다(9-앵커면
Δ=40°, R=270 기준 `≈254`). 그러나 (A)는 k=2 를 **원주 위 각도 중점**으로 옮기라고 하므로
`r = R`(≈270)이 맞다. 즉 실측에서 k=1 과 k=2 노드가 **둘 다 r≈R** 로 나오는 것은 정상이다 —
반지름만으로는 둘이 구분되지 않고, 그 구분은 전적으로 **(B) 테두리 색분할**이 한다.
"무게중심 규칙과 안 맞는다"며 k=2 를 254(chord 중점)로 되돌리면 (A)가 조용히 사라지고
k=1/k=2 가 시각적으로 뒤섞인다. 구현: `src/lib/layout.ts` `targetFor()`.

### 3.1.1 표현 규칙 — 데이터가 아니라 렌더에서 정규화
`label` 대소문자는 출처마다 다르다(arXiv=Title Case, Crossref=문장식). **저장은 출처
그대로 두고, 표시할 때만 통일한다.** 데이터를 안 건드리므로 되돌릴 수 있고, "사실은 API,
표현은 우리" 원칙에 맞는다. hydrate 는 label 을 출처 그대로 저장하고, 정규화는 M1 렌더 층에서.

### 3.2 뷰 3종 (우선순위: 지형도 > 연표 > 계보)
| 뷰 | 축 | 질문 |
|---|---|---|
| 지형도 | 가지 무게중심 | 어디에 몰려 있나 |
| 연표 | x=연도, y=가지 레인 | 무게가 어떻게 이동했나 |
| 계보 | edges 기반 DAG | 어떤 제안이 무엇으로 구현됐나 |

## 4. 스택·배포·마일스톤
- 스택: Vite + TS + React + d3-force + zod. 상태는 URL 쿼리스트링 동기화.
- 배포: al-folio 사이트에는 `vite build --base=/assets/landscape/` 산출물을
  `assets/landscape/` 에 넣고 `<iframe>` 임베드 (Jekyll/React 빌드 분리).
- M0 스키마+검증+시드 / M1 지형도 / M2 연표 / M3 검증(enrich) / M4 계보.
