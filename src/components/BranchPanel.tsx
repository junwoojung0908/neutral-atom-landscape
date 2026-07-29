import { branchPapers } from "../lib/branchPapers.ts";
import entitiesJson from "../../data/entities.json";
import type { Landmark } from "../lib/branchPapers.ts";
import { fieldById } from "../data/loader.ts";
import { displayTitle } from "../lib/format.ts";

function refHref(r: { type: string; value: string }): string {
  return r.type === "doi" ? `https://doi.org/${r.value}` : `https://arxiv.org/abs/${r.value}`;
}

interface Ent { id: string; byline: string; year: number; refs: { type: string; value: string }[] }
const entById = new Map((entitiesJson as Ent[]).map((e) => [e.id, e]));
const chipLabel = (e: Ent) => {
  const first = e.byline.split(" et al")[0].split(",")[0].trim();
  const surname2 = first.split(/\s+/).pop() ?? first;
  return `${surname2} ${e.year}`;
};
const arxivOf = (e: Ent) => e.refs.find((r) => r.type === "arxiv")?.value ?? null;

/** [[id]] 마크업 → 클릭 칩 (PaperPanel 열기 + 타임라인 하이라이트) */
function Narrative({ text, onOpenPaper }: { text: string; onOpenPaper: (arxivId: string) => void }) {
  const parts = text.split(/(\[\[\w+\]\])/g);
  return (
    <p className="detail-body">
      {parts.map((seg, i) => {
        const m = seg.match(/^\[\[(\w+)\]\]$/);
        if (!m) return <span key={i}>{seg}</span>;
        const e = entById.get(m[1]);
        if (!e) return <span key={i}>{seg}</span>;
        const ax = arxivOf(e);
        return (
          <button key={i} className="nar-chip" disabled={!ax} onClick={() => ax && onOpenPaper(ax)}>
            {chipLabel(e)}
          </button>
        );
      })}
    </p>
  );
}

interface Props {
  branchId: string | null;
  onClose: () => void;
  onOpenPaper: (arxivId: string) => void;
}

export default function BranchPanel({ branchId, onClose, onOpenPaper }: Props) {
  if (!branchId) return null;
  const d = branchPapers[branchId];
  const f = fieldById.get(branchId);
  if (!d) return null;

  return (
    <aside className="detail" aria-label="Branch details">
      <button className="detail-close" onClick={onClose} aria-label="Close">
        ×
      </button>

      <div className="detail-badges">
        <span className="badge" style={{ borderColor: f?.color, color: "var(--text)" }}>
          <span className="swatch" style={{ background: f?.color, marginRight: 5 }} aria-hidden="true" />
          가지
        </span>
        <span className="badge">{d.count.toLocaleString()} papers</span>
      </div>

      <h2 className="detail-title">{f?.en ?? branchId}</h2>
      <p className="detail-body" style={{ marginTop: 8 }}>{f?.blurb}</p>

      {f?.narrative && (
        <>
          <h3 className="detail-h">Narrative{" "}
            {f.narrative_provenance && (
              <span className={`badge nar-prov nar-${f.narrative_provenance}`}>
                {f.narrative_provenance === "ai-draft" ? "AI draft" : f.narrative_provenance}
              </span>
            )}
          </h3>
          <Narrative text={f.narrative} onOpenPaper={onOpenPaper} />
        </>
      )}

      {d.topCited && d.topCited.length > 0 && (
        <>
          <h3 className="detail-h">Where to start reading (top cited · auto-generated)</h3>
          <ul className="bp-list">
            {d.topCited.map((p) => (
              <li key={p.id} className="bp-paper">
                <a href={`https://arxiv.org/abs/${p.id}`} target="_blank" rel="noreferrer" className="bp-ptitle">
                  {displayTitle(p.title)}
                </a>
                <span className="bp-meta">{p.author} · {p.year} · cited {p.cited ?? 0}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h3 className="detail-h">Pivotal (landmarks {d.landmarks.length})</h3>
      {d.landmarks.length ? (
        <ul className="bp-list">
          {d.landmarks.map((l: Landmark) => (
            <li key={l.id} className="bp-landmark">
              <span className="bp-title-btn">{displayTitle(l.label)}</span>
              <span className="bp-meta">
                <span className="badge weight">w{l.weight}</span> {l.byline} · {l.venue} · {l.year}
              </span>
              <span className="bp-refs">
                {l.refs.map((r) => (
                  <a key={`${r.type}:${r.value}`} href={refHref(r)} target="_blank" rel="noreferrer">
                    {r.type}
                  </a>
                ))}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="bp-empty">None yet — landmarks for this branch are hand-curated.</p>
      )}

      <h3 className="detail-h">Extensions (latest {d.papers.length}{d.count > d.papers.length ? ` of ${d.count}` : ""})</h3>
      <ul className="bp-list">
        {d.papers.map((p) => (
          <li key={p.id} className="bp-paper">
            <a href={`https://arxiv.org/abs/${p.id}`} target="_blank" rel="noreferrer" className="bp-ptitle">
              {displayTitle(p.title)}
            </a>
            <span className="bp-meta">{p.author} · {p.year}</span>
          </li>
        ))}
      </ul>
      {d.count > d.papers.length && (
        <p className="bp-empty">…and {d.count - d.papers.length} more.</p>
      )}
    </aside>
  );
}
