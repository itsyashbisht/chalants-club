# Product requirements · Singles travel circles

Build an India-first web booking product for solo adults joining hosted group trips for singles. A visitor can discover a departure through a nine-question game, understand the fit, pay a deposit, complete human screening, pay the balance and meet their group. Use [design.md](design.md) for presentation and [TRD.md](TRD.md) for implementation.

## Product decisions

**Confirmed:** Next.js with TypeScript under `src/app`, Razorpay for INR, deposit → human verification → balance. The product sells multi-day trips. Matching recommends eligible departures. A confirmed traveller joins the circle for that departure.

**Configurable pilot defaults:** one adult traveller and one seat per booking, 30% deposit, 15-minute deposit checkout hold, 48-hour human review target after deposit, 24 hours to pay after approval. A pending review keeps the seat and triggers staff escalation when overdue. Display the actual deadline in Asia/Kolkata. Sales must close sufficiently early for review and balance collection. Seed Udaipur and Himalayan examples for test mode only. Prices, hosts, age bands, dates, capacity, tax-inclusive pricing and policies require real operator input to publish.

**Operating policy for the pilot:** manual private identity/age check via a scheduled call with an authorised reviewer. Traveller shows an accepted document live. Record the outcome, time and reviewer only. Provide instructions, a private scheduling/contact option, retry for an inconclusive call and an escalation channel. A guest self-attests single status and accepts the conduct rules. Publish exactly which checks the team performs. Review identity/age and conduct eligibility consistently. Dating preferences and taste are private and never grounds for rejection.

## Essential pages and completion criteria

| Route | Job | Required outcomes |
|---|---|---|
| `/` | Decide whether this is for me | “Who’s coming with you?”, nine-question entry, browse trips, next departures, safety and arrival preview. |
| `/trips` | Discover departures | Filter by dates/destination, see total price, age eligibility, duration, availability. Clear filters and handle empty results. |
| `/trips/[slug]` | Decide on a specific departure | Select a date. Show day-by-day plan, age range, host, meeting point area, stay/room arrangements, included and extra costs, pace, deposit, balance, cancellation terms and support. Deep link with departure ID. Full → waitlist. |
| `/quiz`, `/quiz/result` | Play without an account | Progress, back/edit, restore current tab on refresh. Show ranked options and why. Browse or change answers. Save after sign-in. |
| `/how-it-works`, `/safety`, `/about` | Understand the offer and operator | Explain matching, acceptance, financial steps, named organisers, room setup, optional activities, reporting and real verification process. |
| `/contact`, `/terms`, `/privacy`, `/cancellations` | Resolve concerns | Working contact and private reporting route, merchant identity, support hours, cancellation examples, processing timelines, data use/retention, consent and deletion request route. Version policies and record acceptance. |
| `/sign-in`, `/sign-up` | Secure an account | Clerk auth, safe same-origin return to selected departure. A guest can browse and finish the quiz first. |
| `/book/[departureId]` | Reserve one seat | Auth, eligibility, quiz handoff if incomplete, self-attestation, price review, policy acceptance, then time-limited hold and deposit Checkout. |
| `/account/bookings`, `/account/bookings/[id]` | Track my booking | Empty/pending/confirmed states, reference, review instructions, payment history, receipts, due date, support and cancellation quote. Return here from Checkout. |
| `/account/bookings/[id]/verification`, `…/balance` | Complete next step | Request/rebook a private review call. Show approved balance and deadline. Expired or closed bookings show recovery/support. |
| `/account/bookings/[id]/circle` | Prepare and reconnect | Confirmed travellers get host details, logistics, approved song contributions and intro preferences they choose to share. After completion enable private mutual reconnect. |
| `/admin/departures`, `/admin/departures/[id]` | Operate inventory | Create/edit trip, itinerary, departure, pricing, policy and host. Preview, publish, close, cancel, complete, view roster and waitlist. Block edits that invalidate existing commitments. |
| `/admin/reviews`, `/admin/bookings/[id]` | Verify and support | Queue with SLA, private call instructions, approve/request follow-up/reject with audit, support timeline and cancellation preview. |
| `/admin/payments` | Resolve money issues | Search by booking/order/payment/refund reference, inspect discrepancies, pending/failed refunds, reconciliation and retry history. Restricted finance actions. |

Shared surfaces include a mobile menu, auth expiry recovery, 403/404, route-level loading/error screens, sold-out waitlist signup with consent, private receipts and real transactional email. A waitlist records interest in a departure. Staff may invite a person to book an available seat through the ordinary flow.

## The nine-question game

