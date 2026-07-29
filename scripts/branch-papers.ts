/**
 * branch-papers — 분야 드릴다운용 데이터. 각 1차 가지에:
 *   - landmarks: 중추 논문(entities.json, weight 순)
 *   - papers: 그 가지 코퍼스 논문(확장), 최근순 cap 60 + byYear 카운트
 * 코퍼스(3,703)를 UI에 처음 드러내는 산출물. 앱이 import(작게 cap).
 * 결과 → data/branch-papers.json
 *
 * 사용: npm run branch-papers   (corpus.json, corpus-raw.json, entities.json, fields.json)
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rd = (p: string) => JSON.parse(readFileSync(resolve(root, p), "utf8"));
for (const f of ["data/corpus.json", "data/corpus-raw.json", "data/entities.json", "data/fields.json"])
  if (!existsSync(resolve(root, f))) { console.log(`${f} 없음.`); process.exit(0); }

const CAP = 60;
interface Rawp { id: string; title: string; authors: string[]; year: number }
const cls = rd("data/corpus.json") as { id: string; year: number; matched_fields: string[] }[];
let citations: Record<string, { cited: number }> = {};
try { citations = rd("data/citations.json"); } catch { /* 없음 */ }
const citedOf = (id: string) => citations[id]?.cited ?? 0;
const rawById = new Map((rd("data/corpus-raw.json") as Rawp[]).map((p) => [p.id, p]));
const fields = rd("data/fields.json") as { id: string; parent: string | null; ko: string }[];
const firstLevel = fields.filter((f) => f.parent === null).map((f) => f.id);
const parentOf = new Map(fields.map((f) => [f.id, f.parent] as const));
const firstOf = (id: string) => parentOf.get(id) ?? id;

interface Ent {
  id: string; label: string; byline: string; venue: string; year: number;
  fields: string[]; weight: number; refs: { type: string; value: string }[];
}
const entities = rd("data/entities.json") as Ent[];

const out: Record<string, unknown> = {};
for (const b of firstLevel) {
  const inBranch = cls.filter((p) => p.matched_fields.includes(b));
  const byYear: Record<string, number> = {};
  for (const p of inBranch) byYear[p.year] = (byYear[p.year] ?? 0) + 1;
  const brief = (p: { id: string; year: number }) => {
    const r = rawById.get(p.id);
    const a0 = r?.authors?.[0] ?? "";
    return {
      id: p.id,
      year: p.year,
      title: r?.title ?? p.id,
      author: a0 ? `${a0}${(r?.authors?.length ?? 1) > 1 ? " et al." : ""}` : "",
      cited: citedOf(p.id),
    };
  };
  const papers = inBranch.slice().sort((a, c) => c.year - a.year).slice(0, CAP).map(brief);
  // 자동 읽기 시작점: 인용 상위 8 (알고리즘 생성임을 UI에 명시)
  const topCited = inBranch.slice().sort((a, c) => citedOf(c.id) - citedOf(a.id)).slice(0, 8).map(brief);
  const landmarks = entities
    .filter((e) => e.fields.map(firstOf).includes(b))
    .sort((a, c) => c.weight - a.weight)
    .map((e) => ({
      id: e.id, label: e.label, byline: e.byline, venue: e.venue, year: e.year,
      weight: e.weight, refs: e.refs,
    }));
  out[b] = { count: inBranch.length, byYear, landmarks, papers, topCited };
}

writeFileSync(resolve(root, "data/branch-papers.json"), JSON.stringify(out, null, 2) + "\n");
console.log("분야별 (코퍼스 논문 / 랜드마크):");
for (const b of firstLevel) {
  const o = out[b] as { count: number; landmarks: unknown[] };
  console.log(`  ${b.padEnd(10)} ${String(o.count).padStart(4)}편  랜드마크 ${o.landmarks.length}`);
}
console.log("data/branch-papers.json 생성됨");
