/**
 * count — corpus-raw.json 을 로컬에서 읽어 9개 가지 질의를 문자열 매칭으로 적용한다.
 * 네트워크를 타지 않으므로 1초 안에 끝난다(용어를 20~30회 다듬는 반복용 도구).
 *
 * 2층 구조: 코퍼스(분야 경계) = fetch-corpus 가 정의, 가지(분류) = 여기서 필터.
 * 미분류 = 코퍼스 − 가지 합집합 → data/unclassified.json. 이게 택소노미 구멍 검사다.
 *
 * 사용: npm run count   (corpus-raw.json 없으면 안내만)
 * 출력: data/counts.json, data/corpus.json(분류됨), data/unclassified.json
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rd = (p: string) => JSON.parse(readFileSync(resolve(root, p), "utf8"));
const rawPath = resolve(root, "data/corpus-raw.json");

interface Branch { terms: string[]; exclusions: string[] }
interface Query { version: string; fields: Record<string, Branch> }
interface RawPaper { id: string; title: string; abstract: string; year: number }

const query = rd("data/query.json") as Query;
const fields = rd("data/fields.json") as { id: string; parent: string | null }[];
const firstLevel = new Set(fields.filter((f) => f.parent === null).map((f) => f.id));

for (const id of Object.keys(query.fields)) {
  if (!firstLevel.has(id)) {
    console.error(`ERROR query.json: "${id}" 는 fields.json 의 1차 가지가 아니다.`);
    process.exit(1);
  }
}

if (!existsSync(rawPath)) {
  console.log("data/corpus-raw.json 이 없습니다. 먼저 `npm run fetch-corpus` 로 코퍼스를 받으세요.");
  process.exit(0);
}

const raw = rd("data/corpus-raw.json") as RawPaper[];
const branchIds = Object.keys(query.fields);

/** 대소문자 무시 부분문자열 매칭. 하나라도 exclusion 이 걸리면 제외. */
function matches(hay: string, b: Branch): boolean {
  if (b.exclusions.some((x) => x && hay.includes(x.toLowerCase()))) return false;
  return b.terms.some((t) => t && hay.includes(t.toLowerCase()));
}

const classified: { id: string; year: number; matched_fields: string[] }[] = [];
const unclassified: { id: string; year: number; title: string }[] = [];
const branchHits: Record<string, number> = Object.fromEntries(branchIds.map((id) => [id, 0]));
const shares: Record<string, Record<string, number>> = {};
const unclassifiedByYear: Record<string, number> = {};
const years = new Set<number>();

for (const p of raw) {
  if (Number.isNaN(p.year)) continue;
  years.add(p.year);
  const yk = String(p.year);
  const hay = `${p.title} ${p.abstract}`.toLowerCase();
  const hit = branchIds.filter((id) => matches(hay, query.fields[id]));

  if (hit.length === 0) {
    unclassified.push({ id: p.id, year: p.year, title: p.title });
    unclassifiedByYear[yk] = (unclassifiedByYear[yk] ?? 0) + 1;
    continue;
  }
  classified.push({ id: p.id, year: p.year, matched_fields: hit.slice().sort() });
  shares[yk] ??= {};
  for (const id of hit) {
    branchHits[id]++;
    shares[yk][id] = (shares[yk][id] ?? 0) + 1 / hit.length; // 분수 배분
  }
}

const corpusTotal = classified.length + unclassified.length;
const uRatio = corpusTotal ? unclassified.length / corpusTotal : 0;

writeFileSync(
  resolve(root, "data/counts.json"),
  JSON.stringify(
    {
      version: query.version,
      generated_at: new Date().toISOString().slice(0, 10),
      corpus_total: corpusTotal,
      classified: classified.length,
      unclassified_total: unclassified.length,
      unclassified_ratio: uRatio,
      branch_hits: branchHits,
      years: [...years].sort((a, b) => a - b),
      shares,
      unclassified_by_year: unclassifiedByYear,
    },
    null,
    2,
  ) + "\n",
);
writeFileSync(resolve(root, "data/corpus.json"), JSON.stringify(classified, null, 2) + "\n");
writeFileSync(resolve(root, "data/unclassified.json"), JSON.stringify(unclassified, null, 2) + "\n");

console.log(`코퍼스 ${corpusTotal}편 · 분류 ${classified.length} · 미분류 ${unclassified.length} (${(uRatio * 100).toFixed(1)}%)`);
console.log("가지별 히트율 (raw membership / 코퍼스):");
for (const id of branchIds) {
  const h = branchHits[id];
  console.log(`  ${id.padEnd(10)} ${String(h).padStart(5)}  ${corpusTotal ? ((h / corpusTotal) * 100).toFixed(1) : "0"}%`);
}
console.log("(겹침은 counts.json 에서 1/k 분수 배분. 위 히트율은 raw 라 합이 100%를 넘는다.)");
