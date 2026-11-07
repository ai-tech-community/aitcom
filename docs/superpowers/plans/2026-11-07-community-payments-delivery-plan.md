# Community Payments Delivery Plan

**Goal:** Let community owners collect membership payments, sell tickets and courses, and accept voluntary support, with a visible result at every delivery.

**Architecture:** One community Payments area and shared offer, order, subscription, and access records. Stripe Connect is the recommended provider with full owner Dashboard access; Adyen for Platforms is the alternative. Provider-specific onboarding, checkout, refunds, and billing sit behind separate adapters. AIT takes no fee.

**Tech stack:** Existing Next.js, React, tRPC, Drizzle/Postgres, Payload, next-intl, and Vitest; Stripe Connect/Billing and Adyen for Platforms/Checkout.

**Status:** All nine delivery slices are implemented in source following Greg’s instruction to proceed and make routine decisions. The standalone visual fixture, fake-backed unit checks, migration source, provider adapters, and owner/member flows are included. Live activation is outstanding: the migration is unapplied, credentials/provider approval are unconfigured, sandbox walkthroughs have not run, and desktop/mobile screenshots could not be captured because browser/native automation was unavailable. No database writes, live charges, deployment or push were performed.

See [review walkthrough and activation guide](../../ops/community-payments.md) for the delivery-by-delivery preview and outstanding operator checks. Source checkboxes below record implementation, not production or provider certification.

## Agreed direction

- Support memberships, individual ticket/course purchases, and donations.
- Recommend Stripe; also support Adyen.
- Owners control their offers, prices, payments, subscriptions, and refunds without contacting AIT staff.
- AIT charges no transaction fee, commission, or payment-service subscription. Payment-provider fees still apply; do not imply that payment processing is free.
- Each delivery must end with a screen or working flow Greg can inspect. No delivery consists solely of backend plumbing.

## Implemented first-release decisions

- One active provider per community. Existing purchases, refunds, and subscriptions remain attached to their original provider connection.
- Payments settings and financial actions are owner-only initially. Existing admin and moderator powers do not automatically grant financial access.
- Owners create and price offers in AIT. Financial account details stay with the provider. Stripe owners also have full Stripe Dashboard access.
- Begin with EUR. Store currency on every offer, order, and payment; never sum different currencies into one total.
- Donations start as one-off voluntary support. They grant no membership or content access and are not presented as tax-deductible charity donations.
- Courses start as one-off purchases; memberships use monthly or yearly billing. Membership cancellation takes effect at the end of the paid period.
- Paid membership initially gates community membership. Premium rooms, bundles, coupons, installments, and automatic provider migration are separate extensions.
- Existing free communities remain free until an owner explicitly enables a paid offer. For a community that enables paid entry, existing active members retain access as visibly marked complimentary members; owners cannot silently charge them.
- Invite-only and approval-required admission still apply. Approval/invitation precedes paid checkout; payment never bypasses a ban or moderation decision.

## Delivery sequence and visible results

| Delivery                            | What Greg can see and try                                                                  | Completion demonstration                                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| 1. Payments preview                 | Owner Payments screen, Stripe/Adyen choices, four offer types, and member previews         | Create a sample offer and inspect purchase, pending, success, and failure screens using clearly labelled sample data |
| 2. Stripe setup                     | Stripe onboarding, account readiness, and Open Stripe Dashboard                            | Walk through not connected → setup incomplete → ready, plus a reconnect state                                        |
| 3. Donations                        | Support button, checkout, thank-you screen, owner transaction list, and refund detail      | A sample supporter pays; owner sees the payment and its refund state; access remains unchanged                       |
| 4. Paid event tickets               | Event price, checkout, pending registration, ticket confirmation, attendee payment status  | Purchase a ticket, inspect confirmation, and demonstrate a full-event/payment race without overselling               |
| 5. Paid courses                     | Price editor, course purchase page, locked lessons, and purchased library                  | A buyer unlocks a course; a non-buyer cannot open lessons or download materials                                      |
| 6. Paid memberships                 | Monthly/yearly plans, Join flow, membership status, and cancellation                       | A paid member enters the community; cancellation preserves access until the displayed expiry                         |
| 7. Owner and member billing         | Unified financial overview, subscription controls, payment recovery, receipts, and exports | Owner handles a refund/cancellation; member changes payment details and sees a consistent access result              |
| 8. Adyen setup and one-off payments | Adyen onboarding/readiness and the existing donation, ticket, and course screens           | Repeat the three one-off journeys with Adyen, showing owner totals, refunds, and payouts                             |
| 9. Adyen recurring billing          | The same membership and recovery screens for Adyen communities                             | Show renewal, failure, recovery, cancellation, and expiry with exactly one charge per billing period                 |

