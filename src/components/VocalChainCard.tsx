import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Mic2, RotateCcw, MessageCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { stashChatPrompt } from "@/lib/knowledge-handoff";

const STEPS = [
  { id: "mic", label: "Mic 15–20 cm, pop filter on, speak across the capsule — not directly into it." },
  { id: "gain", label: "Gain to peak -12 to -6 dB on loudest part (aim -18 dBFS avg). No clipping." },
  { id: "room", label: "Room quiet: close windows, fans off, blanket/duvet behind you if no booth." },
  { id: "edison", label: "Record in Edison or Playlist — 24-bit WAV, 44.1 kHz. Record dry (no reverb)." },
  { id: "takes", label: "Record 3 full takes of every line/section — comp the best words later." },
  { id: "punch", label: "Punch-in on bad words only — keep flow, don't re-sing everything." },
  { id: "headroom", label: "Leave headroom: master fader 0 dB, vocal peak -6 dB. Bounce dry for tuning." },
];

export const VocalChainCard = ({ projectName, genre }: { projectName?: string | null; genre?: string | null }) => {
  const navigate = useNavigate();
  const storageKey = `sensei.vocal.chain.${projectName ?? "global"}`;
  const [done, setDone] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      setDone(raw ? JSON.parse(raw) : {});
    } catch { setDone({}); }
  }, [storageKey]);

  const persist = (next: Record<string, boolean>) => {
    setDone(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
  };

  const completed = useMemo(() => STEPS.filter(s => done[s.id]).length, [done]);
  const pct = Math.round((completed / STEPS.length) * 100);

  const askSensei = () => {
    const remaining = STEPS.filter(s => !done[s.id]).map(s => `• ${s.label}`).join("\n");
    stashChatPrompt(
      [
        projectName ? `Project: ${projectName}.` : "",
        genre ? `Genre: ${genre}.` : "",
        "VOCALS — Recording chain check.",
        completed ? `Done: ${completed}/${STEPS.length}` : "None done yet.",
        remaining ? `Still to do:\n${remaining}` : "All steps done — verify my chain.",
        "",
        "Give me exact FL Studio steps for the next unchecked item, plus one pro tip to avoid the common mistake there.",
      ].filter(Boolean).join("\n"),
      "PRODUCTION:VOCALS"
    );
    navigate("/chat?scope=PRODUCTION%3AVOCALS");
  };

  return (
    <Card className="studio-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><Mic2 className="w-4 h-4 text-primary" /> 🎙️ Vocal Chain — Record Clean Takes</h3>
        <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => persist({})}><RotateCcw className="w-3 h-3 mr-1" /> Reset</Button>
      </div>
      <p className="text-xs text-muted-foreground mt-1">Tick as you record. Sensei coaches only what’s left — no wasted time.</p>

      <div className="mt-3">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
          <span>{completed} of {STEPS.length} done</span>
          <span className="text-primary font-semibold">{pct}%</span>
        </div>
        <Progress value={pct} className="h-2" />
      </div>

      <div className="mt-4 space-y-1.5">
        {STEPS.map(s => (
          <label key={s.id} className="flex items-start gap-2 cursor-pointer">
            <Checkbox checked={!!done[s.id]} onCheckedChange={v => persist({ ...done, [s.id]: v === true })} className="mt-0.5" />
            <span className={`text-[11px] leading-relaxed ${done[s.id] ? "line-through text-muted-foreground/60" : "text-muted-foreground"}`}>{s.label}</span>
          </label>
        ))}
      </div>

      <Button size="sm" variant="outline" className="mt-4 h-8 text-[11px]" onClick={askSensei}><MessageCircle className="w-3 h-3 mr-1" /> Ask Vocal Sensei about next step</Button>
    </Card>
  );
};
