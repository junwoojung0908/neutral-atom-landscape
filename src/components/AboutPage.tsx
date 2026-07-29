import { counts } from "../lib/survey.ts";
import { papers } from "../lib/timeline.ts";
import { fields } from "../data/loader.ts";

/** Methodology & limitations — every number auditable by the reader. */
export default function AboutPage() {
  const hot = papers.filter((p) => p.hot).length;
  return (
    <div className="about">
      <h2>About this map</h2>
      <p>
        This map is not a hand-picked list of papers. It measures a corpus defined by a{" "}
        <strong>published query</strong>. Every point where judgment enters is stated below.
      </p>

      <h3>Corpus</h3>
      <ul>
        <li>Source: arXiv API (quant-ph · physics.atom-ph, 2015–2026), query version <code>{counts.version}</code></li>
        <li><strong>Platform gate</strong>: tweezer/array phrases are admitted directly; bare “Rydberg” requires
          array/qubit/gate/simulation context (blocking vapor-cell sensing, molecular spectroscopy, bulk gases).
          Gate loss measured and audited at 14% of classified papers</li>
        <li>Scope: individually addressable neutral-atom arrays — full IN/OUT criteria in{" "}
          <a href="https://github.com/junwoojung0908/neutral-atom-landscape/blob/main/docs/scope.md" target="_blank" rel="noreferrer">docs/scope.md</a></li>
        <li>Size: {counts.corpus_total.toLocaleString()} papers; {counts.classified.toLocaleString()} classified,{" "}
          <strong>{(counts.unclassified_ratio * 100).toFixed(1)}% unclassified</strong> (matched no branch terms —
          shown, not hidden, as the grey band on the growth page)</li>
        <li>Citations: OpenAlex (updated {counts.generated_at}) · automatic monthly re-harvest</li>
      </ul>

      <h3>Importance (dot size · brightness · display order)</h3>
      <ul>
        <li>Base = absolute citations (size ∝ √citations, brightness ∝ log citations)</li>
        <li><strong>Recency boost</strong>: papers within 3 years that are in a major venue* or have ≥20 citations
          score <code>max(citations, citations/age × 4)</code> — so fresh impact is not buried. Boosted papers
          ({hot}) carry <strong>↗</strong></li>
        <li>*Major venue via DOI prefix: Nature family · Science · PNAS · Quantum · PRL · PRX · RMP</li>
        <li>Author shown on labels is the <strong>last author</strong> (a proxy for the corresponding author by AMO
          convention — not actual corresponding-author metadata)</li>
        <li>Reviews are hollow circles (OpenAlex type + title heuristic; type coverage is partial)</li>
      </ul>

      <h3>Branches and lanes</h3>
      <ul>
        <li>The 11 branches are an editorial taxonomy (title/abstract keyword matching). Multi-branch papers keep
          all memberships; lane placement uses the rarest branch</li>
        <li>Simulation is split into three view lanes (phases / dynamics / gauge-topology) —{" "}
          <strong>a keyword heuristic that can misclassify</strong>; an audit sample is published in the repository</li>
        <li>The five zoom-out groups are a display grouping only, not data</li>
      </ul>

      <h3>Known limitations (honest record)</h3>
      <ul>
        <li>~600 arXiv-only papers (no published DOI) have undercounted citations (preprint records)</li>
        <li>Research-group badges cover major groups only via last author (~13% of papers) — absence means
          uncurated, not a judgment</li>
        <li>One confirmed miss in a landmark recall check (Browaeys–Lahaye 2020 review; category filter suspected)</li>
        <li>The <code>software</code> branch is structurally undercounted: the corpus is restricted to the
          quant-ph and physics.atom-ph arXiv categories, so papers with a cs.* primary classification
          (much of the compilation/architecture literature) are not harvested</li>
        <li><code>readout</code> (~2%) is small but kept as a branch: an independent prerequisite of fault
          tolerance (non-destructive measurement, erasure detection) — an editorial decision</li>
        <li>The citation graph cannot distinguish support from rebuttal — only the red dashed lines (contests)
          are hand-curated</li>
        <li>Branch <strong>narratives</strong> are labeled per branch:{" "}
          {(["ai-draft", "edited", "author"] as const)
            .map((k) => `${fields.filter((f) => f.narrative && f.narrative_provenance === k).length} ${k}`)
            .join(" · ")}{" "}
          — provenance shown next to each narrative</li>
      </ul>

      <p className="about-foot">
        All data, code, and queries:{" "}
        <a href="https://github.com/junwoojung0908/neutral-atom-landscape" target="_blank" rel="noreferrer">github.com/junwoojung0908/neutral-atom-landscape</a>
      </p>
    </div>
  );
}
