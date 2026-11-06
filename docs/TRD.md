# Technical requirements · Travel circle booking

Build from [PRD.md](PRD.md) and [design.md](design.md). Implement thin Next.js App Router entry points under `src/app` and feature-owned business logic. The owner confirmed the route root. The app source and lockfile were unavailable during specification. Inspect the real repo before changing it. Preserve the package manager, existing auth/database setup if compatible, lint rules, imports, naming, migrations and test runner. Record material differences in the implementation handoff.

## Runtime and boundaries

Next.js App Router, strict TS, functional React, Tailwind, Clerk, Neon Postgres, Drizzle, Zod, official Razorpay Node SDK, Node crypto, Vercel. Use a Neon pooled connection with `pg` and Drizzle's node-postgres driver for interactive transactions and row locks. Keep secrets, pricing, matching authority and provider calls in server-only modules. Use Node runtime on database/payment routes. Server Components read data directly via the service layer. Client islands handle the quiz, accessible forms, Checkout and polling. Reuse existing primitives. A small email adapter with Resend or the existing transactional provider is sufficient.

```text
src/
  app/                       # URL map is in PRD
    (public)/                # home, trips, quiz, policy and support pages
    (auth)/                  # Clerk sign-in/up catch-all routes
    (member)/                # book/[departureId], account/bookings/...
    admin/                   # role-gated operator workflows
    api/                     # route handlers, provider webhook, protected jobs
    layout.tsx
    globals.css
  features/
    trips/                   # itinerary, departure inventory, waitlist, hosts
    quiz/                    # question versions, scoring, result, consent
    bookings/                # holds, policy snapshots, lifecycle
    verification/            # review decisions and access controls
    payments/                # instalments, orders, captures, refunds, reconciliation
    circle/                  # roster projections, playlist and mutual reconnect
  components/ui/             # shared controls and layout primitives only
  lib/                       # auth, db, env, email, jobs, observability
drizzle/                     # checked-in SQL migrations, follow repo convention
```

Within a feature, colocate schema, service, queries, UI and regression tests as needed. Use explicit input and output types at boundaries. Parse untrusted input with Zod, use `unknown` for caught errors, and map provider errors into safe user-facing states. Store timestamps in UTC and display Asia/Kolkata. Use integer paise and INR only.

## Data model and hard constraints

| Records | Persist and enforce |
|---|---|
| users, roles, host_assignments | Unique Clerk subject. Staff grants and assignment scope server-owned. Unique host/departure assignment. |
| trips, itinerary_days, hosts, departures, policy_versions | Unique slug. Date, sales cutoff, capacity, eligible ages, host, room plan, total paise, deposit basis points, payment window, versioned cancellation rules and concrete activity facts/tags. Prevent capacity reductions below allocated seats. |
| quiz_submissions, waitlist | Versioned option IDs, optional song/consent. Keep optional intent in tab memory by default and discard on completion. Owned saved submissions. Unique traveller/departure waitlist entry. |
| bookings | UUID, owner, departure, state, hold/review/due timestamps, immutable quote and policy version, quiz snapshot with private intent omitted, consent timestamps. Partial unique index on owner/departure for active states. |
| reviews | Booking, reviewer, call scheduling status, decision, reason code, timestamps, revision. No ID scan or document numbers. Restrict review notes and audit access. |
| instalments, gateway_orders | Two instalments per booking, unique booking/kind. Amount immutable. Persist provider mode, receipt, gateway order ID (unique per mode), local operation key, request state and creation lease. Keep history of replaced orders. |
| payment_attempts, allocations | Unique provider payment ID per mode, order, amount, currency, status, captured time. At most one applied capture per instalment. Preserve every extra charge and its refund obligation. |
| cancellations, refunds | Policy quote, cancellation origin/time, per-payment refund operation UUID, provider ID, amount, request body fingerprint, idempotency key, state and retry metadata. Indexed by payment and booking. |
| webhook_inbox, outbox, audit_log | Unique provider/mode/event ID. Validated event fields, delivery state, attempt count and next retry. Outbox unique business transition key for receipts/notifications/refunds. Append audit actor, time, operation and reason. |
| circle preferences, tracks, reconnect_choices, support_cases | Assigned departure, opt-ins, contact-share revocation, private support owner and lifecycle. Unique directed participant pair per departure. No self-selection. |

Use FK integrity, positive paise amounts, valid age ranges and time windows. Define capacity as the count of held, under-review, balance-due and confirmed bookings. A confirmed booking retains its seat until cancelled or the trip concludes. All allocate/release/expire/confirm transitions acquire the same departure row lock, then booking, then instalment/payment locks in a stable order. Every booking mutation uses these services, including admin and jobs.

## Quiz contract

