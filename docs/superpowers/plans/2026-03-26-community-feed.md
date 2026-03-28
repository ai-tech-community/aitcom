# Community Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a social feed replacing the community overview page — posts with images, comments, likes, XP integration.

**Architecture:** Three new Payload collections (FeedPosts, FeedComments, FeedLikes), one new tRPC feed router with 9 procedures, community overview page replaced with two-column feed+sidebar layout. Feed post policy added to community settings.

**Tech Stack:** Next.js 15 App Router, tRPC, Payload CMS 3, shadcn/ui, next-intl, Tailwind CSS, S3 upload

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `src/collections/FeedPosts.ts` | Feed posts Payload collection |
| `src/collections/FeedComments.ts` | Feed comments Payload collection |
| `src/collections/FeedLikes.ts` | Feed likes Payload collection |
| `src/server/api/routers/feed.ts` | Feed tRPC router (9 procedures) |
| `src/components/communities/feed/community-sidebar.tsx` | Sidebar with overview widgets |
| `src/components/communities/feed/post-composer.tsx` | Post creation form |
| `src/components/communities/feed/feed-post-card.tsx` | Individual post card |
| `src/components/communities/feed/feed-comments.tsx` | Comments section per post |
| `src/components/communities/feed/feed-page.tsx` | Main two-column feed page component |

### Modified files
| File | Change |
|------|--------|
| `messages/en.json` | Add `communities.feed.*` and `communities.manage.feedPostPolicy/feedPolicyAllMembers/feedPolicyAdminsOnly` keys |
| `messages/nl.json` | Add same keys in Dutch |
| `src/lib/gamification.ts` | Add 4 feed XP constants to `XP_AMOUNTS` |
| `src/collections/FeedPosts.ts` | (new) |
| `src/collections/FeedComments.ts` | (new) |
| `src/collections/FeedLikes.ts` | (new) |
| `src/payload.config.ts` | Import and register 3 new collections |
| `src/server/db/schema.ts` | Add `feedPostPolicy` varchar column to communities table |
| `src/server/api/routers/communities.ts` | Accept `feedPostPolicy` in `updateSettings` input + mutation |
| `src/components/communities/manage/settings-form.tsx` | Add feed post policy Select dropdown + state |
| `src/server/api/root.ts` | Import and register `feedRouter` |
| `src/app/[locale]/communities/[slug]/page.tsx` | Replace overview content with `<FeedPage />` |

---

## Task 1: Translation keys

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/nl.json`

- [ ] **Step 1: Add English feed translation keys**

Locate the `"communities"` object in `messages/en.json`. After the closing `}` of the `"manage"` sub-object (before the `"settings"` sub-object), add a new `"feed"` sub-object. Also add three keys inside `"manage"`.

Add inside `"communities"."manage"` (after `"accessDenied"` key, before the closing `}`):

```json
"feedPostPolicy": "Who can post to the feed",
"feedPolicyAllMembers": "All members",
"feedPolicyAdminsOnly": "Admins & moderators only"
```

Add a new `"feed"` sub-object inside `"communities"` (after `"manage"`, before `"settings"`):

```json
"feed": {
  "title": "Feed",
  "compose": "Write something...",
  "composePlaceholder": "What's on your mind?",
  "post": "Post",
  "addImage": "Add image",
  "removeImage": "Remove image",
  "postCreated": "Post published",
  "postEdited": "Post updated",
  "postDeleted": "Post deleted",
  "postDeletedMessage": "[This post has been deleted]",
  "likes": "{count} likes",
  "comments": "{count} comments",
  "showComments": "Show comments",
  "hideComments": "Hide comments",
  "commentPlaceholder": "Write a comment...",
  "commentCreated": "Comment added",
  "commentEdited": "Comment updated",
  "commentDeleted": "Comment deleted",
  "commentDeletedMessage": "[This comment has been deleted]",
  "noPostsYet": "NO POSTS YET. BE THE FIRST TO POST.",
  "loadMore": "LOAD MORE",
  "edit": "Edit",
  "delete": "Delete",
  "save": "Save",
  "cancel": "Cancel",
  "deletePostConfirm": "Delete this post? The content will be permanently removed.",
  "deleteCommentConfirm": "Delete this comment? The content will be permanently removed.",
  "edited": "edited"
}
```

- [ ] **Step 2: Add Dutch feed translation keys**

Locate the `"communities"` object in `messages/nl.json`. Apply the same structural changes with Dutch translations.

Add inside `"communities"."manage"` (after `"accessDenied"` key):

```json
"feedPostPolicy": "Wie mag berichten plaatsen in de feed",
"feedPolicyAllMembers": "Alle leden",
"feedPolicyAdminsOnly": "Alleen beheerders & moderators"
```

Add a new `"feed"` sub-object inside `"communities"` (after `"manage"`, before `"settings"`):

```json
"feed": {
  "title": "Feed",
  "compose": "Schrijf iets...",
  "composePlaceholder": "Wat wil je delen?",
  "post": "Plaatsen",
  "addImage": "Afbeelding toevoegen",
  "removeImage": "Afbeelding verwijderen",
  "postCreated": "Bericht geplaatst",
  "postEdited": "Bericht bijgewerkt",
  "postDeleted": "Bericht verwijderd",
  "postDeletedMessage": "[Dit bericht is verwijderd]",
  "likes": "{count} likes",
  "comments": "{count} reacties",
  "showComments": "Reacties tonen",
  "hideComments": "Reacties verbergen",
  "commentPlaceholder": "Schrijf een reactie...",
  "commentCreated": "Reactie toegevoegd",
  "commentEdited": "Reactie bijgewerkt",
  "commentDeleted": "Reactie verwijderd",
  "commentDeletedMessage": "[Deze reactie is verwijderd]",
  "noPostsYet": "NOG GEEN BERICHTEN. WEES DE EERSTE.",
  "loadMore": "MEER LADEN",
  "edit": "Bewerken",
  "delete": "Verwijderen",
  "save": "Opslaan",
  "cancel": "Annuleren",
  "deletePostConfirm": "Dit bericht verwijderen? De inhoud wordt permanent verwijderd.",
  "deleteCommentConfirm": "Deze reactie verwijderen? De inhoud wordt permanent verwijderd.",
  "edited": "bewerkt"
}
```

- [ ] **Step 3: Verify with tsc**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add messages/en.json messages/nl.json
git commit -m "feat(feed): add community feed translation keys"
```

---

## Task 2: Payload collections

**Files:**
- Create: `src/collections/FeedPosts.ts`
- Create: `src/collections/FeedComments.ts`
- Create: `src/collections/FeedLikes.ts`
- Modify: `src/payload.config.ts`

- [ ] **Step 1: Create FeedPosts collection**

Create `src/collections/FeedPosts.ts`:

