# Implementation handoff

Built on 6 November 2026 from the PRD, design and TRD in this folder. The workspace had no existing app, so the scaffold, conventions and package set are new; material choices are recorded below so a reviewer can agree or change them before launch.

## Delivery sequence status

| TRD step | Status |
|---|---|
| 1. Scaffold, tokens, content data contract | Done. `create-next-app` (Next 16.4, React 19.3, Tailwind 4.3, pnpm 12). Tokens in `src/app/globals.css`, fonts via `next/font/google`. Cache Components and partial prefetching were switched off so private pages render dynamically; revisit if public catalogue caching is wanted. |
| 2. Catalogue, quiz, ranking, result, Clerk return flow, owner dashboard, staging seed | Done. Seed includes a one-seat departure. Clerk is wired but unconfigured in this workspace; a local dev bypass (`AUTH_DEV_BYPASS=true`, non-production only) exercised the flows in the browser. |
| 3. Transactional holds, versioned policies, reviewer console, state machine, injected-clock expiry | Done and covered by integration tests against Postgres 16. |
| 4. Razorpay test mode, both orders, signatures, inbox, allocation, refunds, reconciliation, scheduler, receipts, email | Done against an in-memory provider fake with the real signature maths. Real test-mode execution still needs merchant keys (see “Needs credentials”). Email records deliveries in the database when `RESEND_API_KEY` is absent. |
| 5. Circle, waitlist, support, accessibility, operational pages, migrations, webhook registration docs | Done except webhook registration on a real dashboard (needs account). Migrations apply cleanly to a fresh database (`scripts/reset.ts`, test global setup). |
| 6. Typecheck, lint, build, tests, browser flows, report | Done. Results below. |

## Commands run and results

| Command | Result |
|---|---|
| `pnpm typecheck` | clean |
| `pnpm lint` | clean (React Compiler rules included) |
| `pnpm build` | succeeds; 52 routes, proxy (middleware) compiled |
| `pnpm test` | 6 files, 47 tests, all passing against Postgres 16 in Docker (`chalants_test`, schema recreated from `drizzle/0000_init.sql` each run) |
| Browser (dev server, dev auth bypass, seeded data) | home → quiz (9 screens, Q8 kept out of storage) → ranked result with factual reasons → dev sign-in with safe return → reserve one seat (hold, countdown, price review) → deposit button reports missing Razorpay keys (503 `PAYMENTS_NOT_CONFIGURED`) → cancellation quote → cancellation committed, seat released. Admin reviews/payments/departures pages render for the seeded operator. |

## Release evidence mapping

| TRD test | Automated coverage |
|---|---|
| Two parallel bookings for last seat; double-click deposit | `booking-flow.test.ts`: “lets exactly one of two parallel bookings take the last seat”; “creates one provider order even when the pay button is double-clicked” |
| Wrong age, foreign booking, unapproved balance, forged price | “rejects wrong age, closed departures and forged quote versions…”; “refuses orders for foreign bookings and for an unapproved balance” |
| Wrong signature, altered raw bytes, rotated webhook secret | `signature.test.ts`; `webhooks.test.ts` “rejects invalid signatures and altered bytes, accepts the rotated secret, stores each event once” |
| Checkout first, webhook first, no browser return, duplicate events | “applies the same capture once when the browser callback and the webhook both arrive”; “applies a capture that arrives by webhook first…” |
| Failed attempt then success; late failure after captured | “keeps attempt history…” (status is monotonic) |
| Timeout during provider order/refund call | “reconciles a lost provider response by receipt…”; “keeps a timed-out refund pending and adopts the provider refund on retry without a second charge” |
| Clock expires during capture; second capture for instalment | “expires an unpaid hold… refunds a deposit that lands late”; “expires the balance window… refunds a balance paid after the deadline”; “records a second capture… as a duplicate and refunds it” |
| Reviewer rejects; approval sent twice; balance expires | “approval opens the balance exactly once and replays cannot extend the deadline”; “rejection releases the seat and refunds the deposit in full” |
| Cancel after both payments; dashboard refund races worker | “refunds each original payment on a traveller cancellation…”; “never refunds more than captured when a dashboard refund races the worker” |
| Refund fails, email fails, scheduler restarts | “keeps a failed refund visible and alerts finance”; `webhooks.test.ts` scheduler tests (lease, concurrent tick skipped, outbox delivered, near-expiry reconciliation) |
| Real Razorpay Test Mode staging run | **Not run**: requires merchant test keys and a public webhook URL. Procedure in README. |
| Mobile keyboard, duplicate submit, interrupted quiz, expired auth | Quiz restores from session storage; booking form uses a per-tab operation key; pages redirect to sign-in with a safe return path. Manual device matrix (360/390/768/1440, 200% zoom, keyboard-only) still to be run by QA. |

## Needs credentials or merchant configuration

