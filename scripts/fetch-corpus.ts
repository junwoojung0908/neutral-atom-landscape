/**
 * fetch-corpus — 넓은 코퍼스 질의만으로 arXiv 를 1회 수집해 로컬 캐시한다.
 * 이후 count.ts 는 이 캐시 위에서 로컬 문자열 매칭만 하므로 1초에 끝난다.
 *
 * 사용: npm run fetch-corpus            (corpus-raw.json 있으면 거부)
 *       npm run fetch-corpus -- --refresh   (재수집)
 *
 * ── arXiv API (https://info.arxiv.org/help/api/user-manual.html, 2026-07 확인) ──
 *  endpoint http://export.arxiv.org/api/query · search_query/start/max_results/sortBy/sortOrder
 *  필드 접두사 ti abs au co jr cat rn all · 불리언 AND/OR/ANDNOT · 그룹 %28 %29 · 구문 %22%22
 *  날짜 submittedDate:[YYYYMMDDTTTT+TO+...] GMT · 페이지 ≤2000, 총 ≤30000 · 요청간 3초 권장
 *  응답 Atom XML: <published>=최초 제출, <id>=abs URL, <title>,<summary>,<author><name>,
 *  <arxiv:doi>, <category term=..>
 *  ※ ti:/abs: 로만 검색한다. all: 은 저자명·코멘트까지 훑어 오탐이 는다.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const PAGE = 1000;
const MAX_TOTAL = 30000;
const DELAY_MS = 3000;
const RETRIES = 4;
const UA = "neutral-atom-landscape/fetch-corpus (mailto:junwoojung0908@gmail.com)";

const REFRESH = process.argv.includes("--refresh");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = resolve(root, "data/corpus-raw.json");

interface Corpus {
  categories: string[];
  date_range: { from: string; to: string };
  include: string[];
  exclude: string[];
}
const query = JSON.parse(readFileSync(resolve(root, "data/query.json"), "utf8")) as { corpus: Corpus };
const c = query.corpus;

if (existsSync(outPath) && !REFRESH) {
  console.log("data/corpus-raw.json 이 이미 있습니다. 재수집하려면 --refresh 를 붙이세요.");
  process.exit(0);
}
if (!c.include.length) {
  console.log("query.json 의 corpus.include 가 비어 있습니다. 채운 뒤 다시 실행하세요.");
  process.exit(0);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const enc = (s: string) => s.trim().split(/\s+/).join("+");
const phrase = (f: string, t: string) => `${f}:%22${enc(t)}%22`;
const orGroup = (parts: string[]) => `%28${parts.join("+OR+")}%29`;

function stamp(d: string, end: boolean): string | null {
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[1]}${m[2]}${m[3]}${end ? "2359" : "0000"}` : null;
}

function buildCorpusQuery(): string {
  let q = orGroup(c.include.map((t) => `${phrase("ti", t)}+OR+${phrase("abs", t)}`));
  if (c.exclude.length) {
    q += "+ANDNOT+" + orGroup(c.exclude.map((t) => `${phrase("ti", t)}+OR+${phrase("abs", t)}`));
  }
  if (c.categories.length) q += "+AND+" + orGroup(c.categories.map((x) => `cat:${x}`));
  const from = stamp(c.date_range.from, false);
  const to = stamp(c.date_range.to, true);
  if (from && to) q += `+AND+submittedDate:[${from}+TO+${to}]`;
  return q;
}

interface Paper {
  id: string;
  doi: string | null;
  title: string;
  abstract: string;
  authors: string[];
  published: string;
  year: number;
  categories: string[];
}

function parse(xml: string): Paper[] {
  const out: Paper[] = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1];
    const idRaw = e.match(/<id>\s*([\s\S]*?)\s*<\/id>/)?.[1] ?? "";
    const id = idRaw.replace(/^https?:\/\/arxiv\.org\/abs\//, "").replace(/v\d+$/, "").trim();
    if (!id) continue;
    const published = e.match(/<published>\s*([\s\S]*?)\s*<\/published>/)?.[1] ?? "";
    out.push({
      id,
      doi: e.match(/<arxiv:doi[^>]*>\s*([\s\S]*?)\s*<\/arxiv:doi>/)?.[1] ?? null,
      title: (e.match(/<title>\s*([\s\S]*?)\s*<\/title>/)?.[1] ?? "").replace(/\s+/g, " ").trim(),
      abstract: (e.match(/<summary>\s*([\s\S]*?)\s*<\/summary>/)?.[1] ?? "").replace(/\s+/g, " ").trim(),
      authors: [...e.matchAll(/<author>\s*<name>\s*([\s\S]*?)\s*<\/name>/g)].map((a) => a[1].trim()),
      published,
      year: published.slice(0, 4) ? Number(published.slice(0, 4)) : NaN,
      categories: [...e.matchAll(/<category[^>]*term="([^"]+)"/g)].map((x) => x[1]),
    });
  }
  return out;
}

async function fetchPage(q: string, start: number): Promise<string> {
  const url =
    `http://export.arxiv.org/api/query?search_query=${q}` +
    `&start=${start}&max_results=${PAGE}&sortBy=submittedDate&sortOrder=ascending`;
  let lastErr: unknown;
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (res.ok) return await res.text();
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    await sleep(DELAY_MS * (attempt + 2)); // 백오프
  }
  throw lastErr;
}

async function run() {
  const q = buildCorpusQuery();
  const all: Paper[] = [];
  const seen = new Set<string>();
  for (let start = 0; start < MAX_TOTAL; start += PAGE) {
    console.log(`  수집 start=${start}...`);
    const batch = parse(await fetchPage(q, start));
    for (const p of batch) if (!seen.has(p.id)) (seen.add(p.id), all.push(p));
    if (batch.length < PAGE) break;
    await sleep(DELAY_MS);
  }
  writeFileSync(outPath, JSON.stringify(all, null, 2) + "\n");
  console.log(`\ndata/corpus-raw.json 저장: ${all.length}편 (gitignore 대상)`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