```typescript
import type { CollectionConfig } from "payload";

export const FeedPosts: CollectionConfig = {
  slug: "feed-posts",
  admin: {
    useAsTitle: "id",
    defaultColumns: ["authorName", "communityId", "likeCount", "commentCount", "createdAt"],
    description: "Community feed posts. Soft-delete clears content and authorName.",
  },
  fields: [
    {
      name: "content",
      type: "text",
      required: true,
      admin: { description: "Plain text, max 2000 characters." },
    },
    {
      name: "imageUrl",
      type: "text",
      admin: { description: "Optional S3 image URL uploaded via /api/upload." },
    },
    {
      name: "authorId",
      type: "text",
      required: true,
      index: true,
      admin: { position: "sidebar", description: "Better Auth user ID (UUID)." },
    },
    {
      name: "authorName",
      type: "text",
      admin: { position: "sidebar", readOnly: true },
    },
    {
      name: "communityId",
      type: "text",
      required: true,
      index: true,
      admin: { position: "sidebar" },
    },
    {
      name: "likeCount",
      type: "number",
      defaultValue: 0,
      admin: { position: "sidebar", readOnly: true },
    },
    {
      name: "commentCount",
      type: "number",
      defaultValue: 0,
      admin: { position: "sidebar", readOnly: true },
    },
    {
      name: "isDeleted",
      type: "checkbox",
      defaultValue: false,
      admin: { position: "sidebar" },
    },
    {
      name: "isEdited",
      type: "checkbox",
      defaultValue: false,
      admin: { position: "sidebar", readOnly: true },
    },
    {
      name: "editedAt",
      type: "date",
      admin: { position: "sidebar", readOnly: true },
    },
  ],
  timestamps: true,
};
```

- [ ] **Step 2: Create FeedComments collection**

Create `src/collections/FeedComments.ts`:

```typescript
import type { CollectionConfig } from "payload";

export const FeedComments: CollectionConfig = {
  slug: "feed-comments",
  admin: {
    useAsTitle: "id",
    defaultColumns: ["authorName", "post", "communityId", "createdAt"],
    description: "Comments on community feed posts. afterChange hook increments post commentCount.",
  },
  hooks: {
    afterChange: [
      async ({ doc, operation, req }) => {
        if (operation === "create") {
          const postId =
            typeof doc.post === "object" ? (doc.post as { id: number }).id : doc.post;
          if (postId) {
            const existing = await req.payload.findByID({
              collection: "feed-posts",
              id: postId,
              depth: 0,
            });
            await req.payload.update({
              collection: "feed-posts",
              id: postId,
              data: { commentCount: (existing.commentCount ?? 0) + 1 },
            });
          }
        }
      },
    ],
  },
  fields: [
    {
      name: "post",
      type: "relationship",
      relationTo: "feed-posts",
      required: true,
    },
    {
      name: "content",
      type: "text",
      required: true,
      admin: { description: "Plain text, max 1000 characters." },
    },
    {
      name: "authorId",
      type: "text",
      required: true,
      index: true,
      admin: { position: "sidebar", description: "Better Auth user ID (UUID)." },
    },
    {
      name: "authorName",
      type: "text",
      admin: { position: "sidebar", readOnly: true },
    },
    {
      name: "communityId",
      type: "text",
      required: true,
      index: true,
      admin: { position: "sidebar" },
    },
    {
      name: "isDeleted",
      type: "checkbox",
      defaultValue: false,
      admin: { position: "sidebar" },
    },
    {
      name: "isEdited",
      type: "checkbox",
      defaultValue: false,
      admin: { position: "sidebar", readOnly: true },
    },
    {
      name: "editedAt",
      type: "date",
      admin: { position: "sidebar", readOnly: true },
    },
  ],
  timestamps: true,
};
```

- [ ] **Step 3: Create FeedLikes collection**

Create `src/collections/FeedLikes.ts`:

```typescript
import type { CollectionConfig } from "payload";

export const FeedLikes: CollectionConfig = {
  slug: "feed-likes",
  admin: {
    useAsTitle: "id",
    defaultColumns: ["post", "userId", "createdAt"],
    description: "Tracks which users have liked which feed posts. One like per user per post (enforced by application code).",
  },
  fields: [
    {
      name: "post",
      type: "relationship",
      relationTo: "feed-posts",
      required: true,
    },
    {
      name: "userId",
      type: "text",
      required: true,
      index: true,
      admin: { description: "Better Auth user ID (UUID)." },
    },
  ],
  timestamps: true,
};
```

- [ ] **Step 4: Register all 3 collections in payload.config.ts**

In `src/payload.config.ts`, add the three imports after the existing collection imports (e.g., after the `Comments` import):

```typescript
import { FeedPosts } from "./collections/FeedPosts";
import { FeedComments } from "./collections/FeedComments";
import { FeedLikes } from "./collections/FeedLikes";
```

Add the three collections to the `collections` array after `Comments`:

```typescript
FeedPosts,
FeedComments,
FeedLikes,
```

- [ ] **Step 5: Verify with tsc**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/collections/FeedPosts.ts src/collections/FeedComments.ts src/collections/FeedLikes.ts src/payload.config.ts
git commit -m "feat(feed): add FeedPosts, FeedComments, FeedLikes Payload collections"
```

---

## Task 3: Schema + community settings

**Files:**
- Modify: `src/server/db/schema.ts`
- Modify: `src/server/api/routers/communities.ts`
- Modify: `src/components/communities/manage/settings-form.tsx`

- [ ] **Step 1: Add feedPostPolicy column to communities table**

In `src/server/db/schema.ts`, locate the `communities` table definition (around line 1287). After the `joinPolicy` field definition, add:

```typescript
feedPostPolicy: d
  .varchar({ length: 30 })
  .notNull()
  .default("all_members")
  .$type<"all_members" | "admins_only">(),
