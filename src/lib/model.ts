import type { Entity } from "../data/schema.ts";
import type { Target } from "./layout.ts";

/** 레이아웃용 노드: entity + 반지름 + 소속 1차 가지 + 목표점 */
export interface LNode {
  entity: Entity;
  r: number;
  firstLevels: string[];
  target: Target;
}
