import { loadKb, kbVersion } from "../kb/loadKb";
import type { SingleLocus } from "../kb/schema";
import type {
  ActionCategory,
  ActionItem,
  AnalyzeResult,
  CorrelationHint,
  Finding,
  Highlights,
  HaplotypeCard,
  PathwayGroup,
  GeneLevelCall,
  Sentiment,
  VariantRow,
  QcReport,
} from "../types";
import { inferApoeDiplotype, inferCyp2c19Star } from "./composites";
import { interpretCuratedPacks } from "./curatedPacks";

export const EXPORT_APP_VERSION = "1.0.0";

function effectLabel(bar: number): { label: string; explanation: string } {
  if (bar >= 5) return { label: "Notable clinical-scale", explanation: "Actionable metabolic/pharmacologic leverage." };
  if (bar >= 4) return { label: "Notable effect", explanation: "Meaningful within polygenic trait context." };
  if (bar >= 3) return { label: "Moderate effect", explanation: "Adds context but phenotype dominates interpretation." };
  return { label: "Small effect", explanation: "Statistical tendencies; labs and lifestyle overshadow." };
}

function confLabel(pct: number): { label: string; explanation: string } {
  const label = pct >= 82 ? "High" : pct >= 75 ? "Moderate" : "Emerging";
  const explanation =
    label === "High"
      ? "Replicated tagging pattern on consumer cohorts."
      : label === "Moderate"
        ? "Evidence solid but nuanced by ancestry/context."
        : "Emerging GWAS/coarse tagging signal.";
  return { label, explanation };
}

function evLabel(es: Finding["evidence_support"]): string {
  switch (es) {
    case "clinical_and_wellness":
      return "Strong default (clinical + wellness gates)";
    case "clinical_only":
      return "Clinical-oriented gate";
    default:
      return "Emerging / wellness-tier signal (not strict clinical)";
  }
}

function findingFromSingle(
  locus: SingleLocus,
  row: VariantRow,
  genotype: string,
  block: NonNullable<SingleLocus["by_genotype"][string]>,
): Finding {
  const { label: el, explanation: ee } = effectLabel(block.effect_bar);
  const { label: cl, explanation: cx } = confLabel(block.confidence_percent);
  const rsid = locus.rsid.toLowerCase();
  return {
    id: `${locus.gene}:${rsid}`,
    rsid,
    gene: locus.gene,
    domain: locus.domain,
    chromosome: row.chromosome,
    position: row.position,
    observed_genotype: genotype,
    observed_value: genotype,
    genotype_short: block.phenotype_short,
    takeaway: block.takeaway,
    sentiment: block.sentiment as Sentiment,
    evidence_support: block.evidence_support,
    evidence_support_label: evLabel(block.evidence_support),
    genotype_meaning: block.genotype_meaning ?? block.takeaway,
    phenotype_meaning: block.phenotype_meaning,
    biology: block.biology,
    monitoring: block.monitoring,
    effect_humanized: { label: el, explanation: ee, bar: block.effect_bar },
    confidence_humanized: { label: cl, explanation: cx, percent: block.confidence_percent },
    genotype_pop_freq: undefined,
    sample_size: block.sample_size,
    replications: block.replications,
    ancestry_note: block.ancestry_note,
    dbsnp_url: `https://www.ncbi.nlm.nih.gov/snp/${rsid}`,
    clinvar_url: `https://www.ncbi.nlm.nih.gov/clinvar/?term=${rsid}`,
    phenotype_tags: inferTags(locus.domain, block.phenotype_short),
    pathway_tags: locus.pathway_tags,
  };
}

function inferTags(domain: string, short: string): string[] {
  const t = domain.replace(/_/g, " ") + "; " + short;
  const tags = [
    ...(t.includes("alcohol") || t.includes("ethanol") ? ["alcohol_metabolism"] : []),
    ...(t.includes(" LDL") || t.includes("lipid") ? ["lipids"] : []),
    ...(t.includes("glucose") || t.includes("diabetes") ? ["glycemia"] : []),
  ];
  return tags.length ? tags : [domain];
}

function uniq<T>(xs: T[]) {
  return [...new Set(xs)];
}

function summarizeGenes(fs: Finding[]) {
  return uniq(fs.map((f) => f.gene));
}

