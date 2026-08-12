import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  UploadCloud, FileAudio, X, Sparkles, Loader2, MessageCircle, RefreshCcw, AlertTriangle,
  Scissors, Minus, Plus, Target, FileJson, FileAudio2, Clipboard,
} from "lucide-react";
import { SenseiChat } from "@/components/SenseiChat";
import { ActiveTrackChip } from "@/components/ActiveTrackChip";
import { UploadTrustPanel } from "@/components/UploadTrustPanel";
import { AudioReportCard } from "@/components/AudioReportCard";
import { ReferenceCompareCard } from "@/components/ReferenceCompareCard";
import { WaveformPlayer, type WaveformSelection, type WaveformPlayerHandle } from "@/components/WaveformPlayer";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  computeWaveformPeaks,
  decodeAudioToChannels,
  detectFormat,
  runAnalysisOnDecoded,
  type AudioAnalysisResult,
  type DecodedAudio,
  formatMetricsForPrompt,
} from "@/lib/audio-analysis";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useTrackSession } from "@/context/TrackSessionContext";
import { useProject } from "@/context/ProjectContext";
import { addTrackVersion, touchLastOpened } from "@/lib/project-memory";
import { overrideIssue } from "@/lib/loop-guard";
import { BANDS } from "@/lib/coaching-loop";
import { buildUploadAdvisePrompt, persistAnalyzedUpload, runCoachingLoop } from "@/lib/coaching-runner";
import { stashChatPrompt } from "@/lib/knowledge-handoff";
import { Link, useNavigate } from "react-router-dom";
import { Music, Sliders } from "lucide-react";
import { toast } from "sonner";

const MAX_FILE_MB = 50;

interface StatusEntry {
  pct: number;
  label: string;
  at: number;
}

interface Diagnostics {
  startedAt: string;
  fileName: string;
  fileSizeBytes: number;
  fileFormat: string;
  decodedReused: boolean;
  decodeMs: number;
  dspMs: number;
  totalMs: number;
  fallbackToMainThread: boolean;
  retryAttempted: boolean;
  range: { startSec: number; endSec: number } | null;
  workerSupported: boolean;
  hardwareConcurrency: number;
  userAgent: string;
  bpm: number | null;
  bpmConfidence: number;
  bpmConfidenceLabel: string;
  detectedKey: string | null;
  keyConfidence: number;
  keyConfidenceLabel: string;
  statusLog: StatusEntry[];
  errorMessage?: string;
}
const PRESET_PREFIX = "studio-sensei:bpm-preset:v1:";
const REGION_PREFIX = "studio-sensei:region-preset:v1:";

function presetKey(file: File | null): string | null {
  if (!file) return null;
  return `${PRESET_PREFIX}${file.name}:${file.size}`;
}
function regionKey(file: File | null): string | null {
  if (!file) return null;
  return `${REGION_PREFIX}${file.name}:${file.size}`;
}

interface BpmPreset { nudge: number; offsetSec: number; savedAt: string }
interface RegionPreset { startSec: number; endSec: number; savedAt: string }

export type WavBitDepth = "pcm16" | "pcm24" | "float32";

/** Linear resampler (per-channel). For MVP — fine for export, not pristine quality. */
function resampleChannels(channels: Float32Array[], fromRate: number, toRate: number): Float32Array[] {
  if (fromRate === toRate) return channels.map((c) => new Float32Array(c));
  const ratio = fromRate / toRate;
  const newLen = Math.floor(channels[0].length / ratio);
  return channels.map((src) => {
    const out = new Float32Array(newLen);
    for (let i = 0; i < newLen; i++) {
      const srcIdx = i * ratio;
      const i0 = Math.floor(srcIdx);
      const i1 = Math.min(src.length - 1, i0 + 1);
      const t = srcIdx - i0;
      out[i] = src[i0] * (1 - t) + src[i1] * t;
    }
    return out;
  });
}

interface EncodeOptions {
  signal?: { cancelled: boolean };
  onProgress?: (pct: number) => void;
  chunkFrames?: number;
}

