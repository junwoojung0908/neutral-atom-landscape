import { useEffect, useMemo, useState } from "react";
import {
  forceSimulation,
  forceX,
  forceY,
  forceCollide,
  forceManyBody,
} from "d3-force";
import type { SimulationNodeDatum } from "d3-force";
import type { Anchor } from "../lib/layout.ts";
import type { LNode } from "../lib/model.ts";
import type { Edge } from "../data/schema.ts";
import { fieldById } from "../data/loader.ts";
import { displayTitle } from "../lib/format.ts";

// SPEC §3 힘 파라미터 — 튜닝 금지.
const XY_STRENGTH = 0.085;
const COLLIDE_PAD = 7;
const CHARGE = -26;

const VIEW_W = 960;
const VIEW_H = 800;
const CX = VIEW_W / 2;
const CY = VIEW_H / 2;

interface SimNode extends SimulationNodeDatum {
  id: string;
  r: number;
  tx: number;
  ty: number;
}

type Pos = Record<string, { x: number; y: number }>;

interface Props {
  anchors: Anchor[];
  nodes: LNode[];
  edges: Edge[];
  hubRadius: number;
  anchorRadius: number;
  visibleIds: Set<string>;
  offFields: Set<string>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

/** 노드 테두리 색 분할용 호 경로 (노드 로컬 좌표, 중심 원점) */
function arcPath(r: number, a0: number, a1: number): string {
  const x0 = r * Math.cos(a0);
  const y0 = r * Math.sin(a0);
  const x1 = r * Math.cos(a1);
  const y1 = r * Math.sin(a1);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
}

export default function Landscape({
  anchors,
  nodes,
  edges,
  hubRadius,
  anchorRadius,
  visibleIds,
  offFields,
  selectedId,
  onSelect,
}: Props) {
  const anchorById = useMemo(
    () => new Map(anchors.map((a) => [a.id, a])),
    [anchors],
  );

  const simNodes = useMemo<SimNode[]>(
    () =>
      nodes.map((n) => ({
        id: n.entity.id,
        r: n.r,
        tx: n.target.x,
        ty: n.target.y,
        x: n.target.x,
        y: n.target.y,
      })),
    [nodes],
  );

  const [pos, setPos] = useState<Pos>(() =>
    Object.fromEntries(simNodes.map((s) => [s.id, { x: s.tx, y: s.ty }])),
  );

  useEffect(() => {
    const snapshot = (): Pos =>
      Object.fromEntries(simNodes.map((s) => [s.id, { x: s.x ?? 0, y: s.y ?? 0 }]));

    const sim = forceSimulation<SimNode>(simNodes)
      .force("x", forceX<SimNode>().x((d) => d.tx).strength(XY_STRENGTH))
      .force("y", forceY<SimNode>().y((d) => d.ty).strength(XY_STRENGTH))
      .force("collide", forceCollide<SimNode>().radius((d) => d.r + COLLIDE_PAD))
      .force("charge", forceManyBody<SimNode>().strength(CHARGE))
      .stop();

    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced) {
      sim.tick(400);
      setPos(snapshot());
    } else {
      sim.on("tick", () => setPos(snapshot()));
      sim.alpha(1).restart();
    }
    return () => {
      sim.on("tick", null);
      sim.stop();
    };
  }, [simNodes]);

  const nodeById = useMemo(
    () => new Map(nodes.map((n) => [n.entity.id, n])),
    [nodes],
  );

