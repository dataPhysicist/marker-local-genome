import type { ConfidenceHumanized, Finding, Sentiment, VariantRow } from "../types";

type PackFinding = Omit<Finding, "id">;

function sorted(g?: string) {
  return g ? [...g.toUpperCase()].sort().join("") : undefined;
}

function conf(label: ConfidenceHumanized["label"], percent: number, explanation: string) {
  return { label, percent, explanation };
}

function urls(rsid: string) {
  return {
    dbsnp_url: `https://www.ncbi.nlm.nih.gov/snp/${rsid}`,
    clinvar_url: `https://www.ncbi.nlm.nih.gov/clinvar/?term=${rsid}`,
  };
}

function baseFinding(input: {
  rsid: string;
  gene: string;
  domain: string;
  row: VariantRow;
  observedValue: string;
  genotypeShort: string;
  takeaway: string;
  sentiment: Sentiment;
  evidence: Finding["evidence_support"];
  evidenceLabel: string;
  genotypeMeaning: string;
  phenotypeMeaning: string;
  biology: string;
  monitoring: string;
  confidence: ConfidenceHumanized;
  effectBar: number;
  effectLabel?: string;
  ancestryNote: string;
  phenotypeTags: string[];
  pathwayTags: string[];
  sampleSize?: number;
  replications?: number;
}): PackFinding {
  return {
    rsid: input.rsid,
    gene: input.gene,
    domain: input.domain,
    chromosome: input.row.chromosome,
    position: input.row.position,
    observed_genotype: input.row.genotype,
    observed_value: input.observedValue,
    genotype_short: input.genotypeShort,
    takeaway: input.takeaway,
    sentiment: input.sentiment,
    evidence_support: input.evidence,
    evidence_support_label: input.evidenceLabel,
    genotype_meaning: input.genotypeMeaning,
    phenotype_meaning: input.phenotypeMeaning,
    biology: input.biology,
    monitoring: input.monitoring,
    effect_humanized: {
      label: input.effectLabel ?? (input.effectBar >= 4 ? "Notable effect" : "Contextual effect"),
      explanation:
        input.effectBar >= 4
          ? "This marker has meaningful published clinical or physiologic relevance, but confirmatory context still matters."
          : "This is best treated as a contextual signal rather than a stand-alone conclusion.",
      bar: input.effectBar,
    },
    confidence_humanized: input.confidence,
    sample_size: input.sampleSize ?? 0,
    replications: input.replications ?? 0,
    ancestry_note: input.ancestryNote,
    ...urls(input.rsid),
    phenotype_tags: input.phenotypeTags,
    pathway_tags: input.pathwayTags,
  };
}

const partialClinical = "Curated marker screen (confirm clinically before decisions)";
const wellnessPartial = "Wellness / ancestry-sensitive marker (not diagnostic)";

