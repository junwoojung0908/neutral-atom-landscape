import { useEffect, useMemo, useRef, useState } from "react";
import { papers, citeEdges } from "../lib/timeline.ts";
import type { TPaper } from "../lib/timeline.ts";
import { firstLevelFields, fieldById } from "../data/loader.ts";
import { displayTitle } from "../lib/format.ts";
import groupsJson from "../../data/groups.json";
import { counts } from "../lib/survey.ts";
import { curatedEdges } from "../lib/curated.ts";

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
/** 마지막 저자(교신 관례)의 성만 — 라벨용 */
const surname = (name?: string) => {
  const parts = (name ?? "").trim().split(/\s+/);
  return parts.length ? parts[parts.length - 1] : "";
};

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

// 줌아웃 대분류(5) — 세로 줌인하면 13개 세분류로 갈라짐(시맨틱 줌)
const LANE_GROUPS = [
  { id: "g.digital", ko: "Digital computing", color: "#6EA8E5", children: ["qec", "gate", "readout"] },
  { id: "g.sim", ko: "Analog simulation", color: "#FF6B6E", children: ["sim.eq", "sim.dyn", "sim.gauge"] },
  { id: "g.atom", ko: "Species · metrology", color: "#7ED67E", children: ["species", "clock"] },
  { id: "g.algo", ko: "Algorithms · verification", color: "#C99BD9", children: ["opt", "classical", "software"] },
  { id: "g.scale", ko: "Scale · interconnects", color: "#3FD3E5", children: ["scale", "net"] },
];
const SPLIT_KY = 2.2; // 이 세로 배율부터 세분류 표시

const SIM_SUBS = [
  { id: "sim.eq", ko: "Simulation · phases", color: "#FF7B7E", branch: "sim" },
  { id: "sim.dyn", ko: "Simulation · dynamics", color: "#E05C60", branch: "sim" },
  { id: "sim.gauge", ko: "Simulation · gauge/topo", color: "#B04A4F", branch: "sim" },
];

