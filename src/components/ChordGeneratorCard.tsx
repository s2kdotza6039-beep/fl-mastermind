import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dices, Copy, Check, ChevronLeft, ChevronRight, Download, FileText, MessageCircle, Music, Eye } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  KEYS, DIRECTIONS, generateProgressions, parseKeyMode, applyInversion, slashBass,
  type Mode, type SlashOption,
} from "@/lib/chords";
import {
  chordsToMidiMulti, downloadBlob, progressionToFlInstructions, progressionToText, safeFileName,
} from "@/lib/midi";
import { stashChatPrompt, buildRewritePrompt, REWRITE_CONSTRAINTS } from "@/lib/knowledge-handoff";
import { MiniPianoRoll } from "@/components/MiniPianoRoll";

interface Props {
  genre?: string | null;
  detectedKey?: string | null;
  bpm?: number | null;
  projectName?: string | null;
}

interface Voicing { inv: number; slash: SlashOption }

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
  const [voicing, setVoicing] = useState<Record<string, Voicing>>({});
  const [previewFor, setPreviewFor] = useState<string | null>(null);
  const [constraints, setConstraints] = useState<string[]>([]);

  // When the latest analysis arrives (async), preselect its key/mode once.
  useEffect(() => {
    if (parsed) { setKey(parsed.key); setMode(parsed.mode); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detectedKey]);

  const results = useMemo(
    () => generateProgressions(key, mode, { genre, direction: direction as never, seed, count: 4 }),
    [key, mode, genre, direction, seed],
  );

  /** Forge pipeline (R9.5): inversion first, slash bass last. */
  const voicedNotes = (r: (typeof results)[number], i: number): string[][] => {
    const v = voicing[`${r.label}-${i}`] ?? { inv: 0, slash: "none" as SlashOption };
    return r.notes.map((n) => slashBass(applyInversion(n, v.inv), v.slash));
  };

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

  const asExport = (r: (typeof results)[number], notes: string[][]) => ({
    label: r.label, key, mode, romans: r.romans, chords: r.chords, notes,
    bpm: bpm ?? undefined,
  });

  const downloadTxt = (r: (typeof results)[number], notes: string[][]) => {
    downloadBlob(progressionToText(asExport(r, notes)), `${safeFileName(`${key}-${mode}-${r.label}`)}.txt`, "text/plain");
    toast.success("Piano-roll note names downloaded");
  };

  const downloadMidi = (r: (typeof results)[number], notes: string[][]) => {
    const bytes = chordsToMidiMulti(notes, { bpm: bpm ?? 120 });
    downloadBlob(bytes, `${safeFileName(`${key}-${mode}-${r.label}`)}.mid`, "audio/midi");
    toast.success("3-track MIDI downloaded (Chords / Bass / Pads) — drag it into FL");
  };

  const toggleConstraint = (id: string) =>
    setConstraints((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const askSensei = (r: (typeof results)[number], notes: string[][]) => {
    const base = [
      `Rewrite this chord progression to sit better with my vocals and drums.`,
      projectName ? `Project: ${projectName}.` : "",
      genre ? `Genre: ${genre}.` : "",
      `Key: ${key} ${mode}${bpm ? ` · ${bpm} BPM` : ""}. Direction: ${direction}.`,
      `Progression "${r.label}": ${r.chords.join(" | ")} (${r.romans.join(" – ")})`,
      `Piano-roll notes:`,
      ...notes.map((n, i) => `  ${r.chords[i]}: ${n.join(" ")}`),
      "",
      `Tell me: which chord fights the vocal or the low end, what to swap it for, the exact new notes to draw in the FL Piano roll, and how to voice it so the drums still breathe.`,
    ];
    stashChatPrompt(buildRewritePrompt(base, constraints));
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
        Endless progressions in your song's key and direction — zero guesswork. Cycle sets, voice
        them, preview the grid, then drop a 3-track MIDI straight into FL Studio.
      </p>

      {parsed ? (
        <div className="mt-3 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-xs">
          Sensei hears <span className="text-primary font-semibold">{detectedKey}</span>. Wrong? Change the
          key/mode below and Chord Forge follows.
        </div>
      ) : (
        <div className="mt-3 rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
          Key not confidently detected. Pick your key below — Chord Forge will lock to it.
        </div>
      )}

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

      <div className="mt-4 rounded-lg border border-dashed border-border p-3">
        <h4 className="text-xs font-semibold">Ask-Sensei constraints</h4>
        <p className="text-[11px] text-muted-foreground mt-1">
          These travel with "Ask Sensei to rewrite" so the answer respects your boundaries.
        </p>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {REWRITE_CONSTRAINTS.map((c) => (
            <button key={c.id} type="button" onClick={() => toggleConstraint(c.id)}
              className={`h-7 px-2.5 rounded-md border text-[11px] font-medium ${constraints.includes(c.id) ? "border-primary text-primary" : "border-border text-muted-foreground hover:text-primary"}`}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {results.map((r, i) => {
          const id = `${r.label}-${i}`;
          const v = voicing[id] ?? { inv: 0, slash: "none" as SlashOption };
          const notes = voicedNotes(r, i);
          const setV = (next: Partial<Voicing>) => setVoicing((prev) => ({ ...prev, [id]: { ...v, ...next } }));
          return (
            <div key={id} className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-medium">
                  {r.label}
                  {r.matchedGenre && <span className="text-primary text-[10px]"> · fits your genre</span>}
                </div>
                <button type="button" onClick={() => copyText(`copy-${id}`, notes.map((c) => c.join(" ")).join("  |  "), "Notes")}
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

              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <select value={v.inv} onChange={(e) => setV({ inv: Number(e.target.value) })} aria-label="Inversion"
                  className="h-7 rounded-md border border-border bg-background px-1.5 text-[11px]">
                  <option value={0}>Root position</option>
                  <option value={1}>1st inversion</option>
                  <option value={2}>2nd inversion</option>
                </select>
                <select value={v.slash} onChange={(e) => setV({ slash: e.target.value as SlashOption })} aria-label="Slash bass"
                  className="h-7 rounded-md border border-border bg-background px-1.5 text-[11px]">
                  <option value="none">No slash bass</option>
                  <option value="root-12">Sub root in bass</option>
                  <option value="fifth-12">Fifth in bass</option>
                </select>
                <button type="button" onClick={() => setPreviewFor((cur) => (cur === id ? null : id))}
                  className={`inline-flex items-center gap-1 h-7 px-2 rounded-md border text-[11px] font-medium ${previewFor === id ? "border-primary text-primary" : "border-border text-muted-foreground hover:text-primary"}`}>
                  <Eye className="w-3 h-3" /> Preview
                </button>
              </div>

              <div className="mt-2 space-y-0.5">
                {notes.map((n, ci) => (
                  <div key={ci} className="text-[10px] text-muted-foreground/80 font-mono">
                    {r.chords[ci]}: {n.join(" ")}
                  </div>
                ))}
              </div>

              {previewFor === id && <MiniPianoRoll chords={notes} />}

              <div className="flex flex-wrap gap-1.5 mt-3">
                <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => downloadTxt(r, notes)}>
                  <FileText className="w-3 h-3 mr-1" /> Note names
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => downloadMidi(r, notes)}>
                  <Download className="w-3 h-3 mr-1" /> MIDI · 3 tracks
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-[11px]"
                  onClick={() => copyText(`fl-${id}`, progressionToFlInstructions(asExport(r, notes), { pattern, channel }), "Insert steps")}>
                  <Music className="w-3 h-3 mr-1" />
                  {copied === `fl-${id}` ? "Copied" : "Insert steps"}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => askSensei(r, notes)}>
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
