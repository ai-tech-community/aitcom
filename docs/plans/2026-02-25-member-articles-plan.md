# Member Article Writing — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow members to write and publish articles via a built-in Lexical editor, with trusted-author direct publishing and admin review for new writers.

**Architecture:** tRPC mutations call Payload's Local API to CRUD articles in the existing Articles collection. A Lexical editor component is embedded in the app for writing. Trusted authors (level 5+ with `article_author` badge) publish directly; others go through admin review. Gamification awards XP and badges.

**Tech Stack:** Payload CMS (Local API), Lexical rich text editor (`@payloadcms/richtext-lexical`), tRPC, Drizzle ORM, Next.js App Router, next-intl

**Design Doc:** `docs/plans/2026-02-25-member-articles-design.md`

---

## Task 1: Add New Fields to Articles Collection

**Files:**
- Modify: `src/collections/Articles.ts`

**Step 1: Add author and review fields to the Articles collection**

Add these fields after the existing `mediaUrl` field in `src/collections/Articles.ts`:

```typescript
{ name: "authorId", type: "text", admin: { position: "sidebar" } },
{ name: "authorName", type: "text", admin: { position: "sidebar" } },
{
  name: "authorType",
  type: "select",
  defaultValue: "admin",
  options: [
    { label: "Admin", value: "admin" },
    { label: "Member", value: "member" },
  ],
  admin: { position: "sidebar" },
},
{
  name: "reviewStatus",
  type: "select",
  options: [
    { label: "Pending Review", value: "pending_review" },
    { label: "Approved", value: "approved" },
    { label: "Rejected", value: "rejected" },
    { label: "Changes Requested", value: "changes_requested" },
  ],
  admin: { position: "sidebar" },
},
{ name: "reviewNote", type: "textarea", admin: { position: "sidebar" } },
```

Also update `defaultColumns` in admin config:

```typescript
admin: {
  useAsTitle: "title",
  defaultColumns: ["title", "type", "status", "authorType", "reviewStatus", "publishedAt"],
},
```

**Step 2: Run the dev server to verify Payload picks up the new fields**

Run: `npm run dev`
Expected: No errors. Payload admin at `/admin` shows new sidebar fields on Articles.

**Step 3: Commit**

```bash
git add src/collections/Articles.ts
git commit -m "feat(articles): add author and review fields to Articles collection"
```

---

## Task 2: Add Gamification Constants — XP, Badges, Trusted Author Check

**Files:**
- Modify: `src/lib/gamification.ts`

**Step 1: Add article badges to BADGES record**

Add after the `streak_10` badge entry in `src/lib/gamification.ts`:

```typescript
article_author: {
  slug: "article_author",
  name: "Article Author",
  description: "Had your first article approved and published",
  icon: "✍️",
},
prolific_writer: {
  slug: "prolific_writer",
  name: "Prolific Writer",
  description: "Published 5 articles",
  icon: "📚",
},
tutorial_creator: {
  slug: "tutorial_creator",
  name: "Tutorial Creator",
  description: "Published your first tutorial",
  icon: "🎓",
},
```

**Step 2: Add XP amounts for article actions**

Add to the `XP_AMOUNTS` object:

```typescript
ARTICLE_SUBMITTED: 10,
ARTICLE_PUBLISHED: 50,
```

**Step 3: Add `isTrustedAuthor` helper function**

Add after the `isProfileComplete` function:

```typescript
/**
 * Check if a member qualifies as a trusted author.
 * Requires level 5+ (800 XP) AND the article_author badge.
 */
export function isTrustedAuthor(
  xp: number,
  badges: { badgeSlug: string }[],
): boolean {
  const level = calculateLevel(xp);
  const hasAuthorBadge = badges.some((b) => b.badgeSlug === "article_author");
  return level >= 5 && hasAuthorBadge;
}
```

**Step 4: Add `checkArticleBadges` helper function**

Add after `isTrustedAuthor`:

