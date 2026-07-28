import type { Entity, Ref } from "../data/schema.ts";
import { fieldById } from "../data/loader.ts";
import { displayTitle } from "../lib/format.ts";

function refHref(r: Ref): string {
  return r.type === "doi" ? `https://doi.org/${r.value}` : `https://arxiv.org/abs/${r.value}`;
}

interface Props {
  entity: Entity | null;
  onClose: () => void;
}

export default function DetailPanel({ entity, onClose }: Props) {
  if (!entity) return null;
  return (
    <aside className="detail" aria-label="노드 상세">
      <button className="detail-close" onClick={onClose} aria-label="닫기">
        ×
      </button>

      <div className="detail-badges">
        <span className="badge kind">{entity.kind}</span>
        <span className="badge weight">weight {entity.weight}</span>
        {entity.verified ? (
          <span className="badge verified">확인 {entity.verified}</span>
        ) : (
          <span className="badge unverified">미확인</span>
        )}
      </div>

      <h2 className="detail-title">{displayTitle(entity.label)}</h2>
      {entity.label_ko ? <p className="detail-ko">{entity.label_ko}</p> : null}

      <p className="detail-byline">
        {entity.byline}
        {entity.affiliation_note ? (
          <span className="detail-affil"> · {entity.affiliation_note}</span>
        ) : null}
      </p>
      <p className="detail-venue">
        {entity.venue} · {entity.year}
      </p>

      <div className="detail-fields">
        {entity.fields.map((fid) => {
          const f = fieldById.get(fid);
          return (
            <span
              key={fid}
              className="field-chip"
              style={{ borderColor: f?.color ?? "var(--neutral-edge)" }}
            >
              {f?.ko ?? fid}
            </span>
          );
        })}
      </div>

      {entity.thesis ? (
        <>
          <h3 className="detail-h">방향 (thesis)</h3>
          <p className="detail-body">{entity.thesis}</p>
        </>
      ) : null}

      {entity.weight_rationale ? (
        <>
          <h3 className="detail-h">비중 근거 (weight {entity.weight})</h3>
          <p className="detail-body">{entity.weight_rationale}</p>
        </>
      ) : null}

      <h3 className="detail-h">출처</h3>
      <ul className="detail-refs">
        {entity.refs.map((r) => (
          <li key={`${r.type}:${r.value}`}>
            <a href={refHref(r)} target="_blank" rel="noreferrer">
              {r.type === "doi" ? "DOI" : "arXiv"}: {r.value}
            </a>
          </li>
        ))}
      </ul>
    </aside>
  );
}
