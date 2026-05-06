import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDrag,
  type KeyboardEvent as ReactKb,
  type MouseEvent as ReactMouse,
  type ReactNode,
  type WheelEvent as ReactWheel,
} from "react";
import "./styles/global.css";
import { enrichRsidsHybrid } from "./lib/enrichment/myvariant";
import { buildRawBundle, buildFullBundle } from "./lib/export/bundles";
import { mapQcToSourceSlice } from "./lib/export/mapQc";
import { analyzeGenome } from "./lib/interpret/analyze";
import { loadKb } from "./lib/kb/loadKb";
import type {
  AnalyzeResult,
  Finding,
  HaplotypeCard,
  QcReport,
  Sentiment,
} from "./lib/types";
import { runParseWorker } from "./lib/workerParse";
import { buildClinicianBriefMd } from "./lib/clinicianBrief";
import { useAppStore } from "./state/useAppStore";

// ───────── small utilities ─────────

function downloadJson(filename: string, obj: unknown) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function downloadText(filename: string, text: string, type = "text/plain") {
  const blob = new Blob([text], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function sentimentKey(s: Sentiment): "good" | "watch" | "action" | "neutral" {
  if (s === "positive") return "good";
  if (s === "watch") return "watch";
  if (s === "action_needed") return "action";
  return "neutral";
}

function sentimentColorVar(s: Sentiment) {
  const key = sentimentKey(s);
  if (key === "good") return "var(--good)";
  if (key === "watch") return "var(--watch)";
  if (key === "action") return "var(--action)";
  return "var(--neutral)";
}

function confidenceKey(
  label: string,
): "high" | "moderate" | "low" | "emerging" {
  const l = label.toLowerCase();
  if (l.startsWith("high")) return "high";
  if (l.startsWith("mod")) return "moderate";
  if (l.startsWith("low")) return "low";
  return "emerging";
}

function uniqRs(ids: string[]) {
  return [...new Set(ids)];
}

// ───────── icons ─────────

function Icon({
  d,
  size = 18,
  stroke = 1.6,
}: {
  d: string;
  size?: number;
  stroke?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  search:
    "M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm10 2-4.35-4.35",
  sun: "M12 4V2M12 22v-2M4.93 4.93 3.51 3.51M20.49 20.49l-1.42-1.42M2 12h2M20 12h2M4.93 19.07 3.51 20.49M20.49 3.51l-1.42 1.42M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  moon: "M21 13.5A9 9 0 1 1 10.5 3a7 7 0 0 0 10.5 10.5Z",
  printer:
    "M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z",
  lock: "M5 11h14v10H5zM8 11V8a4 4 0 0 1 8 0v3",
  arrowRight: "M5 12h14M13 5l7 7-7 7",
  upload:
    "M12 16V4M7 9l5-5 5 5M5 20h14",
  close: "M18 6 6 18M6 6l12 12",
  external: "M14 4h6v6M10 14 21 3M9 4H4v16h16v-5",
  spark: "M12 2v6M12 16v6M2 12h6M16 12h6M5 5l4 4M15 15l4 4M5 19l4-4M15 9l4-4",
};

// ───────── confidence meter ─────────

function ConfidenceMeter({
  label,
  percent,
  size = "md",
}: {
  label: string;
  percent: number;
  size?: "sm" | "md";
}) {
  const cls = confidenceKey(label);
  const safe = Number.isFinite(percent) ? percent : 50;
  const pct = Math.max(8, Math.min(98, Math.round(safe)));
  return (
    <span
      className={`meter meter--${cls}`}
      title={`${label} confidence · ${pct}%`}
      aria-label={`Confidence ${label}, ${pct} percent`}
    >
      <span className="meter__bar" style={{ width: size === "sm" ? 44 : 64 }}>
        <span className="meter__fill" style={{ width: `${pct}%` }} />
      </span>
      <span className="meter__label">{label}</span>
      {size === "md" && <span className="meter__pct">{pct}%</span>}
    </span>
  );
}

function SentimentChip({
  sentiment,
  children,
}: {
  sentiment: Sentiment;
  children: ReactNode;
}) {
  const k = sentimentKey(sentiment);
  return <span className={`chip chip--${k}`}><span className="dot" />{children}</span>;
}

function SectionHeader({
  eyebrow,
  title,
  sub,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
}) {
  return (
    <div>
      <div className="eyebrow">{eyebrow}</div>
      <h2 className="section-title">{title}</h2>
      {sub && <p className="section-sub">{sub}</p>}
    </div>
  );
}

// ───────── topbar / privacy chip ─────────

function Topbar() {
  const dark = useAppStore((s) => s.dark);
  const phase = useAppStore((s) => s.phase);
  const setPaletteOpen = useAppStore((s) => s.setPaletteOpen);

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand__mark" aria-hidden />
        Marker
        <span className="brand__sub">Local genome reading</span>
      </div>
      <div className="top-actions">
        <span className="privacy-pill">
          <span className="privacy-pill__dot" aria-hidden />
          Stays on this device
        </span>
        {phase === "report" && (
          <button
            type="button"
            className="icon-btn no-print"
            aria-label="Search findings (⌘K)"
            title="Search (⌘K)"
            onClick={() => setPaletteOpen(true)}
          >
            <Icon d={ICONS.search} />
          </button>
        )}
        {phase === "report" && (
          <button
            type="button"
            className="icon-btn no-print"
            aria-label="Print or save as PDF"
            title="Print / PDF"
            onClick={() => window.print()}
          >
            <Icon d={ICONS.printer} />
          </button>
        )}
        <button
          type="button"
          className="icon-btn"
          aria-label={dark ? "Light mode" : "Dark mode"}
          title={dark ? "Light mode (⇧⌘D)" : "Dark mode (⇧⌘D)"}
          onClick={() => useAppStore.getState().toggleDark()}
        >
          <Icon d={dark ? ICONS.sun : ICONS.moon} />
        </button>
      </div>
    </header>
  );
}

function PrivacyChipFooter() {
  return (
    <div className="privacy-chip no-print" role="status" aria-live="polite">
      <Icon d={ICONS.lock} size={14} />
      <span>
        <strong>Local-only.</strong> Your file never leaves the browser.
      </span>
    </div>
  );
}

// ───────── hero (idle) ─────────

function Hero({ ingest }: { ingest: (text: string) => Promise<void> }) {
  return (
    <section className="hero fade-up">
      <div className="hero__copy">
        <span className="eyebrow">Local genome reading · v0.4</span>
        <h1 className="editorial-h1">
          Your genome,
          <br />
          <em>read carefully.</em>
        </h1>
        <p className="lede">
          Upload a 23andMe-style raw genotype file. Every interpretation runs
          on your machine — calmly, slowly, with the confidence behind each
          call shown in plain sight.
        </p>
        <div className="hero__pillars">
          <span className="pill">
            <span className="pill__dot" /> Parsed in a Web Worker
          </span>
          <span className="pill">
            <span className="pill__dot" /> Curated panel · alcohol, APOE,
            CYP2C19, HFE, F5, F2, MCM6, SLCO1B1, VKORC1, CYP1A2…
          </span>
          <span className="pill">
            <span className="pill__dot" /> Optional rsID-only enrichment
          </span>
        </div>
      </div>
      <DropzoneCard ingest={ingest} />
    </section>
  );
}

function DropzoneCard({ ingest }: { ingest: (text: string) => Promise<void> }) {
  const inputId = "ga-genotype-file";
  const [filename, setFilename] = useState<string | null>(null);

  const openFile = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    setFilename(f.name);
    const text = await f.text();
    await ingest(text);
  };

  const onDrop = (e: ReactDrag<HTMLLabelElement>) => {
    e.preventDefault();
    e.currentTarget.classList.remove("drag");
    const f = e.dataTransfer.files[0];
    if (f) {
      setFilename(f.name);
      void f.text().then((t) => ingest(t));
    }
  };

  return (
    <div>
      <label
        htmlFor={inputId}
        className="dropzone no-print"
        tabIndex={0}
        aria-label="Drop a 23andMe-style genotype file here, or click to browse"
        onDragOver={(e) => {
          e.preventDefault();
          e.currentTarget.classList.add("drag");
        }}
        onDragLeave={(e) => e.currentTarget.classList.remove("drag")}
        onDrop={onDrop}
      >
        <span className="eyebrow">Step one</span>
        <span className="dropzone__title">Drop or browse a genotype TXT</span>
        <span className="dropzone__hint">
          23andMe / Ancestry-style tab-separated file with{" "}
          <span className="mono">rsid · chromosome · position · genotype</span>.
          Up to ~700k rows.
        </span>
        <span className="dropzone__cta">
          <Icon d={ICONS.upload} size={14} />
          Choose file
        </span>
        {filename && (
          <span className="dropzone__filebadge" aria-live="polite">
            ✓ {filename}
          </span>
        )}
        <input
          id={inputId}
          type="file"
          accept=".txt,text/plain,.csv"
          className="visually-hidden"
          onChange={(e) => void openFile(e.target.files)}
        />
      </label>
      <div style={{ display: "flex", gap: "0.7rem", marginTop: "0.7rem", flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn-link"
          onClick={() => ingest(SYNTH_PANEL)}
        >
          Try with a synthetic demo panel →
        </button>
      </div>
      <p style={{ marginTop: "1rem", fontSize: "0.82rem", color: "var(--muted)" }}>
        Educational software, not a diagnosis. Genetics shifts odds; labs and
        history decide care.
      </p>
    </div>
  );
}

// ───────── progress ─────────

function Progress() {
  const pct = useAppStore((s) => s.progressPct);
  const label = useAppStore((s) => s.progressLabel);
  return (
    <section className="progress fade-up">
      <div className="eyebrow">Reading</div>
      <h2 className="section-title">Parsing your file…</h2>
      <div className="progress__bar" aria-hidden>
        <div className="progress__fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="progress__label mono">{`${Math.round(pct)}%  ·  ${label}`}</div>
    </section>
  );
}

// ───────── report header & coverage ─────────

function ReportHeader({
  qc,
  analysis,
}: {
  qc: QcReport;
  analysis: AnalyzeResult;
}) {
  return (
    <div className="report-header fade-up">
      <div className="report-header__copy">
        <span className="eyebrow">Your reading</span>
        <h1 className="report-header__h1">
          {analysis.summary.findings_count} curated findings,{" "}
          <em>interpreted on your device.</em>
        </h1>
        <div className="report-header__meta">
          <span className="meta-chip">
            <Icon d={ICONS.lock} size={12} />
            {qc.variantsIndexed.toLocaleString()} variants indexed
          </span>
          <span className="meta-chip">
            Build {qc.impliedBuild ?? "unknown"}
          </span>
          <span className="meta-chip">
            KB · {analysis.summary.kb_matched} matches /{" "}
            {analysis.summary.kb_not_on_chip} gaps
          </span>
          {qc.flags.length > 0 && (
            <span className="meta-chip" style={{ color: "var(--watch)" }}>
              ⚠ {qc.flags.length} QC flag{qc.flags.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>
      <div className="summary-stats">
        <div className="summary-stat">
          <span className="summary-stat__value">
            {analysis.summary.urgent_count}
          </span>
          <span className="summary-stat__label">Action checkpoints</span>
        </div>
        <div className="summary-stat">
          <span className="summary-stat__value">
            {analysis.haplotypes.length}
          </span>
          <span className="summary-stat__label">Composite calls</span>
        </div>
        <div className="summary-stat">
          <span className="summary-stat__value">
            {analysis.summary.actions_count}
          </span>
          <span className="summary-stat__label">Suggested follow-ups</span>
        </div>
      </div>
    </div>
  );
}

function CoverageStrip({ analysis }: { analysis: AnalyzeResult }) {
  const segs = useMemo(() => {
    const interpreted = analysis.findings.map((f) => ({
      kind: sentimentKey(f.sentiment),
      title: `${f.gene} · ${f.observed_value} — ${f.takeaway.slice(0, 80)}`,
    }));
    const calledOnly = Math.max(
      0,
      analysis.summary.kb_matched - analysis.findings.length,
    );
    const missing = analysis.summary.kb_not_on_chip;
    const calledArr = Array.from({ length: calledOnly }, () => ({
      kind: "called" as const,
      title: "Genotyped — no curated narrative yet",
    }));
    const missingArr = Array.from({ length: missing }, () => ({
      kind: "missing" as const,
      title: "Curated locus not on this chip",
    }));
    return [...interpreted, ...calledArr, ...missingArr];
  }, [analysis]);

  return (
    <div className="coverage">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "0.5rem" }}>
        <div>
          <span className="eyebrow">Your coverage</span>
          <h3 style={{ margin: "0.2rem 0 0", fontSize: "1.1rem", fontWeight: 500 }}>
            {analysis.summary.kb_matched + analysis.summary.kb_not_on_chip}{" "}
            curated markers, plotted as a barcode of your data.
          </h3>
        </div>
        <div className="coverage__legend">
          <span className="coverage__legend-item">
            <span className="legend-dot" style={{ background: "var(--good)" }} />
            Favorable
          </span>
          <span className="coverage__legend-item">
            <span
              className="legend-dot"
              style={{ background: "var(--watch)" }}
            />
            Watch
          </span>
          <span className="coverage__legend-item">
            <span
              className="legend-dot"
              style={{ background: "var(--action)" }}
            />
            Action
          </span>
          <span className="coverage__legend-item">
            <span
              className="legend-dot"
              style={{ background: "var(--ink-soft)", opacity: 0.25 }}
            />
            Genotyped, not interpreted
          </span>
          <span className="coverage__legend-item">
            <span
              className="legend-dot"
              style={{
                background: "transparent",
                border: "1px dashed var(--hair-strong)",
              }}
            />
            Not on chip
          </span>
        </div>
      </div>
      <div className="marker-strip" role="img" aria-label="Coverage marker strip">
        {segs.map((s, i) => (
          <span
            key={i}
            className={`marker-seg marker-seg--${s.kind}`}
            title={s.title}
          />
        ))}
      </div>
    </div>
  );
}

// ───────── highlights ─────────

function HighlightsSection({ hl }: { hl: AnalyzeResult["highlights"] }) {
  if (!hl.positives.length && !hl.watches.length) return null;
  return (
    <section className="section">
      <SectionHeader
        eyebrow="What stood out"
        title="The hits worth knowing first."
        sub="The strongest signals from your curated panel — favorable alleles on the left, things to track on the right."
      />
      <div className="story-grid">
        {hl.positives.map((h) => (
          <article key={`pos-${h.gene}`} className="story">
            <div className="story__head">
              <span className="story__gene">{h.gene}</span>
              <span className="story__call">{h.observed_value}</span>
            </div>
            <p className="story__pull">{h.takeaway}</p>
            <div className="story__foot">
              <SentimentChip sentiment={h.sentiment}>Favorable</SentimentChip>
            </div>
          </article>
        ))}
        {hl.watches.map((h) => (
          <article key={`wat-${h.gene}`} className="story">
            <div className="story__head">
              <span className="story__gene">{h.gene}</span>
              <span className="story__call">{h.observed_value}</span>
            </div>
            <p className="story__pull">{h.takeaway}</p>
            <div className="story__foot">
              <SentimentChip sentiment={h.sentiment}>
                {h.sentiment === "action_needed" ? "Action" : "Watch"}
              </SentimentChip>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

// ───────── gene story cards (haplotypes) ─────────

function GeneStorySection({ cards }: { cards: HaplotypeCard[] }) {
  if (!cards.length) return null;
  return (
    <section className="section">
      <SectionHeader
        eyebrow="Composite reads"
        title="Genes whose meaning needs more than one variant."
        sub="APOE, CYP2C19, and the ethanol-handling enzymes are read as combinations. Confidence reflects whether your file covers every position needed."
      />
      <div className="story-grid">
        {cards.map((card) => (
          <article
            key={`${card.gene}-${card.diplotype}`}
            className="story"
          >
            <div className="story__head">
              <span className="story__gene">{card.display_name ?? card.gene}</span>
              <span className="story__call">{card.diplotype}</span>
              <span className="story__rsid">{card.rsids.join(" · ")}</span>
            </div>
            {card.one_liner && <p className="story__body">{card.one_liner}</p>}
            <div className="story__foot">
              <SentimentChip sentiment={card.diplotype_sentiment}>
                {card.diplotype_sentiment === "positive"
                  ? "Favorable"
                  : card.diplotype_sentiment === "watch"
                    ? "Watch"
                    : card.diplotype_sentiment === "action_needed"
                      ? "Action"
                      : "Neutral"}
              </SentimentChip>
              <ConfidenceMeter
                label={card.confidence_humanized.label}
                percent={card.confidence_humanized.percent}
              />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

// ───────── pathway explorer ─────────

function PathExplorer({ data }: { data: AnalyzeResult["pathway_stacking"] }) {
  const [mtx, setMtx] = useState({ dx: 0, dy: 0, s: 1 });
  const drag = useRef<{ x: number; y: number; active: boolean }>({
    x: 0,
    y: 0,
    active: false,
  });

  const onWheelInternal = useCallback((e: ReactWheel<SVGSVGElement>) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    setMtx((m) => ({ ...m, s: Math.min(3, Math.max(0.55, m.s * factor)) }));
  }, []);

  const svgDown = useCallback((e: ReactMouse<SVGSVGElement>) => {
    drag.current = { x: e.clientX, y: e.clientY, active: true };
  }, []);

  const svgMove = useCallback((e: ReactMouse<SVGSVGElement>) => {
    if (!drag.current.active) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    drag.current = { x: e.clientX, y: e.clientY, active: true };
    setMtx((m) => ({ ...m, dx: m.dx + dx, dy: m.dy + dy }));
  }, []);

  const svgUp = useCallback(() => {
    drag.current.active = false;
  }, []);

  if (!data.length)
    return (
      <p className="section-sub">
        Pathway summaries will appear once two or more curated findings stack
        on the same biology.
      </p>
    );

  const W = 940;
  const H = Math.max(
    360,
    120 +
      data.reduce(
        (sum, g) => sum + Math.max(48, Math.min(120, (g.count + 3) * 18)),
        0,
      ),
  );

  let yCursor = 40;
  const hubs = data.map((g) => {
    const laneH = Math.max(60, Math.min(220, g.genes.length * 28 + 20));
    const centerY = yCursor + laneH / 2;
    yCursor += laneH + 26;
    return { g, hubY: centerY, laneH };
  });

  return (
    <div className="card" style={{ padding: "1rem 1.1rem" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
        className="no-print"
      >
        <span className="tag">⌃ + wheel · drag canvas to pan</span>
        <button
          type="button"
          className="btn btn-ghost mono"
          onClick={() => setMtx({ dx: 0, dy: 0, s: 1 })}
        >
          Reset
        </button>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", maxHeight: 520, cursor: "grab" }}
        onWheel={onWheelInternal}
        onMouseDown={svgDown}
        onMouseMove={svgMove}
        onMouseUp={svgUp}
        onMouseLeave={svgUp}
      >
        <defs>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.12" />
          </filter>
        </defs>
        <g
          transform={`translate(${mtx.dx} ${mtx.dy}) scale(${mtx.s}) matrix(1 0 0 1 220 20)`}
        >
          {hubs.map(({ g, hubY }, idx) => {
            const leftX = 40;
            const hubX = W / 2 - 260;
            const genes = g.genes;
            return (
              <Fragment key={`${g.pathway}-${idx}`}>
                {genes.map((gene, gi) => {
                  const gx = gi % 2 === 0 ? leftX : W - leftX - 120;
                  const gy = hubY + (gi - genes.length / 2) * 22;
                  return (
                    <line
                      key={gene}
                      x1={gx + 54}
                      y1={gy + 14}
                      x2={hubX + 62}
                      y2={hubY + 10}
                      stroke="var(--hair-strong)"
                      strokeWidth={g.count > 1 ? 3 : 1.5}
                    />
                  );
                })}
                <circle
                  cx={hubX + 62}
                  cy={hubY + 10}
                  r={18}
                  fill={g.count > 1 ? "var(--watch-soft)" : "var(--accent-soft)"}
                  stroke={g.count > 1 ? "var(--watch)" : "var(--accent)"}
                  strokeWidth={2}
                  filter="url(#glow)"
                />
                <text
                  x={hubX + 62}
                  y={hubY + 14}
                  textAnchor="middle"
                  fontSize="12"
                  fontWeight={700}
                  fill="var(--ink)"
                >
                  {g.count > 1 ? g.count : ""}
                </text>
                <text
                  x={hubX + 94}
                  y={hubY + 14}
                  fontSize="13"
                  fontWeight={600}
                  fill="var(--ink)"
                >
                  {g.pathway.replace(/_/g, " ")}
                </text>
                {genes.map((gene, gi) => {
                  const gx = gi % 2 === 0 ? leftX : W - leftX - 120;
                  const gy = hubY + (gi - genes.length / 2) * 22;
                  const sentiment =
                    g.findings.find((f) => f.gene === gene)?.sentiment ??
                    "neutral";
                  const stroke = sentimentColorVar(sentiment);
                  return (
                    <g key={`${gene}-node-${idx}`}>
                      <rect
                        x={gx}
                        y={gy}
                        width={118}
                        height={28}
                        rx={14}
                        fill="var(--surface)"
                        stroke={stroke}
                        opacity={0.95}
                        filter="url(#glow)"
                      />
                      <text
                        x={gx + 16}
                        y={gy + 19}
                        fontSize="12"
                        fontWeight={700}
                        fill={stroke}
                      >
                        {gene}
                      </text>
                    </g>
                  );
                })}
              </Fragment>
            );
          })}
        </g>
      </svg>
      <div style={{ display: "grid", gap: "0.6rem", marginTop: "0.9rem" }}>
        {data
          .filter((g) => g.count > 1 && g.stacking_note)
          .map((g) => (
            <div key={`note-${g.pathway}`} className="card-quiet">
              <strong>{g.pathway.replace(/_/g, " ")}</strong>
              <div style={{ color: "var(--muted)", marginTop: 6 }}>
                {g.stacking_note}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

// ───────── action blocks ─────────

function ActionsSection({ actions }: { actions: AnalyzeResult["actions"] }) {
  const groups: Array<[string, keyof typeof actions, "urgent" | "clinical" | "labs" | "lifestyle"]> = [
    ["Action checkpoints", "urgent", "urgent"],
    ["Worth a clinician chat", "clinical", "clinical"],
    ["Labs to track over time", "labs", "labs"],
    ["Lifestyle levers", "lifestyle", "lifestyle"],
  ];
  return (
    <section className="section">
      <SectionHeader
        eyebrow="What to do with this"
        title="Suggested next steps, from urgent to optional."
        sub="Each item explains the why and the how. None of this replaces a clinician — it gives you an organized starting point."
      />
      <div className="actions-grid">
        {groups.map(([label, key, cat]) => (
          <div key={label} className="action-group">
            <h3 className="action-group__title">
              {label}
              <span className="action-group__count">
                · {actions[key].length}
              </span>
            </h3>
            {!actions[key].length && (
              <p className="section-sub" style={{ marginLeft: 2 }}>
                Nothing flagged in this category.
              </p>
            )}
            {actions[key].map((a) => (
              <article key={a.id} className={`action action--${cat}`}>
                <div className="action__head">
                  <h4 className="action__title">{a.action_text}</h4>
                  <span className="action__genes mono">
                    {a.genes.join(", ")}
                  </span>
                </div>
                <div className="action__sections">
                  {a.why_sections.map((blk) => (
                    <div key={blk.label}>
                      <span className="tag">{blk.label}</span>
                      <div style={{ marginTop: 4 }}>{blk.text}</div>
                    </div>
                  ))}
                </div>
                <div className="action__split">
                  <div>
                    <div className="tag">What to do</div>
                    <div>{a.what_to_do}</div>
                  </div>
                  <div>
                    <div className="tag">Follow up</div>
                    <div>{a.what_to_retest}</div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

// ───────── findings table ─────────

function FindingsTable({
  rows,
  onOpen,
}: {
  rows: Finding[];
  onOpen: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [domain, setDomain] = useState("");
  const [sentiment, setSentiment] = useState("");

  const domains = useMemo(
    () => Array.from(new Set(rows.map((r) => r.domain))).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (domain && r.domain !== domain) return false;
      if (sentiment && r.sentiment !== sentiment) return false;
      if (!needle) return true;
      return (
        r.gene.toLowerCase().includes(needle) ||
        r.rsid.toLowerCase().includes(needle) ||
        r.takeaway.toLowerCase().includes(needle)
      );
    });
  }, [rows, q, domain, sentiment]);

  const parent = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parent.current,
    estimateSize: () => 50,
    overscan: 12,
  });

  return (
    <div className="findings-card">
      <div className="findings-tools no-print">
        <input
          placeholder="Search gene, rsID, takeaway…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search findings"
        />
        <select
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          aria-label="Filter by domain"
        >
          <option value="">All domains</option>
          {domains.map((d) => (
            <option key={d} value={d}>
              {d.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <select
          value={sentiment}
          onChange={(e) => setSentiment(e.target.value)}
          aria-label="Filter by sentiment"
        >
          <option value="">All sentiment</option>
          <option value="positive">Favorable</option>
          <option value="neutral">Neutral</option>
          <option value="watch">Watch</option>
          <option value="action_needed">Action</option>
        </select>
        <span className="mono" style={{ color: "var(--muted)", fontSize: "0.78rem" }}>
          {filtered.length} of {rows.length}
        </span>
      </div>
      <div className="table-row table-row--head">
        <span />
        <span>Gene</span>
        <span>Call</span>
        <span>Plain language</span>
        <span>Confidence</span>
        <span>Domain</span>
      </div>
      <div
        ref={parent}
        style={{ maxHeight: 540, overflow: "auto" }}
      >
        <div
          style={{
            height: rowVirtualizer.getTotalSize(),
            position: "relative",
          }}
        >
          {rowVirtualizer.getVirtualItems().map((v) => {
            const f = filtered[v.index];
            return (
              <div
                key={f.id}
                className="table-row"
                style={{
                  position: "absolute",
                  transform: `translateY(${v.start}px)`,
                  width: "100%",
                }}
                onDoubleClick={() => onOpen(f.id)}
                onClick={() => onOpen(f.id)}
              >
                <span
                  className={`sentiment-dot sentiment-dot--${sentimentKey(f.sentiment)}`}
                  aria-hidden
                />
                <span className="table-row__gene">{f.gene}</span>
                <span className="mono table-row__rsid">{f.observed_value}</span>
                <span className="table-row__say">{f.takeaway}</span>
                <ConfidenceMeter
                  label={f.confidence_humanized.label}
                  percent={f.confidence_humanized.percent}
                  size="sm"
                />
                <span className="tag">{f.domain.replace(/_/g, " ")}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ───────── command palette ─────────

function CommandPalette({
  findings,
  onPick,
}: {
  findings: Finding[];
  onPick: (id: string) => void;
}) {
  const open = useAppStore((s) => s.paletteOpen);
  const setOpen = useAppStore((s) => s.setPaletteOpen);
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return findings.slice(0, 120);
    return findings
      .filter(
        (f) =>
          f.gene.toLowerCase().includes(needle) ||
          f.rsid.toLowerCase().includes(needle) ||
          f.takeaway.toLowerCase().includes(needle) ||
          f.domain.toLowerCase().includes(needle),
      )
      .slice(0, 120);
  }, [findings, q]);

  useEffect(() => setQ(""), [open]);

  useEffect(() => {
    if (!open) return;
    document.body.classList.add("modal-open");
    return () => {
      document.body.classList.remove("modal-open");
    };
  }, [open]);

  if (!open) return null;
  return (
    <div
      role="presentation"
      className="palette"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div
        role="dialog"
        aria-modal
        className="palette-card"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          placeholder="Search gene · rsID · takeaway"
          aria-label="Command palette query"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e: ReactKb<HTMLInputElement>) => {
            if (e.key === "Escape") setOpen(false);
          }}
        />
        <div className="palette-list">
          {filtered.map((f) => (
            <button
              type="button"
              key={f.id}
              className="palette-item"
              onClick={() => {
                setOpen(false);
                onPick(f.id);
              }}
              style={{ display: "block", textAlign: "left", cursor: "pointer" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong>{f.gene}</strong>
                <span className="mono" style={{ color: "var(--muted)" }}>
                  {f.rsid}
                </span>
              </div>
              <div style={{ color: "var(--muted)", marginTop: 4, fontSize: "0.85rem" }}>
                {f.takeaway.slice(0, 160)}…
              </div>
            </button>
          ))}
          {!filtered.length && (
            <div style={{ color: "var(--muted)", padding: "0.6rem 0.8rem" }}>
              No matches.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ───────── drawer ─────────

function Drawer() {
  const id = useAppStore((s) => s.drawerFindingId);
  const close = useAppStore((s) => s.openDrawer);
  const analysis = useAppStore((s) => s.analysis);
  const f = analysis?.findings.find((x) => x.id === id);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!id) return;
    document.body.classList.add("modal-open");
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(null);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("modal-open");
      window.removeEventListener("keydown", onKey);
    };
  }, [id, close]);

  if (!f) return null;
  return (
    <Fragment>
      <div className="drawer-overlay no-print" onMouseDown={() => close(null)} />
      <aside
        ref={panelRef}
        tabIndex={-1}
        className="drawer-panel no-print"
        aria-label="Gene detail"
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "1rem",
          }}
        >
          <div>
            <span className="eyebrow">{f.domain.replace(/_/g, " ")}</span>
            <h3 style={{ margin: "0.4rem 0 0.2rem" }}>{f.gene}</h3>
            <div className="mono" style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
              {f.rsid} · {f.observed_genotype}
            </div>
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label="Close"
            onClick={() => close(null)}
          >
            <Icon d={ICONS.close} />
          </button>
        </div>

        <p
          className="story__pull"
          style={{ marginTop: "0.4rem", fontSize: "1.15rem" }}
        >
          {f.takeaway}
        </p>

        <div
          style={{
            display: "flex",
            gap: "0.6rem",
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <SentimentChip sentiment={f.sentiment}>
            {f.sentiment === "positive"
              ? "Favorable"
              : f.sentiment === "watch"
                ? "Watch"
                : f.sentiment === "action_needed"
                  ? "Action"
                  : "Neutral"}
          </SentimentChip>
          <ConfidenceMeter
            label={f.confidence_humanized.label}
            percent={f.confidence_humanized.percent}
          />
        </div>

        <div className="card">
          <h4>Confidence</h4>
          <p style={{ margin: "0.2rem 0 0.5rem" }}>
            {f.confidence_humanized.explanation}
          </p>
          <p style={{ color: "var(--muted)", margin: 0, fontSize: "0.85rem" }}>
            {f.evidence_support_label}
          </p>
        </div>

        {f.genotype_meaning && (
          <div className="card">
            <h4>Genotype interpretation</h4>
            <p style={{ margin: "0.2rem 0 0" }}>{f.genotype_meaning}</p>
          </div>
        )}

        <div className="card">
          <h4>Phenotypic framing</h4>
          <p style={{ margin: "0.2rem 0 0.6rem" }}>{f.phenotype_meaning}</p>
          <h4 style={{ marginBottom: 0 }}>Biology</h4>
          <p style={{ margin: "0.2rem 0 0" }}>{f.biology}</p>
        </div>

        <div className="card">
          <h4>Monitoring cues</h4>
          <p style={{ margin: "0.2rem 0 0" }}>{f.monitoring}</p>
        </div>

        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <a
            href={f.dbsnp_url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-outline"
          >
            <Icon d={ICONS.external} size={14} /> dbSNP
          </a>
          <a
            href={f.clinvar_url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-outline"
          >
            <Icon d={ICONS.external} size={14} /> ClinVar
          </a>
        </div>
      </aside>
    </Fragment>
  );
}

// ───────── exports + enrichment ─────────

function ExportsSection({
  onExportRaw,
  onExportFull,
  onEnrich,
  clinician,
  enrichStatus,
  enrichBusy,
  analysisReady,
}: {
  onExportRaw: () => void;
  onExportFull: () => void;
  onEnrich: () => void;
  clinician: () => void;
  enrichStatus: string | null;
  enrichBusy: boolean;
  analysisReady: boolean;
}) {
  return (
    <section className="section">
      <SectionHeader
        eyebrow="Take it with you"
        title="Two JSON shapes, one clinician brief."
        sub="The raw bundle holds genotypes plus structured calls. The full bundle adds every narrative, confidence, and (if you opt in) enrichment cache."
      />
      <div className="exports-grid">
        <button
          type="button"
          disabled={!analysisReady}
          className="btn btn-outline"
          onClick={onExportRaw}
        >
          <strong>Structured raw JSON</strong>
          <small>Genotypes + composite calls only</small>
        </button>
        <button
          type="button"
          disabled={!analysisReady}
          className="btn btn-primary"
          onClick={onExportFull}
        >
          <strong>Full JSON · with narrative</strong>
          <small>Interpretation, confidence, enrichment</small>
        </button>
        <button
          type="button"
          disabled={!analysisReady}
          className="btn btn-outline no-print"
          onClick={clinician}
        >
          <strong>Clinician briefing</strong>
          <small>Markdown · for your provider</small>
        </button>
      </div>
      <div className="card-quiet no-print">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <div>
            <span className="eyebrow">Optional enrichment</span>
            <h4 style={{ margin: "0.2rem 0 0.4rem" }}>
              Look up curated rsIDs against MyVariant.info
            </h4>
            <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--muted)" }}>
              Sends only rsIDs (no genotypes, no your-file content). If your
              browser blocks the call, we fall back gracefully.
            </p>
          </div>
          <button
            type="button"
            disabled={!analysisReady || enrichBusy}
            className="btn btn-outline"
            onClick={onEnrich}
            aria-busy={enrichBusy}
          >
            {enrichBusy ? (
              <span className="btn-spin" aria-hidden />
            ) : (
              <Icon d={ICONS.spark} size={14} />
            )}
            {enrichBusy ? "Fetching…" : "Run enrichment"}
          </button>
        </div>
        {enrichStatus && (
          <p style={{ marginTop: "0.7rem", fontSize: "0.82rem", color: "var(--muted)" }}>
            {enrichStatus}
          </p>
        )}
      </div>
    </section>
  );
}

// ───────── correlations + qc ─────────

function CorrelationsSection({
  correlations,
}: {
  correlations: AnalyzeResult["correlations"];
}) {
  if (!correlations.length) return null;
  return (
    <section className="section">
      <SectionHeader
        eyebrow="When patterns emerge"
        title="Correlations across pathways."
        sub="These appear only when several findings stack on the same biology, suggesting one direction more strongly than any single variant."
      />
      <div className="story-grid">
        {correlations.map((c) => (
          <article key={c.axis} className="story">
            <div className="story__head">
              <span className="story__gene" style={{ textTransform: "capitalize" }}>
                {c.axis.replace(/_/g, " ")}
              </span>
              <span className="story__call">{c.direction.replace("_", " ")}</span>
            </div>
            <p className="story__body">{c.summary}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function QcSection({ analysis, qc }: { analysis: AnalyzeResult; qc: QcReport }) {
  return (
    <section className="section">
      <SectionHeader
        eyebrow="Reading notes"
        title="Coverage, quality, caveats."
      />
      <div className="card">
        <ul style={{ paddingLeft: 18, margin: 0, color: "var(--ink-soft)" }}>
          {analysis.qc_notes.map((n) => (
            <li key={n} style={{ marginBottom: "0.45rem" }}>
              {n}
            </li>
          ))}
          {qc.flags.map((f) => (
            <li key={`qc-${f}`} style={{ marginBottom: "0.45rem", color: "var(--watch)" }}>
              QC flag: {f}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ───────── main app ─────────

export default function App() {
  const phase = useAppStore((s) => s.phase);
  const qc = useAppStore((s) => s.qc);
  const variants = useAppStore((s) => s.variants);
  const analysis = useAppStore((s) => s.analysis);
  const error = useAppStore((s) => s.error);
  const enrich = useAppStore((s) => s.enrichment);
  const enrichStatus = useAppStore((s) => s.enrichStatus);
  const enrichBusy = useAppStore((s) => s.enrichBusy);
  const dark = useAppStore((s) => s.dark);
  const setPaletteOpen = useAppStore((s) => s.setPaletteOpen);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isOs = navigator.platform.includes("Mac");
      if ((isOs ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === "k") {
        if (phase === "report") {
          e.preventDefault();
          setPaletteOpen(true);
        }
      }
      if (
        (isOs ? e.metaKey : e.ctrlKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "d"
      ) {
        e.preventDefault();
        useAppStore.getState().toggleDark();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, setPaletteOpen]);

  const ingest = async (text: string) => {
    const store = useAppStore.getState();
    store.reset();
    store.startAnalyze();
    try {
      store.setProgress(25, "Worker parsing genotype file…");
      const { qc, variants } = await runParseWorker(text);
      store.setProgress(
        72,
        `Matching curated panel (${Object.keys(variants).length.toLocaleString()} rsIDs indexed)…`,
      );
      const interpreted = analyzeGenome(variants, qc);
      store.analyzeSuccess(qc, variants, interpreted);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      store.analyzeFail(err instanceof Error ? err.message : String(err));
    }
  };

  function handleExport(which: "raw" | "full") {
    if (!analysis || !qc || !variants) return;
    const kb = loadKb();
    const rsidsNeeded = uniqRs(kb.loci.map((l) => l.rsid.toLowerCase()));
    const variantsSubset = rsidsNeeded
      .map((id) => variants[id])
      .filter(Boolean);
    const base = {
      analyze: analysis,
      variantsSubset,
      qcSummary: mapQcToSourceSlice(qc),
      kb_total_loci: kb.loci.length,
      enrichment: enrich ?? undefined,
    };
    const payload = which === "raw" ? buildRawBundle(base) : buildFullBundle(base);
    downloadJson(
      which === "raw" ? "raw_genomic_bundle.json" : "full_genomic_bundle.json",
      payload,
    );
  }

  async function handleEnrich() {
    if (!analysis) return;
    const store = useAppStore.getState();
    store.setEnrichBusy(true);
    store.setEnrichment(store.enrichment ?? null, "Querying variant APIs …");
    try {
      const rsids = analysis.findings
        .slice(0, 80)
        .map((f) => f.rsid.toLowerCase());
      const resp = await enrichRsidsHybrid(rsids, (d, total) => {
        const st = useAppStore.getState();
        const prev = st.enrichment ?? {};
        st.setEnrichment(prev, `${d}/${total} rsIDs fetched`);
      });
      const okCount = resp.records
        ? Object.values(resp.records).filter((r) => !r.error).length
        : 0;
      if (resp.blocked && !resp.records) {
        store.setEnrichment(
          {},
          resp.error ??
            "Enrichment unavailable (offline or browser blocked outbound requests).",
        );
        return;
      }
      if (!resp.records || okCount === 0) {
        store.setEnrichment(
          resp.records ?? {},
          resp.error ??
            "No enrichment rows succeeded — endpoints may reject this environment.",
        );
        return;
      }
      store.setEnrichment(
        resp.records,
        "Enrichment merged into session (export full JSON to retain).",
      );
    } finally {
      store.setEnrichBusy(false);
    }
  }

  return (
    <div className="shell">
      <Topbar />
      <main className="page">
        {phase === "idle" && <Hero ingest={ingest} />}
        {error && (
          <p style={{ color: "var(--action)", margin: 0 }}>
            Something went wrong: {error}. Try confirming the TXT layout
            matches typical 23andMe exports.
          </p>
        )}

        {phase === "analyzing" && <Progress />}

        {phase === "report" && qc && analysis && (
          <>
            <CommandPalette
              findings={analysis.findings}
              onPick={(id) => useAppStore.getState().openDrawer(id)}
            />
            <Drawer />

            <section className="section fade-up">
              <ReportHeader qc={qc} analysis={analysis} />
            </section>

            <section className="section">
              <CoverageStrip analysis={analysis} />
            </section>

            <HighlightsSection hl={analysis.highlights} />

            <GeneStorySection cards={analysis.haplotypes} />

            <section className="section">
              <SectionHeader
                eyebrow="Pathways stacking"
                title="Where multiple genes line up."
                sub="Drag to pan. Hold ⌃ and scroll to zoom. Each hub gathers genes that share a biological axis."
              />
              <PathExplorer data={analysis.pathway_stacking} />
            </section>

            <CorrelationsSection correlations={analysis.correlations} />

            <ActionsSection actions={analysis.actions} />

            <section className="section">
              <SectionHeader
                eyebrow="Findings explorer"
                title="Every interpreted variant, searchable."
                sub="Click any row to open the full reading. Filter by domain or sentiment."
              />
              <FindingsTable
                rows={analysis.findings}
                onOpen={(id) => useAppStore.getState().openDrawer(id)}
              />
            </section>

            <QcSection analysis={analysis} qc={qc} />

            <ExportsSection
              onExportRaw={() => handleExport("raw")}
              onExportFull={() => handleExport("full")}
              onEnrich={() => void handleEnrich()}
              enrichStatus={enrichStatus}
              enrichBusy={enrichBusy}
              clinician={() =>
                analysis &&
                downloadText(
                  "clinician_brief.md",
                  buildClinicianBriefMd(analysis),
                )
              }
              analysisReady={Boolean(analysis)}
            />
          </>
        )}
      </main>
      <PrivacyChipFooter />
    </div>
  );
}

const SYNTH_PANEL = `# Test panel for Marker
# Genome build inferred for demo purposes
rsid	chromosome	position	genotype
rs1229984	4	100239319	GG
rs698	4	100302652	AG
rs671	12	112241766	AG
rs429358	19	45411941	CT
rs7412	19	45412079	CC
rs4244285	10	96522463	AG
`;
