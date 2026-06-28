// Lightweight telemetry for rate-limit and captcha failures on auth flows.
// Intentionally records NO sensitive content (no email, password, IP, user agent,
// tokens, or upstream error bodies). Just an event kind + a coarse counter so we
// can spot trends and validate the UI messaging.

import { supabase } from "@/integrations/supabase/client";

export type AuthRateEventKind =
  | "signin_rate_limited"
  | "signup_rate_limited"
  | "password_reset_rate_limited"
  | "email_confirm_rate_limited"
  | "signin_captcha_failed"
  | "signup_captcha_failed"
  | "password_reset_captcha_failed"
  | "email_confirm_captcha_failed";

const SESSION_KEY = "auth-rate-events-v1";

interface BumpResult {
  kindCount: number;
  totalCount: number;
}

function bumpSessionCounter(kind: AuthRateEventKind): BumpResult {
  if (typeof sessionStorage === "undefined") return { kindCount: 1, totalCount: 1 };
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    const obj: Record<string, number> = raw ? JSON.parse(raw) : {};
    obj[kind] = (obj[kind] || 0) + 1;
    obj.__total = (obj.__total || 0) + 1;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(obj));
    return { kindCount: obj[kind], totalCount: obj.__total };
  } catch {
    return { kindCount: 1, totalCount: 1 };
  }
}

export function readSessionAuthRateCounters(): Record<string, number> {
  if (typeof sessionStorage === "undefined") return {};
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "{}");
  } catch {
    return {};
  }
}

/**
 * Log a rate-limit / captcha failure. Best-effort: writes to console (always)
 * and to `security_alerts` (only when authenticated and policy allows). Never
 * throws — auth flows must not fail because telemetry failed.
 */
export async function logAuthRateEvent(
  kind: AuthRateEventKind,
  meta: { retryAfterSec?: number; surface?: string } = {},
): Promise<void> {
  const counters = bumpSessionCounter(kind);
  const payload = {
    kind,
    retry_after_sec: meta.retryAfterSec,
    surface: meta.surface,
    session_kind_count: counters.kindCount,
    session_total_count: counters.totalCount,
    ts: new Date().toISOString(),
  };

  // Always emit a structured console log so ops / analytics pipelines can pick it up.
  // eslint-disable-next-line no-console
  console.info("[auth-telemetry]", payload);

  // Best-effort server-side log. Only attempt when there's a session so we don't
  // spam the table with anonymous noise that the policy will reject anyway.
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user?.id) return;
    await supabase.from("security_alerts").insert({
      severity: "low",
      alert_type: kind,
      message: `auth ${kind.replace(/_/g, " ")}`,
      metadata: {
        surface: meta.surface ?? null,
        retry_after_sec: meta.retryAfterSec ?? null,
        session_kind_count: counters.kindCount,
      },
    });
  } catch {
    /* swallow — telemetry must never break auth */
  }
}
