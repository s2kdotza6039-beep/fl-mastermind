import { describe, expect, it } from "vitest";
import {
  buildAddElementPrompt,
  buildArrangePrompt,
  buildBeatPhasePrompt,
  buildBodyPhasePrompt,
  buildRebouncePrompt,
  buildVocalsPrompt,
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
    expect(readProductionPhase({ productionPhase: "VOCALS" })).toBe("VOCALS");
  });

  it("moves between phases and clamps at both ends", () => {
    expect(nextProductionPhase("BEAT")).toBe("BODY");
    expect(nextProductionPhase("ARRANGE")).toBe("VOCALS");
    expect(nextProductionPhase("VOCALS")).toBe("DONE");
    expect(nextProductionPhase("DONE")).toBe("DONE");
    expect(prevProductionPhase("DONE")).toBe("VOCALS");
    expect(prevProductionPhase("VOCALS")).toBe("ARRANGE");
    expect(prevProductionPhase("BEAT")).toBe("BEAT");
  });

  it("keeps phase order stable", () => {
    expect(PRODUCTION_PHASES.map((p) => p.id)).toEqual(["BEAT", "BODY", "ARRANGE", "VOCALS", "DONE"]);
  });

  it("VOCALS is marked optional and blurb is vocal-specific", () => {
    const vocals = PRODUCTION_PHASES.find(p => p.id === "VOCALS");
    expect(vocals?.optional).toBe(true);
    expect(vocals?.blurb.toLowerCase()).toContain("vocal");
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
    expect(buildVocalsPrompt(ctx)).toContain("VOCALS phase");
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

    const vocalBounce = buildRebouncePrompt({ phase: "VOCALS", scoreBefore: 70, scoreAfter: 78 });
    expect(vocalBounce).toContain("VOCALS phase");
    expect(vocalBounce).toContain("up 8");
  });
});
