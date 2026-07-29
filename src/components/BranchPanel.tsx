import { branchPapers } from "../lib/branchPapers.ts";
import type { Landmark } from "../lib/branchPapers.ts";
import { fieldById } from "../data/loader.ts";
import { displayTitle } from "../lib/format.ts";

function refHref(r: { type: string; value: string }): string {
  return r.type === "doi" ? `https://doi.org/${r.value}` : `https://arxiv.org/abs/${r.value}`;
}

interface Props {
  branchId: string | null;
  onClose: () => void;
}

export default function BranchPanel({ branchId, onClose }: Props) {
  if (!branchId) return null;
  const d = branchPapers[branchId];
  const f = fieldById.get(branchId);
  if (!d) return null;

  return (
    <aside className="detail" aria-label="분야 상세">
      <button className="detail-close" onClick={onClose} aria-label="닫기">
        ×
      </button>

      <div className="detail-badges">
        <span className="badge" style={{ borderColor: f?.color, color: "var(--text)" }}>
          <span className="swatch" style={{ background: f?.color, marginRight: 5 }} aria-hidden="true" />
          가지
        </span>
        <span className="badge">{d.count.toLocaleString()}편 (코퍼스)</span>
      </div>

      <h2 className="detail-title">{f?.ko ?? branchId}</h2>
      <p className="detail-ko">{f?.en}</p>
      <p className="detail-body" style={{ marginTop: 8 }}>{f?.blurb}</p>

      {f?.narrative && (
        <>
          <h3 className="detail-h">서사</h3>
          <p className="detail-body">{f.narrative}</p>
        </>
      )}

      {d.topCited && d.topCited.length > 0 && (
        <>
          <h3 className="detail-h">읽기 시작점 (인용 상위 · 자동 생성)</h3>
          <ul className="bp-list">
            {d.topCited.map((p) => (
              <li key={p.id} className="bp-paper">
                <a href={`https://arxiv.org/abs/${p.id}`} target="_blank" rel="noreferrer" className="bp-ptitle">
                  {displayTitle(p.title)}
                </a>
                <span className="bp-meta">{p.author} · {p.year} · 인용 {p.cited ?? 0}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h3 className="detail-h">중추 (랜드마크 {d.landmarks.length})</h3>
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
        <p className="bp-empty">아직 없음 — 이 가지의 중추 논문은 손으로 채운다.</p>
      )}

      <h3 className="detail-h">확장 (코퍼스 최근 {d.papers.length}{d.count > d.papers.length ? ` / 총 ${d.count}` : ""})</h3>
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
        <p className="bp-empty">…외 {d.count - d.papers.length}편 (인용수 붙이면 중요도순 정렬 예정)</p>
      )}
    </aside>
  );
}
