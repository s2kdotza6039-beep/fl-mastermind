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
import { Crown, Loader2, Eye, EyeOff, AlertTriangle, CheckCircle2, XCircle, Mail } from "lucide-react";
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


const OAUTH_GOOGLE_ENABLED = true; // Google provider configured in cloud auth settings (decision D11)

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
          <div className="flex items-center gap-3 mt-1">
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="underline hover:opacity-80"
            >
              {refreshing ? "Re-checking…" : "Re-check provider status"}
            </button>
            <Link to="/oauth-check" className="underline hover:opacity-80">
              Open diagnostic
            </Link>
          </div>
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
      dismissRateLimit();
      toast.success("Welcome back");
    }
  }

  async function reset() {
    const ev = emailSchema.safeParse(email);
    if (!ev.success) return toast.error("Enter your email first");
    const { error } = await supabase.auth.resetPasswordForEmail(ev.data, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) await handleAuthFailure(error, "password_reset", friendlyPasswordResetError(error));
    else toast.success("Reset link sent — check your inbox");
  }


  async function google() {
    setOauthError(null);
    await runProbe();
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        const msg = `${result.error.message || "Google sign-in failed"} — pop-ups or the redirect may be blocked by your browser. Allow pop-ups for this site and try again.`;
        setOauthError(msg);
        toast.error(msg);
      }
    } catch (e: any) {
      const msg = `${e?.message || "Google sign-in failed"} — pop-ups or the redirect may be blocked by your browser. Allow pop-ups for this site and try again.`;
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
          onRetry={dismissRateLimit}
          onDismiss={dismissRateLimit}
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

      {OAUTH_GOOGLE_ENABLED && (
        <Button type="button" variant="outline" className="w-full" onClick={google}>Continue with Google</Button>
      )}
      <button type="button" onClick={reset} className="text-xs text-muted-foreground hover:text-primary underline w-full text-center">
        Forgot password?
      </button>
      <GoogleDiagnostics
        oauthError={oauthError}
        status={providerStatus}
        refreshing={probing}
        onRefresh={runProbe}
      />
      <details className="pt-2">
        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-primary text-center">
          Didn't get the confirmation email?
        </summary>
        <div className="mt-3">
          <ResendConfirmationForm />
        </div>
      </details>
    </form>
  );
}

function SignUpForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [alreadyExists, setAlreadyExists] = useState(false);

  const [busy, setBusy] = useState(false);
  const [rateLimit, setRateLimit] = useState<{ retryAfterSec: number; message: string } | null>(
    () => getRateLimit("signup"),
  );

  useEffect(() => {
    const hydrated = getRateLimit("signup");
    if (hydrated) setRateLimit(hydrated);
  }, []);

  const dismissRateLimit = () => {
    clearRateLimit("signup");
    setRateLimit(null);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const ev = emailSchema.safeParse(email);
    if (!ev.success) return toast.error(ev.error.issues[0].message);
    const pv = passwordSchema.safeParse(password);
    if (!pv.success) return toast.error(pv.error.issues[0].message);
    const nv = displayNameSchema.safeParse(name || undefined);
    if (!nv.success) return toast.error("Invalid display name");
    setBusy(true);

    setAlreadyExists(false);

    const { data, error } = await supabase.auth.signUp({
      email: ev.data,
      password: pv.data,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          display_name: nv.data || ev.data.split("@")[0],
        },
      },
    });
    setBusy(false);
    if (error) {
      const friendly = friendlySignupError(error);
      if (/already registered|already exists|user already/i.test(error.message || "")) {
        setAlreadyExists(true);
      }
      if (isRateLimited(error)) {
        const retryAfterSec = parseRetryAfterSec(error);
        persistRateLimit("signup", retryAfterSec, friendly);
        setRateLimit({ retryAfterSec, message: friendly });
        logAuthRateEvent("signup_rate_limited", { retryAfterSec, surface: "signup" });
      } else if (isCaptchaFailure(error)) {
        logAuthRateEvent("signup_captcha_failed", { surface: "signup" });
        toast.error(friendly);
      } else {
        toast.error(friendly);
      }
    } else {
      dismissRateLimit();
      if (data.session) {
        toast.success("Welcome to the studio");
      } else {
        setSentTo(ev.data);
      }
    }
  }

  async function resendVerification() {
    if (!sentTo) return;
    setResending(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: sentTo,
      options: { emailRedirectTo: window.location.origin },
    });
    setResending(false);
    if (error) toast.error(friendlySignupError(error));
    else toast.success("Verification email sent again — check your inbox and spam.");
  }

  if (sentTo) {
    return (
      <div className="space-y-4 text-center">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
          <Mail className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h2 className="font-display text-lg font-bold text-foreground">Check your inbox</h2>
          <p className="text-sm text-muted-foreground mt-1">
            We sent a verification link to <span className="text-foreground font-medium">{sentTo}</span>.
            Click it to activate your studio. Check spam if it isn't there in a minute.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={resendVerification}
          disabled={resending}
        >
          {resending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Resend verification email
        </Button>
        <button
          type="button"
          onClick={() => {
            setSentTo(null);
            setPassword("");
          }}
          className="text-xs text-muted-foreground hover:text-primary underline"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {rateLimit && (
        <RateLimitNotice
          retryAfterSec={rateLimit.retryAfterSec}
          message={rateLimit.message}
          onRetry={dismissRateLimit}
          onDismiss={dismissRateLimit}
        />
      )}
      {alreadyExists && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-200">
          That email already has an account. Switch to the <span className="font-semibold">Sign In</span> tab to sign in
          instead, or use “Forgot password?” there.
        </div>
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
      <Button type="submit" className="w-full bg-gradient-gold text-primary-foreground" disabled={busy || !!rateLimit}>
        {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Create account
      </Button>
    </form>
  );
}
