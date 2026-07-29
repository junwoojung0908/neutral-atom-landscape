/**
 * fetch-corpus — 넓은 코퍼스 질의만으로 arXiv 를 수집해 로컬 캐시한다.
 * 이후 count.ts 는 이 캐시 위에서 로컬 문자열 매칭만 하므로 1초에 끝난다.
 *
 * 사용: npm run fetch-corpus                # 수집 (있으면 거부)
 *       npm run fetch-corpus -- --probe     # totalResults 만 확인 (1 요청)
 *       npm run fetch-corpus -- --refresh   # 처음부터 재수집
 *   페이지마다 corpus-raw.json 에 누적 저장 + 상태 사이드카를 남겨, 중간에 끊겨도
 *   다시 실행하면 이어받는다(--refresh 아니면).
 *
 * ── arXiv API (https://info.arxiv.org/help/api/user-manual.html, 2026-07 확인) ──
 *  endpoint http://export.arxiv.org/api/query · search_query/start/max_results/sortBy/sortOrder
 *  필드 접두사 ti abs au co jr cat rn all · 불리언 AND/OR/ANDNOT · 그룹 %28 %29 · 구문 %22%22
 *  날짜 submittedDate:[YYYYMMDDTTTT+TO+...] GMT · 페이지 ≤2000, 총 ≤30000 · 요청간 3초 권장
 *  응답 Atom XML: <opensearch:totalResults>, <published>=최초 제출, <id>=abs URL,
 *  <title>,<summary>,<author><name>,<arxiv:doi>,<category term=..>
 *  ※ ti:/abs: 로만 검색한다. all: 은 저자명·코멘트까지 훑어 오탐이 는다.
 */
import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const PAGE = 1000;
const MAX_TOTAL = 30000;
const DELAY_MS = 3000;
const RETRIES = 4;
const UA = "neutral-atom-landscape/fetch-corpus (mailto:junwoojung0908@gmail.com)";

const REFRESH = process.argv.includes("--refresh");
const PROBE = process.argv.includes("--probe");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = resolve(root, "data/corpus-raw.json");
const statePath = resolve(root, "data/.corpus-fetch-state.json");

import { passesGate, type CorpusGate } from "./boundary.ts";
interface Corpus extends CorpusGate {
  categories: string[];
  date_range: { from: string; to: string };
}
const query = JSON.parse(readFileSync(resolve(root, "data/query.json"), "utf8")) as { corpus: Corpus };
const c = query.corpus;

if (!c.strong.length) {
  console.log("query.json 의 corpus.strong 이 비어 있습니다.");
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
  // ★ 양성부(include AND cat AND date)를 하나의 그룹으로 묶은 뒤 ANDNOT 로 제외한다.
  //   arXiv 불리언은 좌결합이라 그룹핑 없이 `A ANDNOT B AND date` 를 쓰면 date 가
  //   ANDNOT 하위로 묶여 날짜 제한이 전역에 안 걸린다(1993년 논문 유입으로 관측된 버그).
  // API 쪽은 넓게(strong OR "Rydberg") 받고, 정밀 경계는 로컬 passesGate 가 적용한다.
  const incTerms = [...c.strong, "Rydberg"];
  const inc = orGroup(incTerms.map((t) => `${phrase("ti", t)}+OR+${phrase("abs", t)}`));
  const parts = [inc];
  if (c.categories.length) parts.push(orGroup(c.categories.map((x) => `cat:${x}`)));
  const from = stamp(c.date_range.from, false);
  const to = stamp(c.date_range.to, true);
  if (from && to) parts.push(`submittedDate:[${from}+TO+${to}]`);
  let q = `%28${parts.join("+AND+")}%29`;
  if (c.hard_exclude.length) {
    q += "+ANDNOT+" + orGroup(c.hard_exclude.map((t) => `${phrase("ti", t)}+OR+${phrase("abs", t)}`));
  }
  return q;
}

/** 플랫폼 게이트(boundary.ts) — API 느슨매칭 보정 겸 scope 경계 적용 */
function localPrecisionFilter(papers: Paper[]): Paper[] {
  return papers.filter((p) => passesGate(`${p.title} ${p.abstract}`, c));
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

function totalResults(xml: string): number | null {
  const m = xml.match(/<opensearch:totalResults[^>]*>\s*(\d+)\s*</);
  return m ? Number(m[1]) : null;
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

async function fetchPage(q: string, start: number, max: number): Promise<string> {
  const url =
    `http://export.arxiv.org/api/query?search_query=${q}` +
    `&start=${start}&max_results=${max}&sortBy=submittedDate&sortOrder=ascending`;
  let lastErr: unknown;
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (res.ok) return await res.text();
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    await sleep(DELAY_MS * (attempt + 2));
  }
  throw lastErr;
}

interface State { nextStart: number; done: boolean }

async function run() {
  const q = buildCorpusQuery();

  if (PROBE) {
    const total = totalResults(await fetchPage(q, 0, 1));
    console.log(`probe totalResults: ${total}`);
    console.log(`query: ${q}`);
    return;
  }

  if (REFRESH) {
    if (existsSync(outPath)) rmSync(outPath);
    if (existsSync(statePath)) rmSync(statePath);
  }

  const state: State | null = existsSync(statePath)
    ? (JSON.parse(readFileSync(statePath, "utf8")) as State)
    : null;
  const complete = existsSync(outPath) && (!state || state.done);
  if (complete && !REFRESH) {
    console.log("data/corpus-raw.json 이 이미 완료 상태입니다. 재수집하려면 --refresh 를 붙이세요.");
    return;
  }

  // 이어받기: 완료되지 않은 상태 사이드카가 있으면 그 지점부터
  let start = 0;
  let all: Paper[] = [];
  if (state && !state.done && existsSync(outPath)) {
    all = JSON.parse(readFileSync(outPath, "utf8")) as Paper[];
    start = state.nextStart;
    console.log(`이어받기: start=${start}, 기존 ${all.length}편`);
  }
  const seen = new Set(all.map((p) => p.id));

  for (; start < MAX_TOTAL; start += PAGE) {
    console.log(`  수집 start=${start} (누적 ${all.length})...`);
    const batch = parse(await fetchPage(q, start, PAGE));
    for (const p of batch) if (!seen.has(p.id)) (seen.add(p.id), all.push(p));
    const done = batch.length < PAGE;
    writeFileSync(outPath, JSON.stringify(all, null, 2) + "\n"); // 페이지마다 누적 저장
    writeFileSync(statePath, JSON.stringify({ nextStart: start + PAGE, done }) + "\n");
    if (done) break;
    await sleep(DELAY_MS);
  }
  // arXiv 느슨매칭 보정 (client-side precision filter)
  const before = all.length;
  const filtered = localPrecisionFilter(all);
  writeFileSync(outPath, JSON.stringify(filtered, null, 2) + "\n");
  writeFileSync(statePath, JSON.stringify({ nextStart: MAX_TOTAL, done: true }) + "\n");
  console.log(`\narXiv 느슨매칭 보정: ${before} → ${filtered.length} (제거 ${before - filtered.length})`);
  console.log(`data/corpus-raw.json 완료: ${filtered.length}편 (gitignore 대상)`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
