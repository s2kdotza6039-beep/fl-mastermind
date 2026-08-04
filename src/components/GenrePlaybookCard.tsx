import { Card } from "@/components/ui/card";
import { matchPlaybook } from "@/lib/genre-playbooks";

export const GenrePlaybookCard = ({ genre }: { genre?: string | null }) => {
  const pb = matchPlaybook(genre);
  return (
    <Card className="studio-card p-5">
      <h3 className="text-sm font-semibold">
        🥁 Genre Playbook{pb ? ` — ${pb.display}` : ""}
      </h3>
      {!pb ? (
        <p className="text-xs text-muted-foreground mt-2">
          No genre-specific playbook for "{genre ?? "—"}" yet — universal engineering applies:
          drums first, every element owns its frequency lane, and the arrangement breathes
          (tension → release). Sensei still coaches confidently in any genre; playbook packs
          grow over time.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mt-2 text-[11px]">
            <span className="px-2 py-0.5 rounded bg-muted font-medium">BPM {pb.bpmRange[0]}–{pb.bpmRange[1]}</span>
            <span className="px-2 py-0.5 rounded bg-muted font-medium">{pb.commonKeys}</span>
          </div>

          <div className="mt-4">
            <h4 className="text-xs font-semibold mb-1">Drum palette</h4>
            <div className="space-y-0.5">
              {pb.drumPalette.map((d) => <p key={d} className="text-[11px] text-muted-foreground">• {d}</p>)}
            </div>
          </div>

          <div className="mt-4">
            <h4 className="text-xs font-semibold mb-1">Typical arrangement</h4>
            <div className="space-y-1">
              {pb.arrangement.map((s, i) => (
                <div key={`${s.section}-${i}`} className="flex flex-wrap items-baseline gap-2 text-[11px]">
                  <span className="font-medium w-16">{s.section}</span>
                  <span className="text-primary">{s.bars} bars</span>
                  <span className="text-muted-foreground">{s.notes}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <h4 className="text-xs font-semibold mb-1">Mix focus</h4>
            <div className="space-y-0.5">
              {pb.mixFocus.map((m) => <p key={m} className="text-[11px] text-muted-foreground">• {m}</p>)}
            </div>
          </div>
        </>
      )}
    </Card>
  );
};
