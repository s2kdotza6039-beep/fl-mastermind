import { useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Crown, Loader2, Eye, EyeOff, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import {
  friendlySignupError,
  friendlySignInError,
  friendlyPasswordResetError,
  isRateLimited,
  isCaptchaFailure,
  parseRetryAfterSec,
} from "@/lib/friendly-errors";
import { logAuthRateEvent } from "@/lib/auth-telemetry";
import { RateLimitNotice } from "@/components/RateLimitNotice";
import { ResendConfirmationForm } from "@/components/ResendConfirmationForm";
import { getRateLimit, setRateLimit as persistRateLimit, clearRateLimit } from "@/lib/rate-limit-store";


type ProviderStatus = {
  google: "enabled" | "disabled" | "unknown";
  checkedAt: string;
  rawError?: string;
};

async function probeGoogleProvider(): Promise<ProviderStatus> {
  // Hit the GoTrue /authorize endpoint with skip_http_redirect to inspect provider status
  // without actually redirecting the browser.
  try {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/auth/v1/authorize?provider=google&skip_http_redirect=true`;
    const res = await fetch(url, {
      headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
    });
    if (res.ok) return { google: "enabled", checkedAt: new Date().toLocaleTimeString() };
    let body: any = null;
    try { body = await res.json(); } catch {}
    const msg = body?.error_description || body?.msg || body?.error || `HTTP ${res.status}`;
    if (/not enabled|unsupported provider/i.test(msg)) {
      return { google: "disabled", checkedAt: new Date().toLocaleTimeString(), rawError: msg };
    }
    return { google: "unknown", checkedAt: new Date().toLocaleTimeString(), rawError: msg };
  } catch (e: any) {
    return { google: "unknown", checkedAt: new Date().toLocaleTimeString(), rawError: e?.message || String(e) };
  }
}

function GoogleDiagnostics({
  oauthError,
  status,
  refreshing,
  onRefresh,
}: {
  oauthError: string | null;
  status: ProviderStatus | null;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  if (!oauthError && !status) return null;

  const ok = status?.google === "enabled" && !oauthError;
  const Icon = ok ? CheckCircle2 : status?.google === "disabled" || oauthError ? XCircle : AlertTriangle;
  const tone = ok
    ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-200"
    : status?.google === "disabled" || oauthError
    ? "border-destructive/50 bg-destructive/10 text-destructive-foreground"
    : "border-amber-500/40 bg-amber-500/5 text-amber-200";

  return (
    <div className={`mt-4 rounded-md border p-3 text-xs space-y-2 ${tone}`}>
      <div className="flex items-start gap-2">
        <Icon className="w-4 h-4 mt-0.5 shrink-0" />
        <div className="flex-1 space-y-1">
          <p className="font-semibold">Google sign-in diagnostics</p>
          {oauthError && (
            <p>
              <span className="font-medium">Last OAuth error:</span> {oauthError}
            </p>
          )}
          {status && (
            <ul className="space-y-0.5">
              <li>
                <span className="font-medium">Provider status:</span>{" "}
                {status.google === "enabled" && "✅ Google provider is enabled"}
                {status.google === "disabled" && "❌ Google provider is NOT enabled in Cloud auth"}
                {status.google === "unknown" && "⚠️ Could not determine provider status"}
              </li>
              {status.rawError && (
                <li className="break-all">
                  <span className="font-medium">Server says:</span> {status.rawError}
                </li>
              )}
              <li className="opacity-70">
                <span className="font-medium">Redirect URI sent:</span> {window.location.origin}
              </li>
              <li className="opacity-70">
                <span className="font-medium">Auth endpoint:</span>{" "}
                {import.meta.env.VITE_SUPABASE_URL}/auth/v1/authorize
              </li>
              <li className="opacity-70">
                <span className="font-medium">Checked:</span> {status.checkedAt}
              </li>
            </ul>
          )}
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="underline hover:opacity-80 mt-1"
          >
            {refreshing ? "Re-checking…" : "Re-check provider status"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PasswordInput(props: React.ComponentProps<typeof Input>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? "text" : "password"} className="pr-10" />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
        aria-label={show ? "Hide password" : "Show password"}
        tabIndex={-1}
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

const emailSchema = z.string().trim().email("Invalid email").max(255);
const passwordSchema = z
  .string()
  .min(8, "At least 8 characters")
  .max(128, "Too long")
  .regex(/[A-Z]/, "Add an uppercase letter")
  .regex(/[a-z]/, "Add a lowercase letter")
  .regex(/[0-9]/, "Add a number");
const displayNameSchema = z.string().trim().min(1).max(60).optional();

export default function AuthPage() {
  const nav = useNavigate();
  const loc = useLocation();
  const { isAuthed, loading } = useAuth();
  const from = (loc.state as any)?.from || "/";

  useEffect(() => {
    if (!loading && isAuthed) nav(from, { replace: true });
  }, [isAuthed, loading, nav, from]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="studio-card-gold w-full max-w-md p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-lg bg-gradient-gold flex items-center justify-center glow-gold">
            <Crown className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-gold">Studio Sensei</h1>
            <p className="text-xs text-muted-foreground">Sign in to your studio</p>
          </div>
        </div>
        <Tabs defaultValue="signin">
          <TabsList className="grid grid-cols-2 mb-6">
            <TabsTrigger value="signin">Sign In</TabsTrigger>
            <TabsTrigger value="signup">Sign Up</TabsTrigger>
          </TabsList>
          <TabsContent value="signin"><SignInForm /></TabsContent>
          <TabsContent value="signup"><SignUpForm /></TabsContent>
        </Tabs>
        <p className="text-[10px] text-muted-foreground/70 text-center mt-6 leading-relaxed">
          By continuing you accept the{" "}
          <Link to="/terms" className="underline">Terms</Link> and{" "}
          <Link to="/privacy" className="underline">Privacy Policy</Link>.
        </p>
      </Card>
    </div>
  );
}

function SignInForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null);
  const [probing, setProbing] = useState(false);

  // Pick up OAuth errors that came back in the URL (hash or query) after a failed redirect
  useEffect(() => {
    const sources = [window.location.hash.replace(/^#/, ""), window.location.search.replace(/^\?/, "")];
    for (const src of sources) {
      if (!src) continue;
      const params = new URLSearchParams(src);
      const err = params.get("error_description") || params.get("error");
      if (err) {
        setOauthError(decodeURIComponent(err));
        runProbe();
        break;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runProbe() {
    setProbing(true);
    setProviderStatus(await probeGoogleProvider());
    setProbing(false);
  }

  const [rateLimit, setRateLimit] = useState<{ retryAfterSec: number; message: string } | null>(
    () => getRateLimit("signin"),
  );

  useEffect(() => {
    const hydrated = getRateLimit("signin");
    if (hydrated) setRateLimit(hydrated);
  }, []);

  const dismissRateLimit = () => {
    clearRateLimit("signin");
    setRateLimit(null);
  };

  async function handleAuthFailure(
    error: any,
    surface: "signin" | "password_reset",
    friendly: string,
  ) {
    if (isRateLimited(error)) {
      const retryAfterSec = parseRetryAfterSec(error);
      // Persist under the actual surface so the countdown survives reloads.
      persistRateLimit(surface, retryAfterSec, friendly);
      if (surface === "signin") setRateLimit({ retryAfterSec, message: friendly });
      logAuthRateEvent(`${surface === "signin" ? "signin" : "password_reset"}_rate_limited` as any, {
        retryAfterSec,
        surface,
      });
    } else if (isCaptchaFailure(error)) {
      logAuthRateEvent(`${surface === "signin" ? "signin" : "password_reset"}_captcha_failed` as any, { surface });
      toast.error(friendly);
    } else {
      toast.error(friendly);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const ev = emailSchema.safeParse(email);
    if (!ev.success) return toast.error(ev.error.issues[0].message);
    if (!password) return toast.error("Password required");
    setBusy(true);
    setRateLimit(null);
    const { error } = await supabase.auth.signInWithPassword({ email: ev.data, password });
    setBusy(false);
    if (error) {
      await handleAuthFailure(error, "signin", friendlySignInError(error));
      // Only insert a failed_signin alert for non-rate-limit auth failures, to avoid
      // double-logging (rate events are already captured by logAuthRateEvent).
      if (!isRateLimited(error) && !isCaptchaFailure(error)) {
        try {
          await supabase.from("security_alerts").insert({
            severity: "low",
            alert_type: "failed_signin",
            message: `Failed sign-in for ${ev.data}`,
            metadata: { email: ev.data },
          });
        } catch {}
      }
    } else {
      toast.success("Welcome back");
    }
  }

  async function reset() {
    const ev = emailSchema.safeParse(email);
    if (!ev.success) return toast.error("Enter your email first");
    setRateLimit(null);
    const { error } = await supabase.auth.resetPasswordForEmail(ev.data, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) await handleAuthFailure(error, "password_reset", friendlyPasswordResetError(error));
    else toast.success("Reset link sent — check your inbox");
  }


  async function google() {
    setOauthError(null);
    await runProbe();
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      const msg = result.error.message || "Google sign-in failed";
      setOauthError(msg);
      toast.error(msg);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {rateLimit && (
        <RateLimitNotice
          retryAfterSec={rateLimit.retryAfterSec}
          message={rateLimit.message}
          onRetry={() => setRateLimit(null)}
          onDismiss={() => setRateLimit(null)}
        />
      )}
      <div>
        <Label htmlFor="si-email">Email</Label>
        <Input id="si-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={255} autoComplete="email" required />
      </div>
      <div>
        <Label htmlFor="si-pass">Password</Label>
        <PasswordInput id="si-pass" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={128} autoComplete="current-password" required />
      </div>
      <Button type="submit" className="w-full bg-gradient-gold text-primary-foreground" disabled={busy || !!rateLimit}>
        {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Sign in
      </Button>

      <Button type="button" variant="outline" className="w-full" onClick={google}>Continue with Google</Button>
      <button type="button" onClick={reset} className="text-xs text-muted-foreground hover:text-primary underline w-full text-center">
        Forgot password?
      </button>
      <GoogleDiagnostics
        oauthError={oauthError}
        status={providerStatus}
        refreshing={probing}
        onRefresh={runProbe}
      />
    </form>
  );
}

function SignUpForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [rateLimit, setRateLimit] = useState<{ retryAfterSec: number; message: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const ev = emailSchema.safeParse(email);
    if (!ev.success) return toast.error(ev.error.issues[0].message);
    const pv = passwordSchema.safeParse(password);
    if (!pv.success) return toast.error(pv.error.issues[0].message);
    const nv = displayNameSchema.safeParse(name || undefined);
    if (!nv.success) return toast.error("Invalid display name");
    setBusy(true);
    setRateLimit(null);

    // Closed beta: validate invite (email allowlist OR code) before signing up.
    const { data: allowed, error: checkErr } = await supabase.rpc("check_beta_invite", {
      _email: ev.data,
      _code: code.trim() || null,
    });
    if (checkErr) {
      setBusy(false);
      return toast.error("Could not verify invite. Please try again.");
    }
    if (!allowed) {
      setBusy(false);
      return toast.error("Studio Sensei is in closed beta. Your email isn't on the invite list and the code didn't match.");
    }

    const { error } = await supabase.auth.signUp({
      email: ev.data,
      password: pv.data,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          display_name: nv.data || ev.data.split("@")[0],
          invite_code: code.trim() || undefined,
        },
      },
    });
    setBusy(false);
    if (error) {
      const friendly = friendlySignupError(error);
      if (isRateLimited(error)) {
        const retryAfterSec = parseRetryAfterSec(error);
        setRateLimit({ retryAfterSec, message: friendly });
        logAuthRateEvent("signup_rate_limited", { retryAfterSec, surface: "signup" });
      } else if (isCaptchaFailure(error)) {
        logAuthRateEvent("signup_captcha_failed", { surface: "signup" });
        toast.error(friendly);
      } else {
        toast.error(friendly);
      }
    } else {
      toast.success("Account created — check your email to verify.");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {rateLimit && (
        <RateLimitNotice
          retryAfterSec={rateLimit.retryAfterSec}
          message={rateLimit.message}
          onRetry={() => setRateLimit(null)}
          onDismiss={() => setRateLimit(null)}
        />
      )}
      <div>
        <Label htmlFor="su-name">Display name</Label>
        <Input id="su-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
      </div>
      <div>
        <Label htmlFor="su-email">Email</Label>
        <Input id="su-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={255} autoComplete="email" required />
      </div>
      <div>
        <Label htmlFor="su-pass">Password</Label>
        <PasswordInput id="su-pass" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={128} autoComplete="new-password" required />
        <p className="text-[10px] text-muted-foreground mt-1">8+ chars, upper, lower, number. Checked against known breaches.</p>
      </div>
      <div>
        <Label htmlFor="su-code">Invite code <span className="text-muted-foreground/70">(optional if your email is invited)</span></Label>
        <Input id="su-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={32} placeholder="BETA-XXXXXX" autoComplete="off" />
        <p className="text-[10px] text-muted-foreground mt-1">Studio Sensei is in closed beta. Need access? Email <a className="underline" href="mailto:studiosensei@s2kdotza.com">studiosensei@s2kdotza.com</a>.</p>
      </div>
      <Button type="submit" className="w-full bg-gradient-gold text-primary-foreground" disabled={busy || !!rateLimit}>
        {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Create account
      </Button>
    </form>

  );
}