Stripe deliveries are usable independently. Adyen remains in the roadmap and is shown honestly as unavailable until configured; no live-looking Connect button that cannot complete onboarding.

## Delivery 1 — Clickable Payments preview

**Visible result:** `/communities/{slug}/settings/payments` with provider cards, a zero-AIT-fee explanation, offer list, and purchase previews. Follow existing settings styles and responsive navigation.

- [x] Build the owner screen and previews with synthetic data in an isolated fixture. Keep the fixture independent of database and Payload startup.
- [x] Show Stripe as recommended and Adyen as an alternative. Show setup-required and unavailable states separately.
- [x] Let the reviewer switch between membership, ticket/course, and donation examples and inspect member-facing price cards.
- [x] Include explicit sample-data labelling, pending payment, failed payment, empty list, and loading/error states.
- [ ] Review the same flow at desktop and mobile widths. Record screenshots with the delivery.

**Acceptance:** Greg can navigate the proposal and identify where owners set prices, where members buy, and where owners manage sales. This delivery collects no money and claims no completed integration.

## Delivery 2 — Stripe account setup

**Visible result:** A working setup/readiness screen with clear actions for incomplete onboarding and an owner-controlled Stripe Dashboard link.

- [x] Add owner authorization, connection records, provider configuration, and Stripe-hosted onboarding alongside the screen.
- [x] Use the current Connect account configuration with full Dashboard access. Keep charges on the community's connected account and omit AIT application fees.
- [x] Derive readiness from provider capabilities and outstanding requirements, not the onboarding return URL.
- [x] Show account identity, test/live environment, charges enabled, payouts enabled, and the next required action separately.
- [x] Reject cross-community setup/dashboard requests and show disconnected/restricted states without losing transaction history.

**Acceptance:** Owner can see whether the account can accept payments and receive payouts, and can reach their own provider controls. Review uses fake adapter responses; a provider sandbox walkthrough is a separate operator-run check when credentials are available.

## Delivery 3 — Donations, transaction detail, and refunds

**Visible result:** Owner sets suggested amounts; a visitor selects an amount and sees checkout and a thank-you/pending screen. Owner sees the matching payment and can initiate a full refund.

- [x] Introduce shared orders, payment attempts, webhook processing, and refund records with the donation flow; no separate infrastructure-only delivery.
- [x] Keep public support checkout available without joining; ticket, course, and membership purchases require an authenticated account.
- [x] Compute the amount and recipient server-side. Record immutable amount/currency/offer snapshots.
- [x] Verify provider events, process duplicates once, and show pending until payment is confirmed. A checkout return alone cannot mark an order paid.
- [x] Show gross amount, AIT fee of zero, provider fee when known, and refund state. Label unavailable fee/net values rather than estimating them.
- [x] Support owner-initiated full refunds and refunds initiated in Stripe; repeated requests must not create duplicate refunds.

**Acceptance:** Donation success, failure, refund requested, and refund confirmed are visible. A donation never changes access or membership. Refunds do not promise return of provider fees.

## Delivery 4 — Paid event tickets

**Visible result:** Owner selects an event and sets its ticket price in the central Payments offer editor. Member purchases a ticket and sees the resulting registration; owner sees payment status in attendee management.

