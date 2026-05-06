import { afterEach, describe, expect, it, vi } from "vitest";
import { enrichRsidsHybrid, hasParsedEnrichment } from "./myvariant";

describe("myvariant enrichment", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("extracts genes from MyVariant array responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            dbnsfp: {
              genename: ["MTHFR", "MTHFR"],
            },
          },
        ],
      }),
    );

    const { records, blocked } = await enrichRsidsHybrid(["RS1801133"]);

    expect(blocked).toBe(false);
    expect(records.rs1801133.genes).toEqual(["MTHFR"]);
    expect(records.rs1801133.links?.dbSNP).toContain("rs1801133");
    expect(hasParsedEnrichment(records.rs1801133)).toBe(true);
  });

  it("extracts nested ClinVar clinical significance and genes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          clinvar: {
            rcv_accession: [
              {
                clinical_significance: "Pathogenic",
                gene: { symbol: "CYP2C19" },
              },
            ],
          },
        }),
      }),
    );

    const { records } = await enrichRsidsHybrid(["rs4244285"]);

    expect(records.rs4244285.genes).toEqual(["CYP2C19"]);
    expect(records.rs4244285.clinical_significances).toEqual(["Pathogenic"]);
  });

  it("keeps useful links but does not count links-only responses as parsed enrichment", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ dbsnp: { rsid: "rs9939609" } }),
      }),
    );

    const { records } = await enrichRsidsHybrid(["rs9939609"]);

    expect(records.rs9939609.links?.myvariant_info).toContain("myvariant.info");
    expect(hasParsedEnrichment(records.rs9939609)).toBe(false);
  });

  it("marks the run blocked only when every fetched row fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
      }),
    );

    const { records, blocked } = await enrichRsidsHybrid(["rs1", "rs2"]);

    expect(blocked).toBe(true);
    expect(records.rs1.error).toBe("HTTP 403");
    expect(records.rs2.error).toBe("HTTP 403");
  });

  it("ignores empty rsIDs without reporting a blocked network", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { records, blocked } = await enrichRsidsHybrid(["", "   "]);

    expect(records).toEqual({});
    expect(blocked).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
