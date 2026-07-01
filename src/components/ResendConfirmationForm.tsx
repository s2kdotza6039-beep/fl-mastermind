import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import {
  friendlyEmailConfirmError,
  isRateLimited,
  isCaptchaFailure,
  parseRetryAfterSec,
} from "@/lib/friendly-errors";
import { logAuthRateEvent } from "@/lib/auth-telemetry";
import { RateLimitNotice } from "@/components/RateLimitNotice";
import { getRateLimit, setRateLimit, clearRateLimit } from "@/lib/rate-limit-store";

const emailSchema = z.string().trim().email("Enter a valid email");

/**
 * Small self-contained form to resend the account confirmation email.
 * Applies the same 429 countdown + captcha guidance as sign-in/sign-up.
 */
export function ResendConfirmationForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [rateLimit, setRateLimitState] = useState<{ retryAfterSec: number; message: string } | null>(
    () => getRateLimit("email_confirm"),
  );

  // Re-hydrate from sessionStorage on mount (route changes / reload).
  useEffect(() => {
    const hydrated = getRateLimit("email_confirm");
    if (hydrated) setRateLimitState(hydrated);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const ev = emailSchema.safeParse(email);
    if (!ev.success) return toast.error(ev.error.issues[0].message);
    setBusy(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: ev.data,
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);

    if (error) {
      const friendly = friendlyEmailConfirmError(error);
      if (isRateLimited(error)) {
        const retryAfterSec = parseRetryAfterSec(error);
        setRateLimit("email_confirm", retryAfterSec, friendly);
        setRateLimitState({ retryAfterSec, message: friendly });
        logAuthRateEvent("email_confirm_rate_limited", { retryAfterSec, surface: "email_confirm" });
      } else if (isCaptchaFailure(error)) {
        logAuthRateEvent("email_confirm_captcha_failed", { surface: "email_confirm" });
        toast.error(friendly);
      } else {
        toast.error(friendly);
      }
    } else {
      toast.success("Confirmation email sent — check your inbox.");
    }
  }

  function dismiss() {
    clearRateLimit("email_confirm");
    setRateLimitState(null);
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {rateLimit && (
        <RateLimitNotice
          retryAfterSec={rateLimit.retryAfterSec}
          message={rateLimit.message}
          onRetry={dismiss}
          onDismiss={dismiss}
        />
      )}
      <div>
        <Label htmlFor="resend-email">Email</Label>
        <Input
          id="resend-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          maxLength={255}
          autoComplete="email"
          required
        />
      </div>
      <Button type="submit" variant="outline" className="w-full" disabled={busy || !!rateLimit}>
        {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        Resend confirmation email
      </Button>
    </form>
  );
}
