# Word Marker — Production Readiness Plan

Phased plan to take Word Marker from a local SQLite app to a deployable,
billed, compliant product. Phases are ordered by dependency; later phases
assume the exits of earlier ones.

Status legend: ✅ done · 🔄 in progress · ⬜ not started

---

## Phase 0 — Secret hygiene & config — ✅ done
**Goal:** Nothing sensitive in source; all secrets via env. (Blocker for everything.)

- Remove `SEED_EMAIL` / `SEED_PASSWORD` from `config.js`; rotate that password since it's
  in git history. Replace the seed-user mechanism with a one-off admin-provisioning script
  that reads env vars.
- Introduce a typed config loader that reads from `process.env` with validation and
  fail-fast on missing required vars (DB URL, JWT secret, Stripe keys, OAuth creds,
  Resend key, app URLs).
- Move the JWT secret out of `data/jwt.secret` into env (`jwt.js`).
- Add `.env.example`; confirm `.env` is gitignored. Remove the stray `ssh`/`ssh.pub`
  from the project tree.

**Exit:** App boots only from env config; no secrets in repo.

---

## Phase 1 — Postgres migration — ✅ done
**Goal:** Replace `node:sqlite` with Postgres without changing product behavior.

- Choose driver (`pg`) and a real migration tool (`node-pg-migrate`) to replace the
  ad-hoc `PRAGMA`/`ALTER` blocks in `migrate.js`.
- Port schema to Postgres: `SERIAL`/`IDENTITY` ids, `TIMESTAMPTZ`, `BOOLEAN`, proper
  `UNIQUE`/`FK` constraints. Convert rebuild-table migrations into clean forward
  migrations (legacy SQLite data is local dev only — no production backfill burden).
- Rewrite each `*.repository.js` from synchronous prepared statements to async `pg`
  queries. Ripples through every `*.service.js` and route.
- Replace the WAL/worker-thread import design (`db/index.js`, materials worker): the
  worker uses its own pooled connection.
- Keep the dictionary tables (jmdict/cedict/wikdict) in Postgres; adapt
  `backend/scripts/import_*.js` loaders.

**Exit:** Full app runs on Postgres locally; imports, reader, practice all work.

---

## Phase 2 — Hosting, TLS, CI, observability — 🔄 in progress (app code done)
**Goal:** A deployable, monitored environment.

Application code (done in-repo):
- ✅ Health-check endpoint (`GET /health`, runs `SELECT 1`) and graceful shutdown
  (drain connections, close pg pool, flush Sentry on SIGTERM/SIGINT) in `server.js`.
- ✅ CORS hardened to echo only the single allowed origin (`server.js`); security
  headers (CSP, HSTS [prod-only], X-Content-Type-Options, X-Frame-Options,
  Referrer-Policy, COOP) via `src/http/security.js`.
- ✅ `error.message` no longer leaked to clients in production; real errors logged
  and sent to Sentry. Sentry wired via `src/observability/sentry.js`, enabled only
  when `SENTRY_DSN` is set.
- ✅ Theme-init script externalised to `frontend/public/js/theme-init.js` so the
  strict CSP holds with no inline scripts.

Infrastructure / ops (outside the repo — owner: deploy):
- ⬜ Provision: app host, managed Postgres (automated backups + PITR), domain, TLS,
  reverse proxy, process manager.
- ⬜ Sentry account + `SENTRY_DSN`; uptime alerting.
- ⬜ Structured logging shipping.
- ⬜ Basic CI: lint + the test suite from Phase 9 (test suite arrives in Phase 9).

**Exit:** Staging environment reachable over HTTPS with backups and alerts.

---

## Phase 3 — Email infrastructure (Resend) — 🔄 in progress (app code done)
**Goal:** Reliable transactional email behind a provider-agnostic interface.

Application code (done in-repo):
- ✅ `backend/src/modules/email/` with a small `EmailService` (`sendVerification`,
  `sendPasswordReset`, `sendReceipt`, `sendDunning`) over a pluggable transport.
  A Resend transport (HTTP API via `fetch`, no SDK dependency) is used when
  `RESEND_API_KEY` is set; otherwise a console transport logs messages so
  dev/CI stay offline (mirrors the Sentry pattern).
- ✅ Localized email templates (subject + HTML + text) for every supported
  locale (en/ja/zh), selected from the recipient's native language.
- ✅ Service wired through `server.js` → `createApiHandler` → auth routes,
  ready for the Phase 4 verification / password-reset flows.
- ✅ `npm run email:test -w backend` sends a localized email end-to-end
  (`TEST_EMAIL_TO`, optional `TEST_EMAIL_LOCALE` / `TEST_EMAIL_TYPE`).

Infrastructure / ops (outside the repo — owner: deploy):
- ⬜ Resend account + `RESEND_API_KEY`; verified sending domain; set `EMAIL_FROM`.
- ⬜ Domain auth (SPF/DKIM) DNS records for deliverability.

**Exit:** Can send a localized verification email end-to-end.

---

## Phase 4 — Auth hardening — 🔄 in progress (app code done)
**Goal:** Session model fit to handle money and identity. Depends on Phases 1 & 3.

Application code (done in-repo):
- ✅ Real, revocable sessions. The `sessions` table is now active: cookies carry an
  opaque random token, only its SHA-256 hash is stored, so logout, password change,
  and password reset all revoke server-side. `src/auth/session.js`,
  `src/auth/tokens.js`, `auth.repository.js`, wired through `api.js`.
