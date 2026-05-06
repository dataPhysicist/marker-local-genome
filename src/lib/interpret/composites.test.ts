import { describe, expect, it } from "vitest";
import { inferApoeDiplotype } from "./composites";

describe("APOE diplotype inference", () => {
  it("calls the common plus-strand TT/CC pattern as e3/e3, not e4/e4", () => {
    const result = inferApoeDiplotype("TT", "CC");

    expect(result?.label).toBe("ε3/ε3");
    expect(result?.narrative.confidence_humanized.label).toBe("High");
  });

  it("calls plus-strand CC/CC as e4/e4", () => {
    const result = inferApoeDiplotype("CC", "CC");

    expect(result?.label).toBe("ε4/ε4");
    expect(result?.sentiment).toBe("watch");
  });

  it("reports double heterozygotes as lower-certainty unphased inference", () => {
    const result = inferApoeDiplotype("CT", "CT");

    expect(result?.label).toContain("ε2/ε4");
    expect(result?.narrative.confidence_humanized.label).toBe("Moderate");
  });
});

describe("CYP2C19 partial marker inference", () => {
  it("does not overcall no rs4244285 *2 tag as CYP2C19 *1/*1", async () => {
    const { inferCyp2c19Star } = await import("./composites");
    const result = inferCyp2c19Star("GG");

    expect(result?.stars).toContain("partial");
    expect(result?.narrative.confidence_humanized.label).toBe("Low");
  });
});
