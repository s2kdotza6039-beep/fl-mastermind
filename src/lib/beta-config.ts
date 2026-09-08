// Beta program configuration. Kept in one place so policy pages, admin
// checklists and code paths can reference the same numbers.

export const BETA_CONFIG = {
  /** Retention window for soft-deleted audio reports before permanent purge. */
  deletedAudioRetentionDays: 7,
  /** Public rate-limit thresholds we publish to users (per minute). Match edge-function constants. */
  rateLimits: {
    chat: { free: 12, paid: 60, admin: 200 },
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

/**
 * Paid membership pricing. Kept in one place so the upgrade page, paywall
 * cards and docs all quote the same numbers. The Paddle price ID lives
 * server-side (PADDLE_PRICE_ID secret) — never in the client.
 */
export const PRICING = {
  currency: "USD",
  monthlyUsd: 10,
  monthlyLabel: "$10",
  cadence: "/month",
  headline: "Studio Sensei Pro",
  /** Free plan: lifetime Sensei questions before upgrading. Keep in sync with
   *  FREE_QUESTION_LIMIT in supabase/functions/sensei-chat/index.ts. */
  freeQuestions: 3,
  benefits: [
    "Unlimited Sensei chat with priority queue",
    "Advanced plugin chains — Trap, Amapiano, Drill, R&B, Afrobeat, Gospel",
    "Full mixing & mastering coaches with exact settings",
    "Unlimited key detection & upload analysis",
    "Watermarked PDF/TXT exports of Sensei advice",
    "Release paperwork — ISRC, loudness targets, PDF/CSV export",
  ],
  freeTier: [
    "3 free questions to Sensei",
    "Production coach only",
    "Basic key detection",
    "No PDF/CSV exports",
  ],
} as const;