function stackingNote(dom: string, count: number): string | undefined {
  if (count < 2) return undefined;
  if (dom === "inflammation") {
    return `${count} inflammation-domain variants converge — track hsCRP trend and foundational recovery habits.`;
  }
  if (dom === "pharmacogenomics") {
    return `${count} PGx-associated hits — reconcile with clinician med list jointly.`;
  }
  if (dom === "cardiometabolic") {
    return `${count} cardiometabolic signals compound polygenic predisposition — pair with lipid + glucose labs.`;
  }
  return `${count} independent hits in ${dom.replace(/_/g, " ")} — phenotype context matters.`;
}

function buildActions(findings: Finding[]): AnalyzeResult["actions"] {
  const actions: AnalyzeResult["actions"] = {
    urgent: [],
    clinical: [],
    labs: [],
    lifestyle: [],
  };
  let p = 0;
  const push = (cat: ActionCategory, a: Omit<ActionItem, "id" | "category" | "priority">) => {
    const base: ActionItem = {
      id: `act-${cat}-${++p}`,
      category: cat,
      priority: p,
      ...a,
    };
    actions[cat].push(base);
  };

  const seen = new Set<string>();
  for (const f of findings) {
    const key = `${f.gene}:${f.observed_value}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const why_sections = [
      { label: "What this means", text: f.phenotype_meaning },
      { label: "Your result", text: `${f.gene} — ${f.observed_value}` },
      { label: "Evidence tier", text: f.evidence_support_label },
    ];

    if (f.gene === "CYP2C19" && f.sentiment === "action_needed") {
      push("urgent", {
        action_text:
          "Discuss antiplatelet choice with prescriber; bring PGx summary + medication list.",
        genes: [f.gene],
        why_sections,
        what_to_do: "Share genotype-informed PGx hint before initiating clopidogrel.",
        what_to_retest: "Clinical PGx assay if dosing changes contemplated.",
      });
    }

    if (f.gene === "CYP2C19" && f.sentiment === "watch") {
      push("clinical", {
        action_text:
          "CYP2C19 loss-of-function marker detected; review only if relevant medications are being considered.",
        genes: [f.gene],
        why_sections,
        what_to_do: "Share as a partial PGx screen with the prescriber; do not treat it as a complete diplotype.",
        what_to_retest: "Clinical PGx assay if clopidogrel, PPIs, antidepressants, or other CYP2C19 drugs matter.",
      });
    }

    if (f.gene === "ALDH2" && (f.sentiment === "watch" || f.sentiment === "action_needed")) {
      push("clinical", {
        action_text:
          "Review alcohol tolerance/atopy history with clinician; acetaldehyde-driven symptoms can mimic allergy.",
        genes: [f.gene],
        why_sections,
        what_to_do: "Prioritize moderated alcohol avoidance per clinician guidance.",
        what_to_retest: "Clinical assessment if esophageal symptoms or heavy-intake contexts.",
      });
    }

    if (
      f.domain === "coagulation" &&
      (f.sentiment === "watch" || f.sentiment === "action_needed")
    ) {
      push("clinical", {
        action_text: `Confirm ${f.gene} coagulation marker clinically before using it for risk decisions.`,
        genes: [f.gene],
        why_sections,
        what_to_do: "Review personal/family clot history and high-risk situations with a qualified clinician.",
        what_to_retest: "Confirm with clinical-grade thrombophilia testing if results would change care.",
      });
    }

    if (
      f.domain === "pharmacogenomics" &&
      f.gene !== "CYP2C19" &&
      (f.sentiment === "watch" || f.sentiment === "action_needed")
    ) {
      push("clinical", {
        action_text: `Share ${f.gene} pharmacogenomic marker with the prescribing clinician if the medication is relevant.`,
        genes: [f.gene],
        why_sections,
        what_to_do: "Do not change medication based on this app; use clinician-guided dosing/selection.",
        what_to_retest: "Confirm with clinical PGx assay when treatment decisions depend on it.",
      });
    }

    if (["TCF7L2", "GCKR", "SLC30A8"].includes(f.gene) || f.domain === "cardiometabolic") {
      if (f.sentiment === "watch" && f.domain === "cardiometabolic") {
        push("labs", {
          action_text: `Track relevant labs for ${f.gene} signal (glucose/lipids per clinician).`,
          genes: [f.gene],
          why_sections,
          what_to_do: "Align diet/activity with lab trends.",
          what_to_retest: "Fasting glucose / HbA1c / lipid panel cadence per PCP.",
        });
      }
    }

    if (f.domain === "inflammation" && f.sentiment === "watch") {
      push("lifestyle", {
        action_text: "Support sleep, recovery, and anti-inflammatory nutrition baseline.",
        genes: [f.gene],
        why_sections,
        what_to_do: "Track subjective recovery + optional hsCRP when healthy.",
        what_to_retest: "hsCRP trend after habit block changes.",
      });
    }

    if (f.sentiment === "positive" && f.domain === "wellness_performance") {
      push("lifestyle", {
        action_text: "Lean into strengths your coach data already supports — genetics is a nudge.",
        genes: [f.gene],
        why_sections,
        what_to_do: "Progress training variables deliberately.",
        what_to_retest: "Performance metrics every block.",
      });
    }
  }

  // Cap list sizes for UI
  const cap = (arr: ActionItem[], n: number) => arr.slice(0, n);
  return {
    urgent: cap(actions.urgent, 6),
    clinical: cap(actions.clinical, 8),
    labs: cap(actions.labs, 10),
    lifestyle: cap(actions.lifestyle, 10),
  };
}

function buildHighlights(findings: Finding[]): Highlights {
  const positives: Highlights["positives"] = [];
  const watches: Highlights["watches"] = [];
  for (const f of findings) {
    if (f.sentiment === "positive")
      positives.push({
        gene: f.gene,
        observed_value: f.observed_value,
        takeaway: f.takeaway,
        sentiment: f.sentiment,
      });
    if (f.sentiment === "watch" || f.sentiment === "action_needed")
      watches.push({
        gene: f.gene,
        observed_value: f.observed_value,
        takeaway: f.takeaway,
        sentiment: f.sentiment,
      });
  }
  return {
    positives: positives.slice(0, 5),
    watches: watches.slice(0, 8),
  };
}

function buildCorrelations(findings: Finding[]): CorrelationHint[] {
  const byDom = new Map<string, Finding[]>();
  for (const f of findings) {
    const arr = byDom.get(f.domain) ?? [];
    arr.push(f);
    byDom.set(f.domain, arr);
  }
  const hints: CorrelationHint[] = [];
  for (const [dom, fs] of byDom) {
    if (fs.length >= 2 && dom === "inflammation") {
      hints.push({
        axis: dom,
        direction: "risk_up",
        summary: "Multiple inflammation-domain findings — lifestyle recovery levers matter more than any single SNP.",
      });
    }
    if (fs.length >= 3 && dom === "cardiometabolic") {
      hints.push({
        axis: dom,
        direction: "risk_up",
        summary: "Polygenic cardiometabolic clustering — pair genetics with lipids, BP, glucose monitoring.",
      });
    }
  }
  return hints.slice(0, 6);
}

function buildPathways(findings: Finding[]): PathwayGroup[] {
  const byDom = new Map<string, Finding[]>();
  for (const f of findings) {
    const arr = byDom.get(f.domain) ?? [];
    arr.push(f);
    byDom.set(f.domain, arr);
  }
  const groups: PathwayGroup[] = [];
  for (const [dom, fs] of byDom) {
    const genes = summarizeGenes(fs);
    groups.push({
      pathway: dom,
      count: fs.length,
      genes,
      findings: fs.map((f) => ({
        gene: f.gene,
        effect_humanized: f.effect_humanized,
        sentiment: f.sentiment,
      })),
      stacking_note: stackingNote(dom, fs.length),
    });
  }
  return groups.sort((a, b) => b.count - a.count);
}

function buildHaplotypes(findings: Finding[], apoe?: HaplotypeCard | null, cyp?: HaplotypeCard | null) {
  const cards: HaplotypeCard[] = [];
  if (apoe) cards.push(apoe);
  if (cyp) cards.push(cyp);
  // include high-signal single genes as pseudo haplotype cards
  const seen = new Set(cards.map((c) => c.gene));
  for (const f of findings) {
    if (["ADH1B", "ADH1C", "ALDH2"].includes(f.gene) && !seen.has(f.gene)) {
      seen.add(f.gene);
      cards.push({
        gene: f.gene,
        display_name: f.gene,
        diplotype: f.observed_value,
        diplotype_short: f.genotype_short,
        diplotype_meaning: f.genotype_meaning,
        one_liner: f.takeaway,
        what_it_does: f.biology,
        why_we_test: f.monitoring,
        full_name: f.gene,
        rsids: [f.rsid],
        diplotype_pop_freq: f.genotype_pop_freq,
        confidence_humanized: f.confidence_humanized,
        diplotype_sentiment: f.sentiment,
      });
    }
  }
  return cards.slice(0, 12);
}

function apoeToCard(res: NonNullable<ReturnType<typeof inferApoeDiplotype>>): HaplotypeCard {
  const n = res.narrative;
  return {
    gene: "APOE",
    display_name: "APOE",
    diplotype: res.label,
    diplotype_short: res.short,
    diplotype_meaning: n.genotype_meaning,
    one_liner: n.takeaway,
    what_it_does: n.biology,
    why_we_test: n.monitoring,
    full_name: "Apolipoprotein E",
    rsids: n.rsids,
    confidence_humanized: n.confidence_humanized,
    diplotype_sentiment: res.sentiment,
  };
}

function cypToCard(res: NonNullable<ReturnType<typeof inferCyp2c19Star>>): HaplotypeCard {
  const n = res.narrative;
  return {
    gene: "CYP2C19",
    display_name: "CYP2C19",
    diplotype: res.stars,
    diplotype_short: n.genotype_short,
    diplotype_meaning: n.genotype_meaning,
    one_liner: n.takeaway,
    what_it_does: n.biology,
    why_we_test: n.monitoring,
    full_name: "Cytochrome P450 2C19",
    rsids: n.rsids,
    diplotype_pop_freq: n.genotype_pop_freq,
    confidence_humanized: n.confidence_humanized,
    diplotype_sentiment: res.sentiment,
  };
}

function buildGeneCalls(findings: Finding[]): GeneLevelCall[] {
  const byGene = new Map<string, Finding[]>();
  for (const f of findings) {
    const arr = byGene.get(f.gene) ?? [];
    arr.push(f);
    byGene.set(f.gene, arr);
  }
  const calls: GeneLevelCall[] = [];
  for (const [gene, fs] of byGene) {
    calls.push({
      gene,
      rsid_evidence: fs.map((x) => ({
        rsid: x.rsid,
        genotype: x.observed_genotype,
        chrom: x.chromosome,
        position: x.position,
      })),
      resolved_call: fs.map((x) => x.observed_value).join(" | "),
      phenotype_tags: uniq(fs.flatMap((x) => x.phenotype_tags)),
      call_confidence: fs.some((x) => x.evidence_support === "clinical_and_wellness")
        ? "high"
        : "medium",
      no_call_reasons: [],
    });
  }
  return calls.sort((a, b) => a.gene.localeCompare(b.gene));
}

export function analyzeGenome(
  variants: Record<string, VariantRow>,
  qc: QcReport,
): AnalyzeResult {
  const kb = loadKb();
  const extraFlags = [...qc.flags];
  const suppressed = new Set<string>();
  const findings: Finding[] = [];

  const apoe = inferApoeDiplotype(variants["rs429358"]?.genotype, variants["rs7412"]?.genotype);
  const apoeCard = apoe ? apoeToCard(apoe) : null;
  if (apoe) {
    suppressed.add("rs429358");
    suppressed.add("rs7412");
    const n = apoe.narrative;
    findings.push({
      id: "APOE:composite",
      rsid: "rs429358",
      gene: "APOE",
      domain: n.domain,
      chromosome: n.chromosome,
      position: n.position,
      observed_genotype: n.observed_genotype,
      observed_value: n.observed_value,
      genotype_short: n.genotype_short,
      takeaway: n.takeaway,
      sentiment: n.sentiment,
      evidence_support: n.evidence_support,
      evidence_support_label: n.evidence_support_label,
      genotype_meaning: n.genotype_meaning ?? "",
      phenotype_meaning: n.phenotype_meaning,
      biology: n.biology,
      monitoring: n.monitoring,
      effect_humanized: n.effect_humanized,
      confidence_humanized: n.confidence_humanized,
      genotype_pop_freq: n.genotype_pop_freq,
      sample_size: n.sample_size,
      replications: n.replications,
      ancestry_note: n.ancestry_note,
      dbsnp_url: n.dbsnp_url,
      clinvar_url: n.clinvar_url,
      phenotype_tags: n.phenotype_tags,
      pathway_tags: n.pathway_tags,
    });
  }

  const cyp = inferCyp2c19Star(variants["rs4244285"]?.genotype);
  const cypCard = cyp ? cypToCard(cyp) : null;
  if (cyp) {
    suppressed.add("rs4244285");
    const n = cyp.narrative;
    findings.push({
      id: "CYP2C19:composite",
      rsid: "rs4244285",
      gene: "CYP2C19",
      domain: n.domain,
      chromosome: n.chromosome,
      position: n.position,
      observed_genotype: n.observed_genotype,
      observed_value: n.observed_value,
      genotype_short: n.genotype_short,
      takeaway: n.takeaway,
      sentiment: n.sentiment,
      evidence_support: n.evidence_support,
      evidence_support_label: n.evidence_support_label,
      genotype_meaning: n.genotype_meaning ?? "",
      phenotype_meaning: n.phenotype_meaning,
      biology: n.biology,
      monitoring: n.monitoring,
      effect_humanized: n.effect_humanized,
      confidence_humanized: n.confidence_humanized,
      genotype_pop_freq: n.genotype_pop_freq,
      sample_size: n.sample_size,
      replications: n.replications,
      ancestry_note: n.ancestry_note,
      dbsnp_url: n.dbsnp_url,
      clinvar_url: n.clinvar_url,
      phenotype_tags: n.phenotype_tags,
      pathway_tags: n.pathway_tags,
    });
  }

  findings.push(...interpretCuratedPacks(variants));

  let kbMatched = 0;
  let kbAbsent = 0;

  for (const locus of kb.loci) {
    const rsid = locus.rsid.toLowerCase();
    if (suppressed.has(rsid)) continue;

    const row = variants[rsid];
    if (!row) {
      kbAbsent++;
      continue;
    }

    kbMatched++;
    if (!locus.clinical_note?.trim()) {
      // Expanded KB rows are intentionally raw-call only unless they have
      // human-curated narrative. Do not infer phenotype from template data.
      continue;
    }
    const gt = [...row.genotype.toUpperCase()].sort().join("");
    const hit = locus.by_genotype[gt] ?? locus.by_genotype[row.genotype.toUpperCase()];
    if (!hit) {
      extraFlags.push(`unmapped_genotype:${rsid}:${row.genotype}`);
      continue;
    }

    findings.push(findingFromSingle(locus, row, gt, hit));
  }

  const qc_notes = [
    qc.impliedBuild
      ? `Implied genome build hint: ${qc.impliedBuild}`
      : "No genome build banner detected — assume shipped build for your chip revision.",
    `Indexed ${qc.variantsIndexed.toLocaleString()} rsIDs.`,
    qc.duplicateRsids.length
      ? `Duplicate rsIDs (${qc.duplicateRsids.slice(0, 8).join(", ")}${qc.duplicateRsids.length > 8 ? ", …" : ""})`
      : "No duplicate rsIDs.",
    qc.malformedLines ? `${qc.malformedLines} malformed lines skipped.` : "No malformed data lines detected.",
    extraFlags.length > qc.flags.length
      ? `Additional runtime flags → ${extraFlags.slice(qc.flags.length).slice(0, 6).join("; ")}`
      : "",
    `Knowledge base v${kbVersion()} • matched ${kbMatched} loci • missing ${kbAbsent} curated loci (not genotyped).`,
    "Educational synthesis only — not a medical diagnosis.",
  ].filter(Boolean);

  findings.sort((a, b) => {
    const order: Record<Sentiment, number> = {
      action_needed: 0,
      watch: 1,
      neutral: 2,
      positive: 3,
    };
    if (order[a.sentiment] !== order[b.sentiment]) return order[a.sentiment] - order[b.sentiment];
    return a.gene.localeCompare(b.gene);
  });

  const actions = buildActions(findings);

  const actionsFlat = [
    ...actions.urgent,
    ...actions.clinical,
    ...actions.labs,
    ...actions.lifestyle,
  ];

  return {
    summary: {
      variants_analyzed: qc.variantsIndexed,
      kb_matched: kbMatched,
      kb_not_on_chip: kbAbsent,
      findings_count: findings.length,
      urgent_count: findings.filter((f) => f.sentiment === "action_needed").length,
      actions_count: actionsFlat.length,
      domains: uniq(findings.map((f) => f.domain)),
    },
    highlights: buildHighlights(findings),
    haplotypes: buildHaplotypes(findings, apoeCard, cypCard),
    findings,
    pathway_stacking: buildPathways(findings),
    correlations: buildCorrelations(findings),
    actions,
    qc_notes,
    gene_calls: buildGeneCalls(findings),
  };
}