- **Razorpay test keys** (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `NEXT_PUBLIC_RAZORPAY_KEY_ID`), automatic capture enabled, webhook registered with secret and the seven events. Then run the staging flow for both instalments and record order/payment/refund IDs plus the ledger totals from `/admin/payments`.
- **Clerk** (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`), sign-in/up URLs, MFA enforced for staff accounts, `BOOTSTRAP_OPERATOR_EMAILS` for the first operator.
- **Neon** pooled `DATABASE_URL` for staging and a separate one for live; run `pnpm db:migrate` then `pnpm db:seed` (fixtures only on staging).
- **Resend** `RESEND_API_KEY`, verified sender `EMAIL_FROM`, `STAFF_ALERT_EMAIL`, `SUPPORT_EMAIL`.
- **Scheduler**: `SCHEDULER_SECRET`; on Vercel set `CRON_SECRET` to the same value so the cron bearer matches. Confirm the plan supports a one-minute cron.
- **Content**: real trips, photography, host profiles, price/age/date inventory, published cancellation terms (replace the pilot policy version), merchant identity on `/about` and `/terms`, retention text.
- **Live enablement**: `RAZORPAY_MODE=live`, live keys and `PAYMENTS_LIVE_ENABLED=true` only after the test-mode staging run, approved terms and staffed verification.

## Landing page and photography (6 Nov 2026, second pass)

- The landing page was rebuilt as a long editorial page in the spirit of trippple.travel: photographic hero, marquee of promises, departure cards with photos, five numbered "how it works" sections with product mock-ups, a "what a day looks like" photo strip, host portraits, six promises, a stories wall, FAQ and a full-bleed closing call to action.
- Photography is hotlinked from Unsplash (`src/content/site.ts`), rendered through `next/image` with `images.unsplash.com` allowed in `next.config.ts`, and labelled as licensed stock in the footer and trip pages. Replace with the operator's own consented photography before launch; every reference lives in one file.
- Trips gained a `gallery_urls` column (`drizzle/0001_trip_gallery.sql`); the seed now sets hero, gallery and host portraits on existing rows.
- The stories wall shows sample quotes marked `approved: false` only when `APP_ENV` is not `production`, with a visible "pending traveller permission" badge. Do not approve a story until a traveller has given written permission and the text is theirs.

## Palette change (6 Nov 2026)

At the owner's request the tokens were replaced with a palette derived from trippple.travel's CSS variables (warm paper, espresso ink, neon orange action, acid lime highlight, dark band). The token table in  was updated to match. Primary buttons use ink-coloured text because white on the orange measures 3.06:1; all other pairs measure at least 4.5:1 (outline 4.9:1 against surface). Corner radii were remeasured from trippple.travel and mapped to tokens: pills for buttons and chips, 24 px editorial, 18 px cards, 12 px inputs, 8 px tiles.

## Layout width and content pages (6 Nov 2026)

The page container was widened from 1200 px to 1480 px and the reading column from 560 px to 760 px. Content pages (how it works, safety, cancellations, terms, privacy, contact, quiz) now open with a photo header (the PageHero component) and use a two-column reading layout (the TwoColumn component) with a sticky aside carrying photography, worked examples or key facts, so wide screens are no longer empty.

## Backgrounds and photography (6 Nov 2026, later pass)

Mirrors trippple.travel section rhythm: cream paper for the page, an espresso-dark band (bg-ink with the on-dark helper class) for the how-it-works feature and the footer, and an orange call-to-action band before the footer. Non-trip photography was swapped for higher-impact images (sunset group on a peak, golden-hour friends, a colourful old-city street, a dusk fire); trip hero and gallery photos remain of the actual destinations. Images are served at quality 85 with a 2400 px source width.

## Scheduling on Vercel Hobby (6 Nov 2026)

Vercel Hobby refuses sub-daily crons, so the per-minute cron was replaced. Deadline enforcement moved into the request path: creating a hold first closes lapsed holds and balance windows on that departure under the departure lock, opening a booking or polling its status expires it if due, and seat counts exclude lapsed bookings. The Vercel cron is now a daily safety net and a GitHub Actions workflow calls the tick every five minutes for emails, refunds and reconciliation; cron-job.org or Vercel Pro restores minute precision. Covered by lazy-expiry.test.ts.

## Decisions worth a review

- Refunds and reconciliation use a thin fetch client (`src/lib/razorpay/client.ts`) rather than the SDK so `X-Refund-Idempotency` can be sent per request; the SDK package is installed but unused.
- Capacity is derived (count of HELD/UNDER_REVIEW/BALANCE_DUE/CONFIRMED) under a departure row lock; there is no stored “seats left” counter to drift.
- Transition time comes from Postgres `now()` inside the transaction unless a clock is injected (jobs/tests).
- The booking idempotency key is per owner (`bookings_owner_operation_key_idx`) and also scoped through `idempotency_keys` with a request hash; a reused key with a different body returns 409.
- A hold that lapses without money is closed with origin `balance_timeout` (no cancellation row is created); the enum could gain a `hold_timeout` value in a follow-up migration for clearer reporting.
- Webhook events are processed inline after durable storage and again by the scheduler if that fails; eight attempts then `failed` plus an ops alert.
- Dev auth bypass exists only for local testing without Clerk; it is ignored when `NODE_ENV=production` or Clerk keys are present.

## Operational notes

- Retention/deletion: optional profile and quiz data are deletable per user; financial rows are kept. Implement the deletion job before launch (support category “deletion” already routes requests).
- Backups/restore and secret rotation: document with the hosting provider; webhook secret rotation is supported via `RAZORPAY_WEBHOOK_SECRET_PREVIOUS`.
- CSP: `next.config.ts` sets baseline security headers; add a tested CSP allowing `checkout.razorpay.com`, `api.razorpay.com`, Clerk and fonts before launch.
