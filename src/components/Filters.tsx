import type { Field } from "../data/schema.ts";
import type { KindFilter, UiState } from "../lib/urlState.ts";

interface Props {
  firstLevelFields: Field[];
  ui: UiState;
  update: (patch: Partial<UiState>) => void;
  counts: { shown: number; total: number };
}

const KINDS: { value: KindFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "work", label: "논문" },
  { value: "group", label: "그룹" },
];

export default function Filters({ firstLevelFields, ui, update, counts }: Props) {
  const toggleField = (id: string) => {
    const off = new Set(ui.off);
    if (off.has(id)) off.delete(id);
    else off.add(id);
    update({ off });
  };

  return (
    <div className="filters" aria-label="필터">
      <div className="filter-group">
        <label className="filter-label" htmlFor="search">
          검색
        </label>
        <input
          id="search"
          type="search"
          className="search"
          placeholder="제목 · 저자 · 방향"
          value={ui.q}
          onChange={(e) => update({ q: e.target.value })}
        />
      </div>

      <div className="filter-group">
        <span className="filter-label">종류</span>
        <div className="kind-row" role="radiogroup" aria-label="종류">
          {KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              role="radio"
              aria-checked={ui.kind === k.value}
              className={`kind-btn${ui.kind === k.value ? " on" : ""}`}
              onClick={() => update({ kind: k.value })}
            >
              {k.label}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-group">
        <label className="filter-label" htmlFor="weight">
          최소 비중: {ui.weightMin}
        </label>
        <input
          id="weight"
          type="range"
          min={1}
          max={5}
          step={1}
          value={ui.weightMin}
          onChange={(e) => update({ weightMin: Number(e.target.value) })}
        />
      </div>

      <div className="filter-group">
        <span className="filter-label">가지</span>
        <ul className="field-toggles">
          {firstLevelFields.map((f) => {
            const on = !ui.off.has(f.id);
            return (
              <li key={f.id}>
                <label className="field-toggle">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggleField(f.id)}
                  />
                  <span
                    className="swatch"
                    style={{ background: f.color }}
                    aria-hidden="true"
                  />
                  <span className={`field-name${on ? "" : " off"}`}>{f.ko}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>

      <p className="count">
        {counts.shown} / {counts.total} 노드 표시
      </p>
    </div>
  );
}
