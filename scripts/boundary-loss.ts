/**
 * boundary-loss — 새 경계 규칙(strong/weak/context)을 적용하면 현재 분류된 논문 중
 * 가지별로 몇 %가 탈락하는지 측정한다(적용 전 안전 점검). 15% 초과 가지가 있으면
 * 규칙이 과하다는 뜻 → 적용하지 말 것. 진단 전용, 아무 것도 쓰지 않음.
 *
 * 사용: npm run boundary-loss   (corpus.json, corpus-raw.json 필요)
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { passesBoundary } from "./boundary.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rd = (p: string) => JSON.parse(readFileSync(resolve(root, p), "utf8"));
if (!existsSync(resolve(root, "data/corpus.json")) || !existsSync(resolve(root, "data/corpus-raw.json"))) {
  console.log("corpus.json / corpus-raw.json 이 필요합니다.");
  process.exit(0);
}

interface Rec { id: string; matched_fields: string[] }
interface Raw { id: string; title: string; abstract: string }
const classified = rd("data/corpus.json") as Rec[];
const raw = rd("data/corpus-raw.json") as Raw[];
const corpus = rd("data/query.json").corpus as {
  strong: string[]; weak: string[]; weak_context: string[]; exclude: string[];
};
const byId = new Map(raw.map((p) => [p.id, `${p.title} ${p.abstract}`]));

const total: Record<string, number> = {};
const dropped: Record<string, number> = {};
let survivors = 0;
for (const r of classified) {
  const hay = byId.get(r.id) ?? "";
  const survive = passesBoundary(hay, corpus);
  if (survive) survivors++;
  for (const f of r.matched_fields) {
    total[f] = (total[f] ?? 0) + 1;
    if (!survive) dropped[f] = (dropped[f] ?? 0) + 1;
  }
}

console.log(`현재 분류 ${classified.length}편 → 새 경계 통과 ${survivors} (탈락 ${classified.length - survivors})`);
console.log("가지별 탈락률 (탈락/현재분류):");
let overCap = false;
for (const f of Object.keys(total).sort()) {
  const d = dropped[f] ?? 0;
  const pct = (d / total[f]) * 100;
  const flag = pct > 15 ? "  ⚠ >15% 규칙 과함" : "";
  if (pct > 15) overCap = true;
  console.log(`  ${f.padEnd(10)} ${String(d).padStart(4)}/${String(total[f]).padStart(4)}  ${pct.toFixed(1)}%${flag}`);
}
console.log(overCap ? "\n★ 15% 초과 가지 있음 — 경계 규칙을 적용하지 말 것." : "\n✓ 모든 가지 15% 이하 — 규칙 적용 안전.");
