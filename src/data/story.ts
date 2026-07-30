// Story 층 구성.
// thesis: AI-drafted candidates, author-selected — 상이한 주장을 하는 후보 4안
// (전환 속도 / 아키텍처 베팅 / 검증의 지체 / 두 연구 프로그램) 중 저자가 C(검증의
// 지체)를 선택. 막 제목도 같은 방식. 문장 원문은 후보안 그대로.
//
// 막 구성(어느 랜드마크가 어느 막에 속하나)은 entities 의 연도·가지에서 도출한
// 편집적 배치다. 발췌문은 fields.json 서사에서 [[id]] 포함 문장을 그대로 가져온다
// (lib/entities.ts narrativeExcerpt — 새 문장을 쓰지 않는다).
//
// 게이트: THESIS 나 막 제목이 PLACEHOLDER_ 로 시작하면 storyReady=false 가 되어
// 기본 라우트가 #/explore 로 돌아간다 (향후 문구 교체 작업 중에도 안전).

export const THESIS =
  "A field whose claims — simulation, optimization, advantage — have consistently outrun the tools for checking them. Its most interesting frontier is the audit.";

export interface Act {
  id: string;
  title: string;
  period: string;
  /** entities.json 의 id — 이 막에 박히는 랜드마크 칩 */
  entityIds: string[];
}

export const ACTS: Act[] = [
  { id: "act1", title: "Assembly, and a surprise", period: "2015–2018", entityIds: ["bernien17", "turner18", "pichler18"] },
  { id: "act2", title: "New atoms, new handles", period: "2019–2022", entityIds: ["young20", "semeghini21", "wu22"] },
  { id: "act3", title: "The logical turn", period: "2023–2026", entityIds: ["evered23", "bluvstein24", "manetsch24", "chiu25"] },
  // 테제(C)와 수미쌍관 — 논쟁 스레드가 부록이 아니라 결론이다
  { id: "act4", title: "The audit", period: "2018– · ongoing", entityIds: ["ebadi22", "andrist23"] },
];

export const storyReady =
  !THESIS.startsWith("PLACEHOLDER") && ACTS.every((a) => !a.title.startsWith("PLACEHOLDER"));
