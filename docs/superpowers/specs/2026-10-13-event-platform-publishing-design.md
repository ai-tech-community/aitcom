# Event platform publishing and registration source — v1 design

**Date:** 2026-10-13
**Status:** approved; redirect-only direction confirmed on 2026-10-14
**Related:** [Luma import design](2026-03-28-luma-integration-design.md),
[organizer attendee design](2026-09-29-event-attendees-for-organizers-design.md),
[ADR-0038](../../adr/0038-attendee-details-are-shared-with-the-event-organizer-only.md)

## Goal and agreed scope

Organizers create a free community event on AIT Community once and publish
listings only to platforms with verified support for redirecting registration
back here. Luma, Eventbrite, and Meetup are candidate destinations, not
guaranteed v1 integrations. The organizer sees which tracked platform link
brought each registration, with registration and check-in totals by source.

All v1 registration happens on AIT Community using its existing account,
capacity, waitlist, registration questions, sharing notice, and check-in
flow. There is no registration-mode selector in v1. Paid events and
external attendee imports are excluded.

On 2026-10-14, after reviewing the platform restrictions, the user chose to
keep registration on AIT Community and enable publishing only where redirects
are supported. Do not expand v1 to external registration synchronization.
Implement local source tracking independently of automatic publishing.

## Platform feasibility and account setup

The [capability findings checked on 2026-10-13](../../research/2026-10-13-event-platform-redirect-capabilities.md)
establish restrictions affecting the intended three-platform flow:
Eventbrite's general listing standards prohibit off-platform registration,
Luma excludes mandatory off-platform registration from discovery, and
Meetup's replacement of native RSVP is not yet verified. No provider is
currently verified for the full redirect-only flow. Under the confirmed
direction, keep unsupported providers unavailable. Platform account setup and
publishing controls become available only after the capability gate passes.
When no destinations qualify, explain that publishing is not yet available
for the candidate platforms and disable the publish action. Local event
creation and registration remain fully usable.

The three platforms are targets, not a claim that each supports the same
registration behavior. Before implementing each publishing adapter, verify
that its current API and terms permit creating the listing and directing
registration to AIT Community with the connected organizer's account.

An adapter is available only when this flow is supported. If a platform
requires native registration and cannot provide the agreed redirect flow,
show it as unavailable with an explanation; do not silently enable native
ticketing, import attendees, or treat a platform RSVP as an AIT Community
registration. A description link alone must not be presented as replacing
a platform's mandatory registration flow. Any alternative requires a
separate product decision.

Current documentation establishes that Luma API access requires Luma Plus,
with API keys scoped to a calendar. Meetup requires Pro and approval for
API access. Eventbrite account authorization and publishing capabilities
must be verified against its current API before implementation.

Sources checked on 2026-10-13:

