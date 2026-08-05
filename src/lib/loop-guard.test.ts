import { describe, it, expect } from "vitest";
import {
  allStepsResolved,
  assessContinuation,
  fmtDur,
  isFlaggedForeign,
  isOverridden,
  flagIssue,
  overrideIssue,
} from "@/lib/loop-guard";

describe("allStepsResolved — the bridge trigger", () => {
  it("an empty plan is NOT resolved", () => {
    expect(allStepsResolved([])).toBe(false);
  });

  it("any todo step blocks resolution", () => {
    expect(allStepsResolved([{ status: "done" }, { status: "todo" }])).toBe(false);
  });

  it("done + skipped counts (the last box ticked fires the bridge)", () => {
    expect(allStepsResolved([{ status: "done" }, { status: "skipped" }, { status: "done" }])).toBe(true);
  });
});

describe("assessContinuation — same-beat guard (key primary, 2 anchors to flag)", () => {
  const prevSong = { bpm: 112, detected_key: "A minor", duration_sec: 192 };

  it("the first upload of a project always passes", () => {
    expect(assessContinuation(null, prevSong).verdict).toBe("first");
    expect(assessContinuation(undefined, prevSong).verdict).toBe("first");
  });

  it("a correct re-bounce (identical DNA) matches — key normalization included", () => {
    const v = assessContinuation(prevSong, { bpm: 112.4, detected_key: " a minor ", duration_sec: 192.0 });
    expect(v.verdict).toBe("match");
    expect(v.points).toBe(0);
  });

  it("key + duration break = MISMATCH (foreign beat), key listed first", () => {
    const v = assessContinuation(prevSong, { bpm: 112, detected_key: "C major", duration_sec: 167 });
    expect(v.verdict).toBe("mismatch");
    expect(v.reasons.length).toBe(2);
    expect(v.reasons[0]).toContain("key changed");
  });

  it("duration + tempo break with the SAME key still flags", () => {
    const v = assessContinuation(prevSong, { bpm: 96, detected_key: "A minor", duration_sec: 150 });
    expect(v.verdict).toBe("mismatch");
    expect(v.points).toBeGreaterThanOrEqual(3);
  });

  it("key ALONE stays below threshold — detector wobble forgiveness (no lock)", () => {
    const v = assessContinuation(prevSong, { bpm: 112, detected_key: "A major", duration_sec: 192 });
    expect(v.verdict).toBe("match");
    expect(v.points).toBeGreaterThan(0);
  });

  it("duration ALONE stays below threshold — arrangement edit forgiveness", () => {
    const v = assessContinuation(prevSong, { bpm: 112, detected_key: "A minor", duration_sec: 200 });
    expect(v.verdict).toBe("match");
  });

  it("tempo ALONE stays below threshold", () => {
    const v = assessContinuation(prevSong, { bpm: 120, detected_key: "A minor", duration_sec: 192 });
    expect(v.verdict).toBe("match");
  });

  it("missing anchors never count as evidence; one comparable anchor can't flag alone", () => {
    const none = assessContinuation({ bpm: null, detected_key: null, duration_sec: null }, prevSong);
    expect(none.verdict).toBe("match");
    expect(none.points).toBe(0);
    const durOnly = assessContinuation(
      { bpm: null, detected_key: null, duration_sec: 192 },
      { bpm: 90, detected_key: "C major", duration_sec: 100 },
    );
    expect(durOnly.verdict).toBe("match");
  });
});

describe("fmtDur", () => {
  it("formats mm:ss and survives null", () => {
    expect(fmtDur(192)).toBe("3:12");
    expect(fmtDur(65.4)).toBe("1:05");
    expect(fmtDur(null)).toBe("?:??");
  });
});

describe("JSONB markers (flag + override)", () => {
  it("isFlaggedForeign / isOverridden read markers and survive garbage", () => {
    const issues = [
      flagIssue("old-bounce.mp3", { verdict: "mismatch", points: 5, reasons: ["key changed (A minor → C major)"] }),
      overrideIssue(),
    ];
    expect(isFlaggedForeign(issues)).toBe(true);
    expect(isOverridden(issues)).toBe(true);
    expect(isFlaggedForeign([{ detector_id: "peak.hot" }])).toBe(false);
    expect(isOverridden("garbage")).toBe(false);
    expect(isFlaggedForeign(null)).toBe(false);
  });
});
