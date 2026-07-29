import { useMemo } from "react";
import { papers, citeEdges } from "../lib/timeline.ts";
import { fieldById } from "../data/loader.ts";
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
  const { basedOn, extendedBy } = useMemo(() => {
    const basedOn = citeEdges.filter((e) => e.to === paperId).map((e) => byId.get(e.from)).filter((x): x is NonNullable<typeof x> => !!x);
    const extendedBy = citeEdges.filter((e) => e.from === paperId).map((e) => byId.get(e.to)).filter((x): x is NonNullable<typeof x> => !!x);
    const byCited = (a: { cited: number }, b: { cited: number }) => b.cited - a.cited;
    return { basedOn: basedOn.sort(byCited).slice(0, 20), extendedBy: extendedBy.sort(byCited).slice(0, 20) };
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
      <h3 className="detail-h">Builds on (references, {basedOn.length} in corpus)</h3>
      {list(basedOn)}
      <h3 className="detail-h">Extended by (citations, {extendedBy.length} in corpus)</h3>
      {list(extendedBy)}
    </aside>
  );
}
