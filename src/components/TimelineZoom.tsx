import { useEffect, useMemo, useRef, useState } from "react";
import { papers, citeEdges } from "../lib/timeline.ts";
import type { TPaper } from "../lib/timeline.ts";
import { firstLevelFields, fieldById } from "../data/loader.ts";
import { displayTitle } from "../lib/format.ts";
import groupsJson from "../../data/groups.json";
import { counts } from "../lib/survey.ts";

// 박스형 무한줌. x(연도)·y(가지) 축을 독립적으로 줌. 축 라벨은 박스 가장자리에 고정,
// 내용만 클립. 줌인할수록(면적↑) 저인용 논문이 더 드러남(LOD).
const Y0 = 2015;
const Y1 = 2026;
const NYEARS = Y1 - Y0 + 1; // 12
const NBINS = 4;
const BIN_LABELS = ["2015–17", "2018–20", "2021–23", "2024–26"];
const MAJOR = 18;
const UPDATED = counts.generated_at ?? "2026-07-29";
// W·여백은 화면폭에 따라(모바일=좁은 viewBox → 글자가 물리적으로 읽히는 크기 유지),
// 세로(H)는 컨테이너 비율에 맞춰 동적 — 축이 화면 양끝에 붙는다(글자 왜곡 없음).

const groupsMeta = groupsJson as { id: string; label: string }[];
const groupLabel = new Map(groupsMeta.map((g) => [g.id, g.label]));

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return ((h % 1000) + 1000) % 1000;
}
const radius = (c: number) => clamp(2.2 + Math.sqrt(c) * 0.45, 2.2, 16);

function wrap2(t: string, maxLen = 26, maxLines = 3): string[] {
  const words = displayTitle(t).split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxLen) {
      lines.push(cur.trim());
      cur = w;
      if (lines.length >= maxLines) break;
    } else cur = (cur + " " + w).trim();
  }
  if (lines.length < maxLines && cur) lines.push(cur.trim());
  else if (lines.length >= maxLines) lines[maxLines - 1] = lines[maxLines - 1].slice(0, maxLen - 1) + "…";
  return lines.filter(Boolean).slice(0, maxLines);
}


interface View { kx: number; ky: number; tx: number; ty: number }
interface Props {
  onOpen: (p: TPaper) => void;
  onSelectBranch: (id: string) => void;
  selectedId?: string | null;
}

const SIM_SUBS = [
  { id: "sim.eq", ko: "시뮬레이션 · 평형 상", color: "#E15759", branch: "sim" },
  { id: "sim.dyn", ko: "시뮬레이션 · 동역학", color: "#9E3B3E", branch: "sim" },
  { id: "sim.gauge", ko: "시뮬레이션 · 게이지·위상", color: "#5C2223", branch: "sim" },
];

