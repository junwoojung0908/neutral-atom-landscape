/**
 * author-candidates — 그룹 귀속 전 저자 후보를 뽑아 사람이 검토하게 한다(확정 금지).
 *   - 귀속은 마지막 저자(AMO 에서 PI 관례). last-author 기준 상위 40 + any-author 대조.
 *   - 표기 변형("M. Lukin" ↔ "Mikhail D. Lukin")은 제안만. 흔한 성(Wang/Kim/Li..)은
 *     병합하지 말고 ⚠ 플래그. 오귀속 하나가 궤적 전체를 조용히 망친다.
 * 결과 → report/author-candidates.md (사람이 여기서 groups.json 확정)
 *
 * 사용: npm run author-candidates
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (!existsSync(resolve(root, "data/corpus-raw.json"))) {
  console.log("corpus-raw.json 이 없습니다.");
  process.exit(0);
}
interface Raw { authors: string[]; year: number }
const raw = JSON.parse(readFileSync(resolve(root, "data/corpus-raw.json"), "utf8")) as Raw[];

const COMMON = new Set([
  "wang", "zhang", "li", "liu", "chen", "yang", "huang", "zhao", "wu", "zhou", "xu", "sun",
  "guo", "gao", "lin", "ma", "hu", "he", "gu", "ding", "jia", "luo", "song", "tang", "deng",
  "kim", "lee", "park", "choi", "singh", "kumar", "yu", "cao", "peng", "xie", "shi", "duan", "han",
]);

function key(name: string): { k: string; surname: string } | null {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  const surname = parts[parts.length - 1].toLowerCase().replace(/[^a-z\-]/g, "");
  const init = parts[0].toLowerCase().replace(/[^a-z]/g, "")[0];
  if (!surname || !init || surname.length < 2) return null;
  return { k: `${surname} ${init}`, surname };
}

interface Info { last: number; any: number; variants: Map<string, number>; surname: string; years: number[] }
const map = new Map<string, Info>();
const get = (k: string, surname: string) => {
  let i = map.get(k);
  if (!i) map.set(k, (i = { last: 0, any: 0, variants: new Map(), surname, years: [] }));
  return i;
};

for (const p of raw) {
  const as = p.authors ?? [];
  if (!as.length) continue;
  // any-author
  const seen = new Set<string>();
  for (const a of as) {
    const kk = key(a);
    if (!kk || seen.has(kk.k)) continue;
    seen.add(kk.k);
    get(kk.k, kk.surname).any++;
  }
  // last-author
  const lk = key(as[as.length - 1]);
  if (lk) {
    const inf = get(lk.k, lk.surname);
    inf.last++;
    inf.years.push(p.year);
    inf.variants.set(as[as.length - 1].trim(), (inf.variants.get(as[as.length - 1].trim()) ?? 0) + 1);
  }
}

const rows = [...map.entries()]
  .map(([k, i]) => ({ k, ...i }))
  .filter((r) => r.last >= 5)
  .sort((a, b) => b.last - a.last)
  .slice(0, 40);

const L: string[] = [];
const w = (s = "") => L.push(s);
w(`# 저자 후보 (last-author = PI 귀속, 사람이 검토·확정)`);
w();
w(`corpus ${raw.length}편. last-author 기준 상위 ${rows.length}(≥5편). any-author 는 대조용.`);
w(`⚠ = 흔한 성(surname+이니셜이 여러 사람 뭉침) → **병합 말고 개별 확인**.`);
w(`변형(variants)은 병합 **제안**일 뿐, 확정은 사람이. 이 표로 groups.json 을 직접 만들 것.`);
w();
w(`| # | 키 | last | any | last/any | 연도 | 표기 변형(제안) | 플래그 |`);
w(`|---:|---|---:|---:|---:|---|---|---|`);
rows.forEach((r, i) => {
  const vs = [...r.variants.entries()].sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n}(${c})`).join(" · ");
  const yr = r.years.length ? `${Math.min(...r.years)}–${Math.max(...r.years)}` : "—";
  w(`| ${i + 1} | ${r.k} | ${r.last} | ${r.any} | ${(r.last / r.any).toFixed(2)} | ${yr} | ${vs} | ${COMMON.has(r.surname) ? "⚠흔한성" : ""} |`);
});
w();

mkdirSync(resolve(root, "report"), { recursive: true });
writeFileSync(resolve(root, "report/author-candidates.md"), L.join("\n") + "\n");

console.log(`last-author 상위 ${rows.length} (≥5편):`);
console.log("#  키               last any  연도       플래그");
rows.forEach((r, i) => {
  const yr = r.years.length ? `${Math.min(...r.years)}-${Math.max(...r.years)}` : "—";
  console.log(
    `${String(i + 1).padStart(2)} ${r.k.padEnd(16)} ${String(r.last).padStart(3)} ${String(r.any).padStart(4)}  ${yr.padEnd(10)} ${COMMON.has(r.surname) ? "⚠흔한성" : ""}`,
  );
});
console.log("\nreport/author-candidates.md 생성됨 (변형 목록 포함)");
