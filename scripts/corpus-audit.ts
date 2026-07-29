/**
 * corpus-audit — corpus-raw.json 의 각 논문이 corpus.include 의 어떤 용어로 걸렸는지
 * 로컬 매칭으로 집계한다. 오염을 제목 무작위 훑기보다 빠르게 찾기 위한 도구.
 *  - 용어별 히트 수
 *  - "Rydberg" 하나로만 걸린 논문 수 + 제목 50개 (고체물리 엑시톤/폴라리톤 오탐 후보)
 *  - 2개 이상 용어로 걸린 논문 수
 * 결과 → report/corpus-audit.md
 *
 * 사용: npm run corpus-audit   (corpus-raw.json 필요)
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rawPath = resolve(root, "data/corpus-raw.json");
if (!existsSync(rawPath)) {
  console.log("data/corpus-raw.json 이 없습니다. 먼저 `npm run fetch-corpus`.");
  process.exit(0);
}

interface RawPaper { id: string; title: string; abstract: string }
const raw = JSON.parse(readFileSync(rawPath, "utf8")) as RawPaper[];
const query = JSON.parse(readFileSync(resolve(root, "data/query.json"), "utf8")) as {
  corpus: { include: string[] };
};
const include = query.corpus.include;

const termHits: Record<string, number> = Object.fromEntries(include.map((t) => [t, 0]));
let multi = 0;
const rydbergOnly: RawPaper[] = [];
const RYDBERG = "rydberg";

for (const p of raw) {
  const hay = `${p.title} ${p.abstract}`.toLowerCase();
  const matched = include.filter((t) => hay.includes(t.toLowerCase()));
  for (const t of matched) termHits[t]++;
  if (matched.length >= 2) multi++;
  // "Rydberg" 로만: matched 가 정확히 Rydberg 계열 하나뿐 (대소문자 무시)
  if (matched.length === 1 && matched[0].toLowerCase() === RYDBERG) rydbergOnly.push(p);
}

const lines: string[] = [];
const p = (s = "") => lines.push(s);
p(`# 코퍼스 오염 감사`);
p();
p(`총 ${raw.length}편.`);
p();
p(`## include 용어별 히트 수`);
p(`| 용어 | 히트 | 비율 |`);
p(`|---|---:|---:|`);
for (const t of [...include].sort((a, b) => termHits[b] - termHits[a]))
  p(`| ${t} | ${termHits[t]} | ${((termHits[t] / raw.length) * 100).toFixed(1)}% |`);
p();
p(`- 2개 이상 용어로 걸린 논문: **${multi}** (${((multi / raw.length) * 100).toFixed(1)}%) — 거의 정상`);
p(`- "Rydberg" 하나로만 걸린 논문: **${rydbergOnly.length}** (${((rydbergOnly.length / raw.length) * 100).toFixed(1)}%) — 오염 후보 집단`);
p();
p(`## "Rydberg" 단독 매칭 제목 50개 (오염 후보 — 배제어 정하는 재료)`);
const sample = rydbergOnly.slice(0, 50);
if (sample.length) for (const s of sample) p(`- ${s.title}  \`${s.id}\``);
else p(`- 없음`);
p();

mkdirSync(resolve(root, "report"), { recursive: true });
writeFileSync(resolve(root, "report/corpus-audit.md"), lines.join("\n") + "\n");
console.log(`총 ${raw.length}편 · 2용어+ ${multi} · Rydberg단독 ${rydbergOnly.length}`);
console.log("용어별 히트:");
for (const t of [...include].sort((a, b) => termHits[b] - termHits[a]))
  console.log(`  ${t.padEnd(20)} ${termHits[t]}`);
console.log("report/corpus-audit.md 생성됨");
