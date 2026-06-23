# Next-session prompt — continue Community Spaces (Slice 3)

Paste the block below to resume. Both shipped slices are on `main`.

---

Continue the **Community Spaces** work (Slice 3 of the Circle-gap roadmap). Plan 1 and Plan 2a are merged; pick up at **Plan 2b**.

**Frame & decisions (don't relitigate):**
- Spaces = a community composed of **rooms** (a `space` with `kind='room'`), built **additive-now / wrap-later** (nullable `spaceId` seam). Spec: `docs/superpowers/specs/2026-06-21-spaces-design.md`.
- Strategic direction: **multi-tenant platform of many communities** (memory `platform-multitenant-direction`) — design features as self-serve primitives third-party admins compose.
- **Unified membership** model: every room has explicit members; public = one-click join, private = request→approve; chat read/post gates on active `spaceMemberships`.
- Rooms **DO** appear in the personal `/messages` inbox (Slack-style, member-gated) — this reversed Plan 2a's original "rooms stay out of /messages" choice.
- Realtime is SSE + Upstash per **ADR-0025** (never WebSockets/Ably); room chat reuses the inbox `messages`/SSE infra via a `type='space'` branch in `inbox.ts`. Memory `inbox-realtime-adr0025`.

**Shipped & on main:**
- **Plan 1 (PR #189):** `space` table, seed/backfill 5 builtin surfaces, DB-driven nav, admin Compose page.
- **Plan 2a (PR #190):** rooms + per-room access (`requireSpaceConversationAccess`), realtime room chat, room CRUD + join/request/approve, room route + header + **Members panel** (roster/add/approve), rooms in `/messages`, room-info Profile pane ("Open in community"). Plan: `docs/superpowers/plans/2026-06-22-community-spaces-plan-2a-rooms-chat.md`. Post-merge code review fixes in commit `d0b7ab4`.

**Key code (Plan 2a):** `src/server/communities/room-access.ts` (pure predicates) · `room-conversation.ts` (get-or-create) · `src/server/api/routers/spaces.ts` (room procedures) · `src/server/api/routers/inbox.ts` (`type='space'` branch in getMessages/sendMessage/listConversations) · `src/components/communities/rooms/{room-view,room-members-panel}.tsx` · schema: `spaces.visibility`, `conversations.spaceId`, `spaceMemberships`.

**Do next — Plan 2b (lobby + membership flows):**
1. **Lobby**: the community front page becomes a directory of public rooms (cards: name, purpose, member count, presence, resident-agent badge later) + **private rooms as locked teaser cards** ("Request access").
2. **Member-management admin UI**: surface `listRoomMembers`/`approveMember` (procedures exist) as a proper approvals queue + invite flow.
3. **Request-access notifications** to room admins (reuse the notifications system).

**Known gaps to address (deferred from 2a — see `.superpowers/sdd/progress.md` ledger):**
- **Per-user room read/unread tracking** — rooms currently report `unreadCount: 0` (interim, to avoid a permanently-inflated badge). Needs a real read marker (add `lastReadAt` to `spaceMemberships`, update it in `getMessages` for space convs). This is the highest-value gap.
- Rare same-second pagination tie between merged DM+room rows in `listConversations`.
- `listRooms` over-fetches the caller's memberships (harmless; scope to listed room ids).

**Later — Plan 3:** posts-in-rooms (Payload `forum-threads.spaceId`) + **resident agent** per room.

**Suggested skills:** `brainstorming` (only if shaping Plan 2b UX decisions — much is already specced) → `writing-plans` → `subagent-driven-development`; use `impeccable` for the lobby/teaser UI (the user actively wants the design lens on room surfaces).

**Start by** reading the spec + the `.superpowers/sdd/progress.md` ledger (full task/commit history + deferred-minor list), confirm `main` is current, then brainstorm/plan Plan 2b.

---
