/**
 * data/*.json 검증. `npm run validate` 로 실행. 실패 시 exit 1.
 * 검사: zod 스키마(항목별) / field·edge 참조 무결성 / 가지 계층(2단계) /
 *       id 중복 / weight 분포 경고 / verified 미확인 경고.
 * 정책: refs 누락 등 스키마 위반은 실패. verified === null 은 경고(실패 아님).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { FieldSchema, EntitySchema, EdgeSchema } from "../src/data/schema.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const errors: string[] = [];
const warnings: string[] = [];

function load(name: string): unknown {
  const path = resolve(root, "data", name);
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    errors.push(`[read] data/${name}: ${(e as Error).message}`);
    return null;
  }
}

/**
 * 항목별로 zod 검증한다. 한 항목이 실패해도 나머지 리포트를 가리지 않도록,
 * 원본(raw) 배열은 그대로 반환하고 참조 무결성 검사는 원본 위에서 수행한다.
 */
function schemaCheckEach(
  schema: { safeParse: (v: unknown) => { success: boolean; error?: unknown } },
  raw: unknown,
  file: string,
): Record<string, unknown>[] {
  if (raw === null) return [];
  if (!Array.isArray(raw)) {
    errors.push(`[schema] ${file}: top-level value must be an array`);
    return [];
  }
  raw.forEach((item, idx) => {
    const r = schema.safeParse(item);
    if (!r.success) {
      const issues = (r.error as { issues?: { path: (string | number)[]; message: string }[] })
        .issues ?? [];
      const id = (item as { id?: unknown })?.id;
      const who = typeof id === "string" ? `"${id}"` : `#${idx}`;
      for (const i of issues) {
        errors.push(`[schema] ${file} @ ${who}.${i.path.join(".") || "(root)"}: ${i.message}`);
      }
    }
  });
  return raw as Record<string, unknown>[];
}

function idsOf(arr: Record<string, unknown>[]): string[] {
  return arr.map((x) => x.id).filter((v): v is string => typeof v === "string");
}

function checkDupes(ids: string[], file: string) {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) errors.push(`[dupe] ${file}: duplicate id "${id}"`);
    seen.add(id);
  }
}

// ---- load & schema (per-item) ----
const fields = schemaCheckEach(FieldSchema, load("fields.json"), "fields.json");
const entities = schemaCheckEach(EntitySchema, load("entities.json"), "entities.json");
const edges = schemaCheckEach(EdgeSchema, load("edges.json"), "edges.json");

const fieldIds = new Set(idsOf(fields));
const entityIds = new Set(idsOf(entities));
const fieldById = new Map(fields.map((f) => [f.id as string, f]));

checkDupes(idsOf(fields), "fields.json");
checkDupes(idsOf(entities), "entities.json");

// ---- field hierarchy (참조 + 2단계 제한) ----
for (const f of fields) {
  const parent = f.parent;
  if (parent === null || parent === undefined) continue;
  if (typeof parent !== "string") continue;
  const p = fieldById.get(parent);
  if (!p) {
    errors.push(`[ref] fields.json: "${f.id}".parent "${parent}" not found`);
    continue;
  }
  // (1) parent 는 1차 가지여야 한다 (parent === null)
  if (p.parent !== null) {
    errors.push(
      `[hierarchy] fields.json: "${f.id}".parent "${parent}" is itself a sub-field; parent must be a first-level (parent=null) branch`,
    );
  }
  // (2) 3단계 이상 금지 — 부모 사슬 깊이 (2단계까지만)
  let depth = 1;
  let cur: Record<string, unknown> | undefined = f;
  const guard = new Set<string>();
  while (cur && cur.parent !== null && typeof cur.parent === "string") {
    if (guard.has(cur.id as string)) {
      errors.push(`[hierarchy] fields.json: parent cycle involving "${cur.id}"`);
      break;
    }
    guard.add(cur.id as string);
    cur = fieldById.get(cur.parent);
    depth++;
    if (depth > 3) break;
  }
  if (depth > 2) {
    errors.push(`[hierarchy] fields.json: "${f.id}" is nested ${depth} levels deep (max 2)`);
  }
}

// ---- entity → field 참조 & verified 경고 ----
for (const e of entities) {
  const efields = Array.isArray(e.fields) ? e.fields : [];
  for (const fid of efields) {
    if (typeof fid === "string" && !fieldIds.has(fid)) {
      errors.push(`[ref] entities.json: "${e.id}".fields contains unknown "${fid}"`);
    }
  }
  if (e.verified === null) {
    warnings.push(`entities.json: "${e.id}" is not verified yet (verified: null).`);
  }
}

// ---- edge 참조 ----
for (const ed of edges) {
  if (typeof ed.from === "string" && !entityIds.has(ed.from)) {
    errors.push(`[ref] edges.json: from "${ed.from}" not an entity id`);
  }
  if (typeof ed.to === "string" && !entityIds.has(ed.to)) {
    errors.push(`[ref] edges.json: to "${ed.to}" not an entity id`);
  }
}

// ---- weight distribution ----
const WEIGHT_STATS_MIN_N = 20; // n<20 은 통계가 아님 — 경고를 켜면 초반 내내 무의미한 잡음
if (entities.length > 0) {
  const w = (e: Record<string, unknown>) => (typeof e.weight === "number" ? e.weight : null);
  const dist = [1, 2, 3, 4, 5].map((n) => `${n}:${entities.filter((e) => w(e) === n).length}`);
  console.log(`weight distribution  ${dist.join("  ")}  (n=${entities.length})`);
  if (entities.length >= WEIGHT_STATS_MIN_N) {
    const w5 = entities.filter((e) => w(e) === 5).length;
    const frac = w5 / entities.length;
    if (frac > 0.15) {
      warnings.push(
        `weight==5 is ${(frac * 100).toFixed(0)}% of entities (>15%). 최상위 비중이 흔해지면 의미가 옅어짐.`,
      );
    }
  } else {
    console.log(`  (weight 분포 경고는 n>=${WEIGHT_STATS_MIN_N} 부터 활성화 — 현재 n=${entities.length})`);
  }
}

// ---- report ----
for (const w of warnings) console.warn(`WARN  ${w}`);
if (errors.length > 0) {
  for (const e of errors) console.error(`ERROR ${e}`);
  console.error(`\n✗ validation failed: ${errors.length} error(s), ${warnings.length} warning(s)`);
  process.exit(1);
}
console.log(
  `✓ ok — ${fields.length} fields, ${entities.length} entities, ${edges.length} edges, ${warnings.length} warning(s)`,
);
