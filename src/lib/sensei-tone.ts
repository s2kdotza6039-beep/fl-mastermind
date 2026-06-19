// Studio Sensei startup tone — ancient Chinese-inspired motif synthesized via
// Web Audio API. Layered impression of: soft temple bell, guqin & guzheng plucks,
// and a breathy xiao bamboo flute. Pentatonic (D major pentatonic).
// ~3 seconds, plays per user preference, respects user audio settings.

import {
  getAudioSettings,
  hasPlayedForFirstVisit,
  hasUserInteractedBefore,
  markPlayedForFirstVisit,
  markUserInteracted,
} from "./audio-settings";

const SESSION_KEY = "studio-sensei-boot-tone-played";

let armed = false;

type Ctx = AudioContext;

// ============= Diagnostics =============

export type AudioDiagnostics = {
  supported: boolean;
  contextState: "running" | "suspended" | "closed" | "unknown" | "unsupported";
  unlocked: boolean;
  reason:
    | "playing-or-ready"
    | "autoplay-blocked-waiting-interaction"
    | "already-played-this-session"
    | "already-played-first-visit"
    | "disabled-in-settings"
    | "tab-hidden"
    | "unsupported"
    | "idle";
  awaitingInteraction: boolean;
  interactionRemembered: boolean;
  playedThisSession: boolean;
  playedFirstVisit: boolean;
  lastError: string | null;
};

let diagnostics: AudioDiagnostics = {
  supported: typeof window !== "undefined" && !!(window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext),
  contextState: "unknown",
  unlocked: false,
  reason: "idle",
  awaitingInteraction: false,
  interactionRemembered: typeof window !== "undefined" && hasUserInteractedBefore(),
  playedThisSession: typeof window !== "undefined" && sessionStorage.getItem(SESSION_KEY) === "1",
  playedFirstVisit: typeof window !== "undefined" && hasPlayedForFirstVisit(),
  lastError: null,
};

const DIAG_EVENT = "studio-sensei-audio-diagnostics";

const updateDiagnostics = (patch: Partial<AudioDiagnostics>) => {
  diagnostics = { ...diagnostics, ...patch };
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(DIAG_EVENT));
  }
};

export const getAudioDiagnostics = (): AudioDiagnostics => diagnostics;

export const subscribeAudioDiagnostics = (cb: () => void) => {
  const handler = () => cb();
  window.addEventListener(DIAG_EVENT, handler);
  return () => window.removeEventListener(DIAG_EVENT, handler);
};

// ============= Synthesis helpers =============

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

