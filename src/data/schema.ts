import { z } from "zod";

/** YYYY-MM-DD */
const DateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");

const HexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "must be a 6-digit hex color");

/** SPEC §2.1 — 가지 (2단계 계층 허용) */
export const FieldSchema = z.object({
  id: z.string().min(1),
  parent: z.string().nullable(),
  ko: z.string().min(1),
  en: z.string().min(1),
  color: HexColor,
  /** (폐기된 색-파장 은유의 잔재 — 과거 데이터 호환용) */
  wavelength_nm: z.number().positive().nullable().optional(),
  wavelength_note: z.string().optional(),
  /** 원형 배치 순서 최적화용 인접 희망 목록 */
  adjacent: z.array(z.string()),
  blurb: z.string().min(1),
  /** 가지 서사(서사 우선 구조). 아직 대부분 비어 있음. */
  narrative: z.string().optional(),
  /** 서사 마지막 갱신일 (YYYY-MM-DD). */
  narrative_updated: DateString.optional(),
});
export type Field = z.infer<typeof FieldSchema>;

/** SPEC §2.2 — 참고 문헌 (최소 1개 필수) */
export const RefSchema = z.object({
  type: z.enum(["doi", "arxiv"]),
  value: z.string().min(1),
});
export type Ref = z.infer<typeof RefSchema>;

/** SPEC §2.2 — 노드 */
export const EntitySchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["group", "work"]),
  label: z.string().min(1),
  /** 한국어 라벨. 없으면 생략 가능(= null 취급). */
  label_ko: z.string().nullable().optional(),
  /** 정본 저자 표기. hydrate 가 항상 API 와 대조·갱신한다(사실). */
  byline: z.string(),
  /** 편집상 주석(소속 등). 사람의 판단이므로 hydrate 는 손대지 않는다. 집계에 쓰인다. */
  affiliation_note: z.string().optional(),
  venue: z.string(),
  year: z.number().int(),
  fields: z.array(z.string()).min(1),
  weight: z.number().int().min(1).max(5),
  /** 크기의 근거. 서사 우선 구조로 가면 서사가 대체하므로 optional. */
  weight_rationale: z.string().min(1).optional(),
  /** 이 항목의 방향(주장). 서사 우선 구조에서 optional — 서사가 담을 수 있음. */
  thesis: z.string().min(1).optional(),
  /** ★ 방어선: 최소 1개 필수 */
  refs: z.array(RefSchema).min(1),
  /** 서지 메타데이터의 출처. hydrate 가 채우면 "api". */
  metadata_source: z.enum(["api", "manual"]),
  /**
   * ★ 방어선: 사람이 이 식별자가 의도한 문헌이 맞다고 눈으로 확인한 날짜.
   * null 이면 미확인 (validate 는 경고만, 실패시키지 않음). hydrate 는 절대 설정 안 함.
   */
  verified: DateString.nullable(),
});
export type Entity = z.infer<typeof EntitySchema>;

/** SPEC §2.3 — 관계 (5종 제한) */
export const REL_TYPES = [
  "proposes→implements",
  "extends",
  "alternative-to",
  "spinoff",
  "contests",
] as const;

export const EdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  rel: z.enum(REL_TYPES),
});
export type Edge = z.infer<typeof EdgeSchema>;

export const FieldsFile = z.array(FieldSchema);
export const EntitiesFile = z.array(EntitySchema);
export const EdgesFile = z.array(EdgeSchema);
