/**
 * Tests for the PKCE format validator's handling of base64url edge cases.
 *
 * Covers RFC 7636 §4.1 (verifier) and §4.2 (S256 challenge) hardening:
 *   - standard-base64 punctuation:    '+', '/', '=' (padding)
 *   - whitespace in any form:         ' ', '\t', '\r', '\n'
 *   - non-ASCII / unicode artifacts:  NBSP, smart quotes, ZWSP, emoji
 *   - ASCII control chars:            NUL, BEL, DEL
 *   - non-string / nullish inputs
 *
 * Run with:
 *   node --test scripts/check-google-oauth.test.mjs
 */
import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  validatePkceFormat,
  detectBase64UrlEdgeCase,
  generatePkce,
  s256Challenge,
} from "./check-google-oauth.mjs";

// A canonically valid 43-char base64url challenge (BASE64URL(SHA256("a"))).
const VALID_CHALLENGE = s256Challenge("a");
// A canonically valid 43-char base64url verifier.
const VALID_VERIFIER = "a".repeat(43);

/** Mutate a valid challenge by replacing its first char with `ch`. */
const mutate = (s, ch) => ch + s.slice(1);

test("baseline: freshly generated PKCE pair validates clean", () => {
  const { verifier, challenge } = generatePkce();
  assert.deepEqual(validatePkceFormat(verifier, "verifier"), { ok: true });
  assert.deepEqual(validatePkceFormat(challenge, "challenge"), { ok: true });
});

test("baseline: hand-crafted valid challenge passes", () => {
  assert.equal(validatePkceFormat(VALID_CHALLENGE, "challenge").ok, true);
  assert.equal(validatePkceFormat(VALID_VERIFIER, "verifier").ok, true);
});

// ─── Padding ('=') ──────────────────────────────────────────────────────
test("challenge: rejects '=' padding suffix", () => {
  // Trim to 42 then add '=' so total length is still 43.
  const padded = VALID_CHALLENGE.slice(0, 42) + "=";
  const r = validatePkceFormat(padded, "challenge");
  assert.equal(r.ok, false);
  assert.match(r.reason, /=.*padding/i);
});

test("challenge: rejects '=' anywhere in the value", () => {
  const padded = mutate(VALID_CHALLENGE, "=");
  const r = validatePkceFormat(padded, "challenge");
  assert.equal(r.ok, false);
  assert.match(r.reason, /=.*padding/i);
});

test("verifier: rejects '=' padding", () => {
  const padded = VALID_VERIFIER.slice(0, 42) + "=";
  const r = validatePkceFormat(padded, "verifier");
  assert.equal(r.ok, false);
  assert.match(r.reason, /=.*padding/i);
});

// ─── Standard base64 punctuation ('+' '/') ──────────────────────────────
test("challenge: rejects '+' (standard base64 char)", () => {
  const r = validatePkceFormat(mutate(VALID_CHALLENGE, "+"), "challenge");
  assert.equal(r.ok, false);
  assert.match(r.reason, /\+.*use '-'/);
});

test("challenge: rejects '/' (standard base64 char)", () => {
  const r = validatePkceFormat(mutate(VALID_CHALLENGE, "/"), "challenge");
  assert.equal(r.ok, false);
  assert.match(r.reason, /\/.*use '_'/);
});

test("verifier: rejects '+' and '/'", () => {
  for (const ch of ["+", "/"]) {
    const r = validatePkceFormat(mutate(VALID_VERIFIER, ch), "verifier");
    assert.equal(r.ok, false, `'${ch}' should fail`);
  }
});

// ─── Whitespace ─────────────────────────────────────────────────────────
test("challenge: rejects embedded space", () => {
  const r = validatePkceFormat(mutate(VALID_CHALLENGE, " "), "challenge");
  assert.equal(r.ok, false);
  assert.match(r.reason, /whitespace.*space/i);
});

test("challenge: rejects tab", () => {
  const r = validatePkceFormat(mutate(VALID_CHALLENGE, "\t"), "challenge");
  assert.equal(r.ok, false);
  assert.match(r.reason, /whitespace.*tab/i);
});

test("challenge: rejects newline / carriage return", () => {
  for (const ch of ["\n", "\r"]) {
    const r = validatePkceFormat(mutate(VALID_CHALLENGE, ch), "challenge");
    assert.equal(r.ok, false, `${JSON.stringify(ch)} should fail`);
    assert.match(r.reason, /whitespace.*newline/i);
  }
});

