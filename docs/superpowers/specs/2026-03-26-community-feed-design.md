# Community Feed — Batch 3

**Date:** 2026-03-26
**Status:** Draft

## Overview

Replace the static community overview page with a social feed. Members can post text + optional images, comment on posts, and like posts. The current overview widgets (recent threads, upcoming events, top ideas, members) move to a sidebar. XP is awarded for all new feed actions.

## Scope

### In scope
1. Feed posts (text + optional image) with CRUD
2. Post comments with CRUD
3. Post likes (toggle)
4. Community feed page replacing overview (two-column layout)
5. Feed post policy setting (all members vs admins only)
6. XP awards for feed actions
7. Soft-delete for posts and comments

### Out of scope
- Content reporting/flagging (future batch)
- Rich text / markdown in posts (plain text only for now)
- Link previews
- Post types/categories
- Notifications for new posts/comments/likes

---

## 1. Data Model

### FeedPosts (new Payload collection — `src/collections/FeedPosts.ts`)

| Field | Type | Notes |
|-------|------|-------|
| `content` | text | Required, max 2000 chars |
| `imageUrl` | text | Optional, uploaded via existing `/api/upload` S3 endpoint |
| `authorId` | text | Required, indexed, Better Auth user UUID |
| `authorName` | text | ReadOnly |
| `communityId` | text | Required, indexed |
| `likeCount` | number | Default 0, denormalized |
| `commentCount` | number | Default 0, denormalized |
| `isDeleted` | checkbox | Default false, soft delete |
| `isEdited` | checkbox | Default false |
| `editedAt` | date | Nullable |

Collection slug: `feed-posts`. Timestamps enabled.

### FeedComments (new Payload collection — `src/collections/FeedComments.ts`)

| Field | Type | Notes |
|-------|------|-------|
| `post` | relationship | To `feed-posts`, required |
| `content` | text | Required, max 1000 chars |
| `authorId` | text | Required, indexed |
| `authorName` | text | ReadOnly |
| `communityId` | text | Required, indexed |
| `isDeleted` | checkbox | Default false, soft delete |
| `isEdited` | checkbox | Default false |
| `editedAt` | date | Nullable |

Collection slug: `feed-comments`. Timestamps enabled. Hook: afterChange on create → increment parent post's `commentCount`.

### FeedLikes (new Payload collection — `src/collections/FeedLikes.ts`)

| Field | Type | Notes |
|-------|------|-------|
| `post` | relationship | To `feed-posts`, required |
| `userId` | text | Required, indexed |

Collection slug: `feed-likes`. Timestamps enabled. Compound uniqueness enforced in application code (userId + post).

---

## 2. Community Settings Addition

Add `feedPostPolicy` field to the Drizzle `communities` table:
- Type: `varchar(30)`, default `"all_members"`
- Values: `"all_members"` | `"admins_only"`

Add to the General settings form (`settings-form.tsx`):
- New `<Select>` dropdown after the join policy field
- Label: "Who can post to the feed"
- Options: "All members" / "Admins & moderators only"

Update `updateSettings` procedure input to accept `feedPostPolicy`.

---

## 3. Backend — Feed Router (`src/server/api/routers/feed.ts`)

New tRPC router with these procedures:

### `getFeed`
```
Input: { communitySlug: string, limit: number (default 20), cursor?: { createdAt: string, id: number } }
Auth: publicProcedure
Action:
  - Resolve community by slug
  - Query feed-posts where communityId matches and isDeleted != true
  - Sort by createdAt descending (newest first)
  - Keyset pagination using (createdAt, id)
  - If user is logged in, batch-fetch FeedLikes for the returned post IDs where userId matches (same pattern as idea votes in getIdeas)
  - Return posts with hasLiked boolean per post
```

### `createPost`
```
Input: { communitySlug: string, content: string (max 2000), imageUrl?: string }
Auth: protectedProcedure
Guards:
  - User must be an active member of the community
  - If feedPostPolicy is "admins_only", user must be admin/owner/moderator
Action:
  - Create feed-post in Payload
  - Award XP (FEED_POST_CREATE)
  - Log activity
```

