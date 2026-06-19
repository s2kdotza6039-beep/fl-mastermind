// Persistent user audio preferences (startup sound on/off + volume + scope).
// Stored in localStorage so it survives reloads and is read by sensei-tone.ts.

const ENABLED_KEY = "studio-sensei-audio-enabled";
const VOLUME_KEY = "studio-sensei-audio-volume";
const SCOPE_KEY = "studio-sensei-audio-scope";
const PAUSE_ON_HIDDEN_KEY = "studio-sensei-audio-pause-hidden";
const INTERACTED_KEY = "studio-sensei-audio-interacted";
const FIRST_VISIT_PLAYED_KEY = "studio-sensei-audio-first-visit-played";

export type PlayScope = "session" | "first-visit";

export type AudioSettings = {
  enabled: boolean;
  volume: number; // 0..1
  scope: PlayScope;
  pauseOnHidden: boolean;
};

const DEFAULTS: AudioSettings = {
  enabled: true,
  volume: 0.7,
  scope: "session",
  pauseOnHidden: true,
};

const CHANGE_EVENT = "studio-sensei-audio-settings-changed";

export const getAudioSettings = (): AudioSettings => {
  if (typeof window === "undefined") return DEFAULTS;
  const enabledRaw = window.localStorage.getItem(ENABLED_KEY);
  const volumeRaw = window.localStorage.getItem(VOLUME_KEY);
  const scopeRaw = window.localStorage.getItem(SCOPE_KEY);
  const pauseRaw = window.localStorage.getItem(PAUSE_ON_HIDDEN_KEY);
  const enabled = enabledRaw === null ? DEFAULTS.enabled : enabledRaw === "1";
  const volume = volumeRaw === null ? DEFAULTS.volume : Math.min(1, Math.max(0, Number(volumeRaw)));
  const scope: PlayScope = scopeRaw === "first-visit" ? "first-visit" : "session";
  const pauseOnHidden = pauseRaw === null ? DEFAULTS.pauseOnHidden : pauseRaw === "1";
  return {
    enabled,
    volume: Number.isFinite(volume) ? volume : DEFAULTS.volume,
    scope,
    pauseOnHidden,
  };
};

const emit = () => window.dispatchEvent(new CustomEvent(CHANGE_EVENT));

export const setAudioEnabled = (enabled: boolean) => {
  window.localStorage.setItem(ENABLED_KEY, enabled ? "1" : "0");
  emit();
};

export const setAudioVolume = (volume: number) => {
  const clamped = Math.min(1, Math.max(0, volume));
  window.localStorage.setItem(VOLUME_KEY, String(clamped));
  emit();
};

export const setAudioScope = (scope: PlayScope) => {
  window.localStorage.setItem(SCOPE_KEY, scope);
  emit();
};

export const setPauseOnHidden = (v: boolean) => {
  window.localStorage.setItem(PAUSE_ON_HIDDEN_KEY, v ? "1" : "0");
  emit();
};

export const subscribeAudioSettings = (cb: () => void) => {
  const handler = () => cb();
  window.addEventListener(CHANGE_EVENT, handler);
  return () => window.removeEventListener(CHANGE_EVENT, handler);
};

// ---- Interaction memory (persists across loads) ----
export const hasUserInteractedBefore = (): boolean => {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(INTERACTED_KEY) === "1";
};

export const markUserInteracted = () => {
  if (typeof window === "undefined") return;
  if (window.localStorage.getItem(INTERACTED_KEY) === "1") return;
  window.localStorage.setItem(INTERACTED_KEY, "1");
};

export const clearUserInteracted = () => {
  window.localStorage.removeItem(INTERACTED_KEY);
};

// ---- First-visit gate ----
export const hasPlayedForFirstVisit = (): boolean =>
  typeof window !== "undefined" &&
  window.localStorage.getItem(FIRST_VISIT_PLAYED_KEY) === "1";

export const markPlayedForFirstVisit = () => {
  window.localStorage.setItem(FIRST_VISIT_PLAYED_KEY, "1");
};

export const resetFirstVisitFlag = () => {
  window.localStorage.removeItem(FIRST_VISIT_PLAYED_KEY);
};
