import type { EnrichmentRecord } from "../types";

/**
 * Client-side enrichment via MyVariant.info (supports browser CORS in many setups).
 * Only rsIDs are transmitted — never the full genotype file payload.
 */

const BATCH = 8;

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function pushStringish(target: Set<string>, value: unknown) {
  for (const item of asArray(value)) {
    if (typeof item === "string" && item.trim()) target.add(item.trim());
    if (typeof item === "number" && Number.isFinite(item)) target.add(String(item));
  }
}

function pushGeneNames(target: Set<string>, value: unknown) {
  for (const item of asArray(value)) {
    if (typeof item === "string" && item.trim()) {
      target.add(item.trim());
      continue;
    }
    if (!isRecord(item)) continue;
    pushStringish(target, item.symbol);
    pushStringish(target, item.genename);
    pushStringish(target, item.name);
  }
}

function collectClinicalSignificance(value: unknown, target: Set<string>) {
  for (const item of asArray(value)) {
    if (!isRecord(item)) continue;

    pushStringish(target, item.clinical_significance);
    pushStringish(target, item.clinical_significances);
    pushStringish(target, item.clinicalsignificance);
    collectClinicalSignificance(item.rcv_accession, target);
    collectClinicalSignificance(item.rcv, target);
  }
}

function parseMyVariantRecord(
  rid: string,
  url: string,
  body: unknown,
): EnrichmentRecord {
  const records = asArray(body).filter(isRecord);
  const genes = new Set<string>();
  const clinicalSignificances = new Set<string>();

  for (const record of records) {
    collectClinicalSignificance(record.clinvar, clinicalSignificances);

    const clinvars = asArray(record.clinvar).filter(isRecord);
    for (const clinvar of clinvars) {
      pushGeneNames(genes, clinvar.gene);
      pushGeneNames(genes, clinvar.genes);
      for (const rcv of asArray(clinvar.rcv_accession).filter(isRecord)) {
        pushGeneNames(genes, rcv.gene);
        pushGeneNames(genes, rcv.genes);
      }
    }

    const dbnsfp = isRecord(record.dbnsfp) ? record.dbnsfp : undefined;
    pushGeneNames(genes, dbnsfp?.genename);
    pushGeneNames(genes, dbnsfp?.ensemblgene);

    const dbsnp = isRecord(record.dbsnp) ? record.dbsnp : undefined;
    const dbsnpGene = isRecord(dbsnp?.gene) ? dbsnp.gene : undefined;
    pushGeneNames(genes, dbsnpGene?.symbol);
    pushGeneNames(genes, dbsnpGene?.name);

    const cadd = isRecord(record.cadd) ? record.cadd : undefined;
    pushGeneNames(genes, cadd?.genename);
    pushGeneNames(genes, cadd?.gene);
  }

  const links = {
    myvariant_info: url,
    dbSNP: `https://www.ncbi.nlm.nih.gov/snp/${rid}`,
    clinvar_search: `https://www.ncbi.nlm.nih.gov/clinvar/?term=${rid}`,
    pubmed_lit: `https://pubmed.ncbi.nlm.nih.gov/?term=${rid}[All+Fields]+AND+association[Filter]`,
  };

  return {
    rsid: rid,
    ...(genes.size ? { genes: [...genes] } : {}),
    ...(clinicalSignificances.size
      ? { clinical_significances: [...clinicalSignificances] }
      : {}),
    links,
  };
}

export function hasParsedEnrichment(record: EnrichmentRecord): boolean {
  return Boolean(record.genes?.length || record.clinical_significances?.length);
}

export async function enrichRsidsHybrid(
  rsids: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ records: Record<string, EnrichmentRecord>; blocked: boolean; error?: string }> {
  const unique = [...new Set(rsids.map((r) => r.trim().toLowerCase()).filter(Boolean))];
  const out: Record<string, EnrichmentRecord> = {};
  let blocked = false;

  if (!unique.length) return { records: out, blocked: false };

  try {
    for (let i = 0; i < unique.length; i += BATCH) {
      const chunk = unique.slice(i, i + BATCH);
      await Promise.all(
        chunk.map(async (rid) => {
          const url = `https://myvariant.info/v1/variant/${rid}`;
          try {
            const res = await fetch(url, {
              headers: { Accept: "application/json" },
            });
            if (!res.ok) {
              out[rid] = { rsid: rid, error: `HTTP ${res.status}` };
              return;
            }
            const body = await res.json();
            out[rid] = parseMyVariantRecord(rid, url, body);
          } catch (inner) {
            out[rid] = {
              rsid: rid,
              error: inner instanceof Error ? inner.message : String(inner),
            };
          }
        }),
      );

      if (typeof onProgress === "function") {
        onProgress(Math.min(unique.length, i + chunk.length), unique.length);
      }

      await delay(150);
    }
  } catch (e) {
    blocked = true;
    return {
      records: {},
      blocked: true,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  blocked = Object.values(out).length > 0 && Object.values(out).every((v) => v.error);
  return { records: out, blocked };
}
