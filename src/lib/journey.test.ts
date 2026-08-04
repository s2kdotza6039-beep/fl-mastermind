import { describe, expect, it } from "vitest";
import { deriveJourney, journeyGuidance, MIX_STAGES } from "./journey";

const base = { hasProject: true, hasAnalysis: true } as const;

describe("journey belt derivation", () => {
  it("no project → all locked, zero progress", () => {
    const j = deriveJourney({ hasProject: false, hasAnalysis: false });
    expect(j.currentIndex).toBe(-1);
    expect(j.progress).toBe(0);
    expect(j.reachedMixReady).toBe(false);
    expect(journeyGuidance(j)).toContain("Load");
  });

  it("uploaded, not analyzed → LOAD current", () => {
    const j = deriveJourney({ hasProject: true, hasAnalysis: false });
    expect(j.current.id).toBe("LOAD");
    expect(j.currentIndex).toBe(0);
  });

  it("active plan with untouched steps → PLAN; any done → FIX", () => {
    const planJ = deriveJourney({
      ...base,
      plan: { status: "active" },
      steps: [{ status: "todo" }, { status: "todo" }],
    });
    expect(planJ.current.id).toBe("PLAN");
    const fixJ = deriveJourney({
      ...base,
      plan: { status: "active" },
      steps: [{ status: "done" }, { status: "todo" }],
    });
    expect(fixJ.current.id).toBe("FIX");
    expect(fixJ.planStepsDone).toBe(1);
    expect(journeyGuidance(fixJ)).toContain("1/2");
  });

  it("all steps done → REBOUNCE", () => {
    const j = deriveJourney({
      ...base,
      plan: { status: "active" },
      steps: [{ status: "done" }, { status: "skipped" }],
    });
    expect(j.current.id).toBe("REBOUNCE");
  });

  it("delta measured → SCORE; master_ready → MIX_READY at full progress", () => {
    const scoreJ = deriveJourney({
      ...base,
      // @ts-expect-error minimal breakdown shape for test
      latestScore: { master_ready: false, breakdown: { delta: { lufs: 0.5 } } },
    });
    expect(scoreJ.current.id).toBe("SCORE");
    const done = deriveJourney({
      ...base,
      latestScore: { master_ready: true },
    });
    expect(done.current.id).toBe("MIX_READY");
    expect(done.reachedMixReady).toBe(true);
    expect(done.progress).toBe(1);
  });

  it("stages stay in fixed order with stable indices", () => {
    expect(MIX_STAGES.map((s) => s.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});
