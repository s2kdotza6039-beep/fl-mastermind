import { useEffect, useState } from "react";
import { Link, useParams, Navigate } from "react-router-dom";
import { ArrowLeft, FolderOpen, MessageCircle, Trash2, Check, X, CircleDot, Loader2, Music2, AudioLines, TrendingUp, AlertTriangle, AlertCircle, Info, Save, Download } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MixScoreCard } from "@/components/MixScoreCard";
import { resolveGenreTarget } from "@/lib/genre-target";
import { ChordGeneratorCard } from "@/components/ChordGeneratorCard";
import { GenrePlaybookCard } from "@/components/GenrePlaybookCard";
import { GrooveEngineCard } from "@/components/GrooveEngineCard";
import { PlaybookChecklistCard } from "@/components/PlaybookChecklistCard";
import { RepairPlanCard, type RepairPlanStep } from "@/components/RepairPlanCard";
import { useAuth } from "@/context/AuthContext";
import { useProject } from "@/context/ProjectContext";
import { buildExportPayload, exportFileName } from "@/lib/project-export";

import {
  getProject, listAdvice, listTrackVersions, setAdviceStatus, deleteAdvice,
  type Project, type ProjectAdvice, type ProjectTrackVersion, type AdviceStatus,
} from "@/lib/project-memory";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ScoreBreakdown, StoredIssue } from "@/lib/coaching-loop";

interface AudioReport {
  id: string;
  file_name: string;
  detected_key: string | null;
  bpm: number | null;
  lufs_estimate: number | null;
  detected_issues: any;
  created_at: string;
}

const STATUS_META: Record<AdviceStatus, { label: string; color: string; icon: any }> = {
  pending:  { label: "Pending",  color: "text-yellow-500",  icon: CircleDot },
  applied:  { label: "Applied",  color: "text-blue-500",    icon: Check },
  resolved: { label: "Resolved", color: "text-green-500",   icon: Check },
  ignored:  { label: "Ignored",  color: "text-muted-foreground", icon: X },
};

