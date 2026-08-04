import { describe, expect, it } from "vitest";
import { compareMetrics, compareSummary } from "./reference-compare";
import type { AudioMetrics } from "./audio-analysis";

function mk(over: Partial<AudioMetrics>): AudioMetrics {
  return {
    fileName: "x.wav", fileFormat: "wav", fileSizeBytes: 1, durationSec: 10, sampleRate: 48000,
    bitRate: 1000, channels: 2, isStereo: true, peakDb: -1, rmsDb: -14, lufsEstimate: -14,
    dynamicRangeDb: 8, stereoWidth: 0.5, stereoWidthLabel: "Moderate", bpm: 112,
    bpmConfidence: { value: 0.9, label: "high" }, detectedKey: "A Minor",
    keyConfidence: { value: 0.8, label: "high" },
    bands: { low: -8, lowMid: -10, mid: -11, highMid: -12, high: -20 },
    ...over,
  } as unknown as AudioMetrics;
}

describe("reference comparison", () => {
  it("marks matching values and flags quiet-vs-hot", () => {
    const mine = mk({});
    const ref = mk({ lufsEstimate: -9 });
    const rows = compareMetrics(mine, ref);
    const lufs = rows.find((r) => r.key === "lufs")!;
    expect(lufs.verdict).toBe("mine_lower");
    expect(rows.find((r) => r.key === "band_mid")!.verdict).toBe("match");
    expect(compareSummary(rows)).toContain("quieter");
  });

  it("handles missing/null values without crashing", () => {
    const rows = compareMetrics(mk({ bpm: null }), mk({}));
    expect(rows.find((r) => r.key === "bpm")!.delta).toBeNull();
  });
});
