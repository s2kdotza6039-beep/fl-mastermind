// Detect musical key from uploaded audio using Krumhansl-Schmuckler algorithm
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Krumhansl-Schmuckler key profiles
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function decodeWavToMono(buf: ArrayBuffer): { samples: Float32Array; sampleRate: number } | null {
  const view = new DataView(buf);
  // RIFF/WAVE check
  const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  const wave = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
  if (riff !== "RIFF" || wave !== "WAVE") return null;

  let offset = 12;
  let fmt: { audioFormat: number; channels: number; sampleRate: number; bitsPerSample: number } | null = null;
  let dataOffset = -1;
  let dataSize = 0;

  while (offset < view.byteLength - 8) {
    const id = String.fromCharCode(
      view.getUint8(offset), view.getUint8(offset + 1),
      view.getUint8(offset + 2), view.getUint8(offset + 3),
    );
    const size = view.getUint32(offset + 4, true);
    if (id === "fmt ") {
      fmt = {
        audioFormat: view.getUint16(offset + 8, true),
        channels: view.getUint16(offset + 10, true),
        sampleRate: view.getUint32(offset + 12, true),
        bitsPerSample: view.getUint16(offset + 22, true),
      };
    } else if (id === "data") {
      dataOffset = offset + 8;
      dataSize = size;
      break;
    }
    offset += 8 + size + (size % 2);
  }
  if (!fmt || dataOffset < 0) return null;

  const { channels, bitsPerSample, sampleRate, audioFormat } = fmt;
  const bytesPerSample = bitsPerSample / 8;
  const totalFrames = Math.floor(dataSize / (bytesPerSample * channels));
  const samples = new Float32Array(totalFrames);

  for (let i = 0; i < totalFrames; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) {
      const o = dataOffset + (i * channels + c) * bytesPerSample;
      let v = 0;
      if (audioFormat === 3 && bitsPerSample === 32) {
        v = view.getFloat32(o, true);
      } else if (bitsPerSample === 16) {
        v = view.getInt16(o, true) / 32768;
      } else if (bitsPerSample === 24) {
        const b0 = view.getUint8(o);
        const b1 = view.getUint8(o + 1);
        const b2 = view.getInt8(o + 2);
        v = ((b2 << 16) | (b1 << 8) | b0) / 8388608;
      } else if (bitsPerSample === 8) {
        v = (view.getUint8(o) - 128) / 128;
      } else if (bitsPerSample === 32) {
        v = view.getInt32(o, true) / 2147483648;
      }
      sum += v;
    }
    samples[i] = sum / channels;
  }
  return { samples, sampleRate };
}

// Goertzel algorithm — efficient for single-frequency magnitude
function goertzel(samples: Float32Array, sampleRate: number, freq: number): number {
  const N = samples.length;
  const k = Math.round(0.5 + (N * freq) / sampleRate);
  const w = (2 * Math.PI * k) / N;
  const cosw = Math.cos(w);
  const coeff = 2 * cosw;
  let s0 = 0, s1 = 0, s2 = 0;
  for (let i = 0; i < N; i++) {
    s0 = samples[i] + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return Math.sqrt(s1 * s1 + s2 * s2 - coeff * s1 * s2);
}

function pitchClassProfile(samples: Float32Array, sampleRate: number): number[] {
  const pcp = new Array(12).fill(0);
  // 4 octaves: C3 (~130.81 Hz) up
  const baseFreq = 130.81;
  const octaves = 4;
  // Window the signal — take up to 30 sec for performance
  const maxLen = Math.min(samples.length, sampleRate * 30);
  const seg = samples.subarray(0, maxLen);

  for (let oct = 0; oct < octaves; oct++) {
    for (let n = 0; n < 12; n++) {
      const freq = baseFreq * Math.pow(2, oct + n / 12);
      const mag = goertzel(seg, sampleRate, freq);
      pcp[n] += mag;
    }
  }
  // Normalize
  const max = Math.max(...pcp);
  if (max > 0) for (let i = 0; i < 12; i++) pcp[i] /= max;
  return pcp;
}

function correlate(a: number[], b: number[]): number {
  const meanA = a.reduce((x, y) => x + y, 0) / a.length;
  const meanB = b.reduce((x, y) => x + y, 0) / b.length;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) {
    const va = a[i] - meanA;
    const vb = b[i] - meanB;
    num += va * vb;
    da += va * va;
    db += vb * vb;
  }
  return num / Math.sqrt(da * db || 1);
}

function detectKey(pcp: number[]): { root: string; scale: "Major" | "Minor"; confidence: number } {
  let best = { root: "C", scale: "Major" as "Major" | "Minor", confidence: -Infinity };
  for (let i = 0; i < 12; i++) {
    const rotated = [...pcp.slice(i), ...pcp.slice(0, i)];
    const majC = correlate(rotated, MAJOR_PROFILE);
    const minC = correlate(rotated, MINOR_PROFILE);
    if (majC > best.confidence) best = { root: NOTES[i], scale: "Major", confidence: majC };
    if (minC > best.confidence) best = { root: NOTES[i], scale: "Minor", confidence: minC };
  }
  return best;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const contentType = req.headers.get("content-type") ?? "";
    let buf: ArrayBuffer;
    let filename = "audio";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return new Response(JSON.stringify({ error: "No file provided" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      buf = await file.arrayBuffer();
      filename = file.name;
    } else {
      buf = await req.arrayBuffer();
    }

    if (buf.byteLength > 30 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: "File too large. Max 30MB." }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const decoded = decodeWavToMono(buf);
    if (!decoded) {
      return new Response(
        JSON.stringify({
          error:
            "Couldn't decode this file. Please upload a WAV (PCM 16/24/32-bit). MP3 detection requires WAV — bounce a WAV from FL Studio.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { samples, sampleRate } = decoded;
    if (samples.length < sampleRate * 2) {
      return new Response(JSON.stringify({ error: "Audio too short. Need at least 2 seconds." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pcp = pitchClassProfile(samples, sampleRate);
    const { root, scale, confidence } = detectKey(pcp);

    return new Response(
      JSON.stringify({
        root,
        scale,
        confidence: Math.round(Math.max(0, Math.min(1, confidence)) * 100),
        filename,
        durationSec: Math.round(samples.length / sampleRate),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("detect-key error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Detection failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
