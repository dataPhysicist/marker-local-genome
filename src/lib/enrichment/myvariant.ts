import type { EnrichmentRecord } from "../types";

/**
 * Client-side enrichment via MyVariant.info (supports browser CORS in many setups).
 * Only rsIDs are transmitted — never the full genotype file payload.
 */

const BATCH = 8;

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function enrichRsidsHybrid(
  rsids: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ records: Record<string, EnrichmentRecord>; blocked: boolean; error?: string }> {
  const unique = [...new Set(rsids.map((r) => r.toLowerCase()))];
  const out: Record<string, EnrichmentRecord> = {};
  let blocked = false;

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
            const clinvar =
              Array.isArray(body?.clinvar) && body.clinvar.length ? body.clinvar[0] : body?.clinvar;
            const rcv = clinvar?.rcv_accession ?? clinvar;
            let clinical_significances: string[] | undefined;
            const geneHits: Set<string> = new Set();
            const pushSig = (s?: string | null) => {
              if (!s) return;
              clinical_significances = clinical_significances ?? [];
              if (!clinical_significances.includes(s)) clinical_significances.push(s);
            };

            if (rcv) {
              if (rcv.clinical_significance) pushSig(String(rcv.clinical_significance));
              const genes = rcv.gene ?? rcv.name;
              if (genes?.symbol) geneHits.add(String(genes.symbol));
            }

            const dbsnp = body?.dbnsfp?.ensemblgene ? body.dbnsfp.ensemblgene : undefined;

            const links = {
              myvariant_info: url,
              dbSNP: `https://www.ncbi.nlm.nih.gov/snp/${rid}`,
              clinvar_search: `https://www.ncbi.nlm.nih.gov/clinvar/?term=${rid}`,
              pubmed_lit: `https://pubmed.ncbi.nlm.nih.gov/?term=${rid}[All+Fields]+AND+association[Filter]`,
            };

            const record: EnrichmentRecord = {
              rsid: rid,
              genes: [...geneHits, ...(typeof dbsnp === "string" ? [String(dbsnp)] : [])].filter(
                Boolean,
              ),
              ...(clinical_significances ? { clinical_significances } : {}),
              links,
            };
            out[rid] = record;
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

  blocked = Object.values(out).every((v) => v.error);
  return { records: out, blocked };
}
