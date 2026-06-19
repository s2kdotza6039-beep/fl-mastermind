// Studio Sensei startup tone — ancient Chinese-inspired motif synthesized via
// Web Audio API. Layered impression of: soft temple bell, guqin & guzheng plucks,
// and a breathy xiao bamboo flute. Pentatonic (D major pentatonic).
// ~3 seconds, plays once per browser session, respects user audio settings.

import { getAudioSettings } from "./audio-settings";

const SESSION_KEY = "studio-sensei-boot-tone-played";

let armed = false;

type Ctx = AudioContext;

// ---------- Helpers ----------
const decayGain = (
  ctx: Ctx,
  start: number,
  peak: number,
  attack: number,
  release: number,
  end: number,
) => {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), start + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, end);
  void release;
  return g;
};

// Temple bell: fundamental + inharmonic partials, long exponential decay
const playTempleBell = (ctx: Ctx, out: AudioNode, t: number, freq = 523.25) => {
  const partials = [
    { mult: 1.0, gain: 0.55, decay: 2.8 },
    { mult: 2.76, gain: 0.28, decay: 2.0 },
    { mult: 5.40, gain: 0.12, decay: 1.3 },
    { mult: 8.93, gain: 0.06, decay: 0.7 },
  ];
  partials.forEach(({ mult, gain, decay }) => {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = freq * mult;
    const g = decayGain(ctx, t, gain, 0.005, decay, t + decay);
    o.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + decay + 0.05);
  });
};

// Plucked string (guqin / guzheng) — detuned triangle stack through a lowpass
// that closes quickly, mimicking a plucked silk-string envelope.
const playPluck = (
  ctx: Ctx,
  out: AudioNode,
  t: number,
  freq: number,
  brightness: number, // 0..1 — higher = guzheng-ish, lower = guqin-ish
  level = 0.4,
  durSec = 1.6,
) => {
  const merge = ctx.createGain();
  merge.gain.value = level;

  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  const startCutoff = 1800 + brightness * 4000;
  const endCutoff = 350 + brightness * 600;
  lp.frequency.setValueAtTime(startCutoff, t);
  lp.frequency.exponentialRampToValueAtTime(endCutoff, t + durSec);
  lp.Q.value = 0.9;

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(1, t + 0.006);
  env.gain.exponentialRampToValueAtTime(0.0001, t + durSec);

  ([-7, 0, +7] as const).forEach((detune, idx) => {
    const o = ctx.createOscillator();
    o.type = idx === 1 ? "triangle" : "sawtooth";
    o.frequency.value = freq;
    o.detune.value = detune;
    const og = ctx.createGain();
    og.gain.value = idx === 1 ? 0.6 : 0.22;
    o.connect(og);
    og.connect(lp);
    o.start(t);
    o.stop(t + durSec + 0.05);
  });

  // tiny pitch drop for plucked realism
  const subtleBend = ctx.createOscillator();
  subtleBend.frequency.value = freq * 0.5;
  subtleBend.type = "sine";
  const sbg = ctx.createGain();
  sbg.gain.value = 0.05;
  subtleBend.connect(sbg);
  sbg.connect(lp);
  subtleBend.start(t);
  subtleBend.stop(t + 0.4);

  lp.connect(env);
  env.connect(merge);
  merge.connect(out);
};

// Xiao bamboo flute — breathy sine with vibrato and a touch of filtered noise
const playXiao = (
  ctx: Ctx,
  out: AudioNode,
  t: number,
  freq: number,
  level = 0.28,
  durSec = 1.4,
) => {
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(level, t + 0.25);
  env.gain.setValueAtTime(level, t + durSec * 0.6);
  env.gain.exponentialRampToValueAtTime(0.0001, t + durSec);

  const tone = ctx.createOscillator();
  tone.type = "sine";
  tone.frequency.value = freq;

  // gentle vibrato
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 4.8;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = freq * 0.008;
  lfo.connect(lfoGain);
  lfoGain.connect(tone.frequency);

  // soft 2nd harmonic for body
  const tone2 = ctx.createOscillator();
  tone2.type = "sine";
  tone2.frequency.value = freq * 2;
  const tone2g = ctx.createGain();
  tone2g.gain.value = 0.18;

  // breath noise
  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * durSec, ctx.sampleRate);
  const ch = noiseBuf.getChannelData(0);
  for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1);
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuf;
  const noiseBp = ctx.createBiquadFilter();
  noiseBp.type = "bandpass";
  noiseBp.frequency.value = freq * 2.2;
  noiseBp.Q.value = 0.7;
  const noiseG = ctx.createGain();
  noiseG.gain.value = 0.05;

  tone.connect(env);
  tone2.connect(tone2g);
  tone2g.connect(env);
  noise.connect(noiseBp);
  noiseBp.connect(noiseG);
  noiseG.connect(env);
  env.connect(out);

  tone.start(t);
  tone.stop(t + durSec + 0.05);
  tone2.start(t);
  tone2.stop(t + durSec + 0.05);
  lfo.start(t);
  lfo.stop(t + durSec + 0.05);
  noise.start(t);
  noise.stop(t + durSec);
};

