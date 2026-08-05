import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useProject } from "@/context/ProjectContext";
import { assessMaster, buildMasterAdvisePrompt, getPlatform, PLATFORM_TARGETS, type MasterReportLike, type MasterVerdict } from "@/lib/mastering";
import { stashChatPrompt } from "@/lib/knowledge-handoff";

export function MasterChapterCard() {
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
    })().catch(() => { /* desk stays quiet on error */ });
    return () => { cancelled = true; };
  }, [activeProject?.id, activeProject?.genre, nonce]);

  const platform = getPlatform(platformId);
  const verdict: MasterVerdict | null = masterReady && report ? assessMaster(report, platform, genreOpts) : null;

  const askSensei = () => {
    if (!verdict || !report) return;
    stashChatPrompt(buildMasterAdvisePrompt(report, platform, verdict));
  };

  return (
    <Card className="studio-card space-y-4 p-4 mb-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Mastering chapter</p>
          <h3 className="text-sm font-semibold">👑 Master Decision Desk</h3>
        </div>
        <Button size="sm" variant="outline" onClick={() => setNonce((n) => n + 1)}>
          🔄 Re-measure latest bounce
        </Button>
      </div>

      {!activeProject && (
        <p className="text-xs text-muted-foreground">
          Pick a project first — the desk measures the project's latest confirmed bounce.
        </p>
      )}

      {activeProject && masterReady === false && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            🥋 Sensei: finish the MIX chapter first. When your mix scores master-ready, this desk lights up.
            {mixScore != null && ` Your latest mix score: ${mixScore}/100.`}
          </p>
          <Button asChild size="sm" variant="outline">
            <Link to="/upload">← Back to the Mixing chapter</Link>
          </Button>
        </div>
      )}

      {activeProject && masterReady && verdict && (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Measuring your latest confirmed bounce{report?.file_name ? `: "${report.file_name}"` : ""}.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={platformId}
              onChange={(e) => setPlatformId(e.target.value)}
              aria-label="Destination platform"
              className="h-9 rounded-md border border-border bg-background px-2 text-sm"
            >
              {PLATFORM_TARGETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} · {p.lufs} LUFS · ceiling {p.ceilingDb} dBTP
                </option>
              ))}
            </select>
            <span className="text-[11px] text-muted-foreground">{platform.note}</span>
          </div>

          <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
            <p className="text-sm font-semibold">{verdict.headline}</p>
          </div>

          <div className="space-y-2">
            {verdict.checks.map((c) => (
              <div key={c.id} className="text-xs">
                <span className="mr-1">{c.verdict === "pass" ? "✅" : c.verdict === "warn" ? "⚠️" : "❌"}</span>
                <span className="font-semibold">{c.label}:</span>{" "}
                <span className="text-muted-foreground">{c.detail}</span>
                {c.fix && (
                  <p className="mt-1 text-[11px] text-primary">→ {c.fix}</p>
                )}
              </div>
            ))}
            {verdict.checks.length === 0 && (
              <p className="text-xs text-muted-foreground">Nothing measurable on the latest bounce.</p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" onClick={askSensei}>
              <Link to="/chat">🥋 Ask Sensei to coach this master</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/upload">⬆ Upload a mastered bounce</Link>
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