Q2–Q8 use one choice per screen. Q1 is numeric. Q9 is optional free text for track and artist with a skip. Keep answers editable until the booking snapshot. Use stable option IDs independent of display wording.

| # | Prompt | Choices | Use |
|---|---|---|---|
| 1 | How old are you? | Age in whole years | Adult gate and departure age range |
| 2 | You’ve just checked in. You know nobody yet. Which first hello feels easiest? | Chai with two people / team game / dinner with everyone / settle in first | Private host welcome preference |
| 3 | Tomorrow’s sunrise is supposed to be unreal. The catch? A 5:30 a.m. alarm. What’s your move? | Do the hike / short walk to the viewpoint / sleep in and join breakfast | Pace |
| 4 | You’ve got one free afternoon. Which plan gets your vote? | Local food trail / scenic trail / pottery or cooking / explore the old town | Preferred activity |
| 5 | You find a lakeside café. Staying means missing the next stop. What do you prefer? | Stick to the plan / take a group vote / stay at the café | Structure |
| 6 | Dinner’s done and nobody has to be up early. Where would we find you? | Karaoke / cards / bonfire stories / quiet balcony | Evening preference and optional group vote |
| 7 | You hit it off with someone on day one. What about day two? | More time together / one plan together then mingle / mix groups | Host rotation preference |
| 8 | What are you hoping this trip makes room for? | New friendships / romantic spark / open to both / keep it private | Optional personal intent. Exclude from ranking, host view, analytics and public shares. |
| 9 | The bus is pulling out. You get the first song. What are we playing? | Song and artist / Pass the aux | Suggest a track. Ask separately before including it on the circle playlist. |

Filter first by eligibility and open departures. Score itinerary tags for Q3–Q6 and explain up to two reasons using real scheduled activities. Show alternatives, exact dates and pricing. A sold-out match may appear separately with a waitlist action. If there is no eligible departure, give the truthful reason and a way to browse future trips. Never publish a personal compatibility score or romantic prediction.

## Booking and money experience

1. Traveller sees total INR price, inclusions, deposit, balance, deadline rule and the applicable cancellation policy before reserving. Snapshot the quote and policy when the seat hold starts.
2. Captured deposit reserves one seat for human verification. Receipt and status are accessible if Checkout closes or email delivery is delayed. A failed attempt can retry within a valid hold.
3. Staff can request a follow-up, approve or reject. Approval starts the balance window once. Rejection releases the seat and starts a full refund of money collected. If the operator cancels, refund all captured instalments.
4. Only the approved traveller can pay the remaining amount, using a fresh Razorpay order for the balance. Confirm the trip once both captures, approval and inventory agree. Send confirmation and expose the private circle.
5. Traveller cancellation shows a dated refund quote with exact rupees before final confirmation. Balance timeout releases the seat. For pilot testing, use a full refund on voluntary cancellation and balance expiry. For launch, publish versioned operator terms covering both cases, cutoffs, fees, timelines and rounding. Respect the terms accepted at reservation.
6. Late or extra captures that cannot fulfil a valid booking are recorded and refunded in full for that charge. Show pending, processed or failed refunds separately from the booking state. If a bank debit is uncertain, guide the traveller to status/support before another payment attempt.

## Staff, privacy and success

Assign traveller, departure host, reviewer, finance and operator permissions. Hosts see only confirmed attendees on their assigned departures and shared welcome preferences. Finance sees amounts and provider references. Reviewers see only their review materials. Contact sharing after a trip requires a positive choice from both confirmed participants. Allow opt-out and reporting. Account deletion removes optional profile/quiz data while preserving financial records under the published retention policy.

Measure quiz start → result → departure viewed → deposit captured → approved → balance captured → attended. Track rebooking, referral bookings, no-shows, amount awaiting reconciliation and refund processing age. Derive revenue and conversions from server records. Keep song titles, romantic intent, contact data, ID details and raw answers out of analytics.

## Launch acceptance

- A guest can reach a real departure both from browsing and from a quiz result. Signing in preserves the selected departure and answers.
- Two guests racing for one seat yield at most one active reservation. Refresh, re-login, repeated clicks and webhook retries preserve money and inventory.
- A test-mode booking can progress through both real Razorpay instalments, staff approval, email and a final receipt. Rejection, balance expiry and a two-instalment cancellation each reconcile to the correct refunds.
- A host can run the arrival and an operator can resolve a failed payment or refund using the app. Travellers cannot view someone else's booking, answers, contact or receipt.
- Publish only when merchant/support details, actual trips, photos, reviewer staffing, room and conduct rules, price, cancellation terms and verification/retention text are approved. Internal fixtures remain visibly marked in staging.
