import { useEffect, useMemo, useRef, useState } from "react";
import { papers, citeEdges } from "../lib/timeline.ts";
import type { TPaper } from "../lib/timeline.ts";
import { firstLevelFields, fieldById } from "../data/loader.ts";
import { displayTitle } from "../lib/format.ts";
import groupsJson from "../../data/groups.json";

// 박스형 무한줌. x(연도)·y(가지) 축을 독립적으로 줌. 축 라벨은 박스 가장자리에 고정,
// 내용만 클립. 줌인할수록(면적↑) 저인용 논문이 더 드러남(LOD).
const W = 1000;
const H = 360; // 세로 조밀 — 두 축이 항상 한 화면에
const M = { l: 156, r: 30, t: 8, b: 22 };
const Y0 = 2015;
const Y1 = 2026;
const NYEARS = Y1 - Y0 + 1; // 12
const NBINS = 4;
const BIN_LABELS = ["2015–17", "2018–20", "2021–23", "2024–26"];
const MAJOR = 18;
const UPDATED = "2026-07-29";
const PW = W - M.l - M.r; // plot width
const PH = H - M.t - M.b;
const YEARW = PW / NYEARS;

const groupsMeta = groupsJson as { id: string; label: string }[];
const groupLabel = new Map(groupsMeta.map((g) => [g.id, g.label]));

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return ((h % 1000) + 1000) % 1000;
}
const radius = (c: number) => clamp(2.2 + Math.sqrt(c) * 0.45, 2.2, 16);

function wrap2(t: string): string[] {
  const words = displayTitle(t).split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (lines.length >= 2) break;
    if ((cur + " " + w).trim().length > 24) { lines.push(cur.trim()); cur = w; }
    else cur = (cur + " " + w).trim();
  }
  if (lines.length < 2 && cur) lines.push(cur.trim());
  else if (cur && lines.length === 2) lines[1] = lines[1].slice(0, 22) + "…";
  return lines.filter(Boolean).slice(0, 2);
}

interface View { kx: number; ky: number; tx: number; ty: number }
interface Props {
  onOpen: (p: TPaper) => void;
  onSelectBranch: (id: string) => void;
}

