import { useEffect, useState } from "react";
import PaperPanel from "./components/PaperPanel.tsx";
import TimelineZoom from "./components/TimelineZoom.tsx";
import BranchPanel from "./components/BranchPanel.tsx";
import StreamGraph from "./components/StreamGraph.tsx";
import AboutPage from "./components/AboutPage.tsx";
import { useUiState } from "./lib/urlState.ts";
import "./App.css";

export default function App() {
  const [ui, update] = useUiState();
  const selPaper = ui.sel; // 선택 논문은 URL(sel=)로 공유 가능
  const setSelPaper = (id: string | null) => update({ sel: id });
  const pageOf = () => (window.location.hash === "#growth" ? "growth" : window.location.hash === "#about" ? "about" : "timeline");
  const [page, setPage] = useState(pageOf);
  useEffect(() => {
    const on = () => setPage(pageOf());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  if (page === "about") {
    return (
      <div className="app app-scroll">
        <header className="topbar">
          <h1>이 지도에 대하여</h1>
          <a className="nav-link" href="#">← 논문 타임라인</a>
        </header>
        <AboutPage />
      </div>
    );
  }

  if (page === "growth") {
    return (
      <div className="app app-scroll">
        <header className="topbar">
          <h1>연도별 분야 규모</h1>
          <p className="sub">절대량 스택 · 1/k 분수 배분</p>
          <a className="nav-link" href="#">← 논문 타임라인</a>
        </header>
        <section className="survey-layer" aria-label="조사 층">
          <StreamGraph />
        </section>
      </div>
    );
  }

  return (
    <div className="app app-fill">
      <header className="topbar">
        <h1>중성원자 연구 지형도</h1>
        <p className="sub">논문 연결 구조로 보는 분야의 방향 · 코퍼스는 arXiv 질의로 정의</p>
        <span className="nav-links">
          <a className="nav-link" href="#growth">연도별 규모</a>
          <a className="nav-link" href="#about">방법론</a>
        </span>
      </header>

      <div className="stage2">
        <div className="tlz-wrap">
          <TimelineZoom
            onOpen={(p) => { setSelPaper(p.id); update({ branch: null }); }}
            onSelectBranch={(id) => { update({ branch: id }); setSelPaper(null); }}
            selectedId={selPaper}
          />
        </div>
        {selPaper ? (
          <PaperPanel paperId={selPaper} onNavigate={setSelPaper} onClose={() => setSelPaper(null)} />
        ) : ui.branch ? (
          <BranchPanel branchId={ui.branch} onClose={() => update({ branch: null })} />
        ) : null}
      </div>
    </div>
  );
}
