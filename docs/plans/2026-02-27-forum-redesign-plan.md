# Forum Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade the community forum from a modal-only experience to a full-featured dedicated `/forum` page with replies, rich text, search/sort, author badges, notifications, and gamification — keeping Payload CMS as the backend.

**Architecture:** Enhance existing Payload CMS `forum-threads` and `forum-replies` collections with new fields and hooks. Build new Next.js App Router pages at `/[locale]/forum` and `/[locale]/forum/[slug]`. Upgrade the tRPC community router with pagination, search, and sort. Add rich text editing via Payload's Lexical editor. Integrate with existing activity/XP and inbox systems.

**Tech Stack:** Next.js 15 (App Router), Payload CMS 3.77, tRPC v11, Drizzle ORM, React 19, Tailwind CSS v4, next-intl, @payloadcms/richtext-lexical

**Design doc:** `docs/plans/2026-02-27-forum-redesign-design.md`

---

## Task 1: Add i18n Keys for Forum Pages

**Files:**
- Modify: `messages/en.json` (community.threads section + new forum section)
- Modify: `messages/nl.json` (same keys, Dutch translations)

**Step 1: Add new English i18n keys**

Add the following keys under `community.threads` (or a new `forum` namespace if cleaner):

```json
{
  "forum": {
    "title": "Forum",
    "subtitle": "Ask, share, connect with the community",
    "search": "Search threads...",
    "newThread": "+ New Thread",
    "sortNewest": "Newest",
    "sortMostReplied": "Most Replied",
    "sortTrending": "Trending",
    "sortLastActive": "Last Active",
    "sort": "Sort",
    "loadMore": "Load more",
    "noThreads": "No threads yet. Start the conversation!",
    "noResults": "No threads match your search.",
    "backToForum": "← Back to Forum",
    "replies": "{count} replies",
    "reply": "Reply",
    "replying": "Replying...",
    "replyPlaceholder": "Write your reply...",
    "replyPosted": "Reply posted!",
    "loginToReply": "Sign in to reply",
    "loginToPost": "Sign in to post",
    "threadLocked": "This thread is locked.",
    "pinned": "Pinned",
    "views": "{count} views",
    "createThread": "Create Thread",
    "creating": "Creating...",
    "titleLabel": "Title",
    "titlePlaceholder": "What's on your mind?",
    "contentLabel": "Content",
    "contentPlaceholder": "Write your post...",
    "categoryLabel": "Category",
    "all": "All",
    "general": "General",
    "question": "Question",
    "showcase": "Showcase",
    "job": "Jobs",
    "admin": "Admin",
    "moderator": "Moderator",
    "contributor": "Contributor",
    "member": "Member",
    "threadCreated": "Thread created!",
    "editThread": "Edit",
    "pinThread": "Pin",
    "unpinThread": "Unpin",
    "lockThread": "Lock",
    "unlockThread": "Unlock"
  }
}
```

**Step 2: Add corresponding Dutch translations**

Translate all keys above to Dutch in `messages/nl.json`.

**Step 3: Verify**

Run: `npx next build` (or `npm run check`)
Expected: No missing i18n key errors

**Step 4: Commit**

```bash
git add messages/en.json messages/nl.json
git commit -m "feat(forum): add i18n keys for forum pages (EN + NL)"
```

---

## Task 2: Upgrade Payload Forum Collections

**Files:**
- Modify: `src/collections/ForumThreads.ts` (add viewCount, type fields)
- Modify: `src/collections/ForumReplies.ts` (add authorRole field, afterChange hook)

**Step 1: Add `viewCount` and `type` fields to ForumThreads**

In `src/collections/ForumThreads.ts`, add after the `isLocked` field (around line 59):

```typescript
{
  name: "viewCount",
  type: "number",
  defaultValue: 0,
  admin: { readOnly: true },
},
```

Also add a `content` field upgrade — change from `textarea` to `richText` for Lexical support:

