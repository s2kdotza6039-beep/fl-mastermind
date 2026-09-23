# Fix production Google sign-in redirect

## Outcome
- Replace the Google button’s Lovable broker call with the requested native Google sign-in call and fixed production callback URL.
- Add a public `/auth/callback` screen that waits for a verified session, sends successful users to `/dashboard`, and shows a visible recovery error otherwise.
- Keep email/password sign-in, roles, access rules, and Paddle behavior unchanged.
- Prevent signed-in users from remaining on or returning to the public landing page.

## Implementation
- Update the existing auth page to remove its Lovable OAuth import and use the existing app auth client for Google.
- Add a focused callback page with loading, provider-error, timeout, retry, and sign-in fallback states.
- Register the callback as a bare public route and make the landing page redirect authenticated users to the dashboard after auth loading completes.
- Add targeted tests for callback success/failure and authenticated landing behavior where practical.

## Security follow-up
- Tighten the flagged public incident rule so only publishable status records are publicly readable, while preserving the public status page and admin controls.

## Verification
- Run the auth-focused tests and project checks.
- Verify the callback’s no-session error and authenticated redirect locally.
- Check the published flow after deployment; a true incognito Google test requires a non-admin Google account controlled by the project owner.
