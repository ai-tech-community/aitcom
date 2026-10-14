# Event platform redirect registration: capability findings

**Checked:** 2026-10-13
**Scope:** free events created here, published externally, with registration
exclusively on AIT Community. This is a read-only documentation/API schema
check; no provider events were created and no databases were accessed.

## Finding

There is no verified basis for enabling redirect-only publishing across
Luma, Eventbrite, and Meetup as a single common flow. Preserve the design's
capability gate. Creating an event through an API and replacing its native
registration experience are different capabilities.

| Platform | Evidence | v1 disposition |
|---|---|---|
| Eventbrite | General listing standards prohibit directing registration to third-party sites. External ticketing is documented for Eventbrite Music, which is not accepting new customers or upgrades. | Unavailable for general accounts; do not assume an account qualifies for the Music exception. |
| Luma | Current create-event schema exposes native registration settings but no external registration URL. Discovery guidance excludes events that require registration off-platform. | No verified redirect adapter; the proposed redirect flow sacrifices discovery eligibility. |
| Meetup | Official GraphQL guide documents event creation and publishing; API access requires Pro and approval. The reviewed material does not establish replacing RSVP with external registration. | Unavailable until a supported redirect flow and applicable rules are verified. |

## Eventbrite

[Event Listing and Publishing Standards](https://www.eventbrite.sg/help/en-gb/articles/742057/event-listing-and-publishing-standards/)
states that directing registration to third-party websites is prohibited.
The prohibition covers registration, not only payments, so making an event
free does not establish an exception.

The separate
[externally-ticketed Eventbrite Music guide](https://www.eventbrite.com/help/en-us/articles/712079/how-to-create-an-externally-ticketed-event-on-eventbrite-music/)
documents a specialized external ticketing feature. It must not be
generalized to ordinary Eventbrite accounts. The current
[Eventbrite Music resources](https://www.eventbrite.com/help/en-us/articles/344384/eventbrite-music/)
say new Music customers and additions to existing accounts are not accepted.

Direct page fetches returned errors/rate limits. The evidence above came
from search-indexed text of Eventbrite's official pages. Treat any claimed
exception as requiring verification for the actual account and API; do not
enable it based on an older third-party tutorial.

## Luma

[API setup](https://docs.luma.com/reference/getting-started-with-your-api)
requires Luma Plus and describes calendar-scoped API keys.

The unauthenticated public
[OpenAPI schema](https://public-api.luma.com/openapi.json)
was retrieved locally. `POST /v1/events/create` requires `name`, `start_at`,
and `timezone`. Relevant optional fields include `description_md`,
`registration_open`, `registration_questions`, `ticket_types`,
`max_capacity`, and `waitlist_status`. It exposes no external registration
URL in that operation. Closing registration and inserting a description
link does not demonstrate a supported replacement registration button.

[Featuring Your Event on Luma](https://help.luma.com/p/featuring-your-event-on-luma)
requires registration entirely on Luma for discovery eligibility, including
when the external requirement appears in descriptions or emails. This is
a documented discovery restriction; it is not evidence of a blanket ban
on all external links or event creation.

Repository note: `src/server/luma/client.ts` uses older singular API routes.
The current public schema documents plural routes such as
`/v1/users/get-self`, `/v1/calendars/events/list`, and `/v1/events/create`.
Verify compatibility before extending the client. Do not rely on the older
design's account-wide key assumptions; keys are calendar-scoped today.

## Meetup

[API access](https://help.meetup.com/hc/en-us/articles/41453576628749-How-can-I-get-access-to-Meetup-s-API)
requires an active Pro subscription and approval. The
[GraphQL guide](https://www.meetup.com/graphql/guide/)
documents `createEvent` with `CreateEventInput`, then `editEvent` with
`publishStatus: PUBLISHED`. Its example includes the group, title,
description, start time, venue, and duration.

That example does not demonstrate an external registration control. This
is an unresolved capability, not proof that Meetup prohibits redirects.
Before implementing an adapter, inspect the approved account's current
schema and official rules for RSVP and external registration. A description
link is not enough to claim that native RSVP has been replaced.

## Repository seams for source tracking

Source tracking remains useful independently of automatic publishing.
Use these boundaries in its separate implementation plan:

| Files | Responsibility |
|---|---|
| New `src/lib/events/registration-source.ts` and targeted test | Provider/source values, labels, shared source filters/counts |
| New `src/server/events/registration-attribution.ts` and targeted test | Token lookup, expiry, event validation, original-source preservation |
| New `src/app/api/events/ref/[token]/route.ts` and targeted test | Resolve tracked link, set secure event-scoped HttpOnly cookie, redirect to local event |
| `src/server/db/schema.ts`, additive Payload migration, `src/migrations/index.ts` | Track event/provider links and registration source/timestamp; author migration without applying it |
| `src/server/api/routers/events.ts` and its register unit tests | Derive attribution from server-resolved link/cookie; preserve it across registration attempts |
| `src/server/events/attendee-details.ts` and its unit tests | Return source through the existing privacy-aware attendee model |
| `src/server/events/attendee-csv.ts` and its unit tests | Include translated source labels in export |
| `src/components/events/organizer-attendee-list.tsx` and its unit tests | Source badges, filters, registration/check-in totals |
| `src/app/api/events/[slug]/attendees.csv/route.ts` and its unit test | Share source filters with organizer page |
| `messages/en.json`, `messages/nl.json` | Localized source labels and attribution explanation |

Important behavior discovered during planning:

- `eventRegistrations.userId` is required. External non-member attendees
  would require a different identity model if synchronization is chosen.
- The current register mutation ignores cancelled/payment-failed rows
  when detecting an existing registration and can insert a fresh row.
  Preserving the first source requires looking across registration history
  rather than assuming the same row is always reused.
- `sourceUrl` determines external-event routing. Outbound publication URLs
  must not overwrite it.
- Page and CSV already use the same organizer reader. Source filtering
  should be shared to preserve export consistency and access restrictions.
- `VIEW_STATUSES.active` includes pending payments for existing paid events.
  Free-event source totals must explicitly use registered/waitlisted/attended
  rather than reinterpreting that existing view globally.

## Confirmed product decision — 2026-10-14

The user chose to keep AIT Community as the only registration location and
enable publishing only for providers with verified redirect support. External
registrations and attendee synchronization remain outside v1.

None of the three candidates is currently verified for the full agreed flow.
Local source tracking can ship independently for manually shared links where
their use is permitted. Unsupported automatic publishing stays unavailable;
do not advertise all three integrations as working. If no provider qualifies,
disable the publishing action with an explanation while keeping local event
creation and registration usable.
