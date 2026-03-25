# Blog Comments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an authenticated comment system to blog articles with one-level threading, self-delete + admin delete, and +5 XP rewards.

**Architecture:** Payload CMS collection for storage, tRPC router for CRUD operations, React client component for interactive UI. Comments are fetched server-side for initial render, then managed client-side via tRPC mutations with React Query invalidation.

**Tech Stack:** Next.js 15 (RSC + client components), Payload CMS, tRPC, React Query, better-auth, next-intl, sonner (toasts)

**Spec:** `docs/superpowers/specs/2026-03-25-blog-comments-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/collections/Comments.ts` | Create | Payload CMS collection definition |
| `src/payload.config.ts` | Modify | Register Comments collection |
| `src/lib/gamification.ts` | Modify | Add ARTICLE_COMMENT_CREATE XP constant |
| `src/server/api/routers/comments.ts` | Create | tRPC router: list, create, delete |
| `src/server/api/root.ts` | Modify | Register commentsRouter |
| `src/components/blog/article-comments.tsx` | Create | Client component: comment UI |
| `src/app/[locale]/blog/[slug]/page.tsx` | Modify | Fetch comments, render section, comment count |
| `messages/en.json` | Modify | Add 14 comment i18n keys |
| `messages/nl.json` | Modify | Add 14 comment i18n keys |

---

### Task 1: Payload CMS Comments collection + XP constant + i18n keys

**Files:**
- Create: `src/collections/Comments.ts`
- Modify: `src/payload.config.ts`
- Modify: `src/lib/gamification.ts`
- Modify: `messages/en.json`
- Modify: `messages/nl.json`

- [ ] **Step 1: Create the Comments collection**

Create `src/collections/Comments.ts`:

```ts
import type { CollectionConfig } from "payload";

export const Comments: CollectionConfig = {
  slug: "comments",
  admin: {
    useAsTitle: "content",
    defaultColumns: ["content", "articleId", "authorName", "createdAt"],
  },
  access: {
    read: () => true,
  },
  fields: [
    { name: "articleId", type: "number", required: true, index: true },
    { name: "parentId", type: "number", index: true },
    {
      name: "content",
      type: "textarea",
      required: true,
      maxLength: 5000,
    },
    { name: "authorId", type: "text", required: true, index: true },
    { name: "authorName", type: "text" },
  ],
};
```

- [ ] **Step 2: Register in Payload config**

In `src/payload.config.ts`, add the import after the existing collection imports (after line 25):

```ts
import { Comments } from "./collections/Comments";
```

Add `Comments` to the `collections` array (after `LaunchpadProjects`, before `Challenges`):

```ts
    Comments,
```

- [ ] **Step 3: Add XP constant**

In `src/lib/gamification.ts`, inside the `XP_AMOUNTS` object, add after the existing constants:

```ts
  ARTICLE_COMMENT_CREATE: 5,
```

- [ ] **Step 4: Add all i18n keys**

In `messages/en.json`, inside the `"blog"` object after the `"related"` section, add:

```json
    "comments": {
      "title": "COMMENTS",
      "signIn": "Sign in to comment",
      "placeholder": "Write a comment...",
      "replyPlaceholder": "Write a reply...",
      "submit": "POST",
      "reply": "REPLY",
      "delete": "Delete",
      "deleteConfirm": "Are you sure?",
      "cancel": "CANCEL",
      "count": "{count, plural, one {# COMMENT} other {# COMMENTS}}",
      "empty": "No comments yet. Be the first!",
      "toast": {
        "posted": "Comment posted!",
        "deleted": "Comment deleted.",
        "error": "Something went wrong.",
        "rulesRequired": "You must accept the community rules first."
      }
    }
```

In `messages/nl.json`, inside the `"blog"` object after the `"related"` section, add:

```json
    "comments": {
      "title": "REACTIES",
      "signIn": "Log in om te reageren",
      "placeholder": "Schrijf een reactie...",
      "replyPlaceholder": "Schrijf een antwoord...",
      "submit": "PLAATSEN",
      "reply": "REAGEREN",
      "delete": "Verwijderen",
      "deleteConfirm": "Weet je het zeker?",
      "cancel": "ANNULEREN",
      "count": "{count, plural, one {# REACTIE} other {# REACTIES}}",
      "empty": "Nog geen reacties. Wees de eerste!",
      "toast": {
        "posted": "Reactie geplaatst!",
        "deleted": "Reactie verwijderd.",
        "error": "Er ging iets mis.",
        "rulesRequired": "Je moet eerst de communityregels accepteren."
      }
    }
```

