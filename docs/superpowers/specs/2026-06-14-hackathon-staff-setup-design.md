# Hackathon Organizer & Judge Setup — Design

**Date:** 2026-06-14
**Status:** Approved (pending implementation plan)

## Problem

The hackathon event setup screen adds organizers and judges through raw
`user id` text inputs with "Add organizer" / "Add judge" buttons
(`src/components/hackathon/manage/manage-staff.tsx`). An operator has to know a
person's opaque user id, gets no confirmation of who they picked, and the
existing staff list renders the bare `userId` string. There is no way to bring
in someone who is not already an account/community member (e.g. an external
judge).

## Goals

- Pick existing people by **browsing a searchable list** (avatar + name + email),
  not by typing a user id.
- **Invite external people by email** — including people with no account yet.
- Display current staff and pending invites with **avatar + name + email** and a
  remove/cancel action.

## Non-goals

- Bulk import / CSV.
- Editing a person's role in place (remove + re-add covers it).
- A general-purpose user picker shared across the app (this is scoped to
  hackathon staff; components may be extracted later if reused).

## Current state (for grounding)

- Staff live in `app.hackathon_staff` (`src/server/db/schema.ts`), keyed by raw
  `userId`, soft-revoked via `revokedAt`.
- `grantStaff` / `revokeStaff` / `listStaff` in
  `src/server/api/routers/hackathon.ts`. `grantStaff` requires:
  - **organizer** grants → `requireHackathonOperator`; **judge** grants →
    `requireHackathonOrganizer`.
  - community-scoped challenge (`challenge.communityId` set) → the target must be
    an **active** `community_membership`; hub-wide (`communityId` null) → the
    target user must merely exist.
- A challenge is bound to an event (`src/server/hackathon/bound-event.ts`), so a
  hub-wide hackathon can reach attendees via `events.getAttendees(boundEventId)`.
- Community member listing with `displayName` / `image` exists
  (`communities.getMembers`).
- Email is sent via Resend (`src/server/email.ts`, `send(...)`).
- Accounts are created only on real signup (Better Auth); the
  `databaseHooks.user.create.after` hook already runs on new accounts
  (`src/server/better-auth/config.ts`). There is **no** pending-user concept.
- Community email invites exist as a model to mirror (`app.community_invite`,
  `communities.redeemInvite`) — but community-invite roles are community roles,
  not hackathon staff roles, so we use a dedicated table rather than reusing it.

## Design

### 1. Data model — new `hackathon_staff_invite` table

Applied via a hand-written Payload migration in `src/migrations/*.ts` + `db:apply`
(project convention — never `db:push`; `drizzle/` is vestigial).

| field | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `challengeId` | integer | FK → challenges |
| `email` | varchar | stored normalized (lowercased, trimmed) |
| `role` | `"organizer" \| "judge"` | |
| `code` | varchar, unique | carried in the email link |
| `invitedBy` | varchar FK → user.id | |
| `createdAt` | timestamp | default now |
| `expiresAt` | timestamp, nullable | default ~14 days out |
| `redeemedAt` | timestamp, nullable | set when wired in on signup |
| `redeemedUserId` | varchar FK → user.id, nullable | |
| `revokedAt` | timestamp, nullable | organizer cancelled a pending invite |

Unique partial index on `(challengeId, email, role)` where
`revokedAt IS NULL AND redeemedAt IS NULL` — blocks duplicate live invites.

`hackathon_staff` is unchanged.

### 2. Server (tRPC, `hackathon.ts`)

- **`listStaffCandidates({ challengeId, search?, cursor? })`** — the browse list.
  - community hackathon → community members (`displayName`, `email`, `image`),
    following the `getMembers` query shape.
  - hub-wide → attendees of the **bound event** via the `getAttendees` shape.
  - Excludes anyone already an active staff member for this challenge.
  - Keyset-paginated; optional case-insensitive `search` over name/email.
  - Auth: same gate as the corresponding grant (operator for managing
    organizers, organizer for judges).

