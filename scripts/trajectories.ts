/**
 * trajectories — 그룹의 관심 이동을 미리 계산해 앱이 읽을 작은 파일로 떨군다.
 *   - 귀속: 마지막 저자(PI 관례). groups.json 의 name_variants → key 로 정규화 매칭.
 *   - in-scope(분류된, corpus.json) 논문만. 3년 창(15-17/18-20/21-23/24-26).
 *   - 창당 <3편이면 그 점을 버린다(앱이 선을 끊는다, 보간 금지). 각 점에 편수 기록.
 *   - 위치는 앱이 앵커 좌표로 계산하도록 branch mix(분수, 합1)만 저장.
 * 결과 → data/trajectories.json
 *
 * 사용: npm run trajectories   (corpus-raw.json, corpus.json, groups.json 필요)
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rd = (p: string) => JSON.parse(readFileSync(resolve(root, p), "utf8"));
for (const f of ["data/corpus-raw.json", "data/corpus.json", "data/groups.json"]) {
  if (!existsSync(resolve(root, f))) { console.log(`${f} 없음.`); process.exit(0); }
}

function key(name: string): string | null {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length < 2) return null;
  const s = p[p.length - 1].toLowerCase().replace(/[^a-z\-]/g, "");
  const i = p[0].toLowerCase().replace(/[^a-z]/g, "")[0];
  return s && i && s.length >= 2 ? `${s} ${i}` : null;
}

interface Raw { id: string; authors: string[]; year: number }
interface Group { id: string; label: string; pis: { name_variants: string[] }[] }
const raw = rd("data/corpus-raw.json") as Raw[];
const inScope = new Map<string, string[]>(
  (rd("data/corpus.json") as { id: string; matched_fields: string[] }[]).map((r) => [r.id, r.matched_fields]),
);
const groups = rd("data/groups.json") as Group[];

// key → group id (한 key 는 한 그룹으로 가정; 충돌 시 첫 그룹)
const keyToGroup = new Map<string, string>();
for (const g of groups)
  for (const pi of g.pis)
    for (const v of pi.name_variants) {
      const k = key(v);
      if (k && !keyToGroup.has(k)) keyToGroup.set(k, g.id);
    }

const WIN = (y: number) => (y <= 2017 ? 0 : y <= 2020 ? 1 : y <= 2023 ? 2 : 3);
const WLAB = ["2015–17", "2018–20", "2021–23", "2024–26"];

// group → window → {count, frac{branch}}
const acc = new Map<string, { count: number; frac: Record<string, number> }[]>();
for (const g of groups) acc.set(g.id, [0, 1, 2, 3].map(() => ({ count: 0, frac: {} })));

for (const p of raw) {
  if (!p.authors?.length || Number.isNaN(p.year)) continue;
  const fields = inScope.get(p.id);
  if (!fields || !fields.length) continue; // in-scope 분류 논문만
  const k = key(p.authors[p.authors.length - 1]);
  if (!k) continue;
  const gid = keyToGroup.get(k);
  if (!gid) continue;
  const cell = acc.get(gid)![WIN(p.year)];
  cell.count++;
  for (const f of fields) cell.frac[f] = (cell.frac[f] ?? 0) + 1 / fields.length;
}

const out = groups.map((g) => {
  const cells = acc.get(g.id)!;
  const windows = cells
    .map((c, wi) => {
      if (c.count < 3) return null; // 창당 <3편 버림
      const sum = Object.values(c.frac).reduce((a, b) => a + b, 0) || 1;
      const mix: Record<string, number> = {};
      for (const [b, v] of Object.entries(c.frac)) mix[b] = v / sum;
      return { wi, label: WLAB[wi], count: c.count, mix };
    })
    .filter(Boolean);
  return { id: g.id, label: g.label, windows };
});

writeFileSync(resolve(root, "data/trajectories.json"), JSON.stringify(out, null, 2) + "\n");

console.log("그룹 궤적 (창당 ≥3편만, 점 개수 = 경로 길이):");
for (const g of out) {
  const pts = (g.windows as { label: string; count: number }[]).map((w) => `${w.label}(${w.count})`).join(" → ");
  console.log(`  ${g.label.padEnd(30)} ${pts || "(경로 없음)"}`);
}
console.log("data/trajectories.json 생성됨");
