import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageCircle, Sparkles, Clock3, Waves } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { stashChatPrompt } from "@/lib/knowledge-handoff";

export const VocalTuningCard = ({ projectName, genre }: { projectName?: string | null; genre?: string | null }) => {
  const navigate = useNavigate();
  const ask = (prompt: string) => {
    stashChatPrompt(prompt, "PRODUCTION:VOCALS");
    navigate("/chat?scope=PRODUCTION%3AVOCALS");
  };

  const base = [
    projectName ? `Project: ${projectName}.` : "",
    genre ? `Genre: ${genre}.` : "",
  ].filter(Boolean).join(" ");

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="studio-card p-4">
        <h4 className="text-xs font-semibold flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-primary" /> NewTone — Pitch</h4>
        <ol className="mt-2 space-y-1 text-[11px] text-muted-foreground list-decimal list-inside">
          <li>Double-click vocal clip → open in NewTone</li>
          <li>Click <em>Detect pitch</em> → see orange notes</li>
          <li>Drag off notes gently to centre — keep vibrato!</li>
          <li>Right-click → <em>Send to playlist</em> as new take</li>
          <li>A/B original vs tuned — if you hear it, back off 30%</li>
        </ol>
        <p className="mt-2 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">Human first: tune only the 10% that hurts. Perfect = robotic.</p>
        <Button size="sm" variant="outline" className="mt-3 h-7 text-[11px] w-full" onClick={() => ask(`${base} VOCALS Tuning — walk me through NewTone on my lead: which notes to move, how much, and how to keep it natural. Exact clicks please.`)}><MessageCircle className="w-3 h-3 mr-1" /> Coach NewTone</Button>
      </Card>

      <Card className="studio-card p-4">
        <h4 className="text-xs font-semibold flex items-center gap-1.5"><Clock3 className="w-3.5 h-3.5 text-primary" /> NewTime — Groove</h4>
        <ol className="mt-2 space-y-1 text-[11px] text-muted-foreground list-decimal list-inside">
          <li>Open vocal in NewTime (or Edison → NewTime)</li>
          <li>Set project BPM, enable <em>Time warp</em></li>
          <li>Nudge late/early words to the grid — don’t quantize 100%</li>
          <li>Use <em>Groove</em> knob 10–20% to keep swing</li>
          <li>Bounce and re-import to Playlist lane</li>
        </ol>
        <p className="mt-2 text-[10px] text-muted-foreground">Tip: Nudge choruses tighter, verses looser — energy vs soul.</p>
        <Button size="sm" variant="outline" className="mt-3 h-7 text-[11px] w-full" onClick={() => ask(`${base} VOCALS Timing — my vocal rushes/drags in places. Teach me NewTime to fix timing while keeping the human feel. When do I quantize and when do I leave it?`)}><MessageCircle className="w-3 h-3 mr-1" /> Coach NewTime</Button>
      </Card>

      <Card className="studio-card p-4">
        <h4 className="text-xs font-semibold flex items-center gap-1.5"><Waves className="w-3.5 h-3.5 text-primary" /> Pitcher / Auto-Tune — Real-time</h4>
        <ol className="mt-2 space-y-1 text-[11px] text-muted-foreground list-decimal list-inside">
          <li>Load Pitcher on Mixer insert (or NewTone for manual)</li>
          <li>Set Key/Scale to match beat (see Chord Forge key)</li>
          <li>Speed 60–80 ms for natural, 0–20 ms for effect</li>
          <li>Mix 100% wet for tuning, automate off for ad-libs</li>
          <li>Record with effect, keep dry take muted below</li>
        </ol>
        <p className="mt-2 text-[10px] text-muted-foreground">Use Pitcher to monitor while recording — then fine-tune in NewTone.</p>
        <Button size="sm" variant="outline" className="mt-3 h-7 text-[11px] w-full" onClick={() => ask(`${base} VOCALS Pitcher — set up Pitcher/Auto-Tune for this song's key so I can monitor in tune while recording. What key, speed and mix for this genre?`)}><MessageCircle className="w-3 h-3 mr-1" /> Coach Pitcher</Button>
      </Card>
    </div>
  );
};
