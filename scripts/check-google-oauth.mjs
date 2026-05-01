#!/usr/bin/env node
import { createHash, randomBytes } from "node:crypto";
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
 *   TOKEN_HTTP_TIMEOUT_MS      per-request timeout for token-endpoint probes
 *                              (default: HTTP_TIMEOUT_MS)
 *   TOKEN_HTTP_MAX_RETRIES     max retries for token-endpoint probes only
 *                              (default: max(HTTP_MAX_RETRIES, 4))
 *   TOKEN_HTTP_BACKOFF_MS      initial backoff for token-endpoint probes
 *                              (default: max(HTTP_BACKOFF_MS, 750))
 *   TOKEN_HTTP_BACKOFF_FACTOR  exponential factor for token retries (default: 2)
 *   TOKEN_HTTP_BACKOFF_MAX_MS  cap on any single backoff wait (default: 15000)
 *   TOKEN_HTTP_JITTER_MS       +/- random jitter ms per wait (default: 250) —
 *                              spreads retries across CI shards to avoid
 *                              synchronized rate-limit hits
 *   EXPECTED_CLIENT_ID         if set, every authorize URL must use this Google client_id
 *   EXPECTED_SCOPES            comma/space-separated scopes that MUST appear (default: "openid email profile")
 *   EXPECTED_RESPONSE_TYPE     required response_type (default: "code")
 *   EXPECTED_CALLBACK_PATH     callback path appended to each origin (default: "/auth/v1/callback")
 *   APP_CALLBACKS              per-origin overrides as "<origin>=<full-callback-url>",
 *                              comma- or newline-separated. When EXPECTED_CALLBACK_PATH
 *                              or APP_CALLBACKS is set, the expected redirect_uri is
 *                              derived from the APP_ORIGIN instead of SUPABASE_URL.
 *   E2E_CHECK                  "true" to run an opt-in end-to-end redirect
 *                              simulation (authorize → /callback with a
 *                              synthetic error) and assert GoTrue redirects
 *                              the user back to each APP_ORIGIN.
 *   E2E_MAX_REDIRECTS          max redirects to follow per origin (default: 5)
 *   PKCE_NEGATIVE_TESTS        "true" to additionally probe with omitted /
 *                              "plain" PKCE and assert the validator fails
 *                              with the expected error messages.
 *   TOKEN_EXCHANGE_CHECK       "false" to skip the token-endpoint shape probes
 *                              (default: enabled). Runs the global PKCE-shape
 *                              + header-sensitivity battery AND the per-origin
 *                              malformed-PKCE probe suite (missing /
 *                              short / long / wrong-charset code_verifier).
 *   TOKEN_ENDPOINT_PATH        Override the GoTrue token endpoint path
 *                              (default: "/auth/v1/token"). Useful for
 *                              self-hosted or proxied GoTrue deployments.
 *   E2E_LOGIN_FLOW             "true" to run an explicit login-flow trace:
 *                              captures the real `state` GoTrue mints, replays
 *                              the callback, and asserts redirect_to round-trips
 *                              to each APP_ORIGIN with the same state echoed back.
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

/**
 * Path of the GoTrue token-exchange endpoint, relative to SUPABASE_URL.
 * Override via TOKEN_ENDPOINT_PATH for non-default GoTrue mounts
 * (e.g. self-hosted "/gotrue/v1/token" or proxied "/api/auth/v1/token").
 * Leading slash is enforced; trailing slashes are stripped.
 */
const TOKEN_ENDPOINT_PATH = (() => {
  const raw = (process.env.TOKEN_ENDPOINT_PATH || "/auth/v1/token").trim();
  const withLead = raw.startsWith("/") ? raw : `/${raw}`;
  return withLead.replace(/\/+$/, "");
})();
const TOKEN_ENDPOINT_URL = `${(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "")}${TOKEN_ENDPOINT_PATH}`;

const HTTP_TIMEOUT_MS = Number(process.env.HTTP_TIMEOUT_MS) || 10_000;
const HTTP_MAX_RETRIES = Number(process.env.HTTP_MAX_RETRIES) || 3;
const HTTP_BACKOFF_MS = Number(process.env.HTTP_BACKOFF_MS) || 500;

/**
 * Token-endpoint-specific retry/backoff overrides.
 *
 * The /auth/v1/token probes are the most flake-prone in CI: they hit a
 * rate-limited GoTrue endpoint, often through a shared egress IP, and
 * transient 5xx / 429 / connection-reset errors should not fail the
 * pipeline. These envs let operators tune the probe budget without
 * affecting the rest of the script's HTTP behaviour.
 *
 *   TOKEN_HTTP_TIMEOUT_MS       per-request timeout (default: HTTP_TIMEOUT_MS)
 *   TOKEN_HTTP_MAX_RETRIES      max retry attempts  (default: max(HTTP_MAX_RETRIES, 4))
 *   TOKEN_HTTP_BACKOFF_MS       initial backoff ms  (default: max(HTTP_BACKOFF_MS, 750))
 *   TOKEN_HTTP_BACKOFF_FACTOR   exponential factor  (default: 2)
 *   TOKEN_HTTP_BACKOFF_MAX_MS   cap for any single backoff wait (default: 15000)
 *   TOKEN_HTTP_JITTER_MS        +/- random jitter ms applied to each wait (default: 250)
 */
const TOKEN_HTTP_TIMEOUT_MS =
  Number(process.env.TOKEN_HTTP_TIMEOUT_MS) || HTTP_TIMEOUT_MS;
const TOKEN_HTTP_MAX_RETRIES = (() => {
  const raw = Number(process.env.TOKEN_HTTP_MAX_RETRIES);
  if (Number.isFinite(raw) && raw >= 0) return raw;
  return Math.max(HTTP_MAX_RETRIES, 4);
})();
const TOKEN_HTTP_BACKOFF_MS = (() => {
  const raw = Number(process.env.TOKEN_HTTP_BACKOFF_MS);
  if (Number.isFinite(raw) && raw >= 0) return raw;
  return Math.max(HTTP_BACKOFF_MS, 750);
})();
const TOKEN_HTTP_BACKOFF_FACTOR =
  Number(process.env.TOKEN_HTTP_BACKOFF_FACTOR) || 2;
const TOKEN_HTTP_BACKOFF_MAX_MS =
  Number(process.env.TOKEN_HTTP_BACKOFF_MAX_MS) || 15_000;
const TOKEN_HTTP_JITTER_MS = (() => {
  const raw = Number(process.env.TOKEN_HTTP_JITTER_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : 250;
})();

/**
 * Bundle of overrides passed to fetchWithRetry for any /auth/v1/token call.
 * Kept as a single object so future probe sites stay in sync automatically.
 */
const TOKEN_RETRY_OPTS = Object.freeze({
  timeoutMs: TOKEN_HTTP_TIMEOUT_MS,
  maxRetries: TOKEN_HTTP_MAX_RETRIES,
  backoffMs: TOKEN_HTTP_BACKOFF_MS,
  backoffFactor: TOKEN_HTTP_BACKOFF_FACTOR,
  backoffMaxMs: TOKEN_HTTP_BACKOFF_MAX_MS,
  jitterMs: TOKEN_HTTP_JITTER_MS,
});

function parseOrigins() {
  const list = (process.env.APP_ORIGINS || process.env.APP_ORIGIN || "https://localhost")
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  // Dedupe while preserving order
  return Array.from(new Set(list));
}
const APP_ORIGINS = parseOrigins();

/**
 * Lightweight CLI argv parser. Supports:
 *
 *   --export-remediation=<origin>        Export one origin's remediation hints
 *                                        + relevant env/config to a JSON file.
 *                                        Use "all" to export every origin
 *                                        in APP_ORIGINS into a directory.
 *   --export-remediation-out=<path>      Output destination.
 *                                        - For a single origin: a file path
 *                                          (default: ./oauth-remediation-<origin-slug>.json)
 *                                        - For "all": a directory path
 *                                          (default: ./oauth-remediation/)
 *   --help, -h                           Print CLI help and exit 0.
 *
 * Unrecognized flags are reported and ignored (we don't fail-hard on argv
 * to keep the diagnostic suite usable when run from CI wrappers that may
 * forward extra args).
 */
function parseCliArgs(argv) {
  const out = { exportRemediation: null, exportOut: null, help: false, unknown: [] };
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") { out.help = true; continue; }
    const eq = arg.indexOf("=");
    if (arg.startsWith("--export-remediation=")) {
      out.exportRemediation = arg.slice(eq + 1).trim() || null;
    } else if (arg === "--export-remediation-all") {
      out.exportRemediation = "all";
    } else if (arg.startsWith("--export-remediation-out=")) {
      out.exportOut = arg.slice(eq + 1).trim() || null;
    } else if (arg.startsWith("--")) {
      out.unknown.push(arg);
    }
  }
  return Object.freeze(out);
}
const CLI = parseCliArgs(process.argv.slice(2));

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

const results = [];
/**
 * Per-origin normalized snapshot accumulated by the validators.
 * Shape: {
 *   [origin]: {
 *     authorizeUrl, redirectUri, expectedRedirectUri, redirectUriMatches,
 *     responseType, expectedResponseType, responseTypeMatches,
 *     scopes: string[], expectedScopes, missingScopes,
 *     clientId, expectedClientId, clientIdMatches,
 *     pkce: { sentChallenge, gotChallenge, method, challengeMatches, methodIsS256 },
 *     state: { raw, length, decoder, decodedRedirectTo, originMatches },
 *     mismatches: string[]   // human-readable list for triage
 *   }
 * }
 */
const originSummaries = {};
function originSummary(origin) {
  if (!originSummaries[origin]) {
    originSummaries[origin] = { origin, mismatches: [] };
  }
  return originSummaries[origin];
}
function noteMismatch(origin, msg) {
  originSummary(origin).mismatches.push(msg);
}

// When non-null, record() appends here instead of `results` and stays silent.
// Used by the negative-test pass to grade the validator without polluting CI output.
let captureBuffer = null;
async function withCapture(fn) {
  const buf = [];
  captureBuffer = buf;
  try { const value = await fn(); return { value, buf }; }
  finally { captureBuffer = null; }
}

function record(state, label, detail, hint, meta) {
  const entry = { state, label, detail, hint, ...(meta ? { meta } : {}) };
  if (captureBuffer) {
    captureBuffer.push(entry);
    return;
  }
  results.push(entry);
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
async function fetchWithRetry(url, init = {}, label = "request", opts = {}) {
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : HTTP_TIMEOUT_MS;
  const maxRetries = Number.isFinite(opts.maxRetries) ? opts.maxRetries : HTTP_MAX_RETRIES;
  const backoffMs = Number.isFinite(opts.backoffMs) ? opts.backoffMs : HTTP_BACKOFF_MS;
  const backoffFactor = Number.isFinite(opts.backoffFactor) ? opts.backoffFactor : 2;
  const backoffMaxMs = Number.isFinite(opts.backoffMaxMs) ? opts.backoffMaxMs : Infinity;
  const jitterMs = Number.isFinite(opts.jitterMs) ? opts.jitterMs : 0;
  const computeWait = (attempt) => {
    const base = backoffMs * Math.pow(backoffFactor, attempt - 1);
    const jitter = jitterMs ? (Math.random() * 2 - 1) * jitterMs : 0;
    return Math.min(backoffMaxMs, Math.max(0, base + jitter));
  };

  const attempts = maxRetries + 1;
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const start = Date.now();
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      clearTimeout(timer);
      const elapsed = Date.now() - start;
      const retryable = [408, 425, 429].includes(res.status) || res.status >= 500;
      if (!retryable) return { res, attempts: attempt, elapsedMs: elapsed };

      let waitMs = computeWait(attempt);
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
        ? `timed out after ${timeoutMs}ms`
        : `network error: ${e?.message || e}`;
      lastErr = new Error(`${label} ${reason} (attempt ${attempt}/${attempts}, ${elapsed}ms)`);
      if (attempt === attempts) throw lastErr;
      const waitMs = computeWait(attempt);
      console.log(`${DIM}  ↻ ${label}: ${reason}, retrying in ${Math.round(waitMs)}ms${RESET}`);
      await sleep(waitMs);
    }
  }
  throw lastErr || new Error(`${label} failed`);
}

/**
 * Generate a PKCE code_verifier + S256 code_challenge per RFC 7636.
 * verifier: 43–128 chars URL-safe; challenge: BASE64URL(SHA256(verifier)).
 */
function s256Challenge(verifier) {
  // RFC 7636 §4.2: code_challenge = BASE64URL-ENCODE(SHA256(ASCII(verifier)))
  // Node's "base64url" digest is unpadded and uses the URL-safe alphabet,
  // matching the spec exactly — do NOT swap to plain "base64" + manual fixup.
  return createHash("sha256").update(verifier, "ascii").digest("base64url");
}

function generatePkce() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = s256Challenge(verifier);
  return { verifier, challenge, method: "S256" };
}

/**
 * Build a CI-safe PKCE descriptor for inclusion in report.json.
 * Returns: { method, length, prefix, suffix, sha256, present }
 *   - prefix/suffix:  first/last 8 chars for visual diffing
 *   - sha256:         hex digest of the raw value (compare-able across runs
 *                     without leaking the original)
 *   - length/present: cheap sanity hooks for downstream tooling
 * The raw `code_verifier` is NEVER serialized — only the derived challenge.
 */
function fingerprintPkce(challenge, method) {
  if (!challenge) {
    return { present: false, method: method || null };
  }
  const sha256 = createHash("sha256").update(challenge).digest("hex");
  return {
    present: true,
    method: method || null,
    length: challenge.length,
    prefix: challenge.slice(0, 8),
    suffix: challenge.length > 16 ? challenge.slice(-8) : null,
    sha256,
  };
}

// RFC 7636 §4.1: code_verifier = 43..128 chars from [A-Z a-z 0-9 - . _ ~]
const PKCE_VERIFIER_RE = /^[A-Za-z0-9\-._~]+$/;
// RFC 7636 §4.2: code_challenge for S256 = BASE64URL(SHA256(verifier)) → 43 chars
const PKCE_CHALLENGE_RE = /^[A-Za-z0-9\-_]+$/; // base64url, no padding

/**
 * Detect specific base64url edge-case violations and return a targeted
 * reason string, or null if no edge case applies. Used by both the
 * verifier and challenge paths so error messages identify the *exact*
 * class of mistake (padding vs. standard-base64 chars vs. whitespace
 * vs. non-ASCII), which is what most CI triagers actually need.
 */
function detectBase64UrlEdgeCase(value) {
  if (typeof value !== "string") return "not a string";
  // Order matters: check the most specific / actionable causes first so
  // a value with multiple problems surfaces the one most likely to be
  // the operator's actual mistake.
  if (/=/.test(value)) return "contains '=' padding (base64url MUST be unpadded)";
  if (/\+/.test(value)) return "contains '+' (use '-' for base64url)";
  if (/\//.test(value)) return "contains '/' (use '_' for base64url)";
  // Non-ASCII covers smart quotes, NBSP (U+00A0), zero-width chars, emoji,
  // etc. Check this BEFORE the whitespace branch because JS `\s` matches
  // many unicode space chars (NBSP included), and a paste-artifact NBSP
  // is more diagnostically useful labeled as "non-ASCII" than "whitespace".
  // eslint-disable-next-line no-control-regex
  if (/[^\x00-\x7F]/.test(value)) {
    return "contains non-ASCII / unicode chars (likely paste artifact: NBSP, smart quotes, ZWSP)";
  }
  if (/\s/.test(value)) {
    const kinds = [];
    if (/ /.test(value)) kinds.push("space");
    if (/\t/.test(value)) kinds.push("tab");
    if (/\r|\n/.test(value)) kinds.push("newline");
    return `contains whitespace (${kinds.join(", ") || "unknown"}) — strip before sending`;
  }
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1F\x7F]/.test(value)) return "contains ASCII control chars";
  return null;
}

/**
 * Validate the format of a PKCE token (verifier OR challenge) per RFC 7636.
 * `kind` is "verifier" or "challenge" — drives length bounds & charset.
 * Returns { ok: boolean, reason?: string }.
 */
function validatePkceFormat(value, kind) {
  if (value == null || value === "") return { ok: false, reason: "missing" };
  if (typeof value !== "string") return { ok: false, reason: `not a string (got ${typeof value})` };

  // Run edge-case detection FIRST so we report the precise problem
  // ("contains '=' padding") instead of the generic regex failure.
  const edge = detectBase64UrlEdgeCase(value);
  const len = value.length;

  if (kind === "verifier") {
    if (edge) return { ok: false, reason: edge };
    if (len < 43 || len > 128) return { ok: false, reason: `length ${len} (must be 43–128)` };
    if (!PKCE_VERIFIER_RE.test(value)) {
      return { ok: false, reason: "contains chars outside [A-Z a-z 0-9 - . _ ~]" };
    }
    return { ok: true };
  }
  // challenge (S256)
  if (edge) return { ok: false, reason: edge };
  if (len !== 43) return { ok: false, reason: `length ${len} (S256 challenge must be exactly 43)` };
  if (!PKCE_CHALLENGE_RE.test(value)) {
    return { ok: false, reason: "not valid base64url (allowed: A-Z a-z 0-9 - _)" };
  }
  return { ok: true };
}

/**
 * Map a PKCE failure category → an origin-specific remediation hint that
 * names the *exact* environment variable, config file, or dashboard path
 * a human should touch to fix it. Returned as both a one-liner string
 * (for the `results[].hint` field that the CLI prints) and a structured
 * object (for `report.json`'s per-origin `pkce.remediation` array, so
 * downstream tooling can group/filter by source).
 *
 * `kind` ∈ {
 *   "verifier_format"    — local script generated a bad verifier
 *   "missing_params"     — GoTrue didn't forward code_challenge/method
 *   "method_not_s256"    — server forwarded a non-S256 method
 *   "challenge_format"   — forwarded challenge isn't valid base64url
 *   "self_recompute"     — script's S256 derivation drifted
 *   "server_recompute"   — server-forwarded challenge != SHA256(verifier)
 *   "challenge_rewritten"— server returned a different challenge than we sent
 * }
 */
