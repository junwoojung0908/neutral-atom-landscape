/**
 * doi-recovery — DOI 없는 분류 논문을 OpenAlex 제목검색으로 출판 레코드 탐색 (리포트 전용).
 * 매칭 기준: 정규화 제목 완전일치 AND 제1저자 성 일치. 자동 병합 없음 — 승인은 운영자.
 * 결과 → report/doi-recovery.md + 집계(출판본 놓침 vs 진짜 arXiv 전용).
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const MAILTO = "junwoojung0908@gmail.com";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rd = (p: string) => JSON.parse(readFileSync(resolve(root, p), "utf8"));
const cachePath = resolve(root, "data/.doi-recovery-cache.json");

interface Raw { id: string; doi: string | null; title: string; authors: string[]; year: number }
const rawById = new Map((rd("data/corpus-raw.json") as Raw[]).map((p) => [p.id, p]));
const classified = rd("data/corpus.json") as { id: string }[];
const isArxivDoi = (d: string) => /^10\.48550\/arxiv\./i.test(d);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
const fam = (n: string) => (n.trim().split(/\s+/).pop() ?? "").toLowerCase().replace(/[^a-z\-]/g, "");

const targets = classified.map((c) => rawById.get(c.id)).filter((r): r is Raw => !!r && (!r.doi || isArxivDoi(r.doi)));
let cache: Record<string, { doi: string | null; oaCited?: number; via?: string }> = {};
try { cache = rd("data/.doi-recovery-cache.json"); } catch { /* fresh */ }

interface OAW { doi: string | null; title: string; cited_by_count: number; publication_year: number; authorships: { author: { display_name: string } }[] }
async function search(t: Raw): Promise<{ doi: string; cited: number } | null> {
  const q = encodeURIComponent(t.title.replace(/["%]/g, " ").slice(0, 220));
  const url = `https://api.openalex.org/works?filter=title.search:${q}&per-page=4&select=doi,title,cited_by_count,publication_year,authorships&mailto=${MAILTO}`;
  for (let a = 0; a < 4; a++) {
    try {
      const res = await fetch(url);
      if (res.status === 429) { await new Promise((r) => setTimeout(r, 5000 * (a + 1))); continue; }
      if (!res.ok) return null;
      const rs = ((await res.json()) as { results: OAW[] }).results ?? [];
      for (const w of rs) {
        if (!w.doi || isArxivDoi(w.doi.replace(/^https?:\/\/doi\.org\//, ""))) continue;
        if (norm(w.title ?? "") !== norm(t.title)) continue;
        const first = w.authorships?.[0]?.author?.display_name ?? "";
        if (fam(first) !== fam(t.authors?.[0] ?? "")) continue;
        return { doi: w.doi.replace(/^https?:\/\/doi\.org\//, ""), cited: w.cited_by_count };
      }
      return null;
    } catch { await new Promise((r) => setTimeout(r, 1500)); }
  }
  return null;
}

async function run() {
  const todo = targets.filter((t) => !(t.id in cache));
  console.log(`대상 ${targets.length} (DOI 없음), 캐시 ${targets.length - todo.length}, 남음 ${todo.length}`);
  let i = 0;
  for (const t of todo) {
    const hit = await search(t);
    cache[t.id] = hit ? { doi: hit.doi, oaCited: hit.cited } : { doi: null };
    if (++i % 25 === 0) { writeFileSync(cachePath, JSON.stringify(cache)); console.log(`  ${i}/${todo.length}`); }
    await new Promise((r) => setTimeout(r, 450));
  }
  writeFileSync(cachePath, JSON.stringify(cache));

  const found = targets.filter((t) => cache[t.id]?.doi);
  const none = targets.length - found.length;
  const L = ["# DOI 복구 후보 (자동 병합 안 함 — 운영자 승인 대상)", "",
    `스캔 ${targets.length}편(출판 DOI 부재) 중 **출판 레코드 발견 ${found.length}편**, 진짜 arXiv 전용(또는 미매칭) ${none}편.`,
    "매칭 기준: 정규화 제목 완전일치 + 제1저자 성 일치.", "",
    "| arXiv id | 연도 | 발견 DOI | OA 인용 | 제목 |", "|---|---|---|---:|---|"];
  for (const t of found.sort((a, b) => (cache[b.id].oaCited ?? 0) - (cache[a.id].oaCited ?? 0)))
    L.push(`| ${t.id} | ${t.year} | ${cache[t.id].doi} | ${cache[t.id].oaCited ?? 0} | ${t.title.slice(0, 70)} |`);
  mkdirSync(resolve(root, "report"), { recursive: true });
  writeFileSync(resolve(root, "report/doi-recovery.md"), L.join("\n") + "\n");
  console.log(`발견 ${found.length} / 전용·미매칭 ${none} → report/doi-recovery.md`);
}
run().catch((e) => { console.error(e); process.exit(1); });
