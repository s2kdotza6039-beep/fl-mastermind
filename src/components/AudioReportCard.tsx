import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Activity, AlertTriangle, AudioLines, Gauge, Headphones, KeyRound, Music2, Volume2, Waves,
} from "lucide-react";
import type { AudioAnalysisResult, AudioIssue } from "@/lib/audio-analysis";

function severityVariant(s: AudioIssue["severity"]) {
  if (s === "critical") return "destructive" as const;
  if (s === "warn") return "default" as const;
  return "secondary" as const;
}

function Stat({
  icon: Icon, label, value, sub,
}: { icon: any; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card/60 p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
        <Icon className="w-3.5 h-3.5 text-primary/70" />
      </div>
      <div className="text-base font-semibold tabular-nums truncate">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground/70 mt-0.5">{sub}</div>}
    </div>
  );
}

function BandBar({ label, db }: { label: string; db: number }) {
  // map -30..0 -> 0..100
  const pct = Math.max(0, Math.min(100, ((db + 30) / 30) * 100));
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
        <span>{label}</span>
        <span className="tabular-nums">{db.toFixed(1)} dB</span>
      </div>
      <Progress value={pct} className="h-1.5 bg-secondary" />
    </div>
  );
}

export function AudioReportCard({ result }: { result: AudioAnalysisResult }) {
  const { metrics: m, issues } = result;
  const durStr = `${Math.floor(m.durationSec / 60)}:${String(Math.floor(m.durationSec % 60)).padStart(2, "0")}`;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <Card className="studio-card-gold p-5">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <div className="flex items-center gap-2">
            <AudioLines className="w-5 h-5 text-primary" />
            <h3 className="font-display text-lg font-bold">Audio Analysis Report</h3>
          </div>
          <Badge variant="outline" className="text-[10px]">
            {m.fileFormat.toUpperCase()} · {m.sampleRate} Hz · {m.isStereo ? "stereo" : "mono"}
          </Badge>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Stat icon={Activity} label="Duration" value={durStr} />
          <Stat icon={KeyRound} label="Key" value={m.detectedKey ?? "—"} />
          <Stat icon={Music2} label="BPM" value={m.bpm != null ? String(m.bpm) : "—"} />
          <Stat icon={Gauge} label="Peak" value={`${m.peakDb.toFixed(1)} dB`} />
          <Stat icon={Volume2} label="RMS" value={`${m.rmsDb.toFixed(1)} dB`} />
          <Stat icon={Volume2} label="LUFS≈" value={`${m.lufsEstimate.toFixed(1)}`} sub="integrated estimate" />
          <Stat icon={Waves} label="Dynamic Range" value={`${m.dynamicRangeDb.toFixed(1)} dB`} />
          <Stat icon={Headphones} label="Stereo Width" value={m.stereoWidthLabel} sub={`ratio ${m.stereoWidth.toFixed(2)}`} />
        </div>
      </Card>

      {/* Frequency bands */}
      <Card className="studio-card p-5">
        <div className="flex items-center gap-2 mb-3">
          <Waves className="w-4 h-4 text-primary" />
          <h4 className="font-semibold">Frequency Distribution</h4>
          <span className="text-[10px] text-muted-foreground">(dB relative to total spectral energy)</span>
        </div>
        <div className="space-y-2.5">
          <BandBar label="Low · 20–120 Hz" db={m.bands.low} />
          <BandBar label="Low-Mid · 120–500 Hz" db={m.bands.lowMid} />
          <BandBar label="Mid · 500 Hz–2 kHz" db={m.bands.mid} />
          <BandBar label="High-Mid · 2–6 kHz" db={m.bands.highMid} />
          <BandBar label="High · 6 kHz+" db={m.bands.high} />
        </div>
      </Card>

      {/* Problems */}
      <Card className="studio-card p-5">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-4 h-4 text-primary" />
          <h4 className="font-semibold">Problems Found</h4>
          <Badge variant="outline" className="text-[10px]">{issues.length}</Badge>
        </div>
        <ul className="space-y-2">
          {issues.map((i) => (
            <li key={i.id} className="rounded-md border border-border p-3">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Badge variant={severityVariant(i.severity)} className="text-[10px] uppercase">{i.severity}</Badge>
                  <span className="font-medium text-sm">{i.title}</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{i.detail}</p>
              <p className="text-xs text-primary/90 mt-1">→ {i.recommendation}</p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