// A tiny "hall" using a short feedback delay for air around the motif
const makeHall = (ctx: Ctx, out: AudioNode) => {
  const send = ctx.createGain();
  send.gain.value = 0.22;
  const delay = ctx.createDelay(1.0);
  delay.delayTime.value = 0.22;
  const fb = ctx.createGain();
  fb.gain.value = 0.32;
  const wet = ctx.createGain();
  wet.gain.value = 1;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 250;
  send.connect(delay);
  delay.connect(hp);
  hp.connect(fb);
  fb.connect(delay);
  hp.connect(wet);
  wet.connect(out);
  return send;
};

export const playSenseiBootTone = async () => {
  try {
    const settings = getAudioSettings();
    if (!settings.enabled) return;

    const CtxClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!CtxClass) return;
    const ctx = new CtxClass();
    if (ctx.state === "suspended") await ctx.resume().catch(() => {});

    const master = ctx.createGain();
    // moderate baseline (~0.6) scaled by user volume
    master.gain.value = 0.6 * settings.volume;
    master.connect(ctx.destination);

    const hallSend = makeHall(ctx, master);

    // route a "dry+wet" bus: dry to master, also send to hall
    const dry = ctx.createGain();
    dry.gain.value = 1;
    dry.connect(master);
    dry.connect(hallSend);

    const t0 = ctx.currentTime + 0.02;

    // D major pentatonic — D3=146.83, A3=220, F#4=369.99, A4=440, D5=587.33
    // 1. Temple bell entrance (high C-ish, soft)
    playTempleBell(ctx, dry, t0, 523.25);

    // 2. Guqin low pluck D3 — the master arriving
    playPluck(ctx, dry, t0 + 0.35, 146.83, 0.15, 0.42, 1.8);

    // 3. Guqin A3 — second breath
    playPluck(ctx, dry, t0 + 0.85, 220.0, 0.2, 0.36, 1.6);

    // 4. Guzheng arpeggio (F#4 -> A4) — brighter strings
    playPluck(ctx, dry, t0 + 1.25, 369.99, 0.7, 0.32, 1.3);
    playPluck(ctx, dry, t0 + 1.55, 440.0, 0.78, 0.30, 1.2);

    // 5. Xiao bamboo flute — D5 sustained, fading out
    playXiao(ctx, dry, t0 + 1.4, 587.33, 0.26, 1.5);

    // Cleanup after motif decays
    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 4200);
  } catch {
    /* audio is non-critical */
  }
};

/**
 * Play the boot tone once per browser session, respecting:
 *  - user audio settings (enabled/volume)
 *  - browser autoplay policy (requires a user gesture if not allowed)
 * Page navigation within the SPA will NOT replay it because sessionStorage
 * is checked before each attempt.
 */
export const armSenseiBootTone = () => {
  if (armed) return;
  if (typeof window === "undefined") return;
  if (sessionStorage.getItem(SESSION_KEY) === "1") return;
  if (!getAudioSettings().enabled) return;
  armed = true;

  const fire = () => {
    sessionStorage.setItem(SESSION_KEY, "1");
    void playSenseiBootTone();
    window.removeEventListener("pointerdown", fire);
    window.removeEventListener("keydown", fire);
  };

  const tryNow = async () => {
    try {
      const CtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!CtxClass) return;
      const probe = new CtxClass();
      const allowed = probe.state === "running";
      await probe.close().catch(() => {});
      if (allowed) {
        fire();
      } else {
        window.addEventListener("pointerdown", fire, { once: false });
        window.addEventListener("keydown", fire, { once: false });
      }
    } catch {
      window.addEventListener("pointerdown", fire, { once: false });
      window.addEventListener("keydown", fire, { once: false });
    }
  };
  void tryNow();
};