async function encodeWavAsync(
  channels: Float32Array[],
  sampleRate: number,
  depth: WavBitDepth,
  opts: EncodeOptions = {},
): Promise<Blob> {
  const numCh = channels.length;
  const numFrames = channels[0]?.length ?? 0;
  const bytesPerSample = depth === "pcm16" ? 2 : depth === "pcm24" ? 3 : 4;
  const isFloat = depth === "float32";
  const formatTag = isFloat ? 3 : 1; // 1 = PCM, 3 = IEEE float
  const dataLen = numFrames * numCh * bytesPerSample;
  const buf = new ArrayBuffer(44 + dataLen);
  const view = new DataView(buf);
  const writeStr = (off: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataLen, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, formatTag, true);
  view.setUint16(22, numCh, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numCh * bytesPerSample, true);
  view.setUint16(32, numCh * bytesPerSample, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeStr(36, "data");
  view.setUint32(40, dataLen, true);

  const chunkFrames = opts.chunkFrames ?? Math.max(8192, Math.floor(sampleRate / 4)); // ~250ms
  let off = 44;
  let f = 0;
  while (f < numFrames) {
    if (opts.signal?.cancelled) throw new Error("cancelled");
    const end = Math.min(numFrames, f + chunkFrames);
    for (; f < end; f++) {
      for (let c = 0; c < numCh; c++) {
        const sample = Math.max(-1, Math.min(1, channels[c][f]));
        if (depth === "pcm16") {
          view.setInt16(off, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
          off += 2;
        } else if (depth === "pcm24") {
          const v = Math.round((sample < 0 ? sample * 0x800000 : sample * 0x7fffff)) | 0;
          view.setUint8(off, v & 0xff);
          view.setUint8(off + 1, (v >> 8) & 0xff);
          view.setUint8(off + 2, (v >> 16) & 0xff);
          off += 3;
        } else {
          view.setFloat32(off, sample, true);
          off += 4;
        }
      }
    }
    opts.onProgress?.(f / numFrames);
    // Yield to event loop so UI / cancel can respond.
    await new Promise((r) => setTimeout(r, 0));
  }
  return new Blob([buf], { type: "audio/wav" });
}



export default function UploadPage() {
  const { user } = useAuth();
  const { setActiveReport, refreshRecent } = useTrackSession();
  const { activeProject } = useProject();
  const navigate = useNavigate();
  const [lastReportId, setLastReportId] = useState<string | null>(null);
  // R14 — first bounce ends in a decision, not an auto-jump to chat.
  const [showWhatNext, setShowWhatNext] = useState(false);
  const [firstBounceId, setFirstBounceId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [continuityHold, setContinuityHold] = useState<{ reportId: string; versionId: string; reasons: string[]; prevFileName: string | null } | null>(null);
  const [decoded, setDecoded] = useState<DecodedAudio | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [statusLog, setStatusLog] = useState<StatusEntry[]>([]);
  const [result, setResult] = useState<AudioAnalysisResult | null>(null);
  const [analyzedRange, setAnalyzedRange] = useState<WaveformSelection | null>(null);
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  const [askSensei, setAskSensei] = useState(false);
  const [selection, setSelection] = useState<WaveformSelection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [bpmNudge, setBpmNudge] = useState(0); // ± offset on top of detected BPM
  const [downbeatOffsetSec, setDownbeatOffsetSec] = useState(0);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [wavBitDepth, setWavBitDepth] = useState<WavBitDepth>("pcm16");
  const [wavSampleRate, setWavSampleRate] = useState<"original" | "44100" | "48000" | "96000">("original");
  const [savedRegion, setSavedRegion] = useState<RegionPreset | null>(null);
  const [exportState, setExportState] = useState<{
    active: boolean; pct: number; etaMs: number; sizeBytes: number; startedAt: number;
  } | null>(null);
  const exportCancelRef = useRef<{ cancelled: boolean } | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [waveformFocused, setWaveformFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastAdvisedRef = useRef<string | null>(null);
  const waveformCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const waveformRef = useRef<WaveformPlayerHandle | null>(null);
  const waveformWrapperRef = useRef<HTMLDivElement | null>(null);

  const audioUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);

  // Load saved BPM preset for this file (if any) when it's selected.
  useEffect(() => {
    const key = presetKey(file);
    if (!key) return;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const p = JSON.parse(raw) as BpmPreset;
      if (typeof p.nudge === "number") setBpmNudge(p.nudge);
      if (typeof p.offsetSec === "number") setDownbeatOffsetSec(p.offsetSec);
      toast.message(`Restored saved BPM alignment for ${file!.name}`, {
        description: `nudge ${p.nudge >= 0 ? "+" : ""}${p.nudge.toFixed(1)} BPM · offset ${p.offsetSec.toFixed(2)}s`,
      });
    } catch (e) {
      console.warn("Failed to load BPM preset", e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  // Auto-save BPM preset when alignment changes (debounced via timer).
  useEffect(() => {
    const key = presetKey(file);
    if (!key) return;
    const handle = setTimeout(() => {
      try {
        if (bpmNudge === 0 && downbeatOffsetSec === 0) {
          localStorage.removeItem(key);
        } else {
          const preset: BpmPreset = {
            nudge: bpmNudge,
            offsetSec: downbeatOffsetSec,
            savedAt: new Date().toISOString(),
          };
          localStorage.setItem(key, JSON.stringify(preset));
        }
      } catch (e) {
        console.warn("Failed to save BPM preset", e);
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [file, bpmNudge, downbeatOffsetSec]);

  // Load saved region selection per file once we know its duration (decoded ready).
  useEffect(() => {
    const key = regionKey(file);
    if (!key || !decoded) return;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) { setSavedRegion(null); return; }
      const r = JSON.parse(raw) as RegionPreset;
      if (typeof r.startSec !== "number" || typeof r.endSec !== "number" || r.endSec <= r.startSec) {
        setSavedRegion(null); return;
      }
      // Auto-clamp to valid bounds.
      const origStart = r.startSec, origEnd = r.endSec;
      const clampedEnd = Math.max(0.25, Math.min(origEnd, decoded.duration));
      const clampedStart = Math.max(0, Math.min(origStart, clampedEnd - 0.05));
      const adjusted = clampedStart !== origStart || clampedEnd !== origEnd;
      if (clampedEnd - clampedStart < 0.25) {
        // Region became invalid after clamp — drop it.
        localStorage.removeItem(key);
        setSavedRegion(null);
        if (adjusted) {
          toast.warning("Saved region was outside this file and was discarded", {
            description: `Original ${origStart.toFixed(2)}s – ${origEnd.toFixed(2)}s exceeded ${decoded.duration.toFixed(2)}s.`,
          });
        }
        return;
      }
      const finalRegion: RegionPreset = { startSec: clampedStart, endSec: clampedEnd, savedAt: r.savedAt };
      setSavedRegion(finalRegion);
      if (!selection) setSelection({ startSec: clampedStart, endSec: clampedEnd });
      if (adjusted) {
        toast.warning("Saved region was clamped to valid bounds", {
          description: `Adjusted from ${origStart.toFixed(2)}–${origEnd.toFixed(2)}s to ${clampedStart.toFixed(2)}–${clampedEnd.toFixed(2)}s.`,
        });
      } else {
        toast.message("Restored saved selection", {
          description: `${clampedStart.toFixed(2)}s – ${clampedEnd.toFixed(2)}s`,
        });
      }
    } catch (e) {
      console.warn("Failed to load region preset", e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, decoded]);

  // Auto-save region selection (debounced).
  useEffect(() => {
    const key = regionKey(file);
    if (!key) return;
    const handle = setTimeout(() => {
      try {
        if (!selection) {
          localStorage.removeItem(key);
          setSavedRegion(null);
        } else {
          const p: RegionPreset = { startSec: selection.startSec, endSec: selection.endSec, savedAt: new Date().toISOString() };
          localStorage.setItem(key, JSON.stringify(p));
          setSavedRegion(p);
        }
      } catch (e) { console.warn("Failed to save region preset", e); }
    }, 400);
    return () => clearTimeout(handle);
  }, [file, selection]);


  const reset = () => {
    setFile(null);
    setDecoded(null);
    setResult(null);
    setAnalyzedRange(null);
    setPeaks(null);
    setAskSensei(false);
    setProgress(0);
    setProgressLabel("");
    setStatusLog([]);
    setSelection(null);
    setError(null);
    setRetryCount(0);
    setBpmNudge(0);
    setDownbeatOffsetSec(0);
    setDiagnostics(null);
    setShowWhatNext(false);
    setFirstBounceId(null);
  };

  const pushStatus = useCallback((pct: number, label: string) => {
    setProgress(pct);
    setProgressLabel(label);
    setStatusLog((prev) => {
      // De-dupe same label adjacent
      if (prev.length && prev[prev.length - 1].label === label) return prev;
      const next = [...prev, { pct, label, at: Date.now() }];
      return next.slice(-6);
    });
  }, []);

  const onFiles = (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    if (!f.type.startsWith("audio/") && !/\.(wav|mp3|aiff|flac|m4a|ogg)$/i.test(f.name)) {
      toast.error("Please upload a WAV or MP3 file");
      return;
    }
    if (f.size > MAX_FILE_MB * 1024 * 1024) {
      toast.error(`File too large (max ${MAX_FILE_MB}MB)`);
      return;
    }
    setFile(f);
    setDecoded(null);
    setResult(null);
    setPeaks(null);
    setAskSensei(false);
    setSelection(null);
    setError(null);
  };

  const persistReport = async (res: AudioAnalysisResult) => {
    if (!user) return;
    setContinuityHold(null);
    const outcome = await persistAnalyzedUpload({
      userId: user.id,
      activeProject,
      res,
      setActiveReport,
    });
    await refreshRecent();
    if (!outcome.reportId) {
      console.warn("Failed to save analysis report:", outcome.error ?? "unknown");
      return;
    }
    if (outcome.kind === "coached") {
      setLastReportId(outcome.reportId);
      if (outcome.isFirstBounce && !askSensei) {
        // R14 — the first bounce is an ANALYSIS, not a lecture. Let the producer choose.
        lastAdvisedRef.current = outcome.reportId;
        setFirstBounceId(outcome.reportId);
        setShowWhatNext(true);
        toast.success("Analysis complete — Sensei has heard your beat.");
      } else if (lastAdvisedRef.current !== outcome.reportId) {
        // R12 — seamless continuation: hand the story straight to Sensei.
        lastAdvisedRef.current = outcome.reportId;
        const story = outcome.story ?? null;
        stashChatPrompt(buildUploadAdvisePrompt(res.metrics.fileName, res, story), "MIXING");
        if (!askSensei) {
          const headline = story
            ? story.masterReady
              ? `Mix score ${story.score}/100 — 🏁 Mixing complete, next: Mastering`
              : `Mix score ${story.score}/100${story.delta != null ? ` (${story.delta >= 0 ? "+" : ""}${story.delta})` : ""} — next fix inside`
            : "Sensei is ready with your next fix";
          toast.success(headline);
          setTimeout(() => navigate("/chat?scope=MIXING"), 650);
        }

      }
    }
    if (outcome.kind === "foreign" && outcome.versionId) {
      setContinuityHold({
        reportId: outcome.reportId,
        versionId: outcome.versionId,
        reasons: outcome.reasons,
        prevFileName: outcome.prevFileName,
      });
      toast.warning("Sensei paused coaching — this doesn't sound like the same beat.");
    }
    if (outcome.linkError) {
      toast.warning(
        "Analysis saved, but could not be linked to your project. Reopen the project and re-activate this track.",
      );
    }
    if (outcome.loopError) {
      toast.warning("Analysis saved, but the coaching loop did not update. Retry the upload.");
    }
  };

  // R9.7 — door 1: the producer confirms the flagged beat IS the same song.
  // The override is logged on the report (visible, permanent), then the normal
  // coaching pipeline runs: activate → score → delta → plan.
  const confirmSameBeat = async () => {
    if (!user || !activeProject || !continuityHold || !result) return;
    const hold = continuityHold;
    try {
      const { data: row } = await supabase
        .from("audio_analysis_reports")
        .select("detected_issues")
        .eq("id", hold.reportId)
        .maybeSingle();
      const issues = Array.isArray((row as any)?.detected_issues) ? ((row as any).detected_issues as any[]) : [];
      await supabase
        .from("audio_analysis_reports")
        .update({ detected_issues: [...issues, overrideIssue()] as any })
        .eq("id", hold.reportId);
      setContinuityHold(null);
      setLastReportId(hold.reportId);
      await setActiveReport(hold.reportId);
      await runCoachingLoop(user.id, activeProject.id, activeProject.genre, hold.reportId, hold.versionId, result);
      toast.success("Confirmed — coaching resumed. The override is logged on this report.");
    } catch (e: any) {
      console.warn("Override failed:", e?.message ?? e);
      toast.error("Could not confirm the override — try re-uploading.");
    }
  };

  const runAnalysis = async () => {
    if (!file) return;
    setAnalyzing(true);
    setError(null);
    setProgress(0);
    setStatusLog([]);
    const collectedLog: StatusEntry[] = [];
    let sawFallback = false;
    const trackingPush = (pct: number, label: string) => {
      if (/main thread|worker unavailable/i.test(label)) sawFallback = true;
      collectedLog.push({ pct, label, at: Date.now() });
      pushStatus(pct, label);
    };
    const t0 = performance.now();
    const startedAt = new Date().toISOString();
    let decodeMs = 0, decodedReused = !!decoded;
    trackingPush(2, selection
      ? `Re-analyzing selection (${selection.startSec.toFixed(1)}s–${selection.endSec.toFixed(1)}s)…`
      : decoded ? "Reusing cached decoded buffer — re-running DSP only…" : "Starting full-track analysis…");
    try {
      let workingDecoded = decoded;
      if (!workingDecoded) {
        trackingPush(5, "Decoding audio in browser…");
        const tDec = performance.now();
        workingDecoded = await decodeAudioToChannels(file);
        decodeMs = performance.now() - tDec;
        setDecoded(workingDecoded);
        try { setPeaks(computeWaveformPeaks(workingDecoded.channelData[0], 600)); } catch (e) { console.warn(e); }
      }
      const tDsp = performance.now();
      const res = await runAnalysisOnDecoded(
        workingDecoded,
        { name: file.name, format: detectFormat(file), sizeBytes: file.size },
        selection ?? undefined,
        trackingPush,
      );
      const dspMs = performance.now() - tDsp;
      setResult(res);
      setAnalyzedRange(selection ?? null);
      // Keep the user's BPM nudge / downbeat offset — they're per-file presets now.
      setDiagnostics({
        startedAt,
        fileName: file.name,
        fileSizeBytes: file.size,
        fileFormat: detectFormat(file),
        decodedReused,
        decodeMs: Math.round(decodeMs),
        dspMs: Math.round(dspMs),
        totalMs: Math.round(performance.now() - t0),
        fallbackToMainThread: sawFallback,
        retryAttempted: retryCount > 0,
        range: selection ?? null,
        workerSupported: typeof Worker !== "undefined",
        hardwareConcurrency: navigator.hardwareConcurrency || 0,
        userAgent: navigator.userAgent,
        bpm: res.metrics.bpm,
        bpmConfidence: res.metrics.bpmConfidence.value,
        bpmConfidenceLabel: res.metrics.bpmConfidence.label,
        detectedKey: res.metrics.detectedKey,
        keyConfidence: res.metrics.keyConfidence.value,
        keyConfidenceLabel: res.metrics.keyConfidence.label,
        statusLog: collectedLog.slice(-30),
      });
      await persistReport(res);
      toast.success(selection ? "Selection analyzed" : "Analysis complete");
    } catch (e: any) {
      const msg = e?.message || "Failed to analyze audio";
      console.error("[analysis]", e);
      setError(msg);
      setDiagnostics({
        startedAt,
        fileName: file.name,
        fileSizeBytes: file.size,
        fileFormat: detectFormat(file),
        decodedReused,
        decodeMs: Math.round(decodeMs),
        dspMs: 0,
        totalMs: Math.round(performance.now() - t0),
        fallbackToMainThread: sawFallback,
        retryAttempted: retryCount > 0,
        range: selection ?? null,
        workerSupported: typeof Worker !== "undefined",
        hardwareConcurrency: navigator.hardwareConcurrency || 0,
        userAgent: navigator.userAgent,
        bpm: null, bpmConfidence: 0, bpmConfidenceLabel: "unreliable",
        detectedKey: null, keyConfidence: 0, keyConfidenceLabel: "unreliable",
        statusLog: collectedLog.slice(-30),
        errorMessage: msg,
      });
      // Auto-retry once for transient worker failures — reuse the cached decoded buffer.
      if (retryCount === 0 && /worker|timed out|crashed/i.test(msg)) {
        setRetryCount(1);
        toast.message("Worker failed — retrying with cached buffer on main thread…");
        try {
          let working = decoded;
          if (!working && file) {
            working = await decodeAudioToChannels(file);
            setDecoded(working);
            setPeaks(computeWaveformPeaks(working.channelData[0], 600));
          }
          if (!working) throw new Error("No decoded buffer available for retry.");
          const res = await runAnalysisOnDecoded(
            working,
            { name: file!.name, format: detectFormat(file!), sizeBytes: file!.size },
            selection ?? undefined,
            trackingPush,
          );
          setResult(res);
          setAnalyzedRange(selection ?? null);
          await persistReport(res);
          setError(null);
          toast.success("Analysis complete (recovered from cache)");
        } catch (e2: any) {
          setError(e2?.message || msg);
          toast.error("Analysis failed — see error below");
        }
      } else {
        toast.error(msg);
      }
    } finally {
      setAnalyzing(false);
    }
  };

  /** Snap the beat grid's downbeat to the first prominent onset detected in the waveform peaks. */
  const snapToDownbeat = () => {
    if (!peaks || peaks.length === 0) return;
    const dur = result?.metrics.durationSec ?? decoded?.duration ?? 0;
    if (dur <= 0) return;
    // Scan first ~6s for the loudest peak; use it as downbeat anchor.
    const window = Math.min(peaks.length, Math.floor((6 / dur) * peaks.length));
    let maxIdx = 0, maxVal = 0;
    for (let i = 0; i < window; i++) {
      if (peaks[i] > maxVal) { maxVal = peaks[i]; maxIdx = i; }
    }
    const t = (maxIdx / peaks.length) * dur;
    setDownbeatOffsetSec(t);
    toast.success(`Downbeat snapped to ${t.toFixed(2)}s`);
  };

  const downloadDiagnostics = () => {
    if (!diagnostics) return;
    const blob = new Blob([JSON.stringify(diagnostics, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safe = (file?.name || "track").replace(/\.[a-z0-9]+$/i, "").replace(/[^a-z0-9_-]+/gi, "_");
    a.href = url;
    a.download = `audio-diagnostics-${safe}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const copyDiagnostics = async () => {
    if (!diagnostics) return;
    const json = JSON.stringify(diagnostics, null, 2);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(json);
      } else {
        // Fallback for older browsers / insecure contexts.
        const ta = document.createElement("textarea");
        ta.value = json;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      toast.success("Diagnostics copied to clipboard");
    } catch (e: any) {
      toast.error(`Copy failed: ${e?.message || "clipboard unavailable"}`);
    }
  };

  const cancelExport = () => {
    if (exportCancelRef.current) exportCancelRef.current.cancelled = true;
  };

  const revertToSavedRegion = () => {
    if (!savedRegion) return;
    setSelection({ startSec: savedRegion.startSec, endSec: savedRegion.endSec });
    toast.success("Reverted to saved region");
  };

  const exportSelectionWav = async () => {
    if (!decoded || !selection) return;
    if (exportState?.active) return;
    const startSample = Math.max(0, Math.floor(selection.startSec * decoded.sampleRate));
    const endSample = Math.min(decoded.channelData[0].length, Math.floor(selection.endSec * decoded.sampleRate));
    if (endSample - startSample < 1) {
      toast.error("Selection too short to export");
      return;
    }
    const sliced = decoded.channelData.map((c) => c.slice(startSample, endSample));
    const targetRate = wavSampleRate === "original" ? decoded.sampleRate : parseInt(wavSampleRate, 10);
    const resampled = resampleChannels(sliced, decoded.sampleRate, targetRate);
    const bytesPerSample = wavBitDepth === "pcm16" ? 2 : wavBitDepth === "pcm24" ? 3 : 4;
    const estSize = resampled[0].length * resampled.length * bytesPerSample + 44;

    const cancelToken = { cancelled: false };
    exportCancelRef.current = cancelToken;
    const startedAt = performance.now();
    setExportState({ active: true, pct: 0, etaMs: 0, sizeBytes: estSize, startedAt });
    const toastId = toast.loading("Encoding WAV…", {
      description: `0% · ~${(estSize / 1024 / 1024).toFixed(2)} MB`,
    });

    try {
      const blob = await encodeWavAsync(resampled, targetRate, wavBitDepth, {
        signal: cancelToken,
        onProgress: (p) => {
          const elapsed = performance.now() - startedAt;
          const etaMs = p > 0.02 ? (elapsed / p) * (1 - p) : 0;
          setExportState({ active: true, pct: p, etaMs, sizeBytes: estSize, startedAt });
          toast.loading("Encoding WAV…", {
            id: toastId,
            description: `${Math.round(p * 100)}% · ETA ${(etaMs / 1000).toFixed(1)}s`,
          });
        },
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safe = (file?.name || "track").replace(/\.[a-z0-9]+$/i, "").replace(/[^a-z0-9_-]+/gi, "_");
      const suffix = `${wavBitDepth}_${targetRate}`;
      a.href = url;
      a.download = `${safe}_${selection.startSec.toFixed(2)}s-${selection.endSec.toFixed(2)}s_${suffix}.wav`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      const label = wavBitDepth === "float32" ? "32-bit float" : wavBitDepth === "pcm24" ? "24-bit PCM" : "16-bit PCM";
      toast.success(`Exported ${label} WAV @ ${targetRate} Hz`, {
        id: toastId,
        description: `${(selection.endSec - selection.startSec).toFixed(2)}s · ${(blob.size / 1024).toFixed(1)} KB`,
      });
    } catch (e: any) {
      if (e?.message === "cancelled") {
        toast.info("WAV export cancelled", { id: toastId });
      } else {
        toast.error(`Export failed: ${e?.message || "unknown error"}`, { id: toastId });
      }
    } finally {
      exportCancelRef.current = null;
      setExportState(null);
    }
  };

  const effectiveBpm = result?.metrics.bpm != null ? Math.max(20, result.metrics.bpm + bpmNudge) : null;

  // Recompute analysis timeline live whenever BPM nudge or downbeat offset changes.
  const beatInfo = useMemo(() => {
    const dur = result?.metrics.durationSec ?? decoded?.duration ?? 0;
    if (!effectiveBpm || dur <= 0) return null;
    const beatSec = 60 / effectiveBpm;
    const offset = ((downbeatOffsetSec % beatSec) + beatSec) % beatSec;
    const total = Math.max(0, Math.floor((dur - offset) / beatSec) + 1);
    const bars = Math.floor(total / 4);
    return {
      beatSec,
      offset,
      total,
      bars,
      msPerBeat: beatSec * 1000,
    };
  }, [effectiveBpm, downbeatOffsetSec, result?.metrics.durationSec, decoded?.duration]);


  const senseiAudioContext = result
    ? {
        fileName: result.metrics.fileName,
        fileFormat: result.metrics.fileFormat,
        durationSec: result.metrics.durationSec,
        sampleRate: result.metrics.sampleRate,
        bitRate: result.metrics.bitRate,
        channels: result.metrics.channels,
        peakDb: result.metrics.peakDb,
        rmsDb: result.metrics.rmsDb,
        lufsEstimate: result.metrics.lufsEstimate,
        dynamicRangeDb: result.metrics.dynamicRangeDb,
        stereoWidth: result.metrics.stereoWidth,
        stereoWidthLabel: result.metrics.stereoWidthLabel,
        bpm: result.metrics.bpm,
        detectedKey: result.metrics.detectedKey,
        bands: result.metrics.bands,
        issues: result.issues.map((i) => ({
          severity: i.severity,
          title: i.title,
          detail: i.detail,
          recommendation: i.recommendation,
        })),
      }
    : undefined;

  const senseiPrompt = result
    ? `Diagnose my mix from the audio analysis below and walk me through the top three fixes in priority order.\n\n${formatMetricsForPrompt(result.metrics, result.issues)}`
    : undefined;

  const getWaveformSnapshot = useCallback((): string | null => {
    const c = waveformCanvasRef.current;
    if (!c) return null;
    try { return c.toDataURL("image/png"); } catch { return null; }
  }, []);

  const bpmConfidenceValue = result?.metrics.bpmConfidence.value;

  // Keyboard shortcuts — only fire when waveform area is focused (or for the global "?" help toggle).
  // Always skip when a real form input is active, regardless of focus.
  useEffect(() => {
    if (!file) return;
    const isTypingTarget = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      if (!el) return false;
      if (/input|textarea|select/i.test(el.tagName)) return true;
      if (el.isContentEditable) return true;
      const role = el.getAttribute?.("role");
      if (role === "textbox" || role === "combobox") return true;
      return false;
    };
    const handler = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      // "?" toggles the help panel from anywhere (still respects typing check above).
      if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault();
        setShowShortcuts((s) => !s);
        return;
      }
      // All other shortcuts require the waveform region to have focus.
      if (!waveformFocused) return;
      const wf = waveformRef.current;
      switch (e.key) {
        case " ":
        case "Spacebar":
          e.preventDefault();
          wf?.togglePlay();
          break;
        case "+":
        case "=":
          e.preventDefault();
          wf?.zoomIn();
          break;
        case "-":
        case "_":
          e.preventDefault();
          wf?.zoomOut();
          break;
        case "0":
          if (e.shiftKey) { e.preventDefault(); wf?.resetZoom(); }
          break;
        case "ArrowLeft":
          if (result?.metrics.bpm == null) return;
          e.preventDefault();
          setBpmNudge((n) => Math.round((n - (e.shiftKey ? 1 : 0.1)) * 10) / 10);
          break;
        case "ArrowRight":
          if (result?.metrics.bpm == null) return;
          e.preventDefault();
          setBpmNudge((n) => Math.round((n + (e.shiftKey ? 1 : 0.1)) * 10) / 10);
          break;
        case "[":
          if (result?.metrics.bpm == null) return;
          e.preventDefault();
          setDownbeatOffsetSec((o) => Math.max(0, o - (e.shiftKey ? 0.1 : 0.01)));
          break;
        case "]":
          if (result?.metrics.bpm == null) return;
          e.preventDefault();
          setDownbeatOffsetSec((o) => o + (e.shiftKey ? 0.1 : 0.01));
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [file, result?.metrics.bpm, waveformFocused]);

  return (
    <div className="container max-w-4xl py-8 px-4 md:px-8">
      <PageHeader
        eyebrow="Audio Analysis"
        title="Upload & Analyze Your Track"
        description="Drop a WAV or MP3 and Sensei will measure loudness, dynamics, key, BPM, stereo width and frequency balance — then diagnose what to fix. Drag on the waveform to analyze a specific section."
        icon={<UploadCloud className="w-6 h-6" />}
      />

      <UploadTrustPanel />
      <ActiveTrackChip />

      {!file ? (
        <Card
          className="studio-card-gold p-12 text-center border-2 border-dashed border-primary/30 cursor-pointer hover:border-primary/60 transition"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); onFiles(e.dataTransfer.files); }}
        >
          <input
            ref={inputRef}
            type="file"
            accept="audio/*,.wav,.mp3,.aiff,.flac,.m4a,.ogg"
            className="hidden"
            onChange={(e) => onFiles(e.target.files)}
          />
          <UploadCloud className="w-14 h-14 mx-auto mb-4 text-primary" />
          <h3 className="font-display text-xl font-bold mb-2">Drop your audio file here</h3>
          <p className="text-sm text-muted-foreground mb-4">WAV, MP3, AIFF, FLAC, M4A, OGG — up to {MAX_FILE_MB}MB</p>
          <Button className="bg-gradient-gold text-primary-foreground hover:opacity-90">Choose file</Button>
        </Card>
      ) : (
        <>
          <Card className="studio-card p-6 mb-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 h-12 rounded-lg bg-gradient-gold flex items-center justify-center flex-shrink-0">
                  <FileAudio className="w-6 h-6 text-primary-foreground" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold truncate">{file.name}</h3>
                  <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={reset} aria-label="Remove file">
                <X className="w-4 h-4" />
              </Button>
            </div>

            {audioUrl && (
              <div
                ref={waveformWrapperRef}
                tabIndex={0}
                role="region"
                aria-label="Waveform — focus this area to use keyboard shortcuts (Space, +/-, arrows, [, ])"
                onFocus={() => setWaveformFocused(true)}
                onBlur={(e) => {
                  // Stay "focused" if the new focus target is still inside the wrapper.
                  if (!waveformWrapperRef.current?.contains(e.relatedTarget as Node)) setWaveformFocused(false);
                }}
                onMouseDown={() => waveformWrapperRef.current?.focus()}
                className={`rounded-md outline-none transition ring-offset-background ${waveformFocused ? "ring-2 ring-primary/40" : ""}`}
              >
                <WaveformPlayer
                  ref={waveformRef}
                  src={audioUrl}
                  peaks={peaks}
                  durationSec={result?.metrics.durationSec ?? decoded?.duration ?? 0}
                  bpm={effectiveBpm}
                  bpmConfidence={bpmConfidenceValue}
                  bpmOffsetSec={downbeatOffsetSec}
                  selection={selection}
                  onSelectionChange={setSelection}
                  onCanvasRef={(c) => { waveformCanvasRef.current = c; }}
                />
                <div className="mt-1 px-1 flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>
                    {waveformFocused
                      ? "⌨ Waveform focused — Space / +/− / ←→ / [ ] active"
                      : "Click the waveform to enable keyboard shortcuts"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowShortcuts((s) => !s)}
                    className="underline hover:text-foreground"
                    aria-label="Show keyboard shortcuts"
                  >
                    Press ? for shortcuts
                  </button>
                </div>
              </div>
            )}

            {savedRegion && (
              <div className="mt-2 flex flex-wrap items-center gap-2 px-2 py-1.5 rounded-md bg-secondary/30 border border-border text-[11px]">
                <span className="text-muted-foreground">Saved region:</span>
                <span className="tabular-nums text-foreground">
                  {savedRegion.startSec.toFixed(2)}s – {savedRegion.endSec.toFixed(2)}s
                </span>
                <span className="text-muted-foreground">
                  ({(savedRegion.endSec - savedRegion.startSec).toFixed(2)}s)
                </span>
                {selection && (selection.startSec !== savedRegion.startSec || selection.endSec !== savedRegion.endSec) && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 ml-1 text-[11px]"
                    onClick={revertToSavedRegion}
                  >
                    <RefreshCcw className="w-3 h-3 mr-1" /> Revert to saved region
                  </Button>
                )}
                {!selection && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 ml-1 text-[11px]"
                    onClick={revertToSavedRegion}
                  >
                    <RefreshCcw className="w-3 h-3 mr-1" /> Apply saved region
                  </Button>
                )}
              </div>
            )}

            {result?.metrics.bpm != null && (
              <div className="mt-3 flex flex-wrap items-center gap-2 p-2 rounded-md bg-secondary/40 border border-border text-xs">
                <span className="text-muted-foreground">Beat grid:</span>
                <Button type="button" size="icon" variant="outline" className="h-7 w-7" aria-label="Nudge BPM −1" onClick={() => setBpmNudge((n) => Math.round((n - 1) * 10) / 10)}>
                  <Minus className="w-3 h-3" />
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-7 px-2" onClick={() => setBpmNudge((n) => Math.round((n - 0.1) * 10) / 10)}>−0.1</Button>
                <span className="tabular-nums font-semibold min-w-[60px] text-center">
                  {effectiveBpm?.toFixed(1)} BPM
                </span>
                <Button type="button" size="sm" variant="outline" className="h-7 px-2" onClick={() => setBpmNudge((n) => Math.round((n + 0.1) * 10) / 10)}>+0.1</Button>
                <Button type="button" size="icon" variant="outline" className="h-7 w-7" aria-label="Nudge BPM +1" onClick={() => setBpmNudge((n) => Math.round((n + 1) * 10) / 10)}>
                  <Plus className="w-3 h-3" />
                </Button>
                {bpmNudge !== 0 && (
                  <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={() => setBpmNudge(0)}>Reset</Button>
                )}
                <span className="text-muted-foreground ml-2">Downbeat:</span>
                <Button type="button" size="sm" variant="outline" className="h-7 px-2" onClick={() => setDownbeatOffsetSec((o) => Math.max(0, o - 0.01))}>−10ms</Button>
                <span className="tabular-nums min-w-[55px] text-center">{downbeatOffsetSec.toFixed(2)}s</span>
                <Button type="button" size="sm" variant="outline" className="h-7 px-2" onClick={() => setDownbeatOffsetSec((o) => o + 0.01)}>+10ms</Button>
                <Button type="button" size="sm" variant="outline" className="h-7 px-2" onClick={snapToDownbeat}>
                  <Target className="w-3 h-3 mr-1" /> Snap to onset
                </Button>
                {downbeatOffsetSec !== 0 && (
                  <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={() => setDownbeatOffsetSec(0)}>Reset offset</Button>
                )}
              </div>
            )}

            {beatInfo && (
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground px-1">
                <span>Timeline: <span className="text-foreground tabular-nums">{beatInfo.total}</span> beats · <span className="text-foreground tabular-nums">{beatInfo.bars}</span> bars (4/4)</span>
                <span>Beat interval: <span className="text-foreground tabular-nums">{beatInfo.msPerBeat.toFixed(1)} ms</span></span>
                <span>First downbeat: <span className="text-foreground tabular-nums">{beatInfo.offset.toFixed(3)}s</span></span>
                {(bpmNudge !== 0 || downbeatOffsetSec !== 0) && (
                  <span className="text-primary/80">↳ saved per-file preset</span>
                )}
              </div>
            )}

            {selection && (
              <div className="mt-3 flex flex-wrap items-center gap-2 p-2 rounded-md bg-secondary/30 border border-border">
                <FileAudio2 className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Export selection WAV:</span>
                <Select value={wavBitDepth} onValueChange={(v) => setWavBitDepth(v as WavBitDepth)}>
                  <SelectTrigger className="h-7 w-[130px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pcm16">16-bit PCM</SelectItem>
                    <SelectItem value="pcm24">24-bit PCM</SelectItem>
                    <SelectItem value="float32">32-bit float</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={wavSampleRate} onValueChange={(v) => setWavSampleRate(v as typeof wavSampleRate)}>
                  <SelectTrigger className="h-7 w-[130px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="original">Original{decoded ? ` (${decoded.sampleRate} Hz)` : ""}</SelectItem>
                    <SelectItem value="44100">44.1 kHz</SelectItem>
                    <SelectItem value="48000">48 kHz</SelectItem>
                    <SelectItem value="96000">96 kHz</SelectItem>
                  </SelectContent>
                </Select>
                <Button type="button" size="sm" variant="outline" onClick={exportSelectionWav} disabled={!!exportState?.active}>
                  {exportState?.active ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                  Download ({(selection.endSec - selection.startSec).toFixed(2)}s)
                </Button>
                {exportState?.active && (
                  <div className="w-full flex items-center gap-2 mt-1">
                    <Progress value={Math.round(exportState.pct * 100)} className="h-1.5 flex-1 bg-secondary" />
                    <span className="text-[10px] tabular-nums text-muted-foreground min-w-[55px] text-right">
                      {Math.round(exportState.pct * 100)}%
                    </span>
                    <span className="text-[10px] tabular-nums text-muted-foreground">
                      ETA {(exportState.etaMs / 1000).toFixed(1)}s
                    </span>
                    <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={cancelExport}>
                      <X className="w-3 h-3 mr-1" /> Cancel
                    </Button>
                  </div>
                )}
              </div>
            )}

            {!result && !analyzing && !error && (
              <Button
                onClick={runAnalysis}
                className="w-full mt-4 bg-gradient-gold text-primary-foreground hover:opacity-90"
              >
                <Sparkles className="w-4 h-4 mr-2" /> Analyze this track
              </Button>
            )}

            {analyzing && (
              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span className="text-muted-foreground">{progressLabel}</span>
                  <span className="ml-auto tabular-nums text-xs text-muted-foreground">{progress}%</span>
                </div>
                <Progress value={progress} className="h-2 bg-secondary" />
                {statusLog.length > 0 && (
                  <ul className="text-[10px] text-muted-foreground/80 mt-2 space-y-0.5 max-h-20 overflow-y-auto">
                    {statusLog.map((s, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="tabular-nums opacity-60 w-7">{s.pct}%</span>
                        <span>{s.label}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {error && !analyzing && (
              <Alert variant="destructive" className="mt-4">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Analysis failed</AlertTitle>
                <AlertDescription>
                  <p className="mb-2">{error}</p>
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" variant="outline" onClick={() => { setError(null); runAnalysis(); }}>
                      <RefreshCcw className="w-3.5 h-3.5 mr-1.5" /> Retry
                    </Button>
                    {selection && (
                      <Button size="sm" variant="outline" onClick={() => { setSelection(null); setError(null); runAnalysis(); }}>
                        <X className="w-3.5 h-3.5 mr-1.5" /> Clear selection & retry full track
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={reset}>Choose a different file</Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {result && (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  onClick={() => setAskSensei(true)}
                  className="bg-gradient-gold text-primary-foreground hover:opacity-90"
                  disabled={askSensei}
                >
                  <MessageCircle className="w-4 h-4 mr-2" /> Ask Sensei About This Mix
                </Button>
                <Button variant="outline" onClick={runAnalysis}>
                  {selection ? <Scissors className="w-4 h-4 mr-2" /> : <RefreshCcw className="w-4 h-4 mr-2" />}
                  {selection ? `Analyze selection (${(selection.endSec - selection.startSec).toFixed(1)}s)` : "Re-analyze full track"}
                </Button>
                {selection && (
                  <Button variant="ghost" onClick={() => setSelection(null)}>
                    <X className="w-4 h-4 mr-2" /> Clear selection
                  </Button>
                )}
                {diagnostics && (
                  <Button variant="outline" onClick={downloadDiagnostics} title="Download analysis diagnostics (timings, fallback path, confidence values) as JSON">
                    <FileJson className="w-4 h-4 mr-2" /> Download diagnostics
                  </Button>
                )}
                {diagnostics && (
                  <Button variant="outline" onClick={copyDiagnostics} title="Copy diagnostics JSON to clipboard for easy sharing">
                    <Clipboard className="w-4 h-4 mr-2" /> Copy diagnostics
                  </Button>
                )}
              </div>
            )}
          </Card>

          {result && (
            <AudioReportCard
              result={result}
              getWaveformSnapshot={getWaveformSnapshot}
              analyzedRange={analyzedRange}
            />
          )}

          {result && <ReferenceCompareCard metrics={result.metrics} />}

          {result && showWhatNext && (
            <Card className="studio-card-gold p-4 mt-6" data-report-id={firstBounceId ?? undefined}>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                First bounce analyzed
              </div>
              <div className="font-display text-base font-bold text-foreground">
                Sensei has heard your beat — what now?
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {result.metrics.fileName} is now your active track. Pick the chapter you want to work in —
                Sensei follows you there.
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                <Button asChild size="sm" className="bg-gradient-gold text-primary-foreground hover:opacity-90">
                  <Link to="/production"><Music className="w-4 h-4 mr-2" /> Continue in Production</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link to="/mixing"><Sliders className="w-4 h-4 mr-2" /> Go to Mixing</Link>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    stashChatPrompt(buildUploadAdvisePrompt(result.metrics.fileName, result, null));
                    navigate("/chat");
                  }}
                >
                  <MessageCircle className="w-4 h-4 mr-2" /> Ask Sensei
                </Button>
              </div>
            </Card>
          )}

          {result && lastReportId && !showWhatNext && (
            <Card className="studio-card-gold p-4 mt-6 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Track session ready
                </div>
                <div className="font-semibold text-sm text-foreground">
                  Sensei is now coaching about {result.metrics.fileName}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Every page (Chat, Mixing, Mastering, Quick Fix, Problems, Genre) will use this analysis until you change or clear it.
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => navigate("/chat")}
                  className="bg-gradient-gold text-primary-foreground hover:opacity-90"
                >
                  <MessageCircle className="w-4 h-4 mr-2" /> Start coaching this track
                </Button>
              </div>
            </Card>
          )}

          {continuityHold && (
            <Card className="studio-card p-4 mt-6 border-destructive/40">
              <div className="flex items-start gap-3">
                <div className="text-2xl leading-none">🥋</div>
                <div className="min-w-0 flex-1">
                  <div className="font-display text-base font-bold text-foreground">
                    Sensei paused — beat DNA doesn't match
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    This upload's song identity differs from your project{continuityHold.prevFileName ? ` (last confirmed: "${continuityHold.prevFileName}")` : ""}:
                  </p>
                  <ul className="mt-2 space-y-0.5">
                    {continuityHold.reasons.map((r) => (
                      <li key={r} className="text-xs text-foreground">• {r}</li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground mt-2">
                    Coaching stays paused and this beat is kept out of your project's scores — one project, one song.
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <Button size="sm" onClick={confirmSameBeat} className="bg-gradient-gold text-primary-foreground hover:opacity-90">
                      ✅ It IS the same beat — continue
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setContinuityHold(null); reset(); }}>
                      ↩️ Load the correct bounce
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => navigate("/projects")}>
                      🆕 It's a new beat → new project
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {result && askSensei && (
            <Card className="studio-card overflow-hidden h-[60vh] flex flex-col mt-6">
              <SenseiChat key={`upload-${activeProject?.id ?? "none"}`} initialPrompt={senseiPrompt} audioContext={senseiAudioContext} />
            </Card>
          )}
        </>
      )}

      {showShortcuts && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Keyboard shortcuts"
          onClick={() => setShowShortcuts(false)}
        >
          <Card
            className="studio-card w-full max-w-md p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-base font-bold">Keyboard shortcuts</h3>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowShortcuts(false)} aria-label="Close">
                <X className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground mb-3">
              Shortcuts (except <kbd className="px-1 rounded border bg-secondary/40">?</kbd>) only fire when the waveform area is focused.
            </p>
            <dl className="text-xs space-y-1.5">
              {[
                ["Space", "Play / pause"],
                ["+ / −", "Zoom in / out"],
                ["Shift + 0", "Reset zoom"],
                ["← / →", "Nudge BPM ±0.1 (Shift = ±1)"],
                ["[ / ]", "Nudge downbeat ±10 ms (Shift = ±100 ms)"],
                ["?", "Toggle this help panel"],
              ].map(([key, desc]) => (
                <div key={key} className="flex items-center justify-between gap-3">
                  <kbd className="px-1.5 py-0.5 rounded border bg-secondary/40 text-[10px] tabular-nums">{key}</kbd>
                  <dd className="text-muted-foreground flex-1 text-right">{desc}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 pt-3 border-t border-border text-[11px] text-muted-foreground">
              Tip: use <span className="text-foreground">Copy diagnostics</span> after an analysis to share runtime details, or <span className="text-foreground">Revert to saved region</span> to restore the last analyzed selection for this file.
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
