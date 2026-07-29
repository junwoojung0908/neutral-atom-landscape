import { useMemo, useState } from "react";
import { counts } from "../lib/survey.ts";
import { firstLevelFields } from "../data/loader.ts";

// 조사 층: 연도별 가지 스택. mode="share"(기본)=연도별 100% 정규화(구성비 이동),
// mode="abs"=절대량(전체 성장). 미분류 회색 밴드는 두 모드 모두 표시.
const W = 960;
const H = 220;
const PAD = { t: 14, r: 16, b: 22, l: 16 };
const UNCLASSIFIED = "__unclassified__";

export default function StreamGraph() {
  const [mode, setMode] = useState<"share" | "abs">("share");
  const years = counts.years;

  // 스택 순서: 9개 가지(고정) + 미분류(회색, 맨 위)
  const series = useMemo(
    () => [
      ...firstLevelFields.map((f) => ({ id: f.id, color: f.color })),
      { id: UNCLASSIFIED, color: "var(--neutral-edge)" },
    ],
    [],
  );

  const valueOf = (id: string, yr: number) =>
    id === UNCLASSIFIED
      ? counts.unclassified_by_year[String(yr)] ?? 0
      : counts.shares[String(yr)]?.[id] ?? 0;

  const bands = useMemo(() => {
    if (years.length < 2) return null;
    const x0 = PAD.l, x1 = W - PAD.r, y0 = H - PAD.b, y1 = PAD.t;
    const xOf = (y: number) => x0 + ((y - years[0]) / (years[years.length - 1] - years[0])) * (x1 - x0);
    const yOf = (s: number) => y0 - s * (y0 - y1);

    // share: 분모=그해 합(구성비) / abs: 분모=최대 연도 합(절대량)
    const totalOf = (yr: number) => series.reduce((s, se) => s + valueOf(se.id, yr), 0);
    const maxTotal = Math.max(...years.map(totalOf), 1);
    const denom = (yr: number) => (mode === "share" ? totalOf(yr) || 1 : maxTotal);

    return series.map((se, idx) => {
      const below = (yr: number) => series.slice(0, idx).reduce((s, x) => s + valueOf(x.id, yr), 0) / denom(yr);
      const top: string[] = [];
      const bot: string[] = [];
      years.forEach((yr) => {
        const b = below(yr);
        const t = b + valueOf(se.id, yr) / denom(yr);
        top.push(`${xOf(yr).toFixed(1)},${yOf(t).toFixed(1)}`);
      });
      years.slice().reverse().forEach((yr) => bot.push(`${xOf(yr).toFixed(1)},${yOf(below(yr)).toFixed(1)}`));
      return { id: se.id, color: se.color, points: [...top, ...bot].join(" ") };
    });
  }, [years, series, mode]);

  const rate = (id: string) => (counts.corpus_total ? ((counts.branch_hits[id] ?? 0) / counts.corpus_total) * 100 : 0);

  return (
    <div className="stream">
      <div className="stream-head">
        <span className="stream-tag">조사 층 · 측정</span>
        <span className="kind-row">
          <button className={`kind-btn${mode === "share" ? " on" : ""}`} onClick={() => setMode("share")}>구성비</button>
          <button className={`kind-btn${mode === "abs" ? " on" : ""}`} onClick={() => setMode("abs")}>절대량</button>
        </span>
        <span>질의 <code>{counts.version || "(미설정)"}</code></span>
        <span>{counts.corpus_total.toLocaleString()}편</span>
        {counts.corpus_total > 0 && (
          <span className={counts.unclassified_ratio > 0.15 ? "u-hole" : ""}>
            미분류 {(counts.unclassified_ratio * 100).toFixed(1)}%
          </span>
        )}
        {counts.corpus_total > 0 && (
          <span className="stream-hits">
            {firstLevelFields.map((f) => (
              <span key={f.id} className="hit">
                <span className="swatch" style={{ background: f.color }} aria-hidden="true" />
                {f.id} {rate(f.id).toFixed(0)}%
              </span>
            ))}
          </span>
        )}
      </div>

      {bands ? (
        <svg className="stream-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="연도별 가지 구성비">
          {bands.map((b) => (
            <polygon
              key={b.id}
              points={b.points}
              fill={b.color}
              fillOpacity={b.id === UNCLASSIFIED ? 0.35 : 0.82}
            />
          ))}
        </svg>
      ) : (
        <div className="stream-empty">
          아직 코퍼스를 수집하지 않았습니다. <code>data/query.json</code> 을 채운 뒤{" "}
          <code>npm run fetch-corpus</code> → <code>npm run count</code> → <code>npm run taxonomy</code>.
        </div>
      )}

      <p className="stream-note">
        {mode === "share" ? <>연도별 <strong>100% 정규화</strong> — 구성비가 언제 이동했는지 보입니다.</> : <>연도별 <strong>절대량</strong> — 분야 전체의 성장이 보입니다.</>} 여러 가지에 걸친
        논문은 <strong>1/k 분수 배분</strong>. 상단 히트율은 raw membership이라 합이 100%를 넘습니다.{" "}
        <span className="u-legend">회색</span>은 어느 가지에도 안 걸린 미분류입니다.
      </p>
    </div>
  );
}
