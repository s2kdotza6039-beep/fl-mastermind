import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, AlertTriangle, Loader2, RefreshCw } from "lucide-react";

type CheckState = "pass" | "fail" | "warn" | "pending";

interface CheckResult {
  id: string;
  label: string;
  state: CheckState;
  detail?: string;
  hint?: string;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

async function checkEnv(): Promise<CheckResult> {
  if (!SUPABASE_URL || !ANON_KEY) {
    return {
      id: "env",
      label: "Frontend env vars present",
      state: "fail",
      detail: "VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY missing",
      hint: "Re-open the project so Lovable Cloud injects fresh env vars.",
    };
  }
  return {
    id: "env",
    label: "Frontend env vars present",
    state: "pass",
    detail: SUPABASE_URL,
  };
}

async function checkAuthSettings(): Promise<{ provider: CheckResult; redirect: CheckResult; raw: any }> {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: ANON_KEY },
    });
    if (!res.ok) {
      const fail: CheckResult = {
        id: "settings",
        label: "Reach Cloud auth settings",
        state: "fail",
        detail: `HTTP ${res.status}`,
      };
      return { provider: fail, redirect: { ...fail, id: "redirect", label: "Site URL configured" }, raw: null };
    }
    const data = await res.json();
    const externalGoogle = data?.external?.google;
    const provider: CheckResult = externalGoogle
      ? {
          id: "provider",
          label: "Google provider enabled in Cloud",
          state: "pass",
          detail: "external.google = true",
        }
      : {
          id: "provider",
          label: "Google provider enabled in Cloud",
          state: "fail",
          detail: "external.google = false",
          hint: "Enable Google in Cloud → Users → Auth Settings → Sign In Methods.",
        };

    const siteUrl: string | undefined = data?.site_url || data?.SITE_URL;
    const origin = window.location.origin;
    const redirect: CheckResult = !siteUrl
      ? {
          id: "redirect",
          label: "Site URL configured",
          state: "warn",
          detail: "Could not read site_url from settings",
        }
      : siteUrl === origin || siteUrl.startsWith(origin)
      ? { id: "redirect", label: "Site URL matches current origin", state: "pass", detail: siteUrl }
      : {
          id: "redirect",
          label: "Site URL matches current origin",
          state: "warn",
          detail: `site_url=${siteUrl} • origin=${origin}`,
          hint: "OAuth still works on preview, but for production add this origin to allowed redirects.",
        };

    return { provider, redirect, raw: data };
  } catch (e: any) {
    const fail: CheckResult = {
      id: "settings",
      label: "Reach Cloud auth settings",
      state: "fail",
      detail: e?.message || String(e),
    };
    return { provider: fail, redirect: { ...fail, id: "redirect", label: "Site URL configured" }, raw: null };
  }
}

async function checkAuthorizeEndpoint(): Promise<CheckResult> {
  try {
    const url = `${SUPABASE_URL}/auth/v1/authorize?provider=google&skip_http_redirect=true&redirect_to=${encodeURIComponent(window.location.origin)}`;
    const res = await fetch(url, { headers: { apikey: ANON_KEY } });
    let body: any = null;
    try { body = await res.json(); } catch {}
    if (res.ok && body?.url) {
      // body.url should point to accounts.google.com — confirms client_id + callback are wired
      const isGoogle = /accounts\.google\.com/i.test(body.url);
      return {
        id: "authorize",
        label: "Authorize endpoint returns Google redirect",
        state: isGoogle ? "pass" : "warn",
        detail: body.url.slice(0, 120) + (body.url.length > 120 ? "…" : ""),
        hint: isGoogle ? undefined : "Endpoint responded but didn't return a Google URL.",
      };
    }
    const msg = body?.error_description || body?.msg || body?.error || `HTTP ${res.status}`;
    return {
      id: "authorize",
      label: "Authorize endpoint returns Google redirect",
      state: "fail",
      detail: msg,
      hint: /not enabled|unsupported provider/i.test(msg)
        ? "Google provider is not enabled — re-run social auth setup."
        : /client_id/i.test(msg)
        ? "Google client ID/secret missing or invalid in Cloud auth settings."
        : undefined,
    };
  } catch (e: any) {
    return {
      id: "authorize",
      label: "Authorize endpoint returns Google redirect",
      state: "fail",
      detail: e?.message || String(e),
    };
  }
}

