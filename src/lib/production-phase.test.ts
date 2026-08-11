import { describe, expect, it } from "vitest";
import {
  buildAddElementPrompt,
  buildArrangePrompt,
  buildBeatPhasePrompt,
  buildBodyPhasePrompt,
  detectSketch,
  nextProductionPhase,
  prevProductionPhase,
  PRODUCTION_PHASES,
  readProductionPhase,
} from "./production-phase";

describe("production phase", () => {
  it("defaults to BEAT when session_notes is empty or malformed", () => {
    expect(readProductionPhase(null)).toBe("BEAT");
    expect(readProductionPhase({})).toBe("BEAT");
    expect(readProductionPhase({ productionPhase: "NOPE" })).toBe("BEAT");
  });

  it("reads a stored phase", () => {
    expect(readProductionPhase({ productionPhase: "ARRANGE" })).toBe("ARRANGE");
  });

  it("advances and clamps at DONE", () => {
    expect(nextProductionPhase("BEAT")).toBe("BODY");
    expect(nextProductionPhase("ARRANGE")).toBe("DONE");
    expect(nextProductionPhase("DONE")).toBe("DONE");
  });

  it("goes back and clamps at BEAT", () => {
    expect(prevProductionPhase("DONE")).toBe("ARRANGE");
    expect(prevProductionPhase("BEAT")).toBe("BEAT");
  });

  it("keeps phase order stable", () => {
    expect(PRODUCTION_PHASES.map((p) => p.id)).toEqual(["BEAT", "BODY", "ARRANGE", "DONE"]);
  });

  it("detectSketch is honest when tonal information is missing", () => {
    expect(detectSketch()).toBe("unknown");
    expect(detectSketch({ tonalFlatness: null })).toBe("unknown");
  });

  it("detectSketch grades tonal density", () => {
    expect(detectSketch({ tonalFlatness: 0.8 })).toBe("beat-only");
    expect(detectSketch({ tonalFlatness: 0.4 })).toBe("partial");
    expect(detectSketch({ tonalFlatness: 0.1 })).toBe("full");
  });

  it("prompt builders carry the phase intent and context", () => {
    const ctx = { projectName: "Nightdrive", genre: "Amapiano", guess: "beat-only" as const };
    expect(buildBeatPhasePrompt(ctx)).toContain("BEAT phase");
    expect(buildBeatPhasePrompt(ctx)).toContain("Nightdrive");
    expect(buildAddElementPrompt(ctx)).toContain("add or improve one element");
    expect(buildBodyPhasePrompt(ctx)).toContain("BODY phase");
    expect(buildArrangePrompt(ctx)).toContain("ARRANGE phase");
  });
});
