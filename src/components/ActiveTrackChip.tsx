import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Music2, X, Repeat, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useTrackSession, type TrackReport } from "@/context/TrackSessionContext";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function issueCount(r: TrackReport) {
  return Array.isArray(r.detected_issues) ? r.detected_issues.length : 0;
}

export const ActiveTrackChip = ({ className }: { className?: string }) => {
  const { active, recent, setActiveReport, clearActive, refreshRecent, loading } = useTrackSession();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  if (loading) return null;

  if (!active) {
    return (
      <Card className={cn("studio-card p-4 mb-6 border-dashed", className)}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <AlertCircle className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">No active track</div>
              <div className="text-xs text-muted-foreground">
                Sensei is in general mode — upload or pick a previous analysis to coach about a specific track.
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => navigate("/upload")}>
              Upload audio
            </Button>
            <TrackPickerDialog
              open={open}
              onOpenChange={(v) => {
                setOpen(v);
                if (v) refreshRecent();
              }}
              recent={recent}
              onPick={async (id) => {
                await setActiveReport(id);
                setOpen(false);
                toast.success("Track set as active coaching session");
              }}
              triggerLabel="Pick recent"
            />
          </div>
        </div>
      </Card>
    );
  }

  const issues = issueCount(active);
  return (
    <Card className={cn("studio-card-gold p-4 mb-6", className)}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-gradient-gold flex items-center justify-center shrink-0">
            <Music2 className="w-4 h-4 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              🎵 Coaching about
            </div>
            <div className="text-sm font-semibold text-foreground truncate max-w-[280px]">
              {active.file_name}
            </div>
            <div className="flex gap-2 mt-1 flex-wrap">
              <Badge variant="secondary" className="text-[10px]">
                Key · {active.detected_key ?? "—"}
              </Badge>
              <Badge variant="secondary" className="text-[10px]">
                BPM · {active.bpm ?? "—"}
              </Badge>
              <Badge variant="secondary" className="text-[10px]">
                LUFS · {active.lufs_estimate?.toFixed(1) ?? "—"}
              </Badge>
              <Badge variant="secondary" className="text-[10px]">
                Peak · {active.peak_db?.toFixed(1) ?? "—"} dB
              </Badge>
              <Badge variant="secondary" className="text-[10px]">
                DR · {active.dynamic_range_db?.toFixed(1) ?? "—"}
              </Badge>
              <Badge variant={issues > 0 ? "destructive" : "secondary"} className="text-[10px]">
                {issues} issue{issues === 1 ? "" : "s"}
              </Badge>
            </div>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <TrackPickerDialog
            open={open}
            onOpenChange={(v) => {
              setOpen(v);
              if (v) refreshRecent();
            }}
            recent={recent}
            onPick={async (id) => {
              await setActiveReport(id);
              setOpen(false);
              toast.success("Active track switched");
            }}
            currentId={active.id}
            triggerLabel="Change track"
            triggerIcon={<Repeat className="w-3 h-3" />}
          />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="ghost">
                <X className="w-3 h-3 mr-1" /> Clear
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear active coaching session?</AlertDialogTitle>
                <AlertDialogDescription>
                  Sensei will stop using <span className="font-semibold">{active.file_name}</span> as
                  context across Chat, Mixing, Mastering, Quick Fix, Problems and Genre. The
                  analysis report itself stays in your history — you can re-activate it from
                  Analysis History at any time.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={async () => {
                    await clearActive();
                    toast("Active track cleared — chat returned to general mode");
                  }}
                >
                  Clear session
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </Card>
  );
};

const TrackPickerDialog = ({
  open,
  onOpenChange,
  recent,
  onPick,
  currentId,
  triggerLabel,
  triggerIcon,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  recent: TrackReport[];
  onPick: (id: string) => void | Promise<void>;
  currentId?: string;
  triggerLabel: string;
  triggerIcon?: React.ReactNode;
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          {triggerIcon}
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Choose a track session</DialogTitle>
          <DialogDescription>
            Sensei will use the selected analysis on every page until you change or clear it.
          </DialogDescription>
        </DialogHeader>
        {recent.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-8">
            No analyses yet. Upload a track on /upload to get started.
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto scrollbar-thin space-y-2">
            {recent.map((r) => {
              const issues = issueCount(r);
              const isActive = r.id === currentId;
              return (
                <button
                  key={r.id}
                  onClick={() => onPick(r.id)}
                  className={cn(
                    "w-full text-left rounded-lg border p-3 hover:border-primary/50 hover:bg-primary/5 transition-all",
                    isActive ? "border-primary/60 bg-primary/10" : "border-border",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate">{r.file_name}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {new Date(r.created_at).toLocaleString()}
                      </div>
                    </div>
                    {isActive && (
                      <Badge variant="secondary" className="text-[10px]">
                        Active
                      </Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-4 gap-2 mt-2 text-[11px] text-muted-foreground">
                    <div>Key · {r.detected_key ?? "—"}</div>
                    <div>BPM · {r.bpm ?? "—"}</div>
                    <div>Dur · {r.duration_sec ? `${r.duration_sec.toFixed(0)}s` : "—"}</div>
                    <div>{issues} issue{issues === 1 ? "" : "s"}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
