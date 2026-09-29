# Event attendees for the organizer — design

**Date:** 2026-09-29
**Status:** proposed
**Decision record:** [ADR-0038](../../adr/0038-attendee-details-are-shared-with-the-event-organizer-only.md)
**Builds on:** #368 (registration invites, `externalEventUrl`)

## Goal

The person running an event can see who is coming and reach them: first
name, last name, email, where each person stands (registered, waitlisted,
paid, checked in), and the profile details that help them plan: company,
links, experience, skills. They can download the list and check people in
at the door.

Members know this before they register. The organizer sees full profile
details only for members whose profile is public.

**Scope:** native events only, the ones AIT Community runs. An external
event (`externalEventUrl(event) !== null`) is registered on its own site,
and that site holds the attendee list. Events outside a community are all
external today, so every event in scope has a `communityId`.

## Decisions (settled in brainstorming)

| Topic | Decision |
|---|---|
| Who sees the list | The **event organizer** only. That is one member per event, not every community admin |
| Who is the organizer | Whoever created the event. For a member-submitted event, the submitter. Stored on the event, backfilled for existing events |
| Names | First and last name are separate fields on the account. Asked **once**, at the first registration that needs them, pre-filled from the current name, and saved for every later event |
| Private profiles | Private (`isPublic = false`): the organizer sees name, email and registration details only. Public: also company, links, experience level, skills, interests |
| Transparency | The register button says, before registering, what the organizer will see. Each registration records when the member saw that notice |
| Export | CSV download of the same rows the page shows, with the same privacy rule |
| Check-in | The organizer marks a registered member as attended. It can be undone |

## Glossary additions

- **Event organizer**: the one member responsible for a native event. They
  created it, or submitted it for review. They are the only person who sees
  its attendee details. This is narrower than [[community-admin]], whom
  CONTEXT.md also calls "community organizer". A community admin who did not
  organize an event does not see its attendees.
- **Attendee details**: what the event organizer sees about one
  registration. Always: name, email, status, registration time, waitlist
  position, payment status, check-in time, community membership, past
  attendance. For a public profile, also: company, links, experience level,
  skills, interests.
- **Check-in**: the organizer confirming at the event that a registered
  member came. It sets the registration to `attended`.

These go into `CONTEXT.md` in this PR.

## Slices

Each slice gets its own implementation plan and PR, in this order:

1. **Event organizer**: the `organizerId` field, set on every create path,
   a backfill of existing events, and reassignment by the community owner.
2. **Names and notice**: `firstName`/`lastName` on the account, asked once
   at registration, and the sharing notice with its recorded timestamp.
3. **Attendees page**: the access policy, the attendee read model, and the
   organizer's page with filters.
4. **CSV export**: the same read model, streamed as CSV.
5. **Check-in**: attended / undo on the page. Past attendance counts then
   start to fill.

Slice 1 has nothing to show on its own, but everything after it depends on
it. Slices 3–5 are what organizers see.

---

## 1. Event organizer

### 1.1 Data

A new Payload field on `events`:

| Field | Type | Notes |
|---|---|---|
| `organizerId` | text, indexed, sidebar, read-only in admin | Better Auth user id of the event organizer. Null for external events |

The existing `submittedBy` field stays. It records who proposed the event
for review, which is a separate fact from who runs it. On submit, both are
set to the submitter.

### 1.2 Set on every create path

| Path | Organizer |
|---|---|
| `events.createEvent` (community admin) | the caller |
| `events.submitEvent` (member proposes) | the caller (also `submittedBy`) |
| `hackathon.createHackathon` | the caller |
| Discovery ingest, Luma sync | none (external) |

"Import from link" only fills the create/submit form, so it goes through
the rows above. An event created that way keeps its `sourceUrl` and is
external. It still gets an `organizerId`, but the access policy (§3.1)
refuses external events, so no attendee list is shown for it.
| Payload admin panel create | none: Payload admin users are a separate account system (`users` collection, numeric ids), not community members. The community owner picks an organizer on the events page |

A test that lists every `payload.create({ collection: "events" })` call
site keeps this table honest. It fails if a new create path appears
without a decision here.

### 1.3 Backfill (migration)

For each native event without an `organizerId`, in order:

1. `submittedBy`, if set.
2. The actor of the event's `event.create` activity event
   (`app.activity_event`: `action = 'event.create'`, `target_type = 'event'`, `target_id = <event id>`, organizer = `actor_id`).
