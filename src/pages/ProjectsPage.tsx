import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FolderOpen, Plus, ArrowRight, Music2, AudioLines, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useProject } from "@/context/ProjectContext";
import { listAdvice, listTrackVersions, type ProjectStatus } from "@/lib/project-memory";
import { toast } from "sonner";

interface ProjectStats {
  openIssues: number;
  totalAdvice: number;
  currentTrack: string | null;
  lastAdviceAt: string | null;
}

export default function ProjectsPage() {
  const { projects, activeProject, switchProject, create, update, remove } = useProject();
  const [stats, setStats] = useState<Record<string, ProjectStats>>({});
  const [openNew, setOpenNew] = useState(false);
  const [name, setName] = useState("");
  const [genre, setGenre] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);


  useEffect(() => {
    (async () => {
      const out: Record<string, ProjectStats> = {};
      for (const p of projects) {
        const [advice, versions] = await Promise.all([
          listAdvice(p.id).catch(() => []),
          listTrackVersions(p.id).catch(() => []),
        ]);
        out[p.id] = {
          openIssues: advice.filter((a) => a.status === "pending").length,
          totalAdvice: advice.length,
          currentTrack: versions[0]?.file_name ?? null,
          lastAdviceAt: advice[0]?.created_at ?? null,
        };
      }
      setStats(out);
    })();
  }, [projects]);

  return (
    <div className="container max-w-6xl py-10 px-4 md:px-8">
      <PageHeader
        eyebrow="Memory"
        title="My Projects"
        description="Sensei remembers every song. Switch projects anytime — your advice, analyses, and progress stay exactly where you left them."
        icon={<FolderOpen className="w-6 h-6" />}
        action={
          <Button onClick={() => setOpenNew(true)} className="bg-gradient-gold text-primary-foreground hover:opacity-90">
            <Plus className="w-4 h-4 mr-2" /> New project
          </Button>
        }
      />

      <div className="mb-4">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search projects by name or genre…"
          className="max-w-sm"
        />
      </div>

      {projects.length === 0 ? (
        <Card className="studio-card p-12 text-center">
          <FolderOpen className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground mb-4">No projects yet.</p>
          <Button onClick={() => setOpenNew(true)}>
            <Plus className="w-4 h-4 mr-2" /> Create your first project
          </Button>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {projects
            .filter((p) => {
              const q = search.trim().toLowerCase();
              if (!q) return true;
              return (
                p.name.toLowerCase().includes(q) || (p.genre ?? "").toLowerCase().includes(q)
              );
            })
            .map((p) => {
            const s = stats[p.id];
            const isActive = activeProject?.id === p.id;
            const lastActivity = new Date(p.last_activity_at);
            return (
              <Card key={p.id} className={`studio-card p-5 ${isActive ? "border-primary/50" : ""}`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-display text-lg font-bold truncate">{p.name}</h3>
                      {isActive && <Badge variant="secondary" className="text-[10px]">Active</Badge>}
                    </div>
                    {p.description && (
                      <p className="text-xs text-muted-foreground line-clamp-1">{p.description}</p>
                    )}
                  </div>
                  <Select
                    value={p.status}
                    onValueChange={(v) => update(p.id, { status: v as ProjectStatus })}
                  >
                    <SelectTrigger className="h-7 w-28 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="paused">Paused</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs my-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Genre</div>
                    <div className="flex items-center gap-1"><Music2 className="w-3 h-3 text-primary/70" /> {p.genre ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Current track</div>
                    <div className="flex items-center gap-1 truncate"><AudioLines className="w-3 h-3 text-primary/70" /> {s?.currentTrack ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Open issues</div>
                    <div className={s?.openIssues ? "text-destructive font-semibold" : ""}>{s?.openIssues ?? 0}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Total advice</div>
                    <div>{s?.totalAdvice ?? 0}</div>
                  </div>
                </div>

                <div className="text-[10px] text-muted-foreground/70 mb-3">
                  Last activity {lastActivity.toLocaleString()}
                </div>

                <div className="flex gap-2">
                  {!isActive && (
                    <Button size="sm" variant="outline" onClick={() => switchProject(p.id)}>
                      Switch to
                    </Button>
                  )}
                  <Button asChild size="sm" className="ml-auto bg-gradient-gold text-primary-foreground hover:opacity-90">
                    <Link to={`/projects/${p.id}`}>
                      Open project <ArrowRight className="w-3.5 h-3.5 ml-1" />
                    </Link>
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={openNew} onOpenChange={setOpenNew}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>Sensei will remember every track, analysis, and recommendation in this project.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Project name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value.slice(0, 80))} placeholder="Untitled Song" />
            </div>
            <div>
              <Label>Genre (optional)</Label>
              <Input value={genre} onChange={(e) => setGenre(e.target.value.slice(0, 40))} placeholder="Amapiano" />
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value.slice(0, 200))} placeholder="Notes about the song" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenNew(false)}>Cancel</Button>
            <Button
              disabled={!name.trim() || busy}
              onClick={async () => {
                setBusy(true);
                const p = await create({
                  name: name.trim(),
                  genre: genre.trim() || undefined,
                  description: description.trim() || undefined,
                });
                setBusy(false);
                if (p) { setName(""); setGenre(""); setDescription(""); setOpenNew(false); }
              }}
            >
              Create project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
