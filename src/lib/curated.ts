// 손 큐레이션 관계(edges.json) — 인용 그래프가 못 하는 것: 지지/반박 구분.
// entities.json 의 refs(arXiv id)로 타임라인 논문에 매핑한다.
import entitiesJson from "../../data/entities.json";
import edgesJson from "../../data/edges.json";

interface Ent { id: string; refs: { type: string; value: string }[] }
const arxivOf = new Map(
  (entitiesJson as Ent[]).map((e) => [e.id, e.refs.find((r) => r.type === "arxiv")?.value ?? null]),
);

export interface CuratedEdge { from: string; to: string; rel: string }
export const curatedEdges: CuratedEdge[] = (edgesJson as { from: string; to: string; rel: string }[])
  .map((e) => ({ from: arxivOf.get(e.from), to: arxivOf.get(e.to), rel: e.rel }))
  .filter((e): e is CuratedEdge => !!e.from && !!e.to);