```typescript
{
  name: "content",
  type: "richText",
  required: true,
  editor: lexicalEditor(),
},
```

Import `lexicalEditor` from `@payloadcms/richtext-lexical` at the top.

> Note: The existing `category` field already has the same values as the planned `type` field (general, question, showcase, job). Keep it as `category` — no rename needed.

**Step 2: Add `authorRole` field to ForumReplies**

In `src/collections/ForumReplies.ts`, add after the `authorName` field:

```typescript
{
  name: "authorRole",
  type: "select",
  options: [
    { label: "Admin", value: "admin" },
    { label: "Moderator", value: "moderator" },
    { label: "Contributor", value: "contributor" },
    { label: "Member", value: "member" },
  ],
  defaultValue: "member",
},
```

Also upgrade `content` from textarea to richText:

```typescript
{
  name: "content",
  type: "richText",
  required: true,
  editor: lexicalEditor(),
},
```

**Step 3: Add afterChange hook to ForumReplies for replyCount/lastActivityAt**

Add a `hooks` property to the ForumReplies collection config:

```typescript
hooks: {
  afterChange: [
    async ({ doc, operation, req }) => {
      if (operation === "create") {
        const threadId = typeof doc.thread === "object" ? doc.thread.id : doc.thread;
        const thread = await req.payload.findByID({
          collection: "forum-threads",
          id: threadId,
        });
        await req.payload.update({
          collection: "forum-threads",
          id: threadId,
          data: {
            replyCount: (thread.replyCount ?? 0) + 1,
            lastActivityAt: new Date().toISOString(),
          },
        });
      }
    },
  ],
},
```

**Step 4: Add `authorRole` to ForumThreads as well**

Add the same `authorRole` select field to ForumThreads for thread authors.

**Step 5: Verify**

Run: `npm run check`
Expected: TypeScript compiles, no errors

**Step 6: Commit**

```bash
git add src/collections/ForumThreads.ts src/collections/ForumReplies.ts
git commit -m "feat(forum): upgrade Payload collections with viewCount, authorRole, richText"
```

---

## Task 3: Add XP Constants and Activity Logging for Forum

**Files:**
- Modify: `src/lib/gamification.ts` (add forum XP constants around line 167)

**Step 1: Add forum XP constants**

In `src/lib/gamification.ts`, add to the `XP_AMOUNTS` object:

```typescript
FORUM_THREAD_CREATE: 10,
FORUM_REPLY_CREATE: 5,
FORUM_RECEIVE_REPLY: 3,
```

**Step 2: Verify**

Run: `npm run check`
Expected: No errors

**Step 3: Commit**

```bash
git add src/lib/gamification.ts
git commit -m "feat(forum): add XP constants for forum participation"
```

---

## Task 4: Upgrade tRPC Community Router — Pagination & Search

**Files:**
- Modify: `src/server/api/routers/community.ts` (upgrade getThreads, add search/sort/pagination)

**Step 1: Upgrade `getThreads` procedure**

Replace the existing `getThreads` procedure (lines ~256-281) with a paginated, searchable version:

```typescript
getThreads: publicProcedure
  .input(
    z.object({
      category: z.enum(["all", "general", "question", "showcase", "job"]).default("all"),
      search: z.string().max(200).optional(),
      sort: z.enum(["newest", "mostReplied", "trending", "lastActive"]).default("newest"),
      limit: z.number().min(1).max(50).default(20),
      page: z.number().min(1).default(1),
    }),
  )
  .query(async ({ ctx, input }) => {
    const where: Record<string, unknown> = {};

    if (input.category !== "all") {
      where.category = { equals: input.category };
    }

    if (input.search) {
      where.or = [
        { title: { like: input.search } },
        { content: { like: input.search } },
      ];
    }

    const sortMap: Record<string, string> = {
      newest: "-createdAt",
      mostReplied: "-replyCount",
      trending: "-viewCount",
      lastActive: "-lastActivityAt",
    };

    const result = await ctx.payload.find({
      collection: "forum-threads",
      where,
      sort: ["-isPinned", sortMap[input.sort] ?? "-createdAt"],
      limit: input.limit,
      page: input.page,
    });

    return {
      threads: result.docs,
      totalPages: result.totalPages,
      totalDocs: result.totalDocs,
      page: result.page,
      hasNextPage: result.hasNextPage,
    };
  }),
```