Version the nine questions and store stable choice IDs. Keep guest answers in session storage except private intent in component memory. On sign-in hand off once to the signed-in user, revalidate server-side and clear the draft. Age must be an integer, at least 18 to proceed. Check age range, published/open status, sales cutoff and capacity again at booking.

Use equal weight for Q3 pace, Q4 activity, Q5 structure and Q6 evening in v1. Each exact option-to-departure tag match earns one point. Store a displayable itinerary fact with each matchable tag. Sort by points then nearest date then stable departure ID. Zero matches can be displayed as eligible alternatives with factual descriptions. Use Q2/Q7 for opt-in host guidance. Q8 and Q9 never affect scoring. On a private result route regenerate from validated answers. Share URLs/poster exports may contain only public destination artwork and approved trip information.

## Booking state machine

| From | Trigger | To and atomic side effects |
|---|---|---|
| none | Authenticated eligible guest accepts current quote/policy and a seat is free | HELD, snapshot price, create deposit obligation, set hold expiry. |
| HELD | Verified deposit capture applied before hold expiry | UNDER_REVIEW, retain seat, create review and receipt outbox records. |
| HELD | Hold expires | EXPIRED, release seat. Any later observed capture follows the late-money rule below. |
| UNDER_REVIEW | Staff requests information or SLA exceeded | Remain UNDER_REVIEW. Track action, send notice and escalate overdue reviews. |
| UNDER_REVIEW | Reviewer approves | BALANCE_DUE, create balance obligation, set deadline once, send secure account link. |
| UNDER_REVIEW | Reviewer rejects | REJECTED, release seat, create full refund obligation for deposit and notify. |
| BALANCE_DUE | Verified balance capture, before deadline, valid deposit allocation | CONFIRMED, retain seat, send receipt/itinerary, grant circle access. |
| BALANCE_DUE | Deadline expires | EXPIRED, release seat, apply snapshotted timeout policy and queue refunds. |
| Any active state | Accepted cancellation or departure cancelled | CANCELLED, release seat, revoke access, apply policy to actual captured funds. |
| CONFIRMED | Operator closes trip after return | COMPLETED, enable post-trip choices for recorded attendees. |

For pilot, valid fulfilment requires a still-active, unexpired entitlement **at the server transition**, using database time. Just before expiry a job may reconcile a known order to avoid an unnecessary refund. If confirmed funds surface after expiry or cancellation, record the capture and queue a full refund of that unapplied charge even if a new seat is available. Make this timing rule clear before payment. Never reopen an old booking. A delayed payment.failed event affects that attempt only. Financial state (e.g. refund pending) is independent from seat state.

## Razorpay protocol

### 1. Price and reserve

Client sends departure ID and accepted quote/policy versions. Ignore client-supplied money, owner and eligibility. Read server price under lock, recheck availability, calculate deposit in paise using nearest-integer rounding, balance = total minus deposit. Require both positive. Example total 1,200,000 paise at 3,000 basis points → 360,000 deposit and 840,000 balance. If the quote changed return 409 with a new review step. Persist the accepted values, deadline rule and taxes/fees breakdown.

### 2. Create a separate order for each instalment

Verify signed-in ownership, active status and correct stage on every create/resume call. Reserve the local order operation transactionally. Call Razorpay Orders server-side after commit using INR, exact instalment amount, unique receipt (max 40 characters) and no sensitive notes. Partial payment on each provider order is disabled. Store the order ID before returning Checkout options. Public response contains only publishable key ID, order ID, amount, currency and display metadata.

A replay reuses the existing payable order. A leased, in-flight create returns processing. If the provider response is lost, mark creation uncertain and reconcile the original receipt/order via provider records before a replacement. Never enable two unresolved payable orders for one instalment. Do not hold Postgres locks during network calls. Approval is required server-side even if a user manually calls the balance route. [Orders and Standard Checkout](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/)

### 3. Open Checkout and verify the response

Load Razorpay Standard Checkout on the payment interaction. Use HTTPS. Enable and verify automatic capture in the merchant dashboard for both environments. Never collect card, UPI PIN or banking credentials in the app. Modal dismissal returns to the booking. Pending state polls an owner-scoped, non-cacheable status endpoint with backoff and a manual refresh fallback.

POST the three Checkout response fields to the authenticated confirmation endpoint. Resolve the expected order from this booking and instalment on the server. Require returned order ID to match. Calculate HMAC-SHA256 over `storedOrderId + "|" + paymentId` with the Razorpay **key secret**. Validate well-formed hex, compare equal-length digests in constant time. Fetch payment by ID with server credentials. Require its order ID, mode context, INR currency, exact expected amount and captured status to match before applying it. An authorised or unknown payment stays pending. Rate-limit verification and pass both webhook and API-confirmed capture through the same transactional allocation function. [Checkout signature and capture guidance](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/)

### 4. Receive gateway events

