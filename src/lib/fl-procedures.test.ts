import { describe, expect, it } from "vitest";
import { matchProcedures, proceduresToContext, FL_PROCEDURES } from "./fl-procedures";

describe("FL Mastery Pack matcher", () => {
  it("routes real questions to the right procedure", () => {
    expect(matchProcedures("how do I sidechain my bass to the kick?")[0].id).toBe("sidechain-fk1");
    expect(matchProcedures("my vocal needs EQ, it is muddy")[0].id).toBe("eq2-basics");
    expect(matchProcedures("how do I bounce a wav")[0].id).toBe("export-wav");
  });

  it("caps results and stays deterministic", () => {
    const a = matchProcedures("how do I add plugin effects and route them in the mixer", 2);
    expect(a.length).toBeLessThanOrEqual(2);
    const b = matchProcedures("how do I add plugin effects and route them in the mixer", 2);
    expect(a.map((p) => p.id)).toEqual(b.map((p) => p.id));
  });

  it("unrelated questions attach nothing (no wasted AI tokens)", () => {
    expect(matchProcedures("where can I buy milk")).toHaveLength(0);
    // every procedure keeps its steps user-facing-short for the R9.5 renderer
    for (const p of FL_PROCEDURES) expect(p.steps.every((s) => s.length < 110)).toBe(true);
  });

  it("context text is compact and contains the steps", () => {
    const txt = proceduresToContext(matchProcedures("sidechain ducking"));
    expect(txt).toContain("Fruity Limiter");
    expect(txt.length).toBeLessThan(600);
  });
});

describe("Show-Me renderer contract (R9.5)", () => {
  it("every procedure carries exactly one zone per step", () => {
    for (const p of FL_PROCEDURES) expect(p.zones).toHaveLength(p.steps.length);
  });
});
