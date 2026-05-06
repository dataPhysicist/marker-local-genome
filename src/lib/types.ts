/** Shared analysis types (serializable for JSON export). */

export type Sentiment =
  | "positive"
  | "neutral"
  | "watch"
  | "action_needed";

export type EvidenceSupport =
  | "clinical_and_wellness"
  | "clinical_only"
  | "wellness_only";

export type ActionCategory = "urgent" | "clinical" | "labs" | "lifestyle";

export interface VariantRow {
  rsid: string;
  chromosome: string;
  position: number;
  genotype: string;
}

export interface QcReport {
  linesRead: number;
  variantsIndexed: number;
  duplicateRsids: string[];
  malformedLines: number;
  headerLines: string[];
  impliedBuild?: string;
  flags: string[];
}

export interface EffectHumanized {
  label: string;
  explanation: string;
  bar: number;
}

export interface ConfidenceHumanized {
  label: string;
  percent: number;
  explanation: string;
}

export interface Finding {
  id: string;
  rsid: string;
  gene: string;
  domain: string;
  chromosome: string;
  position: number;
  observed_genotype: string;
  observed_value: string;
  genotype_short?: string;
  takeaway: string;
  sentiment: Sentiment;
  evidence_support: EvidenceSupport;
  evidence_support_label: string;
  genotype_meaning?: string;
  phenotype_meaning: string;
  biology: string;
  monitoring: string;
  effect_humanized: EffectHumanized;
  confidence_humanized: ConfidenceHumanized;
  genotype_pop_freq?: number;
  sample_size: number;
  replications: number;
  ancestry_note: string;
  dbsnp_url: string;
  clinvar_url: string;
  phenotype_tags: string[];
  pathway_tags: string[];
}

export interface HaplotypeCard {
  gene: string;
  display_name: string;
  diplotype: string;
  diplotype_short?: string;
  diplotype_meaning?: string;
  one_liner?: string;
  what_it_does?: string;
  why_we_test?: string;
  full_name?: string;
  rsids: string[];
  diplotype_pop_freq?: number;
  confidence_humanized: ConfidenceHumanized;
  diplotype_sentiment: Sentiment;
}

export interface PathwayGroup {
  pathway: string;
  count: number;
  genes: string[];
  findings: Pick<Finding, "gene" | "effect_humanized" | "sentiment">[];
  stacking_note?: string;
}

export interface CorrelationHint {
  axis: string;
  direction: "risk_up" | "risk_dn" | "mixed";
  summary: string;
}

export interface ActionItem {
  id: string;
  category: ActionCategory;
  priority: number;
  action_text: string;
  genes: string[];
  why_sections: { label: string; text: string }[];
  what_to_do: string;
  what_to_retest: string;
}

export interface HighlightBucket {
  gene: string;
  observed_value: string;
  takeaway: string;
  sentiment: Sentiment;
}

export interface Highlights {
  positives: HighlightBucket[];
  watches: HighlightBucket[];
}

export interface Summary {
  variants_analyzed: number;
  kb_matched: number;
  kb_not_on_chip: number;
  findings_count: number;
  urgent_count: number;
  actions_count: number;
  domains: string[];
}

export interface ParseWorkerResult {
  qc: QcReport;
  variants: Record<string, VariantRow>;
}

export interface HighlightRow {
  rsid: string;
  gene: string;
  label: string;
  kind: "favorable" | "watch";
}

export interface AnalyzeResult {
  summary: Summary;
  highlights: Highlights;
  haplotypes: HaplotypeCard[];
  findings: Finding[];
  pathway_stacking: PathwayGroup[];
  correlations: CorrelationHint[];
  actions: {
    urgent: ActionItem[];
    clinical: ActionItem[];
    labs: ActionItem[];
    lifestyle: ActionItem[];
  };
  qc_notes: string[];
  gene_calls: GeneLevelCall[];
}

export interface GeneLevelCall {
  gene: string;
  rsid_evidence: { rsid: string; genotype: string; chrom?: string; position?: number }[];
  resolved_call: string;
  phenotype_tags: string[];
  call_confidence: "high" | "medium" | "low" | "partial";
  no_call_reasons: string[];
}

export interface EnrichmentRecord {
  rsid: string;
  genes?: string[];
  clinical_significances?: string[];
  error?: string;
  links?: Record<string, string>;
}