- [ ] **Step 5: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/collections/Comments.ts src/payload.config.ts src/lib/gamification.ts messages/en.json messages/nl.json
git commit -m "feat(blog): add Comments collection, XP constant, and i18n keys"
```

---

### Task 2: Generate Payload types and run migration

**Files:**
- Modify: `src/payload-types.ts` (auto-generated)

- [ ] **Step 1: Generate Payload types**

Run: `npx payload generate:types`
Expected: `src/payload-types.ts` is updated with the new `Comment` type.

If `generate:types` is not available, run: `pnpm build` which triggers type generation. Alternatively, the types will generate on next dev server start.

- [ ] **Step 2: Push database schema**

Run: `pnpm db:push`
Expected: Payload creates the `comments` table in the database.

If running locally without a database, skip this step — the table will be created on first dev server start via Payload's auto-migration.

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/payload-types.ts
git commit -m "chore: regenerate Payload types for Comments collection"
```

Note: If `payload-types.ts` hasn't changed (e.g., types generated on build), skip this commit.

---

### Task 3: tRPC comments router

**Files:**
- Create: `src/server/api/routers/comments.ts`
- Modify: `src/server/api/root.ts`

- [ ] **Step 1: Create the comments router**

Create `src/server/api/routers/comments.ts`:

```ts
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "@/server/api/trpc";
import { getPayloadClient } from "@/server/payload";
import { logActivity } from "@/server/agent/activity";
import { awardXp, XP_AMOUNTS } from "@/lib/gamification";

async function requireRulesAcceptance(userId: string) {
  const payload = await getPayloadClient();
  const rules = await payload.findGlobal({ slug: "community-rules" });

  if (!rules.version) return;

  const { docs } = await payload.find({
    collection: "rules-acceptance",
    where: {
      and: [
        { userId: { equals: userId } },
        { rulesVersion: { equals: rules.version } },
      ],
    },
    limit: 1,
    depth: 0,
  });

  if (docs.length === 0) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "RULES_NOT_ACCEPTED",
    });
  }
}

export const commentsRouter = createTRPCRouter({
  // ── List comments for an article ──────────────────────────────────────────

  list: publicProcedure
    .input(z.object({ articleId: z.number() }))
    .query(async ({ input }) => {
      const payload = await getPayloadClient();
      const { docs } = await payload.find({
        collection: "comments",
        where: { articleId: { equals: input.articleId } },
        sort: "createdAt",
        limit: 100,
        depth: 0,
      });

      return docs.map((doc) => ({
        id: doc.id,
        content: doc.content,
        parentId: doc.parentId ?? null,
        createdAt: doc.createdAt,
        authorId: doc.authorId,
        authorName: doc.authorName ?? null,
      }));
    }),

  // ── Create a comment ──────────────────────────────────────────────────────

  create: protectedProcedure
    .input(
      z.object({
        articleId: z.number(),
        content: z.string().min(1).max(5000),
        parentId: z.number().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireRulesAcceptance(ctx.session.user.id);

      const payload = await getPayloadClient();

      // Validate article exists and is published
      const article = await payload.findByID({
        collection: "articles",
        id: input.articleId,
        depth: 0,
      });

      if (article.status !== "published") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot comment on unpublished articles",
        });
      }

      // Validate parentId if provided (one-level threading)
      if (input.parentId !== undefined) {
        const parent = await payload.findByID({
          collection: "comments",
          id: input.parentId,
          depth: 0,
        });

        if (parent.articleId !== input.articleId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Parent comment belongs to a different article",
          });
        }

        if (parent.parentId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot reply to a reply",
          });
        }
      }

      const comment = await payload.create({
        collection: "comments",
        data: {
          articleId: input.articleId,
          content: input.content,
          parentId: input.parentId ?? null,
          authorId: ctx.session.user.id,
          authorName: ctx.session.user.name ?? null,
        },
      });

      // Award XP
      await awardXp(ctx.db, ctx.session.user.id, XP_AMOUNTS.ARTICLE_COMMENT_CREATE);

      // Log activity
      await logActivity(ctx.db, {
        actorId: ctx.session.user.id,
        actorType: "member",
        action: "comment.created",
        targetType: "articles",
        targetId: String(input.articleId),
        metadata: { articleTitle: article.title },
      });

      return {
        id: comment.id,
        content: comment.content,
        parentId: comment.parentId ?? null,
        createdAt: comment.createdAt,
        authorId: comment.authorId,
        authorName: comment.authorName ?? null,
      };
    }),

  // ── Delete a comment ──────────────────────────────────────────────────────

  delete: protectedProcedure
    .input(z.object({ commentId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();

      const comment = await payload.findByID({
        collection: "comments",
        id: input.commentId,
        depth: 0,
      });

      // Check authorization: comment author or Payload admin
      const isCommentAuthor = comment.authorId === ctx.session.user.id;
      let isAdmin = false;
      try {
        const { docs } = await payload.find({
          collection: "users",
          where: { email: { equals: ctx.session.user.email } },
          limit: 1,
          depth: 0,
        });
        isAdmin = docs[0]?.role === "admin";
      } catch {
        // Not a Payload user — not admin
      }

      if (!isCommentAuthor && !isAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized" });
      }

      // If top-level comment, cascade delete replies
      if (!comment.parentId) {
        await payload.delete({
          collection: "comments",
          where: { parentId: { equals: input.commentId } },
        });
      }

      await payload.delete({
        collection: "comments",
        id: input.commentId,
      });

      return { success: true };
    }),
});
```

