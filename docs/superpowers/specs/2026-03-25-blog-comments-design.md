# Blog Comments — Sprint 3

**Date:** 2026-03-25
**Scope:** Authenticated comment system on blog articles with one-level threading, self-delete, and XP rewards
**Approach:** Payload CMS collection for storage + tRPC for client interaction + React client component for UI

---

## 1. Data Model — Payload CMS Collection

### Collection: `Comments`

New Payload collection at `src/collections/Comments.ts`.

**Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `articleId` | number | yes | ID of the article being commented on |
| `parentId` | number | no | ID of parent comment (null = top-level, set = reply) |
| `content` | textarea | yes | Plain text comment body, max 5000 characters |
| `authorId` | text | yes | User ID from better-auth |
| `authorName` | text | no | Display name snapshot at comment time (set to `ctx.session.user.name`) |

**Configuration:**
- No versioning or drafts (comments are simple, no edit workflow)
- No localization (comments are user-generated in whatever language the user writes)
- Admin panel: `useAsTitle: "content"`, default columns: `content`, `articleId`, `authorName`, `createdAt`
- Payload auto-generates `id` (integer), `createdAt`, `updatedAt`
- Access: `read: () => true` (comments are publicly visible), create/update/delete restricted to admin panel (tRPC handles public-facing auth)

**Note on ID types:** Payload uses integer auto-increment IDs, unlike the launchpad comments which use UUID strings via Drizzle. All comment IDs in this feature are `number` type.

**Indexes (via Payload):**
- `articleId` — for fetching all comments on an article
- `authorId` — for fetching a user's comments (future use)
- `parentId` — for grouping replies under parent

**Why Payload CMS:** Comments live alongside Articles in the CMS. Admins can view and manage them from the Payload admin panel. Consistent with the existing content architecture.

### Payload Config Registration

Add `Comments` to the `collections` array in `src/payload.config.ts`.

---

## 2. tRPC Router

### Router: `commentsRouter`

New tRPC router at `src/server/api/routers/comments.ts`. Registered in `src/server/api/root.ts`.

### Procedures

**`list` (public procedure):**
- Input: `{ articleId: z.number() }`
- Queries Payload: `collection: "comments"`, `where: { articleId: { equals: input.articleId } }`, `sort: "createdAt"`, `limit: 100`
- Returns flat array of comments — the client component groups them into threads by `parentId`

**`create` (protected procedure):**
- Input: `{ articleId: z.number(), content: z.string().min(1).max(5000), parentId: z.number().optional() }`
- Calls `requireRulesAcceptance(ctx.session.user.id)` first (consistent with all community write actions)
- Validations:
  1. Article exists and is published (`status === "published"`) — the `beforeChange` hook ensures only approved member articles get `status: "published"`, so no separate `reviewStatus` check needed
  2. If `parentId` provided: parent comment exists, belongs to same `articleId`, and is a top-level comment (`parentId === null`). This enforces one-level threading — no replying to replies.
- Creates comment via `payload.create({ collection: "comments", data: { articleId, content, parentId: parentId ?? null, authorId: ctx.session.user.id, authorName: ctx.session.user.name ?? null } })`
- Awards +5 XP via `awardXp(ctx.db, ctx.session.user.id, XP_AMOUNTS.ARTICLE_COMMENT_CREATE)` — note: router needs both `ctx.db` (Drizzle) for XP/activity and `payload` (CMS) for comment CRUD
- Logs activity: `logActivity(ctx.db, { actorId: ctx.session.user.id, actorType: "member", action: "comment.created", targetType: "articles", targetId: String(input.articleId), metadata: { articleTitle: article.title } })` — reuse the `article` object fetched during validation
- Returns the created comment

**`delete` (protected procedure):**
- Input: `{ commentId: z.number() }`
- Fetches the comment by ID
- Authorization check: request user must be the comment author OR a Payload admin user
  - Admin check: query Payload `users` collection for the current user's email, check if found (Payload admin users are separate from better-auth users)
- If deleting a top-level comment (no `parentId`): also delete all replies (`where: { parentId: { equals: commentId } }`)
- Delete the comment itself via `payload.delete()`
- Returns `{ success: true }`

---

## 3. Client Component

### File: `src/components/blog/article-comments.tsx`

A `"use client"` component following the launchpad comments pattern (`src/components/launchpad/launchpad-comments.tsx`).

### Props

```ts
type ArticleCommentsProps = {
  articleId: number;
  initialComments: Comment[];
  currentUserId?: string;
};

type Comment = {
  id: number;
  content: string;
  parentId: number | null;
  createdAt: string;
  authorId: string;
  authorName: string | null;
};
```

### Sub-components (internal, not exported)

**`CommentForm`** — textarea + submit button
- Reused for top-level comments and inline replies
- Props: `articleId`, `parentId?`, `placeholder`, `onSuccess` callback
- Uses `api.comments.create.useMutation()`
- On success: clears textarea, calls `onSuccess`, shows toast
- On error: shows error toast

**`CommentItem`** — single comment with actions
- Renders: avatar (initials-only, no user images — blog comments use `authorName` snapshots without image lookup), author name, time ago, comment content
- Reply button: toggles inline `CommentForm` with `parentId` set
- Delete button: visible only to comment author, uses `window.confirm(t("comments.deleteConfirm"))` for confirmation, then `api.comments.delete.useMutation()`
- On `RULES_NOT_ACCEPTED` error from `create`: show specific toast message directing user to accept community rules
- Renders replies indented below (if top-level comment)

### Data Flow

- Server renders `ArticleComments` with `initialComments` from the page's Payload query
- Component uses `api.comments.list.useQuery({ articleId }, { initialData: initialComments })` for hydration + refetching
- After `create` or `delete` mutations: `utils.comments.list.invalidate({ articleId })` triggers refetch
- Thread grouping: client-side filter — top-level comments (`parentId === null`), then for each top-level comment, filter replies where `parentId === comment.id`