3. For a hackathon, the `creatorId` of the bound challenge.
4. Otherwise it stays null. The event page shows the community owner a
   "Choose an organizer" prompt.

The migration is a hand-written `src/migrations/*.ts` (Payload migration,
applied with `db:apply` in the deploy window). It logs how many events each
step filled and how many stay null.

### 1.4 Reassignment

`events.setOrganizer({ eventId, userId })`: callable by the **community
owner**, or by the current organizer handing over. Rules live in
`src/server/events/event-organizer.ts`. Community owners and admins see
"Organizer: <name>" on each native event row
(`events.communityEventOrganizers`), and the owner or the organizer opens
the picker from it (`events.organizerCandidates`). The new organizer must
be an active member of the event's community. This covers an organizer who
leaves, and the backfill's null cases. Reassigning does not show the owner
the attendee list.

## 2. Names and the sharing notice

### 2.1 Data

On the Better Auth `user` table, declared as `user.additionalFields` so
the auth layer knows them (and sign-up can ask for them later without a
schema change):

```
user.first_name   varchar(100)  null
user.last_name    varchar(100)  null
```

On `event_registration`:

```
event_registration.organizer_notice_at   timestamptz  null
    -- when the member saw "the organizer will see …" and registered anyway
event_registration.checked_in_at         timestamptz  null   -- added in slice 5
```

The drizzle schema, the Payload migration, and the generated types change
together.

### 2.2 Asking once

- `events.register` input gains optional `firstName` and `lastName`
  (trimmed, 1–100 characters).
- If the account has no first or last name and the input does not provide
  them, `register` refuses with `PRECONDITION_FAILED` and the message
  `NAME_REQUIRED` (`src/server/events/registration-names.ts`).
- The register button checks this first. Before calling `register`, it
  opens a small dialog with two fields, pre-filled by splitting the current
  `name` on its first space. The member corrects them if needed.
- The server saves given names to the account just before writing the
  registration. If registering then fails, keeping the member's own name is
  harmless, and it avoids holding a transaction open across the payment
  provider call. It never asks again. The button refreshes the session after
  registering, so it does not ask twice in one visit.
- Members can change their names later in profile settings, in the same
  form as the display name.
- `markIntent` (external events) never asks. No organizer data is shared
  there.

### 2.3 The notice

Under the register button, for native events, in plain words:

> The organizer will see your name and email. If your profile is public,
> they also see your company, links and skills.

`register` sets `organizer_notice_at = now()` on the new registration. The
text lives in the `events.registration` message bundle (en, nl).

### 2.4 Registrations made before this ships

These have no `organizer_notice_at`. See §7: their email and profile are
not shown.

## 3. Attendees page

### 3.1 Access policy (one function)

`src/server/events/attendee-access.ts`

```ts
export function canViewEventAttendees(input: {
  event: { organizerId: string | null; communityId: string | null; sourceUrl: string | null };
  viewerId: string | null;
  membership: { status: string } | null; // viewer's membership in event.communityId
}): boolean;
```

This returns true only when all of these hold: the event is native, the
viewer is its organizer, and the viewer is still an **active** member of
the event's community. An organizer who left the community loses access
until the owner reassigns.

Every attendee entry point calls it: the list query, the CSV route and
check-in. A denied request gets `NOT_FOUND`, so the page never reveals that
the list exists. Co-organizers are a later change to this one function.

### 3.2 Read model (one function)

`src/server/events/attendee-details.ts`

```ts
export type AttendeeDetails = {
  registrationId: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string;          // fallback when names are missing
  email: string | null;          // null when registered before the notice (§7)
  status: "registered" | "waitlisted" | "pending_payment" | "attended" | "cancelled" | "payment_failed";
  registeredAt: Date;
  waitlistPosition: number | null;     // 1-based, waitlisted only
  paymentStatus: string | null;        // paid events only
  checkedInAt: Date | null;
  communityMemberSince: Date | null;   // null = not a member
  pastEventsAttended: number;          // this community, before this event
  profile: PublicProfileDetails | null; // null when the profile is private or missing
};

export type PublicProfileDetails = {
  company: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  websiteUrl: string | null;
  experienceLevel: string | null;
  skills: string[];
  interests: string[];
};

export function toAttendeeDetails(row: AttendeeSourceRow): AttendeeDetails;
export async function loadEventAttendees(db, event, filter): Promise<AttendeeDetails[]>;
```