- [ ] **Step 2: Register in root router**

In `src/server/api/root.ts`, add the import:

```ts
import { commentsRouter } from "@/server/api/routers/comments";
```

Add to the `createTRPCRouter` object:

```ts
  comments: commentsRouter,
```

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/server/api/routers/comments.ts src/server/api/root.ts
git commit -m "feat(blog): add tRPC comments router with list, create, delete"
```

---

### Task 4: Article comments client component

**Files:**
- Create: `src/components/blog/article-comments.tsx`

- [ ] **Step 1: Create the client component**

Create `src/components/blog/article-comments.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { toast } from "sonner";
import { Trash2, CornerDownRight } from "lucide-react";
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar";
import { Link } from "@/i18n/navigation";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(date: string | Date | null | undefined): string {
  if (!date) return "";
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Comment = {
  id: number;
  content: string;
  parentId: number | null;
  createdAt: string;
  authorId: string;
  authorName: string | null;
};

type ArticleCommentsProps = {
  articleId: number;
  initialComments: Comment[];
  currentUserId?: string;
};

// ---------------------------------------------------------------------------
// CommentForm
// ---------------------------------------------------------------------------

function CommentForm({
  articleId,
  parentId,
  placeholder,
  onSuccess,
  onCancel,
}: {
  articleId: number;
  parentId?: number;
  placeholder: string;
  onSuccess: () => void;
  onCancel?: () => void;
}) {
  const t = useTranslations("blog.comments");
  const [content, setContent] = useState("");
  const utils = api.useUtils();

  const createMutation = api.comments.create.useMutation({
    onSuccess: () => {
      setContent("");
      void utils.comments.list.invalidate({ articleId });
      toast.success(t("toast.posted"));
      onSuccess();
    },
    onError: (err) => {
      if (err.message === "RULES_NOT_ACCEPTED") {
        toast.error(t("toast.rulesRequired"));
        return;
      }
      toast.error(t("toast.error"));
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!content.trim()) return;
        createMutation.mutate({
          articleId,
          content: content.trim(),
          parentId,
        });
      }}
      className="space-y-2"
    >
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={placeholder}
        maxLength={5000}
        rows={parentId ? 2 : 3}
        required
        className="border-border bg-transparent text-foreground placeholder:text-muted-foreground w-full resize-none rounded border px-3 py-2 font-mono text-sm outline-none focus:ring-1 focus:ring-current"
      />
      <div className="flex justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-muted-foreground hover:text-foreground rounded border border-transparent px-2 py-1 font-mono text-[10px] tracking-wider transition-colors"
          >
            {t("cancel")}
          </button>
        )}
        <button
          type="submit"
          disabled={createMutation.isPending || !content.trim()}
          className="bg-foreground text-background hover:bg-foreground/90 rounded px-3 py-1 font-mono text-[10px] tracking-wider transition-colors disabled:opacity-50"
        >
          {createMutation.isPending ? "..." : t("submit")}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// CommentItem
// ---------------------------------------------------------------------------

