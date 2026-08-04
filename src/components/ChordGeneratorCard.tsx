import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dices, Copy, Check } from "lucide-react";
import {
  KEYS, DIRECTIONS, generateProgressions, parseKeyMode,
  type Mode,
} from "@/lib/chords";

interface Props {
  genre?: string | null;
  detectedKey?: string | null;
}

export const ChordGeneratorCard = ({ genre, detectedKey }: Props) => {
  const parsed = useMemo(() => parseKeyMode(detectedKey), [detectedKey]);
  const [key, setKey] = useState<string>(parsed?.key ?? "A");
  const [mode, setMode] = useState<Mode>(parsed?.mode ?? "minor");
  const [direction, setDirection] = useState<string>("soulful");
  const [seed, setSeed] = useState(0);
  const [copied, setCopied] = useState<number | null>(null);

  // When the latest analysis arrives (async), preselect its key/mode once.
  useEffect(() => {
    if (parsed) { setKey(parsed.key); setMode(parsed.mode); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detectedKey]);

  const results = useMemo(
    () => generateProgressions(key, mode, { genre, direction: direction as never, seed, count: 4 }),
    [key, mode, genre, direction, seed],
  );

  const copyNotes = async (i: number, notes: string[][]) => {
    try {
      await navigator.clipboard.writeText(notes.map((c) => c.join(" ")).join("  |  "));
      setCopied(i);
      setTimeout(() => setCopied((c) => (c === i ? null : c)), 1500);
    } catch { /* clipboard unavailable — ignore */ }
  };

  return (
    <Card className="studio-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">🎹 Chord Progression Generator</h3>
        <Button size="sm" variant="outline" onClick={() => setSeed((s) => s + 1)} title="New voicings, same vibe">
          <Dices className="w-3.5 h-3.5 mr-1" /> More
        </Button>
      </div>

      <p className="text-xs text-muted-foreground mt-2">
        Endless progressions in your song's key and direction — zero guesswork. Type the notes
        exactly into FL's Piano roll (right-click channel → Piano roll), or use the Stamp tool (Alt+S).
        {parsed && <span> Key read from your last bounce: <span className="text-primary">{detectedKey}</span>.</span>}
      </p>

      <div className="flex flex-wrap items-center gap-2 mt-4">
        <select value={key} onChange={(e) => setKey(e.target.value)} aria-label="Key"
          className="h-9 rounded-md border border-border bg-background px-2 text-sm">
          {KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <select value={mode} onChange={(e) => setMode(e.target.value as Mode)} aria-label="Mode"
          className="h-9 rounded-md border border-border bg-background px-2 text-sm">
          <option value="minor">Minor</option>
          <option value="major">Major</option>
        </select>
        <div className="flex flex-wrap gap-1.5">
          {DIRECTIONS.map((d) => (
            <button key={d} type="button" onClick={() => setDirection(d)}
              className={`h-9 px-3 rounded-md border text-[11px] font-medium ${direction === d ? "border-primary text-primary" : "border-border text-muted-foreground hover:text-primary"}`}>
              {d}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {results.map((r, i) => (
          <div key={`${r.label}-${i}`} className="rounded-lg border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-medium">
                {r.label}
                {r.matchedGenre && <span className="text-primary text-[10px]"> · fits your genre</span>}
              </div>
              <button type="button" onClick={() => copyNotes(i, r.notes)}
                className="text-muted-foreground hover:text-primary" title="Copy Piano-roll notes">
                {copied === i ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>

            <div className="text-[11px] text-muted-foreground mt-1">
              {r.romans.join(" – ")}
            </div>

            <div className="flex flex-wrap gap-1.5 mt-2">
              {r.chords.map((c, ci) => (
                <span key={ci} className="px-2 py-0.5 rounded bg-muted text-xs font-semibold">{c}</span>
              ))}
            </div>

            <div className="mt-2 space-y-0.5">
              {r.notes.map((n, ci) => (
                <div key={ci} className="text-[10px] text-muted-foreground/80 font-mono">
                  {r.chords[ci]}: {n.join(" ")}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};
