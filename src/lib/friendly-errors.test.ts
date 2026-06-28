import { describe, it, expect } from "vitest";
import { friendlySignInError, friendlySignupError, friendlyRoleAssignmentError } from "./friendly-errors";

describe("friendly-errors: 429 / rate limit handling", () => {
  it("maps HTTP 429 on signin to a friendly message", () => {
    expect(friendlySignInError({ status: 429, message: "Request rate limit reached" }))
      .toMatch(/too many sign-in attempts/i);
  });

  it("maps HTTP 429 on signup to a friendly message", () => {
    expect(friendlySignupError({ status: 429, message: "over_email_send_rate_limit" }))
      .toMatch(/too many sign-up attempts/i);
  });

  it("maps GoTrue 'over_request_rate_limit' string on signin", () => {
    expect(friendlySignInError("over_request_rate_limit"))
      .toMatch(/too many sign-in attempts/i);
  });

  it("maps generic 'too many requests' to friendly signup message", () => {
    expect(friendlySignupError({ message: "Too many requests" }))
      .toMatch(/too many sign-up attempts/i);
  });

  it("maps captcha failures on signup", () => {
    expect(friendlySignupError({ message: "captcha verification process failed" }))
      .toMatch(/bot check failed/i);
  });

  it("maps captcha failures on signin", () => {
    expect(friendlySignInError({ message: "hCaptcha token invalid" }))
      .toMatch(/bot check failed/i);
  });

  it("maps invalid credentials without leaking internals", () => {
    const m = friendlySignInError({ message: "Invalid login credentials" });
    expect(m).toMatch(/email or password is incorrect/i);
    expect(m).not.toMatch(/credentials/i);
  });

  it("does not leak SQL/policy/trigger wording in signup errors", () => {
    const m = friendlySignupError({ message: 'permission denied for table "user_roles" policy violation trigger' });
    expect(m).not.toMatch(/user_roles|policy|trigger|permission/i);
  });

  it("maps rate limit on role assignment", () => {
    expect(friendlyRoleAssignmentError({ status: 429, message: "rate limit" }))
      .toMatch(/too many role changes/i);
  });
});
