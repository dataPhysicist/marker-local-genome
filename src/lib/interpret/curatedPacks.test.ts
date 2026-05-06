import { describe, expect, it } from "vitest";
import type { VariantRow } from "../types";
import { interpretCuratedPacks } from "./curatedPacks";

function v(rsid: string, genotype: string): VariantRow {
  return { rsid, chromosome: "1", position: 1, genotype };
}

describe("curated interpretation packs", () => {
  it("calls HFE C282Y/H63D as a combined iron screen", () => {
    const findings = interpretCuratedPacks({
      rs1800562: v("rs1800562", "AG"),
      rs1799945: v("rs1799945", "CG"),
    });
    const hfe = findings.find((f) => f.gene === "HFE");

    expect(hfe?.observed_value).toContain("C282Y AG");
    expect(hfe?.observed_value).toContain("H63D CG");
    expect(hfe?.sentiment).toBe("watch");
  });

  it("uses rs4988235 T as lactase persistence marker", () => {
    const findings = interpretCuratedPacks({ rs4988235: v("rs4988235", "CT") });
    const lactase = findings.find((f) => f.gene === "MCM6/LCT");

    expect(lactase?.takeaway.toLowerCase()).toContain("persistence");
    expect(lactase?.sentiment).toBe("neutral");
  });

  it("uses rs6025 T as Factor V Leiden risk allele", () => {
    const findings = interpretCuratedPacks({ rs6025: v("rs6025", "CT") });
    const f5 = findings.find((f) => f.gene === "F5");

    expect(f5?.takeaway).toContain("Factor V Leiden");
    expect(f5?.sentiment).toBe("watch");
  });

  it("keeps CYP1A2 caffeine low confidence", () => {
    const findings = interpretCuratedPacks({ rs762551: v("rs762551", "AA") });
    const cyp1a2 = findings.find((f) => f.gene === "CYP1A2");

    expect(cyp1a2?.confidence_humanized.label).toBe("Low");
    expect(cyp1a2?.evidence_support).toBe("wellness_only");
  });
});
