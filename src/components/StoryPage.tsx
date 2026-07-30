import { useMemo } from "react";
import { papers } from "../lib/timeline.ts";
import { fieldById, firstLevelOf } from "../data/loader.ts";
import { edges } from "../data/loader.ts";
import { counts } from "../lib/survey.ts";
import { THESIS, ACTS, storyReady } from "../data/story.ts";
import type { Act } from "../data/story.ts";
import { entById, chipLabel, arxivOf, narrativeExcerpt, tourOrder } from "../lib/entities.ts";
import { displayTitle } from "../lib/format.ts";
import ChipText from "./ChipText.tsx";
import { LANE_GROUPS } from "./TimelineZoom.tsx";

interface Props {
  onStartTour: () => void;
  onOpenPaper: (arxivId: string) => void;
  onExploreBranch: (branchId: string) => void;
}

const Y0 = 2015, Y1 = 2026;
/** 1차 가지 → 줌아웃 대분류 행 (미니 타임라인 세로 배치용) */
const groupRowOf = (branch: string): number => {
  const i = LANE_GROUPS.findIndex((g) => g.children.some((c) => c === branch || c.startsWith(`${branch}.`)));
  return i < 0 ? 0 : i;
};

/** 막 옆 미니 타임라인 — 랜드마크 12개와 curated edges 만 그린 골격. 1,757편은 그리지 않는다. */
function ActMini({ act }: { act: Act }) {
  const W = 260, H = 118, ML = 10, MR = 10, MT = 12, MB = 20;
  const x = (yr: number) => ML + ((Math.min(Math.max(yr, Y0), Y1) - Y0) / (Y1 - Y0)) * (W - ML - MR);
  const y = (row: number) => MT + ((row + 0.5) / LANE_GROUPS.length) * (H - MT - MB);
  const inAct = new Set(act.entityIds);

  const pts = useMemo(() => {
    const out = new Map<string, { x: number; y: number; color: string; hi: boolean; label: string; ly: number }>();
    const taken: { x: number; y: number }[] = [];
    const labelBoxes: { x1: number; x2: number; y: number }[] = [];
    for (const e of tourOrder) {
      const b = firstLevelOf(e.fields[0]);
      const px = x(e.year);
      let py = y(groupRowOf(b));
      // 같은 행·비슷한 연도의 점이 겹치면 세로로 밀어낸다
      while (taken.some((t) => Math.abs(t.x - px) < 7 && Math.abs(t.y - py) < 7)) py += 8;
      taken.push({ x: px, y: py });
      // 라벨(강조 점만)도 서로 겹치지 않게: 위 → 아래 → 더 위 순으로 자리 탐색
      let ly = py - 7;
      if (inAct.has(e.id)) {
        const w = chipLabel(e).length * 4.4;
        for (const dy of [-7, 13, -17, 23]) {
          const cand = py + dy;
          if (cand < MT - 2 || cand > H - MB - 3) continue; // 축·상단 침범 금지
          if (!labelBoxes.some((bx) => Math.abs(bx.y - cand) < 10 && px - w / 2 < bx.x2 && px + w / 2 > bx.x1)) {
            ly = cand;
            break;
          }
        }
        labelBoxes.push({ x1: px - w / 2, x2: px + w / 2, y: ly });
      }
      out.set(e.id, { x: px, y: py, color: fieldById.get(b)?.color ?? "var(--muted)", hi: inAct.has(e.id), label: chipLabel(e), ly });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [act.id]);

  return (
    <svg className="story-mini" viewBox={`0 0 ${W} ${H}`} aria-label={`Landmarks ${act.period}`}>
      <line className="story-mini-axis" x1={ML} y1={H - MB} x2={W - MR} y2={H - MB} />
      {[2015, 2020, 2025].map((yr) => (
        <text key={yr} className="story-mini-year" x={x(yr)} y={H - 7} textAnchor="middle">{yr}</text>
      ))}
      {edges.map((e, i) => {
        const a = pts.get(e.from), b = pts.get(e.to);
        if (!a || !b) return null;
        return (
          <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
            className={e.rel === "contests" ? "story-mini-con" : "story-mini-imp"} />
        );
      })}
      {[...pts.entries()].map(([id, p]) => (
        <g key={id} opacity={p.hi ? 1 : 0.3}>
          <circle cx={p.x} cy={p.y} r={p.hi ? 4.5 : 3} fill={p.color} />
          {p.hi && <circle cx={p.x} cy={p.y} r={1.7} fill="var(--atom)" />}
          {p.hi && (
            <text className="story-mini-label" x={p.x} y={p.ly + (p.ly > p.y ? 4 : 0)} textAnchor="middle">{p.label}</text>
          )}
        </g>
      ))}
    </svg>
  );
}

/** 최근 12개월 신규(arXiv id 의 YYMM 기준) + 최근 24개월 rising(↗) 가지별 집계 — cron 갱신 시 자동 최신화 */
function useRecentStats() {
  return useMemo(() => {
    const m = /^(\d{4})-(\d{2})/.exec(counts.generated_at ?? "");
    const nowYm = m ? Number(m[1]) * 12 + Number(m[2]) : 2026 * 12 + 7;
    const ymOf = (id: string) => {
      const mm = /^(\d{2})(\d{2})\./.exec(id);
      return mm ? (2000 + Number(mm[1])) * 12 + Number(mm[2]) : null;
    };
    const byBranch = new Map<string, { fresh: number; rising: number }>();
    for (const p of papers) {
      const ym = ymOf(p.id);
      if (ym == null) continue;
      const b = p.lane.startsWith("sim") ? "sim" : p.lane;
      const o = byBranch.get(b) ?? { fresh: 0, rising: 0 };
      if (ym > nowYm - 12 && ym <= nowYm) o.fresh++;
      if (p.hot && ym > nowYm - 24 && ym <= nowYm) o.rising++;
      byBranch.set(b, o);
    }
    return [...byBranch.entries()]
      .sort((a, b) => b[1].fresh - a[1].fresh || b[1].rising - a[1].rising)
      .map(([b, o]) => ({ branch: b, ...o }));
  }, []);
}

export default function StoryPage({ onStartTour, onOpenPaper, onExploreBranch }: Props) {
  const recent = useRecentStats();
  const totalFresh = recent.reduce((s, r) => s + r.fresh, 0);

  return (
    <div className="app app-scroll">
      <header className="topbar">
        <h1>Neutral-Atom Research Landscape</h1>
        <span className="nav-links">
          <a className="nav-link" href="#/explore">Explore</a>
          <a className="nav-link" href="#/growth">Growth by year</a>
          <a className="nav-link" href="#/about">Methodology</a>
        </span>
      </header>

      <main className="story">
        {storyReady ? (
          <h2 className="story-thesis">{THESIS}</h2>
        ) : (
          <h2 className="story-thesis story-pending">The field, in one sentence — pending (author’s line).</h2>
        )}
        <p className="story-sub">
          A corpus of {papers.length.toLocaleString()} papers defined by a published arXiv query — read it as a story
          first, or go straight to the data.
        </p>
        <div className="story-cta">
          <button className="story-btn story-btn-primary" onClick={onStartTour}>
            Start here — walk {tourOrder.length} landmark papers →
          </button>
          <a className="story-btn" href="#/explore">Explore all {papers.length.toLocaleString()} papers →</a>
        </div>

        {ACTS.map((act, ai) => (
          <section key={act.id} className="story-act">
            <div className="story-act-text">
              <span className="story-period">Act {["I", "II", "III", "IV"][ai]} · {act.period}</span>
              {act.title.startsWith("PLACEHOLDER") ? (
                <h3 className="story-act-title story-pending">act title pending</h3>
              ) : (
                <h3 className="story-act-title">{act.title}</h3>
              )}
              {(() => {
                const seen = new Set<string>();
                return act.entityIds.map((id) => {
                  const ex = narrativeExcerpt(id);
                  if (!ex || seen.has(ex.text)) return null;
                  seen.add(ex.text);
                  return (
                    <p key={id} className="story-excerpt">
                      <ChipText text={ex.text} onOpenPaper={onOpenPaper} />{" "}
                      <span className="story-src">— {fieldById.get(ex.branch)?.en ?? ex.branch} narrative</span>
                    </p>
                  );
                });
              })()}
              <div className="story-chips">
                {act.entityIds.map((id) => {
                  const e = entById.get(id);
                  if (!e) return null;
                  const ax = arxivOf(e);
                  return (
                    <button key={id} className="nar-chip story-chip" disabled={!ax}
                      title={displayTitle(e.label)} onClick={() => ax && onOpenPaper(ax)}>
                      {chipLabel(e)}
                    </button>
                  );
                })}
              </div>
            </div>
            <ActMini act={act} />
          </section>
        ))}

        <section className="story-recent">
          <span className="story-period">Recent movement · as of {counts.generated_at?.slice(0, 7)} · updates monthly</span>
          <h3 className="story-act-title">{totalFresh.toLocaleString()} new papers in the last 12 months</h3>
          <div className="story-cards">
            {recent.slice(0, 6).map((r) => {
              const f = fieldById.get(r.branch);
              return (
                <button key={r.branch} className="story-card" onClick={() => onExploreBranch(r.branch)}>
                  <span className="story-card-dot" style={{ background: f?.color }} aria-hidden="true" />
                  <span className="story-card-name">{f?.en ?? r.branch}</span>
                  <span className="story-card-n">+{r.fresh} papers{r.rising ? ` · ${r.rising} rising ↗` : ""}</span>
                </button>
              );
            })}
          </div>
          <p className="story-src">Click a card to open that branch in the timeline, zoomed to the last two years.</p>
        </section>

        <footer className="story-foot">
          <a className="story-btn" href="#/explore">Explore all {papers.length.toLocaleString()} papers →</a>
          <p className="story-src">
            Landmark selection and narratives are labeled by provenance — see <a href="#/about">methodology</a>.
          </p>
        </footer>
      </main>
    </div>
  );
}
