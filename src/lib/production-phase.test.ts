import { describe, expect, it } from "vitest";
import {
  buildAddElementPrompt,
  buildArrangePrompt,
  buildBeatPhasePrompt,
  buildBodyPhasePrompt,
  buildRebouncePrompt,
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

  it("moves between phases and clamps at both ends", () => {
    expect(nextProductionPhase("BEAT")).toBe("BODY");
    expect(nextProductionPhase("ARRANGE")).toBe("DONE");
    expect(nextProductionPhase("DONE")).toBe("DONE");
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

  it("buildRebouncePrompt reports the phase, the delta and what moved", () => {
    const up = buildRebouncePrompt({
      phase: "BODY",
      projectName: "Nightdrive",
      scoreBefore: 62,
      scoreAfter: 74,
      resolvedThisRound: ["Muddy low-mids"],
      stillOpen: ["Harsh 3 kHz"],
    });
    expect(up).toContain("BODY phase");
    expect(up).toContain("74/100 (was 62)");
    expect(up).toContain("up 12");
    expect(up).toContain("Muddy low-mids");
    expect(up).toContain("Harsh 3 kHz");

    const down = buildRebouncePrompt({ phase: "BEAT", scoreBefore: 70, scoreAfter: 61 });
    expect(down).toContain("down 9");
    expect(down).toContain("Nothing has been confirmed fixed");

    const none = buildRebouncePrompt({ phase: "ARRANGE" });
    expect(none).toContain("No mix score is available yet");
  });
});
