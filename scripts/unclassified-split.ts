/**
 * unclassified-split — 미분류를 원인별 두 집단으로 나눈다(진단 전용, query.json 불변).
 *   A = corpus.include 중 "Rydberg" 로만 걸린 논문 → 코퍼스 경계 문제(분야 밖 Rydberg 물리)
 *   B = 그 외 include 용어(tweezer/atom array/neutral atom 등)도 걸렸는데 9가지 어디에도
 *       안 걸린 논문 → 택소노미 구멍(분야 안인데 가지·용어 누락)
 * 추가로 집단 B 안에서 누락 의심 용어(cavity/photonic/network/atom-photon/memory…) 빈도.
 * 결과 → report/unclassified-split.md
 *
 * 사용: npm run unclassified-split   (corpus-raw.json, unclassified.json 필요)
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rd = (p: string) => JSON.parse(readFileSync(resolve(root, p), "utf8"));
if (!existsSync(resolve(root, "data/corpus-raw.json")) || !existsSync(resolve(root, "data/unclassified.json"))) {
  console.log("corpus-raw.json / unclassified.json 이 필요합니다. fetch-corpus → count 먼저.");
  process.exit(0);
}

interface Raw { id: string; title: string; abstract: string; year: number }
const raw = rd("data/corpus-raw.json") as Raw[];
const unclIds = new Set((rd("data/unclassified.json") as { id: string }[]).map((u) => u.id));
const include = (rd("data/query.json") as { corpus: { include: string[] } }).corpus.include;

// scale.net 등에서 빠졌을 수 있는 용어(내 용어 누락 진단용)
const B_TERMS = [
  "cavity", "optical cavity", "nanophotonic", "atom-photon", "quantum network",
  "quantum repeater", "quantum memory", "superatom", "collective excitation",
  "photon interface", "fiber", "entanglement distribution",
];

const byId = new Map(raw.map((p) => [p.id, p]));
const A: Raw[] = [];
const B: Raw[] = [];
for (const id of unclIds) {
  const p = byId.get(id);
  if (!p) continue;
  const hay = `${p.title} ${p.abstract}`.toLowerCase();
  const matched = include.filter((t) => hay.includes(t.toLowerCase()));
  const onlyRydberg = matched.length > 0 && matched.every((t) => t.toLowerCase() === "rydberg");
  (onlyRydberg ? A : B).push(p);
}

const hayOf = (p: Raw) => `${p.title} ${p.abstract}`.toLowerCase();
const bFreq = B_TERMS.map((t) => [t, B.filter((p) => hayOf(p).includes(t.toLowerCase())).length] as const)
  .sort((a, b) => b[1] - a[1]);

const lines: string[] = [];
const w = (s = "") => lines.push(s);
const tot = A.length + B.length;
w(`# 미분류 분해 (진단)`);
w();
w(`미분류 총 ${tot}편.`);
w(`- **집단 A (Rydberg 단독 = 경계 문제)**: ${A.length}편 (${((A.length / tot) * 100).toFixed(1)}%)`);
w(`- **집단 B (tweezer/array/neutral atom 걸림 = 택소노미 구멍)**: ${B.length}편 (${((B.length / tot) * 100).toFixed(1)}%)`);
w();
w(`## 집단 B 내 누락 의심 용어 빈도 (분모 = B ${B.length}편)`);
w(`| 용어 | B 내 출현 | 비율 |`);
w(`|---|---:|---:|`);
for (const [t, n] of bFreq) w(`| ${t} | ${n} | ${B.length ? ((n / B.length) * 100).toFixed(1) : "0"}% |`);
w();
const sample = (xs: Raw[]) => xs.slice().sort((a, b) => b.year - a.year).slice(0, 40);
w(`## 집단 A 제목 40개 (경계 후보 — bare Rydberg)`);
for (const p of sample(A)) w(`- (${p.year}) ${p.title}  \`${p.id}\``);
w();
w(`## 집단 B 제목 40개 (택소노미 구멍 — 분야 안인데 가지 없음)`);
for (const p of sample(B)) w(`- (${p.year}) ${p.title}  \`${p.id}\``);
w();

mkdirSync(resolve(root, "report"), { recursive: true });
writeFileSync(resolve(root, "report/unclassified-split.md"), lines.join("\n") + "\n");
console.log(`미분류 ${tot} = A(경계) ${A.length} + B(구멍) ${B.length}`);
console.log("집단 B 내 누락 의심 용어 빈도:");
for (const [t, n] of bFreq) console.log(`  ${t.padEnd(24)} ${n}`);
console.log("report/unclassified-split.md 생성됨");
