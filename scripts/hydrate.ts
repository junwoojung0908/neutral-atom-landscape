/**
 * hydrate — refs 의 식별자로 서지 메타데이터를 조회해 채운다.
 * enrich.ts (대조 리포트만) 와 역할이 다르다: 이쪽은 값을 채워 넣는다.
 *
 * 규칙:
 *  - 채우는 필드는 label / byline / venue / year 넷뿐.
 *    fields / weight / weight_rationale / thesis / verified 는 절대 건드리지 않는다.
 *  - 기존 값과 다르면 diff 를 출력하고, --force 없이는 파일을 쓰지 않는다(미리보기).
 *  - --force 로 실제 반영하면 해당 항목의 metadata_source 를 "api" 로 설정한다.
 *  - refs 가 빈 항목은 건너뛰고 목록으로 보고한다.
 *
 * 사용: tsx scripts/hydrate.ts [--force]
 *   arXiv → export.arxiv.org API,  DOI → Crossref API
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const FORCE = process.argv.includes("--force");
// 비플래그 인자 = 처리 대상 id 화이트리스트 (없으면 전체). 검토 완료 항목을 보호하려면
// `npm run hydrate -- --force bluvstein24 wu22` 처럼 범위를 좁힌다.
const ONLY = new Set(process.argv.slice(2).filter((a) => !a.startsWith("--")));
// 이 넷은 사실이므로 항상 API 와 대조·갱신한다. 편집상 주석은 entities.json 의
// affiliation_note(hydrate 비대상)로 분리돼 있으니 byline 을 덮어써도 주석은 안 사라진다.
const HYDRATED_KEYS = ["label", "byline", "venue", "year"] as const;
const UA = "neutral-atom-landscape/hydrate (mailto:junwoojung0908@gmail.com)";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const entitiesPath = resolve(root, "data", "entities.json");

type Ref = { type: "doi" | "arxiv"; value: string };
type Entity = Record<string, unknown> & {
  id: string;
  refs?: Ref[];
  label?: string;
  byline?: string;
  venue?: string;
  year?: number;
  metadata_source?: string;
};
type Fetched = { label?: string; byline?: string; venue?: string; year?: number };

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

function bylineFrom(authors: string[]): string {
  const a = authors.filter(Boolean);
  if (a.length === 0) return "";
  if (a.length > 10) return `${a[0]} et al.`;
  return a.join(", ");
}

async function fetchArxiv(id: string): Promise<Fetched | null> {
  const url = `http://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  const xml = await res.text();
  const entry = xml.match(/<entry>([\s\S]*?)<\/entry>/)?.[1];
  if (!entry) return null;
  const title = entry.match(/<title>([\s\S]*?)<\/title>/)?.[1];
  const authors = [...entry.matchAll(/<name>([\s\S]*?)<\/name>/g)].map((m) => collapse(m[1]));
  const year = entry.match(/<published>(\d{4})/)?.[1];
  const journalRef = entry.match(/<arxiv:journal_ref[^>]*>([\s\S]*?)<\/arxiv:journal_ref>/)?.[1];
  // journal_ref 는 흔히 후행 "(YYYY)" 를 달고 온다. 연도는 year 필드가 따로 갖고,
  // Crossref venue 는 연도를 안 붙이므로, 출처 간 venue 포맷을 맞추려 벗긴다.
  const venue = journalRef ? collapse(journalRef).replace(/\s*\(\d{4}\)\s*$/, "") : `arXiv:${id}`;
  return {
    label: title ? collapse(title) : undefined,
    byline: bylineFrom(authors),
    venue,
    year: year ? Number(year) : undefined,
  };
}

async function fetchCrossref(doi: string): Promise<Fetched | null> {
  const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  const json = (await res.json()) as { message?: Record<string, unknown> };
  const m = json.message;
  if (!m) return null;
  const title = Array.isArray(m.title) ? (m.title[0] as string) : undefined;
  const authors = Array.isArray(m.author)
    ? (m.author as { given?: string; family?: string }[]).map((au) =>
        collapse(`${au.given ?? ""} ${au.family ?? ""}`),
      )
    : [];
  const container = Array.isArray(m["container-title"])
    ? (m["container-title"][0] as string)
    : undefined;
  const volume = m.volume as string | undefined;
  const page = (m.page ?? (m["article-number"] as string | undefined)) as string | undefined;
  const issued = m.issued as { "date-parts"?: number[][] } | undefined;
  const year = issued?.["date-parts"]?.[0]?.[0];
  const venue = container
    ? collapse(`${container}${volume ? " " + volume : ""}${page ? ", " + page : ""}`)
    : undefined;
  return {
    label: title ? collapse(title) : undefined,
    byline: bylineFrom(authors),
    venue,
    year: typeof year === "number" ? year : undefined,
  };
}

async function fetchByRef(ref: Ref): Promise<Fetched | null> {
  try {
    return ref.type === "arxiv" ? await fetchArxiv(ref.value) : await fetchCrossref(ref.value);
  } catch {
    return null;
  }
}

// ---- run ----
const entities = JSON.parse(readFileSync(entitiesPath, "utf8")) as Entity[];
const skipped: string[] = [];
const failed: string[] = [];
const wouldChange: string[] = [];
const applied: string[] = [];
let dirty = false;

for (const e of entities) {
  if (ONLY.size && !ONLY.has(e.id)) continue; // 범위 밖 항목은 건드리지 않음
  const refs = Array.isArray(e.refs) ? e.refs : [];
  if (refs.length === 0) {
    skipped.push(e.id);
    continue;
  }

  let got: Fetched | null = null;
  for (const ref of refs) {
    got = await fetchByRef(ref);
    if (got) break;
  }
  if (!got) {
    failed.push(e.id);
    continue;
  }

  // 4개 필드만 대상으로 diff 계산
  const diffs: string[] = [];
  for (const k of HYDRATED_KEYS) {
    const next = got[k];
    if (next === undefined || next === "") continue;
    const cur = e[k];
    if (cur !== next) diffs.push(`    ${k}: ${JSON.stringify(cur)}  ->  ${JSON.stringify(next)}`);
  }

  if (diffs.length === 0) {
    console.log(`✓ ${e.id}: API 값과 일치`);
    if (FORCE && e.metadata_source !== "api") {
      e.metadata_source = "api";
      dirty = true;
      applied.push(`${e.id} (metadata_source→api)`);
    }
    continue;
  }

  console.log(`~ ${e.id}: 변경 예정\n${diffs.join("\n")}`);
  if (FORCE) {
    for (const k of HYDRATED_KEYS) {
      const next = got[k];
      if (next === undefined || next === "") continue;
      (e as Record<string, unknown>)[k] = next;
    }
    e.metadata_source = "api";
    dirty = true;
    applied.push(e.id);
  } else {
    wouldChange.push(e.id);
  }
}

// ---- write / report ----
if (dirty) {
  writeFileSync(entitiesPath, JSON.stringify(entities, null, 2) + "\n");
}

console.log("\n--- hydrate 요약 ---");
if (skipped.length) console.log(`건너뜀 (refs 없음): ${skipped.join(", ")}`);
if (failed.length) console.log(`조회 실패 (문헌 미확인 가능성): ${failed.join(", ")}`);
if (wouldChange.length) {
  console.log(`변경 대기 (--force 필요): ${wouldChange.join(", ")}`);
}
if (applied.length) console.log(`반영됨: ${applied.join(", ")}`);
if (!FORCE && wouldChange.length) {
  console.log("\n--force 없이는 파일을 쓰지 않았습니다. 위 diff 확인 후 다시 실행하세요.");
}
console.log("주의: hydrate 는 verified 를 설정하지 않습니다. 눈으로 확인한 뒤 직접 날짜를 넣으세요.");
