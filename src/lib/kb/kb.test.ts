import { describe, expect, it } from "vitest";
import { loadKb } from "./loadKb";

describe("curated KB sanity checks", () => {
  it("does not reverse ADH1B rs1229984 fast/slow alleles", () => {
    const locus = loadKb().loci.find((x) => x.rsid === "rs1229984");

    expect(locus?.by_genotype.AA.phenotype_short.toLowerCase()).toContain("fast");
    expect(locus?.by_genotype.GG.phenotype_short.toLowerCase()).toContain("slower");
  });

  it("uses 23andMe/reference plus-strand alleles for ADH1C rs698", () => {
    const locus = loadKb().loci.find((x) => x.rsid === "rs698");

    expect(locus?.position).toBe(100260789);
    expect(locus?.ref).toBe("T");
    expect(locus?.alt).toBe("C");
    expect(Object.keys(locus?.by_genotype ?? {}).sort()).toEqual(["CC", "CT", "TT"]);
  });
});
