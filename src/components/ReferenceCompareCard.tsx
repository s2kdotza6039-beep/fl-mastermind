import { useRef, useState } from "react";
import { GitCompareArrows, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { analyzeAudioFileInWorker } from "@/lib/audio-analysis";
import type { AudioMetrics } from "@/lib/audio-analysis";
import { compareMetrics, compareSummary, type CompareRow } from "@/lib/reference-compare";
import { cn } from "@/lib/utils";

export const ReferenceCompareCard = ({ metrics }: { metrics: AudioMetrics }) => {
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<CompareRow[] | null>(null);
  const [refName, setRefName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const { result } = await analyzeAudioFileInWorker(file);
      setRows(compareMetrics(metrics, result.metrics));
      setRefName(file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not analyze the reference file.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-4 mt-6 space-y-3">
      <div className="flex items-center gap-2">
        <GitCompareArrows className="w-4 h-4 text-primary" />
        <h3 className="font-semibold text-sm text-foreground">Reference comparison</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Drop a professional track in your genre. Sensei measures it and shows your gap — nothing is
        uploaded or saved.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0])}
      />
      <Button variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
        {rows ? "Compare another reference" : "Load reference track"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {rows && (
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            vs {refName}
          </div>
          <p className="text-sm text-foreground">{compareSummary(rows)}</p>
          <div className="divide-y divide-border rounded-md border border-border">
            {rows.map((r) => (
              <div key={r.key} className="grid grid-cols-3 gap-2 px-3 py-2 text-xs items-center">
                <span className="text-muted-foreground">{r.label}</span>
                <span className="text-foreground">
                  {typeof r.mine === "number" ? r.mine.toFixed(1) : r.mine} /{" "}
                  {typeof r.reference === "number" ? r.reference.toFixed(1) : r.reference}
                </span>
                <span
                  className={cn(
                    "text-right font-medium",
                    r.verdict === "match" ? "text-muted-foreground" : "text-primary",
                  )}
                >
                  {r.delta === null
                    ? "—"
                    : r.verdict === "match"
                      ? "≈ match"
                      : `${r.delta > 0 ? "+" : ""}${r.delta.toFixed(1)} ${r.unit}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
};
