// Studio Sensei startup tone — ancient Chinese-inspired motif synthesized via
// Web Audio API. Layered impression of: soft temple bell, guqin & guzheng plucks,
// and a breathy xiao bamboo flute. Pentatonic (D major pentatonic).

import {
  getAudioSettings,
  hasPlayedForFirstVisit,
  hasUserInteractedBefore,
  markPlayedForFirstVisit,
  markUserInteracted,
  subscribeMuteChange,
} from "./audio-settings";

const SESSION_KEY = "studio-sensei-boot-tone-played";

let armed = false;

type Ctx = AudioContext;

// ============= Diagnostics =============

export type DiagReasonCode =
  | "playing-or-ready"
  | "autoplay-blocked-waiting-interaction"
  | "already-played-this-session"
  | "already-played-first-visit"
  | "disabled-in-settings"
  | "muted"
  | "tab-hidden"
  | "backoff-exhausted"
  | "unsupported"
  | "idle";

export const REASON_INFO: Record<
  DiagReasonCode,
  { code: string; label: string; fix: string }
> = {
  "playing-or-ready": {
    code: "OK_READY",
    label: "Ready / playing",
    fix: "No action needed.",
  },
  "autoplay-blocked-waiting-interaction": {
    code: "AUTOPLAY_BLOCKED",
    label: "Autoplay blocked by browser",
    fix: "Click anywhere or press any key — the browser then unlocks audio. After one gesture this is remembered for future visits.",
  },
  "already-played-this-session": {
    code: "PLAYED_SESSION",
    label: "Already played this session",
    fix: "Open a new tab or window to hear it again. Or switch scope to 'Only on first visit'.",
  },
  "already-played-first-visit": {
    code: "PLAYED_FIRST_VISIT",
    label: "Already played on first visit",
    fix: "Use the 'Reset first-visit flag' button below to allow it again, or switch scope to 'Once per session'.",
  },
  "disabled-in-settings": {
    code: "DISABLED_SETTING",
    label: "Startup sound is turned off",
    fix: "Enable 'Startup sound' above to play it.",
  },
  muted: {
    code: "MUTED",
    label: "Currently muted",
    fix: "Press Shift+M or click the mute button to unmute.",
  },
  "tab-hidden": {
    code: "TAB_HIDDEN",
    label: "Tab is hidden — playback skipped",
    fix: "Bring the tab to the foreground, or disable 'Pause if tab is hidden'.",
  },
  "backoff-exhausted": {
    code: "BACKOFF_EXHAUSTED",
    label: "Stopped retrying after repeated autoplay locks",
    fix: "Click the page (or use the Test button) to manually unlock audio.",
  },
  unsupported: {
    code: "UNSUPPORTED",
    label: "Web Audio API not supported in this browser",
    fix: "Use a recent Chrome, Edge, Firefox, or Safari build.",
  },
  idle: { code: "IDLE", label: "Idle", fix: "Waiting for app to arm the tone." },
};

export type AudioDiagnostics = {
  supported: boolean;
  contextState: "running" | "suspended" | "closed" | "unknown" | "unsupported";
  unlocked: boolean;
  reason: DiagReasonCode;
  awaitingInteraction: boolean;
  interactionRemembered: boolean;
  playedThisSession: boolean;
  playedFirstVisit: boolean;
  muted: boolean;
  retryAttempts: number;
  nextRetryInMs: number | null;
  lastError: string | null;
};

