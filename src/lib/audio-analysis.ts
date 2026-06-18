// Audio Analysis Engine MVP
// Pure-browser DSP using AudioContext.decodeAudioData. No external deps.
// Returns objective metrics + diagnostic findings.

export interface AudioMetrics {
  fileName: string;
  fileFormat: string;
  fileSizeBytes: number;
  durationSec: number;
  sampleRate: number;
  bitRate: number;        // approx kbps
  channels: number;
  isStereo: boolean;
  peakDb: number;
  rmsDb: number;
  lufsEstimate: number;   // very rough perceptual loudness (K-weighted approx)
  dynamicRangeDb: number; // PSR-ish: peak - short-term loudness median
  stereoWidth: number;    // 0 (mono) .. 1 (wide)
  stereoWidthLabel: "Mono" | "Narrow" | "Moderate" | "Wide";
  bpm: number | null;
  detectedKey: string | null;
  bands: {
    low: number;     // 20–120 Hz
    lowMid: number;  // 120–500 Hz
    mid: number;     // 500–2k Hz
    highMid: number; // 2k–6k Hz
    high: number;    // 6k–20k Hz
  };
}

export interface AudioIssue {
  id: string;
  severity: "info" | "warn" | "critical";
  title: string;
  detail: string;
  recommendation: string;
}

export interface AudioAnalysisResult {
  metrics: AudioMetrics;
  issues: AudioIssue[];
  recommendations: string[];
}

const KRUMHANSL_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KRUMHANSL_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function toDb(amp: number): number {
  if (amp <= 0) return -Infinity;
  return 20 * Math.log10(amp);
}

function correlate(a: number[], b: number[]): number {
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) {
    num += a[i] * b[i];
    da += a[i] * a[i];
    db += b[i] * b[i];
  }
  const den = Math.sqrt(da * db);
  return den === 0 ? 0 : num / den;
}

function rotate(arr: number[], n: number): number[] {
  const len = arr.length;
  const k = ((n % len) + len) % len;
  return arr.slice(k).concat(arr.slice(0, k));
}

/** Build 12-bin chroma vector via Goertzel-style band energies across octaves 2–6. */
function computeChroma(samples: Float32Array, sampleRate: number): number[] {
  const chroma = new Array(12).fill(0);
  const baseFreqs: number[] = [];
  // C2 = 65.41 Hz
  for (let pc = 0; pc < 12; pc++) baseFreqs.push(65.41 * Math.pow(2, pc / 12));
  // 5 octaves
  const N = Math.min(samples.length, sampleRate * 20);
  for (let oct = 0; oct < 5; oct++) {
    for (let pc = 0; pc < 12; pc++) {
      const f = baseFreqs[pc] * Math.pow(2, oct);
      if (f >= sampleRate / 2) continue;
      // Goertzel
      const k = (2 * Math.PI * f) / sampleRate;
      const cosK = Math.cos(k);
      const coeff = 2 * cosK;
      let s0 = 0, s1 = 0, s2 = 0;
      for (let i = 0; i < N; i++) {
        s0 = samples[i] + coeff * s1 - s2;
        s2 = s1;
        s1 = s0;
      }
      const mag = Math.sqrt(s1 * s1 + s2 * s2 - coeff * s1 * s2) / N;
      chroma[pc] += mag;
    }
  }
  // Normalize
  const sum = chroma.reduce((a, b) => a + b, 0) || 1;
  return chroma.map((v) => v / sum);
}

function detectKeyFromChroma(chroma: number[]): string {
  let bestScore = -Infinity;
  let best = "C Major";
  for (let pc = 0; pc < 12; pc++) {
    const majProfile = rotate(KRUMHANSL_MAJOR, -pc);
    const minProfile = rotate(KRUMHANSL_MINOR, -pc);
    const sMaj = correlate(chroma, majProfile);
    const sMin = correlate(chroma, minProfile);
    if (sMaj > bestScore) { bestScore = sMaj; best = `${NOTE_NAMES[pc]} Major`; }
    if (sMin > bestScore) { bestScore = sMin; best = `${NOTE_NAMES[pc]} Minor`; }
  }
  return best;
}

