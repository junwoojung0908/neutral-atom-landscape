/**
 * timeline — 줌 타임라인용 논문 데이터. 각 논문: 연도·레인(가장 특이한 소속 가지)·인용수·제목·저자.
 * 인용수 = LOD(줌 레벨별 표시). citation-edges 는 followup 링크(별도 파일 그대로 씀).
 * 결과 → data/timeline.json
 *
 * 사용: npm run timeline   (corpus.json, citations.json, corpus-raw.json, counts.json)
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rd = (p: string) => JSON.parse(readFileSync(resolve(root, p), "utf8"));
for (const f of ["data/corpus.json", "data/citations.json", "data/corpus-raw.json", "data/counts.json"])
  if (!existsSync(resolve(root, f))) { console.log(`${f} 없음.`); process.exit(0); }

const cls = rd("data/corpus.json") as { id: string; year: number; matched_fields: string[] }[];
const cit = rd("data/citations.json") as Record<string, { cited: number; year: number }>;
const rawById = new Map((rd("data/corpus-raw.json") as { id: string; title: string; authors: string[] }[]).map((p) => [p.id, p]));
const branchHits = (rd("data/counts.json") as { branch_hits: Record<string, number> }).branch_hits;

// 논문 → 연구그룹: 마지막 저자 key 가 groups.json 의 어느 그룹에 속하는지
const groups = rd("data/groups.json") as { id: string; pis: { name_variants: string[] }[] }[];
const akey = (n: string) => {
  const p = n.trim().split(/\s+/).filter(Boolean);
  if (p.length < 2) return null;
  const s = p[p.length - 1].toLowerCase().replace(/[^a-z\-]/g, "");
  const i = p[0].toLowerCase().replace(/[^a-z]/g, "")[0];
  return s && i ? `${s} ${i}` : null;
};
const keyToGroup = new Map<string, string>();
for (const g of groups) for (const pi of g.pis) for (const v of pi.name_variants) {
  const k = akey(v);
  if (k && !keyToGroup.has(k)) keyToGroup.set(k, g.id);
}
function groupOf(id: string): string | null {
  const as = rawById.get(id)?.authors;
  if (!as?.length) return null;
  return keyToGroup.get(akey(as[as.length - 1]) ?? "") ?? null;
}

// 레인 = 소속 가지 중 코퍼스에서 가장 희소한(=가장 특이한) 가지. 단일 레인 배치.
function lane(fields: string[]): string {
  return fields.slice().sort((a, b) => (branchHits[a] ?? 1e9) - (branchHits[b] ?? 1e9))[0];
}

// sim(분류의 ~40%)은 해상도 실패 → 뷰 전용 서브레인 3개로 분해 (택소노미 11가지는 불변).
const SIM_GAUGE = ["lattice gauge", "gauge theor", "topological", "spin liquid", "symmetry-protected", "symmetry protected", "anyon", "toric", "string breaking", "chern"];
const SIM_DYN = ["quench", "thermaliz", "scar", "many-body localization", "kibble-zurek", "kibble zurek", "floquet", "driven", "dynamics", "relaxation", "prethermal", "hydrodynam", "entanglement growth", "information spreading"];
function simSub(hay: string): string {
  if (SIM_GAUGE.some((t) => hay.includes(t))) return "sim.gauge";
  if (SIM_DYN.some((t) => hay.includes(t))) return "sim.dyn";
  return "sim.eq";
}

// 리뷰 판정: OpenAlex type(있으면) + 제목 휴리스틱
let workTypes: Record<string, string> = {};
try { workTypes = rd("data/work-types.json"); } catch { /* 아직 없음 */ }
const REVIEW_TITLE = /\breview\b|colloquium|roadmap|perspective|tutorial|primer\b/i;
const isReview = (id: string, title: string) =>
  workTypes[id] === "review" || REVIEW_TITLE.test(title);

// 중요도 점수: 기본=절대 인용. 최근 3년 논문이 (주요저널 or 인용>=20)이면
// 단위시간당 인용을 4년치로 환산해 max(절대, 환산) — 최신 임팩트가 묻히지 않게.
const NOW = new Date().getFullYear() + new Date().getMonth() / 12;
const MAJOR_DOI = /(10\.1038\/|10\.1126\/|10\.1073\/|10\.22331\/|physrevlett|physrevx|prxquantum|revmodphys)/i;
const rawDoi = new Map((rd("data/corpus-raw.json") as { id: string; doi?: string | null }[]).map((x) => [x.id, x.doi ?? ""]));
function scoreOf(id: string, year: number, cited: number): { score: number; hot: boolean } {
  const age = Math.max(NOW - (year + 0.5), 0.5);
  const major = MAJOR_DOI.test(rawDoi.get(id) ?? "");
  if (age <= 3 && (major || cited >= 20)) {
    const boosted = Math.round((cited / age) * 4);
    if (boosted > cited) return { score: boosted, hot: true };
  }
  return { score: cited, hot: false };
}

const papers = cls.map((p) => {
  const r = rawById.get(p.id) as { title?: string; authors?: string[]; abstract?: string } | undefined;
  const a0 = r?.authors?.[0] ?? "";
  let ln = lane(p.matched_fields);
  if (ln === "sim") ln = simSub(`${r?.title ?? ""} ${r?.abstract ?? ""}`.toLowerCase());
  return {
    id: p.id,
    year: p.year,
    lane: ln,
    fields: p.matched_fields,
    cited: cit[p.id]?.cited ?? 0,
    ...(() => { const sc = scoreOf(p.id, p.year, cit[p.id]?.cited ?? 0); return { score: sc.score, hot: sc.hot || undefined }; })(),
    title: r?.title ?? p.id,
    author: a0 ? `${a0}${(r?.authors?.length ?? 1) > 1 ? " et al." : ""}` : "",
    pi: r?.authors?.length ? r.authors[r.authors.length - 1] : "",
    group: groupOf(p.id),
    review: isReview(p.id, r?.title ?? "") || undefined,
  };
});

writeFileSync(resolve(root, "data/timeline.json"), JSON.stringify({ papers }, null, 2) + "\n");
const byCited = papers.slice().sort((a, b) => b.cited - a.cited);
console.log(`timeline: ${papers.length}편. 인용>0: ${papers.filter((p) => p.cited > 0).length}`);
console.log(`상위: ${byCited.slice(0, 3).map((p) => `${p.cited}(${p.lane})`).join(", ")}`);
console.log("data/timeline.json 생성됨");
