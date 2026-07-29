import TimelineZoom from "./components/TimelineZoom.tsx";
import BranchPanel from "./components/BranchPanel.tsx";
import StreamGraph from "./components/StreamGraph.tsx";
import { useUiState } from "./lib/urlState.ts";
import "./App.css";

export default function App() {
  const [ui, update] = useUiState();

  return (
    <div className="app">
      <header className="topbar">
        <h1>중성원자 연구 지형도</h1>
        <p className="sub">논문 연결 구조로 보는 분야의 방향 · 코퍼스는 arXiv 질의로 정의</p>
      </header>

      {/* 주인공: 논문 타임라인 (연결 구조) */}
      <div className="stage2">
        <div className="tlz-wrap">
          <TimelineZoom
            onOpen={(p) => window.open(`https://arxiv.org/abs/${p.id}`, "_blank", "noopener")}
            onSelectBranch={(id) => update({ branch: id })}
          />
        </div>
        {ui.branch && <BranchPanel branchId={ui.branch} onClose={() => update({ branch: null })} />}
      </div>

      <div className="layer-divider" />

      {/* 보조: 연도별 분야 규모 (절대량) */}
      <section className="survey-layer" aria-label="조사 층">
        <StreamGraph />
      </section>
    </div>
  );
}
