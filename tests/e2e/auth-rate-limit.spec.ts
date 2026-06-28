// Playwright e2e: verify 429 / Captcha guidance renders correctly on sign-in & sign-up.
//
// This spec intercepts the GoTrue `/auth/v1/token` and `/auth/v1/signup` endpoints
// and forces them to return HTTP 429 with a Retry-After header, so the UI behaviour
// can be exercised without actually flooding the real backend.
//
// Run locally against the dev server (default http://localhost:8080):
//   bunx playwright test tests/e2e/auth-rate-limit.spec.ts
// Override base URL: APP_URL=http://localhost:5173 bunx playwright test ...

import { test, expect, type Route } from "@playwright/test";

const BASE_URL = process.env.APP_URL || "http://localhost:8080";

function rateLimited(retryAfterSec = 7) {
  return (route: Route) =>
    route.fulfill({
      status: 429,
      headers: { "Retry-After": String(retryAfterSec), "Content-Type": "application/json" },
      body: JSON.stringify({
        code: "over_request_rate_limit",
        msg: "Request rate limit reached",
        error: "rate_limit",
      }),
    });
}

function captchaFailed() {
  return (route: Route) =>
    route.fulfill({
      status: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: "captcha_failed",
        msg: "captcha verification process failed",
      }),
    });
}

test.describe("auth 429 + captcha guidance", () => {
  test("repeated sign-in attempts surface friendly 429 with countdown", async ({ page }) => {
    await page.route("**/auth/v1/token**", rateLimited(5));
    await page.goto(`${BASE_URL}/auth`);

    // Tab onto Sign In (default) and submit a few times.
    await page.getByLabel(/^Email$/i).fill("rate-test@example.com");
    await page.getByLabel(/^Password$/i).fill("SomePass123!");
    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: /^Sign in$/i }).click();
      await page.waitForTimeout(150);
    }

    // Friendly notice rendered (not raw "rate limit reached")
    const notice = page.getByRole("alert");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText(/too many sign-in attempts/i);
    await expect(notice).not.toContainText(/over_request_rate_limit/i);
    // Countdown reflects Retry-After header
    await expect(notice).toContainText(/Retry in \ds/);
    // Sign in button is disabled while throttled
    await expect(page.getByRole("button", { name: /^Sign in$/i })).toBeDisabled();
  });

  test("repeated sign-up attempts surface friendly 429 with countdown", async ({ page }) => {
    await page.route("**/auth/v1/signup**", rateLimited(6));
    await page.route("**/rest/v1/rpc/check_beta_invite**", (r) =>
      r.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: "true" }),
    );

    await page.goto(`${BASE_URL}/auth`);
    await page.getByRole("tab", { name: /Sign Up/i }).click();
    await page.getByLabel(/^Email$/i).fill("rate-signup@example.com");
    await page.getByLabel(/^Password$/i).fill("SomePass123!");

    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: /Create account/i }).click();
      await page.waitForTimeout(150);
    }

    const notice = page.getByRole("alert");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText(/too many sign-up attempts/i);
    await expect(notice).toContainText(/Retry in \ds/);
    await expect(page.getByRole("button", { name: /Create account/i })).toBeDisabled();
  });

  test("captcha failure on sign-up shows non-technical guidance", async ({ page }) => {
    await page.route("**/auth/v1/signup**", captchaFailed());
    await page.route("**/rest/v1/rpc/check_beta_invite**", (r) =>
      r.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: "true" }),
    );

    await page.goto(`${BASE_URL}/auth`);
    await page.getByRole("tab", { name: /Sign Up/i }).click();
    await page.getByLabel(/^Email$/i).fill("captcha-test@example.com");
    await page.getByLabel(/^Password$/i).fill("SomePass123!");
    await page.getByRole("button", { name: /Create account/i }).click();

    // sonner toast renders the message; assert by visible text.
    await expect(page.getByText(/bot check failed/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/captcha verification process failed/i)).toHaveCount(0);
  });
});
