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
 *   APP_ORIGIN                 single origin to use as redirect_to (default: https://localhost)
 *   APP_ORIGINS                comma- or newline-separated list of allowed origins.
 *                              Each is probed against /authorize?redirect_to=<origin>;
 *                              any rejected origin produces a hard failure.
 *   HTTP_TIMEOUT_MS            per-request timeout in ms (default: 10000)
 *   HTTP_MAX_RETRIES           max retry attempts on transient failures (default: 3)
 *   HTTP_BACKOFF_MS            initial backoff in ms, doubles each retry (default: 500)
 *
 * Usage:
 *   node scripts/check-google-oauth.mjs
 *   APP_ORIGINS="https://app.example.com,https://staging.example.com" npm run check:oauth
 */

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const ANON_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY;

const HTTP_TIMEOUT_MS = Number(process.env.HTTP_TIMEOUT_MS) || 10_000;
const HTTP_MAX_RETRIES = Number(process.env.HTTP_MAX_RETRIES) || 3;
const HTTP_BACKOFF_MS = Number(process.env.HTTP_BACKOFF_MS) || 500;

function parseOrigins() {
  const list = (process.env.APP_ORIGINS || process.env.APP_ORIGIN || "https://localhost")
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  // Dedupe while preserving order
  return Array.from(new Set(list));
}
const APP_ORIGINS = parseOrigins();

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch with per-attempt timeout and exponential backoff.
 * Retries on: AbortError (timeout), network errors, HTTP 408/425/429/5xx.
 * Honors `Retry-After` (seconds or HTTP-date) when present.
 * Non-retryable 4xx responses are returned immediately so the caller can
 * surface the precise error to the user.
 */
async function fetchWithRetry(url, init = {}, label = "request") {
  const attempts = HTTP_MAX_RETRIES + 1;
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_MS);
    const start = Date.now();
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      clearTimeout(timer);
      const elapsed = Date.now() - start;
      const retryable = [408, 425, 429].includes(res.status) || res.status >= 500;
      if (!retryable) return { res, attempts: attempt, elapsedMs: elapsed };

      let waitMs = HTTP_BACKOFF_MS * Math.pow(2, attempt - 1);
      const retryAfter = res.headers.get("retry-after");
      if (retryAfter) {
        const asInt = Number(retryAfter);
        if (Number.isFinite(asInt)) waitMs = Math.max(waitMs, asInt * 1000);
        else {
          const dateMs = Date.parse(retryAfter);
          if (!Number.isNaN(dateMs)) waitMs = Math.max(waitMs, dateMs - Date.now());
        }
      }
      lastErr = new Error(`HTTP ${res.status} on ${label} (attempt ${attempt}/${attempts}, ${elapsed}ms)`);
      if (attempt === attempts) return { res, attempts: attempt, elapsedMs: elapsed };
      console.log(`${DIM}  ↻ ${label}: HTTP ${res.status}, retrying in ${Math.round(waitMs)}ms${RESET}`);
      await sleep(waitMs);
    } catch (e) {
      clearTimeout(timer);
      const elapsed = Date.now() - start;
      const isTimeout = e?.name === "AbortError";
      const reason = isTimeout
        ? `timed out after ${HTTP_TIMEOUT_MS}ms`
        : `network error: ${e?.message || e}`;
      lastErr = new Error(`${label} ${reason} (attempt ${attempt}/${attempts}, ${elapsed}ms)`);
      if (attempt === attempts) throw lastErr;
      const waitMs = HTTP_BACKOFF_MS * Math.pow(2, attempt - 1);
      console.log(`${DIM}  ↻ ${label}: ${reason}, retrying in ${waitMs}ms${RESET}`);
      await sleep(waitMs);
    }
  }
  throw lastErr || new Error(`${label} failed`);
}

/**
 * Validate the Google authorize URL returned by GoTrue:
 *   - `redirect_uri` (where Google sends the user back) MUST be
 *     `<SUPABASE_URL>/auth/v1/callback` exactly.
 *   - `redirect_to` (in `state` or as a query param) SHOULD echo the
 *     requested app origin so users land back on the right environment.
 */