export default function TimelineZoom({ onOpen, onSelectBranch, selectedId }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [H, setH] = useState(420);
  const [narrow, setNarrow] = useState(false);
  const W = narrow ? 400 : 1000;
  const M = narrow ? { l: 14, r: 8, t: 6, b: 18 } : { l: 172, r: 14, t: 8, b: 22 };
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

  const laneMeta = useMemo(() => {
    const all = firstLevelFields.flatMap((f) => (f.id === "sim" ? SIM_SUBS : [{ id: f.id, ko: f.en, color: f.color, branch: f.id }]));
    const byId2 = new Map(all.map((m) => [m.id, m]));
    // 대분류의 자식이 세로로 인접하도록 정렬
    return LANE_GROUPS.flatMap((g) => g.children.map((c) => byId2.get(c)!).filter(Boolean));
  }, []);
  const laneMetaMap = useMemo(() => new Map(laneMeta.map((m) => [m.id, m])), [laneMeta]);
  const lanes = laneMeta.map((m) => m.id);
  const groupOfLane = useMemo(() => {
    const m = new Map<string, (typeof LANE_GROUPS)[number]>();
    for (const g of LANE_GROUPS) for (const c of g.children) m.set(c, g);
    return m;
  }, []);

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

  const byCited = useMemo(() => papers.slice().sort((a, b) => b.score - a.score), []); // score = 인용 + 최신 속도 보정
  // 레인별 인용순 — LOD 를 레인 단위로 할당해 화면 밀도를 균등화
  const byLaneSorted = useMemo(() => {
    const m = new Map<string, TPaper[]>();
    for (const p of byCited) {
      const arr = m.get(p.lane);
      if (arr) arr.push(p);
      else m.set(p.lane, [p]);
    }
    return m;
  }, [byCited]);
  const byId = useMemo(() => new Map(papers.map((p) => [p.id, p])), []);
  const majorIds = useMemo(() => new Set(byCited.slice(0, MAJOR).map((p) => p.id)), [byCited]);
  const groupCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of papers) if (p.group) m.set(p.group, (m.get(p.group) ?? 0) + 1);
    return groupsMeta.filter((g) => m.has(g.id)).map((g) => ({ ...g, n: m.get(g.id)! }));
  }, []);

  const [view, setView] = useState<View>(() => {
    const p = new URLSearchParams(window.location.search);
    const v = (p.get("v") ?? "").split(",").map(Number);
    return v.length === 4 && v.every((x) => Number.isFinite(x))
      ? { kx: clamp(v[0], 1, 40), ky: clamp(v[1], 1, 40), tx: v[2], ty: v[3] }
      : { kx: 1, ky: 1, tx: 0, ty: 0 };
  });
  const coarse = view.ky < SPLIT_KY; // 줌아웃 = 대분류 5개
  const [hover, setHover] = useState<string | null>(null);
  const eff = hover ?? selectedId ?? null; // 강조 대상(hover 우선, 없으면 선택 논문)
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set((new URLSearchParams(window.location.search).get("g") ?? "").split(",").filter(Boolean)),
  );
  const [q, setQ] = useState(() => new URLSearchParams(window.location.search).get("tq") ?? "");
  const [fitted, setFitted] = useState<string | null>(null); // 화면에 맞춰 확대된 레인
  const raf = useRef<number | null>(null);

  // 부드러운 전환: 현재 view → target (ease-in-out cubic, ~450ms)
  const animateTo = (target: Partial<View>) => {
    if (raf.current) cancelAnimationFrame(raf.current);
    const from = { ...viewRef.current };
    const to = clampView({ ...from, ...target } as View);
    const t0 = performance.now();
    const D = 450;
    const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    let done = false;
    const step = (now: number) => {
      const t = clamp((now - t0) / D, 0, 1);
      const e = ease(t);
      setView(clampView({
        kx: from.kx + (to.kx - from.kx) * e,
        ky: from.ky + (to.ky - from.ky) * e,
        tx: from.tx + (to.tx - from.tx) * e,
        ty: from.ty + (to.ty - from.ty) * e,
      }));
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

  // 행(대분류/세분류) 클릭: 화면 위아래에 딱 맞게 확대(토글). 대분류를 fit 하면
  // 배율이 SPLIT_KY 를 넘으며 자동으로 세분류로 갈라진다 — 시맨틱 줌.
  const fitRow = (id: string, startIdx: number, len: number) => {
    if (fitted === id) {
      setFitted(null);
      animateTo({ ky: 1, ty: 0 });
      return;
    }
    const ky = lanes.length / len;
    const laneTop = M.t + startIdx * laneH;
    const ty = M.t - laneTop * ky;
    setFitted(id);
    animateTo({ ky, ty });
  };
  const fitLane = (id: string) => fitRow(id, laneIndex.get(id) ?? 0, 1);
  // fit 상태에서 컨테이너 높이가 변하면(버튼 등장·모바일 URL바) 즉시 재정렬
  useEffect(() => {
    if (!fitted) return;
    const g = LANE_GROUPS.find((x) => x.id === fitted);
    const start = g ? laneIndex.get(g.children[0]) ?? 0 : laneIndex.get(fitted) ?? 0;
    const len = g ? g.children.length : laneMetaMap.has(fitted) ? 1 : 0;
    if (!len) return;
    const ky = lanes.length / len;
    const laneTop = M.t + start * laneH;
    setView((v) => clampView({ ...v, ky, ty: M.t - laneTop * ky }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [H]);
  const fitGroup = (g: (typeof LANE_GROUPS)[number]) => {
    const start = laneIndex.get(g.children[0]) ?? 0;
    fitRow(g.id, start, g.children.length);
  };
  // 뷰·그룹·검색을 URL 에 동기화(공유용). 다른 키는 보존.
  useEffect(() => {
    const t = window.setTimeout(() => {
      const p = new URLSearchParams(window.location.search);
      const def = view.kx === 1 && view.ky === 1 && Math.abs(view.tx) < 1 && Math.abs(view.ty) < 1;
      if (def) p.delete("v");
      else p.set("v", [view.kx, view.ky, view.tx, view.ty].map((x) => Math.round(x * 100) / 100).join(","));
      if (checked.size) p.set("g", [...checked].join(","));
      else p.delete("g");
      if (q) p.set("tq", q);
      else p.delete("tq");
      const qs = p.toString();
      window.history.replaceState(null, "", qs ? `${window.location.pathname}?${qs}${window.location.hash}` : window.location.pathname + window.location.hash);
    }, 250);
    return () => window.clearTimeout(t);
  }, [view, checked, q]);

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
        return clampView({
          kx, ky,
          tx: c.x - (c.x - v.tx) * (kx / v.kx),
          ty: c.y - (c.y - v.ty) * (ky / v.ky),
        });
      });
      pinch.current = { x1: a.clientX, y1: a.clientY, x2: b.clientX, y2: b.clientY };
    } else if (e.touches.length === 1 && drag.current && svgRef.current) {
      const r = svgRef.current.getBoundingClientRect();
      const t = e.touches[0];
      const dx = ((t.clientX - drag.current.x) / r.width) * W;
      const dy = ((t.clientY - drag.current.y) / r.height) * H;
      drag.current = { x: t.clientX, y: t.clientY };
      setView((v) => clampView({ ...v, tx: v.tx + dx, ty: v.ty + dy }));
    }
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) pinch.current = null;
    if (e.touches.length === 0) drag.current = null;
  };

  // 팬/줌 경계: 플롯 영역이 항상 콘텐츠로 덮이도록 tx/ty 를 가둠 (빈 데로 못 나감)
  const clampView = (v: View): View => ({
    kx: v.kx,
    ky: v.ky,
    tx: clamp(v.tx, (W - M.r) * (1 - v.kx), M.l * (1 - v.kx)),
    ty: clamp(v.ty, (H - M.b) * (1 - v.ky), M.t * (1 - v.ky)),
  });

  const sx = (bx: number) => view.tx + bx * view.kx;
  const sy = (by: number) => view.ty + by * view.ky;
  const zoomAxis = (axis: "x" | "y", f: number, focus: number) =>
    setView((v) => {
      if (axis === "x") { const kx = clamp(v.kx * f, 1, 40); return clampView({ ...v, kx, tx: focus - (focus - v.tx) * (kx / v.kx) }); }
      const ky = clamp(v.ky * f, 1, 40); return clampView({ ...v, ky, ty: focus - (focus - v.ty) * (ky / v.ky) });
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

  const byGroupSorted = useMemo(() => {
    const m = new Map<string, TPaper[]>();
    for (const p of byCited) {
      const g = groupOfLane.get(p.lane);
      if (!g) continue;
      const arr = m.get(g.id);
      if (arr) arr.push(p);
      else m.set(g.id, [p]);
    }
    return m;
  }, [byCited, groupOfLane]);

  // 행당 K개 (기본 2, 줌인할수록 증가). 줌아웃=대분류 5행(≈10개), 줌인=세분류 13행.
  const perLane = clamp(Math.round(2 * Math.sqrt(view.kx * view.ky)), 2, 500);
  const visible = useMemo(() => {
    const out: { p: TPaper; x: number; y: number }[] = [];
    const seen = new Set<string>();
    const push = (p: TPaper) => {
      if (seen.has(p.id)) return;
      seen.add(p.id);
      const b = pos.get(p.id)!;
      const x = view.tx + b.x * view.kx;
      const y = view.ty + b.y * view.ky;
      if (x > M.l - 30 && x < W - M.r + 30 && y > M.t - 30 && y < H - M.b + 30) out.push({ p, x, y });
    };
    const picked: TPaper[] = [];
    const src = coarse ? byGroupSorted : byLaneSorted;
    for (const arr of src.values()) for (const p of arr.slice(0, perLane)) picked.push(p);
    picked.sort((a, b) => b.score - a.score); // 라벨 우선순위 = 중요도(score)순
    for (const p of picked) push(p);
    if (eff) for (const e of curatedEdges) {
      if (e.from === eff || e.to === eff) {
        const other = byId.get(e.from === eff ? e.to : e.from);
        if (other) push(other);
      }
    }
    if (qn) for (const p of papers) if (matched.has(p.id)) push(p);
    // 겹침 완화: 3회 반복 분리 + 논문당 총 이동 12 상한(위치 안정성)
    const origin = out.map((o) => ({ x: o.x, y: o.y }));
    for (let it = 0; it < 3; it++) {
      for (let i = 0; i < out.length; i++) {
        for (let j = i + 1; j < out.length; j++) {
          const a = out[i], b = out[j];
          const ra = radius(a.p.score), rb = radius(b.p.score);
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.hypot(dx, dy) || 1;
          const min = ra + rb + 3;
          if (d < min) {
            const push2 = (min - d) / 2;
            const ux = dx / d, uy = dy / d;
            a.x -= ux * push2; a.y -= uy * push2;
            b.x += ux * push2; b.y += uy * push2;
          }
        }
      }
    }
    for (let i = 0; i < out.length; i++) {
      const dx = out[i].x - origin[i].x, dy = out[i].y - origin[i].y;
      const d = Math.hypot(dx, dy);
      if (d > 12) { out[i].x = origin[i].x + (dx / d) * 12; out[i].y = origin[i].y + (dy / d) * 12; }
    }
    return out;
  }, [perLane, view, pos, byLaneSorted, byGroupSorted, coarse, qn, matched, eff]);

  const posS = useMemo(() => new Map(visible.map((v) => [v.p.id, v])), [visible]);
  const visSet = useMemo(() => new Set(visible.map((v) => v.p.id)), [visible]);
  const backbone = useMemo(
    () => citeEdges.filter((e) => majorIds.has(e.from) && majorIds.has(e.to) && visSet.has(e.from) && visSet.has(e.to)),
    [majorIds, visSet],
  );
  const hoverEdges = useMemo(
    () => (eff ? citeEdges.filter((e) => (e.from === eff || e.to === eff) && visSet.has(e.from) && visSet.has(e.to)) : []),
    [eff, visSet],
  );
  const connected = useMemo(() => {
    const s = new Set<string>();
    for (const e of hoverEdges) { s.add(e.from); s.add(e.to); }
    return s;
  }, [hoverEdges]);

  // ★ 모든 보이는 원에 라벨 — 8방향×4거리에서 빈 자리 탐색(점·라벨 모두 회피),
  //   가까운 자리가 없으면 멀리 놓고 가는 지시선으로 연결. 겹침 강제 배치는 최후에만.
  const labels = useMemo(() => {
    interface Rect { x1: number; y1: number; x2: number; y2: number }
    const hit = (placed: Rect[], r2: Rect) =>
      placed.some((q2) => r2.x1 < q2.x2 && r2.x2 > q2.x1 && r2.y1 < q2.y2 && r2.y2 > q2.y1);
    // 점 자체도 장애물 — 라벨이 다른 원을 덮지 않게
    const placed: Rect[] = visible.map((v) => {
      const r = radius(v.p.score);
      return { x1: v.x - r, y1: v.y - r, x2: v.x + r, y2: v.y + r };
    });
    const out: { p: TPaper; lines: string[]; lx: number; ly: number; lead: { x1: number; y1: number; x2: number; y2: number } | null }[] = [];
    const fs = narrow ? 8.5 : 9;
    const DIRS = [[1, 0], [-1, 0], [1, -1], [1, 1], [-1, -1], [-1, 1], [0, -1], [0, 1]];
    const DISTS = [4, 16, 30, 46];
    for (const v of visible) {
      const lines = wrap2(v.p.title, narrow ? 18 : 26, 3);
      const wText = Math.max(...lines.map((l) => l.length)) * fs * 0.56 + 26 + surname(v.p.pi).length * fs * 0.56;
      const hText = lines.length * (fs + 1.5) + 2;
      const r = radius(v.p.score);
      let chosen: { lx: number; ly: number; dist: number; dx: number; dy: number } | null = null;
      search: for (const dist of DISTS) {
        for (const [dx, dy] of DIRS) {
          const ax = v.x + dx * (r + dist);
          const ay = v.y + dy * (r + dist) * 0.8;
          const lx = dx > 0 ? ax : dx < 0 ? ax - wText : ax - wText / 2;
          const rect: Rect = { x1: lx - 2, y1: ay - hText / 2, x2: lx + wText, y2: ay + hText / 2 };
          if (rect.x1 < M.l + 2 || rect.x2 > W - 2 || rect.y1 < M.t + 1 || rect.y2 > H - M.b - 1) continue;
          if (hit(placed, rect)) continue;
          placed.push(rect);
          chosen = { lx, ly: ay, dist, dx, dy };
          break search;
        }
      }
      if (!chosen) {
        const lx = v.x + r + 4;
        chosen = { lx, ly: v.y, dist: 4, dx: 1, dy: 0 };
        placed.push({ x1: lx - 2, y1: v.y - hText / 2, x2: lx + wText, y2: v.y + hText / 2 });
      }
      const lead =
        chosen.dist >= 16
          ? { x1: v.x + chosen.dx * r, y1: v.y + chosen.dy * r * 0.8,
              x2: chosen.dx > 0 ? chosen.lx - 2 : chosen.dx < 0 ? chosen.lx + wText - 24 : chosen.lx + wText / 2, y2: chosen.ly }
          : null;
      out.push({ p: v.p, lines, lx: chosen.lx, ly: chosen.ly, lead });
    }
    return out;
  }, [visible, narrow]);

  const grpActive = checked.size > 0;
  const qActive = qn.length > 0;
  // 밝기(불투명도) = 인용수 로그 스케일 — 크기와 함께 이중 인코딩으로 대비
  const maxCited = byCited[0]?.score ?? 1;
  const logDen = Math.log10(1 + maxCited);
  const baseOp = (p: TPaper) => 0.22 + 0.7 * (Math.log10(1 + p.score) / logDen);
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
        <span className="tlz-meta">{papers.length.toLocaleString()} papers · OpenAlex citations · updated {UPDATED}</span>
        <span className="tlz-controls">
          <span className="tlz-zlabel">Year</span><button className="tlz-reset tlz-zbtn" onClick={() => zoomAxis("x", 1.6, cx)}>＋</button>
          <button className="tlz-reset tlz-zbtn" onClick={() => zoomAxis("x", 1 / 1.6, cx)}>－</button>
          <span className="tlz-zlabel">Lane</span><button className="tlz-reset tlz-zbtn" onClick={() => zoomAxis("y", 1.6, cy)}>＋</button>
          <button className="tlz-reset tlz-zbtn" onClick={() => zoomAxis("y", 1 / 1.6, cy)}>－</button>
          <button className="tlz-reset" onClick={() => { cancelAnim(); setFitted(null); animateTo({ kx: 1, ky: 1, tx: 0, ty: 0 }); }}>Reset</button>
          {fitted && laneMetaMap.has(fitted) && (
            <button className="tlz-reset tlz-listbtn" onClick={() => onSelectBranch(laneMetaMap.get(fitted)?.branch ?? fitted)}>
              {laneMetaMap.get(fitted)?.ko} paper list ▸
            </button>
          )}
          <span className="tlz-hint">{narrow ? "Pinch horiz=year · vert=lane · drag=pan · tap=details" : "Shift+wheel=year · Ctrl+wheel=lane · drag=pan · click=details · hollow=review"}</span>
        </span>
      </div>

      <div className="tlz-groups">
        <input
          className="tlz-search"
          type="search"
          placeholder="Search papers (title · author · keyword)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {qActive && <span className="tlz-hint">{matched.size}matched{matched.size >= 300 ? "+" : ""}</span>}
        {qActive && (
          <div className="tlz-dropdown">
            {byCited.filter((p) => matched.has(p.id)).slice(0, 8).map((p) => (
              <button key={p.id} className="tlz-dditem" onClick={() => { onOpen(p); setQ(""); }}>
                {displayTitle(p.title).slice(0, 60)} <span className="tlz-cite2">· {p.cited} · {p.year}</span>
              </button>
            ))}
          </div>
        )}
        <span className="tlz-glabel">Highlight groups:</span>
        {groupCounts.map((g) => (
          <label key={g.id} className={`tlz-chip${checked.has(g.id) ? " on" : ""}`}>
            <input type="checkbox" checked={checked.has(g.id)} onChange={() => toggle(g.id)} />
            {g.label} ({g.n})
          </label>
        ))}
        {grpActive && <button className="tlz-reset" onClick={() => setChecked(new Set())}>Clear</button>}
      </div>

      <div className="tlz-svgwrap" ref={wrapRef}>
      {hpaper && (
        <div className="tlz-hoverinfo">
          <strong>{displayTitle(hpaper.title)}</strong> · cited {hpaper.cited} · {hpaper.author} · PI {hpaper.pi || "?"} · {hpaper.year}
          {hpaper.group && <span className="tlz-hg"> · {groupLabel.get(hpaper.group) ?? hpaper.group}</span>}
          <span className="tlz-hf"> · {hpaper.fields.map((f) => fieldById.get(f)?.en ?? f).join(", ")}</span>
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
          setView((v) => clampView({ ...v, tx: v.tx + dx, ty: v.ty + dy }));
        }}
        onMouseUp={() => (drag.current = null)} onMouseLeave={() => { drag.current = null; }}>
        <defs>
          <clipPath id="tlz-plot"><rect x={M.l} y={M.t} width={PW} height={PH} /></clipPath>
          {/* 형광 글로우 — 점 그룹 전체에 한 번만 합성(성능) */}
          <filter id="atomGlow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="1.8" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* 클립된 내용: 밴드·엣지·점·라벨 */}
        <g clipPath="url(#tlz-plot)">
          {(coarse
            ? LANE_GROUPS.map((g, gi) => ({ key: g.id, start: laneIndex.get(g.children[0]) ?? 0, len: g.children.length, on: gi % 2 === 0 }))
            : lanes.map((id, i) => ({ key: id, start: i, len: 1, on: i % 2 === 0 }))
          ).map((b) =>
            b.on ? (
              <rect key={`band-${b.key}`} className="tlz-laneband" x={M.l} y={sy(M.t + b.start * laneH)} width={PW} height={b.len * laneH * view.ky} />
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
          {/* 큐레이션 관계는 관련 논문 hover/선택 시에만 (표본이 적어 상시 표시는 임의로 보임) */}
          {eff && curatedEdges.filter((e) => e.from === eff || e.to === eff).map((e, i) => {
            const a = posS.get(e.from), b = posS.get(e.to);
            if (!a || !b) return null;
            const contests = e.rel === "contests";
            return (
              <line key={`cur-${i}`} className={contests ? "tlz-cur-con" : "tlz-cur-imp"}
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}>
                <title>{e.rel === "contests" ? "contests (rebuttal)" : e.rel}</title>
              </line>
            );
          })}
          <g filter="url(#atomGlow)">
          {visible.map(({ p, x, y }) => (
            <circle key={p.id} cx={x} cy={y} r={radius(p.score)} fill={p.review ? "var(--frame)" : (laneMetaMap.get(p.lane)?.color ?? "#888")}
              fillOpacity={dotOp(p)} stroke={dotRing(p) ? "var(--text)" : p.review ? (laneMetaMap.get(p.lane)?.color ?? "#888") : "none"}
              strokeWidth={dotRing(p) ? 1.5 : p.review ? 1.6 : 0}
              className="tlz-dot" onMouseEnter={() => setHover(p.id)} onMouseLeave={() => setHover(null)} onClick={() => onOpen(p)}>
              <title>{`${displayTitle(p.title)}\n${p.author} · ${p.year} · cited ${p.cited}${p.hot ? ' (rising ↗)' : ''}`}</title>
            </circle>
          ))}
          </g>
          {/* 시그니처: 트랩 링 — hover/선택된 점 바깥에서 조여드는 가는 링 */}
          {eff && posS.get(eff) && (() => {
            const v = posS.get(eff)!;
            const r0 = radius(v.p.score);
            return (
              <circle key={`trap-${eff}`} className="tlz-trapring" cx={v.x} cy={v.y} r={r0 + 4}
                style={{ ["--r0" as never]: `${r0 + 13}px`, ["--r1" as never]: `${r0 + 4}px` }} />
            );
          })()}
          {labels.map(({ p, lead }, i) =>
          lead ? <line key={`ld-${p.id}-${i}`} className="tlz-lead" x1={lead.x1} y1={lead.y1} x2={lead.x2} y2={lead.y2} /> : null,
        )}
        {labels.map(({ p, lines, lx, ly }) => (
          <text key={`lbl-${p.id}`} className="tlz-plabel" x={lx} y={ly - (lines.length - 1) * 5 + 3}>
            {lines.map((ln, i) => (
              <tspan key={i} x={lx} dy={i === 0 ? 0 : 10}>
                {ln}{i === lines.length - 1 ? <tspan className="tlz-cite"> · {p.cited}{p.hot ? "↗" : ""}{surname(p.pi) ? ` · ${surname(p.pi)}` : ""}</tspan> : null}
              </tspan>
            ))}
          </text>
        ))}
        </g>

        {/* 축 라벨 — 박스 가장자리 고정(클립 밖) */}
        {(coarse
          ? LANE_GROUPS.map((g) => ({ id: g.id, ko: g.ko, color: g.color, start: laneIndex.get(g.children[0]) ?? 0, len: g.children.length, group: g }))
          : lanes.map((id, i) => { const m = laneMetaMap.get(id)!; return { id, ko: m.ko, color: m.color, start: i, len: 1, group: null as null | (typeof LANE_GROUPS)[number] }; })
        ).map((row) => {
          const onClick = () => (row.group ? fitGroup(row.group) : fitLane(row.id));
          if (narrow) {
            const yTop = sy(M.t + row.start * laneH) + 9;
            if (yTop < M.t + 4 || yTop > H - M.b - 2) return null;
            return (
              <text key={`ll-${row.id}`} className={`tlz-lanelabel tlz-lanein${fitted === row.id ? " fit" : ""}`}
                x={M.l + 4} y={yTop} textAnchor="start" fill={row.color} onClick={onClick}>
                {row.ko}
              </text>
            );
          }
          const cyl = sy(M.t + row.start * laneH + (row.len * laneH) * 0.5);
          if (cyl < M.t - 4 || cyl > H - M.b + 4) return null;
          return (
            <text key={`ll-${row.id}`} className={`tlz-lanelabel${fitted === row.id ? " fit" : ""}`} x={M.l - 8} y={cyl}
              textAnchor="end" dominantBaseline="middle" fill={row.color} onClick={onClick}>
              <title>Click: fit this lane to screen (click again to reset)</title>
              {row.ko}
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