### `editPost`
```
Input: { postId: number, content: string (max 2000) }
Auth: protectedProcedure
Guards: author only (no admin editing of others' posts)
Action: Update content, set isEdited: true, editedAt: now
```

### `deletePost`
```
Input: { postId: number }
Auth: protectedProcedure
Guards: author OR admin/owner/moderator in the community
Action: Soft-delete (isDeleted: true, content cleared, authorName cleared)
```

### `toggleLike`
```
Input: { postId: number }
Auth: protectedProcedure
Guards: user must be active member
Action:
  - Check if FeedLike exists for this user + post
  - If exists: delete it, decrement likeCount
  - If not: create it, increment likeCount, award XP to post author (FEED_RECEIVE_LIKE)
```

### `getComments`
```
Input: { postId: number, limit: number (default 50) }
Auth: publicProcedure
Action: Return comments for a post, sorted by createdAt ascending, excluding deleted
```

### `addComment`
```
Input: { postId: number, content: string (max 1000) }
Auth: protectedProcedure
Guards: user must be active member
Action:
  - Create feed-comment
  - Increment post's commentCount
  - Award XP (FEED_COMMENT_CREATE)
  - Log activity
```

### `editComment`
```
Input: { commentId: number, content: string (max 1000) }
Auth: protectedProcedure
Guards: author only
Action: Update content, set isEdited: true, editedAt: now
```

### `deleteComment`
```
Input: { commentId: number }
Auth: protectedProcedure
Guards: author OR admin/owner/moderator
Action: Soft-delete, decrement parent post's commentCount
```

---

## 4. XP Integration

Add to `XP_AMOUNTS` in `src/lib/gamification.ts`:

```typescript
FEED_POST_CREATE: 10,
FEED_COMMENT_CREATE: 5,
FEED_RECEIVE_LIKE: 2,
FEED_RECEIVE_COMMENT: 3,
```

XP awards happen in:
- `createPost` → award FEED_POST_CREATE to poster
- `addComment` → award FEED_COMMENT_CREATE to commenter, FEED_RECEIVE_COMMENT to post author (if different)
- `toggleLike` (like, not unlike) → award FEED_RECEIVE_LIKE to post author (if different)

---

## 5. UI — Feed Page

### Layout change

Replace the entire content of `src/app/[locale]/communities/[slug]/page.tsx` (current overview page) with a two-column layout:

```
┌─────────────────────────────────────────────────┐
│ [Feed Column - flex-1]  │ [Sidebar - w-80]      │
│                         │                        │
│ [Post Composer]         │ / ABOUT                │
│ ─────────────────       │ Community description   │
│ [Feed Post]             │                        │
│ [Feed Post]             │ / UPCOMING EVENTS (3)  │
│ [Feed Post]             │ Event list             │
│ ...load more            │                        │
│                         │ / RECENT THREADS (3)   │
│                         │ Thread list            │
│                         │                        │
│                         │ / TOP IDEAS (3)        │
│                         │ Idea list              │
└─────────────────────────────────────────────────┘
```

Mobile: sidebar collapses below the feed (stacked).

### Components

**`src/components/communities/feed/feed-page.tsx`** — main feed page component:
- Fetches feed posts with `getFeed` (infinite scroll or load more)
- Renders post composer + post list + sidebar
- Receives `communitySlug`, `memberRole`, `currentUserId`

**`src/components/communities/feed/post-composer.tsx`** — create post form:
- Textarea (max 2000 chars) + optional image upload button
- Image upload uses same pattern as community logo (fetch `/api/upload`)
- Shows image preview with remove button
- Post button, disabled if empty or mutation pending
- Hidden if user doesn't have post permission (based on feedPostPolicy)

**`src/components/communities/feed/feed-post-card.tsx`** — single post card:
- Author avatar, name, timestamp, "(edited)" label
- Post content (plain text, whitespace preserved)
- Image (if present, rendered as responsive img with rounded corners)
- Like button (heart icon) with count — filled if user has liked
- Comment count + toggle to expand/collapse comments
- Kebab menu: Edit (author), Delete (author or admin/mod)
- Inline edit mode: textarea + Save/Cancel (same pattern as forum)
- Deleted posts: "[This post has been deleted]"

