# neutral-atom-landscape

중성원자/Rydberg 양자컴퓨팅 연구 지형도. 데이터는 `data/`, 스키마는
`src/data/schema.ts`, 규칙은 `SPEC.md`·`CLAUDE.md` 참조.

**라이브:** https://junwoojung0908.github.io/neutral-atom-landscape/

## 배포
`.github/workflows/deploy.yml` 참조. **`npm run validate` 가 build 앞의 게이트다** —
데이터 검증이 실패하면 build/배포에 도달하지 못하므로, 검증 안 된 서지(refs 누락·verified
미기입은 경고, 계층 위반 등은 실패)가 사이트에 도달할 수 없다. 완성돼 검증을 통과한 항목만
`main` 에 커밋할 것.

`main` push 마다 validate → build → GitHub Pages 배포가 자동 실행된다.

## 데이터 추가 방법
1. **노드 추가**: `data/entities.json` 에 항목을 넣는다. `refs`(DOI 또는 arXiv)를
   **최소 1개**, `verified`(눈으로 확인한 `YYYY-MM-DD`)를 반드시 채운다.
2. **가지**: `fields` 에는 `data/fields.json` 의 `id` 만 쓴다. 여러 가지에 걸치면 모두 나열.
3. **비중**: `weight`(1–5)는 인용수가 아니라 "이 방향을 규정한 정도"이며,
   `weight_rationale` 에 근거를 반드시 적는다.
4. **관계 추가**: `data/edges.json` 에 `{from, to, rel}`. `rel` 은
   `proposes→implements · extends · alternative-to · spinoff · contests` 중 하나.
5. **검증**: `npm run validate` 가 통과해야 한다(실패 시 exit 1).

## 명령
- `npm run validate` — 데이터 스키마·참조·비중 분포 검증
- `npm run dev` / `npm run build` — 앱 (M1 이후)
