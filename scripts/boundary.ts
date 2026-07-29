/**
 * 코퍼스 경계 규칙 (fetch-corpus 와 boundary-loss 가 공유해 동일 로직 보장).
 *   - exclude 구문이 있으면 제외
 *   - strong 구문(단독으로 충분)이 있으면 통과
 *   - weak 구문("Rydberg")은 weak_context(array/tweezer/trapped atom/single atom)와
 *     함께 있어야 통과. "Rydberg array" 는 "array" 를 포함하므로 통과.
 */
export interface CorpusCfg {
  strong: string[];
  weak: string[];
  weak_context: string[];
  exclude: string[];
}

export function passesBoundary(titleAbstract: string, c: CorpusCfg): boolean {
  const h = titleAbstract.toLowerCase();
  if (c.exclude.some((x) => x && h.includes(x.toLowerCase()))) return false;
  if (c.strong.some((t) => t && h.includes(t.toLowerCase()))) return true;
  if (
    c.weak.some((t) => t && h.includes(t.toLowerCase())) &&
    c.weak_context.some((t) => t && h.includes(t.toLowerCase()))
  )
    return true;
  return false;
}
