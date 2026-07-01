// Session-scoped rate-limit store. Persists the *deadline* (absolute epoch ms)
// so a countdown remains consistent across tab reloads and route changes.
// No sensitive data — just surface + deadline + friendly message.

export type RateLimitSurface =
  | "signin"
  | "signup"
  | "password_reset"
  | "email_confirm";

interface RateLimitEntry {
  deadlineMs: number;
  message: string;
}

const STORAGE_KEY = "auth-rate-limit-v1";

function readAll(): Record<string, RateLimitEntry> {
  if (typeof sessionStorage === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, RateLimitEntry>): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* quota / privacy mode — best effort */
  }
}

/** Get remaining seconds + message for a surface, or null if expired/absent. */
export function getRateLimit(surface: RateLimitSurface): { retryAfterSec: number; message: string } | null {
  const all = readAll();
  const entry = all[surface];
  if (!entry) return null;
  const remainingMs = entry.deadlineMs - Date.now();
  if (remainingMs <= 0) {
    delete all[surface];
    writeAll(all);
    return null;
  }
  return { retryAfterSec: Math.ceil(remainingMs / 1000), message: entry.message };
}

/** Store a rate limit for `surface` that expires `retryAfterSec` seconds from now. */
export function setRateLimit(surface: RateLimitSurface, retryAfterSec: number, message: string): void {
  const all = readAll();
  all[surface] = {
    deadlineMs: Date.now() + Math.max(0, Math.floor(retryAfterSec)) * 1000,
    message,
  };
  writeAll(all);
}

export function clearRateLimit(surface: RateLimitSurface): void {
  const all = readAll();
  if (surface in all) {
    delete all[surface];
    writeAll(all);
  }
}
