import { describe, it, expect } from "vitest";
import { anchorFromResult, buildUploadAdvisePrompt, pickConfirmedPrev, type ContinuationStory } from "@/lib/coaching-runner";
import type { AudioAnalysisResult } from "@/lib/audio-analysis";

function fakeRes(over: Partial<AudioAnalysisResult["metrics"]> = {}): AudioAnalysisResult {
  return {
    metrics: {
      fileName: "bounce.mp3",
      fileFormat: "mp3",
      fileSizeBytes: 1234,
      durationSec: 192,
      sampleRate: 44100,
      bitRate: 320,
      channels: 2,
      peakDb: -1.2,
      rmsDb: -12,
      lufsEstimate: -14.1,
      dynamicRangeDb: 8,
      stereoWidth: 0.5,
      bpm: 112,
      detectedKey: "A minor",
      bands: { low: -10, lowMid: -12, mid: -14, highMid: -16, high: -20 },
      ...over,
    },
    issues: [],
    recommendations: [],
  } as unknown as AudioAnalysisResult;
}

describe("anchorFromResult — the guard's DNA view", () => {
  it("maps metrics onto the DNA anchors", () => {
    expect(anchorFromResult(fakeRes())).toEqual({ bpm: 112, detected_key: "A minor", duration_sec: 192 });
  });

  it("passes nulls through untouched", () => {
    expect(anchorFromResult(fakeRes({ bpm: null, detectedKey: null, durationSec: 200 }))).toEqual({
      bpm: null,
      detected_key: null,
      duration_sec: 200,
    });
  });
});

describe("pickConfirmedPrev — an un-rejected foreign beat never becomes the yardstick", () => {
  const A = { id: "A", detected_issues: [] };
  const X_foreign = { id: "X", detected_issues: [{ detector_id: "continuity.different_beat" }] };
  const X_overridden = {
    id: "Xo",
    detected_issues: [{ detector_id: "continuity.different_beat" }, { detector_id: "continuity.override" }],
  };

  it("skips the inserted row itself and returns the newest confirmed", () => {
    expect(pickConfirmedPrev([{ id: "NEW" }, A], "NEW")?.id).toBe("A");
  });

  it("skips an un-rejected foreign beat and falls back to the last confirmed", () => {
    expect(pickConfirmedPrev([{ id: "NEW" }, X_foreign, A], "NEW")?.id).toBe("A");
    expect(pickConfirmedPrev([{ id: "NEW" }, X_overridden, A], "NEW")?.id).toBe("Xo");
    expect(pickConfirmedPrev([{ id: "ONLY" }], "ONLY")).toBeNull();
  });
});

describe("buildUploadAdvisePrompt — the deterministic advise message", () => {
  it("carries the file, the headline metrics, and the newest-stock doctrine", () => {
    const p = buildUploadAdvisePrompt("bounce.mp3", fakeRes());
    expect(p).toContain('"bounce.mp3"');
    expect(p).toContain("-14.1 LUFS");
    expect(p).toContain("112 BPM");
    expect(p).toContain("A minor");
    expect(p).toContain("newest stock plugins first");
  });
});

function story(over: Partial<ContinuationStory> = {}): ContinuationStory {
  return {
    versionNumber: 3,
    score: 74,
    prevScore: 62,
    delta: 12,
    masterReady: false,
    resolvedThisRound: [],
    regressedThisRound: [],
    stillOpen: [],
    nextFix: null,
    ...over,
  };
}

describe("buildUploadAdvisePrompt — R12 continuation story", () => {
  it("frames a re-bounce with the score delta", () => {
    const p = buildUploadAdvisePrompt("v3.mp3", fakeRes(), story());
    expect(p).toContain("re-bounce v3");
    expect(p).toContain("74/100");
    expect(p).toContain("was 62");
    expect(p).toContain("up 12 points");
  });

  it("lists what was fixed and asks for the single next fix", () => {
    const p = buildUploadAdvisePrompt("v3.mp3", fakeRes(), story({
      resolvedThisRound: ["Muddy low-mid energy"],
      stillOpen: ["Narrow stereo image"],
      nextFix: "Reduce 4 kHz by 1.5 dB",
    }));
    expect(p).toContain("✅ Fixed since last bounce: Muddy low-mid energy.");
    expect(p).toContain("SINGLE next fix first: Reduce 4 kHz by 1.5 dB");
    expect(p).toContain("Still open after that: Narrow stereo image.");
  });

  it("calls out regressions and a score drop", () => {
    const p = buildUploadAdvisePrompt("v4.mp3", fakeRes(), story({
      score: 55, prevScore: 70, delta: -15, regressedThisRound: ["Clipping peaks"],
    }));
    expect(p).toContain("down 15 points");
    expect(p).toContain("⚠️ Came back: Clipping peaks.");
  });

  it("hands off to the Mastering chapter when master-ready", () => {
    const p = buildUploadAdvisePrompt("final.mp3", fakeRes(), story({ masterReady: true }));
    expect(p).toContain("🏁 The mixing chapter is done");
    expect(p).toContain("/mastering");
  });

  it("frames the very first bounce without a delta", () => {
    const p = buildUploadAdvisePrompt("first.mp3", fakeRes(), story({
      versionNumber: 1, prevScore: null, delta: null, score: 61,
    }));
    expect(p).toContain("first bounce");
    expect(p).not.toContain("was ");
    expect(p).toContain("61/100");
  });
});