```typescript
/**
 * Check and award article-related badges based on published count and type.
 */
export async function checkArticleBadges(
  db: DB,
  userId: string,
  publishedCount: number,
  articleType: string,
) {
  // First published article
  if (publishedCount >= 1) {
    await awardBadge(db, userId, "article_author");
  }
  // 5 published articles
  if (publishedCount >= 5) {
    await awardBadge(db, userId, "prolific_writer");
  }
  // First tutorial
  if (articleType === "tutorial") {
    await awardBadge(db, userId, "tutorial_creator");
  }
}
```

**Step 5: Commit**

```bash
git add src/lib/gamification.ts
git commit -m "feat(gamification): add article badges, XP amounts, and trusted author check"
```

---

## Task 3: Create the Articles tRPC Router

**Files:**
- Create: `src/server/api/routers/articles.ts`
- Modify: `src/server/api/root.ts`

**Step 1: Create the articles router**

Create `src/server/api/routers/articles.ts`. Follow the patterns from `community.ts`:

```typescript
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
} from "@/server/api/trpc";
import { getPayloadClient } from "@/server/payload";
import { logActivity } from "@/server/agent/activity";
import { memberProfiles, memberBadges } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import {
  isTrustedAuthor,
  awardXp,
  checkArticleBadges,
  XP_AMOUNTS,
} from "@/lib/gamification";

export const articlesRouter = createTRPCRouter({
  // ── My Articles ─────────────────────────────────────────────────────────────

  myArticles: protectedProcedure.query(async ({ ctx }) => {
    const payload = await getPayloadClient();
    const { docs } = await payload.find({
      collection: "articles",
      where: { authorId: { equals: ctx.session.user.id } },
      sort: "-updatedAt",
      limit: 50,
      depth: 0,
      draft: true,
    });
    return docs;
  }),

  // ── Get Single (for editing) ────────────────────────────────────────────────

  getBySlug: protectedProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const payload = await getPayloadClient();
      const { docs } = await payload.find({
        collection: "articles",
        where: { slug: { equals: input.slug } },
        limit: 1,
        depth: 0,
        draft: true,
      });

      const article = docs[0];
      if (!article) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Article not found" });
      }
      if (article.authorId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not your article" });
      }

      return article;
    }),

  // ── Create Draft ────────────────────────────────────────────────────────────

  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(3).max(255),
        slug: z.string().min(3).max(100),
        content: z.any(), // Lexical JSON state
        type: z.enum(["article", "tutorial"]),
        tags: z.array(z.object({ tag: z.string() })).optional(),
        mediaUrl: z.string().url().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();
      const userName = ctx.session.user.name ?? "member";

      // Generate unique slug
      const baseSlug = input.slug
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80);
      const slug = `${baseSlug}-${Date.now()}`;

      const article = await payload.create({
        collection: "articles",
        data: {
          title: input.title,
          slug,
          content: input.content,
          type: input.type,
          tags: input.tags ?? [],
          mediaUrl: input.mediaUrl ?? undefined,
          status: "draft",
          authorId: ctx.session.user.id,
          authorName: userName,
          authorType: "member",
        },
        draft: true,
      });

      return article;
    }),

  // ── Update Draft ────────────────────────────────────────────────────────────

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        title: z.string().min(3).max(255).optional(),
        content: z.any().optional(),
        type: z.enum(["article", "tutorial"]).optional(),
        tags: z.array(z.object({ tag: z.string() })).optional(),
        mediaUrl: z.string().url().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();

      // Verify ownership
      const existing = await payload.findByID({
        collection: "articles",
        id: input.id,
        depth: 0,
        draft: true,
      });

      if (existing.authorId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not your article" });
      }

      // Only allow editing drafts, changes_requested, or if trusted author
      const editableStatuses = ["draft", "changes_requested"];
      const profile = await ctx.db.query.memberProfiles.findFirst({
        where: eq(memberProfiles.userId, ctx.session.user.id),
      });
      const badges = await ctx.db
        .select()
        .from(memberBadges)
        .where(eq(memberBadges.userId, ctx.session.user.id));

      const trusted = profile ? isTrustedAuthor(profile.xp, badges) : false;

      if (
        existing.status === "published" &&
        !trusted
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot edit published articles. Contact an admin.",
        });
      }

      if (
        existing.status !== "published" &&
        !editableStatuses.includes(existing.reviewStatus ?? "")
        && existing.status !== "draft"
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Article is pending review and cannot be edited.",
        });
      }

      const { id, ...data } = input;

      const updated = await payload.update({
        collection: "articles",
        id,
        data: {
          ...(data.title !== undefined && { title: data.title }),
          ...(data.content !== undefined && { content: data.content }),
          ...(data.type !== undefined && { type: data.type }),
          ...(data.tags !== undefined && { tags: data.tags }),
          ...(data.mediaUrl !== undefined && { mediaUrl: data.mediaUrl ?? undefined }),
          // If editing a published article as trusted author, keep published
          // If editing a changes_requested article, reset to draft
          ...(existing.reviewStatus === "changes_requested" && {
            reviewStatus: null,
            reviewNote: null,
          }),
        },
        draft: existing.status === "draft",
      });

      return updated;
    }),

  // ── Submit for Review / Publish ─────────────────────────────────────────────

  submit: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();

      const article = await payload.findByID({
        collection: "articles",
        id: input.id,
        depth: 0,
        draft: true,
      });

      if (article.authorId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not your article" });
      }

      if (article.authorType !== "member") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only member articles can be submitted" });
      }

      // Check if trusted author
      const profile = await ctx.db.query.memberProfiles.findFirst({
        where: eq(memberProfiles.userId, ctx.session.user.id),
      });
      const badges = await ctx.db
        .select()
        .from(memberBadges)
        .where(eq(memberBadges.userId, ctx.session.user.id));

      const trusted = profile ? isTrustedAuthor(profile.xp, badges) : false;

      if (trusted) {
        // Direct publish
        const published = await payload.update({
          collection: "articles",
          id: input.id,
          data: {
            status: "published",
            reviewStatus: "approved",
            publishedAt: new Date().toISOString(),
          },
        });

        // Award XP
        await awardXp(ctx.db, ctx.session.user.id, XP_AMOUNTS.ARTICLE_PUBLISHED);

        // Check badges
        const { docs: publishedArticles } = await payload.find({
          collection: "articles",
          where: {
            and: [
              { authorId: { equals: ctx.session.user.id } },
              { status: { equals: "published" } },
            ],
          },
          limit: 0,
          depth: 0,
        });
        await checkArticleBadges(
          ctx.db,
          ctx.session.user.id,
          publishedArticles.totalDocs ?? 1,
          article.type,
        );

        await logActivity(ctx.db, {
          actorId: ctx.session.user.id,
          actorType: "member",
          action: "article.published",
          targetType: "articles",
          targetId: String(input.id),
          metadata: { title: article.title, type: article.type },
        });

        return published;
      } else {
        // Submit for review
        const submitted = await payload.update({
          collection: "articles",
          id: input.id,
          data: {
            reviewStatus: "pending_review",
          },
        });

        // Award submit XP (only first submit, not re-submits)
        if (!article.reviewStatus) {
          await awardXp(ctx.db, ctx.session.user.id, XP_AMOUNTS.ARTICLE_SUBMITTED);
        }

        await logActivity(ctx.db, {
          actorId: ctx.session.user.id,
          actorType: "member",
          action: "article.submitted",
          targetType: "articles",
          targetId: String(input.id),
          metadata: { title: article.title, type: article.type },
        });

        return submitted;
      }
    }),

  // ── Delete Draft ────────────────────────────────────────────────────────────

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();

      const article = await payload.findByID({
        collection: "articles",
        id: input.id,
        depth: 0,
        draft: true,
      });

      if (article.authorId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not your article" });
      }

      if (article.status === "published") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot delete published articles.",
        });
      }

      await payload.delete({ collection: "articles", id: input.id });
      return { success: true };
    }),
});
```

