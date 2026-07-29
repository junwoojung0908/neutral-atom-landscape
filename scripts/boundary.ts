/**
 * 코퍼스 플랫폼 게이트 — 단일 정의(fetch-corpus·boundary-loss·재필터가 공유).
 *  · hard_exclude 구문 → 무조건 OUT
 *  · strong 구문(트위저/배열 등) → IN, soft_exclude 면제(lattice·gas-microscope 하이브리드 보호)
 *  · soft_exclude 구문(비-strong) → OUT (증기셀 센싱·분자·기체 등 서브필드)
 *  · bare "Rydberg" → weak_context(배열·큐비트·게이트·시뮬 맥락) 있어야 IN
 * 근거: docs/scope.md. 손실 측정(2026-07-30): 분류 2029 중 14.1% 탈락, 표본 감사상
 * 15% 초과 2개 가지(net·species)의 탈락분은 scope-OUT(앙상블 광학·분광)로 확인.
 */
export interface CorpusGate {
  strong: string[];
  weak_context: string[];
  hard_exclude: string[];
  soft_exclude: string[];
}

export function passesGate(titleAbstract: string, c: CorpusGate): boolean {
  const h = titleAbstract.toLowerCase();
  if (c.hard_exclude.some((x) => x && h.includes(x.toLowerCase()))) return false;
  if (c.strong.some((t) => t && h.includes(t.toLowerCase()))) return true;
  if (c.soft_exclude.some((x) => x && h.includes(x.toLowerCase()))) return false;
  if (!h.includes("rydberg")) return false;
  return c.weak_context.some((t) => t && h.includes(t.toLowerCase()));
}
