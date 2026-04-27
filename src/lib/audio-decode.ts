// Browser-side audio decoder + mono-WAV encoder.
// Lets us accept MP3, M4A, OGG, FLAC, WAV — anything the browser's
// AudioContext can decode — and ship a small mono WAV to the edge function.

const TARGET_SAMPLE_RATE = 22050; // plenty for pitch-class detection, keeps file small
const MAX_DURATION_SEC = 30;       // detect-key only analyses first 30s anyway

export interface DecodedAudio {
  wavBlob: Blob;
  durationSec: number;
  originalName: string;
}

/** Decode any browser-supported audio file to a small mono WAV blob. */
export async function decodeToMonoWav(file: File): Promise<DecodedAudio> {
  const arrayBuf = await file.arrayBuffer();

  const AC: typeof AudioContext =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC) throw new Error("Your browser can't decode audio. Try Chrome or Firefox.");

  const ctx = new AC();
  let audioBuf: AudioBuffer;
  try {
    audioBuf = await ctx.decodeAudioData(arrayBuf.slice(0));
  } catch {
    throw new Error("Couldn't decode this file. Try MP3, WAV, M4A, OGG, or FLAC.");
  } finally {
    ctx.close().catch(() => {});
  }

  // Mix to mono
  const channels = audioBuf.numberOfChannels;
  const srcRate = audioBuf.sampleRate;
  const trimSamples = Math.min(audioBuf.length, Math.floor(srcRate * MAX_DURATION_SEC));
  const mono = new Float32Array(trimSamples);
  for (let c = 0; c < channels; c++) {
    const data = audioBuf.getChannelData(c);
    for (let i = 0; i < trimSamples; i++) mono[i] += data[i] / channels;
  }

  // Resample to target rate (linear interpolation — fine for pitch detection)
  const ratio = srcRate / TARGET_SAMPLE_RATE;
  const outLen = Math.floor(trimSamples / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const srcIdx = i * ratio;
    const i0 = Math.floor(srcIdx);
    const i1 = Math.min(i0 + 1, trimSamples - 1);
    const frac = srcIdx - i0;
    out[i] = mono[i0] * (1 - frac) + mono[i1] * frac;
  }

  const wavBlob = encodeWav16(out, TARGET_SAMPLE_RATE);
  return {
    wavBlob,
    durationSec: Math.round(audioBuf.duration),
    originalName: file.name,
  };
}

/** Encode Float32 mono PCM to a 16-bit WAV blob. */
function encodeWav16(samples: Float32Array, sampleRate: number): Blob {
  const dataLen = samples.length * 2;
  const buf = new ArrayBuffer(44 + dataLen);
  const view = new DataView(buf);

  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataLen, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);            // fmt chunk size
  view.setUint16(20, 1, true);             // PCM
  view.setUint16(22, 1, true);             // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true);             // block align
  view.setUint16(34, 16, true);            // bits per sample
  writeStr(36, "data");
  view.setUint32(40, dataLen, true);

  let off = 44;
  for (let i = 0; i < samples.length; i++) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    s = s < 0 ? s * 0x8000 : s * 0x7fff;
    view.setInt16(off, s, true);
    off += 2;
  }

  return new Blob([buf], { type: "audio/wav" });
}
