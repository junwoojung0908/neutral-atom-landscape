/**
 * taxonomy-check — 카운트가 곧 온톨로지 검사다. 판정 기준을 코드에 박고 report/taxonomy.md 생성.
 * 에러로 실패시키지 않는다(전부 리포트). 기준은 카운트를 보기 전에 고정된 값이다.
 *
 *  · 한 가지가 코퍼스의 30% 초과      → "너무 넓음"
 *  · 한 가지가 3% 미만                → "1차 가지 아님"
 *  · 두 가지 상호 겹침이 각각 50% 초과 → "사실상 동일"
 *  · 미분류(어느 가지에도 안 걸림)가 15% 초과 → "택소노미 구멍"
 *  + 가지별 연도 분포, 겹침 행렬, 미분류 상위 30편 제목(=빠뜨린 가지 단서)
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const WIDE = 0.3, THIN = 0.03, SAME = 0.5, HOLE = 0.15;
const STRICT = process.argv.includes("--strict"); // 미분류>15% 를 hard fail 로 (게이트 정상화 후 cron 에 켤 것)

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rd = (p: string) => JSON.parse(readFileSync(resolve(root, p), "utf8"));
const rdOpt = (p: string) => (existsSync(resolve(root, p)) ? rd(p) : []);

interface Rec { id: string; year: number; matched_fields: string[] }
interface URec { id: string; year: number; title: string }
const classified = rdOpt("data/corpus.json") as Rec[];
const unclassified = rdOpt("data/unclassified.json") as URec[];
const fields = rd("data/fields.json") as { id: string; parent: string | null; ko: string }[];
const ids = fields.filter((f) => f.parent === null).map((f) => f.id);
const koOf = new Map(fields.map((f) => [f.id, f.ko]));

const lines: string[] = [];
const p = (s = "") => lines.push(s);
p(`# 택소노미 적합성 리포트`);
p();

const corpusTotal = classified.length + unclassified.length;

if (corpusTotal === 0) {
  p(`코퍼스가 비어 있습니다. \`npm run fetch-corpus\` → \`npm run count\` 를 먼저 실행하세요.`);
  finish();
} else {
  const count: Record<string, number> = {};
  const overlap: Record<string, Record<string, number>> = {};
  const byYear: Record<string, Record<number, number>> = {};
  const years = new Set<number>();
  for (const id of ids) (count[id] = 0), (overlap[id] = {}), (byYear[id] = {});

  for (const r of classified) {
    years.add(r.year);
    const ms = r.matched_fields.filter((m) => ids.includes(m));
    for (const a of ms) {
      count[a]++;
      byYear[a][r.year] = (byYear[a][r.year] ?? 0) + 1;
      for (const b of ms) if (a !== b) overlap[a][b] = (overlap[a][b] ?? 0) + 1;
    }
  }

  const flags: string[] = [];
  const uRatio = unclassified.length / corpusTotal;
  if (uRatio > HOLE) {
    flags.push(`- **미분류 ${(uRatio * 100).toFixed(1)}%** (${unclassified.length}/${corpusTotal}) → 택소노미에 구멍. 아래 미분류 제목 목록을 보고 빠진 가지를 찾으세요.`);
  }
  for (const id of ids) {
    const share = count[id] / corpusTotal;
    if (share > WIDE) flags.push(`- **${id}** (${koOf.get(id)}): 코퍼스의 ${(share * 100).toFixed(1)}% → 너무 넓음, 쪼개야 함`);
    if (share < THIN) flags.push(`- **${id}** (${koOf.get(id)}): 코퍼스의 ${(share * 100).toFixed(1)}% → 1차 가지 아님, 하위로 강등`);
  }
  for (const a of ids)
    for (const b of ids) {
      if (a >= b) continue;
      const oab = overlap[a][b] ?? 0;
      if (count[a] && count[b] && oab / count[a] > SAME && oab / count[b] > SAME)
        flags.push(`- **${a} ↔ ${b}**: 상호 겹침 ${oab} (${((oab / count[a]) * 100).toFixed(0)}% / ${((oab / count[b]) * 100).toFixed(0)}%) → 사실상 동일`);
    }

  p(`총 코퍼스 **${corpusTotal}편** · 분류 ${classified.length} · 미분류 ${unclassified.length} (${(uRatio * 100).toFixed(1)}%)`);
  p();
  p(`## 플래그`);
  p(flags.length ? flags.join("\n") : `- 없음`);
  p();

  p(`## 가지별 규모`);
  p(`| 가지 | ko | 논문 수 | 코퍼스 비율 |`);
  p(`|---|---|---:|---:|`);
  for (const id of ids) p(`| ${id} | ${koOf.get(id)} | ${count[id]} | ${((count[id] / corpusTotal) * 100).toFixed(1)}% |`);
  p(`| _미분류_ | — | ${unclassified.length} | ${(uRatio * 100).toFixed(1)}% |`);
  p();

  const ys = [...years].sort((a, b) => a - b);
  p(`## 가지별 연도 분포`);
  p(`| 가지 | ${ys.join(" | ")} |`);
  p(`|---|${ys.map(() => "---:").join("|")}|`);
  for (const id of ids) p(`| ${id} | ${ys.map((y) => byYear[id][y] ?? 0).join(" | ")} |`);
  p();

  p(`## 겹침 행렬 (행 ∩ 열, raw)`);
  p(`| ∩ | ${ids.join(" | ")} |`);
  p(`|---|${ids.map(() => "---:").join("|")}|`);
  for (const a of ids) p(`| **${a}** | ${ids.map((b) => (a === b ? count[a] : overlap[a][b] ?? 0)).join(" | ")} |`);
  p();

  p(`## 미분류 상위 30편 (최근순 — 빠뜨린 가지 단서)`);
  const top = unclassified.slice().sort((x, y) => y.year - x.year).slice(0, 30);
  if (top.length) for (const u of top) p(`- (${u.year}) ${u.title}  \`${u.id}\``);
  else p(`- 없음`);
  p();

  console.log(flags.length ? `택소노미 플래그 ${flags.length}건 — report/taxonomy.md 확인` : `택소노미 플래그 없음`);
  finish();
  if (STRICT && uRatio > HOLE) {
    console.error(`✗ --strict: 미분류 ${(uRatio * 100).toFixed(1)}% > 15%`);
    process.exit(1);
  }
}

function finish() {
  mkdirSync(resolve(root, "report"), { recursive: true });
  writeFileSync(resolve(root, "report/taxonomy.md"), lines.join("\n") + "\n");
  console.log("report/taxonomy.md 생성됨");
}
