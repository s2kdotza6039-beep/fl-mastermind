import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Activity, AlertTriangle, AudioLines, Download, Gauge, Headphones, KeyRound, Music2, ShieldCheck, Volume2, Waves,
} from "lucide-react";
import type { AudioAnalysisResult, AudioIssue, ConfidenceScore } from "@/lib/audio-analysis";
import { toast } from "sonner";

function severityVariant(s: AudioIssue["severity"]) {
  if (s === "critical") return "destructive" as const;
  if (s === "warn") return "default" as const;
  return "secondary" as const;
}

function ConfidenceBadge({ c }: { c: ConfidenceScore }) {
  const variant =
    c.label === "high" ? "default" :
    c.label === "medium" ? "secondary" :
    c.label === "low" ? "outline" :
    "destructive";
  return (
    <Badge variant={variant as any} className="text-[9px] uppercase ml-1" title={c.note}>
      {c.label} · {Math.round(c.value * 100)}%
    </Badge>
  );
}

function Stat({
  icon: Icon, label, value, sub, confidence,
}: { icon: any; label: string; value: string; sub?: string; confidence?: ConfidenceScore }) {
  return (
    <div className="rounded-lg border border-border bg-card/60 p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
        <Icon className="w-3.5 h-3.5 text-primary/70" />
      </div>
      <div className="text-base font-semibold tabular-nums truncate flex items-center">
        {value}
        {confidence && <ConfidenceBadge c={confidence} />}
      </div>
      {sub && <div className="text-[10px] text-muted-foreground/70 mt-0.5">{sub}</div>}
      {confidence?.note && (
        <div className="text-[10px] text-muted-foreground/80 mt-1 leading-snug">{confidence.note}</div>
      )}
    </div>
  );
}

