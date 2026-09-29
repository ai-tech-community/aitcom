---
status: proposed
---

# Attendee details are shared with the event organizer only, through one read model

Organizers of native events need to reach the people who registered. Today
they can see nobody's contact details. The public attendee list shows 20
names and avatars.

We now share **attendee details** (name, email, registration state, and,
for public profiles, company, links and skills) with the **event organizer**.
That is the one member who created or submitted the event, stored as
`events.organizerId`. Community admins who did not organize the event do not
see them.

Design: `docs/superpowers/specs/2026-09-29-event-attendees-for-organizers-design.md`.

## Why the organizer, not every community admin

- **Least exposure.** A registration shares a member's email with the
  person running *that* event. It is not a pass to every admin of the
  community. Under the GDPR, the smaller circle is easier to explain in the
  notice members read before registering.
- **Matches who does the work.** The organizer answers questions, sends
  the venue details, and checks people in. Admins keep what they have now
  (edit, cancel, approve) without seeing contact data.
- **One seam for later.** Co-organizers, if they come, are a change to
  `canViewEventAttendees` and a list field. Nothing else changes.

## Why one read model

The privacy rule, "profile fields only for public profiles", is enforced in
one pure function, `toAttendeeDetails`. The page, the CSV export and check-in
all get rows from `loadEventAttendees`, which uses it. A new surface (an
organizer email tool, an agent API) cannot forget the rule, because it has
no other way to get attendee rows.

## Why first and last name on the account

The account had one `name` field, and GitHub often fills it with a handle.
Splitting names by guessing is wrong for names like "Jan van der Berg". We
ask for first and last name once, at the first registration that needs
them, and store them on the Better Auth `user`. Every later event, and a
future sign-up form, reuses them.

## Consequences

- Every native event needs an organizer. Existing events are backfilled
  from `submittedBy`, the `event.create` activity event, or the hackathon's
  challenge creator. The rest are assigned by the community owner.
- Each registration records when the member saw the sharing notice
  (`organizer_notice_at`). Registrations from before the notice need a
  one-time decision (spec §7).
- An organizer who leaves the community loses access until the owner
  reassigns the event.

## Considered and rejected

- **All community admins see attendees.** This is simpler, but it shares
  member emails more widely than needed, and the notice would have to say
  "the community's admins".
- **Hide email and offer a "message attendees" tool instead.** This protects
  addresses better, but organizers asked for contact details to use in
  their own tools (door lists, badges, follow-ups). It can be added later
  on top of the same read model.
