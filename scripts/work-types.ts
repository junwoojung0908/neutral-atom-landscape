/**
 * work-types — citations.json 의 OpenAlex id 로 각 논문의 type(article/review/…)을 가져온다.
 * 리뷰를 타임라인에서 속 빈 원으로 구분하기 위함. 결과 → data/work-types.json {arxivId: type}
 * 사용: npm run work-types
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const MAILTO = "junwoojung0908@gmail.com";
const BATCH = 50;
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cit = JSON.parse(readFileSync(resolve(root, "data/citations.json"), "utf8")) as Record<string, { oa: string }>;

const entries = Object.entries(cit).filter(([, v]) => v.oa);
const oaToArxiv = new Map(entries.map(([a, v]) => [v.oa.replace("https://openalex.org/", ""), a]));
const ids = [...oaToArxiv.keys()];

async function run() {
  const outPath = resolve(root, "data/work-types.json");
  let out: Record<string, string> = {};
  try { out = JSON.parse(readFileSync(outPath, "utf8")); } catch { /* fresh */ }
  const todo = ids.filter((id) => !(oaToArxiv.get(id)! in out));
  console.log(`남음 ${todo.length}/${ids.length}`);
  for (let i = 0; i < todo.length; i += BATCH) {
    const chunk = todo.slice(i, i + BATCH);
    const url = `https://api.openalex.org/works?filter=openalex:${chunk.join("|")}&select=id,type&per-page=${BATCH}&mailto=${MAILTO}`;
    let rs: { id: string; type: string }[] = [];
    for (let a = 0; a < 5; a++) {
      const res = await fetch(url);
      if (res.ok) { rs = ((await res.json()) as { results: typeof rs }).results ?? []; break; }
      await new Promise((r) => setTimeout(r, res.status === 429 ? 4000 * (a + 1) : 1000));
    }
    for (const w of rs) {
      const a = oaToArxiv.get(w.id.replace("https://openalex.org/", ""));
      if (a) out[a] = w.type;
    }
    writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
    await new Promise((r) => setTimeout(r, 900));
  }
  writeFileSync(resolve(root, "data/work-types.json"), JSON.stringify(out, null, 2) + "\n");
  const dist: Record<string, number> = {};
  for (const t of Object.values(out)) dist[t] = (dist[t] ?? 0) + 1;
  console.log(`types ${Object.keys(out).length}:`, JSON.stringify(dist));
}
run().catch((e) => { console.error(e); process.exit(1); });
