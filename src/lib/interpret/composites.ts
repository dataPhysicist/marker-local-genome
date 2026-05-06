/** Multi-SNP calls for classics on consumer arrays (phasing caveat). */

import type { ConfidenceHumanized, Finding, Sentiment } from "../types";

const conf = (pct: number, label: string): ConfidenceHumanized => ({
  label,
  percent: pct,
  explanation:
    label === "High"
      ? "Well-replicated tagging SNPs for this gene on microarrays."
      : label === "Moderate"
        ? "Reasonable tagging-SNP inference; phased star nomenclature may differ."
        : "Partial inference from available markers only.",
});

function urls(rsid: string) {
  return {
    dbsnp_url: `https://www.ncbi.nlm.nih.gov/snp/${rsid}`,
    clinvar_url: `https://www.ncbi.nlm.nih.gov/clinvar/?term=${rsid}`,
  };
}

/**
 * APOE isoforms from rs429358 and rs7412 in plus-strand / 23andMe-style allele notation.
 *
 * Canonical teaching haplotypes:
 * - e2: rs429358 T + rs7412 T
 * - e3: rs429358 T + rs7412 C
 * - e4: rs429358 C + rs7412 C
 *
 * Because raw microarray exports are unphased, some double-heterozygous patterns are
 * reported with lower confidence rather than over-called.
 */
export function inferApoeDiplotype(
  g358: string | undefined,
  g741: string | undefined,
): {
  label: string;
  short: string;
  sentiment: Sentiment;
  evidence: Finding["evidence_support"];
  narrative: Omit<Finding, "id" | "rsid"> & { rsids: string[] };
} | null {
  if (!g358 || !g741 || g358.length !== 2 || g741.length !== 2) return null;
  const normalize = (g: string) => [...g.toUpperCase()].sort().join("");

  const a358 = normalize(g358);
  const a741 = normalize(g741);

  let label = "ambiguous / verify";
  let short = `Rare pairwise pattern (${a358} @ rs429358, ${a741} @ rs7412).`;
  let apoeConfidence = conf(60, "Low");
  let apoeUncertain = true;

  if (a358 === "TT" && a741 === "CC") {
    label = "ε3/ε3";
    short = "Most common APOE diplotype in consumer-summary tables.";
    apoeConfidence = conf(88, "High");
    apoeUncertain = false;
  } else if (a358 === "CC" && a741 === "CC") {
    label = "ε4/ε4";
    short = "Two ε4 tags in textbook tables — intensify LDL/CV discussion context.";
    apoeConfidence = conf(88, "High");
    apoeUncertain = false;
  } else if (a358 === "CT" && a741 === "CC") {
    label = "ε3/ε4";
    short = "Heterozygous ε4 tag — intermediate population risk summaries.";
    apoeConfidence = conf(84, "High");
    apoeUncertain = false;
  } else if (a358 === "TT" && a741 === "TT") {
    label = "ε2/ε2";
    short = "Two ε2 tags in mnemonic tables.";
    apoeConfidence = conf(86, "High");
    apoeUncertain = false;
  } else if (a358 === "TT" && a741 === "CT") {
    label = "ε2/ε3";
    short = "ε2-containing heterozygote in common summary charts.";
    apoeConfidence = conf(84, "High");
    apoeUncertain = false;
  } else if (a358 === "CT" && a741 === "CT") {
    label = "ε2/ε4 (unphased likely)";
    short = "Double heterozygote; commonly summarized as ε2/ε4, but confirm clinically before decisions.";
    apoeConfidence = conf(70, "Moderate");
  } else if (a358 === "CC" && a741 === "CT") {
    label = "ambiguous / verify";
    short = "Contains a rare rs429358 C + rs7412 T combination; do not interpret without confirmatory testing.";
  }

  let sentiment: Sentiment = "neutral";
  let evidence: Finding["evidence_support"] = "clinical_and_wellness";
  if (label.includes("ε4")) sentiment = "watch";
  if (apoeUncertain || label.includes("ambiguous") || label.includes("verify")) {
    sentiment = "neutral";
    evidence = "wellness_only";
  }

  const takeaway =
    apoeUncertain
      ? "APOE pairwise inference from unphased tagging SNPs is uncertain — do not use for decisions without confirmatory testing."
      : `APOE summarized as ${label} from rs429358+rs7412 — cardiovascular and brain-health context dominates at population level.`;

  const findingStem = urls("rs429358");

  const narrativeBase = {
    gene: "APOE",
    domain: "cardiometabolic",
    chromosome: "19",
    position: 45411941,
    observed_genotype: `${a358} / ${a741}`,
    observed_value: label,
    genotype_short: short,
    takeaway,
    sentiment,
    evidence_support: evidence,
    evidence_support_label:
      evidence === "clinical_and_wellness"
        ? "Strong default (clinical + wellness gates)"
        : "Emerging / wellness-tier signal (not strict clinical)",
    genotype_meaning:
      `rs429358 ${a358} with rs7412 ${a741} -> ${apoeUncertain ? "uncertain APOE inference" : `consumer-style diplotype label ${label}`}.`,
    phenotype_meaning:
      "APOE modulates lipid trafficking and neurologic resilience signals in population studies.",
    biology:
      "ApoE isoforms diverge at residues 112/158 equivalents summarized by tagging SNPs; clinical sequencing resolves rare architectures.",
    monitoring:
      "Discuss LDL trends, family history of dementia/cardiovascular disease, lifestyle — not genotype alone.",
    effect_humanized: {
      label: label.includes("ε4") ? "Notable effect" : "Moderate informational effect",
      explanation: "Population odds ratios are modest per allele; phenotype remains primary.",
      bar: label.includes("ε4") ? 4 : 3,
    },
    confidence_humanized: apoeConfidence,
    genotype_pop_freq: undefined,
    sample_size: 250000,
    replications: 18,
    ancestry_note:
      "APOE allele frequencies vary; ε4 prominence differs across continental groups.",
    ...findingStem,
    phenotype_tags: ["lipids", "neurodegeneration_risk_context"],
    pathway_tags: ["lipoprotein_metabolism"],
  };

  return {
    label,
    short,
    sentiment,
    evidence,
    narrative: { rsids: ["rs429358", "rs7412"], ...narrativeBase },
  };
}

