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
 *   EXPECTED_CLIENT_ID         if set, every authorize URL must use this Google client_id
 *   EXPECTED_SCOPES            comma/space-separated scopes that MUST appear (default: "openid email profile")
 *   EXPECTED_RESPONSE_TYPE     required response_type (default: "code")
 *   E2E_CHECK                  "true" to run an opt-in end-to-end redirect
 *                              simulation (authorize → /callback with a
 *                              synthetic error) and assert GoTrue redirects
 *                              the user back to each APP_ORIGIN.
 *   E2E_MAX_REDIRECTS          max redirects to follow per origin (default: 5)
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
function withCapture(fn) {
  const buf = [];
  captureBuffer = buf;
  try { return Promise.resolve(fn()).then((v) => ({ value: v, buf })); }
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
 * Generate a PKCE code_verifier + S256 code_challenge per RFC 7636.
 * verifier: 43–128 chars URL-safe; challenge: BASE64URL(SHA256(verifier)).
 */
async function generatePkce() {
  const { randomBytes, createHash } = await import("node:crypto");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge, method: "S256" };
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
    record("fail", `PKCE forwarded to Google (${origin})`, "authorize URL not parseable");
    return null;
  }
  const gotChallenge = parsed.searchParams.get("code_challenge");
  const gotMethod = parsed.searchParams.get("code_challenge_method");
  const summary = originSummary(origin);
  summary.pkce = {
    sentChallenge: sent.challenge,
    gotChallenge,
    method: gotMethod,
    challengeMatches: gotChallenge === sent.challenge,
    methodIsS256: (gotMethod || "").toUpperCase() === "S256",
  };

  if (!gotChallenge || !gotMethod) {
    const miss = `${!gotChallenge ? "code_challenge" : ""}${!gotChallenge && !gotMethod ? " & " : ""}${!gotMethod ? "code_challenge_method" : ""}`;
    noteMismatch(origin, `pkce: missing ${miss}`);
    record(
      "fail",
      `PKCE forwarded to Google (${origin})`,
      `missing ${miss}`,
      "Set flow_type='pkce' in the client and ensure GoTrue forwards code_challenge — required for the auth code flow."
    );
    return { challenge: gotChallenge, method: gotMethod };
  }
  if (gotMethod.toUpperCase() !== "S256") {
    noteMismatch(origin, `pkce: method=${gotMethod} (expected S256)`);
    record(
      "fail",
      `PKCE method is S256 (${origin})`,
      `code_challenge_method=${gotMethod}`,
      "Plain PKCE is insecure — use S256."
    );
  } else {
    record("pass", `PKCE method is S256 (${origin})`, "code_challenge_method=S256");
  }
  if (gotChallenge !== sent.challenge) {
    noteMismatch(origin, "pkce: challenge rewritten by server");
    record(
      "fail",
      `PKCE challenge preserved (${origin})`,
      `sent ${sent.challenge.slice(0, 16)}…, got ${gotChallenge.slice(0, 16)}…`,
      "GoTrue rewrote the challenge — token exchange will fail. Verify the project isn't running an old GoTrue version."
    );
  } else {
    record("pass", `PKCE challenge preserved (${origin})`, `${gotChallenge.slice(0, 16)}… (43+ chars)`);
  }
  return { challenge: gotChallenge, method: gotMethod };
}

const EXPECTED_CLIENT_ID = process.env.EXPECTED_CLIENT_ID || null;
const EXPECTED_RESPONSE_TYPE = process.env.EXPECTED_RESPONSE_TYPE || "code";
const EXPECTED_SCOPES = (process.env.EXPECTED_SCOPES || "openid email profile")
  .split(/[\s,]+/)
  .map((s) => s.trim())
  .filter(Boolean);

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

  const expectedCallback = `${SUPABASE_URL.replace(/\/$/, "")}/auth/v1/callback`;
  const actualCallback = parsed.searchParams.get("redirect_uri");
  const summary = originSummary(origin);
  summary.redirectUri = actualCallback;
  summary.expectedRedirectUri = expectedCallback;
  summary.redirectUriMatches = actualCallback === expectedCallback;

  if (!actualCallback) {
    noteMismatch(origin, "redirect_uri missing");
    record(
      "fail",
      `Supabase callback present (${origin})`,
      "Google authorize URL has no redirect_uri parameter",
      "GoTrue should always set redirect_uri=<SUPABASE_URL>/auth/v1/callback. Re-check provider configuration."
    );
  } else if (actualCallback !== expectedCallback) {
    noteMismatch(origin, `redirect_uri=${actualCallback} (expected ${expectedCallback})`);
    record(
      "fail",
      `Supabase callback matches /auth/v1/callback (${origin})`,
      `expected ${expectedCallback}, got ${actualCallback}`,
      `Add "${expectedCallback}" to your Google OAuth client's Authorized redirect URIs and ensure SUPABASE_URL matches the project that owns the Google credentials.`
    );
  } else {
    record("pass", `Supabase callback matches /auth/v1/callback (${origin})`, actualCallback);
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
      origins: originSummaries,
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
