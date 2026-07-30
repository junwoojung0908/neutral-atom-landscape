// Story 층 구성 — 테제 한 문장과 막(act) 제목은 저자(운영자)가 직접 쓴다.
// PLACEHOLDER_ 로 시작하는 문자열이 하나라도 남아 있는 동안에는
// (a) 그 문구는 화면에 그대로 노출하지 않고 "pending" 표시로 대체되며
// (b) 기본 라우트(#/)는 Story 가 아니라 #/explore 로 유지된다 (App.tsx 가 storyReady 검사).
//
// 막 구성(어느 랜드마크가 어느 막에 속하나)은 entities 의 연도·가지에서 도출한
// 편집적 배치다. 발췌문은 fields.json 서사에서 [[id]] 포함 문장을 그대로 가져온다
// (lib/entities.ts narrativeExcerpt — 새 문장을 쓰지 않는다).

export const THESIS = "PLACEHOLDER_THESIS";

export interface Act {
  id: string;
  /** 저자가 쓸 막 제목. PLACEHOLDER_ 인 동안 화면엔 시기 라벨만 보인다. */
  title: string;
  period: string;
  /** entities.json 의 id — 이 막에 박히는 랜드마크 칩 */
  entityIds: string[];
}

export const ACTS: Act[] = [
  { id: "act1", title: "PLACEHOLDER_ACT_1", period: "2015–2018", entityIds: ["bernien17", "turner18", "pichler18"] },
  { id: "act2", title: "PLACEHOLDER_ACT_2", period: "2019–2022", entityIds: ["young20", "semeghini21", "wu22"] },
  { id: "act3", title: "PLACEHOLDER_ACT_3", period: "2023–2026", entityIds: ["evered23", "bluvstein24", "manetsch24", "chiu25"] },
  { id: "act4", title: "PLACEHOLDER_ACT_4", period: "2018– · ongoing", entityIds: ["ebadi22", "andrist23"] },
];

export const storyReady =
  !THESIS.startsWith("PLACEHOLDER") && ACTS.every((a) => !a.title.startsWith("PLACEHOLDER"));
