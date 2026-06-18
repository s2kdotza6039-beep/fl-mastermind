import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { UploadCloud, FileAudio, X, Sparkles, Loader2, MessageCircle, RefreshCcw } from "lucide-react";
import { SenseiChat } from "@/components/SenseiChat";
import { AudioReportCard } from "@/components/AudioReportCard";
import { analyzeAudioFile, type AudioAnalysisResult, formatMetricsForPrompt } from "@/lib/audio-analysis";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export default function UploadPage() {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [result, setResult] = useState<AudioAnalysisResult | null>(null);
  const [askSensei, setAskSensei] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const audioUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);

  const reset = () => {
    setFile(null);
    setResult(null);
    setAskSensei(false);
    setProgress(0);
    setProgressLabel("");
  };

  const onFiles = (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    if (!f.type.startsWith("audio/") && !/\.(wav|mp3|aiff|flac|m4a|ogg)$/i.test(f.name)) {
      toast.error("Please upload a WAV or MP3 file");
      return;
    }
    if (f.size > 50 * 1024 * 1024) {
      toast.error("File too large (max 50MB)");
      return;
    }
    setFile(f);
    setResult(null);
    setAskSensei(false);
  };

  const runAnalysis = async () => {
    if (!file) return;
    setAnalyzing(true);
    setProgress(0);
    setProgressLabel("Starting…");
    try {
      const res = await analyzeAudioFile(file, (p, label) => {
        setProgress(p);
        setProgressLabel(label);
      });
      setResult(res);
      // Persist (best-effort)
      if (user) {
        const { error } = await supabase.from("audio_analysis_reports").insert({
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
          detected_issues: res.issues,
          recommendations: res.recommendations,
        });
        if (error) console.warn("Failed to save analysis report:", error.message);
      }
      toast.success("Analysis complete");
    } catch (e: any) {
      toast.error(e?.message || "Failed to analyze audio");
    } finally {
      setAnalyzing(false);
    }
  };

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

  return (
    <div className="container max-w-4xl py-8 px-4 md:px-8">
      <PageHeader
        eyebrow="Audio Analysis"
        title="Upload & Analyze Your Track"
        description="Drop a WAV or MP3 and Sensei will measure loudness, dynamics, key, BPM, stereo width and frequency balance — then diagnose what to fix."
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
          <p className="text-sm text-muted-foreground mb-4">WAV, MP3, AIFF, FLAC, M4A, OGG — up to 50MB</p>
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

            {audioUrl && <audio controls src={audioUrl} className="w-full mt-4" />}

            {!result && !analyzing && (
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
              </div>
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
                  <RefreshCcw className="w-4 h-4 mr-2" /> Re-analyze
                </Button>
              </div>
            )}
          </Card>

          {result && <AudioReportCard result={result} />}

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
