import { z } from "zod";

export const evidenceSupportSchema = z.enum([
  "clinical_and_wellness",
  "clinical_only",
  "wellness_only",
]);

export const sentimentSchema = z.enum([
  "positive",
  "neutral",
  "watch",
  "action_needed",
]);

export const genotypeBlockSchema = z.object({
  sentiment: sentimentSchema,
  evidence_support: evidenceSupportSchema,
  phenotype_short: z.string(),
  takeaway: z.string(),
  genotype_meaning: z.string().optional(),
  phenotype_meaning: z.string(),
  biology: z.string(),
  monitoring: z.string(),
  population_freq: z.record(z.union([z.number(), z.null()])).nullable().optional(),
  confidence_percent: z.number(),
  effect_bar: z.number(),
  sample_size: z.number(),
  replications: z.number(),
  ancestry_note: z.string(),
});

export const singleLocusSchema = z.object({
  kind: z.literal("single"),
  rsid: z.string(),
  gene: z.string(),
  chrom: z.string(),
  position: z.number(),
  domain: z.string(),
  pathway_tags: z.array(z.string()),
  ref: z.string(),
  alt: z.string(),
  allele_labels: z.record(z.string()).optional(),
  clinical_note: z.string().optional(),
  by_genotype: z.record(genotypeBlockSchema),
});

export const knowledgeBaseSchema = z.object({
  version: z.number(),
  description: z.string(),
  loci: z.array(singleLocusSchema),
});

export type KnowledgeBase = z.infer<typeof knowledgeBaseSchema>;
export type SingleLocus = z.infer<typeof singleLocusSchema>;
export type GenotypeBlock = z.infer<typeof genotypeBlockSchema>;
