/* eslint-disable react-refresh/only-export-components */
// Voice Reading V1.5 — humanized browser TTS: best-voice selection, sentence-
// chunked playback (natural cadence + cross-browser progress, no onboundary
// reliance), and per-message resume so users continue where they stopped.
import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type SpeechState = "idle" | "playing" | "paused";

export interface SpeechProgress {
  current: number;
  total: number;
}

interface SpeechContextValue {
  supported: boolean;
  state: SpeechState;
  speakingFor: string | null;
  progress: SpeechProgress;
  rate: number;
  setRate: (r: number) => void;
  voices: SpeechSynthesisVoice[];
  voiceURI: string | null;
  setVoiceURI: (u: string | null) => void;
  resumeFor: (id: string) => ResumePos | null;
  speak: (id: string, text: string) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
}

const SpeechContext = createContext<SpeechContextValue | null>(null);

// ---------------------------------------------------------------------------
// Rate persistence (unchanged behaviour from V1)
// ---------------------------------------------------------------------------

export const SPEECH_RATE_KEY = "sensei.speech.rate";
export const SPEECH_PREFS_KEY = "sensei.speech.prefs";

export function loadStoredRate(fallback = 1): number {
  try {
    const raw = localStorage.getItem(SPEECH_RATE_KEY);
    const n = raw === null ? NaN : Number(raw);
    if (Number.isFinite(n) && n >= 0.5 && n <= 3) return n;
  } catch {
    /* storage unavailable */
  }
  return fallback;
}

export function storeRate(rate: number) {
  try {
    localStorage.setItem(SPEECH_RATE_KEY, String(rate));
  } catch {
    /* storage unavailable */
  }
}

export interface SpeechPrefs {
  autoResume: boolean;
  lastSpokenId: string | null;
}

export function loadStoredPrefs(): SpeechPrefs {
  try {
    const raw = localStorage.getItem(SPEECH_PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SpeechPrefs>;
      return {
        autoResume: !!parsed.autoResume,
        lastSpokenId: typeof parsed.lastSpokenId === "string" ? parsed.lastSpokenId : null,
      };
    }
  } catch {
    /* ignore */
  }
  return { autoResume: false, lastSpokenId: null };
}

