// SPEC §3.1.1 — label 대소문자는 데이터가 아니라 렌더에서 통일한다.
// 출처마다 다른 표기(arXiv=Title Case, Crossref=문장식)를 표시 시점에만 Title Case 로 맞춘다.
// 약어/혼합대소문자/숫자 포함 토큰은 원형 보존한다(MIS, QUBO, qLDPC, NaCs 등).

const SMALL = new Set([
  "a", "an", "the", "of", "for", "and", "or", "to", "in", "on", "at",
  "by", "with", "using", "based", "vs",
]);

// 약어(대문자 2연속), 혼합대소문자, 숫자 포함 → 손대지 않는다.
function keepVerbatim(w: string): boolean {
  return /[A-Z]{2,}/.test(w) || /[a-z][A-Z]/.test(w) || /\d/.test(w);
}

function capPart(p: string): string {
  if (!p) return p;
  if (keepVerbatim(p)) return p;
  return p[0].toUpperCase() + p.slice(1).toLowerCase();
}

function capWord(w: string): string {
  // 하이픈 복합어는 각 조각을 개별 처리 (unit-disk → Unit-Disk)
  return w.split("-").map(capPart).join("-");
}

export function displayTitle(raw: string): string {
  const words = raw.trim().split(/\s+/);
  return words
    .map((w, i) => {
      if (keepVerbatim(w)) return w;
      const lower = w.toLowerCase();
      if (i !== 0 && SMALL.has(lower)) return lower;
      return capWord(w);
    })
    .join(" ");
}