**Step 2: Add `incrementViewCount` procedure**

Add a new mutation to increment view count when a thread detail page is visited:

```typescript
incrementViewCount: publicProcedure
  .input(z.object({ threadId: z.number() }))
  .mutation(async ({ ctx, input }) => {
    const thread = await ctx.payload.findByID({
      collection: "forum-threads",
      id: input.threadId,
    });
    await ctx.payload.update({
      collection: "forum-threads",
      id: input.threadId,
      data: { viewCount: (thread.viewCount ?? 0) + 1 },
    });
    return { ok: true };
  }),
```

**Step 3: Update `createThread` to include authorRole**

In the `createThread` mutation (around line 283-329), add logic to look up the user's role and store it:

```typescript
// After fetching user info, determine role
const userRole = await getUserForumRole(ctx, session.user.id);

// In the payload.create call, add:
authorRole: userRole,
```

Add a helper function:

```typescript
async function getUserForumRole(ctx: { payload: Payload }, userId: string): Promise<string> {
  // Check if user is admin in Payload
  const payloadUsers = await ctx.payload.find({
    collection: "users",
    where: { email: { equals: userId } },
    limit: 1,
  });
  if (payloadUsers.docs.length > 0 && payloadUsers.docs[0].role === "admin") {
    return "admin";
  }
  // Default to member (can be expanded with moderator/contributor logic)
  return "member";
}
```

**Step 4: Update `addReply` to include authorRole and XP**

In the `addReply` mutation (around line 333-386), add:
- Look up authorRole before creating reply
- Award XP to the replier (FORUM_REPLY_CREATE)
- Award XP to the thread author (FORUM_RECEIVE_REPLY)

```typescript
// After rules acceptance check:
const userRole = await getUserForumRole(ctx, session.user.id);

// In the payload.create call for the reply, add:
authorRole: userRole,

// After creating reply, award XP:
const { awardXp } = await import("@/server/agent/activity");
const db = (await import("@/server/db")).db;
await awardXp(db, session.user.id, XP_AMOUNTS.FORUM_REPLY_CREATE);

// Award XP to thread author if different user:
if (thread.authorId !== session.user.id) {
  await awardXp(db, thread.authorId, XP_AMOUNTS.FORUM_RECEIVE_REPLY);
}
```

**Step 5: Update `createThread` to award XP**

Add XP award after thread creation:

```typescript
const { awardXp } = await import("@/server/agent/activity");
const db = (await import("@/server/db")).db;
await awardXp(db, session.user.id, XP_AMOUNTS.FORUM_THREAD_CREATE);
```

**Step 6: Add `getThread` procedure (single thread by slug)**

```typescript
getThread: publicProcedure
  .input(z.object({ slug: z.string() }))
  .query(async ({ ctx, input }) => {
    const result = await ctx.payload.find({
      collection: "forum-threads",
      where: { slug: { equals: input.slug } },
      limit: 1,
    });
    if (result.docs.length === 0) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Thread not found" });
    }
    return result.docs[0];
  }),
```

**Step 7: Verify**

Run: `npm run check`
Expected: TypeScript compiles, no errors

**Step 8: Commit**

```bash
git add src/server/api/routers/community.ts
git commit -m "feat(forum): add pagination, search, sort, viewCount, XP to community router"
```

---

## Task 5: Create Forum List Page

