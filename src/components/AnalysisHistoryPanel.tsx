import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { History, Check, Trash2, MessageCircle, Music2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useTrackSession, type TrackReport } from "@/context/TrackSessionContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function issueCount(r: TrackReport) {
  return Array.isArray(r.detected_issues) ? r.detected_issues.length : 0;
}

export const AnalysisHistoryPanel = ({ className }: { className?: string }) => {
  const { recent, active, setActiveReport, clearActive, refreshRecent, loading } = useTrackSession();
  const [busyId, setBusyId] = useState<string | null>(null);
  const navigate = useNavigate();

  return (
    <Card className={cn("studio-card p-5 mb-8", className)}>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-primary" />
          <h2 className="font-display text-lg font-bold">Analysis History</h2>
          <Badge variant="secondary" className="text-[10px]">
            {recent.length} {recent.length === 1 ? "analysis" : "analyses"}
          </Badge>
        </div>
        <Button size="sm" variant="ghost" onClick={() => refreshRecent()}>
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
      ) : recent.length === 0 ? (
        <div className="py-8 text-center">
          <Music2 className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-3">
            No analyses yet. Upload a track to start building your history.
          </p>
          <Button size="sm" variant="outline" onClick={() => navigate("/upload")}>
            Upload audio
          </Button>
        </div>
      ) : (
        <div className="space-y-2 max-h-[420px] overflow-y-auto scrollbar-thin pr-1">
          {recent.map((r) => {
            const issues = issueCount(r);
            const isActive = active?.id === r.id;
            return (
              <div
                key={r.id}
                className={cn(
                  "rounded-lg border p-3 flex items-start justify-between gap-3 flex-wrap",
                  isActive ? "border-primary/60 bg-primary/5" : "border-border",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm truncate">{r.file_name}</span>
                    {isActive && (
                      <Badge variant="secondary" className="text-[10px]">
                        <Check className="w-3 h-3 mr-1" /> Active
                      </Badge>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {new Date(r.created_at).toLocaleString()}
                  </div>
                  <div className="flex gap-2 mt-1.5 flex-wrap text-[11px] text-muted-foreground">
                    <span>Key · {r.detected_key ?? "—"}</span>
                    <span>BPM · {r.bpm ?? "—"}</span>
                    <span>Dur · {r.duration_sec ? `${r.duration_sec.toFixed(0)}s` : "—"}</span>
                    <span>LUFS · {r.lufs_estimate?.toFixed(1) ?? "—"}</span>
                    <span className={issues > 0 ? "text-destructive" : ""}>
                      {issues} issue{issues === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  {isActive ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate("/chat")}
                    >
                      <MessageCircle className="w-3 h-3 mr-1" /> Open chat
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === r.id}
                      onClick={async () => {
                        setBusyId(r.id);
                        await setActiveReport(r.id);
                        setBusyId(null);
                        toast.success(`Sensei is now coaching about ${r.file_name}`);
                      }}
                    >
                      Set active
                    </Button>
                  )}
                  {isActive && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Remove this track from the active coaching session. The analysis report itself is kept."
                        >
                          <Trash2 className="w-3 h-3 mr-1" /> Remove reference
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove active track reference?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Sensei will stop coaching about{" "}
                            <span className="font-semibold">{r.file_name}</span> and return to
                            general mode. The analysis report itself stays in your history and can
                            be reactivated anytime.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={async () => {
                              await clearActive();
                              toast("Active track reference removed");
                            }}
                          >
                            Remove reference
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};