/** Onset-envelope autocorrelation BPM in 60–180 range. */
function detectBPM(samples: Float32Array, sampleRate: number): number | null {
  const hop = 512;
  const win = 1024;
  const frames = Math.floor((samples.length - win) / hop);
  if (frames < 30) return null;
  const env = new Float32Array(frames);
  let prev = 0;
  for (let i = 0; i < frames; i++) {
    let sumSq = 0;
    const off = i * hop;
    for (let j = 0; j < win; j++) {
      const v = samples[off + j];
      sumSq += v * v;
    }
    const e = Math.sqrt(sumSq / win);
    env[i] = Math.max(0, e - prev);
    prev = e;
  }
  const fps = sampleRate / hop;
  const minLag = Math.floor(fps * 60 / 180); // 180 bpm
  const maxLag = Math.floor(fps * 60 / 60);  // 60 bpm
  let bestLag = -1, bestVal = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let acc = 0;
    for (let i = 0; i + lag < frames; i++) acc += env[i] * env[i + lag];
    if (acc > bestVal) { bestVal = acc; bestLag = lag; }
  }
  if (bestLag < 0) return null;
  const bpm = (fps * 60) / bestLag;
  return Math.round(bpm * 10) / 10;
}

/** Simple radix-2 FFT (magnitude only). */
function fftMag(samples: Float32Array): Float32Array {
  let n = 1;
  while (n < samples.length) n <<= 1;
  const re = new Float32Array(n);
  const im = new Float32Array(n);
  for (let i = 0; i < samples.length; i++) re[i] = samples[i];
  // Bit-reverse
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const ang = (-2 * Math.PI) / size;
    const wRe = Math.cos(ang), wIm = Math.sin(ang);
    for (let i = 0; i < n; i += size) {
      let curRe = 1, curIm = 0;
      for (let k = 0; k < half; k++) {
        const tRe = curRe * re[i + k + half] - curIm * im[i + k + half];
        const tIm = curRe * im[i + k + half] + curIm * re[i + k + half];
        re[i + k + half] = re[i + k] - tRe;
        im[i + k + half] = im[i + k] - tIm;
        re[i + k] += tRe;
        im[i + k] += tIm;
        const nRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nRe;
      }
    }
  }
  const mag = new Float32Array(n / 2);
  for (let i = 0; i < n / 2; i++) mag[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
  return mag;
}

function bandEnergy(mag: Float32Array, sampleRate: number, fLow: number, fHigh: number): number {
  const n = mag.length * 2;
  const lo = Math.floor((fLow * n) / sampleRate);
  const hi = Math.min(mag.length - 1, Math.ceil((fHigh * n) / sampleRate));
  let sum = 0;
  for (let i = lo; i <= hi; i++) sum += mag[i] * mag[i];
  return sum;
}

function widthLabel(w: number): AudioMetrics["stereoWidthLabel"] {
  if (w < 0.05) return "Mono";
  if (w < 0.25) return "Narrow";
  if (w < 0.55) return "Moderate";
  return "Wide";
}

function detectFormat(file: File): string {
  const m = /\.([a-z0-9]+)$/i.exec(file.name);
  return (m?.[1] || file.type.split("/").pop() || "audio").toLowerCase();
}

