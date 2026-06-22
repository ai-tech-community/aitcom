# Community Spaces — Plan 2b: Lobby + Membership Flows

**Date:** 2026-06-22
**Slice:** 3 of the Circle-gap roadmap (Community Spaces)
**Status:** Design approved — ready for implementation plan
**Predecessors:** Plan 1 (PR #189), Plan 2a (PR #190) — both merged to `main`
**Parent spec:** `docs/superpowers/specs/2026-06-21-spaces-design.md`

---

## 1. Summary

Plan 2a shipped rooms, per-room access, realtime room chat, room CRUD + join/request/approve
procedures, and a per-room **Members panel**. Plan 2b makes the membership loop *visible and
complete* and replaces the room read-state interim hack.

Four deliverables, all built on existing seams — **one new schema column, zero new infra**:

1. **Read-marker** — add `lastReadAt` to `spaceMemberships`, replacing the interim `unreadCount: 0`
   short-circuit with real per-user room unread counts. *(Highest-value deferred gap from 2a.)*
2. **Request-access notifications** — in-app notifications via the existing notifications system:
   request → room admins, approved → requester.
3. **Members panel deepening** — promote the existing per-room panel into a real approvals queue
   (pending requests on top, approve/deny) + an invite-by-search flow.
4. **Town Square lobby** — the community overview page gains a rooms directory: public room cards
   + private rooms as locked "Request access" teaser cards, above the existing commons/feed.

Decided up front (do not relitigate):
- **One plan/PR** for all four deliverables (not sliced into 2b/2c).
- **Admin UI = deepened per-room Members panel**, not a new community-admin route. A community-wide
  aggregate approvals page is a deferred fast-follow.
- **Notifications = in-app only**, reusing the existing notifications router/bell/panel.
- **Lobby cards = name / purpose / member count / action only.** Presence and resident-agent badge
  are Plan 3.

The lobby cards/teasers and the deepened Members panel UI go through the `impeccable` skill at
implementation time (PRODUCT.md / DESIGN.md lens — these are the room surfaces the design system
should shine on).

---

## 2. Current state (grounding)

Key facts confirmed against `main` (commit `e7c7632`):

**Notifications** — `app.notification` table (`src/server/db/schema.ts:461`): columns `userId`,
`type` (varchar string, e.g. `event_submitted`), `title`, `content`, `metadata` (json, holds
deep-link paths), `readAt`, `communityId`, `createdAt`. Created by plain `db.insert(notifications)`;
admin fan-out pattern lives in `src/server/api/routers/events.ts` (`admins.map(...)`).

**Membership** — `app.space_membership` (`schema.ts:3304`): `spaceId`, `userId`,
`role` (`moderator | member`), `status` (`active | pending_request`), `createdAt`, `updatedAt`.
Unique index on `(spaceId, userId)`; index on `(spaceId, status)`. **No `lastReadAt` column yet.**

**Procedures** (`src/server/api/routers/spaces.ts`):
- `requestAccess` — community member inserts a `pending_request` row for a private room.
- `approveMember` — owner/admin sets a row to `active`.
- `addMember` — owner/admin upserts a row to `active`.
- `joinRoom` — active community member inserts an `active` row for a public room.
- `listRoomMembers` — owner/admin lists pending + active members (pending first).
- `listRooms` — returns rooms the caller can see, each `{ id, name, purpose, slug, visibility,
  membership: "active" | "pending_request" | null }`. **Already includes private rooms with
  `membership: null`** (the nav renders these locked) — so the lobby's locked teasers reuse it.
  Auth to approve/add/list is `communityRole ∈ {owner, admin}`.

**Inbox** (`src/server/api/routers/inbox.ts`):
- `listConversations` merges space rows (lines ~153–199); room rows hard-code `lastReadAt: null`.
- The interim `unreadCount = 0` short-circuit is at `inbox.ts:298`
  (`if (isRoom) { unreadCount = 0; ...}`).
- `getMessages` has a `type === "space"` branch that calls `requireSpaceConversationAccess`; the
  existing `lastReadAt` update writes only to `conversationParticipants` (DM/agent path).

**Overview page** — `src/app/[locale]/communities/[slug]/page.tsx` →
`_overview-client.tsx` renders a non-member liveness preview + `<FeedPage>`. The Town Square rooms
directory is inserted **above** `FeedPage`. Builtin surfaces remain nav tabs
(`community-nav.tsx` consumes `api.spaces.list` for builtins and `api.spaces.listRooms` for rooms);
they are **not** duplicated as lobby cards.

---

## 3. Deliverable 1 — Read-marker

### Decision
Add a single nullable column `lastReadAt` to `spaceMemberships`. Rejected alternative: minting
`conversationParticipants` rows for every room member to reuse the existing unread machinery — that
adds write-amplification on join/leave and a per-room fan-out for no real gain, since the space
unread branch already exists.

### Changes
- **Schema:** `spaceMemberships.lastReadAt timestamptz NULL`.
- **Migration:** hand-written `src/migrations/<ts>_spaces_room_read_marker.ts` with idempotent
  `ALTER TABLE app.space_membership ADD COLUMN IF NOT EXISTS last_read_at timestamptz`, registered in
  `src/migrations/index.ts`, applied via `db:apply` (Payload migrations — **never** `db:push`).
  Then run `payload generate:types` and guard consumers.
- **`getMessages` (`type==='space'`):** after access check, fire-and-forget
  `update spaceMemberships set lastReadAt = now() where spaceId = conv.spaceId and userId = caller`
  (mirrors the existing `conversationParticipants` update; same `.catch` logging).
- **`listConversations` room rows:** select the caller's `spaceMemberships.lastReadAt` instead of
  the hard-coded `null`.
- **`inbox.ts:298` short-circuit:** replace `unreadCount = 0` with a real count of messages in the
  room conversation created after `lastReadAt` (`lastReadAt === null` ⇒ all messages unread, same
  semantics as DMs). Keep it consistent with how DM unread is computed in the same function.

### Tests
DB-gated integration coverage (the house pattern — `RUN_DB_TESTS=1` + local Postgres, via
`spaces.integration.test.ts`) of unread for the three cases: `lastReadAt` null (all unread),
before newest message (positive count), at/after newest message (zero). Rooms reuse the existing
DM unread branch, so this verifies the short-circuit removal rather than new logic.

---

## 4. Deliverable 2 — Request-access notifications (in-app only)

Two new `notification.type` string values, created with the existing `db.insert(notifications)`
pattern (no schema change — `type` is a free varchar):

| Type | Fired in | Recipients | Deep-link (`metadata`) |
|------|----------|------------|------------------------|
| `room_access_request` | `requestAccess` | community **owners/admins** (the approvers — matches `approveMember`'s gate; deduped, requester excluded) | room Members panel, pending section |
| `room_access_approved` | `approveMember` | the approved requester | the room |

Recipients are the community owners/admins because `approveMember`/`denyMember` are gated to
`communityRole ∈ {owner, admin}` — notifying only those who can act keeps the queue meaningful.
Granting room moderators their own approve/deny rights (and notifications) is a deferred enhancement
(see §8).

- Fan-out to admins follows the `events.ts` `admins.map(...)` insert pattern (query
  `communityMemberships` where `role ∈ ('owner','admin')` and `status='active'`).
- `title`/`content` are composed server-side as strings, consistent with current notification
  call-sites (`events.ts`, `agent-feed.ts`). `metadata` carries the community slug + room slug so
  the bell/panel can route the click.
- **Out:** denied and invited notifications (per decision).

### Tests
Integration: a `requestAccess` call creates one notification per room admin; an `approveMember`
call creates exactly one notification to the requester.

---

## 5. Deliverable 3 — Members panel deepening (per-room, no new route)

Evolve the existing `src/components/communities/rooms/room-members-panel.tsx`:

- **Pending Requests** section pinned to the top — rows with status `pending_request`, each with
  **Approve** (`approveMember`) and **Deny** buttons. Hidden/empty-stated when none.
- **Members** roster below (existing behavior).
- **Invite** — the existing user-search + `addMember`, reframed with invite affordance/labels.

New server work:
- **`denyMember`** procedure (`spaces.ts`) — owner/admin deletes a `pending_request` row for a
  given `(spaceId, userId)`. Same auth gate as `approveMember`. (No deny path exists today.)

Deep-links from the `room_access_request` notification land on this panel with the pending section
in view. The panel UI is refined via `impeccable`.

### Tests
Integration: `denyMember` removes the pending row and is rejected for non-admins; approve/deny are
owner/admin-gated.

---

## 6. Deliverable 4 — Town Square lobby

In `_overview-client.tsx`, insert a **Rooms directory** section above `<FeedPage>` (parent spec:
"directory of public spaces as cards … existing community commons/feed below it").

- **Public room cards:** name, purpose, member count, action — `Open` if the caller is an active
  member, else `Join` (`joinRoom`).
- **Private rooms as locked teaser cards:** name, purpose, member count, `Request access`
  (`requestAccess`); shows `Pending` when the caller already has a `pending_request`. Nothing
  private beyond name/purpose/count is exposed.
- **Directory shows `kind='room'` only.** Builtin surfaces stay as nav tabs (not duplicated as
  cards) — keeps the lobby about the new room concept.
- **Data:** extend `listRooms` to include `memberCount` (active members) via a subquery, mirroring
  the count already computed for room rows in `inbox.ts:listConversations`. While editing the
  query, opportunistically scope the caller-membership fetch to the listed room ids (addresses the
  2a "over-fetch" note).
- **Deferred to Plan 3:** live presence, resident-agent badge.

The cards and locked teasers are designed via `impeccable` against PRODUCT.md / DESIGN.md
(One Voice, Flat-By-Default, House Kicker, Mono-Is-Machine, No-Cream rules).

### Tests
Integration: public rooms render with Join/Open per membership; private rooms render as teasers
that leak nothing beyond name/purpose/count; `memberCount` is accurate.

---

## 7. Cross-cutting

- **Types:** `spaceMemberships` is a drizzle-defined app table (`src/server/db/schema.ts`), not a
  Payload collection, so adding `lastReadAt` to the schema definition makes the type flow
  automatically — **no `payload generate:types` step** (that house rule applies to Payload
  collection fields, which this is not).
- **i18n:** new keys under `communities.rooms.*` (lobby card actions: open/join/request/pending;
  approvals: approve/deny/pending; invite) in `messages/en.json` and `messages/nl.json`.
- **Realtime:** unchanged — room chat continues to use the inbox `messages` + SSE infra per
  ADR-0025. The read-marker only affects unread *counts*, not the realtime stream.

---

## 8. Out of scope (deferred)

- Community-wide aggregate approvals page (fast-follow once communities run many rooms).
- Room-moderator approve/deny rights + notifications (Plan 2b keeps approval gated to community
  owners/admins; room moderators managing their own queue is a later enhancement).
- Live presence indicators on lobby cards (Plan 3).
- Resident-agent badge on lobby cards (Plan 3).
- Email / push notification channels (in-app only for now).
- Denied / invited notifications.
- Non-member (public, logged-out or non-community-member) lobby teasers — the Town Square directory
  is scoped to community members in Plan 2b (`listRooms` is a `communityProcedure`); a public
  funnel needs a separately-authorized read path and is deferred.
- The rare same-second `listConversations` pagination tie between merged DM + room rows
  (pre-existing minor; not addressed here).

---

## 9. Files touched (anticipated)

| Area | Files |
|------|-------|
| Schema + migration | `src/server/db/schema.ts`, `src/migrations/<ts>_spaces_room_read_marker.ts`, `src/migrations/index.ts` |
| Server procedures | `src/server/api/routers/spaces.ts` (`denyMember`, `listRooms.memberCount`, notification inserts in `requestAccess`/`approveMember`) |
| Inbox / read-marker | `src/server/api/routers/inbox.ts` (`getMessages` space `lastReadAt`, `listConversations` row `lastReadAt` + unread) |
| Members panel UI | `src/components/communities/rooms/room-members-panel.tsx` |
| Lobby UI | `src/app/[locale]/communities/[slug]/_overview-client.tsx` (+ a new rooms-directory component) |
| i18n | `messages/en.json`, `messages/nl.json` |
| Types | regenerated Payload types |

---

## 10. Roadmap context

- **Plan 3 (later):** posts-in-rooms (`forum-threads.spaceId`) + resident agent per room; presence
  and agent badges land on the lobby cards then.