### Auth State

- Uses `authClient.useSession()` from `@/server/better-auth/client` to get current user (matching launchpad pattern)
- If no session: show "Sign in to comment" link instead of the comment form
- `currentUserId` prop from the server is used as initial state to avoid flash of wrong UI

### Styling

- Same mono/muted design language as the rest of the blog
- Comment content uses `text-sm leading-relaxed`
- Reply indentation: `ml-8` with a left border accent `border-l-2 border-border pl-4`
- Delete icon: `Trash2` from lucide-react (matching launchpad)
- Reply icon: `CornerDownRight` from lucide-react (matching launchpad)
- Toast notifications via `sonner` (already in project)

### Helpers (reused from launchpad pattern)

- `timeAgo(date)` — "just now", "5m ago", "2h ago", "3d ago"
- `getInitials(name)` — "AB" from "Alice Brown"

---

## 4. Integration with Article Detail Page

### Server-side Changes to `src/app/[locale]/blog/[slug]/page.tsx`

**Fetch comments:**
After the related articles query, fetch comments for the article:
```
const { docs: comments, totalDocs: commentCount } = await payload.find({
  collection: "comments",
  where: { articleId: { equals: article.id } },
  sort: "createdAt",
  limit: 100,
  depth: 0,
});
```

**Get session:**
Use better-auth server-side session: `import { getSession } from "@/server/better-auth/server"` then `const session = await getSession()`. This pattern is already used in `my-articles/page.tsx`, `write/page.tsx`, and `dashboard/page.tsx`.

**Comment count in meta line:**
Add comment count to the article's meta line (next to date, type badge, author):
```tsx
<span className="text-border">|</span>
<span>{t("comments.count", { count: commentCount })}</span>
```

**Render comments section:**
After the related articles section, render:
```tsx
<ArticleComments
  articleId={article.id}
  initialComments={comments}
  currentUserId={session?.user?.id}
/>
```

---

## 5. Gamification + Activity

### XP Award

- Add `ARTICLE_COMMENT_CREATE: 5` to `XP_AMOUNTS` in `src/lib/gamification.ts` (follows domain-prefixed naming convention: `LAUNCHPAD_COMMENT_CREATE`, `FORUM_THREAD_CREATE`, etc.)
- Called in the `create` mutation: `awardXp(ctx.db, ctx.session.user.id, XP_AMOUNTS.ARTICLE_COMMENT_CREATE)`
- No XP deduction on delete (XP is earned, not lost)

### Activity Logging

- On comment creation: `logActivity(ctx.db, { actorId: ctx.session.user.id, actorType: "member", action: "comment.created", targetType: "articles", targetId: String(input.articleId), metadata: { articleTitle: article.title } })`
- No activity log on delete

### Badges

- No new badges for commenting in this sprint. Can be added in a future sprint.

---

## i18n Keys

| Key | EN | NL |
|-----|----|----|
| `blog.comments.title` | "COMMENTS" | "REACTIES" |
| `blog.comments.signIn` | "Sign in to comment" | "Log in om te reageren" |
| `blog.comments.placeholder` | "Write a comment..." | "Schrijf een reactie..." |
| `blog.comments.replyPlaceholder` | "Write a reply..." | "Schrijf een antwoord..." |
| `blog.comments.submit` | "POST" | "PLAATSEN" |
| `blog.comments.reply` | "REPLY" | "REAGEREN" |
| `blog.comments.delete` | "Delete" | "Verwijderen" |
| `blog.comments.deleteConfirm` | "Are you sure?" | "Weet je het zeker?" |
| `blog.comments.cancel` | "CANCEL" | "ANNULEREN" |
| `blog.comments.count` | "{count, plural, one {# COMMENT} other {# COMMENTS}}" | "{count, plural, one {# REACTIE} other {# REACTIES}}" |
| `blog.comments.empty` | "No comments yet. Be the first!" | "Nog geen reacties. Wees de eerste!" |
| `blog.comments.toast.posted` | "Comment posted!" | "Reactie geplaatst!" |
| `blog.comments.toast.deleted` | "Comment deleted." | "Reactie verwijderd." |
| `blog.comments.toast.error` | "Something went wrong." | "Er ging iets mis." |
| `blog.comments.toast.rulesRequired` | "You must accept the community rules first." | "Je moet eerst de communityregels accepteren." |

---

## Files Changed Summary

| File | Action | Responsibility |
|------|--------|----------------|
| `src/collections/Comments.ts` | Create | Payload CMS collection definition |
| `src/payload.config.ts` | Modify | Register Comments collection |
| `src/server/api/routers/comments.ts` | Create | tRPC router: list, create, delete |
| `src/server/api/root.ts` | Modify | Register commentsRouter |
| `src/components/blog/article-comments.tsx` | Create | Client component: comment UI |
| `src/app/[locale]/blog/[slug]/page.tsx` | Modify | Fetch comments, render section, comment count |
| `src/lib/gamification.ts` | Modify | Add ARTICLE_COMMENT_CREATE XP constant |
| `messages/en.json` | Modify | Add 14 comment i18n keys |
| `messages/nl.json` | Modify | Add 14 comment i18n keys |

---

## Out of Scope

- Editing comments (post once, delete if needed)
- Rich text in comments (plain text only)
- Markdown rendering in comments
- Comment notifications (email, inbox, or in-app — no notification to article author when someone comments)
- Comment upvotes/reactions
- Comment badges for gamification
- Paginating comments (limit 100 per article is sufficient)
- Real-time updates (poll on mutation invalidation is sufficient)
