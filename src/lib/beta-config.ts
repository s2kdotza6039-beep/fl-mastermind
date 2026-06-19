// Beta program configuration. Kept in one place so policy pages, admin
// checklists and code paths can reference the same numbers.

export const BETA_CONFIG = {
  /** Retention window for soft-deleted audio reports before permanent purge. */
  deletedAudioRetentionDays: 7,
  /** Public rate-limit thresholds we publish to users (per minute). */
  rateLimits: {
    chat: { free: 20, paid: 60, admin: 200 },
    keyDetect: { free: 6, paid: 30, admin: 100 },
  },
  /** Email used for the seeded initial admin account. */
  seedAdminEmail: "studiosensei@s2kdotza.com",
} as const;

/** Friendly user message for 429s — usable anywhere we hit a limited endpoint. */
export function friendlyRateLimitMessage(retryAfterSec?: number) {
  const wait = retryAfterSec && retryAfterSec > 0 ? ` Try again in ${retryAfterSec}s.` : "";
  return `Sensei is catching their breath — you've hit the per-minute limit.${wait}`;
}