/** Simplified CPIC-ish mnemonics from rs4244285 (+ optional tagging). */
export function inferCyp2c19Star(
  g4244285: string | undefined,
): {
  stars: string;
  sentiment: Sentiment;
  evidence: Finding["evidence_support"];
  narrative: Omit<Finding, "id" | "rsid"> & { rsids: string[] };
} | null {
  if (!g4244285 || g4244285.length !== 2) return null;
  const g = [...g4244285.toUpperCase()].sort().join("");
  let stars = "No *2 detected (partial)";
  let sentiment: Sentiment = "neutral";
  let evidence: Finding["evidence_support"] = "wellness_only";
  let confidence = conf(62, "Low");
  let takeaway =
    "CYP2C19 rs4244285 does not show the *2 loss-of-function tag, but this is not a complete CYP2C19 diplotype.";
  if (g === "AG") {
    stars = "*2 detected (heterozygous; partial)";
    sentiment = "watch";
    evidence = "clinical_and_wellness";
    confidence = conf(82, "High");
    takeaway =
      "One CYP2C19*2 loss-of-function tag detected at rs4244285; metabolizer status remains partial without *3/*17 and other allele checks.";
  } else if (g === "AA") {
    stars = "*2/*2 tag detected";
    sentiment = "action_needed";
    evidence = "clinical_and_wellness";
    confidence = conf(88, "High");
    takeaway = "Poor metabolizer tagging pattern at rs4244285 — clopidogrel activation may be impaired.";
  }
  const stem = urls("rs4244285");
  return {
    stars,
    sentiment,
    evidence,
    narrative: {
      rsids: ["rs4244285"],
      gene: "CYP2C19",
      domain: "pharmacogenomics",
      chromosome: "10",
      position: 96522463,
      observed_genotype: g,
      observed_value: stars,
      genotype_short: stars.includes("*2") ? "Reduced function allele present" : "Incomplete CYP2C19 call",
      takeaway,
      sentiment,
      evidence_support: evidence,
      evidence_support_label:
        evidence === "clinical_and_wellness"
          ? "Strong default (clinical + wellness gates)"
          : "Partial single-marker screen (not a diplotype)",
      genotype_meaning: `Derived only from rs4244285 diploid ${g}; this does not exclude CYP2C19*3, *17, rare loss-of-function alleles, or copy/phase complexities.`,
      phenotype_meaning:
        "CYP2C19 oxidizes numerous prodrugs; clopidogrel activation is canonical teaching example.",
      biology:
        "Loss-of-function *2 tagging SNPs reduce enzyme abundance/activity versus *1 inferred patterns.",
      monitoring:
        "Share with prescribing clinicians before antiplatelets, antidepressants, PPIs relying on this pathway.",
      effect_humanized: {
        label: sentiment === "action_needed" ? "Notable clinical effect" : "Notable effect",
        explanation:
          "Pharmacogene with actionable antiplatelet implications in guideline summaries.",
        bar: sentiment === "action_needed" ? 5 : 4,
      },
      confidence_humanized: confidence,
      genotype_pop_freq: g === "GG" ? 0.62 : g === "AG" ? 0.28 : 0.06,
      sample_size: 200000,
      replications: 24,
      ancestry_note:
        "*2 enriched in East Asians versus Europeans; clinician panels still recommended for prescribing.",
      ...stem,
      phenotype_tags: ["clopidogrel", "ppi_metabolism", "ssri_metabolism"],
      pathway_tags: ["phase1_metabolism"],
    },
  };
}
