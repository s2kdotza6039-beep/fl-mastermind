/**
 * Snapshot regression tests for the GoTrue /auth/v1/token error envelope.
 *
 * The contract regexes in tokenProbe / runTokenAuthHeaderCheck are
 * intentionally lenient (allow-lists are unions across GoTrue versions to
 * survive minor drift). This file is the TIGHTER second line of defence:
 *
 *   For each named fixture envelope (mirroring real GoTrue response shapes),
 *   we compute snapshotErrorEnvelope() and compare it to a stored snapshot
 *   in scripts/__snapshots__/error-envelopes.json. Any structural change —
 *   a renamed field, a new top-level key, a content-type family flip, a
 *   status-class change, a new canonical/legacy field appearing — fails
 *   the test with an explicit diff so we catch the drift in code review
 *   instead of in CI weeks later.
 *
 * To intentionally accept a drift:
 *   UPDATE_SNAPSHOTS=1 node --test scripts/check-google-oauth.snapshots.test.mjs
 *
 * Run normally:
 *   node --test scripts/check-google-oauth.snapshots.test.mjs
 */
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildRawErrorPayload,
  snapshotErrorEnvelope,
} from "./check-google-oauth.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = join(__dirname, "__snapshots__", "error-envelopes.json");
const UPDATE = process.env.UPDATE_SNAPSHOTS === "1";

/**
 * Fixture envelopes mirroring real GoTrue responses observed across versions.
 * Each `{ status, contentType, text }` triplet is fed through the same
 * buildRawErrorPayload + snapshotErrorEnvelope pipeline the live script uses,
 * so the snapshot tracks the EXACT projection CI compares against.
 */
const FIXTURES = {
  // OAuth2-canonical 4xx (probe 1: bogus code → invalid_grant)
  canonical_invalid_grant_400: {
    status: 400,
    contentType: "application/json; charset=utf-8",
    body: {
      error: "invalid_grant",
      error_description: "Invalid auth code",
    },
  },
  // OAuth2-canonical 4xx with error_uri (RFC 6749 §5.2 superset)
  canonical_invalid_grant_with_uri: {
    status: 400,
    contentType: "application/json",
    body: {
      error: "invalid_grant",
      error_description: "code expired",
      error_uri: "https://supabase.com/docs/auth/errors#invalid_grant",
    },
  },
  // Legacy GoTrue envelope (older deploys / some 401 paths)
  legacy_no_api_key_401: {
    status: 401,
    contentType: "application/json",
    body: {
      msg: "No API key found in request",
      code: 401,
    },
  },
  // Mixed envelope: canonical + legacy `code` simultaneously
  mixed_validation_failed_422: {
    status: 422,
    contentType: "application/json",
    body: {
      error: "validation_failed",
      error_description: "code_verifier required",
      code: 422,
    },
  },
  // Probe-3 shape: missing code_verifier → invalid_request
  canonical_invalid_request_missing_verifier: {
    status: 400,
    contentType: "application/json",
    body: {
      error: "invalid_request",
      error_description: "code_verifier is required",
    },
  },
  // Negative-contract: HTML 502 from a misbehaving proxy
  proxy_html_502: {
    status: 502,
    contentType: "text/html; charset=utf-8",
    body: "<html><body>Bad Gateway</body></html>",
    raw: true,
  },
  // Negative-contract: malformed JSON
  malformed_json_400: {
    status: 400,
    contentType: "text/plain",
    body: "{not-json: ,,",
    raw: true,
  },
  // Network/transport failure (status 0)
  transport_error: {
    status: 0,
    contentType: "",
    body: null,
    raw: true,
  },
};

/** Build a rawErrorPayload from a fixture using the same path as the live script. */
function projectFixture(fix) {
  const text = fix.raw
    ? (fix.body == null ? "" : String(fix.body))
    : JSON.stringify(fix.body);
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* non-json */ }
  const raw = buildRawErrorPayload({
    status: fix.status,
    contentType: fix.contentType,
    text,
    parsed,
  });
  return snapshotErrorEnvelope(raw);
}

function loadSnapshots() {
  if (!existsSync(SNAPSHOT_PATH)) return {};
  return JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8"));
}

function saveSnapshots(obj) {
  mkdirSync(dirname(SNAPSHOT_PATH), { recursive: true });
  // Stable ordering: sort fixture names + JSON.stringify with 2-space indent.
  const sorted = Object.fromEntries(
    Object.keys(obj).sort().map((k) => [k, obj[k]])
  );
  writeFileSync(SNAPSHOT_PATH, JSON.stringify(sorted, null, 2) + "\n");
}

const stored = loadSnapshots();
const computed = {};
for (const [name, fix] of Object.entries(FIXTURES)) {
  computed[name] = projectFixture(fix);
}

if (UPDATE) {
  saveSnapshots(computed);
  // eslint-disable-next-line no-console
  console.log(`✓ wrote ${Object.keys(computed).length} snapshots to ${SNAPSHOT_PATH}`);
}

// One test per fixture so a single drift doesn't mask others.
// Skip per-fixture comparisons in UPDATE mode — by design we're rewriting.
for (const name of Object.keys(FIXTURES)) {
  test(`snapshot: ${name}`, { skip: UPDATE ? "UPDATE_SNAPSHOTS=1" : false }, () => {
    assert.ok(
      Object.prototype.hasOwnProperty.call(stored, name),
      `No snapshot stored for "${name}". Run with UPDATE_SNAPSHOTS=1 to seed.`
    );
    assert.deepStrictEqual(
      computed[name],
      stored[name],
      `Error-envelope projection drifted for "${name}".\n` +
      `Expected (stored): ${JSON.stringify(stored[name], null, 2)}\n` +
      `Actual   (current): ${JSON.stringify(computed[name], null, 2)}\n` +
      `If this drift is intentional, re-run with UPDATE_SNAPSHOTS=1.`
    );
  });
}

// Guard against orphaned snapshots (fixture deleted but snapshot lingers).
test("snapshot: no orphaned fixtures in snapshot file", () => {
  const orphans = Object.keys(stored).filter((k) => !(k in FIXTURES));
  assert.deepStrictEqual(
    orphans,
    [],
    `Stored snapshots exist for fixtures that no longer exist: ${orphans.join(", ")}. ` +
    `Run with UPDATE_SNAPSHOTS=1 to prune.`
  );
});

// Guard the projection itself: snapshotErrorEnvelope MUST never include
// volatile fields. If a future refactor accidentally widens the projection,
// this test fails before snapshots become noisy.
test("snapshot projection excludes volatile fields", () => {
  const projection = projectFixture(FIXTURES.canonical_invalid_grant_400);
  const forbidden = [
    "rawBody",
    "bodyByteLength",
    "error_description",
    "error_id",
    "msg",
  ];
  const keys = Object.keys(projection);
  for (const k of forbidden) {
    assert.ok(!keys.includes(k), `snapshotErrorEnvelope leaked volatile field "${k}"`);
  }
});
