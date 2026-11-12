# Community payments: review and activation

Implementation date: 2026-11-07. Stripe is the recommended owner-controlled account; Adyen for Platforms is the alternative. AIT takes no application fee, commission, or payment-service subscription. Provider processing fees still apply.

## What is implemented

Owners connect their own financial account, select one provider, create/edit drafts, publish EUR offers, stop sales, require paid membership, review transactions/subscriptions, cancel renewal, request full refunds, inspect balances/payouts, and export CSV. Published terms are immutable; create a new offer for a new price. Event/course offers are selected in the central Payments offer editor. Selecting another provider does not move old agreements: copy an offer to the selected provider, then publish it. Switching is blocked while subscriptions remain on the old connection.

Both providers support one-off support, event tickets, courses, monthly/yearly memberships, and recurring voluntary support. Donations never grant community access. Community admission and moderation remain separate from paid access. Existing active members are previewed as complimentary before enabling paid entry; the enabling transaction records their exemption. Financial powers are owner-only; an ownership transfer does not transfer the previous owner's provider authority.

Stripe uses Connect OAuth for existing independent accounts with full Stripe Dashboard access and connected-account charges. Stripe Billing schedules recurring charges. Adyen uses hosted onboarding, seller balance accounts/stores, explicit manual capture, token lifecycle notifications, and AIT's durable renewal scheduler. Initial Adyen access waits for confirmed capture. There are no AIT commission splits.

## Visual review without a database

Run `node scripts/preview-community-payments.mjs`, then open <http://127.0.0.1:4179>. This standalone React fixture uses synthetic data only; it starts no application server, Payload, database, or provider client. A running instance may already be available. Restart the script to rebuild after source changes.

| Delivery           | Visible review path                                                                                                                                                                                            |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1: owner preview   | Open the preview; inspect zero AIT fee, readiness, offers, transactions, subscriptions and balances. Use the scenario selector for connected Stripe, empty and Adyen states.                                   |
| 2: Stripe setup    | Choose the empty state and connect/select Stripe. Sample actions update local state only; the real provider flow is at `/{locale}/communities/{slug}/settings/payments`.                                       |
| 3: support/refunds | Preview the support offer, enter an amount, submit and switch the sample outcome between pending/paid/failed/refunded. Back in Payments, inspect and confirm a full refund.                                    |
| 4: tickets         | Preview the event offer; real purchases continue through the existing event registration form so names, answers and bounded seat reservations are preserved. Attendee management already shows payment status. |
| 5: courses         | Preview the course price card. The application course view shows a purchase gate; confirmed purchases create existing course enrollments, and full refunds revoke purchase access.                             |
| 6: memberships     | Preview a monthly membership; inspect recurring consent, cancellation, paid-through and complimentary-member preview. Expired or past-due membership access is enforced on server reads as well as navigation. |
| 7: billing         | Filter transactions, inspect zero AIT fee/gross/refunds, cancel a subscription and export sample CSV. Real member controls are at `/{locale}/my-payments`.                                                     |
| 8: Adyen one-off   | Select the Adyen scenario and repeat the one-off purchase previews. Real hosted onboarding/readiness requires approved Adyen credentials and seller verification.                                              |
| 9: recurring       | Create a recurring support or membership draft and inspect cadence/consent. Real recurring recovery and grace/expiry notices use the same member billing screen.                                               |

The preview demonstrates interfaces and local interactions. It does not simulate a financial ledger, capacity race, provider onboarding or clock-driven billing. Targeted fake-backed tests cover those server rules separately. No claim of sandbox or live end-to-end verification is made.

Browser/native automation was unavailable in this session. Source review and DOM component tests were completed; rendered desktop/mobile screenshots and visual accessibility review remain outstanding.

## Activation prerequisites (operator work; not performed)

The additive migration source is `src/migrations/20261107a_community_payments.ts`, registered in `src/migrations/index.ts`. No migration, seed, database write, provider account creation, real charge, deployment or push was performed during implementation. The normal application build can run deployment migrations, so it was deliberately not used for verification.

1. Review and apply the additive migration in an approved environment through the repository's normal release process. The source-contract test checks table/column/index parity without connecting to Postgres; it does not replace an operator-run migration check.
2. Configure the public HTTPS application origin, provider test credentials, webhook endpoints, and `CRON_SECRET`. Optional payment variables are documented in `.env.example` and `src/env.js`.
3. Enable `COMMUNITY_PAYMENTS_ENABLED=true` only after migration and configuration. It is a prelaunch rollout switch. Keep it enabled after paid offers exist: disable individual offers or paid entry through owner settings to pause sales. Turning off the flag bypasses paid-read gates and halts payment maintenance, so it is not a postlaunch emergency pause.
4. Complete the provider sandbox journeys below, then repeat the bounded desktop/mobile review in the actual application. Keep live credentials disabled until those checks pass.

### Stripe

Configure `STRIPE_SECRET_KEY`, `STRIPE_CONNECT_CLIENT_ID`, and `STRIPE_WEBHOOK_SECRET` for the same environment. Register Connect OAuth redirect `{origin}/api/payments/stripe/connect`. The connected account owner retains their full Stripe Dashboard.

Create a **connected-account** webhook endpoint at `{origin}/api/payments/stripe/webhook`, configured for the adapter's pinned API version `2026-10-28.endive`, receiving:

