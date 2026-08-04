import { describe, expect, it } from "vitest";
import { integratedLoudness, truePeakEstimate } from "./loudness";

function sine(freq: number, amp: number, fs: number, sec: number): Float32Array {
  const n = Math.floor(fs * sec);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * freq * i) / fs);
  return out;
}

describe("BS.1770 integrated loudness", () => {
  it("full-scale 1 kHz mono sine ≈ -3.0 LUFS (±0.6)", () => {
    const lufs = integratedLoudness([sine(1000, 1, 48000, 3)], 48000);
    expect(lufs).toBeGreaterThan(-3.6);
    expect(lufs).toBeLessThan(-2.4);
  });

  it("−6 dB lower input drops loudness by ≈6 LU", () => {
    const a = integratedLoudness([sine(1000, 0.5, 48000, 3)], 48000);
    const b = integratedLoudness([sine(1000, 0.25, 48000, 3)], 48000);
    expect(Math.abs((a - b) - 6.02)).toBeLessThan(0.1);
  });
});

describe("true-peak estimate", () => {
  it("recovers the amplitude of a sine and handles silence", () => {
    const tp = truePeakEstimate([sine(1000, 0.5, 48000, 1)]);
    expect(tp).toBeGreaterThan(20 * Math.log10(0.5) - 0.3);
    expect(tp).toBeLessThan(20 * Math.log10(0.5) + 0.3);
    expect(truePeakEstimate([new Float32Array(0)])).toBe(-Infinity);
  });
});