let diagnostics: AudioDiagnostics = {
  supported:
    typeof window !== "undefined" &&
    !!(window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext),
  contextState: "unknown",
  unlocked: false,
  reason: "idle",
  awaitingInteraction: false,
  interactionRemembered: typeof window !== "undefined" && hasUserInteractedBefore(),
  playedThisSession: typeof window !== "undefined" && sessionStorage.getItem(SESSION_KEY) === "1",
  playedFirstVisit: typeof window !== "undefined" && hasPlayedForFirstVisit(),
  muted: typeof window !== "undefined" && getAudioSettings().muted,
  retryAttempts: 0,
  nextRetryInMs: null,
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

// ============= Synthesis helpers (unchanged from previous) =============

const decayGain = (ctx: Ctx, start: number, peak: number, attack: number, release: number, end: number) => {
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

const playPluck = (ctx: Ctx, out: AudioNode, t: number, freq: number, brightness: number, level = 0.4, durSec = 1.6) => {
  const merge = ctx.createGain();
  merge.gain.value = level;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(1800 + brightness * 4000, t);
  lp.frequency.exponentialRampToValueAtTime(350 + brightness * 600, t + durSec);
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
  const sb = ctx.createOscillator();
  sb.frequency.value = freq * 0.5;
  sb.type = "sine";
  const sbg = ctx.createGain();
  sbg.gain.value = 0.05;
  sb.connect(sbg);
  sbg.connect(lp);
  sb.start(t);
  sb.stop(t + 0.4);
  lp.connect(env);
  env.connect(merge);
  merge.connect(out);
};

const playXiao = (ctx: Ctx, out: AudioNode, t: number, freq: number, level = 0.28, durSec = 1.4) => {
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

// ============= Live mute control =============

let activeBootCtx: Ctx | null = null;
let activeMasterGain: GainNode | null = null;
let activeBaselineGain = 0;

export const stopSenseiBootTone = () => {
  if (activeBootCtx) {
    activeBootCtx.close().catch(() => {});
    activeBootCtx = null;
    activeMasterGain = null;
  }
};

export const applyMuteToActive = (muted: boolean) => {
  if (!activeMasterGain || !activeBootCtx) return;
  try {
    const target = muted ? 0 : activeBaselineGain;
    activeMasterGain.gain.cancelScheduledValues(activeBootCtx.currentTime);
    activeMasterGain.gain.linearRampToValueAtTime(target, activeBootCtx.currentTime + 0.05);
  } catch {
    /* noop */
  }
};

if (typeof window !== "undefined") {
  subscribeMuteChange((muted) => {
    updateDiagnostics({ muted });
    applyMuteToActive(muted);
  });
}

// ============= Playback =============

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
      reason: settings.muted ? "muted" : "playing-or-ready",
      awaitingInteraction: false,
      muted: settings.muted,
      lastError: null,
    });

    const baseline = 0.6 * settings.volume;
    activeBaselineGain = baseline;
    const master = ctx.createGain();
    master.gain.value = settings.muted ? 0 : baseline;
    master.connect(ctx.destination);
    activeMasterGain = master;

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
      if (activeBootCtx === ctx) {
        activeBootCtx = null;
        activeMasterGain = null;
      }
      ctx.close().catch(() => {});
    }, 4200);
  } catch (e) {
    updateDiagnostics({ lastError: e instanceof Error ? e.message : String(e) });
  }
};

// ============= Test (used by Settings → Test button) =============

export type AudioTestResult = {
  attempted: boolean;
  blocked: boolean;
  contextState: AudioDiagnostics["contextState"];
  reason: DiagReasonCode;
  message: string;
};

export const testSenseiBootTone = async (): Promise<AudioTestResult> => {
  const CtxClass =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!CtxClass) {
    return {
      attempted: false,
      blocked: false,
      contextState: "unsupported",
      reason: "unsupported",
      message: REASON_INFO.unsupported.label,
    };
  }
  let probe: AudioContext | null = null;
  try {
    probe = new CtxClass();
    if (probe.state === "suspended") await probe.resume().catch(() => {});
    const blocked = probe.state !== "running";
    const state = probe.state as AudioDiagnostics["contextState"];
    await probe.close().catch(() => {});
    if (blocked) {
      const reason: DiagReasonCode = "autoplay-blocked-waiting-interaction";
      updateDiagnostics({
        contextState: state,
        unlocked: false,
        reason,
        awaitingInteraction: true,
      });
      return {
        attempted: true,
        blocked: true,
        contextState: state,
        reason,
        message: `Blocked by browser autoplay policy (${REASON_INFO[reason].code}). ${REASON_INFO[reason].fix}`,
      };
    }
    // Unblocked — fire the real tone
    await playSenseiBootTone();
    return {
      attempted: true,
      blocked: false,
      contextState: state,
      reason: "playing-or-ready",
      message: "Playback succeeded — audio is unlocked.",
    };
  } catch (e) {
    return {
      attempted: true,
      blocked: true,
      contextState: "unknown",
      reason: "autoplay-blocked-waiting-interaction",
      message: e instanceof Error ? e.message : String(e),
    };
  }
};

// ============= Arming with retry/backoff =============

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 8000;