function BandBar({ label, db }: { label: string; db: number }) {
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

async function exportReportPdf(result: AudioAnalysisResult) {
  try {
    const { jsPDF } = await import("jspdf");
    const { metrics: m, issues } = result;
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 48;
    let y = margin;

    const ensureRoom = (h: number) => {
      if (y + h > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
    };

    const writeLine = (text: string, size = 10, opts: { bold?: boolean; color?: [number, number, number] } = {}) => {
      doc.setFont("helvetica", opts.bold ? "bold" : "normal");
      doc.setFontSize(size);
      if (opts.color) doc.setTextColor(...opts.color);
      else doc.setTextColor(20, 20, 20);
      const wrapped = doc.splitTextToSize(text, pageWidth - margin * 2);
      for (const ln of wrapped) {
        ensureRoom(size + 4);
        doc.text(ln, margin, y);
        y += size + 4;
      }
    };

    const hr = () => {
      ensureRoom(12);
      doc.setDrawColor(200, 200, 200);
      doc.line(margin, y, pageWidth - margin, y);
      y += 12;
    };

    writeLine("Studio Sensei — Audio Analysis Report", 18, { bold: true });
    writeLine(new Date().toLocaleString(), 9, { color: [110, 110, 110] });
    y += 6;
    hr();

    writeLine("File", 12, { bold: true });
    writeLine(`${m.fileName}`);
    writeLine(`${m.fileFormat.toUpperCase()} · ${(m.fileSizeBytes / 1024 / 1024).toFixed(2)} MB · ${m.sampleRate} Hz · ${m.channels} ch · ≈${m.bitRate} kbps`);
    writeLine(`Duration: ${Math.floor(m.durationSec / 60)}:${String(Math.floor(m.durationSec % 60)).padStart(2, "0")}`);
    y += 6;
    hr();

    writeLine("Levels & Loudness", 12, { bold: true });
    writeLine(`Peak: ${m.peakDb.toFixed(1)} dBFS    RMS: ${m.rmsDb.toFixed(1)} dBFS    LUFS≈ ${m.lufsEstimate.toFixed(1)}`);
    writeLine(`Dynamic range: ${m.dynamicRangeDb.toFixed(1)} dB    Stereo width: ${m.stereoWidth.toFixed(2)} (${m.stereoWidthLabel})`);
    y += 6;
    hr();

    writeLine("Tempo & Key (with confidence)", 12, { bold: true });
    writeLine(`BPM: ${m.bpm ?? "—"}    Confidence: ${m.bpmConfidence.label} (${Math.round(m.bpmConfidence.value * 100)}%)`);
    if (m.bpmConfidence.note) writeLine(`  ↳ ${m.bpmConfidence.note}`, 9, { color: [110, 110, 110] });
    writeLine(`Key: ${m.detectedKey ?? "—"}    Confidence: ${m.keyConfidence.label} (${Math.round(m.keyConfidence.value * 100)}%)`);
    if (m.keyConfidence.note) writeLine(`  ↳ ${m.keyConfidence.note}`, 9, { color: [110, 110, 110] });
    y += 6;
    hr();

    writeLine("Frequency Balance (dB relative to total)", 12, { bold: true });
    writeLine(`Low (20–120 Hz):       ${m.bands.low.toFixed(1)}`);
    writeLine(`Low-Mid (120–500 Hz):  ${m.bands.lowMid.toFixed(1)}`);
    writeLine(`Mid (500 Hz–2 kHz):    ${m.bands.mid.toFixed(1)}`);
    writeLine(`High-Mid (2–6 kHz):    ${m.bands.highMid.toFixed(1)}`);
    writeLine(`High (6 kHz+):         ${m.bands.high.toFixed(1)}`);
    y += 6;
    hr();

    writeLine(`Problems Found (${issues.length})`, 12, { bold: true });
    for (const i of issues) {
      ensureRoom(40);
      writeLine(`[${i.severity.toUpperCase()}] ${i.title}`, 11, { bold: true });
      writeLine(i.detail);
      writeLine(`→ ${i.recommendation}`, 10, { color: [80, 80, 80] });
      y += 4;
    }

    y += 8;
    hr();
    writeLine("Generated by Studio Sensei · Audio Analysis Engine", 8, { color: [140, 140, 140] });

    const safeName = m.fileName.replace(/\.[a-z0-9]+$/i, "").replace(/[^a-z0-9_-]+/gi, "_");
    doc.save(`audio-report-${safeName || "track"}.pdf`);
    toast.success("PDF report downloaded");
  } catch (err) {
    console.error(err);
    toast.error("Could not export PDF");
  }
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
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">
              {m.fileFormat.toUpperCase()} · {m.sampleRate} Hz · {m.isStereo ? "stereo" : "mono"}
            </Badge>
            <Button size="sm" variant="outline" onClick={() => exportReportPdf(result)}>
              <Download className="w-3.5 h-3.5 mr-1.5" /> Export PDF
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Stat icon={Activity} label="Duration" value={durStr} />
          <Stat
            icon={KeyRound}
            label="Key"
            value={m.detectedKey ?? "—"}
            confidence={m.keyConfidence}
          />
          <Stat
            icon={Music2}
            label="BPM"
            value={m.bpm != null ? String(m.bpm) : "—"}
            confidence={m.bpmConfidence}
          />
          <Stat icon={Gauge} label="Peak" value={`${m.peakDb.toFixed(1)} dB`} />
          <Stat icon={Volume2} label="RMS" value={`${m.rmsDb.toFixed(1)} dB`} />
          <Stat icon={Volume2} label="LUFS≈" value={`${m.lufsEstimate.toFixed(1)}`} sub="integrated estimate" />
          <Stat icon={Waves} label="Dynamic Range" value={`${m.dynamicRangeDb.toFixed(1)} dB`} />
          <Stat icon={Headphones} label="Stereo Width" value={m.stereoWidthLabel} sub={`ratio ${m.stereoWidth.toFixed(2)}`} />
        </div>
        <div className="mt-3 flex items-start gap-2 text-[11px] text-muted-foreground">
          <ShieldCheck className="w-3.5 h-3.5 mt-0.5 text-primary/70 shrink-0" />
          <span>
            BPM and Key include a confidence score. Drum-heavy or atonal tracks tend to score{" "}
            <span className="font-medium">low</span> or <span className="font-medium">unreliable</span> — verify
            manually before committing to a key/tempo decision.
          </span>
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