**Files:**
- Create: `src/app/[locale]/forum/page.tsx` (server component wrapper)
- Create: `src/components/forum/forum-page.tsx` (client component with thread list)
- Create: `src/components/forum/thread-card.tsx` (thread card component)
- Create: `src/components/forum/category-tabs.tsx` (category filter tabs)
- Create: `src/components/forum/role-badge.tsx` (author role badge component)

**Step 1: Create the role badge component**

File: `src/components/forum/role-badge.tsx`

```tsx
"use client";

type Role = "admin" | "moderator" | "contributor" | "member";

const roleStyles: Record<Role, string> = {
  admin: "bg-orange-100 text-orange-700",
  moderator: "bg-blue-100 text-blue-700",
  contributor: "bg-green-100 text-green-700",
  member: "bg-gray-100 text-gray-600",
};

export function RoleBadge({ role }: { role: Role }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${roleStyles[role]}`}>
      {role}
    </span>
  );
}
```

**Step 2: Create the category tabs component**

File: `src/components/forum/category-tabs.tsx`

Use the existing pattern from `threads-modal.tsx` (lines 120-147) for category tabs, but as a standalone component. Use the same category color scheme.

**Step 3: Create the thread card component**

File: `src/components/forum/thread-card.tsx`

Render a thread card with:
- Title (link to `/forum/[slug]`)
- Category badge (colored)
- Reply count + view count
- Time ago (use the `timeAgo` helper from threads-modal.tsx)
- Author name + role badge
- Pin indicator

**Step 4: Create the forum page client component**

File: `src/components/forum/forum-page.tsx`

```tsx
"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { useTranslations } from "next-intl";
// ... other imports

export function ForumPage() {
  const t = useTranslations("forum");
  const [category, setCategory] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<string>("newest");
  const [page, setPage] = useState(1);

  const { data, isLoading } = api.community.getThreads.useQuery({
    category, search: search || undefined, sort, page, limit: 20,
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Header */}
      <h1 className="text-3xl font-bold">{t("title")}</h1>
      <p className="text-muted-foreground mt-1">{t("subtitle")}</p>

      {/* Search + New Thread button */}
      {/* Category tabs */}
      {/* Sort dropdown */}
      {/* Thread list */}
      {/* Load more / pagination */}
    </div>
  );
}
```

**Step 5: Create the server page wrapper**

File: `src/app/[locale]/forum/page.tsx`

```tsx
import { ForumPage } from "@/components/forum/forum-page";
import { buildAlternates } from "@/lib/i18n";

export const metadata = {
  title: "Forum",
  description: "Ask, share, connect with the AIT community",
  alternates: buildAlternates("/forum"),
};

export default function Page() {
  return <ForumPage />;
}
```

**Step 6: Verify**

Run: `npm run check`
Expected: Compiles, no errors

Open in browser: `http://localhost:3000/en/forum`
Expected: Forum page renders with thread list, search, categories

**Step 7: Commit**

```bash
git add src/app/[locale]/forum/ src/components/forum/
git commit -m "feat(forum): create dedicated forum list page with search, sort, categories"
```

---

## Task 6: Create Thread Detail Page with Replies

**Files:**
- Create: `src/app/[locale]/forum/[slug]/page.tsx` (server page with metadata)
- Create: `src/components/forum/thread-detail.tsx` (client component)
- Create: `src/components/forum/reply-list.tsx` (reply list component)
- Create: `src/components/forum/reply-form.tsx` (reply form with rich text)

**Step 1: Create the reply list component**

File: `src/components/forum/reply-list.tsx`

Renders flat list of replies with:
- Author name + role badge
- Time ago
- Rich text content (rendered via LexicalRenderer from `src/lib/lexical.tsx`)

**Step 2: Create the reply form component**

File: `src/components/forum/reply-form.tsx`

For now, use a textarea (same as existing `thread-reply-form.tsx` pattern). We'll upgrade to rich text in Task 8.