function validateCallback(googleUrl, origin) {
  let parsed;
  try {
    parsed = new URL(googleUrl);
  } catch {
    record("fail", `Callback URL parseable (${origin})`, `Could not parse: ${googleUrl.slice(0, 120)}`);
    return;
  }

  const expectedCallback = `${SUPABASE_URL.replace(/\/$/, "")}/auth/v1/callback`;
  const actualCallback = parsed.searchParams.get("redirect_uri");

  if (!actualCallback) {
    record(
      "fail",
      `Supabase callback present (${origin})`,
      "Google authorize URL has no redirect_uri parameter",
      "GoTrue should always set redirect_uri=<SUPABASE_URL>/auth/v1/callback. Re-check provider configuration."
    );
  } else if (actualCallback !== expectedCallback) {
    record(
      "fail",
      `Supabase callback matches /auth/v1/callback (${origin})`,
      `expected ${expectedCallback}, got ${actualCallback}`,
      `Add "${expectedCallback}" to your Google OAuth client's Authorized redirect URIs and ensure SUPABASE_URL matches the project that owns the Google credentials.`
    );
  } else {
    record("pass", `Supabase callback matches /auth/v1/callback (${origin})`, actualCallback);
  }

  // `redirect_to` is normally encoded inside `state` (opaque) but GoTrue also
  // forwards it as a top-level param on some configs. Best-effort check.
  const stateParam = parsed.searchParams.get("state") || "";
  const echoesOrigin =
    parsed.searchParams.get("redirect_to") === origin ||
    stateParam.includes(encodeURIComponent(origin)) ||
    stateParam.includes(origin);

  if (echoesOrigin) {
    record("pass", `Authorize URL preserves redirect_to (${origin})`, "found in state/redirect_to");
  } else {
    record(
      "warn",
      `Authorize URL preserves redirect_to (${origin})`,
      "could not confirm origin is round-tripped via state (state may be opaque/encrypted)",
      "If sign-in lands on the wrong environment, double-check Cloud → Auth → URL Configuration."
    );
  }
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
    return await finish();
  }
  record("pass", "Env vars present", `${SUPABASE_URL}`);

  // 2. Auth settings reachable + provider enabled
  let settings = null;
  try {
    const { res, attempts, elapsedMs } = await fetchWithRetry(
      `${SUPABASE_URL}/auth/v1/settings`,
      { headers: { apikey: ANON_KEY } },
      "GET /auth/v1/settings"
    );
    if (!res.ok) {
      record(
        "fail",
        "Reach auth settings endpoint",
        `HTTP ${res.status} after ${attempts} attempt(s) in ${elapsedMs}ms`
      );
    } else {
      settings = await res.json();
      record(
        "pass",
        "Reach auth settings endpoint",
        `/auth/v1/settings 200 (${attempts} attempt${attempts > 1 ? "s" : ""}, ${elapsedMs}ms)`
      );
    }
  } catch (e) {
    record(
      "fail",
      "Reach auth settings endpoint",
      e.message,
      "Network or timeout — check your runner's connectivity to the Cloud project URL."
    );
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

  // 3. Authorize endpoint actually returns a Google redirect — per allowed origin
  console.log(`\n${DIM}Probing ${APP_ORIGINS.length} allowed origin(s)…${RESET}`);
  for (const origin of APP_ORIGINS) {
    const label = `Authorize allows redirect_to=${origin}`;
    try {
      const url = `${SUPABASE_URL}/auth/v1/authorize?provider=google&skip_http_redirect=true&redirect_to=${encodeURIComponent(origin)}`;
      const { res, attempts, elapsedMs } = await fetchWithRetry(
        url,
        { headers: { apikey: ANON_KEY } },
        `GET /authorize (${origin})`
      );
      let body = null;
      try { body = await res.json(); } catch { /* non-json */ }
      const tail = ` (${attempts} attempt${attempts > 1 ? "s" : ""}, ${elapsedMs}ms)`;

      if (res.ok && body?.url && /accounts\.google\.com/i.test(body.url)) {
        const preview = body.url.slice(0, 120) + (body.url.length > 120 ? "…" : "");
        record("pass", label, preview + tail);
        validateCallback(body.url, origin);
      } else if (res.ok && body?.url) {
        record("warn", label, `Got non-Google URL: ${body.url.slice(0, 120)}` + tail);
      } else {
        const msg =
          body?.error_description || body?.msg || body?.error || `HTTP ${res.status}`;
        // Origin-allowlist rejections from GoTrue look like:
        //   "redirect_to URL is not allowed" / "Invalid redirect URL"
        const isAllowlist =
          /redirect.*url.*not.*allowed|invalid.*redirect|not.*in.*allow.*list/i.test(msg);
        const hint = isAllowlist
          ? `Add "${origin}" to Cloud → Auth Settings → URL Configuration → Redirect URLs (and to your Google OAuth client's Authorized JavaScript origins).`
          : /missing oauth secret|client_id|client_secret/i.test(msg)
          ? "Google client ID/secret missing — set them in Cloud auth settings or enable Lovable's managed credentials."
          : /not enabled|unsupported provider/i.test(msg)
          ? "Provider not enabled — re-run social auth setup in Cloud."
          : res.status >= 500
          ? "Auth server error after retries — likely a transient outage; re-run later."
          : undefined;
        record("fail", label, msg + tail, hint);
      }
    } catch (e) {
      record(
        "fail",
        label,
        e.message,
        "Network or timeout — check runner connectivity to the Cloud project URL."
      );
    }
  }

  await finish();
}

