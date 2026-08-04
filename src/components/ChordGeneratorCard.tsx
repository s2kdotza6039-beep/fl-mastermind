import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dices, Copy, Check, ChevronLeft, ChevronRight, Download, FileText, MessageCircle, Music } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  KEYS, DIRECTIONS, generateProgressions, parseKeyMode,
  type Mode,
} from "@/lib/chords";
import {
  chordsToMidi, downloadBlob, progressionToFlInstructions, progressionToText, safeFileName,
} from "@/lib/midi";
import { stashChatPrompt } from "@/lib/knowledge-handoff";

interface Props {
  genre?: string | null;
  detectedKey?: string | null;
  bpm?: number | null;
  projectName?: string | null;
}

export const ChordGeneratorCard = ({ genre, detectedKey, bpm, projectName }: Props) => {
  const navigate = useNavigate();
  const parsed = useMemo(() => parseKeyMode(detectedKey), [detectedKey]);
  const [key, setKey] = useState<string>(parsed?.key ?? "A");
  const [mode, setMode] = useState<Mode>(parsed?.mode ?? "minor");
  const [direction, setDirection] = useState<string>("soulful");
  const [seed, setSeed] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);
  const [pattern, setPattern] = useState("Chords");
  const [channel, setChannel] = useState("FLEX — Keys");

  // When the latest analysis arrives (async), preselect its key/mode once.
  useEffect(() => {
    if (parsed) { setKey(parsed.key); setMode(parsed.mode); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detectedKey]);

  const results = useMemo(
    () => generateProgressions(key, mode, { genre, direction: direction as never, seed, count: 4 }),
    [key, mode, genre, direction, seed],
  );

  const flag = (id: string) => {
    setCopied(id);
    setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
  };

  const copyText = async (id: string, text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      flag(id);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Clipboard unavailable — select the notes and copy manually.");
    }
  };

  const asExport = (r: (typeof results)[number]) => ({
    label: r.label, key, mode, romans: r.romans, chords: r.chords, notes: r.notes,
    bpm: bpm ?? undefined,
  });

  const downloadTxt = (r: (typeof results)[number]) => {
    downloadBlob(progressionToText(asExport(r)), `${safeFileName(`${key}-${mode}-${r.label}`)}.txt`, "text/plain");
    toast.success("Piano-roll note names downloaded");
  };

  const downloadMidi = (r: (typeof results)[number]) => {
    const bytes = chordsToMidi(r.notes, { bpm: bpm ?? 120 });
    downloadBlob(bytes, `${safeFileName(`${key}-${mode}-${r.label}`)}.mid`, "audio/midi");
    toast.success("MIDI downloaded — drag it onto an FL channel");
  };

  const askSensei = (r: (typeof results)[number]) => {
    stashChatPrompt(
      [
        `Rewrite this chord progression to sit better with my vocals and drums.`,
        projectName ? `Project: ${projectName}.` : "",
        genre ? `Genre: ${genre}.` : "",
        `Key: ${key} ${mode}${bpm ? ` · ${bpm} BPM` : ""}. Direction: ${direction}.`,
        `Progression "${r.label}": ${r.chords.join(" | ")} (${r.romans.join(" – ")})`,
        `Piano-roll notes:`,
        ...r.notes.map((n, i) => `  ${r.chords[i]}: ${n.join(" ")}`),
        "",
        `Tell me: which chord fights the vocal or the low end, what to swap it for, the exact new notes to draw in the FL Piano roll, and how to voice it so the drums still breathe.`,
      ].filter(Boolean).join("\n"),
    );
    navigate("/chat");
  };

  return (
    <Card className="studio-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">🎹 Chord Progression Generator</h3>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={() => setSeed((s) => s - 1)} title="Previous set">
            <ChevronLeft className="w-3.5 h-3.5" />
          </Button>
          <span className="text-[11px] text-muted-foreground w-14 text-center" aria-live="polite">
            Set {seed + 1}
          </span>
          <Button size="sm" variant="outline" onClick={() => setSeed((s) => s + 1)} title="Next set">
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => setSeed((s) => s + 7)} title="New voicings, same vibe">
            <Dices className="w-3.5 h-3.5 mr-1" /> Shuffle
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground mt-2">
        Endless progressions in your song's key and direction — zero guesswork. Cycle sets with
        the arrows, then export as Piano-roll note names or a MIDI file you can drag straight
        into FL Studio.
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

      <div className="mt-4 rounded-lg border border-dashed border-border p-3">
        <h4 className="text-xs font-semibold">Insert target</h4>
        <p className="text-[11px] text-muted-foreground mt-1">
          Name the pattern and channel you want this in — "Insert steps" then writes the exact
          click-path for your project.
        </p>
        <div className="flex flex-wrap gap-2 mt-2">
          <Input value={pattern} onChange={(e) => setPattern(e.target.value)} aria-label="Pattern name"
            placeholder="Pattern name" className="h-9 w-40 text-xs" />
          <Input value={channel} onChange={(e) => setChannel(e.target.value)} aria-label="Channel name"
            placeholder="Channel name" className="h-9 w-48 text-xs" />
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {results.map((r, i) => {
          const id = `${r.label}-${i}`;
          return (
            <div key={id} className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-medium">
                  {r.label}
                  {r.matchedGenre && <span className="text-primary text-[10px]"> · fits your genre</span>}
                </div>
                <button type="button" onClick={() => copyText(`copy-${id}`, r.notes.map((c) => c.join(" ")).join("  |  "), "Notes")}
                  className="text-muted-foreground hover:text-primary" title="Copy Piano-roll notes">
                  {copied === `copy-${id}` ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
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

              <div className="flex flex-wrap gap-1.5 mt-3">
                <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => downloadTxt(r)}>
                  <FileText className="w-3 h-3 mr-1" /> Note names
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => downloadMidi(r)}>
                  <Download className="w-3 h-3 mr-1" /> MIDI
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-[11px]"
                  onClick={() => copyText(`fl-${id}`, progressionToFlInstructions(asExport(r), { pattern, channel }), "Insert steps")}>
                  <Music className="w-3 h-3 mr-1" />
                  {copied === `fl-${id}` ? "Copied" : "Insert steps"}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => askSensei(r)}>
                  <MessageCircle className="w-3 h-3 mr-1" /> Ask Sensei to rewrite
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};
