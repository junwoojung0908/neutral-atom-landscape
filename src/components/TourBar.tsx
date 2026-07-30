import { useRef } from "react";
import { tourOrder, narrativeExcerpt, arxivOf } from "../lib/entities.ts";
import { fieldById } from "../data/loader.ts";
import { displayTitle } from "../lib/format.ts";
import ChipText from "./ChipText.tsx";

interface Props {
  idx: number;
  onPrev: () => void;
  onNext: () => void;
  onExit: () => void;
  onOpenPaper: (arxivId: string) => void;
}

/** Start-here 가이드 캡션 바 — 정거장 캡션은 서사에서 [[id]] 문장을 그대로 발췌(새 문장 없음). */
export default function TourBar({ idx, onPrev, onNext, onExit, onOpenPaper }: Props) {
  const ent = tourOrder[idx];
  const total = tourOrder.length;
  const ex = ent ? narrativeExcerpt(ent.id) : null;
  const touch = useRef<number | null>(null);
  if (!ent) return null;
  const ax = arxivOf(ent);

  return (
    <div
      className="tourbar"
      role="dialog"
      aria-label={`Guided reading path, stop ${idx + 1} of ${total}`}
      onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touch.current == null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        touch.current = null;
        if (dx < -40 && idx < total - 1) onNext();
        else if (dx > 40 && idx > 0) onPrev();
      }}
    >
      <div className="tourbar-head">
        <span className="tourbar-tag">Start here · {idx + 1}/{total} · {ent.year}</span>
        <button className="detail-close tourbar-close" onClick={onExit} aria-label="Exit guided path">×</button>
      </div>
      <button className="tourbar-title" onClick={() => ax && onOpenPaper(ax)} disabled={!ax}>
        {displayTitle(ent.label)}
      </button>
      <span className="tourbar-meta">{ent.byline} · {ent.venue}</span>
      {ex && (
        <p className="tourbar-cap">
          <ChipText text={ex.text} onOpenPaper={onOpenPaper} />{" "}
          <span className="story-src">— {fieldById.get(ex.branch)?.en ?? ex.branch} narrative</span>
        </p>
      )}
      <div className="tourbar-nav">
        <button className="tlz-reset" onClick={onPrev} disabled={idx === 0} aria-label="Previous paper">‹ Prev</button>
        <button className="tlz-reset" onClick={onNext} disabled={idx === total - 1} aria-label="Next paper">Next ›</button>
        <span className="tourbar-hint">←/→ keys · swipe on mobile</span>
      </div>
    </div>
  );
}
