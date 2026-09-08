import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Crown, Check, Loader2, ShieldCheck, CreditCard, ArrowRight, X, AlertCircle,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { openPaddleOverlay, openPendingCheckoutFromUrl } from "@/lib/paddle";
import { PRICING } from "@/lib/beta-config";
import { toast } from "sonner";

type PayState = "idle" | "verifying" | "success" | "timeout";

export default function UpgradePage() {
  const { user, isPaid, refreshRoles } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returning = Boolean(
    searchParams.get("reference") ||
    searchParams.get("trxref") ||
    searchParams.get("checkout_id") ||
    searchParams.get("subscription_id"),
  );

  const [payState, setPayState] = useState<PayState>(returning ? "verifying" : "idle");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const attemptsRef = useRef(0);

  // If we landed on a Paddle payment link (?_ptxn=…), auto-open the checkout
  // overlay for that transaction. Needs VITE_PADDLE_CLIENT_TOKEN to be set.
  useEffect(() => {
    void openPendingCheckoutFromUrl({
      onCompleted: () => {
        setPayState("verifying");
        void refreshRoles();
      },
    });
  }, [refreshRoles]);

  // After Paddle redirects back, poll for the "paid" role until it lands.
  useEffect(() => {
    if (payState !== "verifying") return;
    if (isPaid) {
      setPayState("success");
      return;
    }
    const t = window.setInterval(() => {
      attemptsRef.current += 1;
      void refreshRoles();
      if (attemptsRef.current >= 12) setPayState("timeout");
    }, 3000);
    return () => window.clearInterval(t);
  }, [payState, isPaid, refreshRoles]);

  const subscribe = useCallback(async () => {
    if (!user) {
      navigate("/auth", { state: { from: "/upgrade" } });
      return;
    }
    if (busy) return;
    setBusy(true);
    setErrorMsg("");
    try {
      const { data, error } = await supabase.functions.invoke("paddle-subscribe", {
        body: { callback_url: `${window.location.origin}/upgrade` },
      });
      if (error) {
        setErrorMsg("Could not reach the checkout. Please try again.");
        toast.error("Could not reach the checkout. Please try again.");
        return;
      }
      if (data?.already_subscribed) {
        await refreshRoles();
        return;
      }
      if (!data?.checkout_url && !data?.transaction_id) {
        setErrorMsg(data?.error ?? "Checkout could not be started. Please try again.");
        return;
      }

      // Prefer the on-page overlay (needs VITE_PADDLE_CLIENT_TOKEN); fall back
      // to Paddle's hosted checkout page when the token isn't configured yet.
      const opened = await openPaddleOverlay({
        transactionId: data.transaction_id as string | undefined,
        email: user?.email,
        onCompleted: () => {
          setPayState("verifying");
          void refreshRoles();
        },
      });
      if (!opened) {
        window.location.href = data.checkout_url as string;
      }
    } catch (e) {
      const msg = (e as Error)?.message || "Checkout could not be started. Please try again.";
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }, [user, busy, refreshRoles, navigate]);

  // ---- Success / already a member ----
  if (payState === "success" || (isPaid && payState === "idle")) {
    return (
      <div className="container max-w-3xl py-10 px-4 md:px-8">
        <PageHeader
          eyebrow="Member"
          title="You're a paid member"
          description="Full access is unlocked. Welcome to the studio floor."
          icon={<Crown className="w-6 h-6" />}
        />
        <Card className="studio-card-gold p-8">
          <div className="flex items-center gap-3 mb-4">
            <Badge className="bg-gradient-gold text-primary-foreground border-0">Paid · Active</Badge>
            <span className="text-sm text-muted-foreground">{PRICING.monthlyLabel}{PRICING.cadence}</span>
          </div>
          <ul className="space-y-2 text-sm">
            {PRICING.benefits.map((b) => (
              <li key={b} className="flex items-start gap-2">
                <Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button asChild className="bg-gradient-gold text-primary-foreground hover:opacity-90">
              <Link to="/chains">Open Plugin Chain Builder <ArrowRight className="w-4 h-4" /></Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/dashboard">Back to Dashboard</Link>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-6 leading-relaxed">
            To cancel, contact the studio or cancel in Paddle — access
            remains active until the end of the current billing period.
          </p>
        </Card>
      </div>
    );
  }

  // ---- Verifying after redirect ----
  if (payState === "verifying") {
    return (
      <div className="container max-w-3xl py-16 px-4 md:px-8 text-center">
        <Card className="studio-card p-10">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
          <h2 className="font-display text-xl font-bold mb-2">Confirming your payment…</h2>
          <p className="text-sm text-muted-foreground">
            This usually takes a few seconds. Don't close this tab.
          </p>
        </Card>
      </div>
    );
  }

  // ---- Pricing ----
  return (
    <div className="container max-w-4xl py-10 px-4 md:px-8">
      <PageHeader
        eyebrow="Upgrade"
        title="Your first 3 questions are free"
        description="Then unlock the full studio for $10/month. Cancel anytime."
        icon={<Crown className="w-6 h-6" />}
      />

      {payState === "timeout" && (
        <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
          <span>
            Your payment may still be processing. If you completed it, access activates within a few
            minutes — refresh this page. If nothing happens, contact the studio.
          </span>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-[1fr_360px] items-start">
        {/* Free vs paid comparison */}
        <Card className="p-6">
          <h3 className="font-display text-base font-bold mb-4">Free vs Paid</h3>
          <div className="space-y-1.5 text-sm">
            {PRICING.freeTier.map((f) => (
              <div key={f} className="flex items-start gap-2 text-muted-foreground">
                <X className="w-4 h-4 text-muted-foreground/60 mt-0.5 flex-shrink-0" />
                <span>{f}</span>
              </div>
            ))}
          </div>
          <div className="h-px bg-border my-4" />
          <div className="space-y-1.5 text-sm">
            {PRICING.benefits.map((b) => (
              <div key={b} className="flex items-start gap-2">
                <Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <span>{b}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Price card */}
        <Card className="studio-card-gold p-7">
          <div className="flex items-center gap-2 mb-1">
            <Badge className="bg-gradient-gold text-primary-foreground border-0">Everything unlocked</Badge>
          </div>
          <div className="flex items-baseline gap-1 mt-3">
            <span className="font-display text-4xl font-bold text-gold">{PRICING.monthlyLabel}</span>
            <span className="text-muted-foreground text-sm">{PRICING.cadence}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Billed monthly in {PRICING.currency} via Paddle. First 3 questions free.</p>

          <Button
            className="w-full mt-5 bg-gradient-gold text-primary-foreground hover:opacity-90"
            size="lg"
            onClick={subscribe}
            disabled={busy}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CreditCard className="w-4 h-4 mr-2" />}
            Subscribe with card
          </Button>

          {errorMsg && (
            <p className="text-xs text-destructive mt-3 flex items-start gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> {errorMsg}
            </p>
          )}

          <div className="mt-5 space-y-1.5 text-xs text-muted-foreground">
            <p className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-primary" /> Secure card payment handled by Paddle
            </p>
            <p className="flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-primary" /> Instant access on successful payment
            </p>
            <p className="flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-primary" /> Cancel anytime — access runs to period end
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