export default function TimelineZoom({ onOpen, onSelectBranch }: Props) {
  const lanes = firstLevelFields.map((f) => f.id);
  const laneH = PH / lanes.length;
  const laneIndex = useMemo(() => new Map(lanes.map((id, i) => [id, i])), [lanes]);
  const binW = PW / NBINS;

  // 점 x = 실제 연도 좌표(+연도폭 내 지터) — 줌인 시 연도 눈금과 정직하게 정합
  const pos = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    for (const p of papers) {
      const li = laneIndex.get(p.lane) ?? 0;
      const yr = clamp(p.year, Y0, Y1);
      const x = M.l + (yr - Y0 + 0.5) * YEARW + (hash(p.id + "x") / 1000 - 0.5) * YEARW * 0.86;
      const y = M.t + li * laneH + laneH * 0.5 + (hash(p.id + "y") / 1000 - 0.5) * laneH * 0.8;
      m.set(p.id, { x, y });
    }
    return m;
  }, [laneIndex, laneH]);

  const byCited = useMemo(() => papers.slice().sort((a, b) => b.cited - a.cited), []);
  const byId = useMemo(() => new Map(papers.map((p) => [p.id, p])), []);
  const majorIds = useMemo(() => new Set(byCited.slice(0, MAJOR).map((p) => p.id)), [byCited]);
  const groupCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of papers) if (p.group) m.set(p.group, (m.get(p.group) ?? 0) + 1);
    return groupsMeta.filter((g) => m.has(g.id)).map((g) => ({ ...g, n: m.get(g.id)! }));
  }, []);

  const [view, setView] = useState<View>({ kx: 1, ky: 1, tx: 0, ty: 0 });
  const [hover, setHover] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

  const sx = (bx: number) => view.tx + bx * view.kx;
  const sy = (by: number) => view.ty + by * view.ky;
  const zoomAxis = (axis: "x" | "y", f: number, focus: number) =>
    setView((v) => {
      if (axis === "x") { const kx = clamp(v.kx * f, 1, 40); return { ...v, kx, tx: focus - (focus - v.tx) * (kx / v.kx) }; }
      const ky = clamp(v.ky * f, 1, 40); return { ...v, ky, ty: focus - (focus - v.ty) * (ky / v.ky) };
    });

  const toSvg = (cx: number, cy: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: ((cx - r.left) / r.width) * W, y: ((cy - r.top) / r.height) * H };
  };
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey && !e.shiftKey) return; // 평소 휠 = 페이지 스크롤
      e.preventDefault();
      const p = toSvg(e.clientX, e.clientY);
      const f = Math.exp(-e.deltaY * 0.0016);
      if (e.shiftKey) zoomAxis("x", f, p.x); // Shift+휠 = 연도 줌
      else zoomAxis("y", f, p.y); // Ctrl/Cmd+휠 = 가지 줌
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // 검색: 제목·저자 키워드 매칭. LOD 아래에 묻힌 논문도 강제 표시된다.
  const qn = q.trim().toLowerCase();
  const matched = useMemo(() => {
    if (!qn) return new Set<string>();
    const s = new Set<string>();
    for (const p of papers) {
      if (`${p.title} ${p.author}`.toLowerCase().includes(qn)) s.add(p.id);
      if (s.size >= 300) break;
    }
    return s;
  }, [qn]);

  const cutoff = clamp(Math.round(55 * Math.sqrt(view.kx * view.ky)), 55, papers.length);
  const visible = useMemo(() => {
    const out: { p: TPaper; x: number; y: number }[] = [];
    const push = (p: TPaper) => {
      const b = pos.get(p.id)!;
      const x = view.tx + b.x * view.kx;
      const y = view.ty + b.y * view.ky;
      if (x > M.l - 30 && x < W - M.r + 30 && y > M.t - 30 && y < H - M.b + 30) out.push({ p, x, y });
    };
    const seen = new Set<string>();
    for (let i = 0; i < cutoff; i++) {
      push(byCited[i]);
      seen.add(byCited[i].id);
    }
    if (qn) for (const p of papers) if (matched.has(p.id) && !seen.has(p.id)) push(p);
    return out;
  }, [cutoff, view, pos, byCited, qn, matched]);

  const posS = useMemo(() => new Map(visible.map((v) => [v.p.id, v])), [visible]);
  const visSet = useMemo(() => new Set(visible.map((v) => v.p.id)), [visible]);
  const backbone = useMemo(
    () => citeEdges.filter((e) => majorIds.has(e.from) && majorIds.has(e.to) && visSet.has(e.from) && visSet.has(e.to)),
    [majorIds, visSet],
  );
  const hoverEdges = useMemo(
    () => (hover ? citeEdges.filter((e) => (e.from === hover || e.to === hover) && visSet.has(e.from) && visSet.has(e.to)) : []),
    [hover, visSet],
  );
  const connected = useMemo(() => {
    const s = new Set<string>();
    for (const e of hoverEdges) { s.add(e.from); s.add(e.to); }
    return s;
  }, [hoverEdges]);

  const labels = useMemo(() => {
    const out: { p: TPaper; x: number; y: number; lines: string[] }[] = [];
    const placed: { x: number; y: number }[] = [];
    for (const v of visible) {
      if (out.length >= 40) break;
      if (placed.some((r) => Math.abs(r.y - v.y) < 18 && Math.abs(r.x - v.x) < 195)) continue;
      placed.push({ x: v.x, y: v.y });
      out.push({ p: v.p, x: v.x, y: v.y, lines: wrap2(v.p.title) });
    }
    return out;
  }, [visible]);

  const grpActive = checked.size > 0;
  const qActive = qn.length > 0;
  const dotOp = (p: TPaper) => {
    if (qActive) return matched.has(p.id) ? 0.95 : 0.12;
    if (grpActive) return p.group && checked.has(p.group) ? 0.95 : 0.14;
    if (hover) return p.id === hover ? 1 : connected.has(p.id) ? 0.72 : 0.22;
    return 0.85;
  };
  const dotRing = (p: TPaper) =>
    qActive ? matched.has(p.id) : grpActive ? !!(p.group && checked.has(p.group)) : hover === p.id;

  const hpaper = hover ? byId.get(hover) : null;
  const toggle = (id: string) => setChecked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const cx = M.l + PW / 2, cy = M.t + PH / 2;

  return (
    <div className="tlz">
      <div className="tlz-help">
        <span className="tlz-meta">코퍼스 {papers.length.toLocaleString()}편 · OpenAlex 인용 · 갱신 {UPDATED}</span>
        <span className="tlz-controls">
          연도<button className="tlz-reset" onClick={() => zoomAxis("x", 1.6, cx)}>＋</button>
          <button className="tlz-reset" onClick={() => zoomAxis("x", 1 / 1.6, cx)}>－</button>
          가지<button className="tlz-reset" onClick={() => zoomAxis("y", 1.6, cy)}>＋</button>
          <button className="tlz-reset" onClick={() => zoomAxis("y", 1 / 1.6, cy)}>－</button>
          <button className="tlz-reset" onClick={() => setView({ kx: 1, ky: 1, tx: 0, ty: 0 })}>초기화</button>
          <span className="tlz-hint">Shift+휠=연도 · Ctrl+휠=가지 · 드래그=이동 · 점 클릭=arXiv</span>
        </span>
      </div>

      <div className="tlz-groups">
        <input
          className="tlz-search"
          type="search"
          placeholder="논문 검색 (제목·저자·키워드)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {qActive && <span className="tlz-hint">{matched.size}편 일치{matched.size >= 300 ? "+" : ""}</span>}
        <span className="tlz-glabel">주요 그룹 강조:</span>
        {groupCounts.map((g) => (
          <label key={g.id} className={`tlz-chip${checked.has(g.id) ? " on" : ""}`}>
            <input type="checkbox" checked={checked.has(g.id)} onChange={() => toggle(g.id)} />
            {g.label} ({g.n})
          </label>
        ))}
        {grpActive && <button className="tlz-reset" onClick={() => setChecked(new Set())}>해제</button>}
      </div>

      <div className="tlz-svgwrap">
      {hpaper && (
        <div className="tlz-hoverinfo">
          <strong>{displayTitle(hpaper.title)}</strong> · 인용 {hpaper.cited} · {hpaper.author} · {hpaper.year}
          {hpaper.group && <span className="tlz-hg"> · {groupLabel.get(hpaper.group) ?? hpaper.group}</span>}
          <span className="tlz-hf"> · {hpaper.fields.map((f) => fieldById.get(f)?.ko ?? f).join(", ")}</span>
        </div>
      )}
      <svg ref={svgRef} className="tlz-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet"
        onMouseDown={(e) => (drag.current = { x: e.clientX, y: e.clientY })}
        onMouseMove={(e) => {
          if (!drag.current) return;
          const r = svgRef.current!.getBoundingClientRect();
          const dx = ((e.clientX - drag.current.x) / r.width) * W;
          const dy = ((e.clientY - drag.current.y) / r.height) * H;
          drag.current = { x: e.clientX, y: e.clientY };
          setView((v) => ({ ...v, tx: v.tx + dx, ty: v.ty + dy }));
        }}
        onMouseUp={() => (drag.current = null)} onMouseLeave={() => { drag.current = null; }}>
        <defs>
          <clipPath id="tlz-plot"><rect x={M.l} y={M.t} width={PW} height={PH} /></clipPath>
        </defs>

        {/* 클립된 내용: 밴드·엣지·점·라벨 */}
        <g clipPath="url(#tlz-plot)">
          {lanes.map((id, i) =>
            i % 2 === 0 ? (
              <rect key={`band-${id}`} className="tlz-laneband" x={M.l} y={sy(M.t + i * laneH)} width={PW} height={laneH * view.ky} />
            ) : null,
          )}
          {/* 적응형 세로 그리드: 줌인(kx≥2)이면 연도별, 아니면 3년 경계 */}
          {(view.kx >= 2
            ? Array.from({ length: NYEARS + 1 }, (_, i) => M.l + i * YEARW)
            : Array.from({ length: NBINS - 1 }, (_, b) => M.l + (b + 1) * binW)
          ).map((bx, i) => (
            <line key={`g-${i}`} className="tlz-grid" x1={sx(bx)} y1={M.t} x2={sx(bx)} y2={H - M.b} />
          ))}
          {backbone.map((e, i) => {
            const a = posS.get(e.from), b = posS.get(e.to);
            return a && b ? <line key={`bb-${i}`} className="tlz-edge" x1={a.x} y1={a.y} x2={b.x} y2={b.y} /> : null;
          })}
          {hoverEdges.map((e, i) => {
            const a = posS.get(e.from), b = posS.get(e.to);
            return a && b ? <line key={`hv-${i}`} className="tlz-edge-hi" x1={a.x} y1={a.y} x2={b.x} y2={b.y} /> : null;
          })}
          {visible.map(({ p, x, y }) => (
            <circle key={p.id} cx={x} cy={y} r={radius(p.cited)} fill={fieldById.get(p.lane)?.color ?? "#888"}
              fillOpacity={dotOp(p)} stroke={dotRing(p) ? "var(--text)" : "none"} strokeWidth={dotRing(p) ? 1.5 : 0}
              className="tlz-dot" onMouseEnter={() => setHover(p.id)} onMouseLeave={() => setHover(null)} onClick={() => onOpen(p)}>
              <title>{`${displayTitle(p.title)}\n${p.author} · ${p.year} · 인용 ${p.cited}`}</title>
            </circle>
          ))}
          {labels.map(({ p, x, y, lines }) => {
            const lx = x + radius(p.cited) + 3;
            return (
              <text key={`lbl-${p.id}`} className="tlz-plabel" x={lx} y={y - (lines.length - 1) * 5 + 3}>
                {lines.map((ln, i) => (
                  <tspan key={i} x={lx} dy={i === 0 ? 0 : 10}>
                    {ln}{i === lines.length - 1 ? <tspan className="tlz-cite"> · {p.cited}</tspan> : null}
                  </tspan>
                ))}
              </text>
            );
          })}
        </g>

        {/* 축 라벨 — 박스 가장자리 고정(클립 밖) */}
        {lanes.map((id, i) => {
          const cyl = sy(M.t + i * laneH + laneH * 0.5);
          if (cyl < M.t - 4 || cyl > H - M.b + 4) return null;
          const f = fieldById.get(id);
          return (
            <text key={`ll-${id}`} className="tlz-lanelabel" x={M.l - 8} y={cyl} textAnchor="end" dominantBaseline="middle"
              fill={f?.color} onClick={() => onSelectBranch(id)}>{f?.ko}</text>
          );
        })}
        {/* 하단 연도축 — 항상 고정, 줌 정도에 따라 3년 bin ↔ 연도별로 촘촘해짐 */}
        {view.kx >= 2
          ? Array.from({ length: NYEARS }, (_, i) => Y0 + i).map((yr) => {
              const x = sx(M.l + (yr - Y0 + 0.5) * YEARW);
              if (x < M.l - 4 || x > W - M.r + 4) return null;
              return <text key={`yl-${yr}`} className="tlz-year" x={x} y={H - 8} textAnchor="middle">{yr}</text>;
            })
          : BIN_LABELS.map((lab, b) => {
              const x = sx(M.l + (b + 0.5) * binW);
              if (x < M.l - 4 || x > W - M.r + 4) return null;
              return <text key={`yl-${b}`} className="tlz-year" x={x} y={H - 8} textAnchor="middle">{lab}</text>;
            })}
        <rect className="tlz-frame" x={M.l} y={M.t} width={PW} height={PH} fill="none" />
        <line className="tlz-axis" x1={M.l} y1={H - M.b} x2={W - M.r} y2={H - M.b} />
      </svg>
      </div>
    </div>
  );
}