export function storePrefs(prefs: SpeechPrefs) {
  try {
    localStorage.setItem(SPEECH_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Voice override persistence
// ---------------------------------------------------------------------------

export const SPEECH_VOICE_KEY = "sensei.speech.voice";

export function loadStoredVoiceURI(): string | null {
  try {
    const raw = localStorage.getItem(SPEECH_VOICE_KEY);
    return raw && raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

export function storeVoiceURI(uri: string | null) {
  try {
    if (uri) localStorage.setItem(SPEECH_VOICE_KEY, uri);
    else localStorage.removeItem(SPEECH_VOICE_KEY);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Voice scoring — pick the most human-sounding English voice available
// ---------------------------------------------------------------------------

export function scoreVoice(name: string, lang: string): number {
  const n = name.toLowerCase();
  const l = lang.toLowerCase().replace("_", "-");
  if (!l.startsWith("en")) return -1;
  let s = 10;
  if (l === "en-za") s += 40;
  else if (l === "en-gb") s += 30;
  else if (l === "en-us") s += 20;
  if (/natural|neural|online/.test(n)) s += 100;
  if (/aria|jenny|guy|andrew|sonia|ryan|libby|emma|brian/.test(n)) s += 60;
  if (/google/.test(n)) s += 45;
  if (/compact/.test(n)) s -= 40;
  if (/espeak|mbrola/.test(n)) s -= 30;
  return s;
}

export function pickBestVoice(
  voices: SpeechSynthesisVoice[],
  preferredURI?: string | null,
): SpeechSynthesisVoice | null {
  if (preferredURI) {
    const hit = voices.find((v) => v.voiceURI === preferredURI || v.name === preferredURI);
    if (hit) return hit;
  }
  const scored = voices
    .map((v) => ({ v, s: scoreVoice(v.name, v.lang) }))
    .filter((x) => x.s >= 0);
  const pool = scored.length > 0 ? scored : voices.map((v) => ({ v, s: 0 }));
  pool.sort((a, b) => b.s - a.s);
  return pool[0]?.v ?? null;
}

// ---------------------------------------------------------------------------
// Text → speech helpers (stripForSpeech / countSentences unchanged from V1)
// ---------------------------------------------------------------------------

/**
 * Convert markdown into speech-friendly prose.
 * Bullet/numbered list items and blockquotes become their own sentences so the
 * synthesizer pauses naturally and sentence progress tracking stays accurate.
 */
export function stripForSpeech(input: string): string {
  const withoutCode = (input ?? "")
    .replace(/```[\s\S]*?```/g, " code block. ")
    .replace(/`[^`]*`/g, " code block ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, " ");

  const lines = withoutCode.split(/\r?\n/);
  const out: string[] = [];

  for (const rawLine of lines) {
    let line = rawLine.trim();
    if (!line) continue;
    if (/^([-*_])\1{2,}$/.test(line.replace(/\s/g, ""))) continue; // horizontal rule

    let isBlock = false;
    // blockquote
    if (/^>+\s?/.test(line)) {
      line = line.replace(/^>+\s?/, "").trim();
      if (!line) continue;
      line = `Quote: ${line}`;
      isBlock = true;
    }
    // headings
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      line = heading[1].trim();
      isBlock = true;
    }
    // task list items
    const task = line.match(/^[-*+]\s+\[( |x|X)\]\s+(.*)$/);
    if (task) {
      line = task[2].trim();
      isBlock = true;
    } else {
      // bullets
      const bullet = line.match(/^[-*+]\s+(.*)$/);
      if (bullet) {
        line = bullet[1].trim();
        isBlock = true;
      } else {
        // numbered list
        const num = line.match(/^\d+[.)]\s+(.*)$/);
        if (num) {
          line = num[1].trim();
          isBlock = true;
        }
      }
    }

    // inline emphasis / table pipes / leftover markers
    line = line
      .replace(/\*\*|__|[*_~`]/g, "")
      .replace(/\|/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!line) continue;

    if (isBlock && !/[.!?:;]$/.test(line)) line += ".";
    out.push(line);
  }

  return out.join(" ").replace(/\s+/g, " ").trim();
}

export function splitSentences(text: string): string[] {
  const m = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
  return m ? m.map((s) => s.trim()).filter((s) => s.length > 0) : [];
}

export function countSentences(text: string): number {
  return splitSentences(text).length;
}

/** Stable, content-derived message id (djb2) — survives reloads, unlike indices. */
export function messageKey(content: string): string {
  let h = 5381;
  const s = content ?? "";
  for (let i = 0; i < s.length; i++) {
    h = (((h << 5) + h + s.charCodeAt(i)) | 0) >>> 0;
  }
  return "m" + h.toString(36);
}

// ---------------------------------------------------------------------------
// Per-message resume positions
// ---------------------------------------------------------------------------

export interface ResumePos {
  sentence: number;
  total: number;
  updatedAt: number;
}

const RESUME_PREFIX = "sensei.speech.resume.";

export function saveResume(id: string, sentence: number, total: number) {
  try {
    const pos: ResumePos = { sentence, total, updatedAt: Date.now() };
    localStorage.setItem(RESUME_PREFIX + id, JSON.stringify(pos));
  } catch {
    /* ignore */
  }
}

/** Returns null when there is nothing useful to resume from. */
export function loadResume(id: string): ResumePos | null {
  try {
    const raw = localStorage.getItem(RESUME_PREFIX + id);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<ResumePos>;
    if (
      typeof o.sentence === "number" &&
      typeof o.total === "number" &&
      o.sentence > 0 &&
      o.sentence < o.total
    ) {
      return {
        sentence: o.sentence,
        total: o.total,
        updatedAt: typeof o.updatedAt === "number" ? o.updatedAt : 0,
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function clearResume(id: string) {
  try {
    localStorage.removeItem(RESUME_PREFIX + id);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Provider — sentence-chained playback engine
// ---------------------------------------------------------------------------

const GAP_MS = 110; // short "breath" between sentences — more human cadence

export function SpeechProvider({ children }: { children: ReactNode }) {
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  const [state, setState] = useState<SpeechState>("idle");
  const [speakingFor, setSpeakingFor] = useState<string | null>(null);
  const [progress, setProgress] = useState<SpeechProgress>({ current: 0, total: 0 });
  const [rate, setRateState] = useState(() => loadStoredRate(1));
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURIState] = useState<string | null>(() => loadStoredVoiceURI());

  const rateRef = useRef(rate);
  const voiceURIRef = useRef(voiceURI);
  // The single active "run": which message, its sentences, and a pending gap timer.
  const runRef = useRef<{ id: string | null; timer: number | null; sentences: string[] }>({
    id: null,
    timer: null,
    sentences: [],
  });
  const pausedInGapRef = useRef(false);

  const setRate = (r: number) => {
    rateRef.current = r;
    setRateState(r);
    storeRate(r);
  };

  const setVoiceURI = (u: string | null) => {
    voiceURIRef.current = u;
    setVoiceURIState(u);
    storeVoiceURI(u);
  };

  useEffect(() => {
    if (!supported) return;
    const synth = window.speechSynthesis;
    const load = () => {
      const list = synth.getVoices();
      // Deduplicate by voiceURI — some browsers list the same voice twice.
      const map = new Map<string, SpeechSynthesisVoice>();
      for (const v of list) if (!map.has(v.voiceURI)) map.set(v.voiceURI, v);
      setVoices(Array.from(map.values()));
    };
    load();
    synth.addEventListener?.("voiceschanged", load);
    return () => synth.removeEventListener?.("voiceschanged", load);
  }, [supported]);

  const clearGapTimer = () => {
    if (runRef.current.timer !== null) {
      window.clearTimeout(runRef.current.timer);
      runRef.current.timer = null;
    }
  };

  const resetUI = () => {
    setState("idle");
    setSpeakingFor(null);
    setProgress({ current: 0, total: 0 });
  };

  /** Chain starter — speaks runRef.current.sentences[fromIndex .. end]. */
  const beginChain = (id: string, fromIndex: number) => {
    const sentences = runRef.current.sentences;
    if (runRef.current.id !== id) return;
    if (fromIndex >= sentences.length) {
      // Natural completion — forget the resume point, the lesson is done.
      runRef.current.id = null;
      clearResume(id);
      resetUI();
      return;
    }
    const utter = new SpeechSynthesisUtterance(sentences[fromIndex]);
    utter.rate = rateRef.current;
    utter.pitch = 1;
    utter.volume = 1;
    const voice = pickBestVoice(window.speechSynthesis.getVoices(), voiceURIRef.current);
    if (voice) utter.voice = voice;
    utter.onend = () => {
      if (runRef.current.id !== id) return;
      const done = fromIndex + 1;
      setProgress((p) => ({ ...p, current: Math.min(p.total, done) }));
      saveResume(id, done, sentences.length);
      runRef.current.timer = window.setTimeout(() => {
        runRef.current.timer = null;
        beginChain(id, done);
      }, GAP_MS);
    };
    utter.onerror = () => {
      if (runRef.current.id !== id) return;
      runRef.current.id = null;
      resetUI();
    };
    window.speechSynthesis.speak(utter);
  };

  const speak = (id: string, text: string) => {
    if (!supported) return;
    // Abort any current run.
    clearGapTimer();
    runRef.current.id = null;
    window.speechSynthesis.cancel();

    const sentences = splitSentences(stripForSpeech(text));
    if (sentences.length === 0) return;

    const saved = loadResume(id);
    const start = saved && saved.total === sentences.length ? saved.sentence : 0;

    runRef.current.id = id;
    runRef.current.sentences = sentences;
    setSpeakingFor(id);
    setState("playing");
    setProgress({ current: start, total: sentences.length });
    beginChain(id, start);
  };

  const pause = () => {
    if (!supported || runRef.current.id === null) return;
    if (runRef.current.timer !== null) {
      // Paused during the inter-sentence gap — nothing is actually speaking.
      clearGapTimer();
      pausedInGapRef.current = true;
    } else {
      pausedInGapRef.current = false;
      window.speechSynthesis.pause();
    }
    setState("paused");
  };

  const resume = () => {
    if (!supported || runRef.current.id === null) return;
    const id = runRef.current.id;
    setState("playing");
    if (pausedInGapRef.current) {
      pausedInGapRef.current = false;
      const saved = loadResume(id);
      beginChain(id, saved ? saved.sentence : 0);
    } else {
      window.speechSynthesis.resume();
    }
  };

  const stop = () => {
    if (!supported) return;
    clearGapTimer();
    const id = runRef.current.id;
    runRef.current.id = null;
    pausedInGapRef.current = false;
    window.speechSynthesis.cancel();
    if (id) clearResume(id); // deliberate Stop = user is done with this message
    resetUI();
  };

  const resumeFor = (id: string): ResumePos | null => loadResume(id);

  // Keyboard shortcuts: Space = pause/resume current reading, S = stop.
  // Guarded so typing in inputs/textareas is never hijacked.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName ?? "";
      const editable =
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable;
      if (editable) return;
      if (runRef.current.id === null) return;
      if (e.code === "Space") {
        e.preventDefault();
        if (pausedInGapRef.current || window.speechSynthesis.paused) {
          resume();
        } else {
          pause();
        }
      } else if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        stop();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  useEffect(() => {
    return () => {
      if (runRef.current.timer !== null) window.clearTimeout(runRef.current.timer);
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const value: SpeechContextValue = {
    supported,
    state,
    speakingFor,
    progress,
    rate,
    setRate,
    voices,
    voiceURI,
    setVoiceURI,
    resumeFor,
    speak,
    pause,
    resume,
    stop,
  };

  return createElement(SpeechContext.Provider, { value }, children);
}

export function useSpeech(): SpeechContextValue {
  const ctx = useContext(SpeechContext);
  if (!ctx) {
    return {
      supported: false,
      state: "idle",
      speakingFor: null,
      progress: { current: 0, total: 0 },
      rate: 1,
      setRate: () => {},
      voices: [],
      voiceURI: null,
      setVoiceURI: () => {},
      resumeFor: () => null,
      speak: () => {},
      pause: () => {},
      resume: () => {},
      stop: () => {},
    };
  }
  return ctx;
}