function pkceRemediationHint(origin, kind) {
  // Origin-specific config knobs the operator may have customized for this
  // origin only. Listing them by name (instead of generic prose) means CI
  // triage can grep the report for "APP_CALLBACKS=" or "EXPECTED_CLIENT_ID="
  // and jump straight to the misconfigured row.
  const originConfigPaths = [
    `APP_ORIGINS / APP_ORIGIN env (currently includes "${origin}")`,
    `APP_CALLBACKS env (per-origin override for "${origin}")`,
    `EXPECTED_CLIENT_ID env (if pinning a Google client per environment)`,
    `Cloud → Authentication → URL Configuration → "Redirect URLs" — must list "${origin}"`,
    `Cloud → Authentication → Providers → Google — confirm flow_type=pkce`,
    `Frontend client: lovable.auth.signInWithOAuth("google", { redirect_uri: "${origin}" })`,
  ];

  const sources = {
    verifier_format: [
      "scripts/check-google-oauth.mjs → generatePkce() (Node randomBytes/base64url path)",
      "Node.js version on the CI runner — base64url digest requires Node ≥ 16",
    ],
    missing_params: [
      `Cloud → Authentication → Providers → Google — flow_type MUST be "pkce" (not "implicit") for "${origin}"`,
      `Cloud → Authentication → URL Configuration → Site URL / Redirect URLs — verify "${origin}" is allowlisted (otherwise GoTrue strips PKCE before forwarding)`,
      `APP_CALLBACKS env override for "${origin}" — wrong callback path causes GoTrue to fall back to a non-PKCE redirect`,
      `Frontend: lovable.auth.signInWithOAuth("google", { redirect_uri: "${origin}" }) — missing redirect_uri triggers the legacy non-PKCE path`,
    ],
    method_not_s256: [
      `Cloud → Authentication → Providers → Google — flow_type=pkce (NOT "plain"/"implicit") for "${origin}"`,
      "GoTrue version on the Cloud project — plain-PKCE was removed in GoTrue v2.130; upgrade if the server is forcing 'plain'",
      "Frontend Lovable Cloud SDK version — older builds may negotiate 'plain'; upgrade @lovable.dev/cloud-auth-js",
    ],
    challenge_format: [
      "GoTrue version on the Cloud project — old builds URL-encode the challenge twice, breaking the base64url charset",
      `Cloud → Edge proxy / CDN in front of "${origin}" — verify it isn't rewriting query params on /authorize`,
      `APP_CALLBACKS env for "${origin}" — a wrong callback can route through a non-OAuth proxy that mangles params`,
    ],
    self_recompute: [
      "scripts/check-google-oauth.mjs → generatePkce() / s256Challenge() — base64url encoding or hash input changed",
      "Node.js version on the CI runner (createHash('sha256').digest('base64url') requires Node ≥ 16)",
    ],
    server_recompute: [
      `Cloud → Authentication → Providers → Google — flow_type MUST be "pkce" for "${origin}" (server is rewriting challenge)`,
      "GoTrue version on the Cloud project — challenge-rewriting bugs were fixed in v2.140+",
      `Cloud → Edge proxy / WAF in front of "${origin}" — disable any query-param normalization on /authorize`,
    ],
    challenge_rewritten: [
      "GoTrue version on the Cloud project — challenge-rewriting bugs were fixed in v2.140+",
      `Cloud → Authentication → Providers → Google — confirm flow_type=pkce for "${origin}"`,
      `CDN / reverse proxy in front of "${origin}" — disable URL canonicalization on the /authorize path`,
    ],
  };

  const specific = sources[kind] || [];
  const all = [...specific, ...originConfigPaths];
  return {
    kind,
    origin,
    sources: all,
    // Compact one-liner for the CLI `hint` slot. Truncate to keep terminal
    // output readable; full list lives in report.json.
    summary: `Fix in: ${specific.slice(0, 2).join(" | ") || originConfigPaths[0]} (full list in report.json → origins["${origin}"].pkce.remediation)`,
  };
}

/**
 * Append a remediation hint to the per-origin summary so report.json
 * exposes them under `origins[origin].pkce.remediation`.
 *
 * Hints are DEDUPLICATED by `kind` (the failure category — e.g.
 * "verifier_format", "missing_params") and bucketed with a `count`,
 * `firstSeenAt`, and `lastSeenAt` timestamp. Two checks on the same
 * origin that hit the same root cause therefore produce a single entry
 * with `count: 2` instead of two byte-identical rows. A `ranked` array
 * (most-frequent first, ties broken by insertion order) gives downstream
 * tooling a deterministic, copy-paste-friendly priority list.
 *
 * Shape:
 *   pkce.remediation = {
 *     byKind: {
 *       <kind>: { kind, origin, count, firstSeenAt, lastSeenAt,
 *                 sources, summary }
 *     },
 *     ranked:      [ { kind, count }, ... ],
 *     totalEvents: <number — sum of counts>,
 *     uniqueKinds: <number — Object.keys(byKind).length>,
 *   }
 *
 * The structured object dropped by `pkceRemediationHint()` (kind, origin,
 * sources, summary) is preserved verbatim inside each bucket — only the
 * volatile timestamps and count are added.
 */
function attachPkceRemediation(origin, hint) {
  const summary = originSummary(origin);
  if (!summary.pkce) summary.pkce = {};
  // Migrate any pre-existing array-shaped remediation block (defensive — in
  // case callers from earlier in the same run pushed before this helper
  // was loaded). Each legacy entry becomes one event in the new shape.
  let bucket = summary.pkce.remediation;
  if (!bucket || Array.isArray(bucket) || typeof bucket !== "object" || !bucket.byKind) {
    const legacy = Array.isArray(bucket) ? bucket : [];
    bucket = { byKind: {}, ranked: [], totalEvents: 0, uniqueKinds: 0 };
    for (const h of legacy) {
      if (h && typeof h === "object" && h.kind) recordIntoBucket(bucket, h);
    }
    summary.pkce.remediation = bucket;
  }
  recordIntoBucket(bucket, hint);
}

/**
 * Insert/merge a hint into the deduped remediation bucket.
 * Pure function over `bucket` — no global state.
 */
function recordIntoBucket(bucket, hint) {
  const kind = hint?.kind || "unknown";
  const now = new Date().toISOString();
  const existing = bucket.byKind[kind];
  if (existing) {
    existing.count += 1;
    existing.lastSeenAt = now;
  } else {
    bucket.byKind[kind] = {
      kind,
      origin: hint.origin || null,
      count: 1,
      firstSeenAt: now,
      lastSeenAt: now,
      sources: Array.isArray(hint.sources) ? hint.sources : [],
      summary: typeof hint.summary === "string" ? hint.summary : null,
    };
  }
  bucket.totalEvents += 1;
  bucket.uniqueKinds = Object.keys(bucket.byKind).length;
  // Recompute deterministic ranking: count desc, then firstSeenAt asc.
  bucket.ranked = Object.values(bucket.byKind)
    .map((b) => ({ kind: b.kind, count: b.count, firstSeenAt: b.firstSeenAt }))
    .sort((a, b) => b.count - a.count || a.firstSeenAt.localeCompare(b.firstSeenAt))
    .map(({ kind: k, count }) => ({ kind: k, count }));
}

/**
 * Validate that the authorize URL returned by GoTrue forwarded our PKCE
 * parameters to Google unchanged. Some misconfigurations (e.g. flow_type
 * "implicit" or stripped query params) drop these silently and break
 * the browser-side `exchangeCodeForSession` call.
 */
function validatePkce(googleUrl, sent, origin) {
  let parsed;
  try { parsed = new URL(googleUrl); }
  catch {
    const hint = pkceRemediationHint(origin, "missing_params");
    attachPkceRemediation(origin, hint);
    record(
      "fail",
      `PKCE forwarded to Google (${origin})`,
      "authorize URL not parseable",
      hint.summary,
      { remediation: hint }
    );
    return null;
  }
  const gotChallenge = parsed.searchParams.get("code_challenge");
  const gotMethod = parsed.searchParams.get("code_challenge_method");
  const summary = originSummary(origin);
  // Sanitize challenges before serializing to the artifact: keep a short
  // prefix for visual diffing + a SHA-256 fingerprint for cryptographic
  // comparison without leaking the full verifier-derived value.
  // RFC 7636 format checks — run on BOTH the verifier we generated (catches
  // bugs in our own crypto path) AND the challenge GoTrue forwarded.
  const verifierFmt = validatePkceFormat(sent.verifier, "verifier");
  const challengeFmt = validatePkceFormat(gotChallenge, "challenge");

  summary.pkce = {
    sent: fingerprintPkce(sent.challenge, sent.method),
    received: fingerprintPkce(gotChallenge, gotMethod),
    challengeMatches: !!gotChallenge && gotChallenge === sent.challenge,
    methodMatches: (gotMethod || "").toUpperCase() === (sent.method || "").toUpperCase(),
    methodIsS256: (gotMethod || "").toUpperCase() === "S256",
    verifierFormat: verifierFmt,
    challengeFormat: challengeFmt,
  };

  // Verifier format (script-side sanity).
  if (sent.verifier !== undefined) {
    if (verifierFmt.ok) {
      record("pass", `PKCE verifier format valid (${origin})`, `${sent.verifier.length} chars, RFC 7636 charset`);
    } else {
      noteMismatch(origin, `pkce: verifier ${verifierFmt.reason}`);
      const hint = pkceRemediationHint(origin, "verifier_format");
      attachPkceRemediation(origin, hint);
      record(
        "fail",
        `PKCE verifier format valid (${origin})`,
        verifierFmt.reason,
        `code_verifier must be 43–128 chars from [A-Z a-z 0-9 - . _ ~]. ${hint.summary}`,
        { remediation: hint }
      );
    }
  }

  if (!gotChallenge || !gotMethod) {
    const miss = `${!gotChallenge ? "code_challenge" : ""}${!gotChallenge && !gotMethod ? " & " : ""}${!gotMethod ? "code_challenge_method" : ""}`;
    noteMismatch(origin, `pkce: missing ${miss}`);
    const hint = pkceRemediationHint(origin, "missing_params");
    attachPkceRemediation(origin, hint);
    record(
      "fail",
      `PKCE forwarded to Google (${origin})`,
      `missing ${miss}`,
      `Set flow_type='pkce' and ensure GoTrue forwards code_challenge. ${hint.summary}`,
      { remediation: hint }
    );
    return { challenge: gotChallenge, method: gotMethod };
  }

  // STRICT: any non-S256 method is a hard fail. Plain is insecure; anything
  // else (e.g. typo) is a misconfiguration.
  if (gotMethod !== "S256") {
    const reason = gotMethod.toUpperCase() === "S256"
      ? `case mismatch: "${gotMethod}" (must be exact "S256")`
      : `code_challenge_method="${gotMethod}" (only "S256" is accepted)`;
    noteMismatch(origin, `pkce: method=${gotMethod} (expected S256)`);
    const hint = pkceRemediationHint(origin, "method_not_s256");
    attachPkceRemediation(origin, hint);
    record(
      "fail",
      `PKCE method is S256 (${origin})`,
      reason,
      `Plain PKCE is insecure and case-sensitive aliases are not interoperable — use exactly 'S256'. ${hint.summary}`,
      { remediation: hint }
    );
  } else {
    record("pass", `PKCE method is S256 (${origin})`, "code_challenge_method=S256");
  }

  // Challenge format (RFC 7636 §4.2 for S256).
  if (challengeFmt.ok) {
    record("pass", `PKCE challenge format valid (${origin})`, `43-char base64url, no padding`);
  } else {
    noteMismatch(origin, `pkce: challenge ${challengeFmt.reason}`);
    const hint = pkceRemediationHint(origin, "challenge_format");
    attachPkceRemediation(origin, hint);
    record(
      "fail",
      `PKCE challenge format valid (${origin})`,
      challengeFmt.reason,
      `code_challenge for S256 must be exactly 43 base64url chars (A-Z a-z 0-9 - _) with no padding. ${hint.summary}`,
      { remediation: hint }
    );
  }

  // ── Recompute-and-compare (RFC 7636 §4.6 client-side equivalent) ─────
  // Independently recompute BASE64URL(SHA256(verifier)) and compare against
  // both (a) the challenge we sent and (b) the challenge GoTrue forwarded.
  // This is the same operation the auth server performs at /token time, so
  // a mismatch here means the token exchange is guaranteed to fail with
  // "invalid_grant" / "code challenge does not match" — catch it now in CI
  // instead of after a real user is bounced from Google.
  if (sent.verifier) {
    const recomputed = s256Challenge(sent.verifier);
    summary.pkce.recomputedChallenge = fingerprintPkce(recomputed, "S256");
    summary.pkce.recomputedMatchesSent = recomputed === sent.challenge;
    summary.pkce.recomputedMatchesReceived = !!gotChallenge && recomputed === gotChallenge;

    // (a) Self-check: our generator must be deterministic + spec-correct.
    if (recomputed !== sent.challenge) {
      noteMismatch(origin, "pkce: recomputed challenge != sent challenge");
      const hint = pkceRemediationHint(origin, "self_recompute");
      attachPkceRemediation(origin, hint);
      record(
        "fail",
        `PKCE recompute matches sent challenge (${origin})`,
        `recompute(verifier) ${recomputed.slice(0, 16)}… != sent ${sent.challenge.slice(0, 16)}…`,
        `The script's S256 derivation is broken. ${hint.summary}`,
        { remediation: hint }
      );
      // If our own crypto path is wrong, comparing to gotChallenge is moot.
      return { challenge: gotChallenge, method: gotMethod };
    }
    record(
      "pass",
      `PKCE recompute matches sent challenge (${origin})`,
      `BASE64URL(SHA256(verifier)) == sent challenge (${recomputed.slice(0, 16)}…)`
    );

    // (b) Server-roundtrip check: what GoTrue forwarded must equal what the
    //     auth server will derive from our verifier at token-exchange time.
    if (gotChallenge && recomputed !== gotChallenge) {
      noteMismatch(origin, "pkce: recomputed challenge != received challenge");
      const hint = pkceRemediationHint(origin, "server_recompute");
      attachPkceRemediation(origin, hint);
      record(
        "fail",
        `PKCE recompute matches received challenge (${origin})`,
        `recompute(verifier) ${recomputed.slice(0, 16)}… != received ${gotChallenge.slice(0, 16)}…`,
        `Server-forwarded code_challenge will not validate at /token — token exchange is guaranteed to fail with 'invalid_grant'. ${hint.summary}`,
        { remediation: hint }
      );
      return { challenge: gotChallenge, method: gotMethod };
    }
  }

  if (gotChallenge !== sent.challenge) {
    noteMismatch(origin, "pkce: challenge rewritten by server");
    const hint = pkceRemediationHint(origin, "challenge_rewritten");
    attachPkceRemediation(origin, hint);
    record(
      "fail",
      `PKCE challenge preserved (${origin})`,
      `sent ${sent.challenge.slice(0, 16)}…, got ${gotChallenge.slice(0, 16)}…`,
      `GoTrue rewrote the challenge — token exchange will fail. ${hint.summary}`,
      { remediation: hint }
    );
  } else {
    record("pass", `PKCE challenge preserved (${origin})`, `${gotChallenge.slice(0, 16)}…`);
    if (sent.verifier) {
      record(
        "pass",
        `PKCE end-to-end S256 derivation verified (${origin})`,
        `received challenge == BASE64URL(SHA256(verifier))`
      );
    }
  }
  return { challenge: gotChallenge, method: gotMethod };
}

const EXPECTED_CLIENT_ID = process.env.EXPECTED_CLIENT_ID || null;
const EXPECTED_RESPONSE_TYPE = process.env.EXPECTED_RESPONSE_TYPE || "code";
const EXPECTED_SCOPES = (process.env.EXPECTED_SCOPES || "openid email profile")
  .split(/[\s,]+/)
  .map((s) => s.trim())
  .filter(Boolean);

// Per-origin redirect_uri expectations.
//   EXPECTED_CALLBACK_PATH — default path appended to each origin (default "/auth/v1/callback")
//   APP_CALLBACKS          — comma/newline-separated overrides as "<origin>=<full-callback-url>"
//                            e.g. "https://app.example.com=https://api.example.com/oauth/cb"
const EXPECTED_CALLBACK_PATH = process.env.EXPECTED_CALLBACK_PATH || "/auth/v1/callback";
const APP_CALLBACKS = (() => {
  const map = new Map();
  for (const entry of (process.env.APP_CALLBACKS || "").split(/[,\n]/)) {
    const [k, v] = entry.split("=").map((s) => s?.trim());
    if (k && v) map.set(k, v);
  }
  return map;
})();

/**
 * Resolve the redirect_uri we expect Google to receive for a given origin.
 * Order of precedence:
 *   1. APP_CALLBACKS["<origin>"]            — explicit per-origin override
 *   2. <origin> + EXPECTED_CALLBACK_PATH    — derived from the app origin
 *      (only when EXPECTED_CALLBACK_PATH is non-default OR APP_CALLBACKS is set)
 *   3. <SUPABASE_URL> + EXPECTED_CALLBACK_PATH (default — GoTrue handles callback)
 */
function expectedRedirectUriFor(origin) {
  if (APP_CALLBACKS.has(origin)) {
    return { url: APP_CALLBACKS.get(origin), source: "APP_CALLBACKS override" };
  }
  // If the user customized either knob, derive from the app origin so each
  // environment can have its own callback host (e.g. proxied custom domains).
  if (process.env.APP_CALLBACKS || process.env.EXPECTED_CALLBACK_PATH) {
    const url = origin.replace(/\/$/, "") + EXPECTED_CALLBACK_PATH;
    return { url, source: `APP_ORIGIN + ${EXPECTED_CALLBACK_PATH}` };
  }
  // Default: managed Supabase callback.
  return {
    url: `${SUPABASE_URL.replace(/\/$/, "")}${EXPECTED_CALLBACK_PATH}`,
    source: `SUPABASE_URL + ${EXPECTED_CALLBACK_PATH}`,
  };
}