export default function TimelineZoom({ onOpen, onSelectBranch, selectedId }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [H, setH] = useState(420);
  const [narrow, setNarrow] = useState(false);
  const W = narrow ? 400 : 1000;
  const M = narrow ? { l: 14, r: 8, t: 6, b: 18 } : { l: 156, r: 14, t: 8, b: 22 };
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 50) {
        const nw = r.width < 620;
        setNarrow(nw);
        const w = nw ? 400 : 1000;
        setH(clamp(Math.round((w * r.height) / r.width), 240, 1400));
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure); // RO 미발화 엣지케이스 백업
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, []);
  const PH = H - M.t - M.b;
  const PW = W - M.l - M.r;
  const YEARW = PW / NYEARS;

  const laneMeta = useMemo(
    () => firstLevelFields.flatMap((f) => (f.id === "sim" ? SIM_SUBS : [{ id: f.id, ko: f.ko, color: f.color, branch: f.id }])),
    [],
  );
  const laneMetaMap = useMemo(() => new Map(laneMeta.map((m) => [m.id, m])), [laneMeta]);
  const lanes = laneMeta.map((m) => m.id);
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
  }, [laneIndex, laneH, YEARW, M.l, M.t]);

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
  const [fitted, setFitted] = useState<string | null>(null); // 화면에 맞춰 확대된 레인
  const raf = useRef<number | null>(null);

  // 부드러운 전환: 현재 view → target (ease-in-out cubic, ~450ms)
  const animateTo = (target: Partial<View>) => {
    if (raf.current) cancelAnimationFrame(raf.current);
    const from = { ...viewRef.current };
    const to = { ...from, ...target };
    const t0 = performance.now();
    const D = 450;
    const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    let done = false;
    const step = (now: number) => {
      const t = clamp((now - t0) / D, 0, 1);
      const e = ease(t);
      setView({
        kx: from.kx + (to.kx - from.kx) * e,
        ky: from.ky + (to.ky - from.ky) * e,
        tx: from.tx + (to.tx - from.tx) * e,
        ty: from.ty + (to.ty - from.ty) * e,
      });
      if (t < 1) raf.current = requestAnimationFrame(step);
      else {
        raf.current = null;
        done = true;
      }
    };
    raf.current = requestAnimationFrame(step);
    // 안전장치: 탭이 백그라운드라 rAF 가 멈춰도 최종 상태는 보장
    window.setTimeout(() => {
      if (!done && raf.current) {
        cancelAnimationFrame(raf.current);
        raf.current = null;
        setView(to);
      }
    }, D + 120);
  };
  const viewRef = useRef(view);
  viewRef.current = view;
  const cancelAnim = () => {
    if (raf.current) {
      cancelAnimationFrame(raf.current);
      raf.current = null;
    }
  };

  // 레인 클릭: 그 분야가 화면 위아래에 딱 맞게 확대(토글)
  const fitLane = (id: string) => {
    const i = laneIndex.get(id) ?? 0;
    if (fitted === id) {
      setFitted(null);
      animateTo({ ky: 1, ty: 0 });
      return;
    }
    const ky = lanes.length; // laneH * ky == PH → 위아래 딱 맞음
    const laneTop = M.t + i * laneH;
    const ty = M.t - laneTop * ky;
    setFitted(id);
    animateTo({ ky, ty });
  };
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const pinch = useRef<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    cancelAnim();
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      pinch.current = { x1: a.clientX, y1: a.clientY, x2: b.clientX, y2: b.clientY };
      drag.current = null;
      setFitted(null);
    } else if (e.touches.length === 1) {
      drag.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinch.current) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const prev = pinch.current;
      const dxPrev = Math.max(Math.abs(prev.x1 - prev.x2), 12);
      const dyPrev = Math.max(Math.abs(prev.y1 - prev.y2), 12);
      const dxNow = Math.max(Math.abs(a.clientX - b.clientX), 12);
      const dyNow = Math.max(Math.abs(a.clientY - b.clientY), 12);
      const c = toSvg((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
      const fx = dxNow / dxPrev;
      const fy = dyNow / dyPrev;
      setView((v) => {
        const kx = clamp(v.kx * fx, 1, 40);
        const ky = clamp(v.ky * fy, 1, 40);
        return {
          kx, ky,
          tx: c.x - (c.x - v.tx) * (kx / v.kx),
          ty: c.y - (c.y - v.ty) * (ky / v.ky),
        };
      });
      pinch.current = { x1: a.clientX, y1: a.clientY, x2: b.clientX, y2: b.clientY };
    } else if (e.touches.length === 1 && drag.current && svgRef.current) {
      const r = svgRef.current.getBoundingClientRect();
      const t = e.touches[0];
      const dx = ((t.clientX - drag.current.x) / r.width) * W;
      const dy = ((t.clientY - drag.current.y) / r.height) * H;
      drag.current = { x: t.clientX, y: t.clientY };
      setView((v) => ({ ...v, tx: v.tx + dx, ty: v.ty + dy }));
    }
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) pinch.current = null;
    if (e.touches.length === 0) drag.current = null;
  };

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
      cancelAnim();
      setFitted(null);
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

  const cutoff = clamp(Math.round(24 * Math.sqrt(view.kx * view.ky)), 24, papers.length);
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
  const eff = hover ?? selectedId ?? null;
  const hoverEdges = useMemo(
    () => (eff ? citeEdges.filter((e) => (e.from === eff || e.to === eff) && visSet.has(e.from) && visSet.has(e.to)) : []),
    [eff, visSet],
  );
  const connected = useMemo(() => {
    const s = new Set<string>();
    for (const e of hoverEdges) { s.add(e.from); s.add(e.to); }
    return s;
  }, [hoverEdges]);

  // ★ 모든 보이는 원에 라벨 — 겹치면 우/좌/상/하 순으로 빈 자리, 그래도 없으면 우측 강제.
  const labels = useMemo(() => {
    const placed: { x1: number; y1: number; x2: number; y2: number }[] = [];
    const out: { p: TPaper; lines: string[]; lx: number; ly: number }[] = [];
    const fs = narrow ? 8.5 : 9;
    for (const v of visible) {
      const lines = wrap2(v.p.title, narrow ? 18 : 26, 3);
      const wText = Math.max(...lines.map((l) => l.length)) * fs * 0.56 + 26;
      const hText = lines.length * (fs + 1.5) + 2;
      const r = radius(v.p.cited);
      const cands = [
        { lx: v.x + r + 3, ly: v.y },
        { lx: v.x - r - 3 - wText, ly: v.y },
        { lx: v.x - wText / 2, ly: v.y - r - hText / 2 - 3 },
        { lx: v.x - wText / 2, ly: v.y + r + hText / 2 + 3 },
      ];
      let chosen = cands[0];
      let ok = false;
      for (const c of cands) {
        const rect = { x1: c.lx, y1: c.ly - hText / 2, x2: c.lx + wText, y2: c.ly + hText / 2 };
        if (rect.x1 < M.l + 2) continue; // 플롯 왼쪽 경계 밖(잘림) 후보 제외
        if (!placed.some((q2) => rect.x1 < q2.x2 && rect.x2 > q2.x1 && rect.y1 < q2.y2 && rect.y2 > q2.y1)) {
          chosen = c;
          placed.push(rect);
          ok = true;
          break;
        }
      }
      if (!ok) placed.push({ x1: chosen.lx, y1: chosen.ly - hText / 2, x2: chosen.lx + wText, y2: chosen.ly + hText / 2 });
      out.push({ p: v.p, lines, lx: chosen.lx, ly: chosen.ly });
    }
    return out;
  }, [visible, narrow]);

  const grpActive = checked.size > 0;
  const qActive = qn.length > 0;
  // 밝기(불투명도) = 인용수 로그 스케일 — 크기와 함께 이중 인코딩으로 대비
  const maxCited = byCited[0]?.cited ?? 1;
  const logDen = Math.log10(1 + maxCited);
  const baseOp = (p: TPaper) => 0.22 + 0.7 * (Math.log10(1 + p.cited) / logDen);
  const dotOp = (p: TPaper) => {
    if (qActive) return matched.has(p.id) ? Math.max(baseOp(p), 0.9) : 0.1;
    if (grpActive) return p.group && checked.has(p.group) ? Math.max(baseOp(p), 0.9) : 0.1;
    if (eff) return p.id === eff ? 1 : connected.has(p.id) ? Math.min(baseOp(p) + 0.18, 0.95) : 0.12;
    return baseOp(p);
  };
  const dotRing = (p: TPaper) =>
    qActive ? matched.has(p.id) : grpActive ? !!(p.group && checked.has(p.group)) : eff === p.id;

  const hpaper = hover ? byId.get(hover) : null;
  const toggle = (id: string) => setChecked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const cx = M.l + PW / 2, cy = M.t + PH / 2;

  return (
    <div className={`tlz${narrow ? " tlz-narrow" : ""}`}>
      <div className="tlz-help">
        <span className="tlz-meta">코퍼스 {papers.length.toLocaleString()}편 · OpenAlex 인용 · 갱신 {UPDATED}</span>
        <span className="tlz-controls">
          <span className="tlz-zlabel">연도</span><button className="tlz-reset tlz-zbtn" onClick={() => zoomAxis("x", 1.6, cx)}>＋</button>
          <button className="tlz-reset tlz-zbtn" onClick={() => zoomAxis("x", 1 / 1.6, cx)}>－</button>
          <span className="tlz-zlabel">가지</span><button className="tlz-reset tlz-zbtn" onClick={() => zoomAxis("y", 1.6, cy)}>＋</button>
          <button className="tlz-reset tlz-zbtn" onClick={() => zoomAxis("y", 1 / 1.6, cy)}>－</button>
          <button className="tlz-reset" onClick={() => { cancelAnim(); setFitted(null); animateTo({ kx: 1, ky: 1, tx: 0, ty: 0 }); }}>초기화</button>
          {fitted && (
            <button className="tlz-reset tlz-listbtn" onClick={() => onSelectBranch(laneMetaMap.get(fitted)?.branch ?? fitted)}>
              {laneMetaMap.get(fitted)?.ko} 논문 목록 ▸
            </button>
          )}
          <span className="tlz-hint">{narrow ? "핀치 가로=연도·세로=가지 · 드래그=이동 · 탭=상세" : "Shift+휠=연도 · Ctrl+휠=가지 · 드래그=이동 · 점 클릭=상세 · 속 빈 원=리뷰"}</span>
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
        {qActive && (
          <div className="tlz-dropdown">
            {byCited.filter((p) => matched.has(p.id)).slice(0, 8).map((p) => (
              <button key={p.id} className="tlz-dditem" onClick={() => { onOpen(p); setQ(""); }}>
                {displayTitle(p.title).slice(0, 60)} <span className="tlz-cite2">· {p.cited} · {p.year}</span>
              </button>
            ))}
          </div>
        )}
        <span className="tlz-glabel">주요 그룹 강조:</span>
        {groupCounts.map((g) => (
          <label key={g.id} className={`tlz-chip${checked.has(g.id) ? " on" : ""}`}>
            <input type="checkbox" checked={checked.has(g.id)} onChange={() => toggle(g.id)} />
            {g.label} ({g.n})
          </label>
        ))}
        {grpActive && <button className="tlz-reset" onClick={() => setChecked(new Set())}>해제</button>}
      </div>

      <div className="tlz-svgwrap" ref={wrapRef}>
      {hpaper && (
        <div className="tlz-hoverinfo">
          <strong>{displayTitle(hpaper.title)}</strong> · 인용 {hpaper.cited} · {hpaper.author} · {hpaper.year}
          {hpaper.group && <span className="tlz-hg"> · {groupLabel.get(hpaper.group) ?? hpaper.group}</span>}
          <span className="tlz-hf"> · {hpaper.fields.map((f) => fieldById.get(f)?.ko ?? f).join(", ")}</span>
        </div>
      )}
      <svg ref={svgRef} className="tlz-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet"
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        onMouseDown={(e) => { cancelAnim(); drag.current = { x: e.clientX, y: e.clientY }; }}
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
            <circle key={p.id} cx={x} cy={y} r={radius(p.cited)} fill={p.review ? "var(--panel)" : (laneMetaMap.get(p.lane)?.color ?? "#888")}
              fillOpacity={dotOp(p)} stroke={dotRing(p) ? "var(--text)" : p.review ? (laneMetaMap.get(p.lane)?.color ?? "#888") : "none"}
              strokeWidth={dotRing(p) ? 1.5 : p.review ? 1.6 : 0}
              className="tlz-dot" onMouseEnter={() => setHover(p.id)} onMouseLeave={() => setHover(null)} onClick={() => onOpen(p)}>
              <title>{`${displayTitle(p.title)}\n${p.author} · ${p.year} · 인용 ${p.cited}`}</title>
            </circle>
          ))}
          {labels.map(({ p, lines, lx, ly }) => (
          <text key={`lbl-${p.id}`} className="tlz-plabel" x={lx} y={ly - (lines.length - 1) * 5 + 3}>
            {lines.map((ln, i) => (
              <tspan key={i} x={lx} dy={i === 0 ? 0 : 10}>
                {ln}{i === lines.length - 1 ? <tspan className="tlz-cite"> · {p.cited}</tspan> : null}
              </tspan>
            ))}
          </text>
        ))}
        </g>

        {/* 축 라벨 — 박스 가장자리 고정(클립 밖) */}
        {lanes.map((id, i) => {
          const m = laneMetaMap.get(id);
          if (narrow) {
            const yTop = sy(M.t + i * laneH) + 9;
            if (yTop < M.t + 4 || yTop > H - M.b - 2) return null;
            return (
              <text key={`ll-${id}`} className={`tlz-lanelabel tlz-lanein${fitted === id ? " fit" : ""}`}
                x={M.l + 4} y={yTop} textAnchor="start" fill={m?.color} onClick={() => fitLane(id)}>
                {m?.ko}
              </text>
            );
          }
          const cyl = sy(M.t + i * laneH + laneH * 0.5);
          if (cyl < M.t - 4 || cyl > H - M.b + 4) return null;
          return (
            <text key={`ll-${id}`} className={`tlz-lanelabel${fitted === id ? " fit" : ""}`} x={M.l - 8} y={cyl}
              textAnchor="end" dominantBaseline="middle" fill={m?.color} onClick={() => fitLane(id)}>
              <title>클릭: 이 분야를 화면에 맞게 확대 (다시 클릭하면 복귀)</title>
              {m?.ko}
            </text>
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
