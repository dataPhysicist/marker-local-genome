import type { AnalyzeResult } from "./types";

export function buildClinicianBriefMd(result: AnalyzeResult): string {
  const lines = [
    "# Genomic Analyzer — Clinician briefing",
    "",
    `_Generated ${new Date().toISOString()} • educational synthesis only • not diagnostic._`,
    "",
    "## Elevated vigilance findings",
    ...result.findings
      .filter((f) => f.sentiment === "action_needed" || f.sentiment === "watch")
      .slice(0, 20)
      .map(
        (f) =>
          `- **${f.gene}** (${f.observed_value}) • ${f.domain.replace(/_/g, " ")} — ${f.takeaway}`,
      ),
    "",
    "## Pharmacogenomic highlights",
    ...result.findings
      .filter((f) => f.domain === "pharmacogenomics")
      .map((f) => `- ${f.gene}: ${f.observed_value} — ${f.monitoring}`),
    "",
    "## Alcohol-metabolizing cluster",
    ...result.findings
      .filter((f) => f.domain === "alcohol_metabolism")
      .map((f) => `- ${f.gene}: ${f.observed_value} — ${f.takeaway}`),
    "",
    "## Coverage",
    `- Variants analyzed: ${result.summary.variants_analyzed.toLocaleString()}`,
    `- Curated KB loci matched: ${result.summary.kb_matched}`,
    `- Missing curated loci: ${result.summary.kb_not_on_chip}`,
    "",
  ];
  return lines.join("\n");
}
