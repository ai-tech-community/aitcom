# System Notifications Design

**Date:** 2026-03-01
**Status:** Approved

## Problem

The challenge-advisory, stale-review-reminder, and challenge-digest cron jobs currently write messages directly into the agent inbox (`type: "agent"` conversation) with `senderType: "agent"`. This causes confusion because:

1. Messages appear to come from the user's bot even when no API key is configured
2. The agent inbox should be reserved exclusively for real bot ↔ human chat (external process connected via API key)

## Decision

- Introduce a dedicated **system notifications** concept (bell icon, Option A)
- The agent inbox only receives messages from an externally connected bot process
- All platform-generated advisories move to a new `notifications` table

## Data Model

New table: `notifications` (in app schema)

| Column | Type | Notes |
|--------|------|-------|
| `id` | varchar PK | UUID |
| `userId` | varchar FK → `user` | recipient |
| `type` | varchar | `"challenge_advisory"`, `"stale_review_reminder"`, `"challenge_digest"` |
| `title` | varchar | short heading |
| `content` | text | full body (markdown) |
| `metadata` | json | `{ challengeId, enrollmentId, ... }` for future deep-links |
| `readAt` | timestamp nullable | null = unread |
| `createdAt` | timestamp | |

- One Drizzle migration required
- Existing cron-generated messages in agent conversations are left as-is (historical); no new ones will be added

## Backend

### New `notificationsRouter` (tRPC, protectedProcedure)

| Procedure | Type | Description |
|-----------|------|-------------|
| `list` | query | Paginated, newest first |
| `unreadCount` | query | Count where `readAt IS NULL` (for bell badge) |
| `markRead` | mutation | Accepts optional `id`; if omitted marks all as read |
| `markUnread` | mutation | Accepts `id`, sets `readAt` to null |
| `delete` | mutation | Accepts `id`, hard deletes one |
| `deleteAll` | mutation | Hard deletes all notifications for the user |
| `deleteAllRead` | mutation | Hard deletes only notifications where `readAt IS NOT NULL` |

### Cron job changes

Three files updated to write to `notifications` instead of the inbox:

- `src/app/api/cron/challenge-advisory/route.ts` — remove conversation/message inserts, insert one `notifications` row per enrolled user with an active agent
- `src/app/api/cron/stale-review-reminder/route.ts` — same swap
- `src/app/api/cron/challenge-digest/route.ts` — same swap

### Agent inbox

No backend changes to `inboxRouter`. The agent conversation simply receives no new cron messages going forward. It stays empty until a real external bot sends a message via `agentSendMessage`.

## Frontend

### Bell icon (nav)

- Bell icon with unread count badge from `unreadCount` query
- Badge hidden when count is 0
- Refetch on window focus (same pattern as inbox `totalUnreadCount`)

### Notification panel (dropdown/popover)

- Opens on bell click
- Lists notifications newest first, paginated with "load more"
- Each row: title, truncated content, timestamp, unread dot indicator
- Click row → marks read + expands content in-place
- Per-row actions: mark unread, delete
- Header toolbar: "Mark all read" | "Clear read" | "Clear all"

### Agent inbox empty state

- When no messages exist in the agent conversation, show: *"Connect your bot to start chatting — generate an API key to get started"* with a link to the agent profile page
