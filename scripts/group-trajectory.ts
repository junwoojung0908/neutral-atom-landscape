/**
 * group-trajectory — 그룹(저자)의 관심이 어디서 어디로 이동했나. 이 데이터셋만의 이야기.
 *   - 저자 정규화(surname + 첫이니셜)로 상위 그룹 추출 (PI 는 논문이 누적돼 상위에 옴)
 *   - 각 그룹: 초기(≤2021) vs 최근(≥2022) 가지 구성(분수) → 이동
 * 소속·PI 신원은 단정하지 않는다(이름·이동만). 새 데이터 불필요.
 * 결과 → report/group-trajectory.md
 *
 * 사용: npm run group-trajectory
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rd = (p: string) => JSON.parse(readFileSync(resolve(root, p), "utf8"));
if (!existsSync(resolve(root, "data/corpus-raw.json"))) {
  console.log("data/corpus-raw.json 이 없습니다.");
  process.exit(0);
}

interface Raw { id: string; authors: string[]; year: number }
const raw = rd("data/corpus-raw.json") as Raw[];
const matched = new Map<string, string[]>(
  (rd("data/corpus.json") as { id: string; matched_fields: string[] }[]).map((r) => [r.id, r.matched_fields]),
);

/** "Mikhail D. Lukin" -> "lukin m" (surname + 첫 이니셜) */
function key(name: string): string | null {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  const surname = parts[parts.length - 1].toLowerCase().replace(/[^a-z\-]/g, "");
  const init = parts[0].toLowerCase().replace(/[^a-z]/g, "")[0];
  if (!surname || !init || surname.length < 2) return null;
  return `${surname} ${init}`;
}

interface G { papers: { year: number; fields: string[] }[] }
const groups = new Map<string, G>();
for (const p of raw) {
  if (Number.isNaN(p.year)) continue;
  const fields = matched.get(p.id) ?? []; // 미분류면 빈 배열
  const seen = new Set<string>();
  for (const a of p.authors ?? []) {
    const k = key(a);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    let g = groups.get(k);
    if (!g) groups.set(k, (g = { papers: [] }));
    g.papers.push({ year: p.year, fields });
  }
}

// 흔한 성씨 = surname+이니셜 정규화가 여러 사람을 한 키로 뭉치는 충돌 위험군 (신뢰 낮음)
const COMMON = new Set([
  "wang", "zhang", "li", "liu", "chen", "yang", "huang", "zhao", "wu", "zhou", "xu", "sun",
  "guo", "gao", "lin", "ma", "hu", "he", "gu", "ding", "jia", "luo", "song", "tang", "deng",
  "kim", "lee", "park", "choi", "singh", "kumar", "yu", "cao", "peng", "xie", "shi", "duan",
]);

/** 기간별 가지 분수 share 사전 */
function mix(papers: { fields: string[] }[]): { share: Record<string, number>; n: number } {
  const frac: Record<string, number> = {};
  let n = 0;
  for (const p of papers) {
    if (!p.fields.length) continue;
    n++;
    for (const f of p.fields) frac[f] = (frac[f] ?? 0) + 1 / p.fields.length;
  }
  for (const k of Object.keys(frac)) frac[k] /= n || 1;
  return { share: frac, n };
}
const top1 = (s: Record<string, number>) => Object.entries(s).sort((a, b) => b[1] - a[1])[0];

const top = [...groups.entries()]
  .map(([k, g]) => ({ k, g, n: g.papers.length }))
  .filter((x) => x.n >= 12)
  .sort((a, b) => b.n - a.n)
  .slice(0, 30);

interface Row {
  k: string; n: number; y0: number; y1: number; collide: boolean;
  eTop?: [string, number]; rTop?: [string, number];
  rise?: [string, number]; fall?: [string, number]; en: number; rn: number;
}
const rows: Row[] = top.map(({ k, g, n }) => {
  const ys = g.papers.map((p) => p.year);
  const em = mix(g.papers.filter((p) => p.year <= 2021));
  const rm = mix(g.papers.filter((p) => p.year >= 2022));
  const branches = new Set([...Object.keys(em.share), ...Object.keys(rm.share)]);
  let rise: [string, number] | undefined, fall: [string, number] | undefined;
  for (const b of branches) {
    const d = (rm.share[b] ?? 0) - (em.share[b] ?? 0);
    if (!rise || d > rise[1]) rise = [b, d];
    if (!fall || d < fall[1]) fall = [b, d];
  }
  return {
    k, n, y0: Math.min(...ys), y1: Math.max(...ys), collide: COMMON.has(k.split(" ")[0]),
    eTop: top1(em.share), rTop: top1(rm.share), rise, fall, en: em.n, rn: rm.n,
  };
});

const pc = (v?: number) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(0)}%`);
const L: string[] = [];
const w = (s = "") => L.push(s);
w(`# 그룹 궤적 (저자 surname+이니셜, 소속 미단정)`);
w();
w(`corpus ${raw.length}편. 논문≥12 상위 ${rows.length}. 초기≤2021 / 최근2022+. 분류논문 분수 share.`);
w(`⚠ = 흔한 성씨(여러 사람 뭉침, 신뢰낮음). 이동은 최근−초기 share 델타 최대 상승/하락 가지.`);
w();
w(`| 저자 | 총 | 연도 | 초기#1 | 최근#1 | ▲상승 | ▼하락 | 신뢰 |`);
w(`|---|---:|---|---|---|---|---|---|`);
for (const r of rows) {
  const e = r.eTop ? `${r.eTop[0]} ${(r.eTop[1] * 100).toFixed(0)}%` : "—";
  const rc = r.rTop ? `${r.rTop[0]} ${(r.rTop[1] * 100).toFixed(0)}%` : "—";
  const both = r.en >= 3 && r.rn >= 3;
  w(`| ${r.k} | ${r.n} | ${r.y0}–${r.y1} | ${e} | ${rc} | ${both ? `${r.rise?.[0]} ${pc(r.rise?.[1])}` : "—"} | ${both ? `${r.fall?.[0]} ${pc(r.fall?.[1])}` : "—"} | ${r.collide ? "⚠충돌" : "ok"} |`);
}
w();

mkdirSync(resolve(root, "report"), { recursive: true });
writeFileSync(resolve(root, "report/group-trajectory.md"), L.join("\n") + "\n");

console.log("=== 신뢰 가능(구별되는 성씨) 그룹 이동 ===");
for (const r of rows.filter((x) => !x.collide)) {
  const both = r.en >= 3 && r.rn >= 3;
  const mv = both && r.rise && r.fall ? `▲${r.rise[0]} ${pc(r.rise[1])}  ▼${r.fall[0]} ${pc(r.fall[1])}` : "(한 기간뿐)";
  console.log(`  ${r.k.padEnd(14)} n${String(r.n).padStart(3)} ${String(r.y0)}-${r.y1}  ${mv}`);
}
console.log("\n=== 충돌 성씨(신뢰낮음, 참고) ===");
console.log("  " + rows.filter((x) => x.collide).map((x) => `${x.k}(${x.n})`).join(", "));
console.log("report/group-trajectory.md 생성됨");
