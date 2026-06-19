import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  UploadCloud, FileAudio, X, Sparkles, Loader2, MessageCircle, RefreshCcw, AlertTriangle,
  Scissors, Minus, Plus, Target, FileJson,
} from "lucide-react";
import { SenseiChat } from "@/components/SenseiChat";
import { AudioReportCard } from "@/components/AudioReportCard";
import { WaveformPlayer, type WaveformSelection } from "@/components/WaveformPlayer";
import {
  analyzeAudioFileInWorker,
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

export default function UploadPage() {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
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
  const inputRef = useRef<HTMLInputElement>(null);
  const waveformCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const audioUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);

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
    const { error: insertErr } = await supabase.from("audio_analysis_reports").insert({
      user_id: user.id,
      file_name: res.metrics.fileName,
      file_format: res.metrics.fileFormat,
      file_size_bytes: res.metrics.fileSizeBytes,
      duration_sec: res.metrics.durationSec,
      sample_rate: res.metrics.sampleRate,
      bit_rate: res.metrics.bitRate,
      channels: res.metrics.channels,
      peak_db: res.metrics.peakDb,
      rms_db: res.metrics.rmsDb,
      lufs_estimate: res.metrics.lufsEstimate,
      dynamic_range_db: res.metrics.dynamicRangeDb,
      stereo_width: res.metrics.stereoWidth,
      bpm: res.metrics.bpm,
      detected_key: res.metrics.detectedKey,
      band_low_db: res.metrics.bands.low,
      band_lowmid_db: res.metrics.bands.lowMid,
      band_mid_db: res.metrics.bands.mid,
      band_highmid_db: res.metrics.bands.highMid,
      band_high_db: res.metrics.bands.high,
      detected_issues: res.issues as unknown as any,
      recommendations: res.recommendations as unknown as any,
    });
    if (insertErr) console.warn("Failed to save analysis report:", insertErr.message);
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
      // Reset visual BPM tweaks when a fresh detection lands.
      setBpmNudge(0);
      setDownbeatOffsetSec(0);
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

  const effectiveBpm = result?.metrics.bpm != null ? Math.max(20, result.metrics.bpm + bpmNudge) : null;

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

  return (
    <div className="container max-w-4xl py-8 px-4 md:px-8">
      <PageHeader
        eyebrow="Audio Analysis"
        title="Upload & Analyze Your Track"
        description="Drop a WAV or MP3 and Sensei will measure loudness, dynamics, key, BPM, stereo width and frequency balance — then diagnose what to fix. Drag on the waveform to analyze a specific section."
        icon={<UploadCloud className="w-6 h-6" />}
      />

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
              <WaveformPlayer
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
              </div>
            )}
          </Card>

          {result && <AudioReportCard result={result} getWaveformSnapshot={getWaveformSnapshot} />}

          {result && askSensei && (
            <Card className="studio-card overflow-hidden h-[60vh] flex flex-col mt-6">
              <SenseiChat initialPrompt={senseiPrompt} audioContext={senseiAudioContext} />
            </Card>
          )}
        </>
      )}
    </div>
  );
}