  return (
    <svg
      className="landscape"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      role="group"
      aria-label="중성원자 연구 지형도"
      onClick={() => onSelect(null)}
    >
      <defs>
        <marker
          id="arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--neutral-edge)" />
        </marker>
      </defs>

      <g transform={`translate(${CX},${CY})`}>
        {/* 중앙 허브 링 — 3개 이상 가지에 걸친 노드가 들어오는 자리 */}
        <circle
          className="hub-ring"
          cx={0}
          cy={0}
          r={hubRadius}
          fill="none"
        />

        {/* 앵커 방사선 */}
        {anchors.map((a) => (
          <line
            key={`spoke-${a.id}`}
            x1={0}
            y1={0}
            x2={a.x}
            y2={a.y}
            className="spoke"
            opacity={offFields.has(a.id) ? 0.25 : 1}
          />
        ))}

        {/* 가지선: fields.length>=2 노드만, 각 소속 1차 가지 앵커로 곡선 연결 */}
        {nodes.map((n) => {
          if (!visibleIds.has(n.entity.id)) return null;
          if (n.entity.fields.length < 2) return null;
          const p = pos[n.entity.id];
          if (!p) return null;
          return n.firstLevels.map((fid) => {
            if (offFields.has(fid)) return null;
            const a = anchorById.get(fid);
            if (!a) return null;
            const color = fieldById.get(fid)?.color ?? "var(--neutral-edge)";
            const mx = (p.x + a.x) / 2;
            const my = (p.y + a.y) / 2 - 24; // 살짝 휜 곡선
            return (
              <path
                key={`branch-${n.entity.id}-${fid}`}
                className="branch"
                d={`M ${p.x} ${p.y} Q ${mx} ${my} ${a.x} ${a.y}`}
                stroke={color}
              />
            );
          });
        })}

        {/* 관계 엣지 (무채색): proposes→implements 실선+화살표, contests 점선, 나머지 실선 */}
        {edges.map((e, i) => {
          if (!visibleIds.has(e.from) || !visibleIds.has(e.to)) return null;
          const a = pos[e.from];
          const b = pos[e.to];
          const na = nodeById.get(e.from);
          const nb = nodeById.get(e.to);
          if (!a || !b || !na || !nb) return null;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const len = Math.hypot(dx, dy) || 1;
          const ux = dx / len;
          const uy = dy / len;
          const x1 = a.x + ux * (na.r + 2);
          const y1 = a.y + uy * (na.r + 2);
          const arrow = e.rel === "proposes→implements";
          const gap = arrow ? nb.r + 8 : nb.r + 2;
          const x2 = b.x - ux * gap;
          const y2 = b.y - uy * gap;
          return (
            <line
              key={`edge-${i}`}
              className="edge"
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              strokeDasharray={e.rel === "contests" ? "4 4" : undefined}
              markerEnd={arrow ? "url(#arrow)" : undefined}
            >
              <title>{e.rel}</title>
            </line>
          );
        })}

        {/* 노드 */}
        {nodes.map((n) => {
          if (!visibleIds.has(n.entity.id)) return null;
          const p = pos[n.entity.id];
          if (!p) return null;
          const m = n.entity.fields.length;
          const selected = selectedId === n.entity.id;
          const segAngle = (2 * Math.PI) / m;
          const start = -Math.PI / 2;
          return (
            <g
              key={`node-${n.entity.id}`}
              transform={`translate(${p.x},${p.y})`}
              className={`node${selected ? " selected" : ""}`}
              tabIndex={0}
              role="button"
              aria-label={`${displayTitle(n.entity.label)} — weight ${n.entity.weight}`}
              onClick={(ev) => {
                ev.stopPropagation();
                onSelect(n.entity.id);
              }}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" || ev.key === " ") {
                  ev.preventDefault();
                  onSelect(n.entity.id);
                }
              }}
            >
              <title>{displayTitle(n.entity.label)}</title>
              <circle className="node-fill" r={n.r} />
              {m === 1 ? (
                <circle
                  className="node-border"
                  r={n.r}
                  fill="none"
                  stroke={fieldById.get(n.entity.fields[0])?.color ?? "var(--neutral-edge)"}
                />
              ) : (
                n.entity.fields.map((fid, i) => (
                  <path
                    key={`seg-${fid}-${i}`}
                    className="node-border"
                    d={arcPath(n.r, start + i * segAngle, start + (i + 1) * segAngle)}
                    fill="none"
                    stroke={fieldById.get(fid)?.color ?? "var(--neutral-edge)"}
                  />
                ))
              )}
            </g>
          );
        })}

        {/* 앵커 라벨 */}
        {anchors.map((a) => {
          const outer = anchorRadius + 18;
          const lx = outer * Math.cos(a.angle);
          const ly = outer * Math.sin(a.angle);
          const anchorEnd = Math.cos(a.angle) > 0.3 ? "start" : Math.cos(a.angle) < -0.3 ? "end" : "middle";
          return (
            <text
              key={`label-${a.id}`}
              x={lx}
              y={ly}
              className="anchor-label"
              textAnchor={anchorEnd}
              dominantBaseline="middle"
              fill={a.field.color}
              opacity={offFields.has(a.id) ? 0.35 : 1}
            >
              {a.field.ko}
            </text>
          );
        })}
      </g>
    </svg>
  );
}
