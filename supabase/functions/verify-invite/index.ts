// verify-invite — closed-beta invite gate for signup.
// Never reveals which factor (email allowlist vs code) matched; returns
// { allowed: boolean } either way.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// In-memory sliding-window rate limit: 10 requests/min per IP.
const RATE_MAX = 10;
const RATE_WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

function rateCheck(ip: string): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_MAX) {
    const retryAfter = Math.max(1, Math.ceil((RATE_WINDOW_MS - (now - arr[0])) / 1000));
    hits.set(ip, arr);
    return { ok: false, retryAfter };
  }
  arr.push(now);
  hits.set(ip, arr);
  return { ok: true, retryAfter: 0 };
}

function json(status: number, body: unknown, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extra },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const gate = rateCheck(ip);
  if (!gate.ok) return json(429, { error: "rate_limited" }, { "Retry-After": String(gate.retryAfter) });

  let body: { email?: string; code?: string } = {};
  try { body = await req.json(); } catch { /* ignore */ }

  const rawEmail = typeof body.email === "string" ? body.email : "";
  const rawCode = typeof body.code === "string" ? body.code : "";

  const email = rawEmail.trim().toLowerCase().replace(/[%_]/g, "").slice(0, 254);
  const code = rawCode.trim().slice(0, 100);

  const emailValid = email.length > 0 && EMAIL_RE.test(email);
  const codeValid = code.length > 0;

  if (!emailValid && !codeValid) return json(200, { allowed: false });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    let allowed = false;
    const nowIso = new Date().toISOString();

    if (emailValid) {
      const { data, error } = await supabase
        .from("beta_invites")
        .select("id")
        .is("used_at", null)
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
        .ilike("email", email)
        .limit(1);
      if (error) return json(500, { error: "verification_unavailable" });
      if (data && data.length > 0) allowed = true;
    }

    if (!allowed && codeValid) {
      const { data, error } = await supabase
        .from("beta_invites")
        .select("id")
        .is("used_at", null)
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
        .eq("code", code)
        .limit(1);
      if (error) return json(500, { error: "verification_unavailable" });
      if (data && data.length > 0) allowed = true;
    }

    return json(200, { allowed });
  } catch {
    return json(500, { error: "verification_unavailable" });
  }
});
