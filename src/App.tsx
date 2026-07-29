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
          <h1>About this map</h1>
          <a className="nav-link" href="#">← Paper timeline</a>
        </header>
        <AboutPage />
      </div>
    );
  }

  if (page === "growth") {
    return (
      <div className="app app-scroll">
        <header className="topbar">
          <h1>Branch growth by year</h1>
          <p className="sub">Stacked counts · fractional 1/k allocation</p>
          <a className="nav-link" href="#">← Paper timeline</a>
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
        <h1>Neutral-Atom Research Landscape</h1>
        <p className="sub">Field directions through citation structure · corpus defined by an arXiv query</p>
        <span className="nav-links">
          <a className="nav-link" href="#growth">Growth by year</a>
          <a className="nav-link" href="#about">Methodology</a>
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
          <BranchPanel branchId={ui.branch} onClose={() => update({ branch: null })} onOpenPaper={(ax) => setSelPaper(ax)} />
        ) : null}
      </div>
    </div>
  );
}