export async function analyzeAudioFile(
  file: File,
  onProgress?: (pct: number, label: string) => void,
): Promise<AudioAnalysisResult> {
  onProgress?.(5, "Decoding audio…");
  const arrayBuf = await file.arrayBuffer();
  const AC: typeof AudioContext =
    window.AudioContext || (window as any).webkitAudioContext;
  if (!AC) throw new Error("Your browser cannot decode audio. Try Chrome or Firefox.");
  const ctx = new AC();
  let audioBuf: AudioBuffer;
  try {
    audioBuf = await ctx.decodeAudioData(arrayBuf.slice(0));
  } catch {
    ctx.close().catch(() => {});
    throw new Error("Couldn't decode this file. Use MP3, WAV, M4A, OGG, or FLAC.");
  }
  ctx.close().catch(() => {});

  const sampleRate = audioBuf.sampleRate;
  const channels = audioBuf.numberOfChannels;
  const durationSec = audioBuf.duration;
  const left = audioBuf.getChannelData(0);
  const right = channels > 1 ? audioBuf.getChannelData(1) : left;

  // --- Peak + RMS + mono mix ---
  onProgress?.(25, "Measuring levels…");
  const mono = new Float32Array(left.length);
  let peak = 0;
  let sumSq = 0;
  let diffSq = 0;
  let sideSq = 0;
  for (let i = 0; i < left.length; i++) {
    const l = left[i], r = right[i];
    const m = (l + r) * 0.5;
    mono[i] = m;
    const ap = Math.max(Math.abs(l), Math.abs(r));
    if (ap > peak) peak = ap;
    sumSq += m * m;
    diffSq += (l - r) * (l - r);
    sideSq += ((l - r) * 0.5) * ((l - r) * 0.5);
  }
  const rms = Math.sqrt(sumSq / left.length);
  const peakDb = toDb(peak);
  const rmsDb = toDb(rms);

  // Stereo width = side/mid RMS ratio (clamped 0..1)
  const sideRms = Math.sqrt(sideSq / left.length);
  const widthRaw = rms > 0 ? sideRms / rms : 0;
  const stereoWidth = channels === 1 ? 0 : Math.max(0, Math.min(1, widthRaw));

  // --- Short-term loudness blocks (400ms) for LUFS + dynamic range ---
  onProgress?.(40, "Estimating loudness…");
  const block = Math.floor(sampleRate * 0.4);
  const blockEnergies: number[] = [];
  for (let i = 0; i + block < mono.length; i += block) {
    let s = 0;
    for (let j = 0; j < block; j++) s += mono[i + j] * mono[i + j];
    blockEnergies.push(s / block);
  }
  blockEnergies.sort((a, b) => b - a);
  // Top 30% mean as integrated-ish loudness
  const top = blockEnergies.slice(0, Math.max(1, Math.floor(blockEnergies.length * 0.3)));
  const topMean = top.reduce((a, b) => a + b, 0) / top.length;
  // Rough LUFS calibration: -0.691 + 10*log10(meanSquare) is the BS.1770 base for K-weighting (we skip K filter)
  const lufsEstimate = blockEnergies.length
    ? -0.691 + 10 * Math.log10(topMean || 1e-12)
    : -Infinity;
  // Crest factor / dynamic range: peak vs short-term loudness median
  const medIdx = Math.floor(blockEnergies.length * 0.5);
  const medE = blockEnergies[medIdx] || 1e-12;
  const dynamicRangeDb = toDb(peak) - (10 * Math.log10(medE));

  // --- Spectrum bands via FFT on a centred window ---
  onProgress?.(60, "Analyzing frequency bands…");
  const winLen = Math.min(mono.length, 1 << 15); // 32768
  const start = Math.floor((mono.length - winLen) / 2);
  const slice = new Float32Array(winLen);
  for (let i = 0; i < winLen; i++) {
    // Hann window
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (winLen - 1));
    slice[i] = mono[start + i] * w;
  }
  const mag = fftMag(slice);
  const eLow = bandEnergy(mag, sampleRate, 20, 120);
  const eLowMid = bandEnergy(mag, sampleRate, 120, 500);
  const eMid = bandEnergy(mag, sampleRate, 500, 2000);
  const eHighMid = bandEnergy(mag, sampleRate, 2000, 6000);
  const eHigh = bandEnergy(mag, sampleRate, 6000, Math.min(20000, sampleRate / 2 - 1));
  const eTotal = eLow + eLowMid + eMid + eHighMid + eHigh || 1;
  const bands = {
    low: 10 * Math.log10(eLow / eTotal + 1e-12),
    lowMid: 10 * Math.log10(eLowMid / eTotal + 1e-12),
    mid: 10 * Math.log10(eMid / eTotal + 1e-12),
    highMid: 10 * Math.log10(eHighMid / eTotal + 1e-12),
    high: 10 * Math.log10(eHigh / eTotal + 1e-12),
  };

  // --- BPM ---
  onProgress?.(75, "Detecting tempo…");
  const bpm = detectBPM(mono, sampleRate);

  // --- Key ---
  onProgress?.(88, "Detecting key…");
  // Downsample for chroma efficiency
  const targetRate = 8000;
  const ratio = sampleRate / targetRate;
  const dsLen = Math.floor(Math.min(mono.length, sampleRate * 20) / ratio);
  const ds = new Float32Array(dsLen);
  for (let i = 0; i < dsLen; i++) {
    const idx = Math.floor(i * ratio);
    ds[i] = mono[idx];
  }
  const chroma = computeChroma(ds, targetRate);
  const detectedKey = detectKeyFromChroma(chroma);

  // --- Bit rate (approx) ---
  const bitRate = Math.round(((file.size * 8) / Math.max(1, durationSec)) / 1000);

  const metrics: AudioMetrics = {
    fileName: file.name,
    fileFormat: detectFormat(file),
    fileSizeBytes: file.size,
    durationSec: Math.round(durationSec * 10) / 10,
    sampleRate,
    bitRate,
    channels,
    isStereo: channels >= 2,
    peakDb: Math.round(peakDb * 10) / 10,
    rmsDb: Math.round(rmsDb * 10) / 10,
    lufsEstimate: Math.round(lufsEstimate * 10) / 10,
    dynamicRangeDb: Math.round(dynamicRangeDb * 10) / 10,
    stereoWidth: Math.round(stereoWidth * 100) / 100,
    stereoWidthLabel: widthLabel(stereoWidth),
    bpm,
    detectedKey,
    bands: {
      low: Math.round(bands.low * 10) / 10,
      lowMid: Math.round(bands.lowMid * 10) / 10,
      mid: Math.round(bands.mid * 10) / 10,
      highMid: Math.round(bands.highMid * 10) / 10,
      high: Math.round(bands.high * 10) / 10,
    },
  };

  onProgress?.(96, "Building diagnostic report…");
  const issues = diagnose(metrics);
  const recommendations = issues.map((i) => i.recommendation);

  onProgress?.(100, "Done");
  return { metrics, issues, recommendations };
}