Expose a public POST webhook excluded from Clerk login redirects and browser CSRF checks. Read the bounded original bytes once via `request.arrayBuffer()`. Verify `X-Razorpay-Signature` with HMAC-SHA256 and the **webhook secret** before parsing. While rotating, accept the previous secret for the bounded retry window. Use separate endpoints/secrets or fully isolated deployments for test and live. Check configured account identity and expected environment. Reject invalid signatures. Validate the event schema, persist the minimum required fields and the `x-razorpay-event-id` uniquely, then acknowledge 2xx. On persistence failure return non-2xx. Duplicate validated deliveries already stored can return 2xx.

Subscribe to payment.captured, payment.failed, order.paid, refund.created, refund.processed and refund.failed in the matching dashboard mode. Treat order.paid as a wake-up to resolve the associated captured payment. A worker locks and processes inbox records transactionally with allocation and outbox updates. Deduplicate by payment ID across distinct events and callback replays. If mapping is missing or amount differs, quarantine and alert finance. Confirm actual provider status before resolving conflicting events. Use bounded retries and an admin-visible intervention queue. [Webhook verification](https://razorpay.com/docs/webhooks/validate-test/) · [Payment events](https://razorpay.com/docs/webhooks/payments/)

### 5. Cancel and refund

Preview the exact cancellation quote server-side against the frozen rules and current time. Use short-lived quote IDs; require renewed consent if the amount changes. Commit cancellation, capacity release and obligations in one transaction. Operator cancellation and verification rejection refund all captured funds. For a partial refund allocate across captures in a fixed order (balance first, then deposit). A full cancellation after both payments creates a refund against **each** applicable payment ID.

Lock each original payment. Reserved + processed refunds must stay within its captured amount across app, admin and reconciliation paths. Persist a unique UUID per refund and the immutable request before the external call. Submit normal refund in paise against the captured Razorpay payment, with a stable receipt and `X-Refund-Idempotency` key for the same body across retries. If the installed SDK cannot pass the documented header, use a server-only authenticated HTTP request for this endpoint. Timeout/409 keeps the operation pending. Reconcile provider refunds, including dashboard-initiated refunds, before issuing a new operation. Track requested → processing → processed/failed. A failed refund alerts finance and keeps the liability visible. Mark processed only from verified provider evidence. Provide customer-visible references and bank-credit timing from merchant policy. [Normal refund API](https://razorpay.com/docs/api/refunds/create-normal/) · [Operation-specific idempotency](https://razorpay.com/blog/payment-gateway-webhooks-india)

## API contracts

All paths below start with `/api`. Private responses use `Cache-Control: private, no-store`. Public catalogue pages may cache descriptions. Re-read price and inventory transactionally before creating a hold.

| Method and path | Caller and contract |
|---|---|
| POST /quiz/match | Guest, rate-limited. Validate version and answers, return public ranked departures and reasons. Optionally save through an authenticated action. |
| POST /departures/[id]/waitlist | Consented visitor; validate and rate-limit, deduplicate and return generic acknowledgement. |
| POST /bookings | Member. Departure, quiz, attestation, quote/policy versions, client operation key. Return existing or new owned hold. |
| POST /bookings/[id]/orders | Owner, deposit or balance. Return Checkout configuration or 202 processing. |
| POST /bookings/[id]/payments/verify | Owner, order/payment/signature. Return authoritative stage or 202 pending. |
| GET /bookings/[id] | Owner or scoped staff. Return role-specific status, obligations, receipts, deadlines and allowed next actions. |
| POST /bookings/[id]/cancel-quote, /bookings/[id]/cancel | Owner. Preview then commit cancellation by quote ID, idempotently. |
| POST /bookings/[id]/review-call | Owner. Request available review slot or submit private contact request to staffed queue. |
| POST /admin/reviews/[id]/decision | Reviewer. Expected revision, decision, reason. Stale concurrent decision returns 409. |
| POST /admin/departures, PATCH /admin/departures/[id] | Operator. Validated draft/publish/close/cancel/complete actions, audit and guarded version. |
| POST /admin/payments/[id]/reconcile | Finance. Re-fetch canonical provider state; audited, idempotent. Refund retry uses original immutable request. |
| POST /circle/[departureId]/tracks, /circle/[departureId]/reconnect | Eligible member. Requires appropriate consent, scope, completion and mutuality. Verify target membership. |
| POST /support | Owner or rate-limited guest. Validate contact, store case and enqueue delivery to staffed support inbox. |
| POST /webhooks/razorpay | Provider signature only. Durable acceptance contract above. |
| GET /internal/jobs/tick | Scheduler bearer secret, fail closed. Acquire DB leases for short batches and report backlog. |

Use 401 for anonymous private calls, 404 for foreign objects, 403 for ungranted staff actions, 409 for stale state/capacity and 422 for invalid input. Mutations return a stable code, safe message and correlation ID. Scope idempotency keys by actor/operation with request hash; reused key plus changed request returns conflict.

## Security and operations

- Authorise all database operations server-side, including Server Actions, private receipts and admin pages. Require staff MFA, least privilege and audited role changes. Validate origin and CSRF protections on cookie-authenticated mutations. Rate-limit by user/IP through shared storage. Reject open redirects, unbounded bodies, unsupported enums and forged quote versions.
- Use environment validation, separate databases and keys for staging/live, and restricted logs. Required server env includes DATABASE_URL, CLERK_SECRET_KEY, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET, merchant account/mode, scheduler secret, email API key and sender. Only the Clerk publishable key and Checkout key ID are public. Keep provider secrets out of client bundles and API responses. Configure tested CSP allowances for official Checkout, auth, frames and network destinations.
- Trigger a protected worker on a schedule meeting hold/due-time precision (target every minute on a supported deployment plan). Every request independently checks deadlines. Use durable Postgres inbox/outbox with leasing, bounded concurrency and retry delays. Never rely on work continuing after the HTTP response. Retry emails through an idempotent provider operation when supported. Account pages remain authoritative.
- Reconcile pending orders, captures and refunds regularly with server-fetched provider data. Run a daily payments/refunds comparison against provider records, including dashboard operations and orphan transactions. Monitor old pending orders, failed signatures, review SLA, late captures, failed refunds and inbox/outbox lag. Provide finance a documented replay path and retain an audit trail. Alert when scheduled workers stop running.
- Configure private data retention/deletion, encrypted transport and restricted backups. Redact raw quiz, notes, ID/contact data, provider payloads and credentials from logs/analytics. Email only the necessary amount, deadline, reference and an authenticated booking link. Inspect recipient before sending. Document backup restore and secret rotation before launch.

## Delivery sequence for Claude Code

1. Inspect repo and available scripts. Preserve conventions, identify package versions, migrations and auth boundaries. Build the public route skeleton, tokens and real content data contract.
2. Implement catalogue, guest quiz, ranking, result, Clerk return flow and owner-scoped booking dashboard. Add a deterministic staging seed with a one-seat departure for races.
3. Build transactional holds, versioned policies, reviewer console and state machine. Exercise approval/rejection and expiry using a clock injected in tests.
4. Integrate test-mode Razorpay, both orders, signatures, webhook inbox, allocation, refunds and reconciliation. Wire the scheduler, operator queue, customer receipts and email. Keep live mode disabled by default.
5. Finish circle, waitlist, support, accessibility and operational pages. Apply migrations to a fresh staging database, register staging webhook and document reproducible local/test-mode setup in the target repo.
6. Run typecheck, lint, production build, unit/integration tests against real Postgres and browser flows. Report exact commands, results and external configuration still needed. Live enablement requires a configured merchant, approved terms, staffed verification and a successful test-mode checkout for both instalments.

## Release evidence

| Test | Expected invariant |
|---|---|
| Two parallel bookings for last seat; double-click deposit | One holder, one obligation, no oversell or duplicate order. |
| Wrong age, foreign booking, unapproved balance, forged price | Rejected on server before hold/order/money changes. |
| Wrong signature, altered raw bytes, rotated webhook secret | Invalid rejected; valid retry verified, durably stored once. |
| Checkout returns first, webhook first, no browser return, duplicate events | Same captured payment applied once, one seat and receipt. |
| Failed attempt then success; late failure after captured | Attempt history preserved; successful state remains monotonic. |
| Timeout during provider order/refund call or database write | Existing operation reconciled; no extra charge/refund from retry. |
| Clock expires during capture, second capture for instalment | Seat rules hold; unapplied capture visible, refund queued. |
| Reviewer rejects; approval sent twice; balance expires | Correct seat release/refund; approval timestamp/deadline never extended by replay. |
| Traveller/organiser cancels after both payments; dashboard refund races worker | Right amount per original payment; sum never exceeds captured. Finance can see discrepancy. |
| Refund fails, email fails, scheduler restarts | Durable pending work is recoverable, alerts fire and user sees actual status. |
| Real Razorpay Test Mode staging run | Store sanitised booking reference, both order/payment IDs, signed webhook processing results, refund IDs and matching ledger totals. Simulators supplement this run. |
| Mobile keyboard, duplicate submit, interrupted quiz, expired auth | Accessible recovery with selections and booking state preserved. |

Implementation references: [Next.js App Router](https://nextjs.org/docs/app), [Drizzle and Neon](https://orm.drizzle.team/docs/connect-neon), [Razorpay Standard Checkout](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/), [webhook validations](https://razorpay.com/docs/webhooks/validate-test/) and [refund API](https://razorpay.com/docs/api/refunds/create-normal/).
