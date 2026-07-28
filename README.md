# neutral-atom-landscape

중성원자/Rydberg 양자컴퓨팅 연구 지형도. 데이터는 `data/`, 스키마는
`src/data/schema.ts`, 규칙은 `SPEC.md`·`CLAUDE.md` 참조.

**라이브:** `https://<계정>.github.io/neutral-atom-landscape/` _(GitHub Pages 활성화 후 채울 것)_

## 배포
`.github/workflows/deploy.yml` 참조. **`npm run validate` 가 build 앞의 게이트다** —
데이터 검증이 실패하면 build/배포에 도달하지 못하므로, 검증 안 된 서지(refs 누락·verified
미기입은 경고, 계층 위반 등은 실패)가 사이트에 도달할 수 없다. 완성돼 검증을 통과한 항목만
`main` 에 커밋할 것.

### 공개에 대하여
게시된 사이트는 상세 패널에서 `weight_rationale`·`contests` 를 그대로 보여준다. 즉 노출을
가르는 건 **repo 공개 여부가 아니라 내용(판단) 공개 여부**다. repo 를 private 로 둬도 배포하는
순간 판단은 사이트를 통해 읽힌다.

그래서 배포 게이트는 "private 라 안전"이 아니라 **"내용을 공개할 준비가 됐는가"** 로 건다:
현재 `main` push 는 validate+build(CI 게이트)만 돌고, Pages 배포는 수동(`workflow_dispatch`)으로만
실행된다 — 아직 공개 결정 전이기 때문이다. **내용을 공개하기로 정하면** deploy job 의 `if` 줄을
지워 push→배포로 바꾸고 Settings → Pages → Source = "GitHub Actions" 를 켠다. 그때 repo 는
**public 이 낫다**: 학술 사이트에서 링크할 대상이라면 private+Pages 는 Student Pack 만료 시 404 로
조용히 죽고, 처음부터 공개 전제로 쓴 `weight_rationale` 이 나중에 공개로 바꾼 것보다 정직하다.

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