async function finish() {
  const failed = results.filter((r) => r.state === "fail").length;
  const warned = results.filter((r) => r.state === "warn").length;
  const passed = results.filter((r) => r.state === "pass").length;

  console.log(
    `\n${BOLD}Summary:${RESET} ${GREEN}${passed} passed${RESET}, ${YELLOW}${warned} warnings${RESET}, ${RED}${failed} failed${RESET}`
  );

  const exitCode = failed > 0 ? 1 : warned > 0 ? 2 : 0;
  const overall = exitCode === 0 ? "pass" : exitCode === 1 ? "fail" : "warn";

  if (exitCode === 1) console.log(`${RED}${BOLD}✗ Google OAuth is NOT correctly configured.${RESET}`);
  else if (exitCode === 2) console.log(`${YELLOW}${BOLD}⚠ Google OAuth works but has warnings.${RESET}`);
  else console.log(`${GREEN}${BOLD}✓ Google OAuth is correctly configured.${RESET}`);

  // Optional JSON report — written when OUTPUT_JSON is set (CI artifact).
  const outPath = process.env.OUTPUT_JSON;
  if (outPath) {
    const report = {
      overall,
      exitCode,
      counts: { passed, warned, failed, total: results.length },
      target: SUPABASE_URL || null,
      appOrigins: APP_ORIGINS,
      ranAt: new Date().toISOString(),
      env: {
        SUPABASE_URL: !!SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY: !!ANON_KEY,
        APP_ORIGIN: !!process.env.APP_ORIGIN,
        APP_ORIGINS: !!process.env.APP_ORIGINS,
      },
      ci: {
        repository: process.env.GITHUB_REPOSITORY || null,
        ref: process.env.GITHUB_REF_NAME || null,
        sha: process.env.GITHUB_SHA || null,
        runId: process.env.GITHUB_RUN_ID || null,
      },
      results,
    };
    try {
      const fs = await import("node:fs");
      const path = await import("node:path");
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
      console.log(`\n${DIM}JSON report written to ${outPath}${RESET}`);
    } catch (e) {
      console.error(`${RED}Failed to write JSON report:${RESET}`, e.message);
    }
  }

  process.exit(exitCode);
}

main().catch((e) => {
  console.error(`${RED}Unexpected error:${RESET}`, e);
  process.exit(1);
});