function StateIcon({ state }: { state: CheckState }) {
  if (state === "pass") return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
  if (state === "fail") return <XCircle className="w-5 h-5 text-destructive" />;
  if (state === "warn") return <AlertTriangle className="w-5 h-5 text-amber-400" />;
  return <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />;
}

export default function OAuthCheckPage() {
  const [checks, setChecks] = useState<CheckResult[]>([]);
  const [running, setRunning] = useState(false);
  const [raw, setRaw] = useState<any>(null);

  async function runAll() {
    setRunning(true);
    setChecks([
      { id: "env", label: "Frontend env vars present", state: "pending" },
      { id: "provider", label: "Google provider enabled in Cloud", state: "pending" },
      { id: "redirect", label: "Site URL matches current origin", state: "pending" },
      { id: "authorize", label: "Authorize endpoint returns Google redirect", state: "pending" },
    ]);
    const env = await checkEnv();
    const { provider, redirect, raw } = await checkAuthSettings();
    const authorize = await checkAuthorizeEndpoint();
    setRaw(raw);
    setChecks([env, provider, redirect, authorize]);
    setRunning(false);
  }

  useEffect(() => {
    runAll();
  }, []);

  const overall = checks.length === 0
    ? "pending"
    : checks.some((c) => c.state === "fail")
    ? "fail"
    : checks.some((c) => c.state === "warn")
    ? "warn"
    : checks.every((c) => c.state === "pass")
    ? "pass"
    : "pending";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-2xl p-6 space-y-5">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-xl font-bold text-gold">Google OAuth Configuration Check</h1>
            <p className="text-xs text-muted-foreground mt-1">
              Verifies env vars, provider status, redirect URL, and the live authorize endpoint.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={runAll} disabled={running}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${running ? "animate-spin" : ""}`} />
            Re-run
          </Button>
        </header>

        <div
          className={`rounded-md border p-3 text-sm ${
            overall === "pass"
              ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-200"
              : overall === "fail"
              ? "border-destructive/50 bg-destructive/10 text-destructive-foreground"
              : overall === "warn"
              ? "border-amber-500/40 bg-amber-500/5 text-amber-200"
              : "border-border bg-muted/20 text-muted-foreground"
          }`}
        >
          {overall === "pass" && "✅ Google OAuth looks correctly configured. Try signing in."}
          {overall === "fail" && "❌ Google OAuth is not configured correctly. See failing checks below."}
          {overall === "warn" && "⚠️ Google OAuth should work, but some settings are not optimal."}
          {overall === "pending" && "Running checks…"}
        </div>

        <ul className="space-y-2">
          {checks.map((c) => (
            <li
              key={c.id}
              className="flex items-start gap-3 rounded-md border border-border/60 bg-muted/10 p-3"
            >
              <StateIcon state={c.state} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{c.label}</p>
                {c.detail && (
                  <p className="text-xs text-muted-foreground break-all mt-0.5">{c.detail}</p>
                )}
                {c.hint && (
                  <p className="text-xs text-amber-300/80 mt-1">→ {c.hint}</p>
                )}
              </div>
            </li>
          ))}
        </ul>

        {raw?.external && (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer hover:text-foreground">Raw provider settings</summary>
            <pre className="mt-2 p-2 rounded bg-muted/30 overflow-x-auto">
{JSON.stringify(raw.external, null, 2)}
            </pre>
          </details>
        )}

        <div className="flex justify-between text-xs">
          <Link to="/auth" className="underline text-muted-foreground hover:text-primary">
            ← Back to sign-in
          </Link>
          <span className="text-muted-foreground">Origin: {window.location.origin}</span>
        </div>
      </Card>
    </div>
  );
}