function diagnose(m: AudioMetrics): AudioIssue[] {
  const issues: AudioIssue[] = [];

  if (m.peakDb >= -0.1) {
    issues.push({
      id: "clipping",
      severity: "critical",
      title: "Possible clipping detected",
      detail: `Peak hit ${m.peakDb.toFixed(1)} dBFS — the signal is touching 0 dB. Inter-sample clipping is likely.`,
      recommendation: "Pull master output down 2–3 dB and re-render. Use Fruity Limiter true-peak mode with ceiling at −1.0 dBTP.",
    });
  } else if (m.peakDb > -0.5) {
    issues.push({
      id: "hot_peak",
      severity: "warn",
      title: "Peaks very close to 0 dBFS",
      detail: `Peak at ${m.peakDb.toFixed(1)} dBFS leaves almost no headroom for inter-sample peaks.`,
      recommendation: "Lower output −1 to −2 dB and use Fruity Limiter true-peak ceiling at −1.0 dBTP.",
    });
  }

  if (m.lufsEstimate < -20) {
    issues.push({
      id: "quiet_master",
      severity: "warn",
      title: "Track is significantly quieter than commercial releases",
      detail: `Loudness ≈ ${m.lufsEstimate.toFixed(1)} LUFS. Streaming targets sit around −9 to −14 LUFS.`,
      recommendation: "Stage gain through Fruity Limiter → Maximus → Fruity Limiter (true-peak, ceiling −1 dBTP). Target −9 to −10 LUFS for streaming.",
    });
  } else if (m.lufsEstimate > -7) {
    issues.push({
      id: "over_loud",
      severity: "warn",
      title: "Master is louder than streaming platforms allow",
      detail: `Loudness ≈ ${m.lufsEstimate.toFixed(1)} LUFS — Spotify will turn this down and you'll lose dynamics.`,
      recommendation: "Back off Maximus / limiter gain. Aim for −9 to −10 LUFS integrated.",
    });
  }

  if (m.dynamicRangeDb < 6) {
    issues.push({
      id: "over_compressed",
      severity: "warn",
      title: "Mix may be over-compressed",
      detail: `Dynamic range ≈ ${m.dynamicRangeDb.toFixed(1)} dB. Modern masters usually keep 8–12 dB of crest.`,
      recommendation: "Reduce limiter ceiling drive and any heavy bus compression. Aim for 8–10 dB crest factor.",
    });
  }

  if (m.isStereo && m.stereoWidth < 0.15) {
    issues.push({
      id: "narrow_stereo",
      severity: "info",
      title: "Mix is narrow in the stereo field",
      detail: `Side/mid ratio ≈ ${m.stereoWidth.toFixed(2)}. Sounds collapse toward the centre.`,
      recommendation: "Pan supporting elements, add a Fruity Stereo Shaper or use Patcher with mid/side processing on highs.",
    });
  } else if (m.isStereo && m.stereoWidth > 0.75) {
    issues.push({
      id: "wide_stereo",
      severity: "warn",
      title: "Stereo image is extremely wide",
      detail: `Side/mid ratio ≈ ${m.stereoWidth.toFixed(2)}. Check mono compatibility — phase issues may collapse the low end.`,
      recommendation: "Mono-check on a single speaker. Keep everything below ~120 Hz in mono via Fruity Stereo Shaper.",
    });
  }

  if (m.bands.low > -6) {
    issues.push({
      id: "low_buildup",
      severity: "warn",
      title: "Low-end buildup",
      detail: `Sub-bass band (20–120 Hz) carries ${m.bands.low.toFixed(1)} dB of total spectral energy — heavier than typical mixes.`,
      recommendation: "Inspect 40–80 Hz with Fruity Parametric EQ 2. Carve a notch where kick and 808 overlap; HPF everything else above 80 Hz.",
    });
  }
  if (m.bands.lowMid > -5) {
    issues.push({
      id: "muddy_lowmid",
      severity: "warn",
      title: "Muddy low-mid energy (200–400 Hz)",
      detail: `Low-mid band carries ${m.bands.lowMid.toFixed(1)} dB — typical mud region is overweight.`,
      recommendation: "On busy mid-range buses, cut 250–350 Hz by 2–3 dB with Q≈1.2 in Fruity Parametric EQ 2.",
    });
  }
  if (m.bands.highMid > -6) {
    issues.push({
      id: "harsh_highs",
      severity: "warn",
      title: "Harshness in the 2–6 kHz region",
      detail: `Upper-mid band carries ${m.bands.highMid.toFixed(1)} dB — fatiguing on long listens.`,
      recommendation: "Use a dynamic EQ (Fruity Parametric EQ 2 band in 'Band' mode + threshold via Patcher) at 3–5 kHz to tame transients.",
    });
  }
  if (m.bands.high < -22) {
    issues.push({
      id: "dull_top",
      severity: "info",
      title: "Top end feels dull",
      detail: `Air band (6 kHz+) only carries ${m.bands.high.toFixed(1)} dB — track may lack sparkle.`,
      recommendation: "Add a gentle 10 kHz shelf (+1 to +2 dB) in Fruity Parametric EQ 2 on the master bus.",
    });
  }

  if (issues.length === 0) {
    issues.push({
      id: "clean",
      severity: "info",
      title: "No obvious technical problems detected",
      detail: "Levels, loudness, dynamics, stereo image and tonal balance are within commercial-mix range.",
      recommendation: "Reference against a commercial track in the same genre and consider a final mastering pass for polish.",
    });
  }

  return issues;
}

