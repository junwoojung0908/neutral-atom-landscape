/**
 * selftest — 데이터 불변식 회귀 검사. CI 에서 build 전에 실행(실패 시 배포 중단).
 * UI 는 못 잡지만, 파이프라인 재생성이 데이터 계약을 깨는 것은 잡는다.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rd = (p: string) => JSON.parse(readFileSync(resolve(root, p), "utf8"));
let fail = 0;
const ok = (cond: boolean, msg: string) => {
  if (!cond) { console.error(`FAIL ${msg}`); fail++; }
};

const { papers } = rd("data/timeline.json") as { papers: { id: string; lane: string; year: number; cited: number; score: number; hot?: boolean; title: string }[] };
const edges = rd("data/citation-edges.json") as { from: string; to: string }[];
const bp = rd("data/branch-papers.json") as Record<string, { topCited?: { cited?: number }[] }>;
const counts = rd("data/counts.json") as { corpus_total: number; classified: number; generated_at?: string };

const LANES = new Set(["qec","gate","readout","sim.eq","sim.dyn","sim.gauge","species","clock","opt","classical","software","scale","net"]);
const ids = new Set(papers.map((p) => p.id));

ok(papers.length > 1000, `timeline papers ${papers.length} > 1000`);
ok(papers.every((p) => LANES.has(p.lane)), "모든 논문 lane 이 알려진 13레인");
ok(papers.every((p) => p.score >= p.cited), "score >= cited (보정은 상향만)");
ok(papers.every((p) => !p.hot || p.year >= 2023), "hot 은 최근 3년만");
ok(papers.every((p) => p.year >= 2015 && p.year <= 2026), "연도 2015–2026");
ok(edges.every((e) => ids.has(e.from) && ids.has(e.to)), "인용 엣지 양끝이 timeline 에 존재");
ok(edges.length > 5000, `인용 엣지 ${edges.length} > 5000`);
for (const [b, d] of Object.entries(bp)) {
  const tc = d.topCited ?? [];
  ok(tc.every((x, i) => i === 0 || (tc[i - 1].cited ?? 0) >= (x.cited ?? 0)), `${b} topCited 내림차순`);
}
ok(counts.classified <= counts.corpus_total, "classified <= corpus_total");
ok(!!counts.generated_at, "counts.generated_at 존재");

if (fail) { console.error(`✗ selftest ${fail} 실패`); process.exit(1); }
console.log("✓ selftest 통과 (데이터 불변식)");