**Step 2: Register the router in root.ts**

In `src/server/api/root.ts`, add the import and register:

```typescript
import { articlesRouter } from "@/server/api/routers/articles";
```

Add to the `createTRPCRouter` call:

```typescript
articles: articlesRouter,
```

**Step 3: Verify the router compiles**

Run: `npx tsc --noEmit`
Expected: No type errors.

**Step 4: Commit**

```bash
git add src/server/api/routers/articles.ts src/server/api/root.ts
git commit -m "feat(articles): add tRPC articles router with create/update/submit/delete"
```

---

## Task 4: Update Blog List Page — Show Author for Member Articles

**Files:**
- Modify: `src/app/[locale]/blog/page.tsx`

**Step 1: Update the blog list query to filter member articles properly**

The existing query `where: { status: { equals: "published" } }` already works because member articles only reach `status: published` after approval. No query change needed.

**Step 2: Add author name display to article rows**

In the article row `Link` component, after the title `<span>`, add an author line for member articles:

```tsx
{/* Author - member articles only */}
{article.authorType === "member" && article.authorName && (
  <span className="text-muted-foreground font-mono text-[10px] tracking-wider sm:order-5">
    by {article.authorName}
  </span>
)}
```

**Step 3: Commit**

```bash
git add src/app/[locale]/blog/page.tsx
git commit -m "feat(blog): show author name for member-written articles"
```

