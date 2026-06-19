import { useEffect, useState } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RateLimitNoticeProps {
  retryAfterSec: number;
  onRetry: () => void;
  onDismiss?: () => void;
  /** Optional friendly message override. */
  message?: string;
}

/**
 * Shows a 429 rate-limit notice with a live countdown and a Retry button that
 * enables only once the wait has elapsed.
 */
export function RateLimitNotice({ retryAfterSec, onRetry, onDismiss, message }: RateLimitNoticeProps) {
  const [remaining, setRemaining] = useState(Math.max(0, Math.floor(retryAfterSec)));

  useEffect(() => {
    setRemaining(Math.max(0, Math.floor(retryAfterSec)));
  }, [retryAfterSec]);

  useEffect(() => {
    if (remaining <= 0) return;
    const t = setInterval(() => setRemaining((r) => (r > 0 ? r - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [remaining]);

  const ready = remaining <= 0;

  return (
    <div
      role="alert"
      aria-live="polite"
      className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm flex items-start gap-2"
    >
      <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-amber-200">Rate limit reached</div>
        <p className="text-xs text-amber-100/80 mt-0.5">
          {message ?? "Sensei is catching their breath — you've hit the per-minute limit."}
        </p>
        <div className="flex items-center gap-2 mt-2">
          <Button
            size="sm"
            variant="outline"
            onClick={onRetry}
            disabled={!ready}
            aria-label={ready ? "Retry now" : `Retry available in ${remaining} seconds`}
          >
            <RotateCw className="w-3.5 h-3.5 mr-1" />
            {ready ? "Retry now" : `Retry in ${remaining}s`}
          </Button>
          {onDismiss && (
            <Button size="sm" variant="ghost" onClick={onDismiss}>Dismiss</Button>
          )}
        </div>
      </div>
    </div>
  );
}