export function interpretCuratedPacks(variants: Record<string, VariantRow>): Finding[] {
  const findings: Finding[] = [];

  const add = (id: string, f: PackFinding) => findings.push({ id, ...f });

  const hfeC282Y = variants.rs1800562;
  const hfeH63D = variants.rs1799945;
  if (hfeC282Y || hfeH63D) {
    const c282y = sorted(hfeC282Y?.genotype);
    const h63d = sorted(hfeH63D?.genotype);
    const c282yCarrier = c282y === "AG";
    const c282yHomo = c282y === "AA";
    const h63dCarrier = h63d === "CG";
    const h63dHomo = h63d === "GG";
    const compound = c282yCarrier && (h63dCarrier || h63dHomo);

    const row = hfeC282Y ?? hfeH63D!;
    let sentiment: Sentiment = "neutral";
    let short = "No high-impact HFE marker detected among tested loci.";
    let takeaway = "HFE screen did not detect C282Y risk genotype among the markers available here.";
    let effectBar = 2;

    if (c282yHomo) {
      sentiment = "action_needed";
      short = "C282Y homozygous marker detected.";
      takeaway = "HFE C282Y homozygous marker detected; discuss confirmatory testing and iron indices with a clinician.";
      effectBar = 5;
    } else if (compound) {
      sentiment = "watch";
      short = "Possible C282Y/H63D compound pattern from tested markers.";
      takeaway = "HFE C282Y plus H63D markers detected; iron overload risk can be higher than a single-carrier pattern.";
      effectBar = 4;
    } else if (c282yCarrier || h63dCarrier || h63dHomo) {
      sentiment = "watch";
      short = "HFE carrier/modifier marker detected.";
      takeaway = "One or more HFE iron-handling markers detected; actual iron status should be judged by ferritin and transferrin saturation.";
      effectBar = 3;
    }

    add(
      "HFE:iron-pack",
      baseFinding({
        rsid: hfeC282Y?.rsid ?? hfeH63D!.rsid,
        gene: "HFE",
        domain: "hematology_iron",
        row,
        observedValue: `C282Y ${c282y ?? "missing"}; H63D ${h63d ?? "missing"}`,
        genotypeShort: short,
        takeaway,
        sentiment,
        evidence: sentiment === "neutral" ? "wellness_only" : "clinical_and_wellness",
        evidenceLabel: partialClinical,
        genotypeMeaning:
          "This combines rs1800562 (C282Y; A is the risk allele in standard 23andMe/reference notation) and rs1799945 (H63D; G is the modifier allele).",
        phenotypeMeaning:
          "HFE variants can influence iron absorption, but genotype is not iron overload. Ferritin and transferrin saturation determine current physiologic status.",
        biology:
          "HFE participates in hepcidin-mediated iron regulation. C282Y has stronger penetrance than H63D; H63D alone is usually a weaker modifier.",
        monitoring:
          "If a risk pattern is present, confirm with a clinical assay and review ferritin, transferrin saturation, CBC, liver enzymes, and family history.",
        confidence: conf(
          hfeC282Y ? "High" : "Moderate",
          hfeC282Y ? 86 : 72,
          hfeC282Y
            ? "C282Y/H63D are common directly genotyped HFE markers, but penetrance is incomplete."
            : "Partial HFE screen because C282Y was not available in the uploaded data.",
        ),
        effectBar,
        ancestryNote:
          "Clinical penetrance differs by ancestry, sex, age, and environment. Do not infer iron overload from genotype alone.",
        phenotypeTags: ["iron", "hemochromatosis_screen"],
        pathwayTags: ["iron_homeostasis"],
      }),
    );
  }

  const lactase = variants.rs4988235;
  if (lactase) {
    const g = sorted(lactase.genotype);
    const persistent = g === "CT" || g === "TT";
    add(
      "MCM6:lactase",
      baseFinding({
        rsid: "rs4988235",
        gene: "MCM6/LCT",
        domain: "micro_nutrients",
        row: lactase,
        observedValue: g ?? lactase.genotype,
        genotypeShort: persistent ? "Lactase persistence marker present." : "No European lactase-persistence T allele detected.",
        takeaway: persistent
          ? "Lactase persistence marker detected; many carriers tolerate lactose into adulthood."
          : "No rs4988235 lactase-persistence T allele detected; adult lactose intolerance is more likely in populations where this marker is informative.",
        sentiment: persistent ? "neutral" : "watch",
        evidence: "wellness_only",
        evidenceLabel: wellnessPartial,
        genotypeMeaning:
          "rs4988235 T is a common lactase-persistence marker near LCT in many European-ancestry studies.",
        phenotypeMeaning:
          "This marker can help explain adult lactose tolerance, but it is not universal across ancestries and does not replace symptom response.",
        biology:
          "The variant lies in an MCM6 regulatory region affecting LCT expression persistence after childhood.",
        monitoring:
          "Use symptoms and dietary response as the primary guide. Consider lactose-free trials or clinician-directed testing if symptoms are unclear.",
        confidence: conf("Moderate", 78, "Strong in many European cohorts; less complete across global lactase-persistence haplotypes."),
        effectBar: 3,
        ancestryNote:
          "This single marker is incomplete outside populations where rs4988235 captures the local lactase-persistence haplotype.",
        phenotypeTags: ["lactose", "digestion"],
        pathwayTags: ["lactase_regulation"],
      }),
    );
  }

  const f5 = variants.rs6025;
  if (f5) {
    const g = sorted(f5.genotype);
    const carrier = g === "CT";
    const homo = g === "TT";
    add(
      "F5:factor-v-leiden",
      baseFinding({
        rsid: "rs6025",
        gene: "F5",
        domain: "coagulation",
        row: f5,
        observedValue: g ?? f5.genotype,
        genotypeShort: homo ? "Factor V Leiden homozygous marker." : carrier ? "Factor V Leiden carrier marker." : "No Factor V Leiden T allele detected.",
        takeaway:
          carrier || homo
            ? "Factor V Leiden marker detected; confirm clinically and review clot-risk context before high-risk situations."
            : "No Factor V Leiden marker detected at rs6025.",
        sentiment: homo ? "action_needed" : carrier ? "watch" : "neutral",
        evidence: carrier || homo ? "clinical_and_wellness" : "wellness_only",
        evidenceLabel: partialClinical,
        genotypeMeaning:
          "rs6025 T corresponds to the Factor V Leiden risk allele in standard reference/23andMe-style notation.",
        phenotypeMeaning:
          "Factor V Leiden increases venous thrombosis susceptibility, especially with other risk factors; it is not a clot diagnosis.",
        biology:
          "The variant makes factor V more resistant to activated protein C, shifting coagulation balance toward thrombosis.",
        monitoring:
          "If present, discuss confirmatory testing with a clinician, especially before estrogen therapy, pregnancy, surgery, immobilization, or if there is clot history.",
        confidence: conf("High", 88, "Directly genotyped canonical Factor V Leiden marker; clinical context determines management."),
        effectBar: carrier || homo ? 5 : 2,
        ancestryNote:
          "More common in European ancestry; thrombotic risk is strongly modified by personal and environmental factors.",
        phenotypeTags: ["thrombosis", "coagulation"],
        pathwayTags: ["coagulation"],
      }),
    );
  }

  const f2 = variants.rs1799963;
  if (f2) {
    const g = sorted(f2.genotype);
    const carrier = g === "AG";
    const homo = g === "AA";
    add(
      "F2:prothrombin",
      baseFinding({
        rsid: "rs1799963",
        gene: "F2",
        domain: "coagulation",
        row: f2,
        observedValue: g ?? f2.genotype,
        genotypeShort: carrier || homo ? "Prothrombin G20210A marker detected." : "No Prothrombin G20210A A allele detected.",
        takeaway:
          carrier || homo
            ? "F2 prothrombin G20210A marker detected; confirm clinically and interpret with clot-risk context."
            : "No prothrombin G20210A marker detected at rs1799963.",
        sentiment: homo ? "action_needed" : carrier ? "watch" : "neutral",
        evidence: carrier || homo ? "clinical_and_wellness" : "wellness_only",
        evidenceLabel: partialClinical,
        genotypeMeaning:
          "rs1799963 A corresponds to the prothrombin G20210A risk allele in common reference notation.",
        phenotypeMeaning:
          "The A allele is associated with increased prothrombin levels and venous thrombosis susceptibility, not a diagnosis.",
        biology:
          "The 3-prime UTR variant can increase prothrombin expression, influencing coagulation tendency.",
        monitoring:
          "If present, confirm clinically and review personal/family clot history and high-risk exposures with a clinician.",
        confidence: conf("High", 86, "Canonical directly genotyped marker; clinical action depends on context."),
        effectBar: carrier || homo ? 4 : 2,
        ancestryNote: "Risk estimates vary by ancestry and coexisting clot-risk factors.",
        phenotypeTags: ["thrombosis", "coagulation"],
        pathwayTags: ["coagulation"],
      }),
    );
  }

  const slco = variants.rs4149056;
  if (slco) {
    const g = sorted(slco.genotype);
    const decreased = g === "CT";
    const low = g === "CC";
    add(
      "SLCO1B1:rs4149056",
      baseFinding({
        rsid: "rs4149056",
        gene: "SLCO1B1",
        domain: "pharmacogenomics",
        row: slco,
        observedValue: g ?? slco.genotype,
        genotypeShort: low ? "Two decreased-function C alleles." : decreased ? "One decreased-function C allele." : "No rs4149056 C allele detected.",
        takeaway:
          decreased || low
            ? "SLCO1B1 decreased-function marker detected; statin muscle-symptom risk can be higher for some statins/doses."
            : "No SLCO1B1 rs4149056 decreased-function C allele detected.",
        sentiment: low ? "action_needed" : decreased ? "watch" : "neutral",
        evidence: decreased || low ? "clinical_and_wellness" : "wellness_only",
        evidenceLabel: partialClinical,
        genotypeMeaning:
          "rs4149056 C is a decreased-function SLCO1B1 marker used in statin pharmacogenomic guidance.",
        phenotypeMeaning:
          "Reduced hepatic statin uptake can increase systemic statin exposure and muscle adverse-effect susceptibility, especially with simvastatin.",
        biology:
          "SLCO1B1 encodes OATP1B1, a hepatic transporter involved in statin uptake.",
        monitoring:
          "Do not change medication from this app. Share with the prescriber if statin choice/dose or muscle symptoms are relevant.",
        confidence: conf("High", 84, "Well-established marker, but full PGx interpretation depends on medication and dose."),
        effectBar: decreased || low ? 4 : 2,
        ancestryNote: "Allele frequency and statin-specific effect size vary by ancestry and medication.",
        phenotypeTags: ["statins", "myopathy_risk"],
        pathwayTags: ["drug_transport"],
      }),
    );
  }

  const vkorc = variants.rs9923231;
  if (vkorc) {
    const g = sorted(vkorc.genotype);
    const sensitive = g === "AG" || g === "AA";
    add(
      "VKORC1:rs9923231",
      baseFinding({
        rsid: "rs9923231",
        gene: "VKORC1",
        domain: "pharmacogenomics",
        row: vkorc,
        observedValue: g ?? vkorc.genotype,
        genotypeShort: sensitive ? "Warfarin sensitivity / lower-dose marker present." : "No rs9923231 A sensitivity allele detected.",
        takeaway: sensitive
          ? "VKORC1 warfarin-sensitivity marker detected; dosing should be clinician-managed with INR and PGx context."
          : "No VKORC1 rs9923231 A sensitivity allele detected.",
        sentiment: sensitive ? "watch" : "neutral",
        evidence: sensitive ? "clinical_and_wellness" : "wellness_only",
        evidenceLabel: partialClinical,
        genotypeMeaning:
          "rs9923231 A is commonly associated with lower VKORC1 expression and lower warfarin dose requirement.",
        phenotypeMeaning:
          "Warfarin dose depends on VKORC1, CYP2C9, age, diet, interacting drugs, ancestry, and INR response.",
        biology:
          "VKORC1 encodes the warfarin drug target, vitamin K epoxide reductase complex subunit 1.",
        monitoring:
          "Never dose warfarin from this result alone. Use clinician-guided dosing algorithms and INR monitoring.",
        confidence: conf("High", 84, "Strong marker for warfarin dosing, but incomplete without CYP2C9 and clinical variables."),
        effectBar: sensitive ? 4 : 2,
        ancestryNote: "Dose algorithms include ancestry and clinical variables; this is a partial PGx signal.",
        phenotypeTags: ["warfarin", "dose_sensitivity"],
        pathwayTags: ["vitamin_k_cycle", "pharmacogenomics"],
      }),
    );
  }

  const cyp1a2 = variants.rs762551;
  if (cyp1a2) {
    const g = sorted(cyp1a2.genotype);
    const fast = g === "AA";
    add(
      "CYP1A2:caffeine",
      baseFinding({
        rsid: "rs762551",
        gene: "CYP1A2",
        domain: "sensory_caffeine",
        row: cyp1a2,
        observedValue: g ?? cyp1a2.genotype,
        genotypeShort: fast ? "Often summarized as faster caffeine metabolism marker." : "Often summarized as slower/intermediate caffeine metabolism marker.",
        takeaway: fast
          ? "CYP1A2 rs762551 AA is often described as a faster caffeine-metabolism marker, but lived response matters more."
          : "CYP1A2 rs762551 C allele is often described as slower/intermediate caffeine metabolism; treat as a low-certainty wellness cue.",
        sentiment: "neutral",
        evidence: "wellness_only",
        evidenceLabel: "Low-certainty wellness association",
        genotypeMeaning:
          "rs762551 is a common CYP1A2 tagging variant used in consumer caffeine reports; it is not a clinical metabolism test.",
        phenotypeMeaning:
          "Caffeine response is affected by sleep debt, tolerance, pregnancy, smoking, medications, liver function, and other genes.",
        biology:
          "CYP1A2 contributes to caffeine clearance, but inducibility and environmental factors are major modifiers.",
        monitoring:
          "Use symptoms, sleep quality, heart rate, anxiety, and timing response to personalize caffeine rather than relying on genotype alone.",
        confidence: conf("Low", 60, "Consumer wellness marker with mixed context dependence; do not overinterpret."),
        effectBar: 2,
        ancestryNote: "Association strength and allele frequencies vary; phenotype response is more informative.",
        phenotypeTags: ["caffeine", "sleep"],
        pathwayTags: ["xenobiotic_metabolism"],
      }),
    );
  }

  return findings;
}