---

## Task 5: Update Blog Detail Page — Show Author Info

**Files:**
- Modify: `src/app/[locale]/blog/[slug]/page.tsx`

**Step 1: Update the JSON-LD author for member articles**

Replace the hardcoded author in the `JsonLd` component:

```tsx
author: article.authorType === "member" && article.authorName
  ? { "@type": "Person", name: article.authorName }
  : { "@type": "Organization", name: "AIT Community", url: "https://aitcommunity.org" },
```

**Step 2: Add author name to the meta line**

After the type badge `<span>` in the meta line, add:

```tsx
{article.authorType === "member" && article.authorName && (
  <>
    <span className="text-border">|</span>
    <span>by {article.authorName}</span>
  </>
)}
```

**Step 3: Commit**

```bash
git add "src/app/[locale]/blog/[slug]/page.tsx"
git commit -m "feat(blog): show author info on article detail page"
```

---

## Task 6: Create the Lexical Article Editor Component

**Files:**
- Create: `src/components/article-editor.tsx`

**Step 1: Research Payload's Lexical client exports**

Before building, check what Payload exports for client-side Lexical usage:
- Look at `@payloadcms/richtext-lexical/client` exports
- Look at how the existing `LexicalRenderer` at `src/lib/lexical.ts` works
- Check if Payload provides a standalone editor component or if we need to compose from Lexical primitives

Run: `ls node_modules/@payloadcms/richtext-lexical/dist/` and check exports.

**Step 2: Build the ArticleEditor component**

Create `src/components/article-editor.tsx` as a client component (`"use client"`).

