import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useProject } from "@/context/ProjectContext";
import { PLATFORM_TARGETS, type MasterReportLike } from "@/lib/mastering";
import { buildReleaseAdvisePrompt, buildReleasePlan, type ReleasePlan } from "@/lib/release";
import { stashChatPrompt } from "@/lib/knowledge-handoff";
import { useAuth } from "@/context/AuthContext";
import { buildMixChecklistMarkdown, buildReleaseNotesMarkdown, downloadMarkdown } from "@/lib/paperwork";

export function ReleaseCard() {
  const { activeProject } = useProject();
  const [masterReady, setMasterReady] = useState<boolean | null>(null);
  const [mixScore, setMixScore] = useState<number | null>(null);
  const [report, setReport] = useState<(MasterReportLike & { file_name: string | null }) | null>(null);
  const [genreOpts, setGenreOpts] = useState<{ drMin?: number; widthMin?: number; widthMax?: number }>({});
  const [platformId, setPlatformId] = useState("spotify");
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!activeProject) {
      setMasterReady(null);
      setReport(null);
      setMixScore(null);
      setGenreOpts({});
      return;
    }
    const projectId = activeProject.id;
    (async () => {
      const [scoreRes, reportRes, targetsRes] = await Promise.all([
        supabase.from("project_scores").select("master_ready, mix_score").eq("project_id", projectId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("audio_analysis_reports").select("lufs_estimate, peak_db, dynamic_range_db, stereo_width, detected_issues, file_name").eq("project_id", projectId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("genre_target_profiles").select("genre, dr_min, width_min, width_max"),
      ]);
      if (cancelled) return;
      setMasterReady(scoreRes.data?.master_ready ?? false);
      setMixScore(typeof scoreRes.data?.mix_score === "number" ? scoreRes.data.mix_score : null);
      setReport(reportRes.data ? {
        lufs_estimate: reportRes.data.lufs_estimate,
        peak_db: reportRes.data.peak_db,
        dynamic_range_db: reportRes.data.dynamic_range_db,
        stereo_width: reportRes.data.stereo_width,
        detected_issues: reportRes.data.detected_issues,
        file_name: reportRes.data.file_name ?? null,
      } : null);
      const wanted = (activeProject.genre ?? "").trim().toLowerCase();
      const t = (targetsRes.data ?? []).find((g: any) => (g.genre ?? "").toLowerCase() === wanted);
      setGenreOpts(t ? { drMin: t.dr_min ?? undefined, widthMin: t.width_min ?? undefined, widthMax: t.width_max ?? undefined } : {});
    })().catch(() => { /* the release path stays quiet on error */ });
    return () => { cancelled = true; };
  }, [activeProject?.id, activeProject?.genre, nonce]);

  const plan: ReleasePlan | null =
    activeProject && masterReady
      ? buildReleasePlan({
          report,
          masterReady,
          mixScore,
          platformId,
          projectName: activeProject.name,
          genre: activeProject.genre,
          genreOpts,
        })
      : null;

  const paperworkProject = {
    name: activeProject?.name ?? null,
    genre: activeProject?.genre ?? null,
    artist: (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? null,
    fileName: report?.file_name ?? null,
  };

  const askSensei = () => {
    if (!plan) return;
    stashChatPrompt(buildReleaseAdvisePrompt(plan, report));
  };

  return (
    <Card className="studio-card space-y-4 p-4 mb-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Publish chapter</p>
          <h3 className="text-sm font-semibold">🏁 Release Path</h3>
        </div>
        <Button size="sm" variant="outline" onClick={() => setNonce((n) => n + 1)}>
          🔄 Re-check the gates
        </Button>
      </div>

      {!activeProject && (
        <p className="text-xs text-muted-foreground">
          Pick a project first — the release path measures the project's latest confirmed bounce.
        </p>
      )}

      {activeProject && masterReady === false && (
        <p className="text-xs text-muted-foreground">
          🥋 Sensei: the release path is the LAST door. Finish the Mixing chapter, let the Master desk
          above stamp the master — then these gates open.
          {mixScore != null && ` Your latest mix score: ${mixScore}/100.`}
        </p>
      )}

      {activeProject && masterReady && plan && (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            The final checklist, measured from your latest confirmed bounce
            {report?.file_name ? `: "${report.file_name}"` : ""}. Pick the first destination:
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={platformId}
              onChange={(e) => setPlatformId(e.target.value)}
              aria-label="Release destination"
              className="h-9 rounded-md border border-border bg-background px-2 text-sm"
            >
              {PLATFORM_TARGETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} · {p.lufs} LUFS · ceiling {p.ceilingDb} dBTP
                </option>
              ))}
            </select>
            <span className="text-[11px] text-muted-foreground">{plan.platform.note}</span>
          </div>

          <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
            <p className="text-sm font-semibold">{plan.headline}</p>
          </div>

          <div className="space-y-2">
            {plan.gates.map((g, i) => (
              <div key={`${g.id}-${i}`} className="text-xs">
                <span className="mr-1">{g.verdict === "pass" ? "✅" : g.verdict === "warn" ? "⚠️" : "❌"}</span>
                <span className="font-semibold">{g.label}:</span>{" "}
                <span className="text-muted-foreground">{g.detail}</span>
                {g.fix && (
                  <p className="mt-1 text-[11px] text-primary">→ {g.fix}</p>
                )}
              </div>
            ))}
          </div>

          <p className="text-[11px] text-muted-foreground">
            Final export doctrine: File → Export → Wave · 24-bit · 44.1 kHz · true-peak ceiling {plan.platform.ceilingDb} dBTP.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" onClick={askSensei}>
              <Link to="/chat">🥋 Ask Sensei to walk me to release</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/upload">⬆ Upload the final bounce</Link>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                downloadMarkdown(
                  `${activeProject.name}-final-checklist.md`,
                  buildMixChecklistMarkdown(plan, paperworkProject),
                )
              }
            >
              📄 Final checklist (.md)
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                downloadMarkdown(
                  `${activeProject.name}-release-notes.md`,
                  buildReleaseNotesMarkdown(plan, paperworkProject, report),
                )
              }
            >
              📄 Release notes (.md)
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