- [x] Route new community-connected event purchases through the shared payment service. Retain existing Mollie registrations and their original refund/status path.
- [x] Preserve free registration, event visibility, admission, registration answers, waitlists, and calendar confirmation behavior.
- [x] Reserve a seat for a bounded checkout window; release it on expiry or cancellation. Reconcile late success against capacity and show refund required if a seat cannot be fulfilled.
- [x] Prevent registration as paid when the provider is missing, restricted, or unavailable.
- [x] Add pending, paid, failed, expired, refunded, and fulfillment-problem states to the relevant owner/member views.
- [x] A confirmed full ticket refund cancels that ticket and releases its seat once. Preserve attendance history for an already attended event.

**Acceptance:** Demonstrate successful purchase and the last-seat race using fake payments and an in-memory repository. No success email or XP is duplicated by webhook retries.

## Delivery 5 — Paid courses

**Visible result:** Owner sets a one-off course price; member sees an offer and can unlock the course. Purchased courses appear in their existing learning view.

- [x] Add purchase entitlements and extend the existing course read/access policy; a successful paid order grants access exactly once.
- [x] Keep public course descriptions available while protecting paid lesson bodies, materials, exams, and download URLs.
- [x] Enforce the entitlement in server reads, material delivery, and agent/MCP paths, not only in React. Preserve author and management visibility.
- [x] An ordinary community membership alone does not unlock a separately sold course. Paid access cannot override bans or unpublished content.
- [x] Show purchased, pending, refunded, and unavailable states. A confirmed full refund revokes purchased access while retaining learning history.
- [x] Clarify in the purchase screen whether community admission is required; do not sell to someone the existing admission policy would prevent from using the course.

**Acceptance:** Buyer can learn; non-buyer cannot read the same protected content through a direct URL or API. Show the refund/access result in both owner and member views.

## Delivery 6 — Paid community memberships

**Visible result:** Owner publishes monthly/yearly plans. Join shows the price and billing interval. Member sees active, cancellation scheduled, payment issue, or expired status with dates.

- [x] Add subscription records, paid-through dates, and paid-entry policy without merging financial state into moderation roles.
- [x] Use Stripe Billing for subscription collection. Confirm the initial paid period before granting access; preserve existing community activation side effects exactly once.
- [x] Display existing active members as complimentary before enabling paid entry. Offer changes affect new subscribers; existing subscriptions keep their agreed price unless explicitly changed through a separate informed flow.
- [x] Respect invitations, approvals, bans, and owner/admin management access. A webhook cannot reactivate a banned member.
- [x] Cancellation stops future renewals and retains access until paid-through. Failed renewal provides seven calendar days of visible grace after the paid-through date, then suspends paid access unless recovered.
- [x] Apply paid-entry checks across community pages, rooms/chat, APIs, attachments, and agent/MCP routes; expiry must not delete profiles or historical contributions.
- [x] Refund of the current membership period stops renewal and ends paid access after provider confirmation; show that consequence before the owner submits it.

**Acceptance:** Demonstrate joining, approval-before-checkout, renewal, failed renewal, grace, recovery, cancellation, and expiry with a controllable clock. Complimentary and banned members behave as labelled.

## Delivery 7 — Complete billing controls

**Visible result:** Owners have a unified Payments overview and members have My payments, with actionable subscriptions, receipts, and failures.

- [x] Combine donation, ticket, course, and membership orders in one filterable owner list with transaction detail and export.
- [x] Show collected gross, confirmed refunds, provider fees when available, and payouts as separate concepts; pending money is never counted as collected.
- [x] Provide owner cancellation/full-refund actions, member cancellation, and provider-hosted payment-method recovery. Keep bank credentials and card entry at the provider.
- [x] Synchronize external Stripe Dashboard changes into AIT access and statuses. Show a processing state and retry when updates have not arrived.
- [x] Present buyer confirmations with seller identity, amount, currency, interval where relevant, and a link to provider receipts when available. Do not label every receipt a tax invoice.
- [x] Before disconnecting/changing provider, display active subscriptions and historical obligations. Block self-service switching while active subscriptions remain; refunds and historical payment processing keep their original connection.
- [x] Ownership transfer pauses financial actions until the incoming owner has explicitly accepted and the existing financial-account authority is resolved. Never silently transfer the previous owner's provider account.

