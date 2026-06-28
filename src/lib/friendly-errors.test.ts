import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  friendlySignInError,
  friendlySignupError,
  friendlyPasswordResetError,
  friendlyEmailConfirmError,
  friendlyRoleAssignmentError,
  isRateLimited,
  isCaptchaFailure,
  parseRetryAfterSec,
} from "./friendly-errors";

describe("friendly-errors: detection", () => {
  it("isRateLimited handles 429, codes, and message variants", () => {
    expect(isRateLimited({ status: 429 })).toBe(true);
    expect(isRateLimited({ code: "over_request_rate_limit" })).toBe(true);
    expect(isRateLimited({ message: "Too many requests" })).toBe(true);
    expect(isRateLimited("over_email_send_rate_limit")).toBe(true);
    expect(isRateLimited({ message: "Invalid login credentials" })).toBe(false);
  });

  it("isCaptchaFailure recognises common variants", () => {
    expect(isCaptchaFailure({ message: "captcha verification failed" })).toBe(true);
    expect(isCaptchaFailure({ message: "hCaptcha token invalid" })).toBe(true);
    expect(isCaptchaFailure({ code: "captcha_failed" })).toBe(true);
    expect(isCaptchaFailure({ message: "wrong password" })).toBe(false);
  });
});

describe("friendly-errors: parseRetryAfterSec", () => {
  it("reads numeric Retry-After from a Headers instance", () => {
    const h = new Headers({ "Retry-After": "42" });
    expect(parseRetryAfterSec({ status: 429, headers: h })).toBe(42);
  });

  it("reads Retry-After from a plain object header bag", () => {
    expect(parseRetryAfterSec({ status: 429, response: { headers: { "retry-after": "15" } } })).toBe(15);
  });

  it("parses HTTP-date Retry-After into seconds", () => {
    const inTen = new Date(Date.now() + 10_000).toUTCString();
    const got = parseRetryAfterSec({ status: 429, headers: { "Retry-After": inTen } });
    expect(got).toBeGreaterThanOrEqual(8);
    expect(got).toBeLessThanOrEqual(12);
  });

  it("extracts seconds from message text", () => {
    expect(parseRetryAfterSec({ status: 429, message: "Please try again in 23 seconds" })).toBe(23);
    expect(parseRetryAfterSec("rate limit, wait 7s before retrying")).toBe(7);
  });

  it("falls back to the default when nothing is parseable", () => {
    expect(parseRetryAfterSec({ status: 429, message: "rate limit reached" })).toBe(60);
    expect(parseRetryAfterSec({ status: 429, message: "rate limit reached" }, 30)).toBe(30);
  });

  it("clamps absurd values into a safe range", () => {
    expect(parseRetryAfterSec({ headers: { "Retry-After": "999999" } })).toBe(3600);
  });
});

describe("friendly-errors: 429 / rate limit / captcha messaging", () => {
  it("signin 429 → friendly", () => {
    expect(friendlySignInError({ status: 429, message: "Request rate limit reached" })).toMatch(/too many sign-in/i);
  });
  it("signup 429 → friendly", () => {
    expect(friendlySignupError({ status: 429, message: "over_email_send_rate_limit" })).toMatch(/too many sign-up/i);
  });
  it("password reset 429 → friendly", () => {
    expect(friendlyPasswordResetError({ status: 429 })).toMatch(/too many password reset/i);
  });
  it("email confirm 429 → friendly", () => {
    expect(friendlyEmailConfirmError({ status: 429 })).toMatch(/too many confirmation/i);
  });
  it("captcha across all surfaces", () => {
    expect(friendlySignInError({ message: "captcha verification process failed" })).toMatch(/bot check/i);
    expect(friendlySignupError({ message: "captcha failed" })).toMatch(/bot check/i);
    expect(friendlyPasswordResetError({ message: "hCaptcha failed" })).toMatch(/bot check/i);
    expect(friendlyEmailConfirmError({ message: "captcha invalid" })).toMatch(/bot check/i);
  });
  it("password reset: expired link → friendly", () => {
    expect(friendlyPasswordResetError({ message: "token has expired" })).toMatch(/expired/i);
  });
  it("email confirm: already confirmed → friendly", () => {
    expect(friendlyEmailConfirmError({ message: "Email link already confirmed" })).toMatch(/already confirmed/i);
  });
  it("does not leak SQL/policy/trigger wording in signup errors", () => {
    const m = friendlySignupError({ message: 'permission denied for table "user_roles" policy violation trigger' });
    expect(m).not.toMatch(/user_roles|policy|trigger|permission/i);
  });
  it("role assignment 429 → friendly", () => {
    expect(friendlyRoleAssignmentError({ status: 429, message: "rate limit" })).toMatch(/too many role changes/i);
  });
});

describe("auth telemetry: logs without sensitive payload", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("never includes email/password/token in the console payload", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const { logAuthRateEvent } = await import("./auth-telemetry");
    await logAuthRateEvent("signin_rate_limited", { retryAfterSec: 12, surface: "signin" });
    expect(spy).toHaveBeenCalled();
    const [, payload] = spy.mock.calls[0] as any[];
    const text = JSON.stringify(payload);
    expect(text).not.toMatch(/@/);
    expect(text).not.toMatch(/password/i);
    expect(text).not.toMatch(/token/i);
    expect(payload.kind).toBe("signin_rate_limited");
    expect(payload.retry_after_sec).toBe(12);
  });

  it("bumps session counters per kind", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const { logAuthRateEvent, readSessionAuthRateCounters } = await import("./auth-telemetry");
    await logAuthRateEvent("signup_rate_limited", { retryAfterSec: 30 });
    await logAuthRateEvent("signup_rate_limited", { retryAfterSec: 30 });
    await logAuthRateEvent("signin_captcha_failed", {});
    const c = readSessionAuthRateCounters();
    expect(c.signup_rate_limited).toBe(2);
    expect(c.signin_captcha_failed).toBe(1);
    expect(c.__total).toBe(3);
  });
});
