# 프로젝트 규칙

이 저장소는 중성원자/Rydberg 양자컴퓨팅 연구 지형도 시각화입니다.

## 절대 규칙
1. `data/*.json` 의 **연구 항목(논문·그룹·서지정보 = entities/edges)** 을 절대 새로
   생성하지 마라. 사람이 직접 추가하거나, `scripts/enrich.ts` 가 API에서 가져온 것만
   유효하다. 예시 데이터가 필요하면 `label` 을 `"PLACEHOLDER_"` 로 시작시켜라.
   (참고: `data/fields.json` 의 **가지 분류(ontology)** 는 편집상의 구분이므로
    이 규칙의 대상이 아니다. 단, 가지의 `wavelength_nm` 은 물리량 주장이므로
    불확실하면 null 로 두고 `wavelength_note` 에 근거를 남겨라.)
2. 논문 제목, 저자, 저널, 권호, 연도, DOI, arXiv ID를 기억에서 채우지 마라.
   불확실하면 빈 값으로 두고 TODO 주석을 남겨라.
3. 스키마 변경은 항상 `src/data/schema.ts` 와 `scripts/validate.ts` 를 함께 고쳐라.

## 스택
Vite + TypeScript + React + d3-force + zod. 상태는 URL 쿼리스트링에 동기화.
스타일은 CSS 변수 기반, 프레임워크 없음.

## 작업 방식
- 한 번에 한 마일스톤만. 끝나면 멈추고 보고하라.
- `SPEC.md` 의 레이아웃 규칙(§3)은 수식대로 구현하라. 임의 해석 금지.
- 1차 가지는 9개로 확정 (기존 8개 + `classical` = 고전 시뮬레이션·벤치마킹 논쟁).

## git 관례
- `data/` 변경과 `src/`·`scripts/` 변경을 같은 커밋에 섞지 마라.
- `data/query.json` 변경은 **항상 단독 커밋**으로 하고, 커밋 메시지에 무엇을 왜
  바꿨는지 **숫자와 함께** 적어라. "update query" 서른 개는 로그가 아니다. 형식:

  ```
  data(query): <가지> — <무엇을 바꿨나>

  <왜 바꿨나>
  <가지> N% → M%, 미분류 N% → M%.
  ```

  이 로그가 택소노미 개정의 방법론 기록이 된다("질의 버전 보존"이 git 으로 공짜 해결).
  나중에 사이트에서 `git log data/query.json` 으로 "질의 개정 이력"을 링크할 수 있다.
- 재생성 가능한 산출물(`corpus-raw.json` 등)은 커밋하지 마라 — .gitignore 참조.
- 커밋은 로컬 작업이다. 원격 생성·push·`gh repo create` 는 사람이 한다.