```

The full communities table field order after this change should be:
`id, name, slug, description, logoUrl, joinPolicy, feedPostPolicy, isListedInDirectory, createdBy, deletedAt, createdAt, updatedAt`

- [ ] **Step 2: Add feedPostPolicy to updateSettings router**

In `src/server/api/routers/communities.ts`, find the `updateSettings` procedure input schema (around line 572). Add the new field to the `z.object({...})`:

```typescript
feedPostPolicy: z.enum(["all_members", "admins_only"]).optional(),
```

In the same `updateSettings` mutation body, after the `isListedInDirectory` conditional update (around line 593), add:

```typescript
if (input.feedPostPolicy !== undefined) updates.feedPostPolicy = input.feedPostPolicy;
```

- [ ] **Step 3: Add feedPostPolicy to settings-form.tsx**

In `src/components/communities/manage/settings-form.tsx`:

**Add `feedPostPolicy` to the `SettingsFormProps` `initialData` interface:**

```typescript
feedPostPolicy: "all_members" | "admins_only";
```

**Add state after the `isListedInDirectory` state:**

```typescript
const [feedPostPolicy, setFeedPostPolicy] = useState<"all_members" | "admins_only">(
  initialData.feedPostPolicy,
);
```

**Add `feedPostPolicy` to the `handleSubmit` mutation call** (inside `updateMutation.mutate({...})`):

```typescript
feedPostPolicy,
```

**Add the Select dropdown** after the `joinPolicy` Select block and before the `isListedInDirectory` Switch block:

```tsx
<div className="space-y-2">
  <Label htmlFor="feedPostPolicy">{t("feedPostPolicy")}</Label>
  <Select
    value={feedPostPolicy}
    onValueChange={(v) => setFeedPostPolicy(v as "all_members" | "admins_only")}
  >
    <SelectTrigger id="feedPostPolicy">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="all_members">{t("feedPolicyAllMembers")}</SelectItem>
      <SelectItem value="admins_only">{t("feedPolicyAdminsOnly")}</SelectItem>
    </SelectContent>
  </Select>
</div>
```

- [ ] **Step 4: Verify with tsc**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/server/db/schema.ts src/server/api/routers/communities.ts src/components/communities/manage/settings-form.tsx
git commit -m "feat(feed): add feedPostPolicy to communities schema and settings form"
```

---

## Task 4: XP constants

**Files:**
- Modify: `src/lib/gamification.ts`

- [ ] **Step 1: Add feed XP constants to XP_AMOUNTS**

In `src/lib/gamification.ts`, find the `XP_AMOUNTS` object (around line 158). Add the four new constants after `ARTICLE_COMMENT_CREATE: 5,` (just before the `} as const;` closing):

```typescript
FEED_POST_CREATE: 10,
FEED_COMMENT_CREATE: 5,
FEED_RECEIVE_LIKE: 2,
FEED_RECEIVE_COMMENT: 3,
```

- [ ] **Step 2: Verify with tsc**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/gamification.ts
git commit -m "feat(feed): add feed XP constants to gamification"
```

---

## Task 5: Feed tRPC router

**Files:**
- Create: `src/server/api/routers/feed.ts`
- Modify: `src/server/api/root.ts`

- [ ] **Step 1: Create the feed router**

Create `src/server/api/routers/feed.ts`:

```typescript
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure, protectedProcedure } from "@/server/api/trpc";
import { getPayloadClient } from "@/server/payload";
import { logActivity } from "@/server/agent/activity";
import { and, eq, isNull } from "drizzle-orm";
import { communities, communityMemberships } from "@/server/db/schema";
import { awardXp, XP_AMOUNTS } from "@/lib/gamification";

