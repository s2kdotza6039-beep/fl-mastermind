// Persistent user audio preferences (startup sound on/off + volume).
// Stored in localStorage so it survives reloads and is read by sensei-tone.ts.

const ENABLED_KEY = "studio-sensei-audio-enabled";
const VOLUME_KEY = "studio-sensei-audio-volume";

export type AudioSettings = {
  enabled: boolean;
  volume: number; // 0..1
};

const DEFAULTS: AudioSettings = { enabled: true, volume: 0.7 };

export const getAudioSettings = (): AudioSettings => {
  if (typeof window === "undefined") return DEFAULTS;
  const enabledRaw = window.localStorage.getItem(ENABLED_KEY);
  const volumeRaw = window.localStorage.getItem(VOLUME_KEY);
  const enabled = enabledRaw === null ? DEFAULTS.enabled : enabledRaw === "1";
  const volume = volumeRaw === null ? DEFAULTS.volume : Math.min(1, Math.max(0, Number(volumeRaw)));
  return { enabled, volume: Number.isFinite(volume) ? volume : DEFAULTS.volume };
};

export const setAudioEnabled = (enabled: boolean) => {
  window.localStorage.setItem(ENABLED_KEY, enabled ? "1" : "0");
  window.dispatchEvent(new CustomEvent("studio-sensei-audio-settings-changed"));
};

export const setAudioVolume = (volume: number) => {
  const clamped = Math.min(1, Math.max(0, volume));
  window.localStorage.setItem(VOLUME_KEY, String(clamped));
  window.dispatchEvent(new CustomEvent("studio-sensei-audio-settings-changed"));
};

export const subscribeAudioSettings = (cb: () => void) => {
  const handler = () => cb();
  window.addEventListener("studio-sensei-audio-settings-changed", handler);
  return () => window.removeEventListener("studio-sensei-audio-settings-changed", handler);
};