/**
 * Per-origin redirect_uri allowlist gate. Runs BEFORE any PKCE work for an
 * origin so we never spend probes against a misconfigured pair.
 *
 * Rules (strict, no fallback):
 *   1. `origin` itself must appear in APP_ORIGINS (the allowlist seeded from
 *      env). A drift here means the caller is asking us to probe an origin
 *      that the rest of the suite does not consider trusted.
 *   2. The expected redirect_uri MUST parse as an absolute URL.
 *   3. Its host MUST be either:
 *        a. the same host as `origin` (when the callback is derived from the
 *           app origin — APP_CALLBACKS or non-default EXPECTED_CALLBACK_PATH
 *           was set), OR
 *        b. the SUPABASE_URL host (managed default).
 *      Any other host indicates an APP_CALLBACKS override pointing at an
 *      untrusted third party — that would silently leak the auth code.
 *   4. The path MUST equal EXPECTED_CALLBACK_PATH unless an explicit
 *      APP_CALLBACKS override is in play (overrides may legitimately use a
 *      different path; we only require the host check above).
 *   5. The scheme MUST be https for non-localhost origins.
 *
 * Returns { ok: true, expected } when the gate passes; { ok: false } when
 * any rule fails (and a record() entry has already been emitted).
 *
 * Pure-ish: reads APP_ORIGINS / APP_CALLBACKS / EXPECTED_CALLBACK_PATH from
 * module scope, mirroring the rest of the validators in this file.
 */
function validateRedirectUriAgainstAllowlist(origin) {
  const label = `redirect_uri matches origin allowlist (${origin})`;

  // Rule 1: origin allowlist membership.
  if (!APP_ORIGINS.includes(origin)) {
    record(
      "fail",
      label,
      `origin "${origin}" is not present in APP_ORIGINS [${APP_ORIGINS.join(", ")}]`,
      `Add "${origin}" to APP_ORIGINS (or remove it from the per-origin probe list) before running PKCE checks.`
    );
    noteMismatch(origin, "redirect_uri gate: origin not in APP_ORIGINS");
    return { ok: false };
  }

  const expected = expectedRedirectUriFor(origin);

  // Rule 2: parseable URL.
  let parsed;
  try { parsed = new URL(expected.url); }
  catch {
    record(
      "fail",
      label,
      `expected redirect_uri is not a valid URL: "${expected.url}" (source: ${expected.source})`,
      "Fix the APP_CALLBACKS / EXPECTED_CALLBACK_PATH value so it resolves to an absolute https URL."
    );
    noteMismatch(origin, "redirect_uri gate: unparseable expected URL");
    return { ok: false };
  }

  let originUrl;
  try { originUrl = new URL(origin); }
  catch {
    record(
      "fail",
      label,
      `origin "${origin}" is not a valid URL`,
      "APP_ORIGINS entries must be absolute origins like https://app.example.com"
    );
    noteMismatch(origin, "redirect_uri gate: unparseable origin");
    return { ok: false };
  }

  let supabaseUrl;
  try { supabaseUrl = new URL(SUPABASE_URL); } catch { supabaseUrl = null; }

  const hasOverride = APP_CALLBACKS.has(origin);
  const isOriginHost = parsed.host === originUrl.host;
  const isSupabaseHost = supabaseUrl && parsed.host === supabaseUrl.host;

  // Rule 3: host must be origin host OR supabase host (no third parties).
  if (!isOriginHost && !isSupabaseHost) {
    record(
      "fail",
      label,
      `expected redirect_uri host "${parsed.host}" matches neither origin host "${originUrl.host}" nor SUPABASE_URL host "${supabaseUrl?.host ?? "(unset)"}" (source: ${expected.source})`,
      `Point APP_CALLBACKS["${origin}"] at either the app origin or the managed Cloud callback host — never a third party.`
    );
    noteMismatch(origin, `redirect_uri gate: untrusted host ${parsed.host}`);
    return { ok: false };
  }

  // Rule 4: path must equal EXPECTED_CALLBACK_PATH unless an explicit override is set.
  if (!hasOverride && parsed.pathname !== EXPECTED_CALLBACK_PATH) {
    record(
      "fail",
      label,
      `expected redirect_uri path "${parsed.pathname}" != EXPECTED_CALLBACK_PATH "${EXPECTED_CALLBACK_PATH}" (source: ${expected.source})`,
      `Either set APP_CALLBACKS["${origin}"]=<full-callback-url> if this origin really uses a different path, or align EXPECTED_CALLBACK_PATH.`
    );
    noteMismatch(origin, `redirect_uri gate: wrong path ${parsed.pathname}`);
    return { ok: false };
  }

  // Rule 5: https for non-localhost.
  const isLocalhost = /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(parsed.hostname);
  if (parsed.protocol !== "https:" && !isLocalhost) {
    record(
      "fail",
      label,
      `expected redirect_uri uses non-https scheme "${parsed.protocol}" for non-localhost host "${parsed.hostname}"`,
      "Use https:// for all non-localhost callback URLs."
    );
    noteMismatch(origin, `redirect_uri gate: insecure scheme ${parsed.protocol}`);
    return { ok: false };
  }

  record(
    "pass",
    label,
    `${expected.url} (source: ${expected.source}; host=${isOriginHost ? "origin" : "supabase"}${hasOverride ? "; override" : ""})`
  );
  // Stash the validated expectation so downstream probes can read it without
  // re-resolving (and so report.json shows what was gated).
  const summary = originSummary(origin);
  summary.redirectUriGate = {
    ok: true,
    expected: expected.url,
    source: expected.source,
    host: parsed.host,
    matchedHost: isOriginHost ? "origin" : "supabase",
    hasOverride,
  };
  return { ok: true, expected };
}

/**
 * Validate the standard OAuth params on the Google authorize URL:
 *   - response_type must equal EXPECTED_RESPONSE_TYPE (default "code")
 *   - scope must include every entry in EXPECTED_SCOPES
 *   - client_id must be present (and equal EXPECTED_CLIENT_ID if set)
 * Returns the observed client_id so the caller can enforce cross-origin
 * consistency.
 */
function validateAuthorizeParams(googleUrl, origin) {
  let parsed;
  try { parsed = new URL(googleUrl); }
  catch {
    record("fail", `Authorize params parseable (${origin})`, "URL not parseable");
    return null;
  }

  const summary = originSummary(origin);
  summary.authorizeUrl = googleUrl;

  // response_type
  const responseType = parsed.searchParams.get("response_type");
  const rtMatches = responseType === EXPECTED_RESPONSE_TYPE;
  summary.responseType = responseType;
  summary.expectedResponseType = EXPECTED_RESPONSE_TYPE;
  summary.responseTypeMatches = rtMatches;
  if (rtMatches) {
    record("pass", `response_type=${EXPECTED_RESPONSE_TYPE} (${origin})`, `response_type=${responseType}`);
  } else {
    noteMismatch(origin, `response_type=${responseType ?? "(missing)"} (expected ${EXPECTED_RESPONSE_TYPE})`);
    record(
      "fail",
      `response_type=${EXPECTED_RESPONSE_TYPE} (${origin})`,
      `expected "${EXPECTED_RESPONSE_TYPE}", got "${responseType ?? "(missing)"}"`,
      'Auth code flow requires response_type=code. If you see "token", the client is using the implicit flow — set flow_type="pkce".'
    );
  }

  // scope
  const scopeParam = parsed.searchParams.get("scope") || "";
  const scopes = scopeParam.split(/[\s+]+/).map((s) => s.trim()).filter(Boolean);
  const missing = EXPECTED_SCOPES.filter((s) => !scopes.includes(s));
  summary.scopes = scopes;
  summary.expectedScopes = EXPECTED_SCOPES;
  summary.missingScopes = missing;
  if (missing.length === 0) {
    record("pass", `Required scopes present (${origin})`, `scope="${scopes.join(" ")}"`);
  } else {
    noteMismatch(origin, `scope: missing ${missing.join(", ")}`);
    record(
      "fail",
      `Required scopes present (${origin})`,
      `missing: ${missing.join(", ")} (got "${scopeParam}")`,
      "Configure the requested scopes in your signInWithOAuth call (or set EXPECTED_SCOPES if your app intentionally uses a different set)."
    );
  }

  // client_id
  const clientId = parsed.searchParams.get("client_id");
  summary.clientId = clientId;
  summary.expectedClientId = EXPECTED_CLIENT_ID;
  summary.clientIdMatches = clientId
    ? !EXPECTED_CLIENT_ID || clientId === EXPECTED_CLIENT_ID
    : false;
  if (!clientId) {
    noteMismatch(origin, "client_id missing");
    record(
      "fail",
      `client_id present (${origin})`,
      "Google authorize URL has no client_id",
      "Provider is not fully configured — check Cloud → Auth Settings → Google."
    );
  } else if (EXPECTED_CLIENT_ID && clientId !== EXPECTED_CLIENT_ID) {
    noteMismatch(origin, `client_id=${clientId} (expected ${EXPECTED_CLIENT_ID})`);
    record(
      "fail",
      `client_id matches EXPECTED_CLIENT_ID (${origin})`,
      `expected ${EXPECTED_CLIENT_ID}, got ${clientId}`,
      "Wrong Google OAuth client — confirm the client_id configured in Cloud matches the one provisioned in Google Cloud Console."
    );
  } else {
    record(
      "pass",
      `client_id present (${origin})`,
      EXPECTED_CLIENT_ID ? `matches EXPECTED_CLIENT_ID (${clientId})` : clientId
    );
  }

  return clientId;
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

  const { url: expectedCallback, source: expectedSource } = expectedRedirectUriFor(origin);
  const actualCallback = parsed.searchParams.get("redirect_uri");
  const summary = originSummary(origin);
  summary.redirectUri = actualCallback;
  summary.expectedRedirectUri = expectedCallback;
  summary.expectedRedirectUriSource = expectedSource;
  summary.redirectUriMatches = actualCallback === expectedCallback;
  const label = `Callback redirect_uri matches expected (${origin})`;

  if (!actualCallback) {
    noteMismatch(origin, "redirect_uri missing");
    record(
      "fail",
      label,
      "Google authorize URL has no redirect_uri parameter",
      `Expected "${expectedCallback}" (from ${expectedSource}). GoTrue should always set redirect_uri — re-check provider configuration.`
    );
  } else if (actualCallback !== expectedCallback) {
    noteMismatch(origin, `redirect_uri=${actualCallback} (expected ${expectedCallback})`);
    record(
      "fail",
      label,
      `expected ${expectedCallback} (${expectedSource}), got ${actualCallback}`,
      `Add "${actualCallback}" to your Google OAuth client's Authorized redirect URIs, OR set APP_CALLBACKS="${origin}=${actualCallback}" if this origin intentionally uses a different callback host.`
    );
  } else {
    record("pass", label, `${actualCallback} (${expectedSource})`);
  }

  // `redirect_to` may be top-level, in `state` as JSON, base64url JSON,
  // a JWT-ish payload, or a query-string. Try each decoder; report the
  // method we used so failures are debuggable.
  const stateParam = parsed.searchParams.get("state") || "";
  const decoded = extractRedirectTo(parsed.searchParams.get("redirect_to"), stateParam);
  const stateMatches =
    !!decoded.value && originsMatch(decoded.value, origin);
  summary.state = {
    raw: stateParam ? `${stateParam.slice(0, 32)}…` : null,
    length: stateParam.length,
    decoder: decoded.source,
    decodedRedirectTo: decoded.value,
    originMatches: stateMatches,
  };

  if (decoded.value && stateMatches) {
    record(
      "pass",
      `Authorize URL preserves redirect_to (${origin})`,
      `found via ${decoded.source}: ${decoded.value}`
    );
  } else if (decoded.value) {
    noteMismatch(origin, `redirect_to=${decoded.value} (expected origin ${origin})`);
    record(
      "fail",
      `Authorize URL preserves redirect_to (${origin})`,
      `decoded "${decoded.value}" via ${decoded.source}, expected origin "${origin}"`,
      "Origin mismatch — the user will be redirected to the wrong environment after sign-in. Check the redirect_to passed to signInWithOAuth."
    );
  } else if (stateParam.includes(encodeURIComponent(origin)) || stateParam.includes(origin)) {
    summary.state.decoder = "substring";
    summary.state.originMatches = true;
    record(
      "pass",
      `Authorize URL preserves redirect_to (${origin})`,
      "origin found via substring match (state encoding unknown)"
    );
  } else {
    record(
      "warn",
      `Authorize URL preserves redirect_to (${origin})`,
      `state is opaque (${stateParam ? `${stateParam.length} chars, no decoder matched` : "missing"})`,
      "If sign-in lands on the wrong environment, set EXPECTED_CLIENT_ID and re-run, or inspect /auth/v1/callback logs."
    );
  }
}

/**
 * Compare two URLs by origin (scheme + host + port), ignoring trailing
 * slashes and case differences.
 */
function originsMatch(a, b) {
  try {
    return new URL(a).origin.toLowerCase() === new URL(b).origin.toLowerCase();
  } catch {
    return a.replace(/\/$/, "").toLowerCase() === b.replace(/\/$/, "").toLowerCase();
  }
}

/**
 * Try to extract a redirect_to URL from the GoTrue authorize state.
 * Returns { value, source } where source describes the decoder that worked.
 * Tries, in order: top-level param, raw JSON, URI-decoded JSON,
 * base64url-decoded JSON, JWT payload (middle segment), querystring.
 */
function extractRedirectTo(topLevel, state) {
  if (topLevel) return { value: topLevel, source: "redirect_to param" };
  if (!state) return { value: null, source: null };

  const tryJson = (s, label) => {
    try {
      const obj = JSON.parse(s);
      const v = obj?.redirect_to || obj?.redirectTo || obj?.return_to;
      if (v) return { value: v, source: label };
    } catch { /* not JSON */ }
    return null;
  };

  // 1. Raw JSON
  let r = tryJson(state, "state JSON");
  if (r) return r;

  // 2. URI-decoded JSON
  try {
    r = tryJson(decodeURIComponent(state), "state URI-decoded JSON");
    if (r) return r;
  } catch { /* not URI-encoded */ }

  // 3. base64url JSON (whole state)
  const fromB64 = (seg, label) => {
    try {
      const buf = Buffer.from(seg.replace(/-/g, "+").replace(/_/g, "/"), "base64");
      const txt = buf.toString("utf8");
      return tryJson(txt, label);
    } catch { return null; }
  };
  r = fromB64(state, "state base64url JSON");
  if (r) return r;

  // 4. JWT-ish payload (header.payload.sig) — decode middle segment
  const parts = state.split(".");
  if (parts.length >= 2) {
    r = fromB64(parts[1], "state JWT payload");
    if (r) return r;
  }

  // 5. Query-string style state (key=value&...)
  if (/=/.test(state)) {
    try {
      const sp = new URLSearchParams(state.replace(/^\?/, ""));
      const v = sp.get("redirect_to") || sp.get("redirectTo") || sp.get("return_to");
      if (v) return { value: v, source: "state querystring" };
    } catch { /* ignore */ }
  }

  return { value: null, source: null };
}

