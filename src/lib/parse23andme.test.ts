import { describe, expect, it } from "vitest";
import { parseRawGenotypes, sniffBuildFromHeader } from "./parse23andme";

describe("parse23andme", () => {
  it("parses standardized rows & normalizes genotype order", () => {
    const text = `# comment\nrsid chromosome position genotype\nrs1\t1\t100\tAG\n`;
    const { qc, variants } = parseRawGenotypes(text);
    expect(variants.rs1.genotype).toBe("AG");
    expect(qc.variantsIndexed).toBe(1);
  });

  it("captures duplicates", () => {
    const text = `rs2 2 200 AA\nrs2 2 201 TT\n`;
    const { qc } = parseRawGenotypes(text);
    expect(qc.duplicateRsids.length).toBeGreaterThan(0);
  });

  it("sniffs genome build banners", () => {
    expect(sniffBuildFromHeader(["# Genome build B37"])).toBe("hg37");
    expect(
      sniffBuildFromHeader([
        "# We are using reference human assembly build 37 (also known as Annotation Release 104).",
      ]),
    ).toBe("GRCh37");
  });
});