- [Luma API setup](https://docs.luma.com/reference/getting-started-with-your-api)
- [Luma event creation](https://docs.luma.com/reference/post_v1-events-create)
- [Meetup API access](https://help.meetup.com/hc/en-us/articles/41453576628749-How-can-I-get-access-to-Meetup-s-API)
- [Meetup GraphQL guide](https://www.meetup.com/graphql/guide/)
- [Eventbrite API documentation](https://www.eventbrite.com/platform/new/api)

Connections belong to the community. Its owners/admins connect accounts
and select the destination calendar, organization, or group. Store
credentials encrypted on the server and never return secrets to the
browser. Reuse existing Luma integration patterns after checking them
against current API routes and calendar scoping.

## Organizer flow

1. Connect supported platforms in community integration settings.
2. Create and publish a free native event using the existing editor and
   approval rules. Pending submissions cannot publish externally.
3. Select connected destinations and click **Publish to platforms**.
4. The server publishes each destination independently, supplying event
   title, description, dates, timezone, location/online details, supported
   cover image, and its tracked AIT Community registration link.
5. Show a separate result for each platform: publishing, published, failed,
   or needs review, with the external listing link when known.
6. Retry failed destinations without recreating successful listings.

Only an active event organizer with existing event editing rights, or a
community owner/admin with those rights, may publish. Connecting a
platform does not give access to attendee details: that remains restricted
to the event organizer under ADR-0038.

External publishing is explicit. Saving edits does not automatically
change external listings in v1. After a published event is edited or
cancelled, mark its listings as needing review and provide their links
for the organizer to update/cancel externally. Explain this before the
initial publish. Automated updates and cancellations are a later slice.

## Boundaries and storage

Keep platform account connections, event publishing, and registration
attribution separate:

- **Connections:** credentials, destination identity, connection status,
  and permissions for a community.
- **Publishing:** one adapter per provider behind a shared interface for
  capability checks, payload validation, creation, and reconciliation.
  A coordinator authorizes requests and manages per-destination results.
- **Attribution:** resolves event-specific tracked links and records a
  source on successful local registration.

Add a publishing record per native event and provider, with a unique
event/provider constraint: connection reference, destination identity,
provider event ID and URL, attempt identity, status, published timestamp,
published revision, and sanitized error information. Changing the connected
account must not automatically create a second listing for the same event.

Outbound URLs live on publishing records, never on the native event's
`sourceUrl`. That field currently makes an event external and routes its
registration away from AIT Community. Published native events retain their
local registration behavior. Ensure existing Luma import paths do not
reimport an outbound listing as a second community event: match known
provider event IDs before importing or merging it into event lists.

## Source tracking

Generate an opaque, event-bound tracked link per destination. Resolve its
token on the server to a known event and provider; never trust an arbitrary
`source` parameter or HTTP referrer as authoritative attribution.

Preserve the source across sign-in and sign-up in an event-scoped session
or cookie with a seven-day lifetime. The most recent valid destination
link for that event wins before initial registration. A plain visit does
not clear a valid source. Missing, invalid, expired, or event-mismatched
tracking falls back to **Direct / unknown** and must not block registration.

Store `registrationSource` as `luma`, `eventbrite`, `meetup`, or
`direct_or_unknown` on the registration, together with the attribution
timestamp. Existing rows default to direct/unknown; do not invent a source
for historical attendees. The source is fixed at first registration and
survives cancellation/re-registration and repeat registration requests.

The source means **the tracked platform link used before registration**.
It does not prove where the person first discovered the event. Links can
be shared and tracking can be lost across devices. Use this wording in
organizer help text rather than claiming exact discovery attribution.

## Attendee view and counts

Extend the existing organizer attendee read model and CSV export with the
source label. Add a source filter and source totals to the attendee view.
Apply existing privacy and organizer access rules to every surface.

- Registration totals include registered, waitlisted, and attended rows;
  display cancellations separately and exclude them from those totals.
- Check-in totals count rows in the existing attended state with a check-in
  timestamp and update when check-in is undone.
- Each registration belongs to one source bucket, so source totals equal
  the matching overall totals. Filters and counts use the same status rules.
- No platform RSVPs, link clicks, or local external-event intent rows are
  included in these registration totals.

## Failure behavior

Validate destination-specific required fields and connection availability
before sending a publishing request. A failure on one platform does not
roll back successful platforms or the AIT Community event.

Persist the publishing attempt before calling the provider and prevent
concurrent duplicate attempts. Use provider idempotency where supported.
If creation times out after it may have succeeded, reconcile before
retrying. Where the API cannot establish whether creation succeeded,
show **Needs review** and require the organizer to check/link the existing
listing; never blindly repeat creation. Disconnecting an account removes
credentials but preserves publication history and attendee source data.

## Validation and implementation sequence

1. Verify each provider's redirect registration capabilities; document
   supported destinations and account requirements.
2. Implement tracked links and local source persistence across authentication,
   then extend the organizer list, filters, counts, and CSV.
3. Implement the publishing coordinator and the first verified adapter,
   including validation, retries, reconciliation, and import deduplication.
4. Add the other verified adapters using the same flow.

Target tests at source validation, authentication continuity, historical
defaults, source preservation on repeated registration, organizer access,
filtered totals, check-in undo, CSV consistency, publishing partial failure,
concurrency, uncertain creation outcomes, and outbound/import deduplication.
Mock provider requests and data access; run only added/touched test files
and the changed workspace's typecheck. Do not run integration/browser tiers,
apply migrations, push, or write to any database during local work.

## Excluded from v1

Paid tickets, payments/refunds, native external-platform registration,
external attendee synchronization, external check-in synchronization,
automated listing updates/cancellations, and click/conversion analytics.
