# Forum Redesign — Design Document

**Date:** 2026-02-27
**Status:** Approved
**Branch:** feat/ai-agent-system

## Summary

Upgrade the community forum from a modal-only experience embedded in the community board to a full-featured, dedicated forum with its own top-level route, rich text editing, search, notifications, and gamification — while keeping Payload CMS as the backend.

## Goals

1. **Dedicated forum page** at `/forum` with its own top-level nav item
2. **Reply to thread** functionality with flat replies
3. **Rich text editor** for threads and replies
4. **Search & sort** threads by text, category, newest, most replied, trending
5. **Author badges & roles** shown next to usernames
6. **Real-time reply notifications** integrated with existing inbox
7. **Gamification/XP** for forum participation
8. **Mobile-first** design for easy access on all devices

## Architecture Decision

**Keep Payload CMS** as the forum backend. Upgrade the existing `forum-threads` and `forum-replies` collections with new fields and hooks to achieve full forum functionality. The Payload backend already supports pagination, filtering, and rich text — we enhance rather than replace.

## Routing & Navigation

### New Routes

| Route | Purpose |
|---|---|
| `/[locale]/forum` | Main forum page — thread list with search, filter, sort |
| `/[locale]/forum/[slug]` | Thread detail page with replies and reply form |
| `/[locale]/forum/new` | Create new thread page |

### Navigation Changes

- Add `[F] FORUM` to the main header nav bar (between BLOG and COMMUNITY)
- Community board hotspot links to `/forum` instead of opening ThreadsModal
- ThreadsModal stays on community board as a quick-peek, with "See all" linking to `/forum`
- Mobile: `/forum` accessible from hamburger menu

### Redirect

- Existing `/community/[slug]` thread detail URLs redirect to `/forum/[slug]`

## Payload CMS Schema Upgrades

### `forum-threads` Collection — New Fields

| Field | Type | Description |
|---|---|---|
| `viewCount` | number | Tracks thread views for trending sort. Default: 0 |
| `type` | select | Thread type: `discussion` \| `question` \| `showcase` \| `job`. Replaces/aligns with existing `category` |

### `forum-replies` Collection — New Fields

| Field | Type | Description |
|---|---|---|
| `authorRole` | text | Author's role/badge at time of reply: `admin`, `moderator`, `contributor`, `member` |

### Payload Hooks

| Hook | Collection | Trigger | Action |
|---|---|---|---|
| `afterChange` | `forum-replies` | Reply created | Increment parent thread's `replyCount`, update `lastActivityAt` |
| `afterRead` | `forum-threads` | Thread detail view | Increment `viewCount` |
| `afterChange` | `forum-threads` | Thread created | Log activity for XP/gamification |
| `afterChange` | `forum-replies` | Reply created | Log activity for XP, send notification |

## Forum Page UI

### Thread List (`/forum`)

```
┌─────────────────────────────────────────────────┐
│  [Header Nav]  ... [F] FORUM ...                │
├─────────────────────────────────────────────────┤
│                                                 │
│  Forum                                          │
│  Ask, share, connect with the community         │
│                                                 │
│  [Search...........................] [+ New Thread]│
│                                                 │
│  ALL | GENERAL | QUESTION | SHOWCASE | JOBS     │
│  Sort: [Newest ▼]                               │
│                                                 │
│  ┌─────────────────────────────────────────┐    │
│  │ 📌 Welcome to the AIT Forum!    GENERAL │    │
│  │    12 replies · 2h ago · Admin           │    │
│  ├─────────────────────────────────────────┤    │
│  │ Let's Form a Community Board    GENERAL  │    │
│  │    0 replies · 30m ago · Uretzky Greg    │    │
│  ├─────────────────────────────────────────┤    │
│  │ How do I deploy to Vercel?     QUESTION  │    │
│  │    3 replies · 1d ago · sarah_dev        │    │
│  └─────────────────────────────────────────┘    │
│                                                 │
│  [Load more...]                                 │
└─────────────────────────────────────────────────┘
```

**Features:**
- Search bar filters threads by title/content
- Category tabs: ALL, GENERAL, QUESTION, SHOWCASE, JOBS
- Sort options: Newest, Most Replied, Trending (viewCount), Last Active
- Pinned threads always at top
- Cursor-based pagination via "Load more"
- Thread cards show: title, category badge, reply count, time ago, author + role badge
- `+ New Thread` button

### Thread Detail (`/forum/[slug]`)

```
┌─────────────────────────────────────────────────┐
│  ← Back to Forum                                │
│                                                 │
│  Let's Form a Community Board - Who's In?       │
│  GENERAL · 30m ago · Uretzky Greg (Zvi) 🟠Admin │
│                                                 │
│  [Rich text content of the thread...]           │
│                                                 │
│  ─────────────────────────────────────────────  │
│  Replies (3)                                    │
│                                                 │
│  ┌─────────────────────────────────────────┐    │
│  │ sarah_dev 🔵Contributor · 25m ago       │    │
│  │ Great idea! I'd love to help moderate.  │    │
│  ├─────────────────────────────────────────┤    │
│  │ mike_t 👤Member · 10m ago               │    │
│  │ Count me in!                            │    │
│  └─────────────────────────────────────────┘    │
│                                                 │
│  [Write a reply... (rich text editor)       ]   │
│  [                                          ]   │
│  [                           ] [Post Reply] │   │
└─────────────────────────────────────────────────┘
```

**Features:**
- Back navigation to forum list
- Thread header: title, category, timestamp, author + role badge
- Rich text content rendered
- Flat reply list with author badges and timestamps
- Reply form with rich text editor
- Thread actions: pin (admin), lock (admin), edit (author)

## Rich Text Editor

**Library:** Lightweight markdown editor (e.g., `@mdxeditor/editor` or similar)

**Capabilities:**
- Bold, italic, strikethrough
- Links
- Code blocks (inline and fenced)
- Bullet/numbered lists
- Image upload (via Payload media collection)
- Markdown shortcuts (`**bold**`, `` `code` ``)
- Preview mode toggle

**Used in:** Thread creation form and reply form.

## Notifications

**Integration with existing inbox:**
- Reply to your thread → inbox notification with link to `/forum/[slug]#reply-[id]`
- Reply in a thread you've participated in → optional notification
- Uses existing notification/conversation infrastructure

## Gamification / XP

**Aligned with challenge channel XP system:**

| Action | XP |
|---|---|
| Create a thread | Base XP |
| Post a reply | Base XP |
| Receive a reply on your thread | Bonus XP |

Uses existing activity logging system to track and award XP.

## Author Badges & Roles

**Display next to usernames in thread cards and reply list:**
- Admin → orange badge
- Moderator → blue badge
- Contributor → green badge
- Member → default/grey

Role is determined from user profile at time of posting and stored on the reply/thread record.

## Data Migration

Since we're staying in Payload and adding fields:
- **Schema upgrade** is additive — no data loss
- Backfill `type` from existing `category` values (1:1 mapping)
- Set `viewCount` to 0 for existing threads
- Set `authorRole` to `"member"` for existing replies (or look up from user profiles)

## Mobile Considerations

- Forum list: responsive card layout, single column on mobile
- Thread detail: full-screen view with sticky reply form at bottom
- Categories: horizontal scroll tabs on mobile
- Search: collapsible search bar (icon tap to expand)
- New thread: full-screen compose on mobile

## Out of Scope (Future)

- Thread reactions/likes
- Nested/threaded replies
- Thread bookmarks/saves
- Moderation queue/dashboard
- Email notifications (inbox only for now)
