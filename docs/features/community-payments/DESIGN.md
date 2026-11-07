# Community Payments Design Supplement

## Overview

This supplement describes the community payments implementation. [The root DESIGN.md](../../../DESIGN.md) remains authoritative for the shared visual system, tokens, typography, accessibility and component rules; [PRODUCT.md](../../../PRODUCT.md) supplies the product commitments. This feature extends the existing AIT settings interface without introducing a separate visual identity or token set.

**Design thesis:** community owners control money through clear readiness, price, status and consequence. The interface leads from connecting a payment provider to creating and publishing an offer, then reviewing sales, refunds, subscriptions and payouts. Member purchase and billing surfaces continue the same language.

**Key characteristics:**

- Warm, concrete copy within the existing precise, neutral settings structure.
- Provider readiness before offer creation; visible prices and billing intervals before purchase.
- Compact, wrapping rows with full borders and restrained orange actions.
- Explicit payment, fulfillment and access states rather than an optimistic success assumption.

This document is based on source inspection. Browser/native rendering was unavailable during this review; desktop and mobile layouts, visual contrast, focus behavior and actual font rendering remain uncertified. The preview is an isolated fixture, not evidence of a production payment or provider connection.

## Colors

Use the semantic CSS variables in [`src/styles/globals.css`](../../../src/styles/globals.css) and the root design rules. The canvas is `background` with `foreground` text; `muted-foreground` carries supporting explanations, `border` defines rows and surfaces, and `muted` supplies quiet notices and form beds. Warmth comes from language and the existing Signal Orange primary action, not a cream background or a new payment palette.

Readiness and selection use `success` with explicit text or an icon. Action failures, refund-required notices and confirmed destructive actions use `destructive`. Keep other transaction and subscription states readable as labels; status must not depend on color. Payment email literals and synthetic preview content do not establish feature tokens.

## Typography

Inherit Geist Sans for human-facing headings, labels and descriptions. Owner and member page headings use the existing `text-2xl font-semibold` hierarchy; owner section headings use `text-lg font-semibold`, and purchase offer titles use `text-xl font-semibold`. Supporting copy is primarily `text-sm`, with `text-xs` reserved for secondary metadata and help.

Amounts in transaction and payout rows use Geist Mono and tabular numerals. The purchase price is larger Sans text with its interval immediately adjacent. Use locale-aware payment and date formatters; keep English, Dutch and French labels together in the existing `payments` translation namespace. These surfaces do not add decorative numbered steps or extra monospace eyebrows.

## Layout

The owner view is a single vertical sequence with `space-y-9`: page heading and refresh, the ruled zero AIT fee/provider-fee explanation, provider readiness, offers and paid entry, sales, complimentary-member information when present, and subscriptions. The settings wrapper adds finance information when a provider is selected. Preserve this information order so the opening view explains ownership, fees and provider readiness before the owner reaches offer management. The exact first-viewport fit still needs rendered verification.

Provider choices share one rounded, bordered group with divided rows. Offer, transaction, subscription and payout collections use flat divided rows rather than an elevated card for every record. Headers, metadata/action pairs and action groups use wrapping flex layouts with gaps. Email addresses in owner transaction and subscription rows can break across lines. Preserve space for longer Dutch strings and narrow screens instead of imposing fixed-width labels.

The inline offer form uses a single column, with offer type and interval becoming two columns at `sm`. It retains labels above fields, a compact amount field, and conditional resource selection. The public offer list is limited to `max-w-2xl`; member billing uses `max-w-3xl`. The preview's outer frame is fixture scaffolding and does not define a new production container rule.

## Elevation & Depth

The payment views add no custom shadows or motion system. Full hairline borders, divided rows and muted surfaces establish grouping. Shared controls retain their existing elevation and focus behavior. Loading icons in owner actions use the reduced-motion utility to stop spinning when motion is reduced.

## Shapes

Inherit the root radius scale. Provider groups, the offer form and empty-offer container use `rounded-xl`; quiet status notices use `rounded-lg`. Native selects use the existing bordered `rounded-md` form language. Use the shared Button, Input, Label and Textarea rather than creating payment-specific versions.

## Components

### Provider readiness

`PaymentsView` distinguishes provider availability, connection, charge readiness, payout readiness and active selection. Account label and test/live environment are supporting metadata. Keep these distinctions visible: a connected account can still require setup, and charge readiness does not imply payout readiness. Connect, continue-setup, provider selection and provider dashboard links use the existing outline Button treatment.

### Offer management

The new-offer action depends on an active provider. Creation and editing happen inline and save a draft; publication is a separate action. Offer rows retain type, provider, formatted amount, interval and draft/published state beside their available actions. Provider copying and publication restrictions must remain understandable through the surrounding provider and offer metadata.

The form exposes offer kind, billing interval, title, description and EUR price; event and course offers also select their resource. Paid entry is a labeled checkbox with explanatory copy, enabled for activation only when a published membership offer exists. An empty offers state explains the next action, including connecting a provider when needed.

### Sales, refunds and finance

Transaction rows retain the offer title, buyer, date, amount, payment state and any refund-required fulfillment notice. Refunds expand an inline confirmation before showing the destructive confirmation action. Gross/refunded totals include explanatory copy and remain distinct from provider balance and available balance. Finance uses labeled amounts and dated payout rows; an unreported available balance remains explicit rather than becoming zero.

### Subscriptions and billing

Owner subscriptions and member billing reuse `SubscriptionAccessNotice` to explain paid-through dates, cancellation access, grace and expiry. Keep that consequence beside the subscription status. Scheduled cancellation remains visible and disables repeated cancellation. Member billing offers the provider-specific billing or recovery action, with required recovery consent where implemented, and retains receipts and order states.

### Purchase and outcome

The offer heading, description, price and once/month/year interval precede checkout. Drafts have a visible preview notice and cannot be purchased. Admission, sign-in, existing membership, already-purchased course and event registration states route to their appropriate next action. One-time donations expose an editable amount; recurring checkout requires consent.

Checkout outcomes distinguish payment state from fulfillment. Pending processing, paid, refunded and refund-required conditions retain explanatory text and a refresh action. Do not infer fulfilled access merely from arrival at a return page.

### Errors and preview

Action failures use translated inline alerts. Query wrappers use the existing retryable ErrorState. Empty sales, subscriptions, payouts and unavailable offers have explicit copy. The isolated preview in [`scripts/preview-community-payments.mjs`](../../../scripts/preview-community-payments.mjs) bundles the same views and stylesheet without an application server, database or credentials. Its sample-data notice must remain visible. Fixture names, prices, dates, balances and record counts are not product facts or layout requirements.

## Do's and Don'ts

- **Do** inherit the root settings system and shared primitives.
- **Do** keep fee explanation, provider readiness, price, billing interval, status and access consequence visible at the relevant decision.
- **Do** preserve distinct draft/published, payment/fulfillment and cancellation/access states.
- **Do** verify desktop and narrow-screen rendering, keyboard operation and all supported locales before claiming visual completion.
- **Don't** introduce global tokens, a separate payment theme, ornamental metrics or a card grid for every record.
- **Don't** treat preview data, legacy payment-email colors or provider test state as design authority.
- **Don't** describe source inspection as rendered or end-to-end payment verification.