const playTempleBell = (ctx: Ctx, out: AudioNode, t: number, freq = 523.25) => {
  const partials = [
    { mult: 1.0, gain: 0.55, decay: 2.8 },
    { mult: 2.76, gain: 0.28, decay: 2.0 },
    { mult: 5.4, gain: 0.12, decay: 1.3 },
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

const playPluck = (
  ctx: Ctx,
  out: AudioNode,
  t: number,
  freq: number,
  brightness: number,
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
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 4.8;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = freq * 0.008;
  lfo.connect(lfoGain);
  lfoGain.connect(tone.frequency);
  const tone2 = ctx.createOscillator();
  tone2.type = "sine";
  tone2.frequency.value = freq * 2;
  const tone2g = ctx.createGain();
  tone2g.gain.value = 0.18;
  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * durSec, ctx.sampleRate);
  const ch = noiseBuf.getChannelData(0);
  for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
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

// Track currently-playing boot ctx so we can stop on visibility change.
let activeBootCtx: Ctx | null = null;

export const stopSenseiBootTone = () => {
  if (activeBootCtx) {
    activeBootCtx.close().catch(() => {});
    activeBootCtx = null;
  }
};

export const playSenseiBootTone = async () => {
  try {
    const settings = getAudioSettings();
    if (!settings.enabled) {
      updateDiagnostics({ reason: "disabled-in-settings" });
      return;
    }

    const CtxClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!CtxClass) {
      updateDiagnostics({ supported: false, contextState: "unsupported", reason: "unsupported" });
      return;
    }
    const ctx = new CtxClass();
    activeBootCtx = ctx;
    if (ctx.state === "suspended") await ctx.resume().catch(() => {});

    updateDiagnostics({
      contextState: ctx.state as AudioDiagnostics["contextState"],
      unlocked: ctx.state === "running",
      reason: "playing-or-ready",
      awaitingInteraction: false,
      lastError: null,
    });

    const master = ctx.createGain();
    master.gain.value = 0.6 * settings.volume;
    master.connect(ctx.destination);
    const hallSend = makeHall(ctx, master);
    const dry = ctx.createGain();
    dry.gain.value = 1;
    dry.connect(master);
    dry.connect(hallSend);

    const t0 = ctx.currentTime + 0.02;
    playTempleBell(ctx, dry, t0, 523.25);
    playPluck(ctx, dry, t0 + 0.35, 146.83, 0.15, 0.42, 1.8);
    playPluck(ctx, dry, t0 + 0.85, 220.0, 0.2, 0.36, 1.6);
    playPluck(ctx, dry, t0 + 1.25, 369.99, 0.7, 0.32, 1.3);
    playPluck(ctx, dry, t0 + 1.55, 440.0, 0.78, 0.3, 1.2);
    playXiao(ctx, dry, t0 + 1.4, 587.33, 0.26, 1.5);

    setTimeout(() => {
      if (activeBootCtx === ctx) activeBootCtx = null;
      ctx.close().catch(() => {});
    }, 4200);
  } catch (e) {
    updateDiagnostics({ lastError: e instanceof Error ? e.message : String(e) });
  }
};

/**
 * Arm the boot tone. Behaviour depends on user settings:
 *  - scope=session: plays once per browser session
 *  - scope=first-visit: plays once ever on this device (until cleared)
 *  - pauseOnHidden: skip arming when the tab is hidden; cancel if it becomes hidden mid-arm
 *  - hasUserInteractedBefore: skip the gesture wait, play immediately
 */
export const armSenseiBootTone = () => {
  if (armed) return;
  if (typeof window === "undefined") return;
  armed = true;

  const settings = getAudioSettings();

  // Record interaction history (any pointer/key) so future loads can autoplay.
  const recordInteraction = () => markUserInteracted();
  window.addEventListener("pointerdown", recordInteraction, { once: true });
  window.addEventListener("keydown", recordInteraction, { once: true });

  if (!settings.enabled) {
    updateDiagnostics({ reason: "disabled-in-settings" });
    return;
  }

  if (settings.scope === "session" && sessionStorage.getItem(SESSION_KEY) === "1") {
    updateDiagnostics({ playedThisSession: true, reason: "already-played-this-session" });
    return;
  }
  if (settings.scope === "first-visit" && hasPlayedForFirstVisit()) {
    updateDiagnostics({ playedFirstVisit: true, reason: "already-played-first-visit" });
    return;
  }

  // If the tab opens hidden and the user opted to pause-on-hidden, skip the play.
  if (settings.pauseOnHidden && typeof document !== "undefined" && document.hidden) {
    updateDiagnostics({ reason: "tab-hidden", awaitingInteraction: false });
    return;
  }

  const fire = () => {
    sessionStorage.setItem(SESSION_KEY, "1");
    if (getAudioSettings().scope === "first-visit") markPlayedForFirstVisit();
    updateDiagnostics({
      playedThisSession: true,
      playedFirstVisit: hasPlayedForFirstVisit(),
      awaitingInteraction: false,
    });
    void playSenseiBootTone();
    window.removeEventListener("pointerdown", fireInteraction);
    window.removeEventListener("keydown", fireInteraction);
  };

  const fireInteraction = () => {
    markUserInteracted();
    fire();
  };

  // Cancel arming if the tab becomes hidden before playback (if requested).
  let hiddenHandler: (() => void) | null = null;
  if (settings.pauseOnHidden && typeof document !== "undefined") {
    hiddenHandler = () => {
      if (document.hidden) {
        stopSenseiBootTone();
        window.removeEventListener("pointerdown", fireInteraction);
        window.removeEventListener("keydown", fireInteraction);
        updateDiagnostics({ reason: "tab-hidden", awaitingInteraction: false });
        if (hiddenHandler) document.removeEventListener("visibilitychange", hiddenHandler);
      }
    };
    document.addEventListener("visibilitychange", hiddenHandler);
  }

  const tryNow = async () => {
    try {
      const CtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!CtxClass) {
        updateDiagnostics({ supported: false, contextState: "unsupported", reason: "unsupported" });
        return;
      }
      const probe = new CtxClass();
      const state = probe.state;
      const allowed = state === "running" || hasUserInteractedBefore();
      updateDiagnostics({
        contextState: state as AudioDiagnostics["contextState"],
        unlocked: state === "running",
        interactionRemembered: hasUserInteractedBefore(),
      });
      // resume if user has interacted previously (browsers honour that)
      if (state === "suspended" && hasUserInteractedBefore()) {
        await probe.resume().catch(() => {});
      }
      await probe.close().catch(() => {});

      if (allowed) {
        fire();
      } else {
        updateDiagnostics({
          awaitingInteraction: true,
          reason: "autoplay-blocked-waiting-interaction",
        });
        window.addEventListener("pointerdown", fireInteraction, { once: false });
        window.addEventListener("keydown", fireInteraction, { once: false });
      }
    } catch (e) {
      updateDiagnostics({
        awaitingInteraction: true,
        reason: "autoplay-blocked-waiting-interaction",
        lastError: e instanceof Error ? e.message : String(e),
      });
      window.addEventListener("pointerdown", fireInteraction, { once: false });
      window.addEventListener("keydown", fireInteraction, { once: false });
    }
  };
  void tryNow();
};
