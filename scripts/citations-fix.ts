/**
 * citations-fix — arXiv-DOI 폴백(출판 DOI 없음, 인용 과소집계) 논문을 OpenAlex 제목 검색으로
 * 출판본 레코드에 재매칭한다. 안전 기준: 정규화 제목 완전일치 + 연도차 ≤3 일 때만 교체.
 * 캐시(.citations-cache.json)를 갱신하므로, 이후 `npm run citations` 가 산출물을 재조립한다.
 *
 * 사용: npm run citations-fix
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const MAILTO = "junwoojung0908@gmail.com";
const CHUNK = 5;
const DELAY_MS = 300;

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rd = (p: string) => JSON.parse(readFileSync(resolve(root, p), "utf8"));
const cachePath = resolve(root, "data/.citations-cache.json");
if (!existsSync(cachePath)) { console.log("캐시 없음 — npm run citations 먼저."); process.exit(0); }

interface Raw { id: string; doi: string | null; title: string; year: number }
const rawById = new Map((rd("data/corpus-raw.json") as Raw[]).map((p) => [p.id, p]));
const classified = rd("data/corpus.json") as { id: string }[];
const cache = rd("data/.citations-cache.json") as Record<string, { oa: string; cited: number; refs: string[]; year: number }>;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
const isArxivDoi = (d: string) => /^10\.48550\/arxiv\./i.test(d);
const bareDoi = (d: string) => d.replace(/^https?:\/\/doi\.org\//i, "").toLowerCase().trim();

// 폴백 대상: 출판 DOI 없는 분류 논문
const targets = classified
  .map((p) => rawById.get(p.id))
  .filter((r): r is Raw => !!r && (!r.doi || isArxivDoi(r.doi)));

interface OAW { id: string; doi: string | null; title: string; cited_by_count: number; referenced_works: string[]; publication_year: number }
async function search(t: Raw): Promise<OAW | null> {
  const q = encodeURIComponent(t.title.replace(/["%]/g, " ").slice(0, 220));
  const url = `https://api.openalex.org/works?filter=title.search:${q}&per-page=3&select=id,doi,title,cited_by_count,referenced_works,publication_year&mailto=${MAILTO}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const rs = ((await res.json()) as { results: OAW[] }).results ?? [];
    for (const w of rs) {
      if (!w.title || norm(w.title) !== norm(t.title)) continue;
      if (t.year && w.publication_year && Math.abs(w.publication_year - t.year) > 3) continue;
      return w;
    }
  } catch { /* skip */ }
  return null;
}

async function run() {
  let improved = 0, checked = 0;
  for (let i = 0; i < targets.length; i += CHUNK) {
    const chunk = targets.slice(i, i + CHUNK);
    const results = await Promise.all(chunk.map(search));
    for (let j = 0; j < chunk.length; j++) {
      const t = chunk[j];
      const w = results[j];
      checked++;
      if (!w) continue;
      const key = `10.48550/arxiv.${t.id}`;
      const cur = cache[key];
      if (!cur || w.cited_by_count > cur.cited) {
        cache[key] = { oa: w.id, cited: w.cited_by_count, refs: w.referenced_works ?? [], year: w.publication_year };
        improved++;
      }
    }
    writeFileSync(cachePath, JSON.stringify(cache) + "\n");
    if (i % 100 === 0) console.log(`  ${checked}/${targets.length} (개선 ${improved})`);
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }
  console.log(`재매칭 완료: ${checked}편 검사, ${improved}편 개선(출판본 레코드로 교체)`);
  console.log("이제 `npm run citations` 로 산출물 재조립.");
}
run().catch((e) => { console.error(e); process.exit(1); });