The component should include:
- Title input field
- Type selector (article/tutorial)
- Tags input (add/remove tag chips)
- Featured image URL input (or file upload)
- Lexical rich text editor area (using Payload's Lexical config with code blocks)
- Action buttons: "Save Draft", "Submit for Review" / "Publish" (based on trusted author status)
- Review note display (when `reviewStatus === "changes_requested"`)

Props interface:

```typescript
interface ArticleEditorProps {
  initialData?: {
    id: number;
    title: string;
    slug: string;
    content: any; // Lexical JSON
    type: "article" | "tutorial";
    tags: { tag: string }[];
    mediaUrl?: string;
    reviewStatus?: string;
    reviewNote?: string;
  };
  isTrustedAuthor: boolean;
}
```

Use tRPC mutations (`articles.create`, `articles.update`, `articles.submit`) for save/submit actions.

Note: The exact Lexical editor integration will depend on what `@payloadcms/richtext-lexical` exports for client use. If a standalone editor isn't available, use `@lexical/react` directly with the same feature config (headings, bold, italic, links, code blocks, lists, blockquotes, images).

**Step 3: Commit**

```bash
git add src/components/article-editor.tsx
git commit -m "feat(articles): create Lexical article editor component"
```

---

## Task 7: Create the "Write Article" Page

**Files:**
- Create: `src/app/[locale]/blog/write/page.tsx`

**Step 1: Create the write page**

Create `src/app/[locale]/blog/write/page.tsx`:

```typescript
import { redirect } from "next/navigation";
import { auth } from "@/server/better-auth/config";
import { headers } from "next/headers";
import { db } from "@/server/db";
import { memberProfiles, memberBadges } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { isTrustedAuthor } from "@/lib/gamification";
import { ArticleEditor } from "@/components/article-editor";

export default async function WriteArticlePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/");

  const profile = await db.query.memberProfiles.findFirst({
    where: eq(memberProfiles.userId, session.user.id),
  });
  if (!profile) redirect("/"); // Must have a profile

  const badges = await db
    .select()
    .from(memberBadges)
    .where(eq(memberBadges.userId, session.user.id));

  const trusted = isTrustedAuthor(profile.xp, badges);

  return (
    <div className="mx-auto max-w-3xl px-6 py-16 sm:px-12">
      <h1 className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
        / WRITE ARTICLE
      </h1>
      <div className="mt-6">
        <ArticleEditor isTrustedAuthor={trusted} />
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add "src/app/[locale]/blog/write/page.tsx"
git commit -m "feat(articles): add write article page with auth gate"
```

---

## Task 8: Create the "Edit Article" Page

**Files:**
- Create: `src/app/[locale]/blog/edit/[slug]/page.tsx`

**Step 1: Create the edit page**

Create `src/app/[locale]/blog/edit/[slug]/page.tsx`:

```typescript
import { redirect, notFound } from "next/navigation";
import { auth } from "@/server/better-auth/config";
import { headers } from "next/headers";
import { db } from "@/server/db";
import { memberProfiles, memberBadges } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { isTrustedAuthor } from "@/lib/gamification";
import { getPayloadClient } from "@/server/payload";
import { ArticleEditor } from "@/components/article-editor";

export default async function EditArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/");

  const payload = await getPayloadClient();
  const { docs } = await payload.find({
    collection: "articles",
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
    draft: true,
  });

  const article = docs[0];
  if (!article) return notFound();
  if (article.authorId !== session.user.id) return notFound();

  const profile = await db.query.memberProfiles.findFirst({
    where: eq(memberProfiles.userId, session.user.id),
  });
  if (!profile) redirect("/");

  const badges = await db
    .select()
    .from(memberBadges)
    .where(eq(memberBadges.userId, session.user.id));

  const trusted = isTrustedAuthor(profile.xp, badges);

  return (
    <div className="mx-auto max-w-3xl px-6 py-16 sm:px-12">
      <h1 className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
        / EDIT ARTICLE
      </h1>
      <div className="mt-6">
        <ArticleEditor
          initialData={{
            id: article.id as number,
            title: article.title,
            slug: article.slug,
            content: article.content,
            type: article.type as "article" | "tutorial",
            tags: (article.tags as { tag: string }[]) ?? [],
            mediaUrl: article.mediaUrl ?? undefined,
            reviewStatus: article.reviewStatus ?? undefined,
            reviewNote: article.reviewNote ?? undefined,
          }}
          isTrustedAuthor={trusted}
        />
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add "src/app/[locale]/blog/edit/[slug]/page.tsx"
git commit -m "feat(articles): add edit article page with ownership check"
```

---

## Task 9: Create the "My Articles" Page

**Files:**
- Create: `src/app/[locale]/blog/my-articles/page.tsx`

**Step 1: Create the my-articles page**

Create `src/app/[locale]/blog/my-articles/page.tsx` — a protected page listing the member's articles with status badges and action links (edit, delete).

Follow the same table layout pattern as the blog list page (`src/app/[locale]/blog/page.tsx`) but with additional columns for `status` and `reviewStatus`.

Key elements:
- Fetch articles via tRPC `articles.myArticles` (or server-side Payload query with session user ID)
- Show columns: title, type, status (draft/published), review status (pending/approved/changes_requested), date
- For `changes_requested` articles, show the `reviewNote` inline or in a tooltip
- Action links: "Edit" → `/blog/edit/[slug]`, "Delete" (for drafts only)
- "Write New Article" link → `/blog/write`
- Status badge component with color coding:
  - draft: gray
  - pending_review: yellow
  - approved/published: green
  - changes_requested: orange
  - rejected: red

**Step 2: Commit**

```bash
git add "src/app/[locale]/blog/my-articles/page.tsx"
git commit -m "feat(articles): add my-articles dashboard page"
```

---

## Task 10: Add "Write Article" Link to Blog Page and Navigation

**Files:**
- Modify: `src/app/[locale]/blog/page.tsx`

**Step 1: Add a "Write Article" button to the blog page header**

In the section header `div` of the blog page, add a conditional link for authenticated members:

```tsx
<div className="flex items-center justify-between">
  {/* existing header content */}
  <Link
    href="/blog/write"
    className="border-border text-muted-foreground hover:text-foreground rounded border px-3 py-1 font-mono text-xs tracking-wider transition-colors"
  >
    + WRITE
  </Link>
</div>
```

Note: This link is visible to all but the write page itself handles auth. This keeps the blog page a server component without needing session checks.

**Step 2: Commit**

```bash
git add src/app/[locale]/blog/page.tsx
git commit -m "feat(blog): add write article link to blog page header"
```

---

## Task 11: Admin Review Flow — Payload Hooks for Auto-Publish on Approval

**Files:**
- Modify: `src/collections/Articles.ts`

**Step 1: Add a `beforeChange` hook to Articles collection**

When an admin changes `reviewStatus` to `approved`, automatically set `status: published` and `publishedAt`. When changed to `rejected` or `changes_requested`, keep as draft.

Add a hooks section to the Articles collection config:

```typescript
hooks: {
  beforeChange: [
    async ({ data, originalDoc }) => {
      // Auto-publish on admin approval
      if (
        data?.reviewStatus === "approved" &&
        originalDoc?.reviewStatus !== "approved" &&
        data?.authorType === "member"
      ) {
        data.status = "published";
        data.publishedAt = data.publishedAt ?? new Date().toISOString();
      }
      return data;
    },
  ],
},
```

Note: XP and badge awards for admin-approved articles will be handled via a Payload `afterChange` hook that calls the gamification functions. This requires access to the Drizzle DB — import it from `@/server/db`.

**Step 2: Add `afterChange` hook for gamification on approval**

```typescript
afterChange: [
  async ({ doc, previousDoc }) => {
    // Award XP and badges when admin approves a member article
    if (
      doc.reviewStatus === "approved" &&
      previousDoc?.reviewStatus !== "approved" &&
      doc.authorType === "member" &&
      doc.authorId
    ) {
      // Dynamic import to avoid circular dependencies
      const { db } = await import("@/server/db");
      const { awardXp, checkArticleBadges, XP_AMOUNTS } = await import("@/lib/gamification");
      const { getPayloadClient } = await import("@/server/payload");

      await awardXp(db, doc.authorId, XP_AMOUNTS.ARTICLE_PUBLISHED);

      const payload = await getPayloadClient();
      const { totalDocs } = await payload.find({
        collection: "articles",
        where: {
          and: [
            { authorId: { equals: doc.authorId } },
            { status: { equals: "published" } },
            { reviewStatus: { equals: "approved" } },
          ],
        },
        limit: 0,
        depth: 0,
      });

      await checkArticleBadges(db, doc.authorId, totalDocs, doc.type);
    }
  },
],
```

**Step 3: Verify hooks fire correctly**

Run dev server, go to Payload admin, create a test member article manually with `authorType: member` and `reviewStatus: pending_review`. Change `reviewStatus` to `approved` and verify `status` changes to `published`.

**Step 4: Commit**

```bash
git add src/collections/Articles.ts
git commit -m "feat(articles): add Payload hooks for auto-publish on approval and gamification"
```

---

## Task 12: Add i18n Translation Keys

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/nl.json`

**Step 1: Add article writing translation keys**

Add under a new `"articleEditor"` section in `messages/en.json`:

```json
"articleEditor": {
  "writeArticle": "Write Article",
  "editArticle": "Edit Article",
  "myArticles": "My Articles",
  "title": "Title",
  "type": "Type",
  "tags": "Tags",
  "addTag": "Add tag",
  "featuredImage": "Featured Image URL",
  "saveDraft": "Save Draft",
  "submitForReview": "Submit for Review",
  "publish": "Publish",
  "delete": "Delete",
  "status": "Status",
  "draft": "Draft",
  "pendingReview": "Pending Review",
  "approved": "Approved",
  "changesRequested": "Changes Requested",
  "rejected": "Rejected",
  "published": "Published",
  "reviewNote": "Review Note",
  "noArticles": "You haven't written any articles yet.",
  "writeFirst": "Write your first article",
  "confirmDelete": "Are you sure you want to delete this draft?",
  "savedDraft": "Draft saved",
  "submitted": "Article submitted for review",
  "publishedSuccess": "Article published!",
  "by": "by"
}
```

**Step 2: Add corresponding Dutch translations in `messages/nl.json`**

Add the Dutch equivalents under `"articleEditor"`.

**Step 3: Commit**

```bash
git add messages/en.json messages/nl.json
git commit -m "feat(i18n): add article editor translation keys for EN and NL"
```

---

## Task 13: Notification Integration — Inbox Messages for Review Status Changes

**Files:**
- Modify: `src/collections/Articles.ts` (extend afterChange hook)

**Step 1: Send inbox notification when review status changes**

Extend the `afterChange` hook in Articles to create a notification/inbox message when an admin changes review status. Follow the inbox pattern from `src/server/api/routers/inbox.ts` — create a conversation or send a system message.

The simplest approach: log an activity event that the member can see in their activity feed. For a richer experience, create a system notification via the inbox.

Check how the existing inbox system works and decide:
- If there's a system notification mechanism, use it
- Otherwise, log an activity event with `action: "article.approved"` / `action: "article.changes_requested"` that the member's dashboard can display

**Step 2: Commit**

```bash
git add src/collections/Articles.ts
git commit -m "feat(articles): notify members on review status changes"
```

---

## Summary of All Tasks

| # | Task | Files | Estimated Effort |
|---|------|-------|-----------------|
| 1 | Add fields to Articles collection | `Articles.ts` | Small |
| 2 | Gamification constants & helpers | `gamification.ts` | Small |
| 3 | Create articles tRPC router | `articles.ts`, `root.ts` | Medium |
| 4 | Update blog list page (author display) | `blog/page.tsx` | Small |
| 5 | Update blog detail page (author info) | `blog/[slug]/page.tsx` | Small |
| 6 | Create Lexical article editor component | `article-editor.tsx` | Large |
| 7 | Create write article page | `blog/write/page.tsx` | Small |
| 8 | Create edit article page | `blog/edit/[slug]/page.tsx` | Small |
| 9 | Create my-articles page | `blog/my-articles/page.tsx` | Medium |
| 10 | Add write link to blog page | `blog/page.tsx` | Small |
| 11 | Payload hooks for admin review | `Articles.ts` | Medium |
| 12 | i18n translation keys | `en.json`, `nl.json` | Small |
| 13 | Notification integration | `Articles.ts` | Small |

**Dependency order:** Tasks 1-2 first (foundation), then 3 (router), then 4-5 (display), then 6-8 (editor + pages), then 9-10 (dashboard + nav), then 11-13 (admin flow + polish).
