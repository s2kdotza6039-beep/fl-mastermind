#!/usr/bin/env node
/**
 * CI script: verify Google OAuth is correctly configured on the deployed
 * Lovable Cloud (Supabase) project. Mirrors the checks shown on /oauth-check.
 *
 * Exit codes:
 *   0 → all checks passed
 *   1 → at least one hard failure (CI should block)
 *   2 → soft warnings only (CI may continue)
 *
 * Required env (read from process.env, with VITE_ fallbacks so it works
 * locally with the same .env the app uses):
 *   SUPABASE_URL              (or VITE_SUPABASE_URL)
 *   SUPABASE_PUBLISHABLE_KEY  (or VITE_SUPABASE_PUBLISHABLE_KEY)
 *
 * Optional:
 *   APP_ORIGIN                origin to use as redirect_to (default: https://localhost)
 *
 * Usage:
 *   node scripts/check-google-oauth.mjs
 *   npm run check:oauth
 */

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const ANON_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY;
const APP_ORIGIN = process.env.APP_ORIGIN || "https://localhost";

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

const results = [];
function record(state, label, detail, hint) {
  results.push({ state, label, detail, hint });
  const icon =
    state === "pass" ? `${GREEN}✓${RESET}` :
    state === "warn" ? `${YELLOW}⚠${RESET}` :
    `${RED}✗${RESET}`;
  console.log(`${icon} ${BOLD}${label}${RESET}`);
  if (detail) console.log(`  ${DIM}${detail}${RESET}`);
  if (hint) console.log(`  ${YELLOW}→ ${hint}${RESET}`);
}

async function main() {
  console.log(`${BOLD}Google OAuth configuration check${RESET}`);
  console.log(`${DIM}Target: ${SUPABASE_URL || "(none)"}${RESET}\n`);

  // 1. Env vars present
  if (!SUPABASE_URL || !ANON_KEY) {
    record(
      "fail",
      "Env vars present",
      `SUPABASE_URL=${SUPABASE_URL ? "set" : "MISSING"}, SUPABASE_PUBLISHABLE_KEY=${ANON_KEY ? "set" : "MISSING"}`,
      "Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (or VITE_ equivalents) before running."
    );
    return finish();
  }
  record("pass", "Env vars present", `${SUPABASE_URL}`);

  // 2. Auth settings reachable + provider enabled
  let settings = null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: ANON_KEY },
    });
    if (!res.ok) {
      record("fail", "Reach auth settings endpoint", `HTTP ${res.status}`);
    } else {
      settings = await res.json();
      record("pass", "Reach auth settings endpoint", "/auth/v1/settings 200");
    }
  } catch (e) {
    record("fail", "Reach auth settings endpoint", e.message);
  }

  if (settings) {
    if (settings.external?.google) {
      record("pass", "Google provider enabled", "external.google = true");
    } else {
      record(
        "fail",
        "Google provider enabled",
        "external.google = false",
        "Enable Google in Cloud → Users → Auth Settings → Sign In Methods."
      );
    }
  }

  // 3. Authorize endpoint actually returns a Google redirect
  try {
    const url = `${SUPABASE_URL}/auth/v1/authorize?provider=google&skip_http_redirect=true&redirect_to=${encodeURIComponent(APP_ORIGIN)}`;
    const res = await fetch(url, { headers: { apikey: ANON_KEY } });
    let body = null;
    try { body = await res.json(); } catch { /* non-json */ }

    if (res.ok && body?.url && /accounts\.google\.com/i.test(body.url)) {
      record(
        "pass",
        "Authorize endpoint returns Google redirect",
        body.url.slice(0, 120) + (body.url.length > 120 ? "…" : "")
      );
    } else if (res.ok && body?.url) {
      record(
        "warn",
        "Authorize endpoint returns Google redirect",
        `Got URL but not a Google one: ${body.url.slice(0, 120)}`
      );
    } else {
      const msg =
        body?.error_description || body?.msg || body?.error || `HTTP ${res.status}`;
      const hint = /not enabled|unsupported provider/i.test(msg)
        ? "Provider not enabled — re-run social auth setup in Cloud."
        : /missing oauth secret|client_id/i.test(msg)
        ? "Google client ID/secret missing — set them in Cloud auth settings or use Lovable's managed credentials."
        : undefined;
      record("fail", "Authorize endpoint returns Google redirect", msg, hint);
    }
  } catch (e) {
    record("fail", "Authorize endpoint returns Google redirect", e.message);
  }

  finish();
}

function finish() {
  const failed = results.filter((r) => r.state === "fail").length;
  const warned = results.filter((r) => r.state === "warn").length;
  const passed = results.filter((r) => r.state === "pass").length;

  console.log(
    `\n${BOLD}Summary:${RESET} ${GREEN}${passed} passed${RESET}, ${YELLOW}${warned} warnings${RESET}, ${RED}${failed} failed${RESET}`
  );

  if (failed > 0) {
    console.log(`${RED}${BOLD}✗ Google OAuth is NOT correctly configured.${RESET}`);
    process.exit(1);
  }
  if (warned > 0) {
    console.log(`${YELLOW}${BOLD}⚠ Google OAuth works but has warnings.${RESET}`);
    process.exit(2);
  }
  console.log(`${GREEN}${BOLD}✓ Google OAuth is correctly configured.${RESET}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(`${RED}Unexpected error:${RESET}`, e);
  process.exit(1);
});
