import { entById, chipLabel, arxivOf } from "../lib/entities.ts";

/** [[id]] 마크업 → 클릭 칩 (PaperPanel 열기 + 타임라인 하이라이트). 문단 태그는 호출부가 감싼다. */
export default function ChipText({ text, onOpenPaper }: { text: string; onOpenPaper: (arxivId: string) => void }) {
  const parts = text.split(/(\[\[\w+\]\])/g);
  return (
    <>
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
    </>
  );
}
