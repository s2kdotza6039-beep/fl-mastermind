// Sanitized telemetry for rate-limit and captcha failures on auth flows.
// Records ONLY: event kind, surface tag, retry-after seconds, session counter.
// Deliberately no email, password, IP, user agent, tokens, or raw upstream text.

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
 * Log a rate-limit / captcha failure to the backend telemetry table
 * (`public.auth_rate_events`) plus a structured console line for local dev.
 * Best-effort — never throws.
 */
export async function logAuthRateEvent(
  kind: AuthRateEventKind,
  meta: { retryAfterSec?: number; surface?: string } = {},
): Promise<void> {
  const counters = bumpSessionCounter(kind);
  const payload = {
    kind,
    surface: meta.surface ?? null,
    retry_after_sec: typeof meta.retryAfterSec === "number" ? Math.min(3600, Math.max(0, Math.floor(meta.retryAfterSec))) : null,
    session_kind_count: counters.kindCount,
  };

  // eslint-disable-next-line no-console
  console.info("[auth-telemetry]", { ...payload, ts: new Date().toISOString() });

  // Backend write (RLS allows anon + authenticated inserts of sanitized rows only).
  try {
    await supabase.from("auth_rate_events").insert(payload);
  } catch {
    /* swallow — telemetry must never break auth */
  }
}
