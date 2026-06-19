// Audio Analysis Engine MVP
// Pure-browser DSP using AudioContext.decodeAudioData for decode,
// with the heavy DSP step (FFT / BPM / chroma) split out so it can
// run inside a Web Worker via runDspAnalysis() to keep the UI responsive.

export interface ConfidenceScore {
  /** 0..1 — how trustworthy the detection is. */
  value: number;
  /** Human-friendly bucket: high / medium / low / unreliable. */
  label: "high" | "medium" | "low" | "unreliable";
  /** Short reason for the confidence rating (esp. when low). */
  note?: string;
}

export interface AudioMetrics {
  fileName: string;
  fileFormat: string;
  fileSizeBytes: number;
  durationSec: number;
  sampleRate: number;
  bitRate: number;
  channels: number;
  isStereo: boolean;
  peakDb: number;
  rmsDb: number;
  lufsEstimate: number;
  dynamicRangeDb: number;
  stereoWidth: number;
  stereoWidthLabel: "Mono" | "Narrow" | "Moderate" | "Wide";
  bpm: number | null;
  bpmConfidence: ConfidenceScore;
  detectedKey: string | null;
  keyConfidence: ConfidenceScore;
  bands: {
    low: number;
    lowMid: number;
    mid: number;
    highMid: number;
    high: number;
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

export interface DecodedAudio {
  channelData: Float32Array[];
  sampleRate: number;
  duration: number;
  numberOfChannels: number;
}

export interface FileMeta {
  name: string;
  format: string;
  sizeBytes: number;
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

function computeChroma(samples: Float32Array, sampleRate: number): number[] {
  const chroma = new Array(12).fill(0);
  const baseFreqs: number[] = [];
  for (let pc = 0; pc < 12; pc++) baseFreqs.push(65.41 * Math.pow(2, pc / 12));
  const N = Math.min(samples.length, sampleRate * 20);
  for (let oct = 0; oct < 5; oct++) {
    for (let pc = 0; pc < 12; pc++) {
      const f = baseFreqs[pc] * Math.pow(2, oct);
      if (f >= sampleRate / 2) continue;
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
  const sum = chroma.reduce((a, b) => a + b, 0) || 1;
  return chroma.map((v) => v / sum);
}

interface KeyDetection {
  key: string | null;
  confidence: ConfidenceScore;
}

function detectKeyFromChroma(chroma: number[]): KeyDetection {
  const scores: { key: string; score: number }[] = [];
  for (let pc = 0; pc < 12; pc++) {
    const majProfile = rotate(KRUMHANSL_MAJOR, -pc);
    const minProfile = rotate(KRUMHANSL_MINOR, -pc);
    scores.push({ key: `${NOTE_NAMES[pc]} Major`, score: correlate(chroma, majProfile) });
    scores.push({ key: `${NOTE_NAMES[pc]} Minor`, score: correlate(chroma, minProfile) });
  }
  scores.sort((a, b) => b.score - a.score);
  const best = scores[0];
  const second = scores[1];

  // Chroma flatness — drum-heavy tracks return near-uniform chroma vectors.
  const mean = chroma.reduce((a, b) => a + b, 0) / chroma.length;
  let variance = 0;
  for (const v of chroma) variance += (v - mean) * (v - mean);
  variance /= chroma.length;
  const flatness = variance < 1e-5; // basically no tonal information

  // Confidence: how much best beats second-best, weighted by chroma variance.
  const gap = best.score > 0 ? Math.max(0, (best.score - second.score) / best.score) : 0;
  const tonalStrength = Math.min(1, variance / 0.0008);
  const conf = Math.max(0, Math.min(1, gap * 3 * tonalStrength));

  let label: ConfidenceScore["label"];
  let note: string | undefined;
  if (flatness || conf < 0.1) {
    label = "unreliable";
    note = "Track appears mostly percussive — key detection requires sustained tonal content.";
  } else if (conf < 0.3) {
    label = "low";
    note = "Chroma profile is ambiguous between several keys.";
  } else if (conf < 0.6) {
    label = "medium";
  } else {
    label = "high";
  }

  return {
    key: label === "unreliable" ? null : best.key,
    confidence: { value: Math.round(conf * 100) / 100, label, note },
  };
}

interface BpmDetection {
  bpm: number | null;
  confidence: ConfidenceScore;
}

/**
 * Onset-envelope autocorrelation BPM with half/double-time disambiguation
 * and a confidence score (peak prominence vs. mean autocorrelation).
 */
function detectBPM(samples: Float32Array, sampleRate: number): BpmDetection {
  const hop = 512;
  const win = 1024;
  const frames = Math.floor((samples.length - win) / hop);
  if (frames < 30) {
    return { bpm: null, confidence: { value: 0, label: "unreliable", note: "Audio too short for tempo detection." } };
  }
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
  // Scan a wide tempo range (50–220 BPM) so we can disambiguate half/double-time.
  const minLag = Math.max(2, Math.floor((fps * 60) / 220));
  const maxLag = Math.floor((fps * 60) / 50);
  const acf = new Float32Array(maxLag - minLag + 1);
  let sumAcf = 0;
  let bestLag = -1;
  let bestVal = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let acc = 0;
    for (let i = 0; i + lag < frames; i++) acc += env[i] * env[i + lag];
    acf[lag - minLag] = acc;
    sumAcf += acc;
    if (acc > bestVal) { bestVal = acc; bestLag = lag; }
  }
  if (bestLag < 0 || bestVal <= 0) {
    return { bpm: null, confidence: { value: 0, label: "unreliable", note: "Could not extract a stable onset envelope." } };
  }
  let bpm = (fps * 60) / bestLag;

  // Half/double-time correction: musical sweet-spot is 80–160 BPM. If our pick
  // sits outside that band but a 2x/0.5x candidate has comparable energy, prefer it.
  const candidateAt = (targetBpm: number): number => {
    const lag = Math.round((fps * 60) / targetBpm);
    if (lag < minLag || lag > maxLag) return -1;
    return acf[lag - minLag];
  };
  if (bpm < 80) {
    const doubled = candidateAt(bpm * 2);
    if (doubled > 0 && doubled / bestVal > 0.6) bpm *= 2;
  } else if (bpm > 170) {
    const halved = candidateAt(bpm / 2);
    if (halved > 0 && halved / bestVal > 0.6) bpm /= 2;
  }

  // Confidence: peak prominence above the mean autocorrelation.
  const meanAcf = sumAcf / acf.length || 1;
  const prominence = (bestVal - meanAcf) / bestVal;
  const conf = Math.max(0, Math.min(1, prominence * 1.4));

  let label: ConfidenceScore["label"];
  let note: string | undefined;
  if (conf < 0.15) {
    label = "unreliable";
    note = "No clear periodic pulse — track may be ambient, rubato, or have shifting tempo.";
  } else if (conf < 0.35) {
    label = "low";
    note = "Pulse is weak — common with drum-heavy or polyrhythmic material; verify manually.";
  } else if (conf < 0.6) {
    label = "medium";
    note = bpm < 80 || bpm > 170 ? "Possible half/double-time ambiguity." : undefined;
  } else {
    label = "high";
  }

  return {
    bpm: label === "unreliable" ? null : Math.round(bpm * 10) / 10,
    confidence: { value: Math.round(conf * 100) / 100, label, note },
  };
}

function fftMag(samples: Float32Array): Float32Array {
  let n = 1;
  while (n < samples.length) n <<= 1;
  const re = new Float32Array(n);
  const im = new Float32Array(n);
  for (let i = 0; i < samples.length; i++) re[i] = samples[i];
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

export function detectFormat(file: File): string {
  const m = /\.([a-z0-9]+)$/i.exec(file.name);
  return (m?.[1] || file.type.split("/").pop() || "audio").toLowerCase();
}

/** Decode any browser-supported audio file. Must run on main thread (AudioContext). */
export async function decodeAudioToChannels(file: File): Promise<DecodedAudio> {
  const arrayBuf = await file.arrayBuffer();
  const AC: typeof AudioContext =
    window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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

  const channelData: Float32Array[] = [];
  for (let c = 0; c < audioBuf.numberOfChannels; c++) {
    // Copy because AudioBuffer-backed Float32Arrays cannot be transferred.
    channelData.push(new Float32Array(audioBuf.getChannelData(c)));
  }
  return {
    channelData,
    sampleRate: audioBuf.sampleRate,
    duration: audioBuf.duration,
    numberOfChannels: audioBuf.numberOfChannels,
  };
}

/** Downsample a channel to N peak buckets for waveform display. */
export function computeWaveformPeaks(channel: Float32Array, buckets: number): Float32Array {
  const out = new Float32Array(buckets);
  const samplesPerBucket = Math.max(1, Math.floor(channel.length / buckets));
  for (let b = 0; b < buckets; b++) {
    const start = b * samplesPerBucket;
    const end = Math.min(channel.length, start + samplesPerBucket);
    let peak = 0;
    for (let i = start; i < end; i++) {
      const v = Math.abs(channel[i]);
      if (v > peak) peak = v;
    }
    out[b] = peak;
  }
  return out;
}

/**
 * Pure-DSP analysis stage. Safe to call inside a Web Worker.
 * Takes already-decoded channel data and produces the full report.
 */
export function runDspAnalysis(
  channelData: Float32Array[],
  sampleRate: number,
  fileMeta: FileMeta,
  onProgress?: (pct: number, label: string) => void,
): AudioAnalysisResult {
  const channels = channelData.length;
  const left = channelData[0];
  const right = channels > 1 ? channelData[1] : left;
  const durationSec = left.length / sampleRate;

  onProgress?.(25, "Measuring levels…");
  const mono = new Float32Array(left.length);
  let peak = 0, sumSq = 0, sideSq = 0;
  for (let i = 0; i < left.length; i++) {
    const l = left[i], r = right[i];
    const m = (l + r) * 0.5;
    mono[i] = m;
    const ap = Math.max(Math.abs(l), Math.abs(r));
    if (ap > peak) peak = ap;
    sumSq += m * m;
    sideSq += ((l - r) * 0.5) * ((l - r) * 0.5);
  }
  const rms = Math.sqrt(sumSq / left.length);
  const peakDb = toDb(peak);
  const rmsDb = toDb(rms);
  const sideRms = Math.sqrt(sideSq / left.length);
  const widthRaw = rms > 0 ? sideRms / rms : 0;
  const stereoWidth = channels === 1 ? 0 : Math.max(0, Math.min(1, widthRaw));

  onProgress?.(40, "Estimating loudness…");
  const block = Math.floor(sampleRate * 0.4);
  const blockEnergies: number[] = [];
  for (let i = 0; i + block < mono.length; i += block) {
    let s = 0;
    for (let j = 0; j < block; j++) s += mono[i + j] * mono[i + j];
    blockEnergies.push(s / block);
  }
  blockEnergies.sort((a, b) => b - a);
  const top = blockEnergies.slice(0, Math.max(1, Math.floor(blockEnergies.length * 0.3)));
  const topMean = top.reduce((a, b) => a + b, 0) / top.length;
  const lufsEstimate = blockEnergies.length ? -0.691 + 10 * Math.log10(topMean || 1e-12) : -Infinity;
  const medIdx = Math.floor(blockEnergies.length * 0.5);
  const medE = blockEnergies[medIdx] || 1e-12;
  const dynamicRangeDb = toDb(peak) - 10 * Math.log10(medE);

  onProgress?.(60, "Analyzing frequency bands…");
  const winLen = Math.min(mono.length, 1 << 15);
  const start = Math.floor((mono.length - winLen) / 2);
  const slice = new Float32Array(winLen);
  for (let i = 0; i < winLen; i++) {
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

  onProgress?.(75, "Detecting tempo…");
  const bpmResult = detectBPM(mono, sampleRate);

  onProgress?.(88, "Detecting key…");
  const targetRate = 8000;
  const ratio = sampleRate / targetRate;
  const dsLen = Math.floor(Math.min(mono.length, sampleRate * 20) / ratio);
  const ds = new Float32Array(dsLen);
  for (let i = 0; i < dsLen; i++) ds[i] = mono[Math.floor(i * ratio)];
  const chroma = computeChroma(ds, targetRate);
  const keyResult = detectKeyFromChroma(chroma);

  const bitRate = Math.round(((fileMeta.sizeBytes * 8) / Math.max(1, durationSec)) / 1000);

  const metrics: AudioMetrics = {
    fileName: fileMeta.name,
    fileFormat: fileMeta.format,
    fileSizeBytes: fileMeta.sizeBytes,
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
    bpm: bpmResult.bpm,
    bpmConfidence: bpmResult.confidence,
    detectedKey: keyResult.key,
    keyConfidence: keyResult.confidence,
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

/** Convenience: decode + analyse on the main thread. Kept for back-compat / fallback. */
export async function analyzeAudioFile(
  file: File,
  onProgress?: (pct: number, label: string) => void,
): Promise<AudioAnalysisResult> {
  onProgress?.(5, "Decoding audio…");
  const decoded = await decodeAudioToChannels(file);
  return runDspAnalysis(
    decoded.channelData,
    decoded.sampleRate,
    { name: file.name, format: detectFormat(file), sizeBytes: file.size },
    onProgress,
  );
}

export interface AnalyzeRange {
  startSec: number;
  endSec: number;
}

const WORKER_TIMEOUT_MS = 90_000;
const MAX_FILE_SIZE_BYTES = 80 * 1024 * 1024;

export async function analyzeAudioFileInWorker(
  file: File,
  onProgress?: (pct: number, label: string) => void,
): Promise<{ result: AudioAnalysisResult; decoded: DecodedAudio }> {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `File is ${(file.size / 1024 / 1024).toFixed(1)}MB — too large to analyze in the browser. ` +
      `Try a shorter excerpt (under 80MB) or convert to a lower-bitrate MP3.`,
    );
  }
  onProgress?.(5, "Decoding audio…");
  const decoded = await decodeAudioToChannels(file);
  const fileMeta: FileMeta = { name: file.name, format: detectFormat(file), sizeBytes: file.size };
  const result = await runAnalysisOnDecoded(decoded, fileMeta, undefined, onProgress);
  return { result, decoded };
}

/**
 * Analyze a (possibly sliced) region of already-decoded audio. Used for
 * "re-analyze selection" so we don't re-decode the file. Falls back to the
 * main thread if the worker fails or times out.
 */
export async function runAnalysisOnDecoded(
  decoded: DecodedAudio,
  fileMeta: FileMeta,
  range?: AnalyzeRange,
  onProgress?: (pct: number, label: string) => void,
): Promise<AudioAnalysisResult> {
  const channels = sliceChannels(decoded.channelData, decoded.sampleRate, range);

  try {
    const worker = new Worker(new URL("../workers/audio-analysis.worker.ts", import.meta.url), {
      type: "module",
    });
    const result = await new Promise<AudioAnalysisResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("Analysis timed out after 90s — try a shorter selection."));
      }, WORKER_TIMEOUT_MS);
      worker.onmessage = (e: MessageEvent) => {
        const msg = e.data;
        if (msg?.type === "progress") onProgress?.(msg.pct, msg.label);
        else if (msg?.type === "result") { clearTimeout(timer); resolve(msg.result as AudioAnalysisResult); }
        else if (msg?.type === "error") { clearTimeout(timer); reject(new Error(msg.message || "Analysis worker failed")); }
      };
      worker.onerror = (e) => { clearTimeout(timer); reject(new Error(e.message || "Analysis worker crashed")); };
      const transfer = channels.map((c) => new Float32Array(c));
      worker.postMessage(
        { type: "analyze", channels: transfer, sampleRate: decoded.sampleRate, fileMeta },
        transfer.map((c) => c.buffer),
      );
    }).finally(() => worker.terminate());
    return result;
  } catch (err) {
    console.warn("[audio-analysis] Worker failed, falling back to main thread:", err);
    onProgress?.(20, "Worker unavailable — running on main thread…");
    return runDspAnalysis(channels, decoded.sampleRate, fileMeta, onProgress);
  }
}

function sliceChannels(
  channels: Float32Array[],
  sampleRate: number,
  range?: AnalyzeRange,
): Float32Array[] {
  if (!range) return channels.map((c) => new Float32Array(c));
  const startSample = Math.max(0, Math.floor(range.startSec * sampleRate));
  const endSample = Math.min(channels[0].length, Math.floor(range.endSec * sampleRate));
  if (endSample - startSample < sampleRate) {
    // Selection shorter than 1s — fall back to the full track.
    return channels.map((c) => new Float32Array(c));
  }
  return channels.map((c) => c.slice(startSample, endSample));
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
  lines.push(`BPM: ${m.bpm ?? "unknown"} (confidence: ${m.bpmConfidence.label}${m.bpmConfidence.note ? ` — ${m.bpmConfidence.note}` : ""})`);
  lines.push(`Key: ${m.detectedKey ?? "unknown"} (confidence: ${m.keyConfidence.label}${m.keyConfidence.note ? ` — ${m.keyConfidence.note}` : ""})`);
  lines.push(`Band balance (dB rel total): low ${m.bands.low.toFixed(1)} | low-mid ${m.bands.lowMid.toFixed(1)} | mid ${m.bands.mid.toFixed(1)} | high-mid ${m.bands.highMid.toFixed(1)} | high ${m.bands.high.toFixed(1)}`);
  if (issues.length) {
    lines.push("Detected issues:");
    for (const i of issues) lines.push(`- [${i.severity.toUpperCase()}] ${i.title} — ${i.detail}`);
  }
  return lines.join("\n");
}
