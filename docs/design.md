# Travel circle design system

Implementation contract for the singles travel club. Pair with [PRD](PRD.md) for routes and copy and [TRD](TRD.md) for the states the UI can display.

## Art direction

Make the site feel like a travel magazine someone brought home from a trip. Use warm paper, a confident headline and a photograph of people doing something together. A visitor should recognise how it feels to arrive solo. Show the host meeting guests, the seat at breakfast, or the walk to the hotel. Use genuine, licensed or consented photography. Label destination imagery as such if the club has yet to run a trip. Use the operator's actual name and logo when supplied.

The quiz result is the one place for music-poster styling. Use the destination as its title, an oversized typographic treatment and an optional track line. Keep the real departure, match reasons and booking action readable below the poster.

## Tokens

Define semantic CSS custom properties once in the existing Tailwind/global stylesheet. Map Tailwind utilities to them using the installed Tailwind version.

| Role | Value | Usage |
|---|---|---|
| paper / surface | `#F5F0E6` / `#FFFFFF` | Page and raised forms (Trippple-derived warm paper) |
| ink / secondary ink | `#2B120A` / `#5C463C` | Headlines, body, labels (espresso brown) |
| action / action hover | `#FF5E1A` / `#E64D0D` | Primary action with ink type (white fails 4.5:1 on this orange) |
| tint / rule | `#F0EAD6` / `#DBC1AC` | Selected card fill, decorative separators |
| control outline | `#8A6A56` | Visible boundaries on inputs and unselected choices |
| success / attention / error | `#27763D` / `#8B6914` / `#B3261E` | Pair with icon, heading and next action |
| focus | `#174C86` | 3 px visible ring, 2 px white offset |
| poster accent / lime | `#C8F520` | Result artwork and marquee highlights with ink type |
| band | `#2C2C2C` | Dark marquee and badge band with lime type |
| category colours | pink `#D96C88`, slate `#89ABB8`, forest `#2D8B46`, teal `#26A69A`, orange `#FF8C00`, mustard `#8B6914` | Optional tags for pace and activity type |

Use Bricolage Grotesque 600–700 for display and DM Sans 400–700 for UI, via the project's font loader with system fallbacks. Type sizes in rem: hero 2.75–5, page title 2.125–3.5, section title 1.625–2.25, body 1–1.125, metadata 0.875. Body line height 1.5, heading 1.08. Keep most prose under 65 characters per line. Use tabular numerals on balances and INR totals.

Spacing scale in px: 4, 8, 12, 16, 24, 32, 48, 64, 96. Outer gutters 16 mobile, 32 tablet, 48 desktop. Page max width 1480 px, reading column 760 px, form width 560 px. Content pages open with a photo header and use a two-column reading layout with a sticky aside. Radii follow trippple.travel: pills (999 px) for buttons and chips, 24 px for large cards, sections and editorial photos, 18 px for departure and story cards, 12 px for inputs, 8 px for small tiles. Prefer whitespace and rules to stacked card shadows.

## Composition

| Screen family | Mobile | Wide screen |
|---|---|---|
| Home | Headline, subhead, two actions, then candid 4:3 image. Show the next departure early. | Two columns, copy roughly 5/12 and photo 7/12. Below: departures, human screening, what arrival feels like, FAQs. |
| Trip list and detail | Single-column cards. Detail starts with date, price and host. Sticky bottom action respects safe-area and leaves content clearance. | List up to three cards per row. Detail has a reading column plus a sticky date/price panel. |
| Quiz | One question, visible progress, back and next, full-width tap choices. A user can revise an answer. | Centred reading column. Keep keyboard controls in the same order as on mobile. |
| Result | Poster, two grounded reasons when available, trip details, compare options. | Artwork alongside recommendation and date. Share action exports only the public poster after preview. |
| Checkout / booking | Single column. Show amount due now, balance, dates, policy and support before the pay action. | Booking summary beside review or payment form. Use the same hierarchy on both instalments. |
| Admin | Searchable list then detail. Support narrow screens via labelled rows. | Filterable queue and detail panel with explicit confirmation for refund/rejection. |

## Components and copy

- **Navigation.** Trips, How it works, Safety, My bookings. Primary home action **Find my travel circle**. Secondary **Browse trips**. Footer links to contact, terms, privacy and cancellations.
- **Hero.** “Who’s coming with you?” Follow with “Pick your pace, your kind of evening, and the first song on the bus. Find a group trip for singles that fits.” Use “9 questions” beside the quiz link.
- **Departure card.** Destination and real start date first, then duration, eligible ages, social pace, total per person and availability. A full departure opens the waitlist. Use real inventory and a date-specific price.
- **Question card.** Labelled fieldset, distinct selected border, check mark, explicit Next, progress “3 of 9”. Song accepts text or Pass the aux. Age offers a numeric keypad and an inline eligibility explanation.
- **Fit explanation.** Quote the guest's preference and pair it with a specific itinerary fact. With one supported reason show one. On no eligible match show the reason and a browse or waitlist action.
- **Checkout summary.** Example fixture: total ₹12,000, deposit due today ₹3,600, balance after approval ₹8,400. CTA **Pay ₹3,600 deposit**. At balance stage show the deposit already paid and the exact due time in IST. Generate amounts from the server quote.
- **Status panel.** Every state has a plain-language heading, amount, next action and support link. Use “Checking your payment” while capture is unresolved, “Deposit received · Verification next” after capture, and “Your seat is confirmed” only after full payment and approval. For refunds separate “Refund requested”, “Refund processed” and provider/bank credit timing.
- **Proof and safety.** Put the named host, what staff verify, room setup and how to get private help on the trip page. If a departure is a pilot, say so. Publish aggregate facts and stories only with appropriate permission.

## Interaction and QA

Use 120–180 ms transitions for selection and screen changes. Respect reduced motion. Give audio a user-operated play control only if licensed playback is implemented. Keep the optional song question usable through text alone.

Check at 360, 390, 768 and 1440 px, at 200% zoom, and with keyboard only. Target 44 px controls, visible focus, semantic headings, labelled errors and text contrast of at least 4.5:1 for body copy. Announce async payment status politely and return focus correctly after Checkout dismissal. Private pages must remain useful after reload or a lost callback. Test sold out, ineligible age, empty bookings, offline, script blocked, validation error, payment pending, expired, refund failed and support states. Fix overflow and check the longest rupee amount and departure name with real content.

## Visual references

Use the social-trip organisation of [Flash Pack](https://www.flashpack.com/), the personal reveal of [Pack Up + Go](https://www.packupgo.com/) and the legible trip summaries of [Intrepid](https://www.intrepidtravel.com/). Produce original assets, layout and copy.