export const armSenseiBootTone = () => {
  if (armed) return;
  if (typeof window === "undefined") return;
  armed = true;

  const settings = getAudioSettings();

  // Capture future interactions so subsequent loads can autoplay.
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
  if (settings.pauseOnHidden && typeof document !== "undefined" && document.hidden) {
    updateDiagnostics({ reason: "tab-hidden", awaitingInteraction: false });
    return;
  }

  let attempts = 0;
  let retryTimer: number | null = null;
  let countdownTimer: number | null = null;

  const cleanupRetry = () => {
    if (retryTimer !== null) {
      window.clearTimeout(retryTimer);
      retryTimer = null;
    }
    if (countdownTimer !== null) {
      window.clearInterval(countdownTimer);
      countdownTimer = null;
    }
    updateDiagnostics({ nextRetryInMs: null });
  };

  const fire = () => {
    cleanupRetry();
    sessionStorage.setItem(SESSION_KEY, "1");
    if (getAudioSettings().scope === "first-visit") markPlayedForFirstVisit();
    updateDiagnostics({
      playedThisSession: true,
      playedFirstVisit: hasPlayedForFirstVisit(),
      awaitingInteraction: false,
      retryAttempts: attempts,
    });
    void playSenseiBootTone();
    window.removeEventListener("pointerdown", fireInteraction);
    window.removeEventListener("keydown", fireInteraction);
  };

  const fireInteraction = () => {
    markUserInteracted();
    fire();
  };

  // Tab becomes hidden → cancel.
  let hiddenHandler: (() => void) | null = null;
  if (settings.pauseOnHidden && typeof document !== "undefined") {
    hiddenHandler = () => {
      if (document.hidden) {
        cleanupRetry();
        stopSenseiBootTone();
        window.removeEventListener("pointerdown", fireInteraction);
        window.removeEventListener("keydown", fireInteraction);
        updateDiagnostics({ reason: "tab-hidden", awaitingInteraction: false });
        if (hiddenHandler) document.removeEventListener("visibilitychange", hiddenHandler);
      }
    };
    document.addEventListener("visibilitychange", hiddenHandler);
  }

  const scheduleRetry = () => {
    if (attempts >= MAX_RETRIES) {
      updateDiagnostics({
        reason: "backoff-exhausted",
        awaitingInteraction: true,
        retryAttempts: attempts,
        nextRetryInMs: null,
      });
      // Still listen for a gesture — but no more timed retries.
      window.addEventListener("pointerdown", fireInteraction, { once: false });
      window.addEventListener("keydown", fireInteraction, { once: false });
      return;
    }
    const delay = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempts);
    let remaining = delay;
    updateDiagnostics({ nextRetryInMs: remaining, retryAttempts: attempts });
    countdownTimer = window.setInterval(() => {
      remaining = Math.max(0, remaining - 250);
      updateDiagnostics({ nextRetryInMs: remaining });
    }, 250);
    retryTimer = window.setTimeout(() => {
      cleanupRetry();
      attempts += 1;
      void tryNow();
    }, delay);
  };

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
      if (state === "suspended" && hasUserInteractedBefore()) {
        await probe.resume().catch(() => {});
      }
      const allowed = probe.state === "running" || hasUserInteractedBefore();
      updateDiagnostics({
        contextState: probe.state as AudioDiagnostics["contextState"],
        unlocked: probe.state === "running",
        interactionRemembered: hasUserInteractedBefore(),
      });
      await probe.close().catch(() => {});

      if (allowed) {
        fire();
        return;
      }

      // Locked: register the one-shot gesture listener (idempotent) + schedule a backoff retry.
      updateDiagnostics({
        awaitingInteraction: true,
        reason: "autoplay-blocked-waiting-interaction",
        retryAttempts: attempts,
      });
      window.addEventListener("pointerdown", fireInteraction, { once: false });
      window.addEventListener("keydown", fireInteraction, { once: false });
      scheduleRetry();
    } catch (e) {
      updateDiagnostics({
        awaitingInteraction: true,
        reason: "autoplay-blocked-waiting-interaction",
        lastError: e instanceof Error ? e.message : String(e),
      });
      window.addEventListener("pointerdown", fireInteraction, { once: false });
      window.addEventListener("keydown", fireInteraction, { once: false });
      scheduleRetry();
    }
  };
  void tryNow();
};