- Uses `api.community.addReply.useMutation`
- Shows login prompt if not authenticated
- Shows locked message if thread.isLocked
- Invalidates queries on success
- Toast notification on success

**Step 3: Create the thread detail client component**

File: `src/components/forum/thread-detail.tsx`

```tsx
"use client";

export function ThreadDetail({ slug }: { slug: string }) {
  const thread = api.community.getThread.useQuery({ slug });
  const replies = api.community.getReplies.useQuery(
    { threadId: thread.data?.id ?? 0 },
    { enabled: !!thread.data },
  );
  const incrementView = api.community.incrementViewCount.useMutation();

  // Increment view count on mount (once)
  useEffect(() => {
    if (thread.data?.id) {
      incrementView.mutate({ threadId: thread.data.id });
    }
  }, [thread.data?.id]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Back to Forum link */}
      {/* Thread header: title, category, date, author + badge */}
      {/* Thread content (LexicalRenderer or plain text) */}
      {/* Separator */}
      {/* Reply list */}
      {/* Reply form */}
    </div>
  );
}
```

**Step 4: Create the server page**

File: `src/app/[locale]/forum/[slug]/page.tsx`

```tsx
import { getPayload } from "@/server/payload";
import { ThreadDetail } from "@/components/forum/thread-detail";
import { notFound } from "next/navigation";
import { buildAlternates } from "@/lib/i18n";

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const payload = await getPayload();
  const result = await payload.find({
    collection: "forum-threads",
    where: { slug: { equals: params.slug } },
    limit: 1,
  });
  const thread = result.docs[0];
  if (!thread) return {};
  return {
    title: thread.title,
    description: `${thread.title} — AIT Forum`,
    alternates: buildAlternates(`/forum/${thread.slug}`),
  };
}

export default async function Page({ params }: { params: { slug: string } }) {
  const payload = await getPayload();
  const result = await payload.find({
    collection: "forum-threads",
    where: { slug: { equals: params.slug } },
    limit: 1,
  });
  if (result.docs.length === 0) notFound();
  return <ThreadDetail slug={params.slug} />;
}
```

**Step 5: Add redirect from old community thread URLs**

Create `src/app/[locale]/community/[slug]/page.tsx` redirect (or update existing) to redirect to `/forum/[slug]`:

```tsx
import { redirect } from "next/navigation";

export default function Page({ params }: { params: { slug: string; locale: string } }) {
  redirect(`/${params.locale}/forum/${params.slug}`);
}
```

**Step 6: Verify**

Run: `npm run check`
Expected: Compiles

Open in browser: Navigate to a thread
Expected: Thread detail with replies and reply form

**Step 7: Commit**

```bash
git add src/app/[locale]/forum/[slug]/ src/components/forum/thread-detail.tsx src/components/forum/reply-list.tsx src/components/forum/reply-form.tsx src/app/[locale]/community/[slug]/page.tsx
git commit -m "feat(forum): create thread detail page with replies and reply form"
```

---

## Task 7: Create New Thread Page

**Files:**
- Create: `src/app/[locale]/forum/new/page.tsx`
- Create: `src/components/forum/create-thread-form.tsx`

**Step 1: Create the thread creation form**

File: `src/components/forum/create-thread-form.tsx`

Based on the create form pattern in `threads-modal.tsx` (lines 155-227), build a standalone form with:
- Title input
- Category select
- Content textarea (upgrade to rich text in Task 8)
- Submit button
- Rules acceptance error handling
- Redirect to `/forum/[slug]` on success

**Step 2: Create the page**

File: `src/app/[locale]/forum/new/page.tsx`

```tsx
import { CreateThreadForm } from "@/components/forum/create-thread-form";

export const metadata = {
  title: "New Thread — Forum",
};

export default function Page() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <CreateThreadForm />
    </div>
  );
}
```

**Step 3: Verify**

Run: `npm run check`
Open: `/en/forum/new`
Expected: Thread creation form renders and submits successfully

