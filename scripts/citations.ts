/**
 * citations — OpenAlex 에서 코퍼스(분류된) 논문의 인용수 + 내부 인용그래프를 가져온다.
 * 시맨틱-줌 타임라인의 (a) 중요도 티어(줌 레벨별 표시) (b) followup 링크 를 채우는 데이터.
 *
 * ── OpenAlex API (라이브 프로브로 확인, 2026-07) ──
 *  · /works?filter=doi:<d1>|<d2>|...  (OR, 배치. per-page 최대 200; DOI OR 는 50개까지 안전)
 *  · select=id,doi,cited_by_count,referenced_works,publication_year 로 페이로드 축소
 *  · polite pool: &mailto=... (레이트 넉넉, 그래도 요청 간 딜레이)
 *  · ⚠ arXiv-DOI(10.48550/arXiv.<id>) 레코드는 인용 과소집계(프리프린트/출판본 별개 레코드).
 *    출판 DOI 있으면 그걸 우선 사용. 없으면 arXiv-DOI 폴백(과소집계 감수).
 *
 * 사용: npm run citations            (있으면 재개)
 *       npm run citations -- --refresh
 * 출력: data/citations.json (arxivId -> {oa, cited, year}),
 *       data/citation-edges.json (코퍼스 내부: {from=피인용, to=인용} = followup)
 */
import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const BATCH = 50;
const DELAY_MS = 400;
const RETRIES = 4;
const MAILTO = "junwoojung0908@gmail.com";
const REFRESH = process.argv.includes("--refresh");

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rd = (p: string) => JSON.parse(readFileSync(resolve(root, p), "utf8"));
const cachePath = resolve(root, "data/.citations-cache.json");

interface Raw { id: string; doi: string | null }
const classified = rd("data/corpus.json") as { id: string; year: number }[];
const rawById = new Map((rd("data/corpus-raw.json") as Raw[]).map((p) => [p.id, p]));
// 수동 승인된 출판 DOI 오버레이 (Crossref 복구, report/doi-recovery.md 근거)
let doiOverrides: Record<string, string> = {};
try { doiOverrides = rd("data/doi-overrides.json"); } catch { /* 없음 */ }

// 각 논문의 조회 DOI: 출판 DOI 우선, 없으면 arXiv-DOI 폴백
const bareDoi = (d: string) => d.replace(/^https?:\/\/doi\.org\//i, "").toLowerCase().trim();
const isArxivDoi = (d: string) => /^10\.48550\/arxiv\./i.test(d);
interface Target { arxiv: string; doi: string; fromArxiv: boolean }
const targets: Target[] = classified.map((p) => {
  const r = rawById.get(p.id);
  const pub = (r?.doi && !isArxivDoi(r.doi) ? bareDoi(r.doi) : null) ?? (doiOverrides[p.id] ? bareDoi(doiOverrides[p.id]) : null);
  return pub
    ? { arxiv: p.id, doi: pub, fromArxiv: false }
    : { arxiv: p.id, doi: `10.48550/arxiv.${p.id}`, fromArxiv: true };
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface OAWork { id: string; doi: string | null; cited_by_count: number; referenced_works: string[]; publication_year: number }
async function fetchBatch(dois: string[]): Promise<OAWork[]> {
  const url =
    `https://api.openalex.org/works?filter=doi:${dois.join("|")}` +
    `&select=id,doi,cited_by_count,referenced_works,publication_year&per-page=${BATCH}&mailto=${MAILTO}`;
  let lastErr: unknown;
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) return ((await res.json()) as { results: OAWork[] }).results ?? [];
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    await sleep(DELAY_MS * (attempt + 2));
  }
  throw lastErr;
}

async function run() {
  if (REFRESH && existsSync(cachePath)) rmSync(cachePath);
  // cache: doi(bare) -> {oa, cited, refs, year}
  const cache: Record<string, { oa: string; cited: number; refs: string[]; year: number }> =
    existsSync(cachePath) ? rd("data/.citations-cache.json") : {};

  const todo = targets.filter((t) => !(t.doi in cache));
  console.log(`대상 ${targets.length}편, 캐시 ${Object.keys(cache).length}, 남음 ${todo.length}`);

  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    const works = await fetchBatch(batch.map((t) => t.doi));
    const byDoi = new Map(works.map((w) => [w.doi ? bareDoi(w.doi) : "", w]));
    for (const t of batch) {
      const w = byDoi.get(t.doi);
      if (w) cache[t.doi] = { oa: w.id, cited: w.cited_by_count, refs: w.referenced_works ?? [], year: w.publication_year };
      else cache[t.doi] = { oa: "", cited: -1, refs: [], year: 0 }; // 미매칭 표시
    }
    writeFileSync(cachePath, JSON.stringify(cache) + "\n"); // 배치마다 저장(재개)
    console.log(`  ${Math.min(i + BATCH, todo.length)}/${todo.length}`);
    await sleep(DELAY_MS);
  }

  // 결과 조립
  const citations: Record<string, { oa: string; cited: number; year: number }> = {};
  const oaToArxiv = new Map<string, string>();
  let matched = 0, viaArxiv = 0, matchedArxiv = 0;
  for (const t of targets) {
    const c = cache[t.doi];
    if (!c || c.cited < 0) continue;
    citations[t.arxiv] = { oa: c.oa, cited: c.cited, year: c.year };
    oaToArxiv.set(c.oa, t.arxiv);
    matched++;
    if (t.fromArxiv) { viaArxiv++; matchedArxiv++; }
  }
  // 내부 인용 엣지: ref(피인용) 가 코퍼스에 있으면 {from=ref논문, to=인용논문}
  const edges: { from: string; to: string }[] = [];
  for (const t of targets) {
    const c = cache[t.doi];
    if (!c || c.cited < 0) continue;
    for (const ref of c.refs) {
      const fromArxiv = oaToArxiv.get(ref);
      if (fromArxiv && fromArxiv !== t.arxiv) edges.push({ from: fromArxiv, to: t.arxiv });
    }
  }

  writeFileSync(resolve(root, "data/citations.json"), JSON.stringify(citations, null, 2) + "\n");
  writeFileSync(resolve(root, "data/citation-edges.json"), JSON.stringify(edges, null, 2) + "\n");

  const cvals = Object.values(citations).map((c) => c.cited).sort((a, b) => b - a);
  console.log(`\n매칭 ${matched}/${targets.length} (arXiv-DOI 폴백 ${viaArxiv}편)`);
  console.log(`인용수 상위: ${cvals.slice(0, 8).join(", ")} … 중앙값 ${cvals[Math.floor(cvals.length / 2)] ?? 0}`);
  console.log(`코퍼스 내부 인용 엣지(followup): ${edges.length}`);
  console.log("data/citations.json, data/citation-edges.json 생성됨");
}

run().catch((e) => { console.error(e); process.exit(1); });
