import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertCircle, ArrowRight, ListChecks } from "lucide-react";
import { useStudioSetup } from "@/context/StudioSetupContext";

const FIELDS: { key: keyof NonNullable<ReturnType<typeof useStudioSetup>["setup"]>; label: string }[] = [
  { key: "fl_version", label: "FL Studio Version" },
  { key: "fl_edition", label: "FL Studio Edition" },
  { key: "main_use", label: "Main Use" },
  { key: "main_genre", label: "Main Genre" },
  { key: "skill_level", label: "Skill Level" },
];

const UNCERTAIN = /not sure|other/i;

export function SetupChecklistCard() {
  const { setup, loading } = useStudioSetup();
  if (loading) return null;

  const issues = FIELDS.map((f) => {
    const raw = (setup?.[f.key] as string | null | undefined) ?? "";
    const missing = !raw;
    const uncertain = !missing && UNCERTAIN.test(raw);
    return { ...f, value: raw, missing, uncertain, ok: !missing && !uncertain };
  });

  const remaining = issues.filter((i) => !i.ok).length;
  if (remaining === 0) return null;

  return (
    <Card className="studio-card p-5 mb-6 border-primary/30">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-9 h-9 rounded-lg bg-gradient-gold-soft border border-primary/20 flex items-center justify-center flex-shrink-0">
          <ListChecks className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm text-foreground">
            Improve your Sensei accuracy ({remaining} {remaining === 1 ? "field" : "fields"} to confirm)
          </h3>
          <p className="text-xs text-muted-foreground">
            Sensei tailors plugin recommendations to your exact FL Studio profile. Confirm these to unlock better advice.
          </p>
        </div>
        <Button asChild size="sm" className="bg-gradient-gold text-primary-foreground hover:opacity-90">
          <Link to="/studio-setup">Confirm <ArrowRight className="w-3.5 h-3.5 ml-1" /></Link>
        </Button>
      </div>
      <ul className="grid sm:grid-cols-2 gap-1.5 text-xs">
        {issues.map((i) => (
          <li key={String(i.key)} className="flex items-center gap-2">
            {i.ok ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
            ) : (
              <AlertCircle className={`w-3.5 h-3.5 ${i.missing ? "text-destructive" : "text-amber-500"}`} />
            )}
            <span className={i.ok ? "text-muted-foreground" : "text-foreground"}>
              {i.label}:{" "}
              <span className="text-muted-foreground">
                {i.missing ? "missing" : i.uncertain ? `uncertain ("${i.value}")` : i.value}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
