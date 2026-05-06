import { kbVersion } from "../kb/loadKb";
import type {
  AnalyzeResult,
  EnrichmentRecord,
  VariantRow,
} from "../types";
import { EXPORT_APP_VERSION } from "../interpret/analyze";

export interface RawExportBundle {
  export_meta: {
    app_version: string;
    kb_version: number;
    iso_timestamp: string;
    bundle_kind: "raw_calls" | "full_report";
  };
  source_file: {
    implied_genome_build?: string;
    qc_flags: string[];
    variants_indexed: number;
    lines_read: number;
    duplicate_rsids_count: number;
    malformed_lines: number;
    header_lines: string[];
  };
  coverage: {
    kb_matched: number;
    kb_not_on_chip: number;
    kb_total_loci: number;
  };
  variants_catalog: Array<Pick<VariantRow, "rsid" | "chromosome" | "position" | "genotype">>;
  gene_level_calls: AnalyzeResult["gene_calls"];
}

export interface FullExportBundle extends RawExportBundle {
  export_meta: RawExportBundle["export_meta"] & { bundle_kind: "full_report" };
  interpretive_bundle: Omit<AnalyzeResult, "gene_calls">;
  disclaimers: {
    nondiagnostic_banner: string;
    privacy_note: string;
  };
  enrichment_optional?: Record<string, EnrichmentRecord>;
}

export interface ExportInputs {
  analyze: AnalyzeResult;
  variantsSubset: VariantRow[];
  qcSummary: RawExportBundle["source_file"];
  enrichment?: Record<string, EnrichmentRecord>;
  kb_total_loci: number;
}

function meta(bundle: RawExportBundle["export_meta"]["bundle_kind"]) {
  return {
    app_version: EXPORT_APP_VERSION,
    kb_version: kbVersion(),
    iso_timestamp: new Date().toISOString(),
    bundle_kind: bundle,
  };
}

export function buildRawBundle(inp: ExportInputs): RawExportBundle {
  return {
    export_meta: { ...meta("raw_calls") },
    source_file: {
      implied_genome_build: inp.qcSummary.implied_genome_build,
      qc_flags: inp.qcSummary.qc_flags,
      variants_indexed: inp.qcSummary.variants_indexed,
      lines_read: inp.qcSummary.lines_read,
      duplicate_rsids_count: inp.qcSummary.duplicate_rsids_count,
      malformed_lines: inp.qcSummary.malformed_lines,
      header_lines: inp.qcSummary.header_lines,
    },
    coverage: {
      kb_matched: inp.analyze.summary.kb_matched,
      kb_not_on_chip: inp.analyze.summary.kb_not_on_chip,
      kb_total_loci: inp.kb_total_loci,
    },
    variants_catalog: inp.variantsSubset.map((v) => ({
      rsid: v.rsid,
      chromosome: v.chromosome,
      position: v.position,
      genotype: v.genotype,
    })),
    gene_level_calls: inp.analyze.gene_calls,
  };
}

export function buildFullBundle(
  inp: ExportInputs,
): FullExportBundle {
  const raw = buildRawBundle(inp);
  const { gene_calls: _omit, ...restInterpret } = inp.analyze;

  return {
    ...raw,
    export_meta: { ...raw.export_meta, bundle_kind: "full_report" },
    gene_level_calls: raw.gene_level_calls,
    interpretive_bundle: restInterpret,
    disclaimers: {
      nondiagnostic_banner:
        "This export is synthesized for educational use. It does not diagnose, treat, or predict medical outcomes.",
      privacy_note:
        "Generated offline in your browser. Optional enrichment queried public variant APIs without uploading your genotype file.",
    },
    ...(inp.enrichment && Object.keys(inp.enrichment).length
      ? { enrichment_optional: inp.enrichment }
      : {}),
  };
}
