// 랜드마크(entities) 공용 헬퍼 — BranchPanel·Story·가이드 모드가 같은 표기를 쓴다.
import { entities, fields } from "../data/loader.ts";
import type { Entity } from "../data/schema.ts";

export const entById = new Map<string, Entity>(entities.map((e) => [e.id, e]));

/** 칩 라벨 = 1저자 성 + 연도 (byline 파싱) */
export const chipLabel = (e: Entity): string => {
  const first = e.byline.split(" et al")[0].split(",")[0].trim();
  const surname = first.split(/\s+/).pop() ?? first;
  return `${surname} ${e.year}`;
};

export const arxivOf = (e: Entity): string | null =>
  e.refs.find((r) => r.type === "arxiv")?.value ?? null;

/** 가이드 모드 정거장 순서 — arXiv id(YYMM) 기준 실제 시간순 */
export const tourOrder: Entity[] = entities
  .filter((e) => arxivOf(e))
  .slice()
  .sort((a, b) => (arxivOf(a) ?? "").localeCompare(arxivOf(b) ?? ""));

/**
 * 서사(fields.json)에서 [[id]] 가 포함된 문장을 그대로 발췌한다 — 새 문장 작성 금지.
 * 세미콜론 복문은 해당 id 가 든 절만 잘라내고 잘린 쪽에 … 를 붙인다.
 */
export function narrativeExcerpt(entityId: string): { text: string; branch: string } | null {
  const tag = `[[${entityId}]]`;
  for (const f of fields) {
    if (!f.narrative || !f.narrative.includes(tag)) continue;
    const sentences = f.narrative.split(/(?<=[.?!])\s+(?=[A-Z\[])/);
    for (const s of sentences) {
      if (!s.includes(tag)) continue;
      const segs = s.split(/;\s+/);
      const i = segs.findIndex((x) => x.includes(tag));
      if (i < 0) return { text: s.trim(), branch: f.id };
      let text = segs[i].trim();
      if (i > 0) text = `… ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
      if (i < segs.length - 1) text = `${text} …`;
      return { text, branch: f.id };
    }
  }
  return null;
}