**Step 4: Commit**

```bash
git add src/app/[locale]/forum/new/ src/components/forum/create-thread-form.tsx
git commit -m "feat(forum): add create new thread page"
```

---

## Task 8: Add Rich Text Editor to Thread/Reply Forms

**Files:**
- Create: `src/components/forum/rich-text-editor.tsx` (reusable Lexical editor wrapper)
- Modify: `src/components/forum/create-thread-form.tsx` (swap textarea for editor)
- Modify: `src/components/forum/reply-form.tsx` (swap textarea for editor)

**Step 1: Create the rich text editor component**

File: `src/components/forum/rich-text-editor.tsx`

Use Payload's `@payloadcms/richtext-lexical/client` components or a lightweight alternative. Check how Payload's Lexical editor is configured in `src/payload.config.ts` (line 90) and the Articles collection (`src/collections/Articles.ts` lines 144-155) for the pattern.

The editor should support:
- Bold, italic, strikethrough
- Links
- Code blocks (inline + fenced)
- Bullet/numbered lists
- Markdown shortcuts
- Output in Lexical JSON format (compatible with `LexicalRenderer` in `src/lib/lexical.tsx`)

> Note: If integrating Payload's Lexical client-side is too complex, use a simpler approach: keep the textarea but render the stored content as Markdown using a markdown-to-HTML renderer. This is a pragmatic fallback.

**Step 2: Integrate editor into create-thread-form**

Replace the content `<textarea>` with the `<RichTextEditor>` component.

**Step 3: Integrate editor into reply-form**

Replace the reply `<textarea>` with the `<RichTextEditor>` component (smaller height).

**Step 4: Update LexicalRenderer usage in reply-list and thread-detail**

Ensure thread content and reply content are rendered via `LexicalRenderer` from `src/lib/lexical.tsx` (line 283) when the content is in Lexical JSON format, or fall back to plain text rendering for legacy content.

**Step 5: Verify**

Run: `npm run check`
Test in browser: Create a thread with bold text and code blocks, verify it renders correctly on detail page

**Step 6: Commit**

```bash
git add src/components/forum/rich-text-editor.tsx src/components/forum/create-thread-form.tsx src/components/forum/reply-form.tsx
git commit -m "feat(forum): add rich text editor for threads and replies"
```

---

## Task 9: Update Navigation

**Files:**
- Modify: `src/components/navbar.tsx` (add [F] FORUM link, around line 18-26)

**Step 1: Add Forum to nav links array**

In `src/components/navbar.tsx`, find the `navLinks` array (lines 18-26) and add:

```typescript
{ href: "/forum", label: "[F] FORUM", shortcut: "f" },
```

Insert it between `[B] BLOG` and `[C] COMMUNITY`.

**Step 2: Add keyboard shortcut handler**

In the keyboard shortcut handler (lines 35-69), add the `f` key mapping for `/forum`.

**Step 3: Verify**

Run: `npm run check`
Open browser: Check nav bar shows [F] FORUM, click navigates to `/en/forum`
Test keyboard shortcut: Press `f` → navigates to forum

**Step 4: Commit**

```bash
git add src/components/navbar.tsx
git commit -m "feat(forum): add Forum to main navigation with keyboard shortcut"
```

---

## Task 10: Update Community Board Hotspot

**Files:**
- Modify: `src/components/community/community-board.tsx` (update threads hotspot)

**Step 1: Update the threads hotspot**

In `src/components/community/community-board.tsx`, find the hotspots configuration (lines 51-76). Change the "threads" hotspot behavior from opening a modal to navigating to `/forum`:

```tsx
// Instead of toggling the threads modal:
// toggleModal("threads")
// Navigate to the forum page:
router.push(`/${locale}/forum`);
```

Keep the ThreadsModal available if desired, or remove it to simplify.

**Step 2: Update the modal "See All" behavior**