async function main() {
  if (CLI.help) {
    console.log(`Google OAuth diagnostic
Usage: node scripts/check-google-oauth.mjs [flags]

Flags:
  --export-remediation=<origin>     Write a standalone JSON file with that
                                    origin's deduped PKCE remediation hints
                                    plus relevant env/config (secrets are
                                    fingerprinted, never echoed verbatim).
  --export-remediation=all          Same, but for every origin in APP_ORIGINS,
                                    one file per origin.
  --export-remediation-out=<path>   Output destination (file for one origin,
                                    directory for "all"). Defaults to
                                    ./oauth-remediation-<origin-slug>.json
                                    or ./oauth-remediation/.
  --help, -h                        This help.

All other configuration is via env vars — see file header.`);
    process.exit(0);
  }
  if (CLI.unknown.length) {
    console.error(`${YELLOW}Ignoring unknown CLI flags: ${CLI.unknown.join(", ")}${RESET}`);
  }
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
  console.log(`\n${DIM}Probing ${APP_ORIGINS.length} allowed origin(s) with PKCE…${RESET}`);
  const seenChallenges = new Map(); // challenge → origin (to detect reuse)
  const seenClientIds = new Map(); // client_id → origin (cross-env consistency)
  for (const origin of APP_ORIGINS) {
    const label = `Authorize allows redirect_to=${origin}`;
    const pkce = await generatePkce();
    try {
      const url =
        `${SUPABASE_URL}/auth/v1/authorize?provider=google&skip_http_redirect=true` +
        `&redirect_to=${encodeURIComponent(origin)}` +
        `&code_challenge=${encodeURIComponent(pkce.challenge)}` +
        `&code_challenge_method=${pkce.method}`;
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
        const clientId = validateAuthorizeParams(body.url, origin);
        if (clientId) {
          if (seenClientIds.size && !seenClientIds.has(clientId)) {
            const others = [...seenClientIds.entries()]
              .map(([cid, o]) => `${o}=${cid}`)
              .join("; ");
            record(
              "fail",
              `client_id consistent across origins (${origin})`,
              `${origin} uses ${clientId}, but other origins used ${others}`,
              "All APP_ORIGINS should resolve to the same Google OAuth client. Mixed client_ids usually mean SUPABASE_URL points at a different project than expected."
            );
          }
          seenClientIds.set(clientId, origin);
        }
        const got = validatePkce(body.url, pkce, origin);
        if (got?.challenge) {
          const prev = seenChallenges.get(got.challenge);
          if (prev) {
            record(
              "fail",
              `PKCE challenge unique per request (${origin})`,
              `same challenge returned for ${prev} and ${origin}`,
              "GoTrue is reusing or caching the challenge — every authorize call must echo the per-request value."
            );
          } else {
            seenChallenges.set(got.challenge, origin);
          }
        }
      } else if (res.ok && body?.url) {
        record("warn", label, `Got non-Google URL: ${body.url.slice(0, 120)}` + tail);
      } else {
        const msg =
          body?.error_description || body?.msg || body?.error || `HTTP ${res.status}`;
        const isAllowlist =
          /redirect.*url.*not.*allowed|invalid.*redirect|not.*in.*allow.*list/i.test(msg);
        const isPkce = /code_challenge|pkce/i.test(msg);
        const hint = isAllowlist
          ? `Add "${origin}" to Cloud → Auth Settings → URL Configuration → Redirect URLs (and to your Google OAuth client's Authorized JavaScript origins).`
          : isPkce
          ? "Server rejected the PKCE params — confirm GoTrue is recent enough to support code_challenge on /authorize."
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

  // 4. Opt-in end-to-end redirect simulation.
  if (/^(1|true|yes)$/i.test(process.env.E2E_CHECK || "")) {
    console.log(`\n${DIM}E2E_CHECK enabled — simulating callback redirect for each origin…${RESET}`);
    for (const origin of APP_ORIGINS) {
      await runE2ERedirect(origin);
    }
  }

  // 5. Opt-in negative-test pass: prove the validator catches misconfigured PKCE.
  if (/^(1|true|yes)$/i.test(process.env.PKCE_NEGATIVE_TESTS || "")) {
    console.log(`\n${DIM}PKCE_NEGATIVE_TESTS enabled — verifying validator rejects bad PKCE…${RESET}`);
    for (const origin of APP_ORIGINS) {
      await runPkceNegativeTests(origin);
    }
  }

  // 5b. Opt-in explicit login flow: capture real GoTrue state and assert
  //     the redirect_to round-trips end-to-end through the callback chain.
  if (/^(1|true|yes)$/i.test(process.env.E2E_LOGIN_FLOW || "")) {
    console.log(`\n${DIM}E2E_LOGIN_FLOW enabled — capturing real state and verifying round-trip…${RESET}`);
    for (const origin of APP_ORIGINS) {
      await runE2ELoginFlow(origin);
    }
  }

  // 6. Always-on token-exchange shape check (cheap; no real code consumed).
  if (/^(0|false|no)$/i.test(process.env.TOKEN_EXCHANGE_CHECK || "") === false) {
    console.log(`\n${DIM}Probing ${TOKEN_ENDPOINT_PATH} shape (PKCE grant)…${RESET}`);
    await runTokenExchangeCheck();

    // 6b. Per-origin malformed-PKCE probe suites. Each origin gets two
    //     batches of synthetic POSTs: one mutating `code_verifier` (the
    //     field GoTrue actually consumes) and one mutating `code_challenge`
    //     (which the token endpoint MUST NOT accept as a verifier substitute).
    //     The exact failure reason is captured into
    //     originSummaries[origin].{malformedPkce, malformedCodeChallenge}
    //     so CI artifacts show, per origin, that GoTrue is enforcing each
    //     contract.
    console.log(`\n${DIM}Probing ${TOKEN_ENDPOINT_PATH} with malformed PKCE per origin…${RESET}`);
    for (const origin of APP_ORIGINS) {
      await runMalformedPkceProbes(origin);
      await runMalformedCodeChallengeProbes(origin);
    }
  }

  await finish();
}

/**
 * Simulate the tail end of the OAuth dance without ever touching Google's
 * consent screen:
 *   1. Call /auth/v1/authorize to obtain a fresh `state` value (proving the
 *      Cloud project is willing to start the flow for this origin).
 *   2. Replay the URL Google would have hit on cancel:
 *      <SUPABASE_URL>/auth/v1/callback?state=<state>&error=access_denied&error_description=e2e
 *   3. Manually follow GoTrue's 3xx redirects (no body posts) up to
 *      E2E_MAX_REDIRECTS hops, capturing the final Location.
 *   4. Assert the final URL's origin matches the requested APP_ORIGIN.
 *
 * A successful pass means every link in the chain — provider config,
 * state allow-listing, redirect_to round-trip — is wired correctly.
 * Any consent-screen / token-exchange issues are out of scope (they
 * require a real Google login).
 */
async function runE2ERedirect(origin) {
  const label = `E2E redirect lands on ${origin}`;
  const maxHops = Number(process.env.E2E_MAX_REDIRECTS) || 5;
  try {
    // Step 1 — fresh authorize call to harvest a usable `state`.
    const authUrl =
      `${SUPABASE_URL}/auth/v1/authorize?provider=google&skip_http_redirect=true` +
      `&redirect_to=${encodeURIComponent(origin)}`;
    const { res: authRes } = await fetchWithRetry(
      authUrl,
      { headers: { apikey: ANON_KEY } },
      `E2E authorize (${origin})`
    );
    const authBody = await authRes.json().catch(() => null);
    if (!authRes.ok || !authBody?.url) {
      record("fail", label, `authorize step failed: HTTP ${authRes.status}`);
      return;
    }
    const state = new URL(authBody.url).searchParams.get("state");
    if (!state) {
      record("fail", label, "no state returned from /authorize", "Cannot replay callback without state.");
      return;
    }

    // Step 2 — synthesize Google's "user cancelled" callback.
    let next =
      `${SUPABASE_URL}/auth/v1/callback?state=${encodeURIComponent(state)}` +
      `&error=access_denied&error_description=e2e_simulated_cancel`;

    // Step 3 — follow redirects manually so we can inspect each hop.
    const chain = [];
    let finalUrl = null;
    for (let hop = 0; hop < maxHops; hop++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_MS);
      let res;
      try {
        res = await fetch(next, {
          redirect: "manual",
          headers: { apikey: ANON_KEY },
          signal: ctrl.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      chain.push({ hop, status: res.status, url: next });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) break;
        next = new URL(loc, next).toString();
        continue;
      }
      finalUrl = next;
      break;
    }
    if (!finalUrl) finalUrl = next; // hit hop limit; treat current as final

    // Step 4 — assert the final URL's origin matches.
    const summary = originSummary(origin);
    summary.e2e = { hops: chain.length, finalUrl, chain };
    if (originsMatch(finalUrl, origin)) {
      record("pass", label, `final → ${finalUrl} (${chain.length} hop${chain.length === 1 ? "" : "s"})`);
    } else {
      noteMismatch(origin, `e2e final url=${finalUrl}`);
      record(
        "fail",
        label,
        `final → ${finalUrl} (expected origin ${origin}, ${chain.length} hop${chain.length === 1 ? "" : "s"})`,
        "Callback chain ends on the wrong origin — verify URL Configuration → Site URL/Redirect URLs."
      );
    }
  } catch (e) {
    record("fail", label, e.message, "Network or timeout during E2E simulation.");
  }
}

/**
 * Compute a sha256 fingerprint of a secret-ish value, for safe logging.
 * Returns a 12-hex-char prefix (48 bits — enough to confirm "same value
 * across runs" without enabling brute-force recovery for short keys).
 */
function fingerprintSecret(v) {
  if (v === null || v === undefined || v === "") return null;
  return createHash("sha256").update(String(v)).digest("hex").slice(0, 12);
}

/**
 * Build the standalone remediation export document for ONE origin.
 *
 * Captures three blocks:
 *   - meta:        when the export was generated, script-level context
 *   - remediation: the deduped/counted bucket from
 *                  originSummaries[origin].pkce.remediation (deep-copied
 *                  so the file is self-contained)
 *   - config:      every env var / resolved config value referenced by
 *                  any of the remediation hints' `sources` strings, in
 *                  one of three shapes:
 *                    { kind: "public",   value: "<verbatim>" }
 *                    { kind: "resolved", value: "<computed>", source: "..." }
 *                    { kind: "secret",   present: bool, length, sha256_12 }
 *
 * Pure function over its inputs (origin + originSummaries + env-like) so
 * it's unit-testable without touching disk or the live process.env.
 */
function buildRemediationExport(origin, summaries, env = process.env) {
  const summary = summaries[origin] || {};
  const pkce = summary.pkce || {};
  const remediation = pkce.remediation && typeof pkce.remediation === "object"
    ? JSON.parse(JSON.stringify(pkce.remediation))
    : { byKind: {}, ranked: [], totalEvents: 0, uniqueKinds: 0 };

  // Resolve the per-origin callback (mirrors expectedCallback() logic so
  // operators see the EXACT URL their misconfigured Google client should
  // be allowlisted with).
  let resolvedCallback = null;
  let callbackSource = null;
  if (typeof APP_CALLBACKS !== "undefined" && APP_CALLBACKS.has?.(origin)) {
    resolvedCallback = APP_CALLBACKS.get(origin);
    callbackSource = "APP_CALLBACKS override";
  } else {
    const path = env.EXPECTED_CALLBACK_PATH || "/auth/v1/callback";
    resolvedCallback = `${(env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/+$/, "")}${path}`;
    callbackSource = env.APP_CALLBACKS || env.EXPECTED_CALLBACK_PATH
      ? "EXPECTED_CALLBACK_PATH + SUPABASE_URL"
      : "default (/auth/v1/callback on SUPABASE_URL)";
  }

  // Env vars referenced by remediation sources. Each entry classifies
  // the value's sensitivity so the export never leaks raw credentials.
  const config = {
    APP_ORIGINS: { kind: "public", value: env.APP_ORIGINS || env.APP_ORIGIN || null },
    APP_CALLBACKS: { kind: "public", value: env.APP_CALLBACKS || null },
    EXPECTED_CLIENT_ID: { kind: "public", value: env.EXPECTED_CLIENT_ID || null },
    EXPECTED_RESPONSE_TYPE: { kind: "public", value: env.EXPECTED_RESPONSE_TYPE || null },
    EXPECTED_SCOPES: { kind: "public", value: env.EXPECTED_SCOPES || null },
    EXPECTED_CALLBACK_PATH: { kind: "public", value: env.EXPECTED_CALLBACK_PATH || null },
    TOKEN_ENDPOINT_PATH: { kind: "public", value: env.TOKEN_ENDPOINT_PATH || null },
    SUPABASE_URL: { kind: "public", value: env.SUPABASE_URL || env.VITE_SUPABASE_URL || null },
    SUPABASE_PUBLISHABLE_KEY: {
      kind: "secret",
      present: !!(env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY),
      length: (env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || "").length || null,
      sha256_12: fingerprintSecret(env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY),
    },
    resolvedCallbackUrlForOrigin: { kind: "resolved", value: resolvedCallback, source: callbackSource },
    resolvedTokenEndpointUrl: {
      kind: "resolved",
      value: typeof TOKEN_ENDPOINT_URL === "string" ? TOKEN_ENDPOINT_URL : null,
      source: "SUPABASE_URL + TOKEN_ENDPOINT_PATH",
    },
  };

  return {
    schema: "lovable.oauth.remediation-export.v1",
    meta: {
      generatedAt: new Date().toISOString(),
      origin,
      originInAppOrigins: APP_ORIGINS.includes(origin),
      script: "scripts/check-google-oauth.mjs",
      // CI breadcrumbs (handy when the file is attached to a bug report).
      ci: {
        repository: env.GITHUB_REPOSITORY || null,
        ref: env.GITHUB_REF_NAME || null,
        sha: env.GITHUB_SHA || null,
        runId: env.GITHUB_RUN_ID || null,
      },
    },
    remediation,
    mismatches: Array.isArray(summary.mismatches) ? [...summary.mismatches] : [],
    config,
  };
}

/**
 * Slugify an origin URL into a filesystem-safe filename component.
 * "https://app.example.com" → "https-app-example-com"
 */
function originSlug(origin) {
  return String(origin).replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * Drive the --export-remediation flag end-to-end: resolve the target
 * origin(s), build the export document(s), write to disk. Returns a list
 * of { origin, path } pairs for logging.
 */
async function runRemediationExport() {
  if (!CLI.exportRemediation) return [];
  const fs = await import("node:fs");
  const path = await import("node:path");
  const targets = CLI.exportRemediation === "all"
    ? APP_ORIGINS.slice()
    : [CLI.exportRemediation];

  // Validate each target is an origin we actually probed (otherwise the
  // export would be empty and confusing).
  for (const o of targets) {
    if (!APP_ORIGINS.includes(o)) {
      console.error(
        `${YELLOW}--export-remediation=${o}: origin is not in APP_ORIGINS [${APP_ORIGINS.join(", ")}]; the export will reflect what was probed, which may be empty.${RESET}`
      );
    }
  }

  const written = [];
  if (CLI.exportRemediation === "all") {
    const dir = CLI.exportOut || "./oauth-remediation";
    fs.mkdirSync(dir, { recursive: true });
    for (const o of targets) {
      const file = path.join(dir, `${originSlug(o)}.json`);
      const doc = buildRemediationExport(o, originSummaries);
      fs.writeFileSync(file, JSON.stringify(doc, null, 2) + "\n");
      written.push({ origin: o, path: file });
    }
  } else {
    const o = targets[0];
    const file = CLI.exportOut || `./oauth-remediation-${originSlug(o)}.json`;
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    const doc = buildRemediationExport(o, originSummaries);
    fs.writeFileSync(file, JSON.stringify(doc, null, 2) + "\n");
    written.push({ origin: o, path: file });
  }
  return written;
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
      tokenEndpoint: {
        path: TOKEN_ENDPOINT_PATH,
        url: TOKEN_ENDPOINT_URL || null,
        overridden: !!process.env.TOKEN_ENDPOINT_PATH,
        retry: {
          ...TOKEN_RETRY_OPTS,
          overrides: {
            timeoutMs: !!process.env.TOKEN_HTTP_TIMEOUT_MS,
            maxRetries: !!process.env.TOKEN_HTTP_MAX_RETRIES,
            backoffMs: !!process.env.TOKEN_HTTP_BACKOFF_MS,
            backoffFactor: !!process.env.TOKEN_HTTP_BACKOFF_FACTOR,
            backoffMaxMs: !!process.env.TOKEN_HTTP_BACKOFF_MAX_MS,
            jitterMs: !!process.env.TOKEN_HTTP_JITTER_MS,
          },
        },
      },
      appOrigins: APP_ORIGINS,
      ranAt: new Date().toISOString(),
      env: {
        SUPABASE_URL: !!SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY: !!ANON_KEY,
        APP_ORIGIN: !!process.env.APP_ORIGIN,
        APP_ORIGINS: !!process.env.APP_ORIGINS,
        TOKEN_ENDPOINT_PATH: !!process.env.TOKEN_ENDPOINT_PATH,
      },
      ci: {
        repository: process.env.GITHUB_REPOSITORY || null,
        ref: process.env.GITHUB_REF_NAME || null,
        sha: process.env.GITHUB_SHA || null,
        runId: process.env.GITHUB_RUN_ID || null,
      },
      origins: Object.fromEntries(
        Object.entries(originSummaries).filter(([k]) => !k.startsWith("__"))
      ),
      tokenAuthHeaders: originSummaries.__token_auth_headers__ || null,
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

  // Optional standalone remediation export (--export-remediation=<origin|all>).
  // Runs after the suite so the exported file reflects whatever remediation
  // hints the validators accumulated this run.
  if (CLI.exportRemediation) {
    try {
      const written = await runRemediationExport();
      for (const w of written) {
        console.log(`${DIM}Remediation export for ${w.origin} written to ${w.path}${RESET}`);
      }
    } catch (e) {
      console.error(`${RED}Failed to write remediation export:${RESET}`, e.message);
    }
  }

  process.exit(exitCode);
}

/**
 * Negative-test pass for PKCE handling. Two probes per origin:
 *
 *   1. OMIT  — call /authorize without code_challenge / method.
 *      Expectation: validatePkce() records a "fail" containing
 *                   "missing code_challenge" (or method).
 *   2. PLAIN — call /authorize with code_challenge_method=plain.
 *      Expectation: validatePkce() records a "fail" on the
 *                   "PKCE method is S256" check.
 *
 * For each probe we run the validator inside withCapture() so its
 * output never reaches the live `results` array, then assert the
 * captured entries contain the expected failure pattern. The
 * meta-assertion itself is what gets recorded into `results`, so
 * the suite stays green when the validator behaves correctly.
 */
async function runPkceNegativeTests(origin) {
  const probes = [
    {
      name: "omit code_challenge",
      label: `Negative: validator rejects missing PKCE (${origin})`,
      query: "",
      expect: (entries) =>
        entries.some(
          (e) =>
            e.state === "fail" &&
            e.label.startsWith("PKCE forwarded to Google") &&
            /missing code_challenge/i.test(e.detail || "")
        ),
      expectDescription: "fail on 'PKCE forwarded to Google' with 'missing code_challenge'",
    },
    {
      name: "code_challenge_method=plain",
      label: `Negative: validator rejects plain PKCE (${origin})`,
      query: `&code_challenge=${"a".repeat(43)}&code_challenge_method=plain`,
      expect: (entries) =>
        entries.some(
          (e) =>
            e.state === "fail" &&
            e.label.startsWith("PKCE method is S256") &&
            /code_challenge_method=plain/i.test(e.detail || "")
        ),
      expectDescription: "fail on 'PKCE method is S256' with 'code_challenge_method=plain'",
    },
  ];

  for (const probe of probes) {
    try {
      const url =
        `${SUPABASE_URL}/auth/v1/authorize?provider=google&skip_http_redirect=true` +
        `&redirect_to=${encodeURIComponent(origin)}` +
        probe.query;
      const { res } = await fetchWithRetry(
        url,
        { headers: { apikey: ANON_KEY } },
        `negative ${probe.name} (${origin})`
      );
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.url) {
        // Server itself rejected the request — the validator never gets
        // to run, so we can't grade it. Treat as warn (not a regression).
        record(
          "warn",
          probe.label,
          `server rejected probe (HTTP ${res.status}); cannot grade validator`,
          "Server-side rejection means the misconfiguration is caught earlier than the validator — usually fine."
        );
        continue;
      }

      // The probe with omitted PKCE has no `sent` to compare against;
      // pass placeholders so validatePkce can still run normally.
      const sent = { challenge: "x".repeat(43), method: "S256" };
      const { buf } = await withCapture(async () => {
        validatePkce(body.url, sent, origin);
      });

      if (probe.expect(buf)) {
        record("pass", probe.label, `captured ${buf.length} entr${buf.length === 1 ? "y" : "ies"}, matched expected failure`);
      } else {
        const summary = buf
          .map((e) => `[${e.state}] ${e.label}: ${e.detail || ""}`)
          .join(" | ") || "(no entries)";
        record(
          "fail",
          probe.label,
          `expected ${probe.expectDescription}; got: ${summary}`,
          "The validator regressed — it should have flagged this misconfiguration."
        );
      }
    } catch (e) {
      record("fail", probe.label, e.message, "Network or timeout running negative probe.");
    }
  }
}

/**
 * Probe Supabase's PKCE token-exchange endpoint with a synthetic body to
 * verify it accepts the documented param shape. We can't perform a *real*
 * exchange (that requires a code obtained via Google's consent screen),
 * but we can:
 *
 *   1. Send a well-formed POST to /auth/v1/token?grant_type=pkce with a
 *      bogus auth_code + a real PKCE code_verifier. A correctly-configured
 *      GoTrue replies with HTTP 4xx + an "invalid grant"-style error
 *      (because the code is fake) — NOT "invalid request" or "missing
 *      parameter" (which would mean the param schema is wrong).
 *   2. Send the same payload with grant_type=password to confirm the
 *      endpoint distinguishes grant types and doesn't silently accept
 *      mismatched ones.
 *   3. Confirm the response carries the expected JSON content-type and
 *      CORS-friendly headers (apikey is honored; no auth audience surprise).
 *
 * All three checks are cheap (one POST each) and run by default. Disable
 * with TOKEN_EXCHANGE_CHECK=false if your CI runs against a project where
 * outbound POSTs to /auth/v1/token are rate-limited.
 */
async function runTokenExchangeCheck() {
  const verifier = randomBytes(32).toString("base64url");
  const fakeCode = "lovable-oauth-check-synthetic-" + randomBytes(8).toString("hex");

  // GoTrue documents the OAuth-style error envelope as `{ error, error_description }`
  // and falls back to `{ msg, code }` on some legacy paths. We require the
  // canonical fields to be present AND match an explicit allow-list per probe,
  // so a future GoTrue change that swaps codes around fails CI loudly.
  //
  // STRICT CONTRACT POLICY (no fallback behavior):
  //   - Every positive probe MUST declare BOTH `expectedErrorCodes` (a
  //     non-empty allow-list of canonical `error` codes) AND
  //     `expectedDescriptionRe` (a regex the `error_description`/`msg` must
  //     match). Omitting either is a CI-failing configuration error in
  //     tokenProbe — there is no implicit "anything goes" fallback.
  //   - A description mismatch is a hard `fail`, not a `warn`. Drift in
  //     user-visible error text is a regression we want to surface loudly.
  //   - Negative-contract probes (e.g. malformed body, content-type)
  //     intentionally opt out via `allowMissingContract: true` because
  //     they assert on transport-level behavior, not envelope shape.

  // ---- Probe 1: correct shape, bogus code → grant-layer rejection.
  // Allow-list is the documented set of GoTrue error codes for "the request
  // shape is fine but the grant material is wrong". Description regex pins
  // the wording families GoTrue uses across versions for this case.
  await tokenProbe({
    label: "Token endpoint accepts PKCE grant shape",
    grant: "pkce",
    body: { auth_code: fakeCode, code_verifier: verifier },
    expectStatus: (s) => s >= 400 && s < 500,
    expectedErrorCodes: [
      "invalid_grant",
      "invalid_request",
      "flow_state_not_found",
      "bad_code_verifier",
    ],
    expectedDescriptionRe: /\b(invalid|expired|not\s*found|bad|flow[_\s-]?state|code|grant|verifier)\b/i,
    rejectError: (err) =>
      /missing|required|code_verifier.*required|auth_code.*required/i.test(
        `${err.error_description || err.msg || ""}`
      ),
    rejectHint:
      "GoTrue rejected our request as malformed — the param schema this script sends (auth_code + code_verifier) no longer matches the deployed version.",
  });

  // ---- Probe 2: wrong grant_type=password with PKCE body. The endpoint must
  // refuse to silently treat the body as PKCE; allow-list covers both the
  // "unsupported grant" rejection and the "validation failed" rejection
  // depending on which layer catches it first.
  await tokenProbe({
    label: "Token endpoint distinguishes grant_type",
    grant: "password",
    body: { auth_code: fakeCode, code_verifier: verifier },
    expectStatus: (s) => s >= 400 && s < 500,
    expectedErrorCodes: [
      "unsupported_grant_type",
      "invalid_grant",
      "invalid_request",
      "validation_failed",
    ],
    expectedDescriptionRe: /\b(grant|password|email|missing|invalid|unsupported|validation)\b/i,
    rejectError: () => false,
    extraDetail: "POST grant_type=password with PKCE body should be rejected",
  });

  // ---- Probe 3: missing code_verifier — error MUST point at the missing
  // field. The description regex is intentionally narrow (mentions
  // verifier/missing/required) so a generic "invalid_grant" without a
  // pointer-to-the-bad-field fails the contract.
  await tokenProbe({
    label: "Token endpoint requires code_verifier",
    grant: "pkce",
    body: { auth_code: fakeCode }, // intentionally omit code_verifier
    expectStatus: (s) => s >= 400 && s < 500,
    expectedErrorCodes: [
      "invalid_request",
      "invalid_grant",
      "validation_failed",
    ],
    expectedDescriptionRe: /\b(code_verifier|verifier|missing|required)\b/i,
    rejectError: () => false,
  });

  // ---- Probe 4: response is non-JSON (Accept: text/html). Negative-contract
  // probe — opts out of the envelope allow-lists because the assertion is
  // about Content-Type, not error vocabulary.
  await tokenProbe({
    label: "Token endpoint contract handler fires on non-JSON content-type",
    grant: "pkce",
    body: { auth_code: fakeCode, code_verifier: verifier },
    expectStatus: () => true, // any status — we only care about content-type
    expectedErrorCodes: null,
    expectedDescriptionRe: null,
    allowMissingContract: true,
    rejectError: () => false,
    requestOverrides: {
      headers: {
        Accept: "text/html, */*;q=0.1",
      },
    },
    negativeContract: "non_json_content_type",
  });

  // ---- Probe 5: send malformed JSON body. Negative-contract probe — opts
  // out of envelope allow-lists for the same reason as probe 4.
  await tokenProbe({
    label: "Token endpoint contract handler fires on malformed JSON body",
    grant: "pkce",
    body: { auth_code: fakeCode, code_verifier: verifier },
    expectStatus: () => true,
    expectedErrorCodes: null,
    expectedDescriptionRe: null,
    allowMissingContract: true,
    rejectError: () => false,
    requestOverrides: {
      rawBody: "{this-is-not-json: ,,",
      headers: {
        "Content-Type": "text/plain",
        Accept: "text/html, */*;q=0.1",
      },
    },
    negativeContract: "malformed_json_body",
  });

  // ---- Probe 6..N: header-sensitivity check (audience/auth headers).
  await runTokenAuthHeaderCheck();
}

/**
 * Per-origin malformed-PKCE probe suite.
 *
 * Issues a battery of synthetic POSTs to the token endpoint that each
 * violate exactly one PKCE contract from RFC 7636. The token server is
 * expected to reject every one of them with a 4xx + a topical error
 * code/description. The exact (status, error, error_description) tuple
 * is recorded per-origin so CI artifacts show, for each origin, that:
 *
 *   • code_verifier is REQUIRED (omitted)
 *   • code_verifier rejects too-short values         (<43 chars)
 *   • code_verifier rejects too-long values          (>128 chars)
 *   • code_verifier rejects standard-base64 chars    ('+' '/' '=')
 *   • code_verifier rejects whitespace               (' ', '\t')
 *   • code_verifier rejects non-ASCII                (NBSP)
 *   • code_verifier rejects non-string types         (number, null)
 *
 * A probe PASSES when:
 *   - HTTP status is 4xx (we sent a malformed payload), AND
 *   - response carries a non-empty `error` field, AND
 *   - response carries a non-empty `error_description`/`msg`.
 *
 * A probe FAILS when:
 *   - HTTP is 2xx/3xx/5xx, OR
 *   - error envelope is missing or empty, OR
 *   - the response is byte-identical to the BASELINE probe (which uses a
 *     well-formed-but-bogus payload). Identical responses prove the server
 *     isn't actually inspecting the malformed field — it's failing later
 *     at code lookup, which would let a malformed verifier slip through if
 *     the code happened to be valid.
 *
 * The synthetic auth_code is freshly randomized per origin so cached/replayed
 * responses can't mask bugs. We never consume a real auth code.
 */
async function runMalformedPkceProbes(origin) {
  const summary = originSummary(origin);
  const fakeCode = "lovable-oauth-check-malformed-" + randomBytes(8).toString("hex");
  const goodVerifier = randomBytes(32).toString("base64url"); // 43-char base64url
  const url = `${TOKEN_ENDPOINT_URL}?grant_type=pkce`;

  // Cases. `body` is the JSON payload sent. `expectErrorRe` is matched against
  // either `error` or `error_description` to confirm the rejection is *about*
  // the broken field — not a generic "invalid_grant" that could be hiding a
  // missing validation.
  const cases = [
    {
      id: "baseline_well_formed",
      desc: "well-formed PKCE shape with bogus code (control)",
      body: { auth_code: fakeCode, code_verifier: goodVerifier },
      // Baseline is allowed to return any 4xx grant error — we don't assert
      // a topical regex, we just capture it for sameness comparison below.
      expectErrorRe: /./,
      mustDifferFromBaseline: false,
    },
    {
      id: "missing_code_verifier",
      desc: "code_verifier omitted entirely",
      body: { auth_code: fakeCode },
      expectErrorRe: /code[_ ]?verifier|verifier|missing|required|invalid_request/i,
    },
    {
      id: "empty_code_verifier",
      desc: "code_verifier is an empty string",
      body: { auth_code: fakeCode, code_verifier: "" },
      expectErrorRe: /code[_ ]?verifier|verifier|empty|missing|required|invalid/i,
    },
    {
      id: "too_short_code_verifier",
      desc: "code_verifier is 42 chars (RFC min is 43)",
      body: { auth_code: fakeCode, code_verifier: "a".repeat(42) },
      expectErrorRe: /verifier|length|short|invalid|bad_code_verifier|invalid_grant/i,
    },
    {
      id: "too_long_code_verifier",
      desc: "code_verifier is 129 chars (RFC max is 128)",
      body: { auth_code: fakeCode, code_verifier: "a".repeat(129) },
      expectErrorRe: /verifier|length|long|invalid|bad_code_verifier|invalid_grant/i,
    },
    {
      id: "bad_charset_plus",
      desc: "code_verifier contains '+' (standard base64, not base64url)",
      body: { auth_code: fakeCode, code_verifier: "+".repeat(43) },
      expectErrorRe: /verifier|invalid|bad_code_verifier|invalid_grant/i,
    },
    {
      id: "bad_charset_padding",
      desc: "code_verifier contains '=' padding",
      body: { auth_code: fakeCode, code_verifier: "a".repeat(42) + "=" },
      expectErrorRe: /verifier|invalid|bad_code_verifier|invalid_grant/i,
    },
    {
      id: "whitespace_code_verifier",
      desc: "code_verifier contains spaces and a tab",
      body: { auth_code: fakeCode, code_verifier: "a".repeat(20) + " \t" + "b".repeat(21) },
      expectErrorRe: /verifier|invalid|bad_code_verifier|invalid_grant/i,
    },
    {
      id: "non_ascii_code_verifier",
      desc: "code_verifier contains a non-breaking space (U+00A0)",
      body: { auth_code: fakeCode, code_verifier: "a".repeat(21) + "\u00A0" + "b".repeat(21) },
      expectErrorRe: /verifier|invalid|bad_code_verifier|invalid_grant/i,
    },
    {
      id: "non_string_code_verifier",
      desc: "code_verifier is a number, not a string",
      body: { auth_code: fakeCode, code_verifier: 12345 },
      expectErrorRe: /verifier|invalid|type|string|validation|invalid_request/i,
    },
    {
      id: "null_code_verifier",
      desc: "code_verifier is JSON null",
      body: { auth_code: fakeCode, code_verifier: null },
      expectErrorRe: /verifier|missing|required|null|invalid|invalid_request/i,
    },
    // ── URL-safe vs standard base64 charset attacks ─────────────────────
    // RFC 7636 §4.1 requires `code_verifier = unreserved-char` where
    // unreserved-char ∈ [A-Z a-z 0-9 - . _ ~]. Standard-base64 punctuation
    // ('+', '/') is NOT in that grammar; padding ('=') is explicitly
    // forbidden; URL-safe base64 substitutions ('-', '_') ARE allowed but
    // must not be silently translated to/from '+'/'/'. The cases below
    // exercise each direction.
    {
      id: "bad_charset_slash",
      desc: "code_verifier contains '/' (standard base64, not base64url)",
      body: { auth_code: fakeCode, code_verifier: "/".repeat(43) },
      expectErrorRe: /verifier|invalid|bad_code_verifier|invalid_grant/i,
    },
    {
      id: "bad_charset_plus_slash_mixed",
      desc: "code_verifier mixes '+' and '/' (full standard-base64 alphabet violation)",
      body: {
        auth_code: fakeCode,
        code_verifier: "+/".repeat(21) + "+", // 43 chars, alternating +/ then '+'
      },
      expectErrorRe: /verifier|invalid|bad_code_verifier|invalid_grant/i,
    },
    {
      id: "bad_charset_url_unreserved_extras",
      desc: "code_verifier contains characters outside RFC 3986 unreserved set ('!', '*')",
      body: {
        auth_code: fakeCode,
        code_verifier: "a".repeat(20) + "!*" + "b".repeat(21),
      },
      expectErrorRe: /verifier|invalid|bad_code_verifier|invalid_grant/i,
    },
    {
      id: "bad_charset_percent_encoded",
      desc: "code_verifier contains a percent-encoded sequence ('%2B' should not auto-decode to '+')",
      body: {
        auth_code: fakeCode,
        code_verifier: "a".repeat(20) + "%2B" + "b".repeat(20),
      },
      expectErrorRe: /verifier|invalid|bad_code_verifier|invalid_grant/i,
    },
    // ── Mixed padding scenarios ─────────────────────────────────────────
    // base64url is supposed to OMIT padding, and any '=' is a contract
    // violation. We test single-trailing, double-trailing, leading,
    // embedded, and a "valid-base64-with-padding" shape that would parse
    // under permissive decoders.
    {
      id: "bad_padding_double_trailing",
      desc: "code_verifier ends with '==' (double padding)",
      body: { auth_code: fakeCode, code_verifier: "a".repeat(41) + "==" },
      expectErrorRe: /verifier|invalid|bad_code_verifier|invalid_grant|padding/i,
    },
    {
      id: "bad_padding_leading",
      desc: "code_verifier starts with '=' (leading padding — never valid)",
      body: { auth_code: fakeCode, code_verifier: "=" + "a".repeat(42) },
      expectErrorRe: /verifier|invalid|bad_code_verifier|invalid_grant|padding/i,
    },
    {
      id: "bad_padding_embedded",
      desc: "code_verifier contains '=' embedded mid-string (never valid)",
      body: {
        auth_code: fakeCode,
        code_verifier: "a".repeat(20) + "=" + "b".repeat(22),
      },
      expectErrorRe: /verifier|invalid|bad_code_verifier|invalid_grant|padding/i,
    },
    {
      id: "bad_padding_standard_b64_full",
      desc: "code_verifier is well-formed STANDARD base64 (with '+', '/', '=') — full charset confusion",
      body: {
        auth_code: fakeCode,
        // 44-char standard base64 with padding — would decode under a
        // permissive Buffer.from(s, 'base64') call. Tests that GoTrue
        // doesn't quietly normalize standard → url-safe before validating.
        code_verifier: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA+/==",
      },
      expectErrorRe: /verifier|invalid|bad_code_verifier|invalid_grant|padding|length/i,
    },
    {
      id: "bad_padding_only_equals",
      desc: "code_verifier is 43 '=' characters (padding-only, no payload)",
      body: { auth_code: fakeCode, code_verifier: "=".repeat(43) },
      expectErrorRe: /verifier|invalid|bad_code_verifier|invalid_grant|padding/i,
    },
  ];

  /** @type {Record<string, any>} */
  const results = {};
  let baselineSig = null;
  const headerKeys = ["apikey", "Authorization", "Content-Type"];

  for (const c of cases) {
    const label = `Token endpoint rejects malformed PKCE — ${c.desc} (${origin})`;
    const payloadKeys = Object.keys(c.body).sort();
    let entry = {
      id: c.id,
      desc: c.desc,
      origin,
      request: {
        method: "POST",
        url,
        grantType: "pkce",
        grantTypeSource: "query",
        payloadKeys,
        // Capture the SHAPE of code_verifier (type/length) without leaking
        // the value itself (irrelevant here, but consistent with the rest
        // of the report's secrets-handling discipline).
        codeVerifier: c.body.code_verifier === undefined
          ? { present: false }
          : c.body.code_verifier === null
            ? { present: true, type: "null" }
            : {
                present: true,
                type: typeof c.body.code_verifier,
                length: typeof c.body.code_verifier === "string" ? c.body.code_verifier.length : null,
              },
        headerKeys,
      },
    };

    try {
      const { res, attempts, elapsedMs } = await fetchWithRetry(
        url,
        {
          method: "POST",
          headers: {
            apikey: ANON_KEY,
            Authorization: `Bearer ${ANON_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(c.body),
        },
        `POST ${TOKEN_ENDPOINT_PATH} malformed-pkce/${c.id}`,
        TOKEN_RETRY_OPTS
      );
      const text = await res.text();
      let parsed = null;
      try { parsed = JSON.parse(text); } catch { /* non-json */ }
      const errorCode = parsed?.error || parsed?.code || null;
      const errorDescription = parsed?.error_description || parsed?.msg || null;
      const sig = `${res.status}|${errorCode || ""}|${errorDescription || ""}`;

      entry = {
        ...entry,
        status: res.status,
        attempts,
        elapsedMs,
        contentType: res.headers.get("content-type") || "",
        error: errorCode,
        errorDescription,
        bodyKeys: parsed ? Object.keys(parsed) : null,
        bodySnippet: text.slice(0, 200),
        signature: sig,
      };

      if (c.id === "baseline_well_formed") {
        baselineSig = sig;
        entry.verdict = "baseline";
        record(
          "pass",
          label,
          `baseline captured: HTTP ${res.status} error="${errorCode || ""}" desc="${(errorDescription || "").slice(0, 80)}"`,
          undefined,
          entry
        );
      } else {
        const checks = {
          is4xx: res.status >= 400 && res.status < 500,
          hasError: !!errorCode,
          hasDescription: !!errorDescription,
          descriptionMatches: errorDescription
            ? c.expectErrorRe.test(errorDescription) || (errorCode && c.expectErrorRe.test(errorCode))
            : false,
          differsFromBaseline: baselineSig ? sig !== baselineSig : true,
        };
        entry.checks = checks;

        const failures = [];
        if (!checks.is4xx) failures.push(`expected 4xx, got HTTP ${res.status}`);
        if (!checks.hasError) failures.push("missing `error` field");
        if (!checks.hasDescription) failures.push("missing `error_description`/`msg`");
        if (!checks.descriptionMatches && checks.hasDescription) {
          failures.push(
            `error/description does not reference the malformed field (expected match for ${c.expectErrorRe})`
          );
        }
        if (!checks.differsFromBaseline) {
          failures.push(
            "response is byte-identical to the well-formed baseline — server isn't actually validating this case"
          );
        }

        if (failures.length === 0) {
          entry.verdict = "pass";
          record(
            "pass",
            label,
            `HTTP ${res.status} error="${errorCode}" desc="${(errorDescription || "").slice(0, 80)}"`,
            undefined,
            entry
          );
        } else {
          entry.verdict = "fail";
          entry.failureReasons = failures;
          record(
            "fail",
            label,
            failures.join("; ") + ` (HTTP ${res.status}, body: ${text.slice(0, 200)})`,
            "GoTrue should reject malformed PKCE input with a topical 4xx error envelope. If this passes the gate, real users with corrupt verifiers will get cryptic downstream errors instead of an actionable message.",
            entry
          );
          noteMismatch(origin, `malformed-pkce/${c.id}: ${failures[0]}`);
        }
      }
    } catch (e) {
      entry.verdict = "error";
      entry.error = e.message;
      record(
        "fail",
        label,
        e.message,
        "Network or timeout while probing token endpoint — re-run, or raise TOKEN_HTTP_* retry limits.",
        entry
      );
      noteMismatch(origin, `malformed-pkce/${c.id}: network error`);
    }

    results[c.id] = entry;
  }

  // Stash the full per-case breakdown on the origin summary so report.json
  // surfaces a single `origins[origin].malformedPkce` block per origin.
  summary.malformedPkce = {
    endpoint: TOKEN_ENDPOINT_URL,
    baselineSignature: baselineSig,
    cases: results,
    counts: {
      total: cases.length,
      passed: Object.values(results).filter((r) => r.verdict === "pass" || r.verdict === "baseline").length,
      failed: Object.values(results).filter((r) => r.verdict === "fail").length,
      errored: Object.values(results).filter((r) => r.verdict === "error").length,
    },
  };
}

/**
 * Per-origin malformed-`code_challenge` probe suite.
 *
 * Companion to runMalformedPkceProbes() — that suite mutates `code_verifier`
 * (the field GoTrue ACTUALLY consumes at /auth/v1/token). This suite mutates
 * `code_challenge`, which the token endpoint MUST NOT accept as a substitute
 * for `code_verifier`. The catalog mirrors RFC 7636 §4.2 (S256 challenge
 * format) so we exercise the same byte-level failure modes:
 *
 *   • code_challenge OMITTED (verifier present)   — control: must succeed
 *     past validation (verifier alone is what GoTrue needs).
 *   • code_challenge present, verifier MISSING    — must reject for the
 *     missing verifier; MUST NOT silently accept the challenge as a verifier.
 *   • code_challenge wrong length, charset, padding, whitespace, non-ASCII,
 *     non-string, null — sent ALONGSIDE a valid verifier. Server may
 *     either ignore (preferred — unknown field) or reject (fine — strict
 *     schema). What it MUST NOT do is accept the malformed challenge in
 *     ANY way that changes the verdict relative to the well-formed
 *     baseline (i.e. cause a 5xx, change the error code, or 2xx).
 *
 * Each case records (status, error, error_description, signature, checks,
 * failureReasons) into originSummaries[origin].malformedCodeChallenge.
 *
 * Synthetic auth_code is freshly randomized per origin so cached/replayed
 * responses can't mask bugs. We never consume a real auth code.
 */
async function runMalformedCodeChallengeProbes(origin) {
  const summary = originSummary(origin);
  const fakeCode = "lovable-oauth-check-mc-" + randomBytes(8).toString("hex");
  const goodVerifier = randomBytes(32).toString("base64url"); // 43-char base64url
  const goodChallenge = s256Challenge(goodVerifier);          // 43-char base64url
  const url = `${TOKEN_ENDPOINT_URL}?grant_type=pkce`;

  // For each case, `body` is the JSON payload sent. `mode` controls the
  // verdict logic:
  //   - "baseline":             control — verifier-only, no challenge.
  //   - "substitution":         challenge present, verifier missing →
  //                             error MUST point at code_verifier, NOT accept
  //                             the challenge.
  //   - "noise_with_verifier":  malformed challenge sent ALONGSIDE a valid
  //                             verifier. Server may ignore the unknown
  //                             field or reject it; either is fine as long
  //                             as the verdict is still a clean 4xx and the
  //                             status class matches the baseline (a 5xx or
  //                             2xx flip means the challenge perturbed the
  //                             pipeline in a dangerous way).
  const cases = [
    {
      id: "baseline_verifier_only",
      desc: "verifier-only, no code_challenge (control)",
      body: { auth_code: fakeCode, code_verifier: goodVerifier },
      mode: "baseline",
    },
    {
      id: "challenge_substitution_no_verifier",
      desc: "code_challenge present, code_verifier MISSING (substitution attack)",
      body: { auth_code: fakeCode, code_challenge: goodChallenge, code_challenge_method: "S256" },
      mode: "substitution",
      // Failure must reference the missing verifier. If GoTrue ever started
      // accepting a challenge in lieu of a verifier (treating them as
      // interchangeable) the auth model collapses — the verifier is the
      // ONLY proof-of-possession secret.
      expectErrorRe: /code[_ ]?verifier|verifier|missing|required|invalid_request|invalid_grant/i,
    },
    {
      id: "missing_code_challenge_with_verifier",
      desc: "code_challenge OMITTED, valid verifier (should look like baseline)",
      body: { auth_code: fakeCode, code_verifier: goodVerifier },
      mode: "noise_with_verifier",
    },
    {
      id: "empty_code_challenge",
      desc: "code_challenge is an empty string (with valid verifier)",
      body: { auth_code: fakeCode, code_verifier: goodVerifier, code_challenge: "" },
      mode: "noise_with_verifier",
    },
    {
      id: "too_short_code_challenge",
      desc: "code_challenge is 42 chars (S256 is exactly 43)",
      body: { auth_code: fakeCode, code_verifier: goodVerifier, code_challenge: "a".repeat(42) },
      mode: "noise_with_verifier",
    },
    {
      id: "too_long_code_challenge",
      desc: "code_challenge is 44 chars (S256 is exactly 43)",
      body: { auth_code: fakeCode, code_verifier: goodVerifier, code_challenge: "a".repeat(44) },
      mode: "noise_with_verifier",
    },
    {
      id: "bad_charset_plus_code_challenge",
      desc: "code_challenge contains '+' (standard base64, not base64url)",
      body: { auth_code: fakeCode, code_verifier: goodVerifier, code_challenge: "+".repeat(43) },
      mode: "noise_with_verifier",
    },
    {
      id: "bad_charset_slash_code_challenge",
      desc: "code_challenge contains '/' (standard base64, not base64url)",
      body: { auth_code: fakeCode, code_verifier: goodVerifier, code_challenge: "/".repeat(43) },
      mode: "noise_with_verifier",
    },
    {
      id: "bad_charset_padding_code_challenge",
      desc: "code_challenge contains '=' padding suffix",
      body: { auth_code: fakeCode, code_verifier: goodVerifier, code_challenge: "a".repeat(42) + "=" },
      mode: "noise_with_verifier",
    },
    {
      id: "whitespace_code_challenge",
      desc: "code_challenge contains spaces and a tab",
      body: {
        auth_code: fakeCode,
        code_verifier: goodVerifier,
        code_challenge: "a".repeat(20) + " \t" + "b".repeat(21),
      },
      mode: "noise_with_verifier",
    },
    {
      id: "non_ascii_code_challenge",
      desc: "code_challenge contains a non-breaking space (U+00A0)",
      body: {
        auth_code: fakeCode,
        code_verifier: goodVerifier,
        code_challenge: "a".repeat(21) + "\u00A0" + "b".repeat(21),
      },
      mode: "noise_with_verifier",
    },
    {
      id: "non_string_code_challenge",
      desc: "code_challenge is a number, not a string",
      body: { auth_code: fakeCode, code_verifier: goodVerifier, code_challenge: 12345 },
      mode: "noise_with_verifier",
    },
    {
      id: "null_code_challenge",
      desc: "code_challenge is JSON null",
      body: { auth_code: fakeCode, code_verifier: goodVerifier, code_challenge: null },
      mode: "noise_with_verifier",
    },
    {
      id: "wrong_method_plain_with_verifier",
      desc: "code_challenge_method=plain (S256 is the only allowed value at exchange)",
      body: {
        auth_code: fakeCode,
        code_verifier: goodVerifier,
        code_challenge: goodVerifier,
        code_challenge_method: "plain",
      },
      mode: "noise_with_verifier",
    },
    // ── URL-safe vs standard base64 charset attacks (challenge edition) ─
    // S256 challenges are base64url(SHA-256(verifier)) per RFC 7636 §4.2,
    // exactly 43 chars, no padding, charset [A-Z a-z 0-9 - _]. We probe
    // each forbidden character family and ensure the noise doesn't perturb
    // the verdict relative to baseline.
    {
      id: "bad_charset_url_unreserved_extras_code_challenge",
      desc: "code_challenge contains '!' and '*' (outside RFC 3986 unreserved)",
      body: {
        auth_code: fakeCode,
        code_verifier: goodVerifier,
        code_challenge: "a".repeat(20) + "!*" + "b".repeat(21),
      },
      mode: "noise_with_verifier",
    },
    {
      id: "bad_charset_plus_slash_mixed_code_challenge",
      desc: "code_challenge mixes '+' and '/' (full standard-base64 alphabet violation)",
      body: {
        auth_code: fakeCode,
        code_verifier: goodVerifier,
        code_challenge: "+/".repeat(21) + "+",
      },
      mode: "noise_with_verifier",
    },
    {
      id: "bad_charset_percent_encoded_code_challenge",
      desc: "code_challenge contains percent-encoded sequence ('%2B')",
      body: {
        auth_code: fakeCode,
        code_verifier: goodVerifier,
        code_challenge: "a".repeat(20) + "%2B" + "b".repeat(20),
      },
      mode: "noise_with_verifier",
    },
    // ── Mixed padding scenarios (challenge edition) ─────────────────────
    {
      id: "bad_padding_double_trailing_code_challenge",
      desc: "code_challenge ends with '==' (double padding)",
      body: {
        auth_code: fakeCode,
        code_verifier: goodVerifier,
        code_challenge: "a".repeat(41) + "==",
      },
      mode: "noise_with_verifier",
    },
    {
      id: "bad_padding_leading_code_challenge",
      desc: "code_challenge starts with '=' (leading padding)",
      body: {
        auth_code: fakeCode,
        code_verifier: goodVerifier,
        code_challenge: "=" + "a".repeat(42),
      },
      mode: "noise_with_verifier",
    },
    {
      id: "bad_padding_embedded_code_challenge",
      desc: "code_challenge contains '=' embedded mid-string",
      body: {
        auth_code: fakeCode,
        code_verifier: goodVerifier,
        code_challenge: "a".repeat(20) + "=" + "b".repeat(22),
      },
      mode: "noise_with_verifier",
    },
    {
      id: "bad_padding_standard_b64_full_code_challenge",
      desc: "code_challenge is well-formed STANDARD base64 (with '+', '/', '=')",
      body: {
        auth_code: fakeCode,
        code_verifier: goodVerifier,
        code_challenge: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA+/==",
      },
      mode: "noise_with_verifier",
    },
    {
      id: "bad_padding_only_equals_code_challenge",
      desc: "code_challenge is 43 '=' characters (padding-only, no payload)",
      body: {
        auth_code: fakeCode,
        code_verifier: goodVerifier,
        code_challenge: "=".repeat(43),
      },
      mode: "noise_with_verifier",
    },
  ];

  /** Capture shape of code_challenge without leaking values. */
  const challengeShape = (v) => {
    if (v === undefined) return { present: false };
    if (v === null) return { present: true, type: "null" };
    return {
      present: true,
      type: typeof v,
      length: typeof v === "string" ? v.length : null,
    };
  };

  /** @type {Record<string, any>} */
  const results = {};
  let baselineSig = null;
  let baselineStatusClass = null;
  const headerKeys = ["apikey", "Authorization", "Content-Type"];

  for (const c of cases) {
    const label = `Token endpoint rejects malformed code_challenge — ${c.desc} (${origin})`;
    const payloadKeys = Object.keys(c.body).sort();
    let entry = {
      id: c.id,
      desc: c.desc,
      origin,
      mode: c.mode,
      request: {
        method: "POST",
        url,
        grantType: "pkce",
        grantTypeSource: "query",
        payloadKeys,
        codeChallenge: challengeShape(c.body.code_challenge),
        codeChallengeMethod: c.body.code_challenge_method ?? null,
        verifierPresent: c.body.code_verifier !== undefined,
        headerKeys,
      },
    };

    try {
      const { res, attempts, elapsedMs } = await fetchWithRetry(
        url,
        {
          method: "POST",
          headers: {
            apikey: ANON_KEY,
            Authorization: `Bearer ${ANON_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(c.body),
        },
        `POST ${TOKEN_ENDPOINT_PATH} malformed-code-challenge/${c.id}`,
        TOKEN_RETRY_OPTS
      );
      const text = await res.text();
      let parsed = null;
      try { parsed = JSON.parse(text); } catch { /* non-json */ }
      const errorCode = parsed?.error || parsed?.code || null;
      const errorDescription = parsed?.error_description || parsed?.msg || null;
      const sig = `${res.status}|${errorCode || ""}|${errorDescription || ""}`;
      const statusClass = res.status >= 200 && res.status < 300
        ? "2xx"
        : res.status >= 300 && res.status < 400
          ? "3xx"
          : res.status >= 400 && res.status < 500
            ? "4xx"
            : "5xx";

      entry = {
        ...entry,
        status: res.status,
        statusClass,
        attempts,
        elapsedMs,
        contentType: res.headers.get("content-type") || "",
        error: errorCode,
        errorDescription,
        bodyKeys: parsed ? Object.keys(parsed) : null,
        bodySnippet: text.slice(0, 200),
        signature: sig,
      };

      if (c.mode === "baseline") {
        baselineSig = sig;
        baselineStatusClass = statusClass;
        entry.verdict = "baseline";
        record(
          "pass",
          label,
          `baseline captured: HTTP ${res.status} error="${errorCode || ""}" desc="${(errorDescription || "").slice(0, 80)}"`,
          undefined,
          entry
        );
      } else if (c.mode === "substitution") {
        // Hard contract: error MUST reference the missing verifier and
        // MUST NOT be a 2xx (which would mean the challenge was accepted
        // as a verifier substitute).
        const checks = {
          is4xx: res.status >= 400 && res.status < 500,
          notAccepted: res.status < 200 || res.status >= 300,
          hasError: !!errorCode,
          hasDescription: !!errorDescription,
          referencesMissingVerifier: errorDescription
            ? c.expectErrorRe.test(errorDescription) || (errorCode && c.expectErrorRe.test(errorCode))
            : false,
        };
        entry.checks = checks;

        const failures = [];
        if (!checks.notAccepted) {
          failures.push(
            `CRITICAL: substitution accepted (HTTP ${res.status}) — server treated code_challenge as a verifier substitute`
          );
        }
        if (!checks.is4xx) failures.push(`expected 4xx, got HTTP ${res.status}`);
        if (!checks.hasError) failures.push("missing `error` field");
        if (!checks.hasDescription) failures.push("missing `error_description`/`msg`");
        if (!checks.referencesMissingVerifier && checks.hasDescription) {
          failures.push(
            `error/description does not reference the missing code_verifier (expected match for ${c.expectErrorRe})`
          );
        }

        if (failures.length === 0) {
          entry.verdict = "pass";
          record(
            "pass",
            label,
            `HTTP ${res.status} error="${errorCode}" desc="${(errorDescription || "").slice(0, 80)}"`,
            undefined,
            entry
          );
        } else {
          entry.verdict = "fail";
          entry.failureReasons = failures;
          record(
            "fail",
            label,
            failures.join("; ") + ` (HTTP ${res.status}, body: ${text.slice(0, 200)})`,
            "GoTrue must NEVER accept code_challenge as a verifier substitute. The verifier is the only proof-of-possession secret in PKCE — a substitution acceptance breaks the entire flow's security model.",
            entry
          );
          noteMismatch(origin, `malformed-code-challenge/${c.id}: ${failures[0]}`);
        }
      } else {
        // c.mode === "noise_with_verifier": malformed challenge alongside
        // a valid verifier. Acceptable outcomes:
        //   (a) server ignores the unknown/malformed challenge entirely →
        //       response is byte-identical to baseline (preferred).
        //   (b) server rejects with a 4xx that mentions the bad field →
        //       fine, schema is strict.
        // UNACCEPTABLE: 5xx (server crashed parsing the field) or 2xx
        // (challenge somehow short-circuited validation).
        const checks = {
          notServerError: res.status < 500,
          notUnexpectedSuccess: res.status < 200 || res.status >= 300,
          statusClassMatchesBaseline: baselineStatusClass
            ? statusClass === baselineStatusClass
            : true,
          hasEnvelope: !!errorCode || !!errorDescription || (res.status >= 200 && res.status < 300),
          identicalToBaseline: baselineSig ? sig === baselineSig : false,
        };
        entry.checks = checks;

        const failures = [];
        if (!checks.notServerError) {
          failures.push(`server error HTTP ${res.status} — malformed challenge crashed the request pipeline`);
        }
        if (!checks.notUnexpectedSuccess) {
          failures.push(`unexpected 2xx HTTP ${res.status} — malformed challenge somehow short-circuited validation`);
        }
        if (!checks.statusClassMatchesBaseline) {
          failures.push(
            `status class ${statusClass} differs from baseline ${baselineStatusClass} — malformed challenge perturbed the verdict`
          );
        }

        if (failures.length === 0) {
          entry.verdict = "pass";
          entry.notes = checks.identicalToBaseline
            ? "byte-identical to baseline (server ignored unknown/malformed challenge)"
            : `differs from baseline but stayed within ${statusClass} (server rejected on schema, fine)`;
          record(
            "pass",
            label,
            `HTTP ${res.status} (${entry.notes})`,
            undefined,
            entry
          );
        } else {
          entry.verdict = "fail";
          entry.failureReasons = failures;
          record(
            "fail",
            label,
            failures.join("; ") + ` (HTTP ${res.status}, body: ${text.slice(0, 200)})`,
            "Malformed code_challenge should be either ignored (unknown field) or rejected with a clean 4xx. A 5xx means the field crashed the parser; a 2xx means it bypassed validation. Both are critical.",
            entry
          );
          noteMismatch(origin, `malformed-code-challenge/${c.id}: ${failures[0]}`);
        }
      }
    } catch (e) {
      entry.verdict = "error";
      entry.error = e.message;
      record(
        "fail",
        label,
        e.message,
        "Network or timeout while probing token endpoint — re-run, or raise TOKEN_HTTP_* retry limits.",
        entry
      );
      noteMismatch(origin, `malformed-code-challenge/${c.id}: network error`);
    }

    results[c.id] = entry;
  }

  // Stash full per-case breakdown so report.json surfaces a single
  // `origins[origin].malformedCodeChallenge` block per origin.
  summary.malformedCodeChallenge = {
    endpoint: TOKEN_ENDPOINT_URL,
    baselineSignature: baselineSig,
    baselineStatusClass,
    cases: results,
    counts: {
      total: cases.length,
      passed: Object.values(results).filter((r) => r.verdict === "pass" || r.verdict === "baseline").length,
      failed: Object.values(results).filter((r) => r.verdict === "fail").length,
      errored: Object.values(results).filter((r) => r.verdict === "error").length,
    },
  };
}

/**
 * Verify that /auth/v1/token actually validates its auth-related headers
 * (`apikey`, `Authorization`) instead of silently accepting/ignoring them.
 *
 * Strategy: send the SAME well-formed body four times with different
 * header combos, then assert the responses differ in the documented way:
 *
 *   A. apikey + Bearer ANON_KEY     → baseline (4xx invalid_grant — bogus code)
 *   B. NO apikey, NO Authorization  → must reject with 401/403, NOT a grant error
 *   C. apikey only (no Authorization) → must succeed past the auth gate
 *      (same 4xx grant error as A — Authorization is optional when apikey present)
 *   D. apikey + Bearer "garbage.jwt.token" → must reject the bad bearer
 *      (401/403) OR return a different error than A (proves the bearer is parsed)
 *
 * If the server returns identical responses for A and B (or A and D), the
 * audience/header validation is broken — anyone could call this endpoint.
 *
 * In addition to the cross-variant signature comparison, each variant's
 * response is validated against an explicit per-header-mode error contract
 * (status range, JSON envelope, error-code vocabulary, description regex).
 * This catches drift where ALL variants degrade in the same direction
 * (e.g. proxy starts returning HTML 502s) which the equality checks alone
 * would miss.
 */

/**
 * Build a structured rawErrorPayload for report.json.
 *
 * GoTrue's /auth/v1/token endpoint can return either the OAuth2 canonical
 * envelope `{ error, error_description, error_uri }` or the legacy GoTrue
 * envelope `{ msg, code, error_code, error_id }`. When a contract assertion
 * breaks, diffs are far more useful if BOTH sets of fields are surfaced
 * verbatim alongside a capped raw body — so reviewers see exactly what
 * GoTrue said, not just what the script normalized.
 *
 * Never includes secrets: the token endpoint does not echo `code_verifier`
 * or `auth_code` in error bodies, so the parsed payload is safe to log.
 * The raw body is capped at RAW_BODY_CAP bytes to avoid giant report.json.
 */
const RAW_BODY_CAP = 1024;
function buildRawErrorPayload({ status, contentType, text, parsed }) {
  const truncated = typeof text === "string" && text.length > RAW_BODY_CAP;
  const rawBody = typeof text === "string" ? text.slice(0, RAW_BODY_CAP) : null;
  const jsonParseable = parsed !== null && parsed !== undefined;
  return {
    status,
    contentType: contentType || null,
    jsonParseable,
    bodyTruncated: truncated,
    bodyByteLength: typeof text === "string" ? text.length : null,
    rawBody,
    canonical: {
      // OAuth 2 / RFC 6749 §5.2
      error: parsed?.error ?? null,
      error_description: parsed?.error_description ?? null,
      error_uri: parsed?.error_uri ?? null,
    },
    legacy: {
      // GoTrue native envelope
      msg: parsed?.msg ?? null,
      code: parsed?.code ?? null,
      error_code: parsed?.error_code ?? null,
      error_id: parsed?.error_id ?? null,
    },
    // All top-level keys observed — flags unexpected fields (e.g.
    // `weak_password`, `mfa_required`) without us having to guess.
    parsedKeys: jsonParseable && typeof parsed === "object" && !Array.isArray(parsed)
      ? Object.keys(parsed).sort()
      : null,
  };
}

/**
 * Project a rawErrorPayload (or any GoTrue error envelope) into a stable,
 * value-free shape suitable for snapshot regression testing.
 *
 * The contract regexes in tokenProbe / runTokenAuthHeaderCheck are
 * intentionally lenient (allow-lists tolerate version drift). This helper
 * powers a TIGHTER second line of defence: snapshot tests that compare a
 * normalized projection of the envelope across runs and surface ANY
 * structural change — a renamed field, a new top-level key, a content-type
 * family flip, a status-class change — before the lenient contract has a
 * chance to silently swallow it.
 *
 * Captured (stable across runs):
 *   - statusClass:           "2xx"|"3xx"|"4xx"|"5xx"|"0xx"|"1xx"|"non-numeric"
 *   - contentTypeFamily:     media type without parameters, lowercased
 *   - canonicalFieldsPresent: which of {error, error_description, error_uri}
 *   - legacyFieldsPresent:   which of {msg, code, error_code, error_id}
 *   - parsedKeys:            sorted top-level keys
 *   - errorCode:             canonical `error` (low-cardinality vocabulary)
 *   - codeFamily:            legacy numeric `code` bucketed
 *   - jsonParseable / bodyTruncated: structural booleans
 *
 * Deliberately NOT captured (volatile / per-request):
 *   - error_description / msg text  (handled by descriptionRe contracts)
 *   - error_id / request IDs        (UUID per request)
 *   - rawBody                       (timestamps, paths, …)
 *   - bodyByteLength                (varies with description text)
 */
function snapshotErrorEnvelope(payload) {
  if (!payload || typeof payload !== "object") {
    return { kind: "empty", payload: payload === undefined ? "undefined" : String(payload) };
  }
  const status = payload.status;
  let statusClass;
  if (typeof status !== "number") statusClass = "non-numeric";
  else if (status === 0) statusClass = "0xx";
  else if (status < 200) statusClass = "1xx";
  else if (status < 300) statusClass = "2xx";
  else if (status < 400) statusClass = "3xx";
  else if (status < 500) statusClass = "4xx";
  else statusClass = "5xx";

  const ctRaw = payload.contentType || "";
  const contentTypeFamily = String(ctRaw).split(";")[0].trim().toLowerCase() || null;

  const canonical = payload.canonical || {};
  const legacy = payload.legacy || {};
  const present = (obj) =>
    Object.entries(obj)
      .filter(([, v]) => v !== null && v !== undefined && v !== "")
      .map(([k]) => k)
      .sort();

  // Bucket the legacy numeric `code` field — values themselves drift
  // (400 vs 422 for the same logical case across versions) but family is stable.
  let codeFamily = null;
  const lc = legacy.code;
  if (typeof lc === "number") {
    if (lc === 0) codeFamily = "0xx";
    else if (lc < 200) codeFamily = "1xx";
    else if (lc < 300) codeFamily = "2xx";
    else if (lc < 400) codeFamily = "3xx";
    else if (lc < 500) codeFamily = "4xx";
    else codeFamily = "5xx";
  } else if (typeof lc === "string" && lc.length > 0) {
    codeFamily = "string";
  }

  return {
    kind: "envelope",
    statusClass,
    contentTypeFamily,
    jsonParseable: !!payload.jsonParseable,
    bodyTruncated: !!payload.bodyTruncated,
    parsedKeys: Array.isArray(payload.parsedKeys) ? [...payload.parsedKeys].sort() : null,
    canonicalFieldsPresent: present(canonical),
    legacyFieldsPresent: present(legacy),
    errorCode: typeof canonical.error === "string" ? canonical.error.toLowerCase() : null,
    codeFamily,
  };
}
async function runTokenAuthHeaderCheck() {
  const verifier = randomBytes(32).toString("base64url");
  const fakeCode = "lovable-oauth-check-hdr-" + randomBytes(8).toString("hex");
  const grantType = "pkce";
  const url = `${TOKEN_ENDPOINT_URL}?grant_type=${grantType}`;
  const payload = { auth_code: fakeCode, code_verifier: verifier };
  const body = JSON.stringify(payload);
  // Keys-only snapshot for CI artifacts (no secret values).
  const requestPayloadKeys = Object.keys(payload).sort();

  const variants = [
    {
      key: "A",
      desc: "apikey + Bearer anon",
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    },
    {
      key: "B",
      desc: "no apikey, no Authorization",
      headers: {},
    },
    {
      key: "C",
      desc: "apikey only (no Authorization)",
      headers: { apikey: ANON_KEY },
    },
    {
      key: "D",
      desc: "apikey + bogus Bearer",
      headers: { apikey: ANON_KEY, Authorization: "Bearer not.a.real.jwt" },
    },
  ];

  const responses = {};
  for (const v of variants) {
    try {
      const { res, elapsedMs, attempts } = await fetchWithRetry(
        url,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...v.headers },
          body,
        },
        `token hdr-probe ${v.key} (${v.desc})`,
        TOKEN_RETRY_OPTS
      );
      const text = await res.text();
      let parsed = null;
      try { parsed = JSON.parse(text); } catch { /* non-json */ }
      const ct = res.headers.get("content-type") || "";
      responses[v.key] = {
        status: res.status,
        error: parsed?.error || null,
        errorDescription: parsed?.error_description || parsed?.msg || null,
        contentType: ct,
        elapsedMs,
        attempts,
        body: text.slice(0, 200),
        // Verbatim error envelope (canonical OAuth2 + legacy GoTrue fields)
        // so report.json diffs surface exactly what GoTrue returned when a
        // contract assertion breaks — not just the script's normalized view.
        rawErrorPayload: buildRawErrorPayload({ status: res.status, contentType: ct, text, parsed }),
        request: {
          grantType,
          grantTypeSource: "query",
          payloadKeys: requestPayloadKeys,
          headerKeys: Object.keys(v.headers).sort(),
        },
      };
    } catch (e) {
      responses[v.key] = {
        error: e.message,
        status: 0,
        request: {
          grantType,
          grantTypeSource: "query",
          payloadKeys: requestPayloadKeys,
          headerKeys: Object.keys(v.headers).sort(),
        },
      };
    }
  }

  // Stash full per-variant results in the report.
  if (!originSummaries.__token_auth_headers__) {
    originSummaries.__token_auth_headers__ = { variants: responses };
  }

  const A = responses.A, B = responses.B, C = responses.C, D = responses.D;
  const sig = (r) => r ? `${r.status}|${r.error || ""}|${r.errorDescription || ""}` : "(error)";

  // ── Per-header-mode error contract ──────────────────────────────────
  // Each variant has a specific contract the token endpoint MUST satisfy
  // based on which auth headers were sent. The previous assertions only
  // compared variants to each other (sig(A) === sig(B), etc.) which can
  // miss a regression where ALL responses drift in the same direction
  // (e.g. proxy starts returning HTML 502s for every variant). The
  // per-mode contract pins the EXACT shape required for each header mode
  // and fails loudly on any drift.
  //
  // Contract fields:
  //   statusOk:   predicate on HTTP status
  //   errorRe:    regex the canonical `error` code MUST match (if present)
  //   descRe:     regex the `error_description`/`msg` MUST match
  //   requireJson: response must be JSON-parseable + application/json
  //   requireEnvelope: response body MUST contain { error, error_description|msg }
  //   bearerGate: special-case for D — either auth-rejected (401/403) OR
  //               grant-shape but with a DIFFERENT signature than A.
  const contracts = {
    A: {
      mode: "apikey + Bearer anon",
      statusOk: (s) => s >= 400 && s < 500,
      errorRe: /^(invalid_grant|invalid_request|flow_state_not_found|bad_code_verifier|validation_failed)$/i,
      descRe: /invalid|expired|not.?found|bad|flow.?state|code|grant/i,
      requireJson: true,
      requireEnvelope: true,
    },
    B: {
      mode: "no apikey, no Authorization",
      statusOk: (s) => s === 401 || s === 403,
      errorRe: /^(unauthorized|invalid_api_key|no_api_key|missing_authorization|forbidden)?$/i,
      descRe: /api.?key|authoriz|unauthor|forbidden|missing|no.*key/i,
      requireJson: true,
      requireEnvelope: true,
    },
    C: {
      mode: "apikey only (no Authorization)",
      statusOk: (s) => s >= 400 && s < 500,
      errorRe: /^(invalid_grant|invalid_request|flow_state_not_found|bad_code_verifier|validation_failed)$/i,
      descRe: /invalid|expired|not.?found|bad|flow.?state|code|grant/i,
      requireJson: true,
      requireEnvelope: true,
    },
    D: {
      mode: "apikey + bogus Bearer",
      // D may be auth-rejected OR pass through to the grant layer;
      // bearerGate enforces the cross-cut: it must NOT match A exactly.
      statusOk: (s) => (s === 401 || s === 403) || (s >= 400 && s < 500),
      errorRe: /^(unauthorized|invalid_jwt|bad_jwt|invalid_token|invalid_grant|invalid_request|flow_state_not_found|bad_code_verifier|validation_failed)$/i,
      descRe: /jwt|token|bearer|unauthor|invalid|expired|not.?found|bad|flow.?state|grant|code/i,
      requireJson: true,
      requireEnvelope: true,
      bearerGate: true,
    },
  };

  const contractResults = {};
  for (const [key, c] of Object.entries(contracts)) {
    const r = responses[key];
    const failures = [];
    if (!r || r.status === 0) {
      failures.push(`network/transport error: ${r?.error || "no response"}`);
    } else {
      if (!c.statusOk(r.status)) failures.push(`status ${r.status} not allowed for mode "${c.mode}"`);
      if (c.requireJson && !r.contentType?.includes("application/json")) {
        failures.push(`content-type "${r.contentType}" is not application/json`);
      }
      if (c.requireEnvelope) {
        if (!r.error && !r.errorDescription) {
          failures.push(`response missing OAuth error envelope { error, error_description|msg } — body: ${String(r.body).slice(0, 120)}`);
        }
      }
      if (r.error && c.errorRe && !c.errorRe.test(r.error)) {
        failures.push(`error="${r.error}" not in expected vocabulary ${c.errorRe} for mode "${c.mode}"`);
      }
      if (r.errorDescription && c.descRe && !c.descRe.test(r.errorDescription)) {
        failures.push(`error_description="${r.errorDescription}" does not match ${c.descRe} for mode "${c.mode}"`);
      }
      if (c.bearerGate && responses.A && sig(r) === sig(responses.A)) {
        failures.push(`response is byte-identical to A (${sig(responses.A)}) — bogus Bearer was silently accepted, bearer audience/signature gate is broken`);
      }
    }
    contractResults[key] = {
      mode: c.mode,
      passed: failures.length === 0,
      failures,
      observed: r ? { status: r.status, error: r.error, errorDescription: r.errorDescription, contentType: r.contentType } : null,
    };

    const label = `Token endpoint error contract for header mode ${key} (${c.mode})`;
    if (failures.length === 0) {
      record("pass", label, `${sig(r)} — matches contract`, undefined, { contract: contractResults[key], response: r });
    } else {
      record(
        "fail",
        label,
        failures.join(" | "),
        `Header-mode ${key} violated its expected error contract. The token endpoint must return a deterministic shape per header combination so client SDKs can branch on it. Update Cloud → Authentication → API gateway / GoTrue config, or — if the contract genuinely changed — update the contract regex in runTokenAuthHeaderCheck() to match.`,
        { contract: contractResults[key], response: r }
      );
    }
  }

  // Persist the per-mode contract verdicts alongside raw variant data so
  // CI artifacts let downstream tooling group failures by header mode.
  originSummaries.__token_auth_headers__.contracts = contractResults;

  // Assertion 1: B (no auth headers) must be rejected by the auth gate
  // BEFORE the grant logic runs — typically 401/403 with a "missing/invalid
  // auth" style error, not the bogus-code error A returns.
  if (B?.status === 401 || B?.status === 403) {
    record(
      "pass",
      "Token endpoint rejects requests without apikey/Authorization",
      `B → HTTP ${B.status} ${B.error || ""} ${B.errorDescription || ""}`.trim(),
      undefined,
      responses
    );
  } else if (sig(A) === sig(B)) {
    record(
      "fail",
      "Token endpoint rejects requests without apikey/Authorization",
      `B returned the SAME response as A (${sig(A)}) — auth headers are not being validated`,
      `${TOKEN_ENDPOINT_PATH} must require an apikey. Check the project's Auth proxy / API gateway configuration.`,
      responses
    );
  } else {
    record(
      "warn",
      "Token endpoint rejects requests without apikey/Authorization",
      `B → HTTP ${B?.status} (expected 401/403). Got: ${sig(B)}`,
      "Endpoint differentiates from A but doesn't return a clean 401/403 — review GoTrue/proxy auth handling.",
      responses
    );
  }

  // Assertion 2: C (apikey only) should pass the auth gate and reach the
  // grant logic — i.e. produce the SAME class of error as A (invalid_grant).
  if (sig(C) === sig(A)) {
    record(
      "pass",
      "Token endpoint treats Authorization as optional when apikey is present",
      `C matches A (${sig(A)})`,
      undefined,
      responses
    );
  } else if (C?.status === 401 || C?.status === 403) {
    record(
      "fail",
      "Token endpoint treats Authorization as optional when apikey is present",
      `C → HTTP ${C.status} (apikey alone was rejected; expected behaviour matches A: ${sig(A)})`,
      "GoTrue or the proxy is requiring a Bearer token in addition to apikey — clients using only the publishable key will be locked out.",
      responses
    );
  } else {
    record(
      "warn",
      "Token endpoint treats Authorization as optional when apikey is present",
      `C diverges from A but isn't a hard rejection. C=${sig(C)} A=${sig(A)}`,
      undefined,
      responses
    );
  }

  // Assertion 3: D (bogus Bearer) must NOT be treated identically to A.
  // Either the server rejects the bad bearer (401/403) or it returns a
  // different error — anything else means the Authorization header is
  // being ignored, which would let attackers bypass audience checks.
  if (D?.status === 401 || D?.status === 403) {
    record(
      "pass",
      "Token endpoint validates Bearer audience/signature",
      `D → HTTP ${D.status} ${D.error || ""}`.trim(),
      undefined,
      responses
    );
  } else if (sig(D) !== sig(A)) {
    record(
      "pass",
      "Token endpoint validates Bearer audience/signature",
      `D produced a different response than A (D=${sig(D)}, A=${sig(A)}) — bearer is being parsed`,
      undefined,
      responses
    );
  } else {
    record(
      "fail",
      "Token endpoint validates Bearer audience/signature",
      `D returned the SAME response as A (${sig(A)}) — bogus Bearer was silently accepted`,
      "Authorization header is not being validated. Verify the Supabase project's JWT secret/audience config and that the auth proxy is enforcing it.",
      responses
    );
  }
}

/**
 * Single token-endpoint probe + assertion. Captures the response body,
 * content-type, and elapsed ms into the per-call summary.
 *
 * Optional `requestOverrides` lets a caller inject a non-default body or
 * Accept/Content-Type. Used to provoke negative responses (e.g. non-JSON
 * via Accept: text/html, malformed body via raw text) so we can exercise
 * the script's own JSON-contract enforcement.
 *
 * Optional `negativeContract` inverts the probe verdict: the probe
 * PASSES iff the script's contract handler fires the matching failure
 * (proving we'd catch the misbehaviour in CI), and FAILS if the server
 * still returns spec-shaped JSON (which would mean the negative branch
 * is unreachable). Supported values:
 *   - "non_json_content_type": the response Content-Type must NOT include
 *     application/json, so the JSON-contract `warn` branch is exercised.
 *   - "malformed_json_body":   the response body must FAIL JSON.parse(),
 *     so the JSON-contract `fail` branch is exercised.
 */
async function tokenProbe({
  label,
  grant,
  body,
  expectStatus,
  expectedErrorCodes,
  expectedDescriptionRe,
  rejectError,
  rejectHint,
  extraDetail,
  requestOverrides,
  negativeContract,
  // Per-probe contracts are MANDATORY for positive probes (no implicit
  // "anything goes" fallback). Negative-contract probes MUST set this to
  // true to acknowledge they intentionally don't assert envelope shape.
  allowMissingContract = false,
}) {
  // ── Probe-config sanity check (zero-fallback guard) ─────────────────
  // Catch misconfigured probes at call time instead of letting them
  // silently pass with an unconstrained allow-list.
  const isNegativeContract = !!negativeContract;
  const contractOptOut = isNegativeContract || allowMissingContract;
  if (!contractOptOut) {
    const cfgErrors = [];
    if (!Array.isArray(expectedErrorCodes) || expectedErrorCodes.length === 0) {
      cfgErrors.push("expectedErrorCodes must be a non-empty allow-list");
    }
    if (!(expectedDescriptionRe instanceof RegExp)) {
      cfgErrors.push("expectedDescriptionRe must be a RegExp");
    }
    if (cfgErrors.length) {
      record(
        "fail",
        label,
        `probe configuration error: ${cfgErrors.join("; ")}`,
        "Positive token probes must declare both an explicit error-code allow-list and a description regex (zero fallback). To intentionally skip envelope validation, set allowMissingContract: true or negativeContract: \"…\".",
        {
          probeConfig: {
            expectedErrorCodes,
            expectedDescriptionRe: expectedDescriptionRe ? String(expectedDescriptionRe) : null,
            allowMissingContract,
            negativeContract: negativeContract || null,
          },
        }
      );
      return;
    }
  }
  const url = `${TOKEN_ENDPOINT_URL}?grant_type=${encodeURIComponent(grant)}`;
  const baseHeaders = {
    apikey: ANON_KEY,
    Authorization: `Bearer ${ANON_KEY}`,
    "Content-Type": "application/json",
  };
  const headers = { ...baseHeaders, ...(requestOverrides?.headers || {}) };
  // Allow callers to send a raw (possibly malformed) body string instead
  // of a JSON-encoded object. `body` is still the structural payload used
  // for keys reporting; `wireBody` is what actually goes on the wire.
  const wireBody = requestOverrides?.rawBody !== undefined
    ? requestOverrides.rawBody
    : JSON.stringify(body);
  try {
    const { res, attempts, elapsedMs } = await fetchWithRetry(
      url,
      { method: "POST", headers, body: wireBody },
      `POST ${TOKEN_ENDPOINT_PATH} grant_type=${grant}${negativeContract ? ` [neg:${negativeContract}]` : ""}`,
      TOKEN_RETRY_OPTS
    );
    const ct = res.headers.get("content-type") || "";
    const text = await res.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { /* non-json */ }

    // Normalize the GoTrue error envelope. The endpoint may return either
    // `{ error, error_description }` (OAuth 2 standard) or `{ msg, code }`
    // (legacy /auth/v1/token paths). We treat them as equivalent for the
    // "presence" check, but require the canonical fields for the strict
    // assertion since OAuth clients only read those.
    const errorCode = parsed?.error || parsed?.code || null;
    const errorDescription = parsed?.error_description || parsed?.msg || null;
    const tail = ` (${attempts} attempt${attempts > 1 ? "s" : ""}, ${elapsedMs}ms, HTTP ${res.status})`;
    const requestPayloadKeys =
      body && typeof body === "object" ? Object.keys(body).sort() : [];
    const meta = {
      grant,
      grantType: grant,
      grantTypeSource: "query",
      request: {
        method: "POST",
        url,
        grantType: grant,
        grantTypeSource: "query",
        // Keys-only — values may contain code_verifier / refresh_token, never log them.
        payloadKeys: requestPayloadKeys,
        headerKeys: Object.keys(headers).sort(),
        rawBody: requestOverrides?.rawBody !== undefined,
        negativeContract: negativeContract || null,
      },
      requestPayloadKeys,
      status: res.status,
      contentType: ct,
      bodyKeys: parsed ? Object.keys(parsed) : null,
      error: parsed?.error || null,
      errorCanonical: errorCode,
      errorDescription,
      hasErrorField: !!parsed?.error,
      hasDescriptionField: !!parsed?.error_description,
      // Verbatim error envelope (canonical + legacy fields + capped raw body)
      // so report.json shows exactly what GoTrue returned on contract breaks.
      rawErrorPayload: buildRawErrorPayload({ status: res.status, contentType: ct, text, parsed }),
      expectedErrorCodes: expectedErrorCodes || null,
      attempts,
      elapsedMs,
    };

    // ── Negative-contract probes ────────────────────────────────────────
    // These cases EXIST to verify that the script's own JSON contract
    // enforcement actually fires when the server misbehaves. We invert
    // the verdict: a "pass" here means the strict-JSON branch we'd hit
    // in the positive path was triggered, so CI would catch it for real
    // GoTrue regressions.
    if (negativeContract === "non_json_content_type") {
      const isJson = ct.includes("application/json");
      if (!isJson) {
        record(
          "pass",
          label,
          `confirmed contract handler fires on non-JSON content-type: "${ct}"${tail}`,
          undefined,
          { ...meta, negativeContractFired: "non_json_content_type" }
        );
      } else {
        record(
          "fail",
          label,
          `expected non-JSON response (Accept override) but server returned application/json${tail} — negative branch not exercised`,
          "The token endpoint ignored Accept negotiation. Either the override no longer works (re-tune the case) or content-negotiation is permanently disabled — the JSON-contract `warn` branch in tokenProbe is now unreachable.",
          { ...meta, negativeContractFired: null }
        );
      }
      return;
    }
    if (negativeContract === "malformed_json_body") {
      // We sent a malformed body. We expect the server to reply with a 4xx
      // and EITHER (a) a non-JSON body OR (b) JSON that JSON.parse rejects.
      // Either outcome proves the script's body-parse fail branch fires.
      const parseFailed = parsed === null;
      const is4xx = res.status >= 400 && res.status < 500;
      if (parseFailed && is4xx) {
        record(
          "pass",
          label,
          `confirmed contract handler fires on unparseable body (HTTP ${res.status}, ct="${ct}", body: ${text.slice(0, 80)}…)${tail}`,
          undefined,
          { ...meta, negativeContractFired: "malformed_json_body" }
        );
      } else if (parseFailed && !is4xx) {
        record(
          "fail",
          label,
          `body unparseable but status was ${res.status} (expected 4xx)${tail}`,
          "Token endpoint accepted a malformed JSON body without 4xx — request validation is too permissive.",
          { ...meta, negativeContractFired: "malformed_json_body" }
        );
      } else {
        record(
          "fail",
          label,
          `expected unparseable response body but JSON.parse succeeded${tail} — negative branch not exercised`,
          "The server appears to tolerate malformed JSON or returned a generic JSON error envelope. The body-parse `fail` branch in tokenProbe is unreachable through this case — re-tune the malformed payload (e.g. send invalid UTF-8) or accept that the contract can't be exercised against this deployment.",
          { ...meta, negativeContractFired: null }
        );
      }
      return;
    }

    if (!expectStatus(res.status)) {
      record("fail", label, `unexpected status${tail}: ${text.slice(0, 200)}`, undefined, meta);
      return;
    }
    if (!ct.includes("application/json")) {
      record(
        "warn",
        label,
        `response content-type was "${ct}" (expected application/json)${tail}`,
        "Token endpoint should always return JSON — proxy or CDN may be rewriting responses.",
        meta
      );
      return;
    }
    if (!parsed) {
      record("fail", label, `response was not JSON${tail}: ${text.slice(0, 200)}`, undefined, meta);
      return;
    }
    if (rejectError(parsed)) {
      record(
        "fail",
        label,
        `server reported a request-shape error: ${errorDescription || errorCode}${tail}`,
        rejectHint,
        meta
      );
      return;
    }

    // STRICT CONTRACT — both fields must be present.
    const missing = [];
    if (!errorCode) missing.push("error");
    if (!errorDescription) missing.push("error_description/msg");
    if (missing.length) {
      record(
        "fail",
        label,
        `response missing required field(s): ${missing.join(", ")}${tail} — payload: ${text.slice(0, 200)}`,
        "GoTrue must always return an OAuth-style error envelope { error, error_description }. A 4xx without these breaks RFC 6749 §5.2 and breaks client error handling.",
        meta
      );
      return;
    }

    // STRICT CONTRACT — `error` code must be in the allow-list.
    // Probes that opted out (negative-contract / allowMissingContract) skip
    // both the code and description checks; everything else gets ZERO
    // fallback (the config guard above already proved the allow-list is
    // a non-empty array and the regex is a RegExp).
    if (!contractOptOut) {
      const codeOk = expectedErrorCodes.some(
        (c) => errorCode.toLowerCase() === c.toLowerCase()
      );
      if (!codeOk) {
        record(
          "fail",
          label,
          `error="${errorCode}" not in expected allow-list [${expectedErrorCodes.join(", ")}]${tail}`,
          "GoTrue returned an unexpected error code. Either the deployed version changed its vocabulary (update expectedErrorCodes for this probe) or the endpoint is misbehaving.",
          { ...meta, contractViolation: { kind: "error_code", expected: expectedErrorCodes, actual: errorCode } }
        );
        return;
      }

      // STRICT CONTRACT — `error_description` must match the per-probe regex.
      // Mismatch is a `fail` (was previously a `warn`); user-visible error
      // text drifting from expectation is a real regression.
      if (!expectedDescriptionRe.test(errorDescription)) {
        record(
          "fail",
          label,
          `error_description="${errorDescription}" does not match per-probe allow-list ${expectedDescriptionRe}${tail}`,
          "Description text drifted from the per-probe contract. Either the deployed GoTrue changed its wording (update expectedDescriptionRe for this probe) or the endpoint is returning the wrong error for this case.",
          { ...meta, contractViolation: { kind: "error_description", expected: String(expectedDescriptionRe), actual: errorDescription } }
        );
        return;
      }
    }

    record(
      "pass",
      label,
      `${extraDetail ? extraDetail + "; " : ""}error="${errorCode}", error_description="${errorDescription}"${tail}`,
      undefined,
      meta
    );
  } catch (e) {
    const requestPayloadKeys =
      body && typeof body === "object" ? Object.keys(body).sort() : [];
    record(
      "fail",
      label,
      e.message,
      "Network or timeout — check runner connectivity to the Cloud project URL.",
      {
        grant,
        grantType: grant,
        grantTypeSource: "query",
        request: {
          method: "POST",
          url,
          grantType: grant,
          grantTypeSource: "query",
          payloadKeys: requestPayloadKeys,
          headerKeys: Object.keys(headers).sort(),
          rawBody: requestOverrides?.rawBody !== undefined,
          negativeContract: negativeContract || null,
        },
        requestPayloadKeys,
      }
    );
  }
}

/**
 * Explicit end-to-end login-flow trace.
 *
 * Differs from runE2ERedirect() in that it:
 *   - Sends real PKCE params on the authorize call (matching what a browser
 *     client would do), so the captured state is what GoTrue would actually
 *     mint for a real login.
 *   - Records the full state value in the per-origin summary (sanitized:
 *     only length + sha256 fingerprint + decoder-extracted redirect_to).
 *   - Asserts the state is echoed back unchanged in the final callback URL
 *     (a strict round-trip check, not just origin matching).
 *   - Captures every hop's status + Location for triage.
 *
 * Still uses error=access_denied to avoid Google's consent screen — we are
 * verifying GoTrue's state handling and redirect plumbing, not Google's.
 */
async function runE2ELoginFlow(origin) {
  const label = `E2E login flow round-trips state to ${origin}`;
  const maxHops = Number(process.env.E2E_MAX_REDIRECTS) || 5;
  const pkce = generatePkce();

  try {
    // ── Step 1: authorize call to mint a real state value ───────────────
    const authUrl =
      `${SUPABASE_URL}/auth/v1/authorize?provider=google&skip_http_redirect=true` +
      `&redirect_to=${encodeURIComponent(origin)}` +
      `&code_challenge=${encodeURIComponent(pkce.challenge)}` +
      `&code_challenge_method=${pkce.method}`;
    const { res: authRes } = await fetchWithRetry(
      authUrl,
      { headers: { apikey: ANON_KEY } },
      `E2E-login authorize (${origin})`
    );
    const authBody = await authRes.json().catch(() => null);
    if (!authRes.ok || !authBody?.url) {
      record("fail", label, `authorize step failed: HTTP ${authRes.status}`);
      return;
    }
    const googleUrl = new URL(authBody.url);
    const sentState = googleUrl.searchParams.get("state");
    if (!sentState) {
      record("fail", label, "no state in authorize response", "Cannot trace round-trip without state.");
      return;
    }

    // Decode redirect_to from state for cross-checking.
    const decoded = extractRedirectTo(null, sentState);
    const stateSha = createHash("sha256").update(sentState).digest("hex");

    // ── Step 2: replay Google's callback (cancelled flow) ───────────────
    let next =
      `${SUPABASE_URL}/auth/v1/callback?state=${encodeURIComponent(sentState)}` +
      `&error=access_denied&error_description=e2e_login_flow_trace`;
    const chain = [];
    let finalUrl = null;

    for (let hop = 0; hop < maxHops; hop++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_MS);
      let res;
      try {
        res = await fetch(next, {
          redirect: "manual",
          headers: { apikey: ANON_KEY },
          signal: ctrl.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      const loc = res.headers.get("location");
      chain.push({ hop, status: res.status, url: next, location: loc });
      if (res.status >= 300 && res.status < 400 && loc) {
        next = new URL(loc, next).toString();
        continue;
      }
      finalUrl = next;
      break;
    }
    if (!finalUrl) finalUrl = next;

    // ── Step 3: assertions ──────────────────────────────────────────────
    let finalParsed;
    try { finalParsed = new URL(finalUrl); } catch { finalParsed = null; }

    const originOk = finalParsed && originsMatch(finalUrl, origin);
    // State echo: GoTrue may strip state from the FINAL URL (it's an
    // app-side hash by then), but the error/error_description should be
    // present. We check both.
    const finalQuery = finalParsed?.searchParams || new URLSearchParams();
    const finalHash = finalParsed?.hash?.startsWith("#")
      ? new URLSearchParams(finalParsed.hash.slice(1))
      : new URLSearchParams();
    const echoedError =
      finalQuery.get("error") || finalHash.get("error") || null;
    const echoedErrorOk = echoedError === "access_denied";

    const summary = originSummary(origin);
    summary.e2eLogin = {
      sentState: { length: sentState.length, sha256: stateSha, decoder: decoded.source },
      decodedRedirectTo: decoded.value,
      hops: chain.length,
      finalUrl,
      originMatches: !!originOk,
      echoedError,
      chain: chain.map((h) => ({ hop: h.hop, status: h.status, location: h.location })),
    };

    if (originOk && echoedErrorOk) {
      record(
        "pass",
        label,
        `state(sha=${stateSha.slice(0, 12)}…) → ${chain.length} hop(s) → ${finalUrl} (error=access_denied echoed)`
      );
    } else if (originOk && !echoedErrorOk) {
      noteMismatch(origin, `e2e-login: error param missing/changed (got "${echoedError}")`);
      record(
        "warn",
        label,
        `landed on ${origin} but error="${echoedError}" (expected access_denied)`,
        "GoTrue may be rewriting error params; check callback handler logic.",
      );
    } else {
      noteMismatch(origin, `e2e-login: final url=${finalUrl}`);
      record(
        "fail",
        label,
        `expected origin ${origin}, got ${finalUrl} (${chain.length} hop${chain.length === 1 ? "" : "s"})`,
        "State round-trip broken — check Cloud → Auth → URL Configuration: Site URL and Redirect URLs must include this origin."
      );
    }
  } catch (e) {
    record("fail", label, e.message, "Network or timeout during E2E login-flow trace.");
  }
}

// Allow this file to be imported by tests without running the full
// diagnostic suite. Only execute main() when invoked directly via
// `node scripts/check-google-oauth.mjs`.
const isDirectRun = (() => {
  try {
    const invoked = process.argv[1] && new URL(`file://${process.argv[1]}`).href;
    return invoked === import.meta.url;
  } catch {
    return false;
  }
})();

if (isDirectRun) {
  main().catch((e) => {
    console.error(`${RED}Unexpected error:${RESET}`, e);
    process.exit(1);
  });
}

export {
  validatePkceFormat,
  detectBase64UrlEdgeCase,
  generatePkce,
  s256Challenge,
  pkceRemediationHint,
  buildRawErrorPayload,
  snapshotErrorEnvelope,
  recordIntoBucket,
  parseCliArgs,
  buildRemediationExport,
  originSlug,
  fingerprintSecret,
};
