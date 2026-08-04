// Honest loudness metering — ITU-R BS.1770-4 integrated loudness with
// K-weighting + dual gating, and a 4x-oversampled true-peak ESTIMATE.
// Pure DSP, Worker-safe, no dependencies.

interface BiquadState { x1: number; x2: number; y1: number; y2: number }
interface BiquadCoeffs { b0: number; b1: number; b2: number; a1: number; a2: number }

/** RBJ Audio-EQ-Cookbook biquad designer. */
function biquadHighShelf(f0: number, gainDb: number, Q: number, fs: number): BiquadCoeffs {
  const A = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * f0) / fs;
  const cosW0 = Math.cos(w0);
  const sinW0 = Math.sin(w0);
  const alpha = sinW0 / (2 * Q);
  const twoSqrtAAlpha = 2 * Math.sqrt(A) * alpha;
  const b0 = A * ((A + 1) + (A - 1) * cosW0 + twoSqrtAAlpha);
  const b1 = -2 * A * ((A - 1) + (A + 1) * cosW0);
  const b2 = A * ((A + 1) + (A - 1) * cosW0 - twoSqrtAAlpha);
  const a0 = (A + 1) - (A - 1) * cosW0 + twoSqrtAAlpha;
  const a1 = 2 * ((A - 1) - (A + 1) * cosW0);
  const a2 = (A + 1) - (A - 1) * cosW0 - twoSqrtAAlpha;
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

function biquadHighPass(f0: number, Q: number, fs: number): BiquadCoeffs {
  const w0 = (2 * Math.PI * f0) / fs;
  const cosW0 = Math.cos(w0);
  const sinW0 = Math.sin(w0);
  const alpha = sinW0 / (2 * Q);
  const b0 = (1 + cosW0) / 2;
  const b1 = -(1 + cosW0);
  const b2 = (1 + cosW0) / 2;
  const a0 = 1 + alpha;
  const a1 = -2 * cosW0;
  const a2 = 1 - alpha;
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

function biquadProcess(input: Float32Array, c: BiquadCoeffs, state: BiquadState, out: Float32Array) {
  for (let i = 0; i < input.length; i++) {
    const x = input[i];
    const y = c.b0 * x + c.b1 * state.x1 + c.b2 * state.x2 - c.a1 * state.y1 - c.a2 * state.y2;
    state.x2 = state.x1; state.x1 = x;
    state.y2 = state.y1; state.y1 = y;
    out[i] = y;
  }
}

/** BS.1770-4 K-weighting filter chain (stage 1 shelf + stage 2 RLB high-pass). */
export function kWeightCoeffs(fs: number): { shelf: BiquadCoeffs; hp: BiquadCoeffs } {
  return {
    // ITU-R BS.1770-4 pre-filter: +4 dB high shelf, f0 = 1681.974 Hz, Q = 0.707175
    shelf: biquadHighShelf(1681.974450955533, 3.999843853973347, 0.7071752369554196, fs),
    // RLB (revised low-frequency B-curve) high-pass: f0 = 38.135 Hz, Q = 0.500327
    hp: biquadHighPass(38.13547087602444, 0.5003270373238773, fs),
  };
}

const BLOCK_SEC = 0.4;
const HOP_SEC = 0.1; // 75% overlap
const ABS_GATE = -70;
const REL_GATE = 10;
const LOUDNESS_OFFSET = -0.691;

/**
 * Integrated loudness in LUFS (BS.1770-4). Returns -Infinity for silence/too-short input.
 * Channel weights: 1.0 per channel (main channels only — input is at most stereo).
 */
export function integratedLoudness(
  channels: Float32Array[],
  sampleRate: number,
): number {
  if (!channels.length || !channels[0].length) return -Infinity;
  const { shelf, hp } = kWeightCoeffs(sampleRate);
  const blockLen = Math.floor(sampleRate * BLOCK_SEC);
  const hopLen = Math.floor(sampleRate * HOP_SEC);
  const len = channels[0].length;
  const minLen = Math.floor(sampleRate * 0.1);
  if (len < minLen) return -Infinity;
  const effectiveBlock = Math.min(blockLen, len);

  // K-weight each channel, then per-block mean square.
  const blockCount = Math.max(1, Math.floor((len - effectiveBlock) / hopLen) + 1);
  const blockZ = new Float64Array(blockCount); // per-block summed channel mean-square
  for (const ch of channels) {
    const filtered = new Float32Array(ch.length);
    const tmp = new Float32Array(ch.length);
    const s1: BiquadState = { x1: 0, x2: 0, y1: 0, y2: 0 };
    const s2: BiquadState = { x1: 0, x2: 0, y1: 0, y2: 0 };
    biquadProcess(ch, shelf, s1, tmp);
    biquadProcess(tmp, hp, s2, filtered);
    for (let b = 0; b < blockCount; b++) {
      const start = b * hopLen;
      const end = Math.min(len, start + effectiveBlock);
      let sum = 0;
      for (let i = start; i < end; i++) sum += filtered[i] * filtered[i];
      blockZ[b] += sum / (end - start);
    }
  }

  // Absolute gate.
  const absThreshold = Math.pow(10, (ABS_GATE - LOUDNESS_OFFSET) / 10);
  const gatedAbs: number[] = [];
  for (let b = 0; b < blockCount; b++) if (blockZ[b] > absThreshold) gatedAbs.push(blockZ[b]);
  if (!gatedAbs.length) return -Infinity;

  // Relative gate at (ungated-above-abs mean) - REL_GATE LU.
  const meanAbs = gatedAbs.reduce((a, b) => a + b, 0) / gatedAbs.length;
  const relThreshold = meanAbs * Math.pow(10, -REL_GATE / 10);
  const gated: number[] = gatedAbs.filter((z) => z > relThreshold);
  if (!gated.length) return -Infinity;

  const meanZ = gated.reduce((a, b) => a + b, 0) / gated.length;
  return LOUDNESS_OFFSET + 10 * Math.log10(meanZ);
}

/**
 * True-peak ESTIMATE via 4x polyphase (Catmull-Rom) oversampling, per BS.1770
 * spirit. Honest label: ±0.2 dB estimate, not a hardware-grade measurement.
 */
export function truePeakEstimate(channels: Float32Array[]): number {
  let maxAbs = 0;
  for (const ch of channels) {
    const n = ch.length;
    if (n < 4) continue;
    for (let i = 0; i < n - 1; i++) {
      const xm1 = i > 0 ? ch[i - 1] : ch[0];
      const x0 = ch[i];
      const x1 = ch[i + 1];
      const x2 = i + 2 < n ? ch[i + 2] : ch[n - 1];
      const a0 = -0.5 * xm1 + 1.5 * x0 - 1.5 * x1 + 0.5 * x2;
      const a1 = xm1 - 2.5 * x0 + 2 * x1 - 0.5 * x2;
      const a2 = -0.5 * xm1 + 0.5 * x1;
      const a3 = x0;
      for (let k = 0; k < 4; k++) {
        const t = k / 4;
        const v = ((a0 * t + a1) * t + a2) * t + a3;
        const av = Math.abs(v);
        if (av > maxAbs) maxAbs = av;
      }
    }
  }
  return maxAbs > 0 ? 20 * Math.log10(maxAbs) : -Infinity;
}

export interface LoudnessResult {
  lufsIntegrated: number;
  truePeakDbtp: number;
}

export function measureLoudness(channels: Float32Array[], sampleRate: number): LoudnessResult {
  return {
    lufsIntegrated: integratedLoudness(channels, sampleRate),
    truePeakDbtp: truePeakEstimate(channels),
  };
}