function CommentItem({
  comment,
  replies,
  articleId,
  currentUserId,
}: {
  comment: Comment;
  replies: Comment[];
  articleId: number;
  currentUserId?: string;
}) {
  const t = useTranslations("blog.comments");
  const [showReplyForm, setShowReplyForm] = useState(false);
  const utils = api.useUtils();

  const deleteMutation = api.comments.delete.useMutation({
    onSuccess: () => {
      void utils.comments.list.invalidate({ articleId });
      toast.success(t("toast.deleted"));
    },
    onError: () => {
      toast.error(t("toast.error"));
    },
  });

  const isOwn = currentUserId === comment.authorId;

  return (
    <div className="space-y-2">
      {/* Comment */}
      <div className="border-border rounded border p-3">
        {/* Author row */}
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Avatar size="sm">
              <AvatarFallback className="bg-muted text-muted-foreground font-mono text-[9px]">
                {getInitials(comment.authorName)}
              </AvatarFallback>
            </Avatar>
            <span className="text-muted-foreground font-mono text-[10px] font-semibold tracking-wider">
              {comment.authorName ?? "member"}
            </span>
            <span className="text-muted-foreground/50 font-mono text-[10px]">
              &middot;
            </span>
            <span className="text-muted-foreground/50 font-mono text-[10px]">
              {timeAgo(comment.createdAt)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {currentUserId && (
              <button
                onClick={() => setShowReplyForm((v) => !v)}
                className="text-muted-foreground hover:text-foreground flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[9px] tracking-wider transition-colors"
              >
                <CornerDownRight className="h-2.5 w-2.5" />
                {t("reply")}
              </button>
            )}
            {isOwn && (
              <button
                onClick={() => {
                  if (window.confirm(t("deleteConfirm"))) {
                    deleteMutation.mutate({ commentId: comment.id });
                  }
                }}
                disabled={deleteMutation.isPending}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[9px] tracking-wider text-red-400 transition-colors hover:text-red-600 disabled:opacity-50"
              >
                <Trash2 className="h-2.5 w-2.5" />
                {t("delete")}
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <p className="text-foreground text-sm leading-relaxed">
          {comment.content}
        </p>
      </div>

      {/* Inline reply form */}
      {showReplyForm && currentUserId && (
        <div className="border-border ml-8 border-l-2 pl-4">
          <CommentForm
            articleId={articleId}
            parentId={comment.id}
            placeholder={t("replyPlaceholder")}
            onSuccess={() => setShowReplyForm(false)}
            onCancel={() => {
              setShowReplyForm(false);
            }}
          />
        </div>
      )}

      {/* Nested replies */}
      {replies.length > 0 && (
        <div className="border-border ml-8 space-y-2 border-l-2 pl-4">
          {replies.map((reply) => (
            <div key={reply.id} className="border-border rounded border p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Avatar size="sm">
                    <AvatarFallback className="bg-muted text-muted-foreground font-mono text-[9px]">
                      {getInitials(reply.authorName)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-muted-foreground font-mono text-[10px] font-semibold tracking-wider">
                    {reply.authorName ?? "member"}
                  </span>
                  <span className="text-muted-foreground/50 font-mono text-[10px]">
                    &middot;
                  </span>
                  <span className="text-muted-foreground/50 font-mono text-[10px]">
                    {timeAgo(reply.createdAt)}
                  </span>
                </div>
                {currentUserId === reply.authorId && (
                  <button
                    onClick={() => {
                      if (window.confirm(t("deleteConfirm"))) {
                        deleteMutation.mutate({ commentId: reply.id });
                      }
                    }}
                    disabled={deleteMutation.isPending}
                    className="flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[9px] tracking-wider text-red-400 transition-colors hover:text-red-600 disabled:opacity-50"
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                    {t("delete")}
                  </button>
                )}
              </div>
              <p className="text-foreground text-sm leading-relaxed">
                {reply.content}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ArticleComments (exported)
// ---------------------------------------------------------------------------

export function ArticleComments({
  articleId,
  initialComments,
  currentUserId,
}: ArticleCommentsProps) {
  const t = useTranslations("blog.comments");
  const { data: session } = authClient.useSession();

  const { data: comments } = api.comments.list.useQuery(
    { articleId },
    { initialData: initialComments },
  );

  // Build threaded structure
  const topLevel = (comments ?? []).filter((c) => c.parentId === null);
  const repliesMap = new Map<number, Comment[]>();
  for (const c of comments ?? []) {
    if (c.parentId) {
      const existing = repliesMap.get(c.parentId) ?? [];
      existing.push(c);
      repliesMap.set(c.parentId, existing);
    }
  }

  const isSignedIn = !!session?.user;

  return (
    <div className="mt-8 space-y-4">
      {/* Section header */}
      <h2 className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
        / {t("title")}
      </h2>

      {/* New comment form or sign-in prompt */}
      {isSignedIn ? (
        <CommentForm
          articleId={articleId}
          placeholder={t("placeholder")}
          onSuccess={() => {}}
        />
      ) : (
        <p className="text-muted-foreground font-mono text-xs">
          <Link href="/sign-in" className="hover:text-foreground underline transition-colors">
            {t("signIn")}
          </Link>
        </p>
      )}

      {/* Comments list */}
      {topLevel.length === 0 ? (
        <p className="text-muted-foreground py-4 text-center font-mono text-xs">
          {t("empty")}
        </p>
      ) : (
        <div className="space-y-4">
          {topLevel.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              replies={repliesMap.get(comment.id) ?? []}
              articleId={articleId}
              currentUserId={currentUserId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors. If the `Avatar` component's `size` prop doesn't accept `"sm"`, check `src/components/ui/avatar.tsx` for the correct prop API and adjust.

- [ ] **Step 3: Commit**

```bash
git add src/components/blog/article-comments.tsx
git commit -m "feat(blog): add article comments client component"
```

---

### Task 5: Integrate comments into article detail page

**Files:**
- Modify: `src/app/[locale]/blog/[slug]/page.tsx`

- [ ] **Step 1: Add imports**

Add at the top of `src/app/[locale]/blog/[slug]/page.tsx`:

```ts
import { getSession } from "@/server/better-auth/server";
import { ArticleComments } from "@/components/blog/article-comments";
```

- [ ] **Step 2: Fetch comments and session**

Inside the `ArticleDetailPage` component, after the related articles logic (after the `relatedArticles = [...]` block) and before the `return` statement, add:

```ts
  // Fetch comments
  const { docs: comments, totalDocs: commentCount } = await payload.find({
    collection: "comments",
    where: { articleId: { equals: article.id } },
    sort: "createdAt",
    limit: 100,
    depth: 0,
  });

  // Get session for current user
  const session = await getSession();
```

Note: The `payload` variable was already created earlier in the component (for related articles query). Reuse it here.

- [ ] **Step 3: Add comment count to meta line**

In the meta line section (the `<div>` with `text-muted-foreground mt-6 flex flex-wrap items-center gap-3`), after the author name block (after the closing `</>` of the author conditional), add:

```tsx
        <span className="text-border">|</span>
        <span>{t("comments.count", { count: commentCount })}</span>
```

- [ ] **Step 4: Render ArticleComments section**

After the related articles section's closing `</div>` (or after the sharing section if no related articles exist), before the page's final closing `</div>`, add:

```tsx
      {/* Comments */}
      <ArticleComments
        articleId={article.id}
        initialComments={comments.map((doc) => ({
          id: doc.id,
          content: doc.content,
          parentId: doc.parentId ?? null,
          createdAt: doc.createdAt,
          authorId: doc.authorId,
          authorName: doc.authorName ?? null,
        }))}
        currentUserId={session?.user?.id}
      />
```

- [ ] **Step 5: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/[locale]/blog/[slug]/page.tsx
git commit -m "feat(blog): integrate comments section into article detail page"
```

---

### Task 6: Final verification

- [ ] **Step 1: Run full typecheck**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS.

- [ ] **Step 3: Run linter**

Run: `npx next lint`
Expected: No errors (or only pre-existing warnings).

- [ ] **Step 4: Visual smoke test checklist**

Start the dev server (`pnpm dev`) and manually verify:

1. `/en/blog/[slug]` — comment section visible below related articles
2. `/en/blog/[slug]` — "COMMENTS" header with count in meta line
3. Not signed in: "Sign in to comment" link shown, no comment form
4. Signed in: comment form with textarea visible
5. Post a comment — toast success, comment appears in list
6. Reply to a comment — reply form appears indented, reply posts correctly
7. Try to reply to a reply — should be rejected (one-level threading)
8. Delete own comment — confirm dialog, then removed with toast
9. Delete top-level comment with replies — replies also deleted
10. Comment count in meta line updates after posting
11. `/admin` — Comments collection visible, comments manageable