export function formatMetricsForPrompt(m: AudioMetrics, issues: AudioIssue[]): string {
  const lines: string[] = [];
  lines.push(`File: ${m.fileName} (${m.fileFormat.toUpperCase()}, ${(m.fileSizeBytes / 1024 / 1024).toFixed(2)} MB)`);
  lines.push(`Duration: ${Math.floor(m.durationSec / 60)}:${String(Math.floor(m.durationSec % 60)).padStart(2, "0")}`);
  lines.push(`Sample rate: ${m.sampleRate} Hz | Channels: ${m.channels} (${m.isStereo ? "stereo" : "mono"}) | Bit rate ≈ ${m.bitRate} kbps`);
  lines.push(`Peak: ${m.peakDb.toFixed(1)} dBFS | RMS: ${m.rmsDb.toFixed(1)} dBFS | LUFS≈ ${m.lufsEstimate.toFixed(1)}`);
  lines.push(`Dynamic range: ${m.dynamicRangeDb.toFixed(1)} dB | Stereo width: ${m.stereoWidth.toFixed(2)} (${m.stereoWidthLabel})`);
  lines.push(`BPM: ${m.bpm ?? "unknown"} | Key: ${m.detectedKey ?? "unknown"}`);
  lines.push(`Band balance (dB rel total): low ${m.bands.low.toFixed(1)} | low-mid ${m.bands.lowMid.toFixed(1)} | mid ${m.bands.mid.toFixed(1)} | high-mid ${m.bands.highMid.toFixed(1)} | high ${m.bands.high.toFixed(1)}`);
  if (issues.length) {
    lines.push("Detected issues:");
    for (const i of issues) lines.push(`- [${i.severity.toUpperCase()}] ${i.title} — ${i.detail}`);
  }
  return lines.join("\n");
}