- `account.updated`, `account.application.deauthorized`;
- `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`;
- `invoice.paid`, `invoice.payment_failed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`;
- `charge.refunded`, `refund.created`, `refund.updated`, `refund.failed`.

Check Dashboard permissions, connected-account direct-charge eligibility and Billing/portal availability. A scoped portal configuration is created lazily per connection to allow payment method updates, invoice history and period-end cancellation; it does not expose plan changes. Financial reporting and provider fees remain available in Stripe Dashboard. AIT displays gross/refunds and provider-reported balances/payouts separately; it does not invent fee/net amounts.

### Adyen

Adyen must approve the platform, supported seller countries/types, industry classification and voluntary-support use case. Set `ADYEN_ENVIRONMENT`, checkout `ADYEN_API_KEY`, platform `ADYEN_PLATFORM_API_KEY`, management `ADYEN_MANAGEMENT_API_KEY`, `ADYEN_MERCHANT_ACCOUNT`, `ADYEN_BALANCE_PLATFORM`, `ADYEN_INDUSTRY_CODE`, and the two HMAC keys. Live checkout also needs `ADYEN_LIVE_PREFIX`.

Set the merchant capture setting to **Manual**, then set `ADYEN_CAPTURE_MODE=manual`. The application also sends `manualCapture: true` for hosted payment links and explicitly submits captures after authorization. Automatic-capture configuration is incompatible with this adapter. Enable the chosen payment methods for payment links, tokenization, subsequent subscription payments, and manual capture.

Grant each credential only its required Checkout, Legal Entity Management, Balance Platform, Transfers, and Management/store roles. Seller readiness requires an enabled store plus both `receivePayments` and `receiveFromPlatformPayments`; payout readiness is checked independently. Hosted onboarding must collect and verify a seller address before store creation can complete.

Configure Standard notifications at `{origin}/api/payments/adyen/webhook` with `ADYEN_HMAC_KEY`: AUTHORISATION, CAPTURE, CAPTURE_FAILED, CANCELLATION, REFUND, REFUND_FAILED and REFUNDED_REVERSED. Enable separate CAPTURE notifications, including successful manual captures. Configure recurring token lifecycle webhooks at `{origin}/api/payments/adyen/tokens`, with raw-body HMAC in the `hmacsignature` header and `ADYEN_TOKEN_HMAC_KEY`: `recurring.token.created`, `recurring.token.alreadyExisting`, `recurring.token.updated`, `recurring.token.disabled`. Standard notification `additionalData` is not trusted to establish a token.

AIT gives owners balance/payout summaries and financial actions; it does not promise access to the platform Customer Area or automatically choose a bank payout schedule. Provider fees are allocated to the seller balance account under the approved platform agreement.

### Maintenance and unresolved provider outcomes

The Vercel cron calls `/api/cron/community-payments` every minute with `Authorization: Bearer {CRON_SECRET}`. The route permits 60 seconds; dispatch/retries have a bounded work budget and rotate failed items so one account cannot starve the rest. Confirm the hosting plan supports this frequency and inspect cron/webhook failures during the sandbox walkthrough.

Orders, billing attempts, refund requests, webhook inbox records, follow-up outbox records and provider commands retain stable identities. A browser checkout return cannot mark a payment paid. Failed renewal allows seven days of paid membership grace; cancellation has no extra grace. Current-period full refunds revoke paid access after confirmation and stop future billing. Historical refunds preserve later paid periods. Leaving, removal and bans stop membership renewals, while voluntary support remains separate.

Seats expire after 30 minutes. A pending recurring subscription retains its uniqueness guard until the original hosted checkout is confirmed closed or reconciled. A late canceled/expired initial payment is marked **refund required**, queues cancellation and grants no access. Owners resolve fulfillment failures in the transaction list by refunding the payment. These cases do not automatically promise a refund before provider confirmation.

For a timeout/unknown result, retry the same durable identity; do not issue a fresh provider request/key to force a result. Adyen attempts older than 23 hours with an unknown outcome are deliberately held for reconciliation rather than risking a duplicate charge. A checkout creation that timed out before its identity was stored may also retain a pending guard until provider reconciliation. Inspect the original order/attempt reference in the provider, redeliver/retrieve its authoritative event, and resolve or refund it before permitting replacement billing. A Stripe refund history over 100 records is similarly held for explicit reconciliation. This implementation does not include a privileged reconciliation console.

## Required sandbox acceptance

Use provider test accounts and an approved disposable application environment. Verify owner/cross-community authorization; readiness restrictions; all four offer kinds; recurring support consent; first payment and renewal; duplicate/delayed/out-of-order webhooks; checkout timeout; last-seat and waitlist handling; cancellation racing recovery; late success after expiry/removal; current/historical/partial/external refunds; seven-day grace and recovery; bans; complimentary access; provider switching/ownership transfer; receipts, CSV and payouts. Verify zero AIT fee in actual provider objects, not just the UI.

Implementation verification passed 90 unit tests across 18 added/touched files, targeted ESLint, and root typechecking. Full, integration, Chromium and database-backed tests were not run, following Greg's standing rules. Existing Mollie payments and registration history retain their original path. EUR is the first-release currency; published agreements are not migrated between providers or repriced automatically. AIT payment confirmations are receipts, not automatically tax invoices.
