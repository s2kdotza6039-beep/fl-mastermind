import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { UploadCloud, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { tierLabel, type ScoreBreakdown } from "@/lib/coaching-loop";

interface Props {
  score: number | null;
  breakdown: ScoreBreakdown | null;
  master_ready: boolean;
  target_score: number;
}

const METRIC_LABEL: Record<string, string> = {
  lufs_estimate: "LUFS",
  peak_db: "Peak dB",
  dynamic_range_db: "Dynamic range dB",
  band_low_db: "Low band",
  band_lowmid_db: "Low-mid band",
  band_mid_db: "Mid band",
  band_highmid_db: "High-mid band",
  band_high_db: "High band",
  stereo_width: "Stereo width",
};

export function MixScoreCard({ score, breakdown, master_ready, target_score }: Props) {
  if (score == null || !breakdown) {
    return (
      <Card className="studio-card p-6 mb-6 text-center">
        <p className="text-sm text-muted-foreground mb-3">Upload to get your first score.</p>
        <Button asChild size="sm" className="bg-gradient-gold text-primary-foreground hover:opacity-90">
          <Link to="/upload"><UploadCloud className="w-4 h-4 mr-2" /> Upload audio</Link>
        </Button>
      </Card>
    );
  }

  const tier = tierLabel(score, target_score);
  const delta = breakdown.delta;

  const deductions: { label: string; value: number }[] = [
    { label: "Loudness off target", value: breakdown.loudness },
    { label: "Peaks too hot", value: breakdown.peakHot },
    { label: "Peaks too cold", value: breakdown.peakCold },
    { label: "Dynamics squashed", value: breakdown.dynamics },
    { label: "Spectral balance", value: breakdown.bands },
    { label: "Stereo width", value: breakdown.stereo },
    { label: "Critical issues", value: breakdown.criticalIssues },
  ].filter((d) => d.value > 0);

  return (
    <Card className="studio-card-gold p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Mix Score</div>
          <div className="flex items-baseline gap-3">
            <div className="font-display text-5xl font-bold text-gold tabular-nums">{score}</div>
            <div className="text-sm font-semibold text-foreground">{tier}</div>
            {master_ready && <Badge className="bg-primary/20 text-primary border-primary/40">Master Ready</Badge>}
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          Target ≥ {target_score}
          <div className="text-[10px]">LUFS target {breakdown.target_lufs.toFixed(1)}</div>
        </div>
      </div>

      {deductions.length > 0 && (
        <div className="border-t border-border/60 pt-3">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Where you lost points</div>
          <ul className="space-y-1 text-xs">
            {deductions.map((d) => (
              <li key={d.label} className="flex justify-between">
                <span className="text-foreground/80">{d.label}</span>
                <span className="text-destructive tabular-nums">−{d.value.toFixed(1)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {delta && (
        <div className="border-t border-border/60 mt-3 pt-3">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
            Δ vs previous · {delta.improved} improved · {delta.regressed} regressed · {delta.unchanged} unchanged
          </div>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-1 text-xs">
            {delta.metrics.map((m) => {
              if (m.previous == null || m.current == null) return null;
              const Icon = m.verdict === "improved" ? TrendingUp : m.verdict === "regressed" ? TrendingDown : Minus;
              const color = m.verdict === "improved" ? "text-emerald-400" : m.verdict === "regressed" ? "text-destructive" : "text-muted-foreground";
              return (
                <li key={m.metric} className="flex items-center justify-between gap-2">
                  <span className="text-foreground/70">{METRIC_LABEL[m.metric] ?? m.metric}</span>
                  <span className={`flex items-center gap-1 tabular-nums ${color}`}>
                    {m.previous.toFixed(2)} → {m.current.toFixed(2)}
                    <Icon className="w-3 h-3" />
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}