**Acceptance:** Owner and member can resolve normal billing tasks without AIT support. Duplicate, delayed, and out-of-order events do not corrupt displayed balances or access.

## Delivery 8 — Adyen onboarding and one-off purchases

**Visible result:** The alternative provider becomes usable in the same Payments screen. An Adyen community can receive donations and sell tickets/courses.

- [ ] Confirm platform enablement, supported seller types/countries, and the intended voluntary-support use case with Adyen before presenting live availability. Track this dependency from Delivery 1.
- [x] Implement Adyen-hosted onboarding and separate payment/payout capability states. Do not represent it as the same existing-account authorization flow as Stripe.
- [x] Add Adyen checkout, confirmed capture/refund handling, and owner transaction/payout views to the shared contracts.
- [x] Allocate the community's proceeds to its balance account without an AIT commission. Reconcile provider fees according to the platform agreement.
- [x] Reuse the existing order and entitlement rules for donations, tickets, and courses. Gate publication of recurring offers until Delivery 9.
- [x] Give owners equivalent operational controls inside AIT using Adyen components where suitable; do not promise every owner access to AIT's platform Customer Area.

**Acceptance:** Repeat each one-off demo from Deliveries 3–5 using the Adyen fake adapter, including refund and seller-readiness failures. Show the resulting owner dashboard and payout readiness.

## Delivery 9 — Adyen memberships and recurring support

**Visible result:** Monthly/yearly membership plans work for Adyen owners, with the same billing-status and recovery screens. Both providers can also offer recurring voluntary support.

- [x] Add Adyen consent/token capture and a durable billing scheduler that requests subsequent token payments. Do not assume Adyen is a drop-in subscription scheduler.
- [x] Give each subscription/billing-period combination a durable uniqueness key, provider idempotency key, and reconciliation path for timeout/unknown outcomes before requesting another charge.
- [x] Check cancellation and provider capability before dispatch. Serialize cancellation with charge dispatch and show an in-progress charge honestly when it cannot be recalled.
- [x] Apply the same paid-through, seven-day grace, recovery, refund, and expiry rules as Stripe. Keep membership access independent from the scheduling implementation.
- [x] Enable recurring support with explicit cadence/consent and cancellation controls on both providers; it never grants paid access.
- [x] Present recoverable payment failures and terminal account restrictions separately in both dashboards.

**Acceptance:** With a controllable clock, demonstrate two billing cycles, duplicate job execution, an unknown charge outcome, failed renewal/recovery, cancellation, and recurring support. The visible result and charge count agree.

## Code boundaries and existing touchpoints

These are the implemented boundaries; provider calls are isolated from access and fulfillment rules.

