import { useEffect, useMemo, useState } from "react";
import PaperPanel from "./components/PaperPanel.tsx";
import TimelineZoom from "./components/TimelineZoom.tsx";
import BranchPanel from "./components/BranchPanel.tsx";
import StreamGraph from "./components/StreamGraph.tsx";
import AboutPage from "./components/AboutPage.tsx";
import StoryPage from "./components/StoryPage.tsx";
import TourBar from "./components/TourBar.tsx";
import { useUiState } from "./lib/urlState.ts";
import { storyReady } from "./data/story.ts";
import { tourOrder, arxivOf } from "./lib/entities.ts";
import "./App.css";

type Page = "story" | "explore" | "growth" | "about";

// 해시 라우팅: #/ = Story, #/explore = 데이터 모드(타임라인). 구 해시(#growth 등)도 유지.
// Story 는 PLACEHOLDER(테제·막 제목)가 남아 있는 동안 기본 라우트가 되지 않는다.
const EXPLORE_KEYS = ["v", "sel", "br", "tq", "g", "tour", "fl", "fr"];
function defaultPage(): Page {
  const p = new URLSearchParams(window.location.search);
  const hasExploreState = EXPLORE_KEYS.some((k) => p.has(k));
  return storyReady && !hasExploreState ? "story" : "explore";
}
function pageOf(): Page {
  const h = window.location.hash;
  if (h === "#growth" || h === "#/growth") return "growth";
  if (h === "#about" || h === "#/about") return "about";
  if (h === "#/story") return "story"; // 명시 진입은 PLACEHOLDER 여부와 무관 (pending 표시로 렌더)
  if (h === "#/explore") return "explore";
  return defaultPage();
}

export default function App() {
  const [ui, update] = useUiState();
  const selPaper = ui.sel; // 선택 논문은 URL(sel=)로 공유 가능
  const setSelPaper = (id: string | null) => update({ sel: id });
  const [page, setPage] = useState<Page>(pageOf);
  useEffect(() => {
    const on = () => setPage(pageOf());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  // Start-here 가이드 (정거장 = entities 연도순, ?tour=<1-based> 로 공유 가능)
  const tourIds = useMemo(() => tourOrder.map((e) => arxivOf(e)).filter((x): x is string => !!x), []);
  const [tourIdx, setTourIdx] = useState<number | null>(() => {
    const t = Number(new URLSearchParams(window.location.search).get("tour"));
    return Number.isInteger(t) && t >= 1 ? Math.min(t, tourIds.length) - 1 : null;
  });
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (tourIdx == null) p.delete("tour");
    else p.set("tour", String(tourIdx + 1));
    const qs = p.toString();
    window.history.replaceState(null, "", (qs ? `${window.location.pathname}?${qs}` : window.location.pathname) + window.location.hash);
  }, [tourIdx]);
  const tourActive = tourIdx != null && page === "explore";
  useEffect(() => {
    if (!tourActive) return;
    const on = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setTourIdx((i) => Math.min((i ?? 0) + 1, tourIds.length - 1));
      else if (e.key === "ArrowLeft") setTourIdx((i) => Math.max((i ?? 0) - 1, 0));
      else if (e.key === "Escape") setTourIdx(null);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [tourActive, tourIds.length]);

  // Story → explore 전환 (replaceState 는 hashchange 를 안 쏘므로 page 를 직접 세팅)
  const goExplore = (params: Record<string, string>) => {
    const p = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(params)) p.set(k, v);
    const qs = p.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}#/explore`);
    setPage("explore");
  };

  if (page === "story") {
    return (
      <StoryPage
        onStartTour={() => { setTourIdx(0); goExplore({ tour: "1" }); }}
        onOpenPaper={(ax) => { update({ sel: ax, branch: null }); goExplore({}); }}
        onExploreBranch={(b) => goExplore({ fl: b, fr: "1" })}
      />
    );
  }

  if (page === "about") {
    return (
      <div className="app app-scroll">
        <header className="topbar">
          <h1>About this map</h1>
          <a className="nav-link" href="#/">← Story</a>
          <a className="nav-link" href="#/explore">Paper timeline</a>
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
          <a className="nav-link" href="#/">← Story</a>
          <a className="nav-link" href="#/explore">Paper timeline</a>
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
          <a className="nav-link" href="#/story">Story</a>
          <a className="nav-link" href="#/growth">Growth by year</a>
          <a className="nav-link" href="#/about">Methodology</a>
        </span>
      </header>

      <div className="stage2">
        <div className="tlz-wrap">
          <TimelineZoom
            onOpen={(p) => { setSelPaper(p.id); update({ branch: null }); }}
            onSelectBranch={(id) => { update({ branch: id }); setSelPaper(null); }}
            selectedId={selPaper}
            tour={tourActive ? { ids: tourIds, idx: tourIdx! } : null}
          />
        </div>
        {selPaper ? (
          <PaperPanel paperId={selPaper} onNavigate={setSelPaper} onClose={() => setSelPaper(null)} />
        ) : ui.branch ? (
          <BranchPanel branchId={ui.branch} onClose={() => update({ branch: null })} onOpenPaper={(ax) => setSelPaper(ax)} />
        ) : null}
        {tourActive && (
          <TourBar
            idx={tourIdx!}
            onPrev={() => setTourIdx((i) => Math.max((i ?? 0) - 1, 0))}
            onNext={() => setTourIdx((i) => Math.min((i ?? 0) + 1, tourIds.length - 1))}
            onExit={() => setTourIdx(null)}
            onOpenPaper={(ax) => setSelPaper(ax)}
          />
        )}
      </div>
    </div>
  );
}
