import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { MessageCircle, RotateCcw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { matchPlaybook, type GenrePlaybook } from "@/lib/genre-playbooks";
import { stashChatPrompt } from "@/lib/knowledge-handoff";

interface Step { id: string; group: string; text: string; }

function buildSteps(pb: GenrePlaybook): Step[] {
  const steps: Step[] = [
    { id: "tempo", group: "Foundation", text: `Set the project tempo inside ${pb.bpmRange[0]}–${pb.bpmRange[1]} BPM` },
    { id: "key", group: "Foundation", text: `Pick a key that suits the style (${pb.commonKeys})` },
  ];
  pb.drumPalette.forEach((d, i) => steps.push({ id: `drum-${i}`, group: "Drums", text: `Lay in: ${d}` }));
  pb.arrangement.forEach((s, i) =>
    steps.push({ id: `arr-${i}`, group: "Arrangement", text: `${s.section} — ${s.bars} bars: ${s.notes}` }),
  );
  pb.mixFocus.forEach((m, i) => steps.push({ id: `mix-${i}`, group: "Mix", text: m }));
  return steps;
}

interface Props { genre?: string | null; projectId?: string | null; projectName?: string | null; }

export const PlaybookChecklistCard = ({ genre, projectId, projectName }: Props) => {
  const navigate = useNavigate();
  const pb = matchPlaybook(genre);
  const steps = useMemo(() => (pb ? buildSteps(pb) : []), [pb]);
  const storageKey = `sensei.playbook.checklist.${projectId ?? "global"}.${pb?.id ?? "none"}`;
  const [done, setDone] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      setDone(raw ? JSON.parse(raw) : {});
    } catch { setDone({}); }
  }, [storageKey]);

  const persist = (next: Record<string, boolean>) => {
    setDone(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
  };

  if (!pb) {
    return (
      <Card className="studio-card p-5">
        <h3 className="text-sm font-semibold">✅ Playbook Checklist</h3>
        <p className="text-xs text-muted-foreground mt-2">
          No genre-specific playbook for "{genre ?? "—"}" yet, so there's nothing to turn into steps.
          Set a known genre on this project, or ask Sensei in chat for a custom step list.
        </p>
      </Card>
    );
  }

  const completed = steps.filter((s) => done[s.id]).length;
  const pct = steps.length ? Math.round((completed / steps.length) * 100) : 0;
  const groups = Array.from(new Set(steps.map((s) => s.group)));
  const remaining = steps.filter((s) => !done[s.id]);

  const askSensei = () => {
    stashChatPrompt(
      [
        `I'm working the ${pb.display} playbook${projectName ? ` on "${projectName}"` : ""}.`,
        `Done so far (${completed}/${steps.length}):`,
        ...steps.filter((s) => done[s.id]).map((s) => `  ✔ ${s.text}`),
        `Still open:`,
        ...remaining.slice(0, 12).map((s) => `  • ${s.text}`),
        "",
        `Coach me through the next open step with exact FL Studio moves, and tell me if any of my chords, vocals or drums should change to fit ${pb.display}.`,
      ].join("\n"),
    );
    navigate("/chat");
  };

  return (
    <Card className="studio-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">✅ Playbook Checklist — {pb.display}</h3>
        <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => persist({})}>
          <RotateCcw className="w-3 h-3 mr-1" /> Reset
        </Button>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
          <span>{completed} of {steps.length} steps done</span>
          <span className="text-primary font-semibold">{pct}%</span>
        </div>
        <Progress value={pct} className="h-2" />
      </div>

      <div className="mt-4 space-y-4">
        {groups.map((g) => (
          <div key={g}>
            <h4 className="text-xs font-semibold mb-1">{g}</h4>
            <div className="space-y-1.5">
              {steps.filter((s) => s.group === g).map((s) => (
                <label key={s.id} className="flex items-start gap-2 cursor-pointer">
                  <Checkbox
                    checked={!!done[s.id]}
                    onCheckedChange={(v) => persist({ ...done, [s.id]: v === true })}
                    aria-label={s.text}
                    className="mt-0.5"
                  />
                  <span className={`text-[11px] ${done[s.id] ? "line-through text-muted-foreground/60" : "text-muted-foreground"}`}>
                    {s.text}
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Button size="sm" variant="outline" className="mt-4 h-8 text-[11px]" onClick={askSensei}>
        <MessageCircle className="w-3 h-3 mr-1" /> Ask Sensei about my next step
      </Button>
    </Card>
  );
};