export default function ProjectDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { activeProject, switchProject } = useProject();
  const [project, setProject] = useState<Project | null>(null);
  const [advice, setAdvice] = useState<ProjectAdvice[]>([]);
  const [versions, setVersions] = useState<ProjectTrackVersion[]>([]);
  const [reports, setReports] = useState<AudioReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [latestScore, setLatestScore] = useState<{ mix_score: number; breakdown: ScoreBreakdown; master_ready: boolean } | null>(null);
  const [issues, setIssues] = useState<StoredIssue[]>([]);
  const [planId, setPlanId] = useState<string | null>(null);
  const [steps, setSteps] = useState<RepairPlanStep[]>([]);
  const [targetScore, setTargetScore] = useState(85);
  const [genericTarget, setGenericTarget] = useState(false);
  // Session form.
  const [tracksCount, setTracksCount] = useState<number | "">("");
  const [mixerRouting, setMixerRouting] = useState("");
  const [pluginChains, setPluginChains] = useState("");
  const [notes, setNotes] = useState("");
  const [goal, setGoal] = useState("");
  const [savingSession, setSavingSession] = useState(false);

  useEffect(() => {
    if (!id || !user) return;
    (async () => {
      setLoading(true);
      const p = await getProject(id);
      if (!p) { setNotFound(true); setLoading(false); return; }
      setProject(p);
      const sn = (p as any).session_notes ?? {};
      setTracksCount(typeof sn.tracks_count === "number" ? sn.tracks_count : "");
      setMixerRouting(sn.mixer_routing ?? "");
      setPluginChains(sn.plugin_chains ?? "");
      setNotes(sn.notes ?? "");
      setGoal((p as any).goal ?? "");
      const [a, v, r, sc, iss, pl, tg] = await Promise.all([
        listAdvice(p.id),
        listTrackVersions(p.id),
        supabase.from("audio_analysis_reports")
          .select("id, file_name, detected_key, bpm, lufs_estimate, detected_issues, created_at")
          .eq("project_id", p.id).order("created_at", { ascending: false }),
        supabase.from("project_scores").select("mix_score, breakdown, master_ready")
          .eq("project_id", p.id).order("created_at", { ascending: false }).limit(1),
        supabase.from("project_issues").select("*").eq("project_id", p.id).neq("status", "resolved"),
        supabase.from("repair_plans").select("id").eq("project_id", p.id).eq("status", "active")
          .order("created_at", { ascending: false }).limit(1),
        supabase.from("genre_target_profiles").select("target_score, genre"),
      ]);
      setAdvice(a);
      setVersions(v);
      setReports((r.data as AudioReport[]) ?? []);
      if (sc.data?.[0]) {
        setLatestScore({
          mix_score: sc.data[0].mix_score,
          breakdown: sc.data[0].breakdown as unknown as ScoreBreakdown,
          master_ready: sc.data[0].master_ready,
        });
      }
      setIssues(((iss.data ?? []) as any[]).map((row) => ({
        id: row.id, detector_id: row.detector_id, severity: row.severity, title: row.title,
        detail: row.detail, metrics: row.metrics, status: row.status,
      })));
      const resolved = resolveGenreTarget((tg.data ?? []) as any[], p.genre);
      setTargetScore(resolved.profile?.target_score ?? 85);
      setGenericTarget(resolved.generic);
      const pid = pl.data?.[0]?.id ?? null;
      setPlanId(pid);
      if (pid) {
        const { data: stepData } = await supabase.from("plan_steps")
          .select("id, step_order, instruction, expected_delta, status")
          .eq("plan_id", pid).order("step_order");
        setSteps((stepData ?? []) as RepairPlanStep[]);
      }
      setLoading(false);
      if (activeProject?.id !== p.id) switchProject(p.id).catch(() => {});
    })();
  }, [id, user]); // eslint-disable-line react-hooks/exhaustive-deps

  async function exportJson() {
    if (!project) return;
    try {
      const [v, sc, iss, pl, adv] = await Promise.all([
        supabase.from("project_track_versions").select("*").eq("project_id", project.id),
        supabase.from("project_scores").select("*").eq("project_id", project.id),
        supabase.from("project_issues").select("*").eq("project_id", project.id),
        supabase.from("repair_plans").select("*").eq("project_id", project.id),
        supabase.from("project_advice").select("*").eq("project_id", project.id),
      ]);
      const plans = (pl.data ?? []) as any[];
      const planIds = plans.map((p) => p.id);
      let stepsByPlan: Record<string, any[]> = {};
      if (planIds.length > 0) {
        const { data: allSteps } = await supabase
          .from("plan_steps").select("*").in("plan_id", planIds).order("step_order");
        for (const s of (allSteps ?? []) as any[]) {
          (stepsByPlan[s.plan_id] ||= []).push(s);
        }
      }
      const payload = buildExportPayload({
        project,
        versions: v.data ?? [],
        scores: sc.data ?? [],
        issues: iss.data ?? [],
        plans: plans.map((p) => ({ ...p, steps: stepsByPlan[p.id] ?? [] })),
        advice: adv.data ?? [],
      });
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = exportFileName(project.name);

      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Project exported");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not export project");
    }
  }

  async function saveSession() {
    if (!project) return;
    setSavingSession(true);
    const session_notes = {
      tracks_count: typeof tracksCount === "number" ? tracksCount : null,
      mixer_routing: mixerRouting,
      plugin_chains: pluginChains,
      notes,
    };
    const { error } = await supabase.from("projects")
      .update({ session_notes: session_notes as any, goal: goal || null })
      .eq("id", project.id);
    setSavingSession(false);
    if (error) toast.error("Could not save session");
    else toast.success("Session saved");
  }

  if (notFound) return <Navigate to="/projects" replace />;
  if (loading || !project) {
    return (
      <div className="container max-w-5xl py-10 px-4 md:px-8">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const open = advice.filter((a) => a.status === "pending");
  const done = advice.filter((a) => a.status === "applied" || a.status === "resolved");
  const ignored = advice.filter((a) => a.status === "ignored");
  const healthScore = advice.length === 0
    ? 100
    : Math.round((done.length / advice.length) * 100);

  async function setStatus(id: string, status: AdviceStatus) {
    await setAdviceStatus(id, status);
    setAdvice((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
  }
  async function remove(id: string) {
    await deleteAdvice(id);
    setAdvice((prev) => prev.filter((a) => a.id !== id));
    toast.success("Removed");
  }

  return (
    <div className="container max-w-5xl py-10 px-4 md:px-8">
      <Link to="/projects" className="inline-flex items-center text-xs text-muted-foreground hover:text-primary mb-4">
        <ArrowLeft className="w-3 h-3 mr-1" /> All projects
      </Link>

      <PageHeader
        eyebrow={project.genre ?? "Project"}
        title={project.name}
        description={project.description ?? "Sensei is remembering everything in this project."}
        icon={<FolderOpen className="w-6 h-6" />}
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Export JSON"
              title="Export JSON"
              className="text-muted-foreground hover:text-primary"
              onClick={exportJson}
            >
              <Download className="w-4 h-4" />
            </Button>
            <Button asChild className="bg-gradient-gold text-primary-foreground hover:opacity-90">
              <Link to="/mixing"><MessageCircle className="w-4 h-4 mr-2" /> Continue coaching</Link>
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card className="studio-card p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Open issues</div>
          <div className={`text-xl font-bold ${open.length > 0 ? "text-destructive" : ""}`}>{open.length}</div>
        </Card>
        <Card className="studio-card p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Resolved</div>
          <div className="text-xl font-bold text-primary">{done.length}</div>
        </Card>
        <Card className="studio-card p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Track versions</div>
          <div className="text-xl font-bold">{versions.length}</div>
        </Card>
        <Card className="studio-card p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Analyses</div>
          <div className="text-xl font-bold">{reports.length}</div>
        </Card>
      </div>

      <Card className="studio-card-gold p-5 mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            <span className="font-semibold">Project health</span>
          </div>
          <div className="font-display text-2xl font-bold text-gold">{healthScore}%</div>
        </div>
        <Progress value={healthScore} className="h-2" />
        <p className="text-xs text-muted-foreground mt-2">
          {advice.length === 0
            ? "Generate advice from Coach pages or Sensei chat to start tracking progress."
            : `${done.length} of ${advice.length} recommendations addressed.`}
        </p>
      </Card>

      <Tabs defaultValue="advice">
        <TabsList>
          <TabsTrigger value="advice">Advice timeline ({advice.length})</TabsTrigger>
          <TabsTrigger value="issues">Issues & Plan</TabsTrigger>
          <TabsTrigger value="session">Session</TabsTrigger>
          <TabsTrigger value="tracks">Tracks ({versions.length})</TabsTrigger>
          <TabsTrigger value="analyses">Analyses ({reports.length})</TabsTrigger>
          <TabsTrigger value="chords">🎹 Chords</TabsTrigger>
          <TabsTrigger value="playbook">🥁 Playbook</TabsTrigger>
          <TabsTrigger value="checklist">✅ Playbook steps</TabsTrigger>
        </TabsList>

        <TabsContent value="issues">
          <div className="mt-4 space-y-4">
            <MixScoreCard
              score={latestScore?.mix_score ?? null}
              breakdown={latestScore?.breakdown ?? null}
              master_ready={latestScore?.master_ready ?? false}
              target_score={targetScore}
            />
            {genericTarget && (
              <span className="text-[10px] text-muted-foreground/70">Generic targets — custom-genre mapping coming</span>
            )}
            <Card className="studio-card p-5">
              <h3 className="font-display text-lg font-bold mb-3">Open issues ({issues.length})</h3>
              {issues.length === 0 ? (
                <p className="text-sm text-muted-foreground">No open issues detected. Re-upload after fixes to verify.</p>
              ) : (
                <ul className="space-y-2">
                  {issues.map((i) => {
                    const Icon = i.severity === "critical" ? AlertCircle : i.severity === "warn" ? AlertTriangle : Info;
                    const color = i.severity === "critical" ? "text-destructive" : i.severity === "warn" ? "text-amber-400" : "text-muted-foreground";
                    return (
                      <li key={i.detector_id} className="flex items-start gap-3">
                        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${color}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold">{i.title}</span>
                            <Badge variant="outline" className="text-[10px] uppercase">{i.severity}</Badge>
                          </div>
                          {i.detail && <p className="text-xs text-muted-foreground">{i.detail}</p>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
            <RepairPlanCard planId={planId} steps={steps} onChange={setSteps} />
          </div>
        </TabsContent>

        <TabsContent value="session">
          <Card className="studio-card p-5 mt-4 space-y-4">
            <div>
              <Label>Project goal</Label>
              <Input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. Broadcast-ready Amapiano single" />
            </div>
            <div>
              <Label>Tracks count</Label>
              <Input type="number" min={0} value={tracksCount}
                onChange={(e) => setTracksCount(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="e.g. 18" />
            </div>
            <div>
              <Label>Mixer routing</Label>
              <Textarea rows={3} value={mixerRouting} onChange={(e) => setMixerRouting(e.target.value)}
                placeholder="Insert 1 = Kick, Insert 2 = Snare, Bus 20 = Drum group…" />
            </div>
            <div>
              <Label>Plugin chains</Label>
              <Textarea rows={3} value={pluginChains} onChange={(e) => setPluginChains(e.target.value)}
                placeholder="Vocal: Parametric EQ 2 → Fruity Compressor → Reeverb 2…" />
            </div>
            <div>
              <Label>Session notes</Label>
              <Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything Sensei should remember for next time." />
            </div>
            <Button onClick={saveSession} disabled={savingSession} className="bg-gradient-gold text-primary-foreground hover:opacity-90">
              {savingSession ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />} Save session
            </Button>
          </Card>
        </TabsContent>



        <TabsContent value="advice">
          <div className="space-y-2 mt-4">
            {advice.length === 0 ? (
              <Card className="studio-card p-8 text-center">
                <p className="text-sm text-muted-foreground">
                  No advice saved yet. Open <Link to="/chat" className="text-primary hover:underline">Sensei Chat</Link> and save recommendations into this project.
                </p>
              </Card>
            ) : (
              advice.map((a) => {
                const meta = STATUS_META[a.status];
                return (
                  <Card key={a.id} className="studio-card p-4">
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <meta.icon className={`w-3.5 h-3.5 ${meta.color}`} />
                          <h4 className="font-semibold text-sm truncate">{a.title}</h4>
                          {a.category && <Badge variant="outline" className="text-[10px]">{a.category}</Badge>}
                          {a.source_page && <Badge variant="secondary" className="text-[10px]">{a.source_page}</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-3 whitespace-pre-wrap">
                          {a.content.replace(/[#*]/g, "")}
                        </p>
                        <div className="text-[10px] text-muted-foreground/60 mt-1">
                          {new Date(a.created_at).toLocaleString()}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 flex-shrink-0">
                        <Select value={a.status} onValueChange={(v) => setStatus(a.id, v as AdviceStatus)}>
                          <SelectTrigger className="h-7 w-28 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="applied">Applied</SelectItem>
                            <SelectItem value="resolved">Resolved</SelectItem>
                            <SelectItem value="ignored">Ignored</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove(a.id)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })
            )}
          </div>
        </TabsContent>

        <TabsContent value="tracks">
          <div className="space-y-2 mt-4">
            {versions.length === 0 ? (
              <Card className="studio-card p-8 text-center text-sm text-muted-foreground space-y-4">
                <div>No track versions yet. Upload audio while this project is active and Sensei will log it as v1.</div>
                <Button asChild className="bg-gradient-gold text-primary-foreground hover:opacity-90">
                  <Link to="/upload">Upload audio — start v1</Link>
                </Button>
              </Card>
            ) : versions.map((v) => (
              <Card key={v.id} className="studio-card p-4 flex items-center gap-3">
                <Badge variant="outline">v{v.version_number}</Badge>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm truncate">{v.file_name}</div>
                  <div className="text-[10px] text-muted-foreground">{new Date(v.created_at).toLocaleString()}</div>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="analyses">
          <div className="grid md:grid-cols-2 gap-3 mt-4">
            {reports.length === 0 ? (
              <Card className="studio-card p-8 text-center text-sm text-muted-foreground md:col-span-2">
                No analyses linked to this project yet.
              </Card>
            ) : reports.map((r) => {
              const issues = Array.isArray(r.detected_issues) ? r.detected_issues.length : 0;
              return (
                <Card key={r.id} className="studio-card p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h4 className="font-semibold text-sm truncate flex-1">{r.file_name}</h4>
                    <Badge variant={issues > 0 ? "destructive" : "secondary"} className="text-[10px]">{issues} issue{issues === 1 ? "" : "s"}</Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[11px] text-muted-foreground">
                    <div><Music2 className="w-3 h-3 inline mr-0.5" />{r.detected_key ?? "—"}</div>
                    <div>{r.bpm ?? "—"} BPM</div>
                    <div><AudioLines className="w-3 h-3 inline mr-0.5" />{r.lufs_estimate ?? "—"} LUFS</div>
                  </div>
                  <div className="text-[10px] text-muted-foreground/60 mt-2">{new Date(r.created_at).toLocaleString()}</div>
                </Card>
              );
            })}
          </div>
        </TabsContent>
        <TabsContent value="chords">
          <ChordGeneratorCard
            genre={project?.genre ?? null}
            detectedKey={reports[0]?.detected_key ?? null}
            bpm={reports[0]?.bpm ?? null}
            projectName={project?.name ?? null}
          />
        </TabsContent>
        <TabsContent value="playbook">
          <GenrePlaybookCard genre={project?.genre ?? null} />
        </TabsContent>
        <TabsContent value="checklist">
          <PlaybookChecklistCard
            genre={project?.genre ?? null}
            projectId={project?.id ?? null}
            projectName={project?.name ?? null}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
