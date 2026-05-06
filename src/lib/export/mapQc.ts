import type { QcReport } from "../types";

export function mapQcToSourceSlice(qc: QcReport) {
  return {
    implied_genome_build: qc.impliedBuild,
    qc_flags: qc.flags,
    variants_indexed: qc.variantsIndexed,
    lines_read: qc.linesRead,
    duplicate_rsids_count: qc.duplicateRsids.length,
    malformed_lines: qc.malformedLines,
    header_lines: qc.headerLines,
  };
}
