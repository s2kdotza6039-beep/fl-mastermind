import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { History, Check, Trash2, MessageCircle, Music2, UploadCloud, Eye, Keyboard } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useTrackSession, type TrackReport } from "@/context/TrackSessionContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function issueCount(r: TrackReport) {
  return Array.isArray(r.detected_issues) ? r.detected_issues.length : 0;
}

const ANCHOR_ID = "analysis-history-panel";

// Ignore shortcuts while user is typing in an editable element.
function isTypingTarget(t: EventTarget | null) {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (t.isContentEditable) return true;
  return false;
}

export const AnalysisHistoryPanel = ({ className }: { className?: string }) => {
  const { recent, active, setActiveReport, clearActive, refreshRecent, loading } = useTrackSession();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmActivate, setConfirmActivate] = useState<TrackReport | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const sectionRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const navigate = useNavigate();

  // Keep highlight inside bounds when list changes.
  useEffect(() => {
    if (recent.length === 0) {
      setHighlightIdx(0);
      return;
    }
    setHighlightIdx((i) => Math.min(i, recent.length - 1));
  }, [recent.length]);

  // Global shortcuts: `h` jump to panel, ArrowUp/Down move highlight, Enter activate.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      if (e.key === "h" || e.key === "H") {
        e.preventDefault();
        sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        sectionRef.current?.focus({ preventScroll: true });
        toast("Analysis History — ↑/↓ to move, Enter to activate");
        return;
      }
      // Only handle nav when the panel is on screen and focused/within
      const sec = sectionRef.current;
      if (!sec) return;
      const within = sec.contains(document.activeElement) || document.activeElement === sec;
      if (!within) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIdx((i) => Math.min(recent.length - 1, i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIdx((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        const row = recent[highlightIdx];
        if (!row) return;
        if (active?.id === row.id) {
          toast(`Already coaching about ${row.file_name}`);
          return;
        }
        e.preventDefault();
        setConfirmActivate(row);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [recent, highlightIdx, active]);

  // Scroll highlighted row into view inside the scroll container.
  useEffect(() => {
    rowRefs.current[highlightIdx]?.scrollIntoView({ block: "nearest" });
  }, [highlightIdx]);

  return (
    <Card
      ref={sectionRef as any}
      id={ANCHOR_ID}
      tabIndex={-1}
      className={cn("studio-card p-5 mb-8 outline-none focus-visible:ring-2 focus-visible:ring-primary/40", className)}
    >
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-primary" />
          <h2 className="font-display text-lg font-bold">Analysis History</h2>
          {!loading && (
            <Badge variant="secondary" className="text-[10px]">
              {recent.length} {recent.length === 1 ? "analysis" : "analyses"}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <Keyboard className="w-3 h-3" /> press <kbd className="px-1 rounded bg-muted">H</kbd> · ↑/↓ · <kbd className="px-1 rounded bg-muted">Enter</kbd>
          </span>
          <Button size="sm" variant="ghost" onClick={() => refreshRecent()} disabled={loading}>
            Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2" aria-label="Loading analysis history">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                  <div className="flex gap-2 pt-1">
                    <Skeleton className="h-3 w-12" />
                    <Skeleton className="h-3 w-12" />
                    <Skeleton className="h-3 w-14" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Skeleton className="h-8 w-20" />
                  <Skeleton className="h-8 w-28" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : recent.length === 0 ? (
        <div className="py-10 text-center border border-dashed border-border rounded-lg">
          <div className="w-12 h-12 rounded-2xl bg-muted mx-auto mb-3 flex items-center justify-center">
            <Music2 className="w-6 h-6 text-muted-foreground/60" />
          </div>
          <h3 className="font-semibold text-sm mb-1">No analyses yet</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto mb-4">
            Upload a track on the Upload page and Sensei will analyze it, save the report, and
            keep it available here for cross-surface coaching.
          </p>
          <Button size="sm" variant="outline" onClick={() => navigate("/upload")}>
            <UploadCloud className="w-3 h-3 mr-1" /> Upload audio
          </Button>
        </div>
      ) : (
        <div className="space-y-2 max-h-[420px] overflow-y-auto scrollbar-thin pr-1">
          {recent.map((r, idx) => {
            const issues = issueCount(r);
            const isActive = active?.id === r.id;
            const isHighlighted = idx === highlightIdx;
            return (
              <div
                key={r.id}
                ref={(el) => (rowRefs.current[idx] = el)}
                role="button"
                tabIndex={0}
                onMouseEnter={() => setHighlightIdx(idx)}
                onClick={() => setHighlightIdx(idx)}
                className={cn(
                  "rounded-lg border p-3 flex items-start justify-between gap-3 flex-wrap transition-colors",
                  isActive ? "border-primary/60 bg-primary/5" : "border-border",
                  isHighlighted && !isActive && "ring-1 ring-primary/40",
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
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate("/chat");
                      }}
                      title="Open Chat — Sensei already has this track loaded as context"
                    >
                      <Eye className="w-3 h-3 mr-1" /> View details
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === r.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmActivate(r);
                      }}
                    >
                      Set active
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!isActive}
                    title={
                      isActive
                        ? "Remove this track from the active coaching session"
                        : "Only the currently active session can be removed"
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isActive) {
                        toast.info(
                          active
                            ? `This row isn't active. Currently coaching about "${active.file_name}". Set this row active first if you want to remove its reference.`
                            : "No active session — nothing to remove.",
                        );
                        return;
                      }
                      setConfirmRemove(true);
                    }}
                  >
                    <Trash2 className="w-3 h-3 mr-1" /> Remove reference
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Activate confirm */}
      <AlertDialog open={!!confirmActivate} onOpenChange={(o) => !o && setConfirmActivate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Switch active coaching session?</AlertDialogTitle>
            <AlertDialogDescription>
              {active ? (
                <>
                  Sensei will stop coaching about{" "}
                  <span className="font-semibold">{active.file_name}</span> and switch to{" "}
                  <span className="font-semibold">{confirmActivate?.file_name}</span> across every
                  page (Chat, Mixing, Mastering, Quick Fix, Problems, Genre).
                </>
              ) : (
                <>
                  Sensei will use{" "}
                  <span className="font-semibold">{confirmActivate?.file_name}</span> as the active
                  track on every page until you change or clear it.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const target = confirmActivate;
                setConfirmActivate(null);
                if (!target) return;
                setBusyId(target.id);
                await setActiveReport(target.id);
                setBusyId(null);
                toast.success(`Sensei is now coaching about ${target.file_name}`);
              }}
            >
              <MessageCircle className="w-3 h-3 mr-1" /> Switch active track
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove reference confirm */}
      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove active track reference?</AlertDialogTitle>
            <AlertDialogDescription>
              Sensei will stop coaching about{" "}
              <span className="font-semibold">{active?.file_name}</span> and return to general
              mode. The analysis report itself stays in your history and can be reactivated anytime.
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
    </Card>
  );
};