- **`listStaff`** — extended to:
  - join `user` / `memberProfile` so each active organizer/judge row carries
    `displayName`, `email`, `image` (fixes the raw-userId display);
  - additionally return **pending invites** (`id`, `email`, `role`, `invitedBy`,
    `createdAt`).

- **`grantStaff`** — core unchanged; the UI calls it directly when an existing
  candidate is picked from the list.

- **`inviteStaffByEmail({ challengeId, email, role })`** — new. Auth-gated like
  `grantStaff`.
  1. Normalize email.
  2. **Existing-email shortcut:** if a `user` with that email exists → resolve to
     a `grantStaff` (for a community hackathon, first ensure an active
     `community_membership`). Return `{ kind: "granted" }`.
  3. Otherwise insert a `hackathon_staff_invite` row and send a Resend email
     (new `sendHackathonStaffInvite(to, role, challengeTitle, signupUrl)` in
     `src/server/email.ts`) linking to the **normal signup flow** carrying
     `code`. Return `{ kind: "invited" }`.

- **`revokeStaffInvite({ inviteId })`** — sets `revokedAt`, cancelling a pending
  invite. Auth-gated like the grant for that role.

- **Better Auth `user.create.after` hook** (`src/server/better-auth/config.ts`)
  — after a new account is created and its email known, look up unredeemed,
  unexpired, unrevoked invites for that email. For each:
  - community-scoped → create an active `community_membership` if missing;
  - insert the `hackathon_staff` grant (idempotent via the existing unique index);
  - mark the invite `redeemedAt` / `redeemedUserId`;
  - fire the existing `hackathon_staff_grant` notification.
  The grant happens silently on first login — invitees of a community usually
  already have accounts, so this path is the new-account minority.

### 3. UI — `manage-staff.tsx` (rewritten)

For each role section (Organizers, Judges):

- **Current staff list** — avatar + display name + email + **Remove** (replaces
  the bare `userId`).
- **Pending invites** — same row style, de-emphasized, "Invited · pending" with
  **Cancel**.
- **Add control** — a search box filtering a paginated candidate list; each row
  shows avatar / name / email + an **Add** button (calls `grantStaff`). Below it,
  an **Invite by email** affordance: when the typed term looks like an email with
  no candidate match, surface an "Invite `<email>` as organizer/judge" button
  that calls `inviteStaffByEmail`.

Built from the existing `Command` / `Popover` primitives and the avatar
component used in `members-settings`. All four mutations invalidate the
`listStaff` / `listStaffCandidates` queries.

### 4. Error handling

- Auth enforced server-side on every path
  (`requireHackathonOperator` for organizer management,
  `requireHackathonOrganizer` for judge management), including invite + redeem.
- Duplicate live invite → friendly "already invited" error.
- Expired / revoked / already-redeemed invite at signup → skipped silently; never
  fails the signup.
- Email-send failure → toast on the client; the invite row persists so it can be
  re-sent.

### 5. Testing

- **Server unit:**
  - `inviteStaffByEmail`: existing-email shortcut (incl. auto community
    membership) vs new-invite branch; duplicate-invite guard; auth-gate rejection
    for non-operators.
  - signup hook wiring: membership + grant + notification + redeem marking, for
    both community and hub-wide challenges; expired/revoked invites ignored.
  - `listStaff` / `listStaffCandidates` shape: joins populate name/email/image,
    existing staff excluded from candidates, pagination cursor behaviour.
  - `revokeStaffInvite` sets `revokedAt` and is auth-gated.
- **Component:** staff rows render avatar/name/email; email-detected invite button
  appears for an unmatched email term; Remove / Cancel / Add call the right
  mutations.

## Open follow-ups (out of scope here)

- Resending an expired invite from the UI (currently re-invite produces a fresh
  row once the old one expires).
- Surfacing invite acceptance status / timestamps in an audit view.