test("challenge: rejects leading/trailing whitespace (no implicit trim)", () => {
  for (const v of [" " + VALID_CHALLENGE.slice(1), VALID_CHALLENGE.slice(0, 42) + " "]) {
    const r = validatePkceFormat(v, "challenge");
    assert.equal(r.ok, false);
    assert.match(r.reason, /whitespace/i);
  }
});

// ─── Non-ASCII / unicode paste artifacts ────────────────────────────────
test("challenge: rejects non-breaking space (U+00A0)", () => {
  const r = validatePkceFormat(mutate(VALID_CHALLENGE, "\u00A0"), "challenge");
  assert.equal(r.ok, false);
  assert.match(r.reason, /non-ASCII|unicode/i);
});

test("challenge: rejects zero-width space (U+200B)", () => {
  const r = validatePkceFormat(mutate(VALID_CHALLENGE, "\u200B"), "challenge");
  assert.equal(r.ok, false);
  assert.match(r.reason, /non-ASCII|unicode/i);
});

test("challenge: rejects smart quote and emoji", () => {
  for (const ch of ["\u2018", "\u201C", "🔑"]) {
    const r = validatePkceFormat(mutate(VALID_CHALLENGE, ch), "challenge");
    assert.equal(r.ok, false, `${JSON.stringify(ch)} should fail`);
    assert.match(r.reason, /non-ASCII|unicode/i);
  }
});

test("verifier: rejects unicode chars (e.g. é, NBSP)", () => {
  for (const ch of ["é", "\u00A0"]) {
    const r = validatePkceFormat(mutate(VALID_VERIFIER, ch), "verifier");
    assert.equal(r.ok, false, `${JSON.stringify(ch)} should fail`);
  }
});

// ─── ASCII control chars ────────────────────────────────────────────────
test("challenge: rejects NUL / BEL / DEL", () => {
  for (const ch of ["\x00", "\x07", "\x7F"]) {
    const r = validatePkceFormat(mutate(VALID_CHALLENGE, ch), "challenge");
    assert.equal(r.ok, false, `0x${ch.charCodeAt(0).toString(16)} should fail`);
    assert.match(r.reason, /control/i);
  }
});

// ─── Non-string / nullish ───────────────────────────────────────────────
test("rejects null / undefined / empty / non-string inputs", () => {
  for (const v of [null, undefined, ""]) {
    assert.deepEqual(validatePkceFormat(v, "challenge"), { ok: false, reason: "missing" });
    assert.deepEqual(validatePkceFormat(v, "verifier"), { ok: false, reason: "missing" });
  }
  for (const v of [42, true, {}, [], Buffer.from(VALID_CHALLENGE)]) {
    const r = validatePkceFormat(v, "challenge");
    assert.equal(r.ok, false);
    assert.match(r.reason, /not a string/);
  }
});

// ─── Length boundaries (regression guard) ───────────────────────────────
test("challenge: must be exactly 43 chars (S256)", () => {
  for (const len of [42, 44, 0, 86]) {
    const v = "a".repeat(len);
    const r = validatePkceFormat(v, "challenge");
    assert.equal(r.ok, false, `length ${len} should fail`);
    if (len > 0) assert.match(r.reason, /length/i);
  }
});

test("verifier: must be 43–128 chars", () => {
  for (const len of [42, 129, 200]) {
    const v = "a".repeat(len);
    const r = validatePkceFormat(v, "verifier");
    assert.equal(r.ok, false, `length ${len} should fail`);
    assert.match(r.reason, /length|outside/i);
  }
  // 43 and 128 are the inclusive bounds.
  assert.equal(validatePkceFormat("a".repeat(43), "verifier").ok, true);
  assert.equal(validatePkceFormat("a".repeat(128), "verifier").ok, true);
});

// ─── detectBase64UrlEdgeCase priority order ─────────────────────────────
test("detectBase64UrlEdgeCase: returns null for clean strings", () => {
  assert.equal(detectBase64UrlEdgeCase(VALID_CHALLENGE), null);
  assert.equal(detectBase64UrlEdgeCase("AbC-_123"), null);
});

test("detectBase64UrlEdgeCase: '=' takes priority over '+' or whitespace", () => {
  // A value with multiple problems should surface '=' (most actionable).
  const r = detectBase64UrlEdgeCase("abc+def =ghi");
  assert.match(r, /=.*padding/i);
});
