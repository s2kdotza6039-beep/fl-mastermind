/* eslint-disable react-refresh/only-export-components */
// Voice Reading V1 — zero-dependency SpeechSynthesis wrapper with a single
// global playback state so only one message is ever read aloud at a time.
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

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
  speak: (id: string, text: string) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
}

const SpeechContext = createContext<SpeechContextValue | null>(null);

export function stripForSpeech(input: string): string {
  return input
    .replace(/```[\s\S]*?```/g, " code block ")
    .replace(/`[^`]*`/g, " code block ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, " ")
    .replace(/[#>*_`~|-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countSentences(text: string): number {
  const m = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
  return m ? m.filter((s) => s.trim().length > 0).length : 0;
}

export function SpeechProvider({ children }: { children: ReactNode }) {
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  const [state, setState] = useState<SpeechState>("idle");
  const [speakingFor, setSpeakingFor] = useState<string | null>(null);
  const [progress, setProgress] = useState<SpeechProgress>({ current: 0, total: 0 });
  const [rate, setRateState] = useState(1);
  const rateRef = useRef(1);

  const setRate = useCallback((r: number) => {
    rateRef.current = r;
    setRateState(r);
  }, []);

  const stop = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setState("idle");
    setSpeakingFor(null);
    setProgress({ current: 0, total: 0 });
  }, [supported]);

  const speak = useCallback(
    (id: string, text: string) => {
      if (!supported) return;
      window.speechSynthesis.cancel();
      const clean = stripForSpeech(text);
      if (!clean) return;
      const total = countSentences(clean);
      setProgress({ current: 0, total });
      const utter = new SpeechSynthesisUtterance(clean);
      utter.rate = rateRef.current;
      utter.onboundary = (e: SpeechSynthesisEvent) => {
        if ((e as any).name === "sentence") {
          setProgress((p) => ({ ...p, current: Math.min(p.total, p.current + 1) }));
        }
      };
      utter.onend = () => {
        setState("idle");
        setSpeakingFor(null);
      };
      utter.onerror = () => {
        setState("idle");
        setSpeakingFor(null);
      };
      setSpeakingFor(id);
      setState("playing");
      window.speechSynthesis.speak(utter);
    },
    [supported],
  );

  const pause = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.pause();
    setState("paused");
  }, [supported]);

  const resume = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.resume();
    setState("playing");
  }, [supported]);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const value = useMemo(
    () => ({ supported, state, speakingFor, progress, rate, setRate, speak, pause, resume, stop }),
    [supported, state, speakingFor, progress, rate, setRate, speak, pause, resume, stop],
  );

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
      speak: () => {},
      pause: () => {},
      resume: () => {},
      stop: () => {},
    };
  }
  return ctx;
}