export const feedRouter = createTRPCRouter({
  // ── getFeed ─────────────────────────────────────────────────────────────────
  getFeed: publicProcedure
    .input(
      z.object({
        communitySlug: z.string(),
        limit: z.number().min(1).max(50).default(20),
        cursor: z
          .object({ createdAt: z.string(), id: z.number() })
          .optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const community = await ctx.db.query.communities.findFirst({
        where: and(
          eq(communities.slug, input.communitySlug),
          isNull(communities.deletedAt),
        ),
        columns: { id: true },
      });
      if (!community) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const payload = await getPayloadClient();

      const whereClause: Record<string, unknown> = {
        and: [
          { communityId: { equals: community.id } },
          { isDeleted: { not_equals: true } },
        ],
      };

      if (input.cursor) {
        (whereClause.and as unknown[]).push({
          or: [
            { createdAt: { less_than: input.cursor.createdAt } },
            {
              and: [
                { createdAt: { equals: input.cursor.createdAt } },
                { id: { less_than: input.cursor.id } },
              ],
            },
          ],
        });
      }

      const { docs } = await payload.find({
        collection: "feed-posts",
        where: whereClause as Parameters<typeof payload.find>[0]["where"],
        sort: "-createdAt",
        limit: input.limit + 1,
        depth: 0,
      });

      const hasMore = docs.length > input.limit;
      const posts = hasMore ? docs.slice(0, input.limit) : docs;

      const userId = ctx.session?.user?.id;

      if (userId && posts.length > 0) {
        const postIds = posts.map((p) => p.id);
        const { docs: myLikes } = await payload.find({
          collection: "feed-likes",
          where: {
            and: [
              { userId: { equals: userId } },
              { post: { in: postIds } },
            ],
          },
          limit: postIds.length,
          depth: 0,
        });
        const likedPostIds = new Set(
          myLikes.map((l) =>
            typeof l.post === "object" ? (l.post as { id: number }).id : l.post,
          ),
        );
        const postsWithLike = posts.map((p) => ({
          ...p,
          hasLiked: likedPostIds.has(p.id),
        }));
        const nextCursor =
          hasMore && posts.length > 0
            ? {
                createdAt: posts[posts.length - 1]!.createdAt as string,
                id: posts[posts.length - 1]!.id,
              }
            : undefined;
        return { posts: postsWithLike, nextCursor };
      }

      const postsWithLike = posts.map((p) => ({ ...p, hasLiked: false }));
      const nextCursor =
        hasMore && posts.length > 0
          ? {
              createdAt: posts[posts.length - 1]!.createdAt as string,
              id: posts[posts.length - 1]!.id,
            }
          : undefined;
      return { posts: postsWithLike, nextCursor };
    }),

  // ── createPost ──────────────────────────────────────────────────────────────
  createPost: protectedProcedure
    .input(
      z.object({
        communitySlug: z.string(),
        content: z.string().min(1).max(2000),
        imageUrl: z.string().url().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const community = await ctx.db.query.communities.findFirst({
        where: and(
          eq(communities.slug, input.communitySlug),
          isNull(communities.deletedAt),
        ),
      });
      if (!community) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      // Verify active membership
      const membership = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, community.id),
          eq(communityMemberships.userId, ctx.session.user.id),
          eq(communityMemberships.status, "active"),
        ),
      });
      if (!membership) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      // Enforce feed post policy
      const feedPolicy = (community as unknown as { feedPostPolicy?: string }).feedPostPolicy ?? "all_members";
      if (feedPolicy === "admins_only") {
        const isPrivileged =
          membership.role === "owner" ||
          membership.role === "admin" ||
          membership.role === "moderator";
        if (!isPrivileged) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
      }

      const payload = await getPayloadClient();
      const userName = ctx.session.user.name ?? "member";

      const post = await payload.create({
        collection: "feed-posts",
        data: {
          content: input.content,
          imageUrl: input.imageUrl ?? undefined,
          authorId: ctx.session.user.id,
          authorName: userName,
          communityId: community.id,
          likeCount: 0,
          commentCount: 0,
        },
      });

      await awardXp(ctx.db, ctx.session.user.id, XP_AMOUNTS.FEED_POST_CREATE);

      await logActivity(ctx.db, {
        actorId: ctx.session.user.id,
        actorType: "member",
        action: "feed.post_created",
        targetType: "feed-posts",
        targetId: String(post.id),
        metadata: { communityId: community.id },
      });

      return post;
    }),

  // ── editPost ────────────────────────────────────────────────────────────────
  editPost: protectedProcedure
    .input(
      z.object({
        postId: z.number(),
        content: z.string().min(1).max(2000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();

      const post = await payload.findByID({
        collection: "feed-posts",
        id: input.postId,
        depth: 0,
      });

      if (!post || post.isDeleted) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      if (post.authorId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      return payload.update({
        collection: "feed-posts",
        id: input.postId,
        data: {
          content: input.content,
          isEdited: true,
          editedAt: new Date().toISOString(),
        },
      });
    }),

  // ── deletePost ──────────────────────────────────────────────────────────────
  deletePost: protectedProcedure
    .input(z.object({ postId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();

      const post = await payload.findByID({
        collection: "feed-posts",
        id: input.postId,
        depth: 0,
      });

      if (!post || post.isDeleted) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const isAuthor = post.authorId === ctx.session.user.id;
      let canDelete = isAuthor;

      if (!canDelete && post.communityId) {
        const membership = await ctx.db.query.communityMemberships.findFirst({
          where: and(
            eq(communityMemberships.communityId, post.communityId),
            eq(communityMemberships.userId, ctx.session.user.id),
            eq(communityMemberships.status, "active"),
          ),
        });
        if (
          membership &&
          (membership.role === "owner" ||
            membership.role === "admin" ||
            membership.role === "moderator")
        ) {
          canDelete = true;
        }
      }

      if (!canDelete) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      return payload.update({
        collection: "feed-posts",
        id: input.postId,
        data: {
          isDeleted: true,
          content: "",
          authorName: "",
          imageUrl: null,
        },
      });
    }),

  // ── toggleLike ──────────────────────────────────────────────────────────────
  toggleLike: protectedProcedure
    .input(z.object({ postId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();
      const userId = ctx.session.user.id;

      const post = await payload.findByID({
        collection: "feed-posts",
        id: input.postId,
        depth: 0,
      });

      if (!post || post.isDeleted) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      // Verify active membership
      const membership = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, post.communityId),
          eq(communityMemberships.userId, userId),
          eq(communityMemberships.status, "active"),
        ),
      });
      if (!membership) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const { docs: existingLikes } = await payload.find({
        collection: "feed-likes",
        where: {
          and: [
            { post: { equals: input.postId } },
            { userId: { equals: userId } },
          ],
        },
        limit: 1,
        depth: 0,
      });

      if (existingLikes.length > 0) {
        await payload.delete({
          collection: "feed-likes",
          id: existingLikes[0]!.id,
        });
        await payload.update({
          collection: "feed-posts",
          id: input.postId,
          data: { likeCount: Math.max(0, (post.likeCount ?? 0) - 1) },
        });
        return { liked: false };
      } else {
        await payload.create({
          collection: "feed-likes",
          data: { post: input.postId, userId },
        });
        await payload.update({
          collection: "feed-posts",
          id: input.postId,
          data: { likeCount: (post.likeCount ?? 0) + 1 },
        });

        // Award XP to post author (only if author is different from liker)
        if (post.authorId && post.authorId !== userId) {
          await awardXp(ctx.db, post.authorId, XP_AMOUNTS.FEED_RECEIVE_LIKE);
        }

        return { liked: true };
      }
    }),

  // ── getComments ─────────────────────────────────────────────────────────────
  getComments: publicProcedure
    .input(
      z.object({
        postId: z.number(),
        limit: z.number().min(1).max(200).default(50),
      }),
    )
    .query(async ({ input }) => {
      const payload = await getPayloadClient();

      const { docs } = await payload.find({
        collection: "feed-comments",
        where: {
          and: [
            { post: { equals: input.postId } },
            { isDeleted: { not_equals: true } },
          ],
        },
        sort: "createdAt",
        limit: input.limit,
        depth: 0,
      });

      return docs;
    }),

  // ── addComment ──────────────────────────────────────────────────────────────
  addComment: protectedProcedure
    .input(
      z.object({
        postId: z.number(),
        content: z.string().min(1).max(1000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();

      const post = await payload.findByID({
        collection: "feed-posts",
        id: input.postId,
        depth: 0,
      });

      if (!post || post.isDeleted) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      // Verify active membership
      const membership = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, post.communityId),
          eq(communityMemberships.userId, ctx.session.user.id),
          eq(communityMemberships.status, "active"),
        ),
      });
      if (!membership) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const userName = ctx.session.user.name ?? "member";

      const comment = await payload.create({
        collection: "feed-comments",
        data: {
          post: input.postId,
          content: input.content,
          authorId: ctx.session.user.id,
          authorName: userName,
          communityId: post.communityId,
        },
      });

      // Award XP: commenter gets FEED_COMMENT_CREATE, post author gets FEED_RECEIVE_COMMENT
      await awardXp(ctx.db, ctx.session.user.id, XP_AMOUNTS.FEED_COMMENT_CREATE);
      if (post.authorId && post.authorId !== ctx.session.user.id) {
        await awardXp(ctx.db, post.authorId, XP_AMOUNTS.FEED_RECEIVE_COMMENT);
      }

      await logActivity(ctx.db, {
        actorId: ctx.session.user.id,
        actorType: "member",
        action: "feed.comment_created",
        targetType: "feed-comments",
        targetId: String(comment.id),
        metadata: { postId: input.postId },
      });

      return comment;
    }),

  // ── editComment ─────────────────────────────────────────────────────────────
  editComment: protectedProcedure
    .input(
      z.object({
        commentId: z.number(),
        content: z.string().min(1).max(1000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();

      const comment = await payload.findByID({
        collection: "feed-comments",
        id: input.commentId,
        depth: 0,
      });

      if (!comment || comment.isDeleted) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      if (comment.authorId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      return payload.update({
        collection: "feed-comments",
        id: input.commentId,
        data: {
          content: input.content,
          isEdited: true,
          editedAt: new Date().toISOString(),
        },
      });
    }),

  // ── deleteComment ───────────────────────────────────────────────────────────
  deleteComment: protectedProcedure
    .input(z.object({ commentId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();

      const comment = await payload.findByID({
        collection: "feed-comments",
        id: input.commentId,
        depth: 0,
      });

      if (!comment || comment.isDeleted) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const isAuthor = comment.authorId === ctx.session.user.id;
      let canDelete = isAuthor;

      if (!canDelete && comment.communityId) {
        const membership = await ctx.db.query.communityMemberships.findFirst({
          where: and(
            eq(communityMemberships.communityId, comment.communityId),
            eq(communityMemberships.userId, ctx.session.user.id),
            eq(communityMemberships.status, "active"),
          ),
        });
        if (
          membership &&
          (membership.role === "owner" ||
            membership.role === "admin" ||
            membership.role === "moderator")
        ) {
          canDelete = true;
        }
      }

      if (!canDelete) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      // Soft-delete and decrement parent post commentCount
      await payload.update({
        collection: "feed-comments",
        id: input.commentId,
        data: { isDeleted: true, content: "", authorName: "" },
      });

      const postId =
        typeof comment.post === "object"
          ? (comment.post as { id: number }).id
          : comment.post;
      if (postId) {
        const post = await payload.findByID({
          collection: "feed-posts",
          id: postId,
          depth: 0,
        });
        await payload.update({
          collection: "feed-posts",
          id: postId,
          data: { commentCount: Math.max(0, (post.commentCount ?? 0) - 1) },
        });
      }

      return { deleted: true };
    }),
});
```

- [ ] **Step 2: Register feed router in root.ts**

In `src/server/api/root.ts`, add the import after the last existing router import:

```typescript
import { feedRouter } from "./routers/feed";
```

Add `feed: feedRouter,` to the `appRouter` object, after `communities: communitiesRouter,`:

```typescript
feed: feedRouter,
```

- [ ] **Step 3: Verify with tsc**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/server/api/routers/feed.ts src/server/api/root.ts
git commit -m "feat(feed): add feed tRPC router with 9 procedures"
```

---

## Task 6: Community sidebar component

**Files:**
- Create: `src/components/communities/feed/community-sidebar.tsx`

Extract the sidebar widgets from the current overview page into a dedicated component.

- [ ] **Step 1: Create community-sidebar.tsx**

Create `src/components/communities/feed/community-sidebar.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { MessageSquare, Calendar, ChevronUp } from "lucide-react";

const typeLabels: Record<string, string> = {
  workshop: "WORKSHOP",
  hackathon: "HACKATHON",
  deep_dive: "DEEP-DIVE",
  meetup: "MEETUP",
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${String(d.getDate()).padStart(2, "0")}`;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const diff = now - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

interface CommunitySidebarProps {
  slug: string;
  description?: string | null;
}

export function CommunitySidebar({ slug, description }: CommunitySidebarProps) {
  const t = useTranslations("communities.profile");

  const { data: threadsData, isLoading: threadsLoading } =
    api.forum.getThreads.useQuery({
      communitySlug: slug,
      sort: "lastActive",
      limit: 3,
    });

  const { data: eventsData, isLoading: eventsLoading } =
    api.events.getCommunityEvents.useQuery({ communitySlug: slug });

  const { data: ideasData, isLoading: ideasLoading } =
    api.forum.getIdeas.useQuery({ communitySlug: slug, sort: "votes" });

  const threads = (threadsData?.threads ?? []).slice(0, 3);
  const events = (eventsData ?? []).slice(0, 3);
  const ideas = (ideasData ?? []).slice(0, 3);

  return (
    <div className="flex flex-col gap-8">
      {/* About */}
      {description ? (
        <section>
          <SectionHeader title="/ ABOUT" />
          <p className="text-muted-foreground mt-4 whitespace-pre-wrap text-sm leading-relaxed">
            {description}
          </p>
        </section>
      ) : null}

      {/* Upcoming Events */}
      <section>
        <SectionHeader
          title={`/ ${t("upcomingEvents").toUpperCase()}`}
          linkHref={`/communities/${slug}/events`}
          linkLabel={t("viewAll")}
          show={events.length > 0}
        />
        {eventsLoading ? (
          <Skeleton count={2} />
        ) : events.length === 0 ? (
          <EmptyState>{t("noEventsYet")}</EmptyState>
        ) : (
          <div className="mt-3 space-y-1">
            {events.map((event) => (
              <Link
                key={event.id}
                href={`/events/${event.slug}` as never}
                className="border-border hover:bg-secondary/50 flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors"
              >
                <Calendar className="text-muted-foreground size-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{event.title}</p>
                  <p className="text-muted-foreground text-[11px]">
                    {formatDate(event.date)}
                    {event.startTime && ` · ${event.startTime}`}
                    {event.location && ` · ${event.location}`}
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0 text-[9px] uppercase">
                  {typeLabels[event.type] ?? event.type}
                </Badge>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Recent Threads */}
      <section>
        <SectionHeader
          title={`/ ${t("recentThreads").toUpperCase()}`}
          linkHref={`/communities/${slug}/forum`}
          linkLabel={t("viewAll")}
          show={threads.length > 0}
        />
        {threadsLoading ? (
          <Skeleton count={3} />
        ) : threads.length === 0 ? (
          <EmptyState>{t("noThreadsYet")}</EmptyState>
        ) : (
          <div className="mt-3 space-y-1">
            {threads.map((thread) => (
              <Link
                key={thread.id}
                href={`/forum/${thread.slug}` as never}
                className="border-border hover:bg-secondary/50 flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors"
              >
                <MessageSquare className="text-muted-foreground size-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{thread.title}</p>
                  <p className="text-muted-foreground text-[11px]">
                    {thread.authorName} · {timeAgo(thread.lastActivityAt ?? thread.createdAt)}
                    {(thread.replyCount ?? 0) > 0 &&
                      ` · ${t("replies", { count: thread.replyCount ?? 0 })}`}
                  </p>
                </div>
                <Badge variant="secondary" className="shrink-0 text-[9px] uppercase">
                  {thread.category}
                </Badge>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Top Ideas */}
      <section>
        <SectionHeader
          title={`/ ${t("topIdeas").toUpperCase()}`}
          linkHref={`/communities/${slug}/ideas`}
          linkLabel={t("viewAll")}
          show={ideas.length > 0}
        />
        {ideasLoading ? (
          <Skeleton count={3} />
        ) : ideas.length === 0 ? (
          <EmptyState>{t("noIdeasYet")}</EmptyState>
        ) : (
          <div className="mt-3 space-y-1">
            {ideas.map((idea) => (
              <div
                key={idea.id}
                className="border-border hover:bg-secondary/50 flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors"
              >
                <div className="flex shrink-0 flex-col items-center gap-0.5 px-1">
                  <ChevronUp className="text-muted-foreground size-3" />
                  <span className="font-mono text-[10px] font-bold">{idea.voteCount ?? 0}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{idea.title}</p>
                  <p className="text-muted-foreground text-[11px]">{idea.authorName}</p>
                </div>
                <Badge
                  variant={idea.status === "implemented" ? "default" : "secondary"}
                  className="shrink-0 text-[9px] uppercase"
                >
                  {idea.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SectionHeader({
  title,
  linkHref,
  linkLabel,
  show = true,
}: {
  title: string;
  linkHref?: string;
  linkLabel?: string;
  show?: boolean;
}) {
  return (
    <div className="border-border flex items-center justify-between border-b pb-2">
      <h2 className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
        {title}
      </h2>
      {show && linkHref && linkLabel ? (
        <Link
          href={linkHref as never}
          className="text-muted-foreground hover:text-foreground font-mono text-[10px] tracking-wider transition-colors"
        >
          {linkLabel}
        </Link>
      ) : null}
    </div>
  );
}

function Skeleton({ count }: { count: number }) {
  return (
    <div className="mt-3 space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-muted h-14 animate-pulse rounded-lg" />
      ))}
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground mt-6 text-center font-mono text-xs tracking-wider">
      {children}
    </p>
  );
}
```

- [ ] **Step 2: Verify with tsc**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/communities/feed/community-sidebar.tsx
git commit -m "feat(feed): add community sidebar component extracted from overview"
```

---

## Task 7: Post composer component

**Files:**
- Create: `src/components/communities/feed/post-composer.tsx`

- [ ] **Step 1: Create post-composer.tsx**

Create `src/components/communities/feed/post-composer.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ImagePlus, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface PostComposerProps {
  communitySlug: string;
  onPostCreated: () => void;
  canPost: boolean;
}

export function PostComposer({ communitySlug, onPostCreated, canPost }: PostComposerProps) {
  const t = useTranslations("communities.feed");
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createPost = api.feed.createPost.useMutation({
    onSuccess: () => {
      toast.success(t("postCreated"));
      setContent("");
      setImageUrl(null);
      onPostCreated();
    },
    onError: () => {
      toast.error("Failed to create post");
    },
  });

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("alt", "Feed post image");

      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");

      const data = await res.json() as { url: string };
      setImageUrl(data.url);
    } catch {
      toast.error("Failed to upload image");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    createPost.mutate({
      communitySlug,
      content: content.trim(),
      imageUrl: imageUrl ?? undefined,
    });
  };

  if (!canPost) return null;

  return (
    <form onSubmit={handleSubmit} className="border-border rounded-lg border p-4 space-y-3">
      <Textarea
        placeholder={t("composePlaceholder")}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        maxLength={2000}
        rows={3}
        className="resize-none"
      />

      {imageUrl ? (
        <div className="relative inline-block">
          <img
            src={imageUrl}
            alt="Preview"
            className="max-h-48 rounded-lg object-cover"
          />
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="absolute right-1 top-1 size-6"
            onClick={() => setImageUrl(null)}
          >
            <X className="size-3" />
          </Button>
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isUploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {isUploading ? (
            <Loader2 className="mr-1.5 size-4 animate-spin" />
          ) : (
            <ImagePlus className="mr-1.5 size-4" />
          )}
          {t("addImage")}
        </Button>

        <Button
          type="submit"
          size="sm"
          disabled={!content.trim() || createPost.isPending}
        >
          {createPost.isPending ? (
            <Loader2 className="mr-1.5 size-4 animate-spin" />
          ) : null}
          {t("post")}
        </Button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageUpload}
      />
    </form>
  );
}
```

- [ ] **Step 2: Verify with tsc**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/communities/feed/post-composer.tsx
git commit -m "feat(feed): add post composer component"
```

---

## Task 8: Feed post card component

**Files:**
- Create: `src/components/communities/feed/feed-post-card.tsx`

- [ ] **Step 1: Create feed-post-card.tsx**

Create `src/components/communities/feed/feed-post-card.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Heart, MessageSquare, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const diff = now - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

interface FeedPost {
  id: number;
  content: string;
  imageUrl?: string | null;
  authorId: string;
  authorName?: string | null;
  communityId: string;
  likeCount?: number | null;
  commentCount?: number | null;
  isDeleted?: boolean | null;
  isEdited?: boolean | null;
  editedAt?: string | null;
  createdAt: string;
  hasLiked: boolean;
}

interface FeedPostCardProps {
  post: FeedPost;
  currentUserId?: string | null;
  memberRole?: string | null;
  onRefresh: () => void;
  onToggleComments: (postId: number) => void;
  showComments: boolean;
}

export function FeedPostCard({
  post,
  currentUserId,
  memberRole,
  onRefresh,
  onToggleComments,
  showComments,
}: FeedPostCardProps) {
  const t = useTranslations("communities.feed");
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(post.content);

  const isAuthor = !!currentUserId && post.authorId === currentUserId;
  const isPrivileged =
    memberRole === "owner" || memberRole === "admin" || memberRole === "moderator";

  const toggleLike = api.feed.toggleLike.useMutation({
    onSuccess: () => onRefresh(),
    onError: () => toast.error("Failed to toggle like"),
  });

  const editPost = api.feed.editPost.useMutation({
    onSuccess: () => {
      toast.success(t("postEdited"));
      setIsEditing(false);
      onRefresh();
    },
    onError: () => toast.error("Failed to update post"),
  });

  const deletePost = api.feed.deletePost.useMutation({
    onSuccess: () => {
      toast.success(t("postDeleted"));
      onRefresh();
    },
    onError: () => toast.error("Failed to delete post"),
  });

  if (post.isDeleted) {
    return (
      <div className="border-border rounded-lg border px-4 py-3">
        <p className="text-muted-foreground font-mono text-xs">{t("postDeletedMessage")}</p>
      </div>
    );
  }

  const initials = (post.authorName ?? "?")[0]?.toUpperCase() ?? "?";

  return (
    <div className="border-border rounded-lg border p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <Avatar className="size-8">
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-medium leading-tight">{post.authorName ?? "Member"}</p>
            <p className="text-muted-foreground text-[11px]">
              {timeAgo(post.createdAt)}
              {post.isEdited ? ` · (${t("edited")})` : ""}
            </p>
          </div>
        </div>

        {(isAuthor || isPrivileged) && currentUserId ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-7 shrink-0">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isAuthor && (
                <DropdownMenuItem
                  onClick={() => {
                    setEditContent(post.content);
                    setIsEditing(true);
                  }}
                >
                  {t("edit")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => {
                  if (confirm(t("deletePostConfirm"))) {
                    deletePost.mutate({ postId: post.id });
                  }
                }}
              >
                {t("delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      {/* Content */}
      {isEditing ? (
        <div className="space-y-2">
          <Textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            maxLength={2000}
            rows={3}
            className="resize-none"
            autoFocus
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() =>
                editPost.mutate({ postId: post.id, content: editContent.trim() })
              }
              disabled={!editContent.trim() || editPost.isPending}
            >
              {t("save")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIsEditing(false)}
            >
              {t("cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{post.content}</p>
      )}

      {/* Image */}
      {post.imageUrl ? (
        <img
          src={post.imageUrl}
          alt="Post image"
          className="w-full rounded-lg object-cover max-h-96"
        />
      ) : null}

      {/* Actions */}
      <div className="flex items-center gap-4 pt-1">
        <button
          type="button"
          onClick={() => {
            if (currentUserId) {
              toggleLike.mutate({ postId: post.id });
            }
          }}
          className="flex items-center gap-1.5 text-sm transition-colors disabled:opacity-50"
          disabled={!currentUserId || toggleLike.isPending}
        >
          <Heart
            className={`size-4 ${post.hasLiked ? "fill-red-500 text-red-500" : "text-muted-foreground"}`}
          />
          <span className="text-muted-foreground font-mono text-[11px]">
            {post.likeCount ?? 0}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onToggleComments(post.id)}
          className="flex items-center gap-1.5 text-sm transition-colors"
        >
          <MessageSquare className="text-muted-foreground size-4" />
          <span className="text-muted-foreground font-mono text-[11px]">
            {post.commentCount ?? 0}
          </span>
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify with tsc**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/communities/feed/feed-post-card.tsx
git commit -m "feat(feed): add feed post card component"
```

---

## Task 9: Feed comments component

**Files:**
- Create: `src/components/communities/feed/feed-comments.tsx`

- [ ] **Step 1: Create feed-comments.tsx**

Create `src/components/communities/feed/feed-comments.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Loader2 } from "lucide-react";
import { toast } from "sonner";

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const diff = now - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

interface FeedComment {
  id: number;
  content: string;
  authorId: string;
  authorName?: string | null;
  communityId: string;
  isDeleted?: boolean | null;
  isEdited?: boolean | null;
  editedAt?: string | null;
  createdAt: string;
}

interface FeedCommentsProps {
  postId: number;
  currentUserId?: string | null;
  memberRole?: string | null;
}

export function FeedComments({ postId, currentUserId, memberRole }: FeedCommentsProps) {
  const t = useTranslations("communities.feed");
  const utils = api.useUtils();
  const [newComment, setNewComment] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");

  const isPrivileged =
    memberRole === "owner" || memberRole === "admin" || memberRole === "moderator";

  const { data: comments = [], isLoading } = api.feed.getComments.useQuery({ postId });

  const addComment = api.feed.addComment.useMutation({
    onSuccess: () => {
      toast.success(t("commentCreated"));
      setNewComment("");
      void utils.feed.getComments.invalidate({ postId });
    },
    onError: () => toast.error("Failed to add comment"),
  });

  const editComment = api.feed.editComment.useMutation({
    onSuccess: () => {
      toast.success(t("commentEdited"));
      setEditingId(null);
      void utils.feed.getComments.invalidate({ postId });
    },
    onError: () => toast.error("Failed to update comment"),
  });

  const deleteComment = api.feed.deleteComment.useMutation({
    onSuccess: () => {
      toast.success(t("commentDeleted"));
      void utils.feed.getComments.invalidate({ postId });
    },
    onError: () => toast.error("Failed to delete comment"),
  });

  if (isLoading) {
    return (
      <div className="space-y-2 pt-1 pl-4 border-l border-border">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="bg-muted h-10 animate-pulse rounded" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3 pt-1 pl-4 border-l border-border">
      {/* Comment list */}
      {(comments as FeedComment[]).map((comment) => {
        const isAuthor = !!currentUserId && comment.authorId === currentUserId;
        const canModify = isAuthor || isPrivileged;
        const initials = (comment.authorName ?? "?")[0]?.toUpperCase() ?? "?";

        if (comment.isDeleted) {
          return (
            <p key={comment.id} className="text-muted-foreground font-mono text-[11px]">
              {t("commentDeletedMessage")}
            </p>
          );
        }

        return (
          <div key={comment.id} className="flex gap-2 items-start">
            <Avatar className="size-6 mt-0.5 shrink-0">
              <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-1">
                <div>
                  <span className="text-xs font-medium">{comment.authorName ?? "Member"}</span>
                  <span className="text-muted-foreground text-[10px] ml-1.5">
                    {timeAgo(comment.createdAt)}
                    {comment.isEdited ? ` · (${t("edited")})` : ""}
                  </span>
                </div>
                {canModify && currentUserId ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-5 shrink-0">
                        <MoreHorizontal className="size-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {isAuthor && (
                        <DropdownMenuItem
                          onClick={() => {
                            setEditContent(comment.content);
                            setEditingId(comment.id);
                          }}
                        >
                          {t("edit")}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => {
                          if (confirm(t("deleteCommentConfirm"))) {
                            deleteComment.mutate({ commentId: comment.id });
                          }
                        }}
                      >
                        {t("delete")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>

              {editingId === comment.id ? (
                <div className="mt-1 space-y-1.5">
                  <Textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    maxLength={1000}
                    rows={2}
                    className="resize-none text-sm"
                    autoFocus
                  />
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() =>
                        editComment.mutate({
                          commentId: comment.id,
                          content: editContent.trim(),
                        })
                      }
                      disabled={!editContent.trim() || editComment.isPending}
                    >
                      {t("save")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => setEditingId(null)}
                    >
                      {t("cancel")}
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm mt-0.5 whitespace-pre-wrap">{comment.content}</p>
              )}
            </div>
          </div>
        );
      })}

      {/* New comment form */}
      {currentUserId ? (
        <div className="flex gap-2 items-start pt-1">
          <Avatar className="size-6 mt-0.5 shrink-0">
            <AvatarFallback className="text-[10px]">Y</AvatarFallback>
          </Avatar>
          <div className="flex-1 space-y-1.5">
            <Textarea
              placeholder={t("commentPlaceholder")}
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              maxLength={1000}
              rows={2}
              className="resize-none text-sm"
            />
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                if (newComment.trim()) {
                  addComment.mutate({ postId, content: newComment.trim() });
                }
              }}
              disabled={!newComment.trim() || addComment.isPending}
            >
              {addComment.isPending ? (
                <Loader2 className="mr-1 size-3 animate-spin" />
              ) : null}
              {t("post")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Verify with tsc**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/communities/feed/feed-comments.tsx
git commit -m "feat(feed): add feed comments component"
```

---

## Task 10: Feed page + overview replacement

**Files:**
- Create: `src/components/communities/feed/feed-page.tsx`
- Modify: `src/app/[locale]/communities/[slug]/page.tsx`

- [ ] **Step 1: Create feed-page.tsx**

Create `src/components/communities/feed/feed-page.tsx`:

```tsx
"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { PostComposer } from "./post-composer";
import { FeedPostCard } from "./feed-post-card";
import { FeedComments } from "./feed-comments";
import { CommunitySidebar } from "./community-sidebar";

interface FeedPageProps {
  communitySlug: string;
  communityDescription?: string | null;
  feedPostPolicy?: string | null;
  currentUserId?: string | null;
  memberRole?: string | null;
}

export function FeedPage({
  communitySlug,
  communityDescription,
  feedPostPolicy,
  currentUserId,
  memberRole,
}: FeedPageProps) {
  const t = useTranslations("communities.feed");
  const [expandedComments, setExpandedComments] = useState<Set<number>>(new Set());

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = api.feed.getFeed.useInfiniteQuery(
    { communitySlug, limit: 20 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );

  const handleRefresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  const toggleComments = useCallback((postId: number) => {
    setExpandedComments((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) {
        next.delete(postId);
      } else {
        next.add(postId);
      }
      return next;
    });
  }, []);

  const isPrivileged =
    memberRole === "owner" || memberRole === "admin" || memberRole === "moderator";
  const canPost =
    !!currentUserId &&
    !!memberRole &&
    (feedPostPolicy !== "admins_only" || isPrivileged);

  const allPosts = data?.pages.flatMap((p) => p.posts) ?? [];

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
      {/* Feed column */}
      <div className="flex-1 min-w-0 space-y-4">
        <PostComposer
          communitySlug={communitySlug}
          onPostCreated={handleRefresh}
          canPost={canPost}
        />

        {allPosts.length === 0 ? (
          <p className="text-muted-foreground mt-10 text-center font-mono text-xs tracking-wider">
            {t("noPostsYet")}
          </p>
        ) : (
          allPosts.map((post) => (
            <div key={post.id} className="space-y-2">
              <FeedPostCard
                post={post}
                currentUserId={currentUserId}
                memberRole={memberRole}
                onRefresh={handleRefresh}
                onToggleComments={toggleComments}
                showComments={expandedComments.has(post.id)}
              />
              {expandedComments.has(post.id) && (
                <div className="px-4">
                  <FeedComments
                    postId={post.id}
                    currentUserId={currentUserId}
                    memberRole={memberRole}
                  />
                </div>
              )}
            </div>
          ))
        )}

        {hasNextPage ? (
          <div className="flex justify-center pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void fetchNextPage()}
              disabled={isFetchingNextPage}
              className="font-mono text-xs tracking-wider"
            >
              {t("loadMore")}
            </Button>
          </div>
        ) : null}
      </div>

      {/* Sidebar */}
      <aside className="w-full lg:w-80 shrink-0">
        <CommunitySidebar slug={communitySlug} description={communityDescription} />
      </aside>
    </div>
  );
}
```

- [ ] **Step 2: Replace the community overview page**

Completely replace the contents of `src/app/[locale]/communities/[slug]/page.tsx` with:

```tsx
"use client";

import { use } from "react";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { FeedPage } from "@/components/communities/feed/feed-page";

export default function CommunityOverviewPage({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>;
}) {
  const { slug } = use(params);
  const { data: session } = authClient.useSession();
  const { data: community } = api.communities.getBySlug.useQuery({ slug });
  const { data: myCommunities } = api.communities.getMyCommunities.useQuery(
    undefined,
    { enabled: !!session?.user },
  );

  if (!community) return null;

  const membership = myCommunities?.find((m) => m.communityId === community.id);
  const memberRole =
    membership?.status === "active" ? membership.role : null;
  const feedPostPolicy =
    (community as unknown as { feedPostPolicy?: string }).feedPostPolicy ?? "all_members";

  return (
    <FeedPage
      communitySlug={slug}
      communityDescription={community.description}
      feedPostPolicy={feedPostPolicy}
      currentUserId={session?.user?.id ?? null}
      memberRole={memberRole ?? null}
    />
  );
}
```

- [ ] **Step 3: Verify with tsc**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/components/communities/feed/feed-page.tsx src/app/[locale]/communities/[slug]/page.tsx
git commit -m "feat(feed): replace community overview page with social feed layout"
```

---

## Task 11: Final verification

- [ ] **Step 1: Full tsc check**

```bash
npx tsc --noEmit
```

Confirm zero type errors.

- [ ] **Step 2: Smoke test checklist**

Manually verify these flows in the browser:

- [ ] Community overview URL (`/communities/[slug]`) now shows feed layout (post composer + feed column + sidebar)
- [ ] Sidebar shows About, Upcoming Events, Recent Threads, Top Ideas with "VIEW ALL +" links
- [ ] Post composer visible for members when feedPostPolicy is `all_members`
- [ ] Post composer hidden when feedPostPolicy is `admins_only` and user is not admin/mod
- [ ] Create a post (text only) — appears in feed, toast fires, XP awarded
- [ ] Create a post with an image — image renders in post card
- [ ] Like a post — heart fills red, count increments; unlike — reverts
- [ ] Edit a post (author kebab menu) — inline textarea, Save updates content, "(edited)" label appears
- [ ] Delete a post (author or admin) — confirm dialog fires, post replaced with deleted message
- [ ] Expand comments on a post — FeedComments loads below the card
- [ ] Add a comment — appears in comment list, toast fires
- [ ] Edit a comment (author kebab) — inline edit works
- [ ] Delete a comment (author or admin) — replaced with deleted message
- [ ] Community settings page shows "Who can post to the feed" dropdown, saves correctly
- [ ] Feed is paginated — "LOAD MORE" appears when > 20 posts, next page loads

- [ ] **Step 3: Final commit if any last fixes applied**

```bash
npx tsc --noEmit
git add -p
git commit -m "fix(feed): final tsc and smoke test fixes"
```

---

## Implementation Notes

### Type casting for feedPostPolicy on community object

The `community` object returned by `getBySlug` is typed from the Drizzle inferred select type. Because `feedPostPolicy` is a new column, it will be present in the type after the schema change — but in the page component and feed router, a safe cast `(community as unknown as { feedPostPolicy?: string }).feedPostPolicy` is used as a fallback pattern for the initial implementation before Drizzle regenerates types.

### FeedComments afterChange hook vs. router increment

The `FeedComments` Payload collection uses an `afterChange` hook to increment `commentCount` on the parent post when a comment is created. The `addComment` tRPC procedure does **not** additionally increment it — the hook handles it. The `deleteComment` procedure does manually decrement because there is no `afterChange` hook for deletes.

### Keyset pagination in getFeed

The `getFeed` procedure appends an extra `cursor` condition to the `where` clause when a cursor is provided (createdAt + id for tie-breaking). The client uses `useInfiniteQuery` with `getNextPageParam` returning `nextCursor` from each page. The last page returns `nextCursor: undefined` when there are no more results.

### feedPostPolicy on getBySlug return type

Until Drizzle infers the new column, access `feedPostPolicy` via the cast pattern. Once types are regenerated (which happens automatically via Drizzle introspection in development), the cast can be removed.
