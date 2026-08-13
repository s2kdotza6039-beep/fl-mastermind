import { useState } from "react";
import { Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

interface Props {
  reportId: string;
  fileName: string;
  /** Called after a successful delete so the caller can refresh its list. */
  onDeleted?: () => void | Promise<void>;
  size?: "sm" | "icon";
  className?: string;
}

/**
 * R14.3 — permanent, confirmed delete of a single analysis report.
 * Scoped to the signed-in owner (RLS also enforces this server-side).
 */
export const DeleteReportButton = ({
  reportId,
  fileName,
  onDeleted,
  size = "sm",
  className,
}: Props) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    if (!user) {
      toast.error("Sign in to delete analyses");
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("audio_analysis_reports")
      .delete()
      .eq("id", reportId)
      .eq("user_id", user.id);
    setBusy(false);
    if (error) {
      toast.error(error.message || "Could not delete this analysis");
      return;
    }
    setOpen(false);
    toast.success(`Deleted "${fileName}"`);
    await onDeleted?.();
  };

  return (
    <>
      <Button
        size={size}
        variant="ghost"
        className={className}
        disabled={busy}
        title={`Permanently delete the analysis for ${fileName}`}
        aria-label={`Delete analysis ${fileName}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
        {size !== "icon" && <span className="ml-1">Delete</span>}
      </Button>

      <AlertDialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this analysis permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-semibold">{fileName}</span> and its measurements will be
              removed for good. This can't be undone — re-upload the bounce if you need it back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void remove();
              }}
            >
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
