/**
 * Parse 23andMe-style raw genotype export (tabular: rsid chromosome position genotype).
 */

import type { QcReport, VariantRow } from "./types";

const BUILD_HINT = /^#\s*(genome\s*build|reference|human genome build)[:\s]*(b\d+)/i;

export function sniffBuildFromHeader(headerLines: string[]): string | undefined {
  for (const line of headerLines) {
    const m = line.match(BUILD_HINT);
    if (m) return m[2].toUpperCase().replace("B", "hg");
    if (/build\s+37/i.test(line)) return "GRCh37";
    if (/build\s+38/i.test(line)) return "GRCh38";
    if (/GRCh37/i.test(line)) return "GRCh37";
    if (/GRCh38/i.test(line)) return "GRCh38";
  }
  return undefined;
}

function normalizeGenotype(g: string): string {
  const s = g.trim().toUpperCase();
  if (s === "--" || s === "-" || s === "DD") return s;
  if (s.length === 2) {
    const [a, b] = s.split("");
    return [a, b].sort().join("");
  }
  return s;
}

/** Parse entire file contents into qc + rsid-keyed variants. */
export function parseRawGenotypes(text: string): {
  qc: QcReport;
  variants: Record<string, VariantRow>;
} {
  const lines = text.split(/\r?\n/);
  const headerLines: string[] = [];
  const duplicateRsids: string[] = [];
  let malformedLines = 0;

  const variants: Record<string, VariantRow> = {};
  let dataLines = 0;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith("#")) {
      headerLines.push(line);
      continue;
    }

    dataLines++;

    const parts = line.split(/\s+/).filter(Boolean);
    if (parts.length < 4) {
      malformedLines++;
      continue;
    }

    const [rsidRaw, chromosome, posRaw, genotypeRaw] = parts;
    let rsid = rsidRaw.trim().toLowerCase();
    if (!rsid.startsWith("rs") && /^\d+$/.test(rsid)) rsid = `rs${rsid}`;

    const position = parseInt(posRaw, 10);
    if (!Number.isFinite(position)) {
      malformedLines++;
      continue;
    }

    if (variants[rsid]) {
      duplicateRsids.push(rsid);
    }

    variants[rsid] = {
      rsid,
      chromosome: chromosome.replace(/^chr/i, ""),
      position,
      genotype: normalizeGenotype(genotypeRaw),
    };
  }

  const impliedBuild = sniffBuildFromHeader(headerLines);
  const flags: string[] = [];
  if (duplicateRsids.length) flags.push("duplicate_rsids");
  if (malformedLines) flags.push("malformed_lines");

  const qc: QcReport = {
    linesRead: lines.length,
    variantsIndexed: Object.keys(variants).length,
    duplicateRsids: [...new Set(duplicateRsids)],
    malformedLines,
    headerLines,
    impliedBuild,
    flags,
  };

  return { qc, variants };
}
