# Studio Sensei — Your AI FL Studio Engineer & Mentor

Studio Sensei is an AI music-production coach for FL Studio producers, artists and engineers.
It teaches you to mix, master and build hits — from idea to international standard — with
engineer-grade guidance, exact FL Studio menu paths and numbers, in every genre (amapiano,
trap, afrobeat, gospel, house, kwaito, drill and beyond).

> **Status:** production-ready. Build, typecheck, lint and 191 unit tests all pass.

---

## Highlights

- **Sensei Chat** — a streaming AI mentor that explains the *why* behind every move, always
  offering Option 1 / 2 / 3 with trade-offs and a mandatory action checklist.
- **Production / Mixing / Mastering coaches** — step-by-step flows with objective scoring,
  issue detection and repair plans.
- **Upload & Analyse** — in-browser DSP (via a web worker) measures LUFS, peak, dynamic range,
  stereo width, tonal balance and key, then turns it into a coaching plan.
- **Genre Playbooks** — style-specific targets (loudness, width, balance) per genre.
- **Key Detection** — lock root note and align 808s, melodies and vocals.
- **Plugin Chain Builder** — FL Studio chain templates gated to *your* edition and inventory.
- **Plugin Inventory** — native / third-party / custom plugin tracking with import, dedupe and history.
- **Projects** — persistent per-song memory, session checklist, proof-lock and release paperwork
  (ISRC, streaming loudness targets, PDF/CSV export).
- **Membership** — Free plan gets 3 Sensei questions. **Pro: $10/month** (billed in USD via Paddle,
  our Merchant of Record). Unlocks unlimited chat, plugin chains, the full coaches and exports. A
  Paddle webhook grants and revokes the `paid` role automatically.
- **Admin suite** — user roles, subscriber list, invites, activity logs, incidents, feedback review,
  audio reports, purge audit and a public status feed (RSS + JSON).
- **Trust & safety** — row-level security everywhere, no secret keys in the browser, soft-delete +
  purge for audio, and public legal pages (Terms, Privacy, Ownership, Security, Trust, Status).

---

## Tech stack

| Layer        | Tech |
|--------------|------|
| UI           | React 18, TypeScript, Vite 5, Tailwind CSS 3, shadcn/ui (Radix) |
| State/data   | TanStack Query, React Context, React Router 6 |
| Backend      | Supabase — Postgres (RLS), Auth (Google OAuth), 8 Edge Functions (Deno) |
| AI           | Lovable AI gateway (`gemini-3-flash-preview`) |
| Payments     | Paddle Billing (Merchant of Record — hosted checkout + webhook) |
| Charts/docs  | Recharts, jsPDF |

---

## Getting started

**Prerequisites:** Node.js 20+ and npm (or Bun).

```bash
# 1. Install
npm install

# 2. Configure environment
cp .env.example .env
#    Fill in your Supabase project URL + publishable key (Dashboard → Settings → API)

# 3. Run locally (serves on http://localhost:8080)
npm run dev
```

### Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. Apply the migrations in [`supabase/migrations`](supabase/migrations) (e.g. `supabase db push`,
   or paste them in the SQL editor).
3. Deploy the edge functions:

   ```bash
   supabase functions deploy sensei-chat detect-key status-feed verify-invite admin-set-role admin-delete-user paddle-subscribe paddle-webhook --no-verify-jwt
   ```

4. Set the edge-function secrets:

   ```bash
   supabase secrets set SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... LOVABLE_API_KEY=...
   ```

   - `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` — from Dashboard → Settings → API.
   - `LOVABLE_API_KEY` — key for the AI gateway used by `sensei-chat` (and `detect-key`).
5. **Payments (Paddle):** create a **Product + Price** for $10/month (USD) in your Paddle dashboard
   (Catalog → Products), then set the function secrets `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`,
   `PADDLE_PRICE_ID` (the `pri_…` price ID), and `APP_ORIGIN` (your site URL). In Paddle → Developer
   tools → Notifications, point the webhook at `https://<project-ref>.supabase.co/functions/v1/paddle-webhook`
   and subscribe to `transaction.completed`, `subscription.activated`, `subscription.updated` and
   `subscription.canceled`. Paddle is the Merchant of Record, so it also handles global sales tax/VAT.
6. **Checkout (client token):** create a **Client-side token** in Paddle (Developer tools →
   Authentication → Client-side tokens, available once your account is verified) and set
   `VITE_PADDLE_CLIENT_TOKEN` (plus `VITE_PADDLE_ENV=sandbox` while testing) as a frontend env var.
   Paddle Billing checkout runs through Paddle.js, so this token is required for the checkout to open
   (both the on-page overlay and the hosted payment link).
6. Configure **Authentication → Providers → Google** (see `/oauth-check` in the app, plus the
   `check-google-oauth.mjs` script below, to verify it end-to-end).
7. The first user to sign in with `studiosensei@s2kdotza.com` is auto-granted the `admin` role
   (see `src/lib/beta-config.ts`).

---

## Scripts

| Command              | What it does                                   |
|----------------------|------------------------------------------------|
| `npm run dev`        | Start the Vite dev server (port 8080)          |
| `npm run build`      | Production build → `dist/`                     |
| `npm run lint`       | ESLint (0 errors / 0 warnings)                 |
| `npm run lint:fix`   | ESLint with autofix                            |
| `npm run typecheck`  | `tsc` type-check                               |
| `npm test`           | Vitest — 191 tests across 30 files             |
| `npm run check:oauth`| Google OAuth configuration smoke test          |

---

## Deployment

**Recommended: Netlify** (a ready-made [`netlify.toml`](netlify.toml) is included).

1. Push this repo to GitHub and connect it in Netlify.
2. Add the env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`) in **Site settings → Environment variables**.
3. Deploy. The SPA rewrite and asset caching are already configured.

Works equally well on **Vercel** (auto-detects Vite; add the same two `VITE_*` env vars) or
**Cloudflare Pages** (build `npm run build`, output `dist`, add an SPA fallback to `/index.html`).

---

## CI & ops

- [`.github/workflows/ci.yml`](.github/workflows/ci.yml) — lint, typecheck, test and build on push/PR.
- [`.github/workflows/check-oauth.yml`](.github/workflows/check-oauth.yml) — daily Google OAuth config smoke test (optional Slack/email/webhook alerts).
- [`.github/workflows/security-gate.yml`](.github/workflows/security-gate.yml) — fails CI if new high/critical security findings appear vs. the baseline.

---

## Project structure

```
src/
  components/     UI + feature components (shadcn/ui primitives under components/ui)
  context/        Auth, Project, Session, TrackSession, PluginInventory, StudioSetup providers
  hooks/          use-production-phase, use-loop-lock, …
  integrations/   Supabase client + generated types
  lib/            Domain logic (coaching loop, audio analysis, chords, grooves, …) + tests
  pages/          Routes (Landing, Dashboard, Chat, coaches, admin, legal, …)
  workers/        audio-analysis web worker
supabase/
  migrations/     Postgres schema + RLS policies
  functions/      sensei-chat, detect-key, status-feed, verify-invite, admin-set-role, admin-delete-user, paddle-subscribe, paddle-webhook
scripts/          Google OAuth check + security gate
```

---

## License

Private. All rights reserved. See [`/ownership`](https://github.com/s2kdotza6039-beep/fl-mastermind) in-app for content ownership terms.