- ✅ Secure flag on cookies in production (`session.js`).
- ✅ Per-IP rate limiting on login / register / request-reset / resend-verification
  (`src/http/rate-limit.js`, applied in `auth.routes.js`).
- ✅ Email verification (soft gate: reminder banner + resend) and password reset
  flows — backend routes, `auth_tokens` table, localized emails, and frontend views
  (forgot/reset panels, verify banner, change-password in settings). Verify/reset
  links land on the app root with a query-param token the SPA consumes.
- ✅ Input validation: email-format check and an 8-char minimum password rule
  (`auth.service.js`).
- ✅ CSRF tokens on state-changing requests: `/api/auth/me` issues a signed
  token tied to the current session cookie hash (or anonymous context before
  login), and `POST` / `PATCH` / `DELETE` API requests must send it in
  `x-csrf-token`.

Ops (one-time):
- ⬜ Run `npm run migrate:up -w backend` against each environment to apply
  `1748000000002_auth-hardening` (adds `email_verified` + `auth_tokens`; existing
  users are backfilled as verified so they are never nagged).

**Exit:** Verified signup, login, logout-everywhere, password reset, throttling all work.

---

## Phase 5 — Google OAuth & account linking — 🔄 in progress (app code done)
**Goal:** "Sign in with Google" alongside email/password. Depends on Phase 4.

Application code (done in-repo):
- ✅ Schema: `1748000000003_google-oauth` makes password fields nullable and
  adds `oauth_accounts` for additive provider account linking.
- ✅ OAuth authorization-code flow (server-side), Google ID-token verification,
  and normal app session creation after Google sign-in.
- ✅ Account-linking rules: existing Google account logs in; verified Google
  email matching an existing password user links to that user; otherwise a new
  Google-only user is created with `email_verified = true`.
- ✅ Frontend Google button + callback error handling in auth views; localized.

Ops / user action:
- ⬜ Create a Google Cloud OAuth client with `openid email profile` scopes.
- ⬜ Add local redirect URI: `http://localhost:3000/api/auth/google/callback`.
- ⬜ Add production redirect URI after Cloudflare launch.
- ⬜ Set `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `API_URL`,
  and `APP_URL` in each environment.
- ⬜ Run `npm run migrate:up -w backend` against each environment.

**Exit:** Can register and log in via Google; linking behaves correctly; email/password still works.

---

## Phase 6 — Subscription limits (enforcement layer) — ⬜ not started, to be postponed until a test launch is complete
**Goal:** Server-side free-tier enforcement, independent of Stripe so it's testable first.

- Add a plan concept on the user (default free) plus a `subscriptions` table (status,
  current_period_end, stripe ids — populated in Phase 7).
- Distinct-lemma counter: a per-user count of unique lemmas across all their words.
  Implement as an efficient query (or maintained counter) usable inside import
  transactions. Define the canonical lemma key consistent with the reader's grouping
  (`materials.service.js`, `words.repository.js`).
- Enforce, atomically, for free users:
  - Max 1 language (`languages.service.js`).
  - The 10k-distinct-lemma cap on word/CSV imports (`imports.service.js`).
  - The "1 document" rule: allow a first document fully (even if >10k lemmas), then
    block further document imports (`materials.service.js` + worker). Enforce before
    the async import commits to avoid races.
  - Per-plan upload size limits in the multipart path (`request.js`).
- Frontend: limit-reached notifications and an always-present "Upgrade" / subscription
  button in the shell menu bar (`shell.js`); localize everything.

**Exit:** A free user hits each limit and sees a localized prompt; paid flag (toggled
manually for now) lifts them.

---

## Phase 7 — Stripe subscriptions — ⬜ not started, to be postponed
**Goal:** Real billing wired to Phase 6 enforcement. Depends on Phases 3, 4, 6.

- Stripe products/prices; Checkout (or Billing) session creation endpoint.
- Webhook endpoint (signature-verified) as the source of truth: subscription
  created/updated/canceled, payment succeeded/failed → update `subscriptions` + user
  plan, revoke sessions/downgrade on cancellation.
- Customer Billing Portal for cancellation/plan change/payment method.
- Dunning + receipts via Resend (Phase 3).
- Subscription page + status UI; reconcile the manual flag from Phase 6 with real state.

**Exit:** Paid subscribe → limits lift; cancel/expire → limits reapply; failed payment handled.

---

## Phase 8 — Legal & GDPR — ⬜ not started, to be postponed
**Goal:** Compliance required to take payments from the EU. Can run parallel to 6–7.

- Terms of Service, Privacy Policy, Refund Policy (live pages, linked at signup/checkout).
- Cookie consent.
- Data export and account deletion / erasure (cascades already exist via FKs; add the
  user-facing flows and ensure Stripe customer handling on deletion).
- VAT via Stripe Tax.

**Exit:** Required legal pages live; user can export and delete their account.

---

## Phase 9 — Tests, admin, launch readiness — ⬜ not started, to be postponed
**Goal:** Confidence on the money/identity paths. (Test scaffolding seeded earlier and
grown per phase.)

- Automated tests for: auth (verify/reset/rate-limit/session revocation), OAuth linking,
  limit enforcement edge cases (concurrent imports, the >10k first-doc rule), and Stripe
  webhook handling.
- Minimal admin tooling: view users, comp/refund/cancel subscriptions, handle disputes.
- Pre-launch pass: pricing finalized, error/empty states, accessibility check, load
  sanity test of the import worker under concurrency.

**Exit:** Critical paths covered by tests; support can manage subscriptions; ready for real users.
