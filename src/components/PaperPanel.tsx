import { useMemo } from "react";
import { papers, citeEdges } from "../lib/timeline.ts";
import { fieldById, firstLevelOf } from "../data/loader.ts";
import { displayTitle } from "../lib/format.ts";
import groupsJson from "../../data/groups.json";

const groupLabel = new Map((groupsJson as { id: string; label: string }[]).map((g) => [g.id, g.label]));
const byId = new Map(papers.map((p) => [p.id, p]));

interface Props {
  paperId: string;
  onNavigate: (id: string) => void;
  onClose: () => void;
}

/** 점 클릭 시: 논문 상세 + 코퍼스 내부 인용 관계(딛고 선 것 / 확장한 것). 항해의 핵심. */
export default function PaperPanel({ paperId, onNavigate, onClose }: Props) {
  const p = byId.get(paperId);
  const { basedOn, extendedBy, impact } = useMemo(() => {
    const basedOn = citeEdges.filter((e) => e.to === paperId).map((e) => byId.get(e.from)).filter((x): x is NonNullable<typeof x> => !!x);
    const citers = citeEdges.filter((e) => e.from === paperId).map((e) => byId.get(e.to)).filter((x): x is NonNullable<typeof x> => !!x);
    const byCited = (a: { cited: number }, b: { cited: number }) => b.cited - a.cited;
    // 영향 요약: 코퍼스 내부 피인용을 가지별(1/k 분수 배분)·연도(중앙값)로 집계
    let impact: { n: number; rows: [string, number][]; median: number } | null = null;
    if (citers.length >= 3) {
      const byBranch = new Map<string, number>();
      for (const c of citers) {
        const k = 1 / Math.max(c.fields.length, 1);
        for (const f of c.fields) {
          const b = firstLevelOf(f);
          byBranch.set(b, (byBranch.get(b) ?? 0) + k);
        }
      }
      const rows = [...byBranch.entries()].sort((a, b) => b[1] - a[1]);
      const years = citers.map((c) => c.year).sort((a, b) => a - b);
      impact = { n: citers.length, rows, median: years[Math.floor(years.length / 2)] };
    }
    return { basedOn: basedOn.sort(byCited).slice(0, 20), extendedBy: citers.slice().sort(byCited).slice(0, 20), impact };
  }, [paperId]);
  if (!p) return null;

  const list = (items: typeof basedOn) => (
    <ul className="bp-list">
      {items.map((x) => (
        <li key={x.id} className="bp-paper">
          <button className="bp-title-btn pp-nav" onClick={() => onNavigate(x.id)}>
            {displayTitle(x.title)}
          </button>
          <span className="bp-meta">{x.author} · {x.year} · cited {x.cited}</span>
        </li>
      ))}
      {items.length === 0 && <li className="bp-empty">none within the corpus</li>}
    </ul>
  );

  return (
    <aside className="detail" aria-label="Paper details">
      <button className="detail-close" onClick={onClose} aria-label="Close">×</button>
      <div className="detail-badges">
        {p.review && <span className="badge">Review</span>}
        <span className="badge weight">cited {p.cited}</span>
        {p.group && <span className="badge">{groupLabel.get(p.group) ?? p.group}</span>}
      </div>
      <h2 className="detail-title">{displayTitle(p.title)}</h2>
      <p className="detail-byline">{p.author} · {p.year}{p.pi ? <span className="detail-affil"> · corresponding (last author): {p.pi}</span> : null}</p>
      <div className="detail-fields">
        {p.fields.map((f) => (
          <span key={f} className="field-chip" style={{ borderColor: fieldById.get(f)?.color }}>
            {fieldById.get(f)?.en ?? f}
          </span>
        ))}
      </div>
      <p>
        <a className="pp-arxiv" href={`https://arxiv.org/abs/${p.id}`} target="_blank" rel="noreferrer">
          arXiv:{p.id} ↗
        </a>
      </p>
      {impact && (
        <div className="pp-impact">
          <p className="pp-impact-line">
            Cited by <strong>{impact.n}</strong> in this corpus — mostly{" "}
            <strong>{fieldById.get(impact.rows[0][0])?.en ?? impact.rows[0][0]}</strong>, after {impact.median}
          </p>
          <div className="pp-bars" aria-label="Citing papers by branch">
            {impact.rows.slice(0, 5).map(([b, v]) => (
              <div key={b} className="pp-bar-row">
                <span className="pp-bar-label">{fieldById.get(b)?.en ?? b}</span>
                <span className="pp-bar-track">
                  <span className="pp-bar" style={{ width: `${(v / impact.rows[0][1]) * 100}%`, background: fieldById.get(b)?.color }} />
                </span>
                <span className="pp-bar-n">{Math.round(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <h3 className="detail-h">Builds on (references, {basedOn.length} in corpus)</h3>
      {list(basedOn)}
      <h3 className="detail-h">Extended by (citations, {extendedBy.length} in corpus)</h3>
      {list(extendedBy)}
    </aside>
  );
}
