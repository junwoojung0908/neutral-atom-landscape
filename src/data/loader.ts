// 데이터 로드 + 런타임 검증(빌드 게이트와 동일한 zod 스키마). 실패하면 즉시 throw.
import { FieldsFile, EntitiesFile, EdgesFile } from "./schema.ts";
import type { Field, Entity, Edge } from "./schema.ts";
import fieldsJson from "../../data/fields.json";
import entitiesJson from "../../data/entities.json";
import edgesJson from "../../data/edges.json";

export const fields: Field[] = FieldsFile.parse(fieldsJson);
export const entities: Entity[] = EntitiesFile.parse(entitiesJson);
export const edges: Edge[] = EdgesFile.parse(edgesJson);

export const fieldById = new Map<string, Field>(fields.map((f) => [f.id, f]));
export const firstLevelFields: Field[] = fields.filter((f) => f.parent === null);

/** 하위 가지 id 는 1차 가지 id 로 접는다. 없는 id 는 그대로 반환. */
export function firstLevelOf(id: string): string {
  const f = fieldById.get(id);
  if (!f) return id;
  return f.parent ?? f.id;
}