If keeping the ThreadsModal, add a "See all threads →" link at the bottom that navigates to `/forum`.

**Step 3: Verify**

Open: `/en/community`
Click "The Forum" hotspot → navigates to `/en/forum`

**Step 4: Commit**

```bash
git add src/components/community/community-board.tsx
git commit -m "feat(forum): update community board hotspot to link to /forum"
```

---

## Task 11: Add Notification on Reply

**Files:**
- Modify: `src/server/api/routers/community.ts` (in addReply mutation)

**Step 1: Send inbox notification when someone replies to a thread**

In the `addReply` mutation, after creating the reply and awarding XP, add notification logic:

```typescript
// Notify thread author if different user
if (thread.authorId !== session.user.id) {
  const { db } = await import("@/server/db");
  // Find or create a DM conversation with the thread author
  // Send a system message like: "Someone replied to your thread: {threadTitle}"
  // Link: /forum/{thread.slug}
  // Use the existing inbox router patterns from src/server/api/routers/inbox.ts
}
```

> Note: This should use the existing conversation/message system. Check `src/server/api/routers/inbox.ts` for the `startConversation` and `sendMessage` patterns. Alternatively, create a simpler notification by directly inserting a message into the inbox.

**Step 2: Verify**

Create a reply to someone else's thread → they should see a notification in their inbox

**Step 3: Commit**

```bash
git add src/server/api/routers/community.ts
git commit -m "feat(forum): send inbox notification on thread reply"
```

---

## Task 12: Data Migration — Backfill Existing Data

**Files:**
- Create: `scripts/migrate-forum-data.ts`

**Step 1: Write migration script**

```typescript
// scripts/migrate-forum-data.ts
// Backfills new fields on existing forum data:
// 1. Set viewCount = 0 for all threads missing it
// 2. Set authorRole = "member" for all threads/replies missing it
// 3. Set lastActivityAt to updatedAt or createdAt if missing

import { getPayload } from "@/server/payload";

async function migrate() {
  const payload = await getPayload();

  // Backfill threads
  const threads = await payload.find({
    collection: "forum-threads",
    limit: 1000,
  });

  for (const thread of threads.docs) {
    const updates: Record<string, unknown> = {};
    if (thread.viewCount == null) updates.viewCount = 0;
    if (!thread.authorRole) updates.authorRole = "member";
    if (!thread.lastActivityAt) updates.lastActivityAt = thread.updatedAt ?? thread.createdAt;

    if (Object.keys(updates).length > 0) {
      await payload.update({
        collection: "forum-threads",
        id: thread.id,
        data: updates,
      });
      console.log(`Updated thread ${thread.id}: ${thread.title}`);
    }
  }

  // Backfill replies
  const replies = await payload.find({
    collection: "forum-replies",
    limit: 10000,
  });

  for (const reply of replies.docs) {
    if (!reply.authorRole) {
      await payload.update({
        collection: "forum-replies",
        id: reply.id,
        data: { authorRole: "member" },
      });
      console.log(`Updated reply ${reply.id}`);
    }
  }

  console.log("Migration complete!");
}

migrate().catch(console.error);
```

**Step 2: Run migration**

```bash
npx tsx scripts/migrate-forum-data.ts
```

Expected: All existing threads/replies updated with default values

**Step 3: Commit**

```bash
git add scripts/migrate-forum-data.ts
git commit -m "feat(forum): add data migration script for existing forum data"
```

---

## Task 13: Admin Thread Actions (Pin, Lock, Edit)

**Files:**
- Modify: `src/server/api/routers/community.ts` (add pin/lock/edit mutations)
- Modify: `src/components/forum/thread-detail.tsx` (add action buttons)

**Step 1: Add tRPC mutations for thread actions**

In `src/server/api/routers/community.ts`, add:

```typescript
pinThread: protectedProcedure
  .input(z.object({ threadId: z.number(), isPinned: z.boolean() }))
  .mutation(async ({ ctx, input }) => {
    // Verify user is admin
    await ctx.payload.update({
      collection: "forum-threads",
      id: input.threadId,
      data: { isPinned: input.isPinned },
    });
    return { ok: true };
  }),

lockThread: protectedProcedure
  .input(z.object({ threadId: z.number(), isLocked: z.boolean() }))
  .mutation(async ({ ctx, input }) => {
    // Verify user is admin
    await ctx.payload.update({
      collection: "forum-threads",
      id: input.threadId,
      data: { isLocked: input.isLocked },
    });
    return { ok: true };
  }),
```

**Step 2: Add action buttons to thread detail**

In `src/components/forum/thread-detail.tsx`, add a dropdown menu or action bar with:
- Pin/Unpin (admin only)
- Lock/Unlock (admin only)
- Edit (thread author only — navigates to edit form or inline)

**Step 3: Verify**

Log in as admin → open a thread → pin and lock buttons work

**Step 4: Commit**

```bash
git add src/server/api/routers/community.ts src/components/forum/thread-detail.tsx
git commit -m "feat(forum): add pin, lock, and edit actions for thread moderation"
```

---

## Task 14: Mobile Optimization & Polish

**Files:**
- Modify: `src/components/forum/forum-page.tsx` (responsive layout)
- Modify: `src/components/forum/thread-detail.tsx` (mobile layout)
- Modify: `src/components/forum/thread-card.tsx` (compact mobile card)
- Modify: `src/components/forum/category-tabs.tsx` (horizontal scroll on mobile)
- Modify: `src/components/forum/reply-form.tsx` (sticky bottom on mobile)

**Step 1: Make category tabs horizontally scrollable on mobile**

```tsx
<div className="flex overflow-x-auto gap-2 pb-2 scrollbar-hide">
  {/* category buttons */}
</div>
```

**Step 2: Make search collapsible on mobile**

Show a search icon that expands into the full search bar on tap.

**Step 3: Sticky reply form on mobile**

```tsx
<div className="sticky bottom-0 bg-background border-t p-4 md:static md:border-0 md:p-0">
  <ReplyForm />
</div>
```

**Step 4: Responsive thread card**

Ensure thread cards stack properly on small screens. Hide view count on mobile, show compact time format.

**Step 5: Verify**

Open in mobile viewport (Chrome DevTools 375px width):
- Forum list: scrollable categories, readable cards, accessible search
- Thread detail: readable content, sticky reply form at bottom

**Step 6: Commit**

```bash
git add src/components/forum/
git commit -m "feat(forum): optimize mobile layout and responsiveness"
```

---

## Task 15: Final Verification & Cleanup

**Step 1: Run full check**

```bash
npm run check
```

Expected: No TypeScript errors, no lint errors

**Step 2: Build**

```bash
npm run build
```

Expected: Successful build, no errors

**Step 3: Manual E2E Testing Checklist**

- [ ] Navigate to `/en/forum` — thread list loads with categories, search, sort
- [ ] Create a new thread from `/en/forum/new` — redirects to detail page
- [ ] Reply to a thread — reply appears in list
- [ ] Search threads — results filter correctly
- [ ] Sort by different options — order changes
- [ ] Category filter works
- [ ] Pinned threads appear at top
- [ ] Author badges display correctly
- [ ] Mobile layout works (test at 375px viewport)
- [ ] Keyboard shortcut `f` navigates to forum
- [ ] Community board hotspot links to forum
- [ ] Old `/community/[slug]` URLs redirect to `/forum/[slug]`
- [ ] Rich text renders correctly (bold, code, links)
- [ ] Thread lock prevents new replies
- [ ] XP awarded for thread creation and replies
- [ ] Inbox notification received on reply
- [ ] NL locale works (`/nl/forum`)

**Step 4: Commit any final fixes**

```bash
git add -A
git commit -m "fix(forum): final polish and cleanup"
```