**`src/components/communities/feed/feed-comments.tsx`** — comments section:
- Collapsible (hidden by default, shown when user clicks comment count)
- List of comments with author, timestamp, content
- Inline comment form at bottom
- Kebab menu on each comment: Edit (author), Delete (author or admin/mod)
- Inline edit mode for comments
- Deleted comments: "[This comment has been deleted]"

**`src/components/communities/feed/community-sidebar.tsx`** — right sidebar:
- Extracted from current overview page
- About section (community description)
- Upcoming events (3, with "View All" link)
- Recent threads (3, with "View All" link)
- Top ideas (3, with "View All" link)
- Reuses the existing `SectionHeader`, `Skeleton`, `EmptyState` patterns

---

## 6. Nav Update

In `src/components/communities/community-nav.tsx`, the "overview" tab label stays the same — the URL doesn't change (`/communities/[slug]`), only the page content changes from static overview to feed. No nav changes needed.

---

## 7. Payload Config Update

Add all 3 new collections to `src/payload.config.ts`:

```typescript
import { FeedPosts } from "./collections/FeedPosts";
import { FeedComments } from "./collections/FeedComments";
import { FeedLikes } from "./collections/FeedLikes";
```

Add to `collections` array.

---

## 8. tRPC Router Registration

Add feed router to `src/server/api/root.ts`:

```typescript
import { feedRouter } from "./routers/feed";
// In appRouter:
feed: feedRouter,
```

---

## New Files Summary

| File | Purpose |
|------|---------|
| `src/collections/FeedPosts.ts` | Feed posts Payload collection |
| `src/collections/FeedComments.ts` | Feed comments Payload collection |
| `src/collections/FeedLikes.ts` | Feed likes Payload collection |
| `src/server/api/routers/feed.ts` | Feed tRPC router (9 procedures) |
| `src/components/communities/feed/feed-page.tsx` | Main feed page component |
| `src/components/communities/feed/post-composer.tsx` | Post creation form |
| `src/components/communities/feed/feed-post-card.tsx` | Individual post card |
| `src/components/communities/feed/feed-comments.tsx` | Comments section per post |
| `src/components/communities/feed/community-sidebar.tsx` | Sidebar with overview widgets |

## Modified Files Summary

| File | Change |
|------|--------|
| `src/app/[locale]/communities/[slug]/page.tsx` | Replace overview with feed layout |
| `src/payload.config.ts` | Add 3 new collections |
| `src/server/api/root.ts` | Add feed router |
| `src/lib/gamification.ts` | Add feed XP constants |
| `src/server/db/schema.ts` | Add `feedPostPolicy` field to communities table |
| `src/server/api/routers/communities.ts` | Accept `feedPostPolicy` in `updateSettings` |
| `src/components/communities/manage/settings-form.tsx` | Add feed post policy dropdown |
| `messages/en.json` | Add feed translation keys |
| `messages/nl.json` | Add feed translation keys (Dutch) |

## Translation Keys Needed

```
communities.feed.title
communities.feed.compose
communities.feed.composePlaceholder
communities.feed.post
communities.feed.addImage
communities.feed.removeImage
communities.feed.postCreated
communities.feed.postEdited
communities.feed.postDeleted
communities.feed.postDeletedMessage
communities.feed.likes
communities.feed.comments
communities.feed.showComments
communities.feed.hideComments
communities.feed.commentPlaceholder
communities.feed.commentCreated
communities.feed.commentEdited
communities.feed.commentDeleted
communities.feed.commentDeletedMessage
communities.feed.noPostsYet
communities.feed.loadMore
communities.feed.edit
communities.feed.delete
communities.feed.save
communities.feed.cancel
communities.feed.deletePostConfirm
communities.feed.deleteCommentConfirm
communities.feed.edited
communities.manage.feedPostPolicy
communities.manage.feedPolicyAllMembers
communities.manage.feedPolicyAdminsOnly
```