| Responsibility                       | Destination                                                                                                                                               |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner route and navigation           | New `src/app/[locale]/communities/[slug]/settings/payments/page.tsx`; existing `src/components/communities/settings/settings-sidebar.tsx`                 |
| Owner UI                             | New focused components under `src/components/communities/payments/` for setup, offers, transactions, and subscriptions                                    |
| Shared records and migrations        | Existing `src/server/db/schema.ts`; migration files under `src/migrations/` only when the slice needs them                                                |
| Payment contracts and pure rules     | `src/lib/payments.ts` and `src/server/payments/access.ts`                                                                                                 |
| Provider integration                 | New `src/server/payments/providers/stripe.ts` and `adyen.ts`; fake provider in test fixtures                                                              |
| Scoped persistence and orchestration | `src/server/payments/checkout.ts`, `payment-events.ts`, `management.ts`, `commands.ts`, and `outbox.ts`                                                   |
| Recurring Adyen collection           | New `src/server/payments/billing-scheduler.ts`; scheduled route introduced with Delivery 9                                                                |
| Community-scoped API                 | New `src/server/api/routers/community-payments.ts`; register in `src/server/api/root.ts`; use existing community middleware in `src/server/api/trpc.ts`   |
| Provider events                      | New `src/app/api/payments/stripe/webhook/route.ts` and `src/app/api/payments/adyen/webhook/route.ts`                                                      |
| Event fulfillment                    | Existing `src/server/api/routers/events.ts`, event editor components, and attendee views; preserve `src/app/api/mollie/webhook/route.ts` for old payments |
| Course fulfillment                   | Existing `src/server/classroom/course-access.ts`, `src/server/api/routers/classrooms.ts`, material delivery, and `src/components/classroom/`              |
| Membership fulfillment               | Existing `src/server/communities/activate-membership.ts`, join handlers in human/agent community routers, and community/room read gates                   |
| Text and localization                | Existing `messages/en.json`, `messages/nl.json`, and `messages/fr.json`                                                                                   |

All provider events, queries, refunds, and entitlements must carry the community and original connection scope. Financial state is confirmed by provider events/reconciliation, not browser input. Order records snapshot the agreed terms. Persist side effects so provider retries cannot duplicate access grants, emails, tickets, or charges.

## Definition of done for every delivery

- [x] One concrete owner/member demo path, including at least one failure state, is documented with a URL and short walkthrough.
- [ ] Desktop/mobile screenshots show the completed slice; sample data and test mode are clearly labelled.
- [x] Owner-only and cross-community boundaries are enforced on the server, with targeted unit tests using fakes.
- [x] Run only added/touched unit-test files with `pnpm exec vitest run <exact-file-paths>`; run `pnpm typecheck` when application code changes. Never run full lanes, integration/Chromium tiers, or database-backed tests.
- [ ] Inspect UI in an isolated fixture backed by synthetic data, without database access. No database writes, migration application, seeds, live charges, deployment, or push during agent implementation/review.
- [x] Include migration source where needed, but record unapplied migrations and operator-run sandbox/live checks as outstanding release work. A mocked demonstration alone does not establish production readiness.
- [x] Check the diff and changed locale keys; preserve unrelated work, including the pre-existing `src/payload-types.ts` modification.

## Sources checked on 2026-11-07

- [Stripe connected-account configuration](https://docs.stripe.com/connect/accounts-v2/connected-account-configuration): full Dashboard access and fee/responsibility configuration.
- [Stripe Dashboard controls](https://docs.stripe.com/connect/stripe-dashboard): financial reports, account settings, refunds, and disputes.
- [Stripe subscriptions with Connect](https://docs.stripe.com/connect/subscriptions): customer subscriptions for connected accounts.
- [Adyen onboarding and verification](https://docs.adyen.com/platforms/quickstart-guide/onboarding-and-kyc/): hosted onboarding and verification flow.
- [Adyen owner dashboard components](https://docs.adyen.com/platforms/build-user-dashboards): transactions, payouts, reports, disputes, and payment links.
- [Adyen token payments](https://docs.adyen.com/online-payments/tokenization/make-token-payments): merchant-initiated recurring token payments.

## Implementation verification

The added/touched unit tests use synthetic repositories and provider responses, including webhook replay/late events, paid waitlist handling, checkout expiry, cancellation races, billing fairness, access guards, pricing/consent UI, signature verification and migration source parity. Root typechecking and targeted lint run alongside these checks. The migration test reads source only and never executes SQL. The standalone preview uses the same owner/purchase/finance presentation components as the app.

Rendered review is explicitly incomplete: browser/native access failed, so no screenshots were fabricated and no Chromium fallback was used. The source-only UI reviewer’s original findings were resolved; this does not certify rendered responsiveness or visual accessibility. Provider sandbox and migration checks remain release work in the activation guide.
