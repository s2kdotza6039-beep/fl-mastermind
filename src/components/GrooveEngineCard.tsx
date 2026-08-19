import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Download, MessageCircle, Wand2, Dices, RotateCcw, Ghost, Sparkles, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  GROOVES, grooveToMidi, lanesToText, matchGrooves, sortGroovesForGenre, type Groove,
} from "@/lib/grooves";
import { fillify, generateGrooveVariant, ghostify, humanize, surpriseGroove } from "@/lib/groove-generator";
import { downloadBlob, safeFileName } from "@/lib/midi";
import { stashChatPrompt } from "@/lib/knowledge-handoff";
import { GrooveGrid } from "@/components/GrooveGrid";


interface Props {
  genre?: string | null;
  bpm?: number | null;
  projectName?: string | null;
}

const SWINGS = [
  { value: 0.5, label: "Straight (50%)" },
  { value: 0.54, label: "Light swing (54%)" },
  { value: 0.58, label: "Heavy swing (58%)" },
];

const clampBpm = (n: number) => Math.max(60, Math.min(200, Math.round(n || 120)));

export const GrooveEngineCard = ({ genre, bpm, projectName }: Props) => {
  const navigate = useNavigate();
  const sorted = useMemo(() => sortGroovesForGenre(genre), [genre]);
  const matched = useMemo(() => new Set(matchGrooves(genre).map((g) => g.id)), [genre]);

  const [grooveId, setGrooveId] = useState(sorted[0]?.id ?? GROOVES[0].id);
  const base = GROOVES.find((g) => g.id === grooveId) ?? GROOVES[0];
  const [generated, setGenerated] = useState<Groove | null>(null);
  const groove = generated ?? base;
  const [bpmVal, setBpmVal] = useState(bpm ?? base.bpm);
  const [bars, setBars] = useState(4);
  const [swing, setSwing] = useState(0.5);
  const [seed, setSeed] = useState(1);

  const pickGroove = (id: string) => {
    setGrooveId(id);
    setGenerated(null);
    const g = GROOVES.find((x) => x.id === id);
    if (g && bpm == null) setBpmVal(g.bpm);
  };

  const nextSeed = () => {
    const s = seed + 1;
    setSeed(s);
    return s;
  };
  const apply = (g: Groove, msg: string) => {
    setGenerated(g);
    toast.success(msg);
  };


  const download = () => {
    const bytes = grooveToMidi(groove, { bars, bpm: clampBpm(bpmVal), swing });
    downloadBlob(bytes, `${safeFileName(`${groove.label}-${clampBpm(bpmVal)}bpm`)}.mid`, "audio/midi");
    toast.success("Groove MIDI downloaded — drums land on channel 10, bass melody on channel 1");
  };

  const copySteps = async () => {
    try {
      await navigator.clipboard.writeText(lanesToText(groove, bars));
      toast.success("FL step list copied");
    } catch {
      toast.error("Clipboard unavailable — select and copy manually.");
    }
  };

  const askSensei = () => {
    const base = [
      `Tweak this drum groove with me.`,
      projectName ? `Project: ${projectName}.` : "",
      genre ? `Genre: ${genre}.` : "",
      `Groove: ${groove.label} at ${clampBpm(bpmVal)} BPM, swing ${Math.round(swing * 100)}%, ${bars} bars.`,
      "",
      lanesToText(groove, Math.min(bars, 4)),
      "",
      `Tell me: 3 concrete variations to try (which steps to move/ghost/accent), how to humanize velocities in FL's Piano roll, and one processing tip per lane (exact stock plugins + settings).`,
    ];
    stashChatPrompt(base.filter(Boolean).join("\n"));
    navigate("/chat");
  };

  return (
    <Card className="studio-card space-y-4 p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">🥁 Groove Engine</h3>
        {matched.has(base.id) && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
            matches your genre
          </span>
        )}
        {generated && (
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-400">
            ✨ Generated — endless options
          </span>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Genre-true drum patterns: preview the grid, set BPM/bars/swing, then drop the MIDI
        straight into FL Studio (drums → channel 10, bass melody → channel 1).
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={grooveId}
          onChange={(e) => pickGroove(e.target.value)}
          aria-label="Groove"
          className="h-9 rounded-md border border-border bg-background px-2 text-sm"
        >
          {sorted.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}{matched.has(g.id) ? " · matches" : ""}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1">
          <Input
            type="number"
            value={bpmVal}
            aria-label="BPM"
            onChange={(e) => setBpmVal(clampBpm(Number(e.target.value)))}
            className="h-9 w-20 text-xs"
          />
          <span className="text-[11px] text-muted-foreground">BPM</span>
        </div>

        <select
          value={bars}
          onChange={(e) => setBars(Number(e.target.value))}
          aria-label="Bars"
          className="h-9 rounded-md border border-border bg-background px-2 text-xs"
        >
          <option value={4}>4 bars</option>
          <option value={8}>8 bars</option>
        </select>

        <select
          value={swing}
          onChange={(e) => setSwing(Number(e.target.value))}
          aria-label="Swing"
          className="h-9 rounded-md border border-border bg-background px-2 text-xs"
        >
          {SWINGS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      <GrooveGrid groove={groove} bars={bars} />

      <p className="text-xs text-muted-foreground">💡 {groove.note}</p>

      <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
        <p className="text-xs font-semibold text-amber-300">Groove Generator — More Options</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => apply(generateGrooveVariant(groove, nextSeed()), "New variation generated")}>
            <Wand2 className="mr-1 h-3.5 w-3.5" /> Generate Variation
          </Button>
          <Button size="sm" variant="outline" onClick={() => apply(surpriseGroove(base, nextSeed() * 7), "Surprise groove ready")}>
            <Dices className="mr-1 h-3.5 w-3.5" /> Surprise Me
          </Button>
          <Button size="sm" variant="outline" onClick={() => apply(humanize(groove, nextSeed()), "Velocities humanized")}>
            <Sparkles className="mr-1 h-3.5 w-3.5" /> Humanize
          </Button>
          <Button size="sm" variant="outline" onClick={() => apply(ghostify(groove, nextSeed()), "Ghost notes added")}>
            <Ghost className="mr-1 h-3.5 w-3.5" /> Ghost Notes
          </Button>
          <Button size="sm" variant="outline" onClick={() => apply(fillify(groove, nextSeed()), "Fill written into the last quarter")}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add Fill
          </Button>
          <Button size="sm" variant="ghost" disabled={!generated} onClick={() => { setGenerated(null); toast.info("Back to the original pattern"); }}>
            <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reset
          </Button>
        </div>
      </div>



      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={download}>
          <Download className="mr-1 h-3.5 w-3.5" /> MIDI
        </Button>
        <Button size="sm" variant="outline" onClick={copySteps}>
          <Copy className="mr-1 h-3.5 w-3.5" /> Copy FL steps
        </Button>
        <Button size="sm" variant="outline" onClick={askSensei}>
          <MessageCircle className="mr-1 h-3.5 w-3.5" /> Ask Sensei to tweak
        </Button>
      </div>
    </Card>
  );
};