- `toAttendeeDetails` is pure. It is the **only** place the privacy rule
  lives: `profile` is filled only when `member_profile.is_public` is true
  ([[profile-visibility]], the member's own choice).
  `hidden_from_public` is ignored here. It is a staff tool for the
  `/members` directory, not a member's privacy choice. The page, the CSV and
  any future surface get details from here and never query profiles
  themselves.
- `loadEventAttendees` runs one query per concern (registrations + user +
  profile; memberships; past attendance grouped by user). It never runs a
  query per attendee. `intent` rows are left out, because they belong to
  external events.
- The default filter shows everyone except `cancelled` and
  `payment_failed`, which have their own filter.

### 3.3 tRPC

`events.attendees({ eventId, status?: AttendeeStatusFilter })` →
`{ event: { title, date, maxAttendees }, counts: Record<status, number>, rows: AttendeeDetails[] }`.

### 3.4 Page

`/[locale]/communities/[slug]/events/[eventSlug]/attendees`

- Server component. It resolves the event and runs `canViewEventAttendees`,
  and calls `notFound()` on false.
- Header: event title, date, "12 registered · 3 waitlisted · 5 checked in"
  (Geist Mono stats, per DESIGN.md).
- Filter chips by status. There is a search box over name, email and
  company.
- A table on desktop and stacked cards on mobile. Each row shows the name,
  the email as a `mailto:` link, a status badge, and the registration time.
  The expandable profile area shows company, links, experience and skills.
  For a private profile it says "Profile is private".
- Entry points appear only for the organizer:
  - "Attendees" on the public event page, under the register button. The
    page stays the same for every viewer; `events.attendeesLink` returns the
    address for the organizer and null for everyone else. This covers
    hackathons too, so the hackathon manage area gets no separate tab.
  - The same link on the community events list, on rows the signed-in
    owner or admin organizes.

This needs the UI rules of `PRODUCT.md` and `DESIGN.md`: One Voice Rule
for the single primary action (Download CSV), flat surfaces, and the House
Kicker `/ ATTENDEES`.

## 4. CSV export

`GET /api/events/[eventId]/attendees.csv?status=…`

- It uses the same session, the same `canViewEventAttendees`, and the same
  `loadEventAttendees` → `AttendeeDetails`. Nothing is re-derived.
- Columns: first name, last name, email, status, registered at (ISO,
  event timezone), waitlist position, payment status, checked in at,
  community member since, past events attended, company, LinkedIn,
  GitHub, website, experience level, skills, interests. Profile columns
  are empty for private profiles.
- Values are RFC 4180 quoted. Cells starting with `= + - @` are prefixed
  with `'` so a spreadsheet does not run them as formulas (CSV injection).
- `Content-Disposition: attachment; filename="<event-slug>-attendees.csv"`
  and `Cache-Control: no-store`.

## 5. Check-in

`events.setCheckedIn({ registrationId, checkedIn: boolean })`, protected
by `canViewEventAttendees` for the registration's event.

- Checking in: `registered` → `attended`, and `checked_in_at = now()`.
- Undo: `attended` → `registered`, and `checked_in_at = null`.
- Any other status is refused. Waitlisted and cancelled members cannot be
  checked in.
- It is logged as an `event.check_in` activity event.

On the page, one button per row: "Check in", or "Checked in 18:04 · Undo".

## 6. Tests

- `canViewEventAttendees`: the full truth table (organizer, organizer who
  left, community admin who is not the organizer, other member, anonymous,
  external event).
- `toAttendeeDetails`: public profile, private profile, staff-hidden
  (still shown), missing profile, no notice recorded (no email, no profile), missing names (fallback), waitlist position.
- Router: `attendees` returns `NOT_FOUND` to non-organizers. `register`
  asks for names once, saves them, and records the notice time.
  `setOrganizer` rules. `setCheckedIn` transitions.
- CSV: quoting, formula prefixing, private profile columns empty, and the
  access check.
- Create-path inventory test (§1.2).
- DB integration (opt-in suite): backfill order on seeded events, and
  `loadEventAttendees` against real rows, including the one-query-per-concern
  check.

## 7. Registrations made before the notice

These have no `organizer_notice_at`: the member never saw "the organizer
will see your email". **Rule:** `toAttendeeDetails` shows such a
registration with name and status only. `email` is null and `profile` is
null, and the row is marked "registered before details were shared". The
CSV leaves those cells empty.

Production on 2026-09-29 (read-only check) had 6 active registrations:
four from the team's test accounts, and two for an event that no longer
exists. No real member is registered for an upcoming native event, so
this rule costs organizers nothing today. It also keeps the promise
"we only share what we told you about" for any row, now and later.
