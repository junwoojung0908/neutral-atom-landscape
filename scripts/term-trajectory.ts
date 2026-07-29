/**
 * term-trajectory — 가지(택소노미) 무시, 상향식 n-gram 궤적. 방향을 보여준다.
 *   - bigram/trigram 을 제목+초록에서 추출(논문 단위 집합, 대소문자 무시)
 *   - 각 용어: 총편수, 중앙연도(질량 절반 도달 연도), 최근3년(2024-26), 성장비(최근3/직전3)
 *   - 급부상 신생어: 중앙연도 최근 + 질량 충분 → 이름 아직 없는 방향 후보
 *   - 미분류 특징어: 미분류에서 과대표집된 용어 → "41%에 뭐가 있나"
 * 새 데이터 불필요. 결과 → report/term-trajectory.md
 *
 * 사용: npm run term-trajectory   (corpus-raw.json 필요)
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rd = (p: string) => JSON.parse(readFileSync(resolve(root, p), "utf8"));
if (!existsSync(resolve(root, "data/corpus-raw.json"))) {
  console.log("data/corpus-raw.json 이 없습니다. fetch-corpus 먼저.");
  process.exit(0);
}

interface Raw { id: string; title: string; abstract: string; year: number }
const raw = rd("data/corpus-raw.json") as Raw[];
const unclIds = new Set((rd("data/unclassified.json") as { id: string }[]).map((u) => u.id));

const STOP = new Set([
  "the", "a", "an", "of", "for", "and", "or", "to", "in", "on", "at", "by", "with", "using", "used",
  "based", "via", "as", "is", "are", "be", "we", "our", "this", "that", "these", "those", "it", "its",
  "from", "into", "between", "such", "can", "which", "here", "show", "shows", "shown", "study", "studies",
  "results", "result", "propose", "proposed", "present", "presented", "demonstrate", "demonstrated",
  "report", "observe", "observed", "new", "novel", "recent", "also", "both", "up", "two", "three", "one",
  "high", "low", "large", "small", "over", "under", "within", "toward", "towards", "e.g", "i.e", "et", "al",
  "quantum", "atom", "atoms", "atomic", "system", "systems", "approach", "method", "methods", "paper",
  "work", "model", "models", "state", "states", "effect", "effects", "field", "fields", "single", "number",
  "different", "possible", "recently", "first", "order", "time", "due", "than", "more", "most", "when",
  "we", "their", "they", "have", "has", "been", "not", "each", "all", "may", "many", "well", "then",
]);

const tok = (s: string) =>
  s.toLowerCase().split(/[^a-z0-9\-]+/).filter((t) => t.length >= 2 && !/^\d+$/.test(t));
const bad = (t: string) => STOP.has(t) || t.length < 3;

interface Info { total: number; years: number[]; uncl: number }
const terms = new Map<string, Info>();

for (const p of raw) {
  if (Number.isNaN(p.year)) continue;
  const ts = tok(`${p.title} ${p.abstract}`);
  const seen = new Set<string>();
  for (let i = 0; i < ts.length; i++) {
    for (const n of [2, 3]) {
      if (i + n > ts.length) continue;
      const gram = ts.slice(i, i + n);
      if (bad(gram[0]) || bad(gram[n - 1])) continue; // 양끝이 불용어면 버림
      if (gram.some((g) => STOP.has(g) && g !== gram[1])) continue; // 내부 1개(연결어)만 허용
      seen.add(gram.join(" "));
    }
  }
  const isUncl = unclIds.has(p.id);
  for (const g of seen) {
    let inf = terms.get(g);
    if (!inf) terms.set(g, (inf = { total: 0, years: [], uncl: 0 }));
    inf.total++;
    inf.years.push(p.year);
    if (isUncl) inf.uncl++;
  }
}

const medianYear = (ys: number[]) => {
  const s = [...ys].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const inRange = (ys: number[], lo: number, hi: number) => ys.filter((y) => y >= lo && y <= hi).length;

const unclTotal = raw.filter((p) => unclIds.has(p.id)).length;
const clsTotal = raw.length - unclTotal;

// 급부상 신생어: 총≥12, 중앙연도≥2023, 최근3년 비중 큰 순
const emerging = [...terms.entries()]
  .map(([t, inf]) => ({
    t, total: inf.total, median: medianYear(inf.years),
    recent: inRange(inf.years, 2024, 2026), prior: inRange(inf.years, 2021, 2023),
  }))
  .filter((x) => x.total >= 12 && x.median >= 2023)
  .sort((a, b) => b.recent - a.recent)
  .slice(0, 35);

// 가속 중: 총≥25, 최근3/직전3 성장비 큰 순
const accelerating = [...terms.entries()]
  .map(([t, inf]) => ({
    t, total: inf.total, recent: inRange(inf.years, 2024, 2026), prior: inRange(inf.years, 2021, 2023),
  }))
  .filter((x) => x.total >= 25 && x.prior >= 3)
  .map((x) => ({ ...x, growth: x.recent / x.prior }))
  .sort((a, b) => b.growth - a.growth)
  .slice(0, 25);

// 미분류 특징어: 미분류 과대표집(비율), uncl편수≥10
const distinct = [...terms.entries()]
  .map(([t, inf]) => {
    const fu = inf.uncl / unclTotal;
    const fc = (inf.total - inf.uncl) / clsTotal;
    return { t, uncl: inf.uncl, total: inf.total, fu, fc, ratio: fu / (fc + 1e-9) };
  })
  .filter((x) => x.uncl >= 10 && x.ratio >= 1.3)
  .sort((a, b) => b.ratio - a.ratio)
  .slice(0, 30);

const L: string[] = [];
const w = (s = "") => L.push(s);
w(`# 용어 궤적 (상향식, 택소노미 무시)`);
w();
w(`코퍼스 ${raw.length}편 (분류 ${clsTotal} / 미분류 ${unclTotal}). bigram+trigram, 논문단위.`);
w();
w(`## 급부상 신생어 (중앙연도 ≥2023, 총≥12) — 이름 아직 없는 방향 후보`);
w(`| 용어 | 총 | 중앙연도 | 2024-26 | 2021-23 |`);
w(`|---|---:|---:|---:|---:|`);
for (const x of emerging) w(`| ${x.t} | ${x.total} | ${x.median} | ${x.recent} | ${x.prior} |`);
w();
w(`## 가속 중 (총≥25, 최근3/직전3 성장비)`);
w(`| 용어 | 총 | 2024-26 | 2021-23 | 성장비 |`);
w(`|---|---:|---:|---:|---:|`);
for (const x of accelerating) w(`| ${x.t} | ${x.total} | ${x.recent} | ${x.prior} | ${x.growth.toFixed(1)}× |`);
w();
w(`## 미분류 특징어 (미분류/분류 출현비 ≥1.3, uncl≥10) — 41%의 정체`);
w(`| 용어 | 미분류편 | 미분류% | 분류% | 과대표집비 |`);
w(`|---|---:|---:|---:|---:|`);
for (const x of distinct) w(`| ${x.t} | ${x.uncl} | ${(x.fu * 100).toFixed(1)}% | ${(x.fc * 100).toFixed(1)}% | ${x.ratio.toFixed(1)}× |`);
w();

mkdirSync(resolve(root, "report"), { recursive: true });
writeFileSync(resolve(root, "report/term-trajectory.md"), L.join("\n") + "\n");
console.log(`용어 ${terms.size} 개. 급부상 ${emerging.length}, 가속 ${accelerating.length}, 미분류특징 ${distinct.length}`);
console.log("\n=== 급부상 신생어 top 15 (중앙연도≥2023) ===");
for (const x of emerging.slice(0, 15)) console.log(`  ${x.t.padEnd(34)} 총${String(x.total).padStart(3)}  중앙${x.median}  최근${x.recent}`);
console.log("\n=== 미분류 특징어 top 15 (41% 정체) ===");
for (const x of distinct.slice(0, 15)) console.log(`  ${x.t.padEnd(34)} uncl${String(x.uncl).padStart(3)}  ${x.ratio.toFixed(1)}×`);
console.log("\nreport/term-trajectory.md 생성됨");
