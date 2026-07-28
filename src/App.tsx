import { useMemo } from "react";
import {
  entities,
  edges,
  firstLevelFields,
  firstLevelOf,
} from "./data/loader.ts";
import { orderAnchors, targetFor } from "./lib/layout.ts";
import type { LNode } from "./lib/model.ts";
import Landscape from "./components/Landscape.tsx";
import Filters from "./components/Filters.tsx";
import DetailPanel from "./components/DetailPanel.tsx";
import StreamGraph from "./components/StreamGraph.tsx";
import { useUiState } from "./lib/urlState.ts";
import "./App.css";

const ANCHOR_RADIUS = 270;
const HUB_RADIUS = 74;

export default function App() {
  const [ui, update] = useUiState();

  const anchors = useMemo(() => orderAnchors(firstLevelFields, ANCHOR_RADIUS), []);
  const anchorByField = useMemo(
    () => new Map(anchors.map((a) => [a.id, a])),
    [anchors],
  );

  const nodes = useMemo<LNode[]>(
    () =>
      entities.map((e) => {
        const fl = Array.from(new Set(e.fields.map(firstLevelOf)));
        return {
          entity: e,
          r: 5 + 3.2 * e.weight, // SPEC §3
          firstLevels: fl,
          target: targetFor(fl, anchorByField, HUB_RADIUS),
        };
      }),
    [anchorByField],
  );

  const visibleIds = useMemo(() => {
    const q = ui.q.trim().toLowerCase();
    const enabled = (fid: string) => !ui.off.has(fid);
    const ok = (e: (typeof entities)[number]) => {
      if (!e.fields.map(firstLevelOf).some(enabled)) return false;
      if (ui.kind !== "all" && e.kind !== ui.kind) return false;
      if (e.weight < ui.weightMin) return false;
      if (q) {
        const hay = `${e.label} ${e.byline} ${e.thesis} ${e.affiliation_note ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    };
    return new Set(entities.filter(ok).map((e) => e.id));
  }, [ui.q, ui.kind, ui.weightMin, ui.off]);

  const selected = useMemo(
    () => entities.find((e) => e.id === ui.sel) ?? null,
    [ui.sel],
  );

  return (
    <div className="app">
      <header className="topbar">
        <h1>중성원자 연구 지형도</h1>
        <p className="sub">노력이 몰린 곳과 방향의 연결 · M1 지형도</p>
      </header>

      <section className="survey-layer" aria-label="조사 층">
        <StreamGraph />
      </section>

      <div className="layer-divider" />

      <section className="perspective-layer" aria-label="관점 층">
        <span className="layer-tag">관점 층 · 주장</span>
      </section>

      <div className="main">
        <Filters
          firstLevelFields={firstLevelFields}
          ui={ui}
          update={update}
          counts={{ shown: visibleIds.size, total: entities.length }}
        />

        <div className="stage">
          <Landscape
            anchors={anchors}
            nodes={nodes}
            edges={edges}
            hubRadius={HUB_RADIUS}
            anchorRadius={ANCHOR_RADIUS}
            visibleIds={visibleIds}
            offFields={ui.off}
            selectedId={ui.sel}
            onSelect={(id) => update({ sel: id })}
          />
          <p className="footnote">
            색은 각 분야가 실제로 쓰는 레이저 선(파장)에서 따왔다. 적외선 대역(813·1013·1064 nm 등)은
            근사 표현이며, <strong>classical</strong> 은 실험 파장이 없어 무채색이다.
          </p>
        </div>

        <DetailPanel entity={selected} onClose={() => update({ sel: null })} />
      </div>
    </div>
  );
}
