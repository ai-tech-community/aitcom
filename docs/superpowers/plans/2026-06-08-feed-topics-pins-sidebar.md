# Feed Topics, Pins & Sidebar Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring Skool-style organization to the community feed — admin-defined **Topics** (chip filters), **post pinning**, and a **stats + curated-links** section in the existing community sidebar.

**Architecture:** The feed is a Payload CMS collection (`feed-posts`) queried through a tRPC router (`feed.ts`). We add (1) a new per-community `community-topics` Payload collection + a `topics` tRPC router with admin CRUD, (2) `topicSlug` and `isPinned` fields on `feed-posts` with a pin mutation mirroring the forum's `pinThread`, (3) chip-filter UI on the feed and a topic picker in the composer, and (4) two new sections (stats, curated links) in the existing `CommunitySidebar`, backed by a `community-links` collection + router. All admin editing follows the existing settings-page pattern. Per ADR-0026, the feed is the canonical discussion surface and the forum is frozen — do not touch the forum's category enum.

**Tech Stack:** Next.js 15 / React 19, tRPC v11, Payload CMS 3 (Postgres adapter), Drizzle (for `awardXp`/membership reads), Vitest + @testing-library/react, next-intl (en/nl).

**Domain terms (see CONTEXT.md):** A **Topic** is a per-community admin-defined feed label (pure label+filter, one per post, seeded "General", ~10 cap). **Community links** are admin-curated sidebar links pointing to any URL/path. Both are distinct from the frozen forum `category` enum.

**Conventions discovered (apply throughout):**
- Payload collections live in `src/collections/*.ts`, registered in `src/payload.config.ts` `collections: [...]`.
- Schema changes ship as a migration file in `src/migrations/` (SQL via `db.execute(sql.raw(...))`), registered in `src/migrations/index.ts` (import + append `{ up, down, name }` to the exported array). Local dev materializes schema with `PAYLOAD_PUSH=true`; production runs migrations.
- Payload column names are **snake_case** of the field `name` (e.g. field `topicSlug` → column `topic_slug`).
- Tests are **pure-function unit tests** (Vitest, no DB) and **component tests** (@testing-library/react with `vi.mock` for `@/trpc/react` and `next-intl`). Do NOT write Payload integration tests — extract pure helpers and test those.
- Run a single test: `npx vitest run <path> -t "<name>"`. Run all: `npm test`. Typecheck: `npm run typecheck` (if present) or `npx tsc --noEmit`.
- i18n: add every new UI string key to BOTH `messages/en.json` and `messages/nl.json` under the right namespace; read with `const t = useTranslations("namespace"); t("key")`.
- Server-side admin gate pattern (copy exactly): look up community by slug, then `communityMemberships.findFirst` with `status:"active"`, then require `role === "owner" || role === "admin"`.

---

## File Structure

**Create:**
- `src/collections/CommunityTopics.ts` — Payload collection for per-community topics
- `src/collections/CommunityLinks.ts` — Payload collection for per-community sidebar links
- `src/server/api/routers/topics.ts` — tRPC router: list/create/update/delete/reorder topics
- `src/server/api/routers/links.ts` — tRPC router: list/upsert community links
- `src/server/api/routers/topics.test.ts` — pure-function tests (slug, cap, default)
- `src/server/api/routers/topic-helpers.ts` — pure helpers (slugify, cap check, default ensure)
- `src/lib/feed-sort.ts` — pure helper: pinned-first ordering + max-pin cap
- `src/lib/feed-sort.test.ts` — tests for the above
- `src/components/communities/feed/topic-chips.tsx` — the chip filter row
- `src/components/communities/feed/topic-chips.test.tsx` — component test
- `src/components/communities/settings/topics-settings.tsx` — admin topic editor
- `src/components/communities/settings/links-settings.tsx` — admin links editor
- `src/app/[locale]/communities/[slug]/settings/topics/page.tsx`
- `src/app/[locale]/communities/[slug]/settings/links/page.tsx`
- `src/migrations/20260608a_feed_topics_pins_links.ts`

**Modify:**
- `src/collections/FeedPosts.ts` — add `topicSlug`, `isPinned` fields
- `src/server/api/routers/feed.ts` — `getFeed` (topic filter + pinned-first), `createPost` (topicSlug), new `pinPost` mutation, new `getFeedTopics`-less (topics live in topics router)
- `src/server/api/root.ts` — register `topics` + `links` routers
- `src/payload.config.ts` — register the two new collections
- `src/migrations/index.ts` — register the migration
- `src/components/communities/feed/feed-page.tsx` — render `TopicChips`, pass `topicSlug` filter to query
- `src/components/communities/feed/post-composer.tsx` — topic picker, send `topicSlug`
- `src/components/communities/feed/feed-post-card.tsx` — pin/unpin action, topic badge, pinned indicator
- `src/components/communities/feed/community-sidebar.tsx` — add Stats + Links sections
- `src/components/communities/settings/settings-nav.tsx` (or wherever the settings sidebar list lives) — add Topics + Links entries
- `messages/en.json`, `messages/nl.json` — new keys

> Before starting, run `git rev-parse --abbrev-ref HEAD` to confirm you're on a feature branch (not `main`). If on `main`, create one: `git checkout -b feat/feed-topics-pins-sidebar`.

---

## Task 1: Schema — add `topicSlug` + `isPinned` to feed posts, create topics & links collections

**Files:**
- Modify: `src/collections/FeedPosts.ts`
- Create: `src/collections/CommunityTopics.ts`
- Create: `src/collections/CommunityLinks.ts`
- Modify: `src/payload.config.ts`
- Create: `src/migrations/20260608a_feed_topics_pins_links.ts`
- Modify: `src/migrations/index.ts`

- [ ] **Step 1: Add fields to `FeedPosts.ts`**

In `src/collections/FeedPosts.ts`, inside the `fields` array, after the `communityId` field (line 27) add:

```typescript
    {
      name: "topicSlug",
      type: "text",
      index: true,
      admin: { description: "Slug of the community-topics row this post belongs to. 'general' by default." },
    },
    {
      name: "isPinned",
      type: "checkbox",
      defaultValue: false,
      admin: { position: "sidebar", description: "Pinned posts appear first on the All view." },
    },
```

- [ ] **Step 2: Create `CommunityTopics.ts`**

Create `src/collections/CommunityTopics.ts`:

```typescript
import type { CollectionConfig } from "payload";

export const CommunityTopics: CollectionConfig = {
  slug: "community-topics",
  admin: {
    useAsTitle: "label",
    defaultColumns: ["label", "slug", "communityId", "sortOrder"],
    description: "Admin-defined feed topics (chip filters) for one community.",
  },
  fields: [
    { name: "label", type: "text", required: true, maxLength: 40 },
    { name: "slug", type: "text", required: true, index: true },
    { name: "emoji", type: "text", maxLength: 8 },
    {
      name: "communityId",
      type: "text",
      required: true,
      index: true,
      admin: { description: "Community this topic belongs to." },
    },
    { name: "sortOrder", type: "number", defaultValue: 0, index: true },
    {
      name: "isDefault",
      type: "checkbox",
      defaultValue: false,
      admin: { description: "The seeded 'General' topic; cannot be deleted." },
    },
  ],
  timestamps: true,
};
```

- [ ] **Step 3: Create `CommunityLinks.ts`**

Create `src/collections/CommunityLinks.ts`:

```typescript
import type { CollectionConfig } from "payload";

export const CommunityLinks: CollectionConfig = {
  slug: "community-links",
  admin: {
    useAsTitle: "label",
    defaultColumns: ["label", "url", "communityId", "sortOrder"],
    description: "Admin-curated sidebar links for one community.",
  },
  fields: [
    { name: "label", type: "text", required: true, maxLength: 60 },
    { name: "url", type: "text", required: true, maxLength: 500 },
    { name: "emoji", type: "text", maxLength: 8 },
    {
      name: "communityId",
      type: "text",
      required: true,
      index: true,
    },
    { name: "sortOrder", type: "number", defaultValue: 0, index: true },
  ],
  timestamps: true,
};
```

- [ ] **Step 4: Register collections in `payload.config.ts`**

In `src/payload.config.ts`, add the imports near the other collection imports:

```typescript
import { CommunityTopics } from "./collections/CommunityTopics";
import { CommunityLinks } from "./collections/CommunityLinks";
```

Then add `CommunityTopics, CommunityLinks,` to the `collections: [ ... ]` array (anywhere in the list, e.g. next to `CommunityIdeas`).

- [ ] **Step 5: Write the migration**

Create `src/migrations/20260608a_feed_topics_pins_links.ts`:

```typescript
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // feed_posts: topic + pin
  await db.execute(sql.raw(`ALTER TABLE "feed_posts" ADD COLUMN IF NOT EXISTS "topic_slug" varchar`));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS "feed_posts_topic_slug_idx" ON "feed_posts"("topic_slug")`));
  await db.execute(sql.raw(`ALTER TABLE "feed_posts" ADD COLUMN IF NOT EXISTS "is_pinned" boolean DEFAULT false`));
  // backfill existing posts to the default topic
  await db.execute(sql.raw(`UPDATE "feed_posts" SET "topic_slug" = 'general' WHERE "topic_slug" IS NULL`));

  // community_topics
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS "community_topics" (
      "id" serial PRIMARY KEY,
      "label" varchar NOT NULL,
      "slug" varchar NOT NULL,
      "emoji" varchar,
      "community_id" varchar NOT NULL,
      "sort_order" numeric DEFAULT 0,
      "is_default" boolean DEFAULT false,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    )
  `));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS "community_topics_community_id_idx" ON "community_topics"("community_id")`));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS "community_topics_slug_idx" ON "community_topics"("slug")`));

  // community_links
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS "community_links" (
      "id" serial PRIMARY KEY,
      "label" varchar NOT NULL,
      "url" varchar NOT NULL,
      "emoji" varchar,
      "community_id" varchar NOT NULL,
      "sort_order" numeric DEFAULT 0,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    )
  `));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS "community_links_community_id_idx" ON "community_links"("community_id")`));
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql.raw(`DROP TABLE IF EXISTS "community_links"`));
  await db.execute(sql.raw(`DROP TABLE IF EXISTS "community_topics"`));
  await db.execute(sql.raw(`ALTER TABLE "feed_posts" DROP COLUMN IF EXISTS "is_pinned"`));
  await db.execute(sql.raw(`DROP INDEX IF EXISTS "feed_posts_topic_slug_idx"`));
  await db.execute(sql.raw(`ALTER TABLE "feed_posts" DROP COLUMN IF EXISTS "topic_slug"`));
}
```

> Note: confirm the exact Payload-generated column types if `PAYLOAD_PUSH=true` dev already created them — if the dev DB was push-materialized, the `CREATE TABLE IF NOT EXISTS` is a no-op and the migration only matters for production. Keep the migration anyway.

- [ ] **Step 6: Register the migration in `index.ts`**

In `src/migrations/index.ts`, add the import alongside the others:

```typescript
import * as migration_20260608a_feed_topics_pins_links from "./20260608a_feed_topics_pins_links";
```

And append to the exported array (after the `20260604a_work_grid_commission` entry):

```typescript
  {
    up: migration_20260608a_feed_topics_pins_links.up,
    down: migration_20260608a_feed_topics_pins_links.down,
    name: "20260608a_feed_topics_pins_links",
  },
```

- [ ] **Step 7: Materialize + typecheck**

Run: `PAYLOAD_PUSH=true npm run dev` briefly (or your project's schema-push command) to materialize the new columns/tables in the dev DB, then stop it. Then run: `npx tsc --noEmit`
Expected: no type errors from the collection/config changes.

- [ ] **Step 8: Commit**

```bash
git add src/collections/CommunityTopics.ts src/collections/CommunityLinks.ts src/collections/FeedPosts.ts src/payload.config.ts src/migrations/
git commit -m "feat(feed): schema for topics, post pinning, and community links"
```

---

## Task 2: Pure helpers — slugify/cap/default for topics, and pinned-first sort

**Files:**
- Create: `src/server/api/routers/topic-helpers.ts`
- Create: `src/server/api/routers/topics.test.ts`
- Create: `src/lib/feed-sort.ts`
- Create: `src/lib/feed-sort.test.ts`

- [ ] **Step 1: Write the failing test for topic helpers**

Create `src/server/api/routers/topics.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { topicSlugify, MAX_TOPICS_PER_COMMUNITY, isAtTopicCap } from "./topic-helpers";

describe("topicSlugify", () => {
  it("lowercases and hyphenates", () => {
    expect(topicSlugify("YouTube Resources")).toBe("youtube-resources");
  });
  it("strips emoji and punctuation", () => {
    expect(topicSlugify("Wins ⭐!")).toBe("wins");
  });
  it("collapses repeated separators and trims", () => {
    expect(topicSlugify("  Hire Me / Looking  ")).toBe("hire-me-looking");
  });
});

describe("isAtTopicCap", () => {
  it("is false below the cap", () => {
    expect(isAtTopicCap(MAX_TOPICS_PER_COMMUNITY - 1)).toBe(false);
  });
  it("is true at the cap", () => {
    expect(isAtTopicCap(MAX_TOPICS_PER_COMMUNITY)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/server/api/routers/topics.test.ts`
Expected: FAIL — cannot find module `./topic-helpers`.

- [ ] **Step 3: Implement `topic-helpers.ts`**

Create `src/server/api/routers/topic-helpers.ts`:

```typescript
export const MAX_TOPICS_PER_COMMUNITY = 10;

/** Derive a URL-safe slug from a topic label (drops emoji/punctuation). */
export function topicSlugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function isAtTopicCap(currentCount: number): boolean {
  return currentCount >= MAX_TOPICS_PER_COMMUNITY;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/server/api/routers/topics.test.ts`
Expected: PASS (5 assertions).

- [ ] **Step 5: Write the failing test for feed sort**

Create `src/lib/feed-sort.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { orderPinnedFirst, MAX_PINS } from "./feed-sort";

type P = { id: number; isPinned?: boolean | null; createdAt: string };

describe("orderPinnedFirst", () => {
  it("puts pinned posts before unpinned, preserving inner order", () => {
    const posts: P[] = [
      { id: 1, isPinned: false, createdAt: "2026-06-08T10:00:00Z" },
      { id: 2, isPinned: true, createdAt: "2026-06-08T09:00:00Z" },
      { id: 3, isPinned: false, createdAt: "2026-06-08T08:00:00Z" },
      { id: 4, isPinned: true, createdAt: "2026-06-08T07:00:00Z" },
    ];
    expect(orderPinnedFirst(posts).map((p) => p.id)).toEqual([2, 4, 1, 3]);
  });
  it("leaves an all-unpinned list unchanged", () => {
    const posts: P[] = [
      { id: 1, createdAt: "b" },
      { id: 2, createdAt: "a" },
    ];
    expect(orderPinnedFirst(posts).map((p) => p.id)).toEqual([1, 2]);
  });
});

describe("MAX_PINS", () => {
  it("caps pins at 3", () => {
    expect(MAX_PINS).toBe(3);
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run src/lib/feed-sort.test.ts`
Expected: FAIL — cannot find module `./feed-sort`.

- [ ] **Step 7: Implement `feed-sort.ts`**

Create `src/lib/feed-sort.ts`:

```typescript
export const MAX_PINS = 3;

/**
 * Stable reorder: pinned items first (in their original relative order),
 * then the rest (in their original relative order). Applied client-side
 * only on the "All" view — topic-filtered views do not pin.
 */
export function orderPinnedFirst<T extends { isPinned?: boolean | null }>(
  items: T[],
): T[] {
  const pinned = items.filter((i) => i.isPinned === true);
  const rest = items.filter((i) => i.isPinned !== true);
  return [...pinned, ...rest];
}
```

- [ ] **Step 8: Run to verify it passes**

Run: `npx vitest run src/lib/feed-sort.test.ts`
Expected: PASS (3 assertions).

- [ ] **Step 9: Commit**

```bash
git add src/server/api/routers/topic-helpers.ts src/server/api/routers/topics.test.ts src/lib/feed-sort.ts src/lib/feed-sort.test.ts
git commit -m "feat(feed): pure helpers for topic slug/cap and pinned-first sort"
```

---

## Task 3: Topics router (admin CRUD + public list + default seeding)

**Files:**
- Create: `src/server/api/routers/topics.ts`
- Modify: `src/server/api/root.ts`

- [ ] **Step 1: Implement the topics router**

Create `src/server/api/routers/topics.ts`:

```typescript
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
} from "@/server/api/trpc";
import { getPayloadClient } from "@/server/payload";
import { and, eq, isNull } from "drizzle-orm";
import { communities, communityMemberships } from "@/server/db/schema";
import {
  topicSlugify,
  isAtTopicCap,
} from "./topic-helpers";

/** Resolve a community id from its slug or throw NOT_FOUND. */
async function communityIdBySlug(
  db: typeof import("@/server/db").db,
  slug: string,
): Promise<string> {
  const community = await db.query.communities.findFirst({
    where: and(eq(communities.slug, slug), isNull(communities.deletedAt)),
    columns: { id: true },
  });
  if (!community) throw new TRPCError({ code: "NOT_FOUND" });
  return community.id;
}

/** Require the caller is an active owner/admin of the community. */
async function requireAdmin(
  db: typeof import("@/server/db").db,
  communityId: string,
  userId: string,
): Promise<void> {
  const membership = await db.query.communityMemberships.findFirst({
    where: and(
      eq(communityMemberships.communityId, communityId),
      eq(communityMemberships.userId, userId),
      eq(communityMemberships.status, "active"),
    ),
  });
  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
}

/** Ensure a 'general' default topic exists; returns nothing. */
async function ensureDefaultTopic(communityId: string): Promise<void> {
  const payload = await getPayloadClient();
  const { docs } = await payload.find({
    collection: "community-topics",
    where: { and: [{ communityId: { equals: communityId } }, { slug: { equals: "general" } }] },
    limit: 1,
    depth: 0,
  });
  if (docs.length === 0) {
    await payload.create({
      collection: "community-topics",
      data: { label: "General", slug: "general", communityId, sortOrder: 0, isDefault: true },
    });
  }
}

export const topicsRouter = createTRPCRouter({
  /** Public: list a community's topics, default first, then by sortOrder. */
  list: publicProcedure
    .input(z.object({ communitySlug: z.string() }))
    .query(async ({ ctx, input }) => {
      const communityId = await communityIdBySlug(ctx.db, input.communitySlug);
      await ensureDefaultTopic(communityId);
      const payload = await getPayloadClient();
      const { docs } = await payload.find({
        collection: "community-topics",
        where: { communityId: { equals: communityId } },
        sort: "sortOrder",
        limit: 50,
        depth: 0,
      });
      return docs;
    }),

  create: protectedProcedure
    .input(
      z.object({
        communitySlug: z.string(),
        label: z.string().min(1).max(40),
        emoji: z.string().max(8).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const communityId = await communityIdBySlug(ctx.db, input.communitySlug);
      await requireAdmin(ctx.db, communityId, ctx.session.user.id);
      const payload = await getPayloadClient();

      const { totalDocs } = await payload.find({
        collection: "community-topics",
        where: { communityId: { equals: communityId } },
        limit: 0,
        depth: 0,
      });
      if (isAtTopicCap(totalDocs)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "TOPIC_CAP_REACHED" });
      }

      const slug = topicSlugify(input.label) || `topic-${totalDocs + 1}`;
      const { docs: clash } = await payload.find({
        collection: "community-topics",
        where: { and: [{ communityId: { equals: communityId } }, { slug: { equals: slug } }] },
        limit: 1,
        depth: 0,
      });
      if (clash.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "TOPIC_SLUG_EXISTS" });
      }

      return payload.create({
        collection: "community-topics",
        data: {
          label: input.label,
          slug,
          emoji: input.emoji ?? undefined,
          communityId,
          sortOrder: totalDocs,
          isDefault: false,
        },
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        label: z.string().min(1).max(40),
        emoji: z.string().max(8).optional(),
        sortOrder: z.number().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();
      const topic = await payload.findByID({ collection: "community-topics", id: input.id, depth: 0 });
      await requireAdmin(ctx.db, topic.communityId as string, ctx.session.user.id);
      return payload.update({
        collection: "community-topics",
        id: input.id,
        data: {
          label: input.label,
          emoji: input.emoji ?? undefined,
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        },
      });
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();
      const topic = await payload.findByID({ collection: "community-topics", id: input.id, depth: 0 });
      await requireAdmin(ctx.db, topic.communityId as string, ctx.session.user.id);
      if (topic.isDefault) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "CANNOT_DELETE_DEFAULT" });
      }
      // Reassign that topic's posts back to 'general'.
      await payload.update({
        collection: "feed-posts",
        where: {
          and: [
            { communityId: { equals: topic.communityId } },
            { topicSlug: { equals: topic.slug } },
          ],
        },
        data: { topicSlug: "general" },
      });
      await payload.delete({ collection: "community-topics", id: input.id });
      return { ok: true };
    }),
});
```

- [ ] **Step 2: Register the router in `root.ts`**

In `src/server/api/root.ts`, import and add to the router map (match existing style):

```typescript
import { topicsRouter } from "@/server/api/routers/topics";
// ... inside createTRPCRouter({ ... }):
  topics: topicsRouter,
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (If `ctx.db` typing on the helper signatures is awkward, replace the helper param type with the inferred `ctx.db` type used elsewhere in routers, or inline the helpers — see `forum.ts` for the in-router idiom.)

- [ ] **Step 4: Commit**

```bash
git add src/server/api/routers/topics.ts src/server/api/root.ts
git commit -m "feat(feed): topics router with admin CRUD, cap, and default seeding"
```

---

## Task 4: Wire topics + pins into the feed router

**Files:**
- Modify: `src/server/api/routers/feed.ts`

- [ ] **Step 1: Accept a topic filter in `getFeed`**

In `src/server/api/routers/feed.ts`, extend the `getFeed` input (lines 13-19) to add an optional `topicSlug`:

```typescript
    .input(
      z.object({
        communitySlug: z.string(),
        limit: z.number().min(1).max(50).default(20),
        cursor: z.object({ createdAt: z.string(), id: z.number() }).optional(),
        topicSlug: z.string().optional(),
      }),
    )
```

- [ ] **Step 2: Apply the topic filter and pinned-first sort**

In `getFeed`, after the `isDeleted` condition is pushed into `whereClause.and` (around line 53), add the topic filter, and change the sort so pinned posts come first ONLY when no topic filter is active:

```typescript
      if (input.topicSlug && input.topicSlug !== "all") {
        (whereClause.and as unknown[]).push({
          topicSlug: { equals: input.topicSlug },
        });
      }
```

Then change the `payload.find` sort (line 73) to:

```typescript
        sort:
          input.topicSlug && input.topicSlug !== "all"
            ? "-createdAt"
            : "-isPinned,-createdAt",
```

> Pins surface only on the "All" view per ADR-0026/CONTEXT.md. The pure `orderPinnedFirst` helper from Task 2 is used client-side as a safety net if a Payload sort on a boolean is unreliable; the DB sort is the primary mechanism.

- [ ] **Step 3: Store `topicSlug` on create**

In `createPost`, extend the input to accept `topicSlug` (after `imageUrl`, line 149):

```typescript
        topicSlug: z.string().optional(),
```

And in the `payload.create` data object (lines 194-202), add:

```typescript
          topicSlug: input.topicSlug ?? "general",
```

- [ ] **Step 4: Add the `pinPost` mutation (mirror forum `pinThread`)**

Add this procedure to the `feedRouter` (after `deletePost`). It mirrors `forum.ts` `pinThread` (lines 633-674) but enforces the 3-pin cap:

```typescript
  pinPost: protectedProcedure
    .input(z.object({ postId: z.number(), isPinned: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();
      const post = await payload.findByID({
        collection: "feed-posts",
        id: input.postId,
        depth: 0,
      });
      if (!post || post.isDeleted) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Post not found" });
      }

      if (post.communityId) {
        const membership = await ctx.db.query.communityMemberships.findFirst({
          where: and(
            eq(communityMemberships.communityId, post.communityId as string),
            eq(communityMemberships.userId, ctx.session.user.id),
            eq(communityMemberships.status, "active"),
          ),
        });
        if (
          !membership ||
          (membership.role !== "owner" &&
            membership.role !== "admin" &&
            membership.role !== "moderator")
        ) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only moderators can pin posts",
          });
        }
      }

      // Enforce the 3-pin cap when pinning.
      if (input.isPinned) {
        const { totalDocs } = await payload.find({
          collection: "feed-posts",
          where: {
            and: [
              { communityId: { equals: post.communityId } },
              { isPinned: { equals: true } },
              { isDeleted: { not_equals: true } },
            ],
          },
          limit: 0,
          depth: 0,
        });
        if (totalDocs >= 3) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "PIN_CAP_REACHED" });
        }
      }

      await payload.update({
        collection: "feed-posts",
        id: input.postId,
        data: { isPinned: input.isPinned },
      });
      return { ok: true };
    }),
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (`and`, `eq`, `communityMemberships` are already imported at the top of `feed.ts`.)

- [ ] **Step 6: Commit**

```bash
git add src/server/api/routers/feed.ts
git commit -m "feat(feed): topic filter, topicSlug on create, pinned-first sort, pinPost mutation"
```

---

## Task 5: Topic chips on the feed + topic picker in the composer

**Files:**
- Create: `src/components/communities/feed/topic-chips.tsx`
- Create: `src/components/communities/feed/topic-chips.test.tsx`
- Modify: `src/components/communities/feed/feed-page.tsx`
- Modify: `src/components/communities/feed/post-composer.tsx`
- Modify: `messages/en.json`, `messages/nl.json`

- [ ] **Step 1: Write the failing component test for the chips**

Create `src/components/communities/feed/topic-chips.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { TopicChipsView } from "./topic-chips";

const topics = [
  { id: 1, label: "General", slug: "general", emoji: null },
  { id: 2, label: "Wins", slug: "wins", emoji: "⭐" },
];

describe("TopicChipsView", () => {
  it("renders an All chip plus one chip per topic", () => {
    render(<TopicChipsView topics={topics} active="all" onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: /all/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /general/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /wins/i })).toBeInTheDocument();
  });

  it("calls onSelect with the slug when a chip is clicked", () => {
    const onSelect = vi.fn();
    render(<TopicChipsView topics={topics} active="all" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /wins/i }));
    expect(onSelect).toHaveBeenCalledWith("wins");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/communities/feed/topic-chips.test.tsx`
Expected: FAIL — cannot find module `./topic-chips`.

- [ ] **Step 3: Implement `topic-chips.tsx`**

Create `src/components/communities/feed/topic-chips.tsx`:

```typescript
"use client";

import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";

export interface TopicChip {
  id: number;
  label: string;
  slug: string;
  emoji?: string | null;
}

/** Presentational chip row — pure, easy to test. */
export function TopicChipsView({
  topics,
  active,
  onSelect,
}: {
  topics: TopicChip[];
  active: string;
  onSelect: (slug: string) => void;
}) {
  const t = useTranslations("communities.feed");
  const chip = (slug: string, label: string, key: string) => (
    <button
      key={key}
      type="button"
      onClick={() => onSelect(slug)}
      className={`shrink-0 rounded-full border px-3 py-1 text-sm transition-colors ${
        active === slug
          ? "bg-foreground text-background border-foreground"
          : "border-border text-muted-foreground hover:bg-secondary/50"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className="flex flex-wrap gap-2">
      {chip("all", t("allTopics"), "all")}
      {topics.map((tp) =>
        chip(tp.slug, `${tp.emoji ? `${tp.emoji} ` : ""}${tp.label}`, String(tp.id)),
      )}
    </div>
  );
}

/** Data-bound wrapper used by the feed page. */
export function TopicChips({
  slug,
  active,
  onSelect,
}: {
  slug: string;
  active: string;
  onSelect: (slug: string) => void;
}) {
  const { data: topics } = api.topics.list.useQuery({ communitySlug: slug });
  if (!topics || topics.length === 0) return null;
  return (
    <TopicChipsView
      topics={topics as TopicChip[]}
      active={active}
      onSelect={onSelect}
    />
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/components/communities/feed/topic-chips.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Render chips in `feed-page.tsx` and pass the filter**

In `src/components/communities/feed/feed-page.tsx`:

Add the import (after the `CommunitySidebar` import, line 11):

```typescript
import { TopicChips } from "./topic-chips";
```

Add filter state (after the `limit` state, line 33):

```typescript
  const [activeTopic, setActiveTopic] = useState("all");
```

Pass it to the query (modify lines 45-51):

```typescript
  const { data, isFetching, refetch } = api.feed.getFeed.useQuery(
    {
      communitySlug: slug,
      limit,
      topicSlug: activeTopic,
    },
    { enabled: isAuthenticated && isMember },
  );
```

Render the chip row between the composer and the post list. Replace the `<PostComposer ... />` line (line 98) region so it reads:

```typescript
        <PostComposer slug={slug} canPost={canPost} />

        {isAuthenticated && isMember ? (
          <TopicChips slug={slug} active={activeTopic} onSelect={setActiveTopic} />
        ) : null}
```

- [ ] **Step 6: Add a topic picker to `post-composer.tsx`**

In `src/components/communities/feed/post-composer.tsx`:

Add after the existing state (line 21):

```typescript
  const [topicSlug, setTopicSlug] = useState("general");
  const { data: topics } = api.topics.list.useQuery({ communitySlug: slug });
```

In `handleSubmit` (line 66-70), add `topicSlug`:

```typescript
    createPost.mutate({
      communitySlug: slug,
      content: content.trim(),
      imageUrl: imageUrl ?? undefined,
      topicSlug,
    });
```

Add a `<select>` in the action row, before the submit button (inside the `flex items-center justify-between` div at line 111). Replace that div's contents to include the picker:

```typescript
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
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

          {topics && topics.length > 0 ? (
            <select
              value={topicSlug}
              onChange={(e) => setTopicSlug(e.target.value)}
              className="border-border bg-background rounded-md border px-2 py-1 text-sm"
              aria-label={t("selectTopic")}
            >
              {topics.map((tp) => (
                <option key={tp.id} value={tp.slug}>
                  {tp.emoji ? `${tp.emoji} ` : ""}
                  {tp.label}
                </option>
              ))}
            </select>
          ) : null}
        </div>

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
```

- [ ] **Step 7: Add i18n keys**

In `messages/en.json`, under `communities.feed`, add:

```json
      "allTopics": "All",
      "selectTopic": "Topic",
      "pinPost": "Pin",
      "unpinPost": "Unpin",
      "pinned": "Pinned",
      "pinCapReached": "You can pin at most 3 posts",
```

In `messages/nl.json`, under `communities.feed`, add the Dutch equivalents:

```json
      "allTopics": "Alle",
      "selectTopic": "Onderwerp",
      "pinPost": "Vastmaken",
      "unpinPost": "Losmaken",
      "pinned": "Vastgemaakt",
      "pinCapReached": "Je kunt maximaal 3 berichten vastmaken",
```

- [ ] **Step 8: Run the chip test + typecheck**

Run: `npx vitest run src/components/communities/feed/topic-chips.test.tsx && npx tsc --noEmit`
Expected: tests PASS, no type errors.

- [ ] **Step 9: Commit**

```bash
git add src/components/communities/feed/topic-chips.tsx src/components/communities/feed/topic-chips.test.tsx src/components/communities/feed/feed-page.tsx src/components/communities/feed/post-composer.tsx messages/en.json messages/nl.json
git commit -m "feat(feed): topic chips on feed + topic picker in composer"
```

---

## Task 6: Pin action + topic badge on the post card

**Files:**
- Modify: `src/components/communities/feed/feed-post-card.tsx`

- [ ] **Step 1: Extend the `FeedPost` interface**

In `src/components/communities/feed/feed-post-card.tsx`, add to the `FeedPost` interface (after `createdAt`, line 44):

```typescript
  isPinned?: boolean | null;
  topicSlug?: string | null;
```

- [ ] **Step 2: Add the pin mutation**

After the `deletePost` mutation (line 98), add:

```typescript
  const pinPost = api.feed.pinPost.useMutation({
    onSuccess: () => onRefresh(),
    onError: (e) =>
      toast.error(
        e.message === "PIN_CAP_REACHED" ? t("pinCapReached") : "Failed to pin",
      ),
  });
```

- [ ] **Step 3: Add a pin/unpin item to the dropdown (privileged only)**

Inside `<DropdownMenuContent align="end">` (after the delete item, before `</DropdownMenuContent>`, line 161), add — gated to privileged users:

```typescript
              {isPrivileged && (
                <DropdownMenuItem
                  onClick={() =>
                    pinPost.mutate({ postId: post.id, isPinned: !post.isPinned })
                  }
                >
                  {post.isPinned ? t("unpinPost") : t("pinPost")}
                </DropdownMenuItem>
              )}
```

- [ ] **Step 4: Show a pinned indicator + topic badge in the header**

Import `Pin` from lucide-react (modify line 16):

```typescript
import { Heart, MessageSquare, MoreHorizontal, Pin } from "lucide-react";
```

In the header meta line (the `<p className="text-muted-foreground text-[11px]">`, lines 127-130), prepend a pinned marker:

```typescript
            <p className="text-muted-foreground flex items-center gap-1 text-[11px]">
              {post.isPinned ? (
                <span className="text-foreground inline-flex items-center gap-0.5">
                  <Pin className="size-3 fill-current" /> {t("pinned")}
                </span>
              ) : null}
              <span>
                {timeAgo(post.createdAt)}
                {post.isEdited ? ` · (${t("edited")})` : ""}
              </span>
            </p>
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual smoke (no automated DB test per conventions)**

Run the app (`npm run dev`), as an admin: create posts under two topics, filter via chips, pin a post and confirm it jumps to the top on "All" but not under a topic filter, attempt a 4th pin and confirm the `pinCapReached` toast.

- [ ] **Step 7: Commit**

```bash
git add src/components/communities/feed/feed-post-card.tsx
git commit -m "feat(feed): pin/unpin action and pinned indicator on post card"
```

---

## Task 7: Community links router + admin settings pages (topics & links)

**Files:**
- Create: `src/server/api/routers/links.ts`
- Modify: `src/server/api/root.ts`
- Create: `src/components/communities/settings/topics-settings.tsx`
- Create: `src/components/communities/settings/links-settings.tsx`
- Create: `src/app/[locale]/communities/[slug]/settings/topics/page.tsx`
- Create: `src/app/[locale]/communities/[slug]/settings/links/page.tsx`
- Modify: settings nav list + `messages/en.json`, `messages/nl.json`

- [ ] **Step 1: Implement the links router**

Create `src/server/api/routers/links.ts` (reuses the same admin gate idiom as `topics.ts` — inline it to avoid cross-file coupling):

```typescript
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
} from "@/server/api/trpc";
import { getPayloadClient } from "@/server/payload";
import { and, eq, isNull } from "drizzle-orm";
import { communities, communityMemberships } from "@/server/db/schema";

export const linksRouter = createTRPCRouter({
  list: publicProcedure
    .input(z.object({ communitySlug: z.string() }))
    .query(async ({ ctx, input }) => {
      const community = await ctx.db.query.communities.findFirst({
        where: and(eq(communities.slug, input.communitySlug), isNull(communities.deletedAt)),
        columns: { id: true },
      });
      if (!community) return [];
      const payload = await getPayloadClient();
      const { docs } = await payload.find({
        collection: "community-links",
        where: { communityId: { equals: community.id } },
        sort: "sortOrder",
        limit: 50,
        depth: 0,
      });
      return docs;
    }),

  /** Replace the whole link set for a community (simple, like rules upsert). */
  setAll: protectedProcedure
    .input(
      z.object({
        communitySlug: z.string(),
        links: z
          .array(
            z.object({
              label: z.string().min(1).max(60),
              url: z.string().min(1).max(500),
              emoji: z.string().max(8).optional(),
            }),
          )
          .max(20),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const community = await ctx.db.query.communities.findFirst({
        where: and(eq(communities.slug, input.communitySlug), isNull(communities.deletedAt)),
        columns: { id: true },
      });
      if (!community) throw new TRPCError({ code: "NOT_FOUND" });
      const membership = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, community.id),
          eq(communityMemberships.userId, ctx.session.user.id),
          eq(communityMemberships.status, "active"),
        ),
      });
      if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const payload = await getPayloadClient();
      // Clear existing, then recreate in order.
      const { docs: existing } = await payload.find({
        collection: "community-links",
        where: { communityId: { equals: community.id } },
        limit: 100,
        depth: 0,
      });
      for (const doc of existing) {
        await payload.delete({ collection: "community-links", id: doc.id });
      }
      let i = 0;
      for (const link of input.links) {
        await payload.create({
          collection: "community-links",
          data: {
            label: link.label,
            url: link.url,
            emoji: link.emoji ?? undefined,
            communityId: community.id,
            sortOrder: i++,
          },
        });
      }
      return { ok: true, count: input.links.length };
    }),
});
```

- [ ] **Step 2: Register `links` in `root.ts`**

```typescript
import { linksRouter } from "@/server/api/routers/links";
// inside createTRPCRouter({ ... }):
  links: linksRouter,
```

- [ ] **Step 3: Build the topics settings component**

Create `src/components/communities/settings/topics-settings.tsx` (follows the rules-settings pattern: query → local edits → mutate):

```typescript
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

export function TopicsSettings({ slug }: { slug: string }) {
  const t = useTranslations("communities.settings.topics");
  const utils = api.useUtils();
  const { data: topics } = api.topics.list.useQuery({ communitySlug: slug });
  const [label, setLabel] = useState("");
  const [emoji, setEmoji] = useState("");

  const create = api.topics.create.useMutation({
    onSuccess: () => {
      setLabel("");
      setEmoji("");
      void utils.topics.list.invalidate();
    },
    onError: (e) =>
      toast.error(
        e.message === "TOPIC_CAP_REACHED"
          ? t("capReached")
          : e.message === "TOPIC_SLUG_EXISTS"
            ? t("slugExists")
            : t("createFailed"),
      ),
  });
  const remove = api.topics.remove.useMutation({
    onSuccess: () => void utils.topics.list.invalidate(),
    onError: (e) =>
      toast.error(
        e.message === "CANNOT_DELETE_DEFAULT" ? t("cannotDeleteDefault") : t("deleteFailed"),
      ),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
      </div>

      <ul className="space-y-2">
        {(topics ?? []).map((tp) => (
          <li key={tp.id} className="border-border flex items-center justify-between rounded-md border px-3 py-2">
            <span className="text-sm">
              {tp.emoji ? `${tp.emoji} ` : ""}
              {tp.label}
              {tp.isDefault ? ` · ${t("defaultTag")}` : ""}
            </span>
            {!tp.isDefault ? (
              <Button variant="ghost" size="icon" className="size-7" onClick={() => remove.mutate({ id: tp.id })} aria-label={t("delete")}>
                <Trash2 className="size-4" />
              </Button>
            ) : null}
          </li>
        ))}
      </ul>

      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!label.trim()) return;
          create.mutate({ communitySlug: slug, label: label.trim(), emoji: emoji.trim() || undefined });
        }}
      >
        <div className="w-16">
          <label className="text-muted-foreground text-xs">{t("emojiLabel")}</label>
          <Input value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={8} placeholder="⭐" />
        </div>
        <div className="flex-1">
          <label className="text-muted-foreground text-xs">{t("labelLabel")}</label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} placeholder={t("placeholder")} />
        </div>
        <Button type="submit" disabled={!label.trim() || create.isPending}>{t("add")}</Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Build the links settings component**

Create `src/components/communities/settings/links-settings.tsx`:

```typescript
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";

interface LinkRow {
  label: string;
  url: string;
  emoji?: string;
}

export function LinksSettings({ slug }: { slug: string }) {
  const t = useTranslations("communities.settings.links");
  const utils = api.useUtils();
  const { data } = api.links.list.useQuery({ communitySlug: slug });
  const [rows, setRows] = useState<LinkRow[]>([]);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (data && !initialized) {
      setRows(data.map((d) => ({ label: d.label, url: d.url, emoji: d.emoji ?? undefined })));
      setInitialized(true);
    }
  }, [data, initialized]);

  const save = api.links.setAll.useMutation({
    onSuccess: () => {
      toast.success(t("saved"));
      void utils.links.list.invalidate();
    },
    onError: () => toast.error(t("saveFailed")),
  });

  const update = (i: number, patch: Partial<LinkRow>) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
      </div>

      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="flex items-end gap-2">
            <Input className="w-16" value={row.emoji ?? ""} onChange={(e) => update(i, { emoji: e.target.value })} maxLength={8} placeholder="🔗" aria-label={t("emoji")} />
            <Input className="flex-1" value={row.label} onChange={(e) => update(i, { label: e.target.value })} maxLength={60} placeholder={t("labelPlaceholder")} />
            <Input className="flex-1" value={row.url} onChange={(e) => update(i, { url: e.target.value })} maxLength={500} placeholder="https://… or /communities/…" />
            <Button variant="ghost" size="icon" className="size-9" onClick={() => setRows((r) => r.filter((_, idx) => idx !== i))} aria-label={t("remove")}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setRows((r) => [...r, { label: "", url: "" }])}>
          <Plus className="mr-1.5 size-4" /> {t("addLink")}
        </Button>
        <Button
          onClick={() =>
            save.mutate({
              communitySlug: slug,
              links: rows.filter((r) => r.label.trim() && r.url.trim()),
            })
          }
          disabled={save.isPending}
        >
          {t("save")}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create the two settings pages**

Create `src/app/[locale]/communities/[slug]/settings/topics/page.tsx`:

```typescript
"use client";

import { use } from "react";
import { TopicsSettings } from "@/components/communities/settings/topics-settings";

export default function TopicsSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return <TopicsSettings slug={slug} />;
}
```

Create `src/app/[locale]/communities/[slug]/settings/links/page.tsx`:

```typescript
"use client";

import { use } from "react";
import { LinksSettings } from "@/components/communities/settings/links-settings";

export default function LinksSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return <LinksSettings slug={slug} />;
}
```

- [ ] **Step 6: Add the two settings nav entries**

Find the settings sidebar list (search: `rg -l "settings.sidebar" src/components` and `rg "general.*members.*invites" src/components`). In the array that renders the settings sidebar links (the one with `general`, `members`, `invites`, `rules`, `broadcast`, …), add two entries pointing to `${base}/topics` and `${base}/links` with keys `topics` and `links`. Match the existing item shape exactly.

- [ ] **Step 7: Add i18n keys**

In `messages/en.json` add under `communities.settings.sidebar`: `"topics": "Topics"`, `"links": "Links"`. Add a new `communities.settings.topics` block and `communities.settings.links` block:

```json
    "topics": {
      "title": "Feed Topics",
      "subtitle": "Organize the feed into topic chips members can filter by. Max 10.",
      "labelLabel": "Label",
      "emojiLabel": "Emoji",
      "placeholder": "e.g. Wins, Resources, Support",
      "add": "Add topic",
      "delete": "Delete",
      "defaultTag": "default",
      "capReached": "You can have at most 10 topics",
      "slugExists": "A topic with that name already exists",
      "cannotDeleteDefault": "The General topic cannot be deleted",
      "createFailed": "Could not create topic",
      "deleteFailed": "Could not delete topic"
    },
    "links": {
      "title": "Sidebar Links",
      "subtitle": "Curated links shown in the community sidebar. Point anywhere — an external URL or an internal path.",
      "labelPlaceholder": "Link label",
      "emoji": "Emoji",
      "addLink": "Add link",
      "remove": "Remove",
      "save": "Save",
      "saved": "Links saved",
      "saveFailed": "Could not save links"
    }
```

Mirror all keys in `messages/nl.json` with Dutch translations.

- [ ] **Step 8: Register routers + typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/server/api/routers/links.ts src/server/api/root.ts src/components/communities/settings/topics-settings.tsx src/components/communities/settings/links-settings.tsx "src/app/[locale]/communities/[slug]/settings/topics/page.tsx" "src/app/[locale]/communities/[slug]/settings/links/page.tsx" messages/en.json messages/nl.json
git commit -m "feat(feed): community links router + topics/links admin settings pages"
```

---

## Task 8: Stats + Links sections in the sidebar

**Files:**
- Modify: `src/components/communities/feed/community-sidebar.tsx`
- (Possibly) Modify: `src/server/api/routers/communities.ts` — add `adminCount` to `getBySlug` if not present

- [ ] **Step 1: Confirm the stats source**

Check `api.communities.getBySlug` return shape (search `getBySlug` in `src/server/api/routers/communities.ts`). It already returns `memberCount` and `liveness.activeContributors`. If it does NOT return an admin count, add one: in `getBySlug`, count active memberships with role in (`owner`,`admin`) and return it as `adminCount`. (Drizzle: `communityMemberships` filtered by `communityId`, `status:"active"`, `inArray(role, ["owner","admin"])`.) If adding it is non-trivial, omit the admins stat — members + active-this-week alone satisfy the design.

- [ ] **Step 2: Add the Stats + Links sections to the sidebar**

In `src/components/communities/feed/community-sidebar.tsx`, add the links query near the other queries (after line 51):

```typescript
  const { data: links } = api.links.list.useQuery({ communitySlug: slug });
  const { data: community } = api.communities.getBySlug.useQuery({ slug });
```

Insert a Stats section and a Links section at the top of the returned `<div className="flex flex-col gap-8">` (before the About section, line 59):

```typescript
      {/* Stats */}
      {community ? (
        <section>
          <SectionHeader title="/ STATS" />
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <Stat value={community.memberCount} label={t("members")} />
            {"adminCount" in community ? (
              <Stat value={(community as { adminCount: number }).adminCount} label={t("admins")} />
            ) : null}
            <Stat value={community.liveness?.activeContributors ?? 0} label={t("activeThisWeek")} />
          </div>
        </section>
      ) : null}

      {/* Links */}
      {links && links.length > 0 ? (
        <section>
          <SectionHeader title={`/ ${t("links").toUpperCase()}`} />
          <div className="mt-3 space-y-1">
            {links.map((link) => (
              <a
                key={link.id}
                href={link.url}
                target={link.url.startsWith("http") ? "_blank" : undefined}
                rel={link.url.startsWith("http") ? "noopener noreferrer" : undefined}
                className="border-border hover:bg-secondary/50 flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors"
              >
                {link.emoji ? <span className="shrink-0">{link.emoji}</span> : null}
                <span className="truncate font-medium">{link.label}</span>
              </a>
            ))}
          </div>
        </section>
      ) : null}
```

Add the `Stat` helper component at the bottom of the file (next to `Skeleton`/`EmptyState`):

```typescript
function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="border-border rounded-lg border px-2 py-3">
      <div className="text-lg font-bold">{value}</div>
      <div className="text-muted-foreground text-[10px] tracking-wider uppercase">{label}</div>
    </div>
  );
}
```

- [ ] **Step 3: Add i18n keys**

In `messages/en.json` under `communities.profile` add: `"admins": "Admins"`, `"activeThisWeek": "Active / wk"`, `"links": "Links"`. Mirror in `messages/nl.json`.

- [ ] **Step 4: Typecheck + smoke**

Run: `npx tsc --noEmit`
Expected: no errors. Then `npm run dev` and confirm the sidebar shows a Stats grid and (after adding some in settings) a Links list.

- [ ] **Step 5: Commit**

```bash
git add src/components/communities/feed/community-sidebar.tsx src/server/api/routers/communities.ts messages/en.json messages/nl.json
git commit -m "feat(feed): stats + curated links sections in community sidebar"
```

---

## Task 9: Full regression + final verification

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: all tests pass, including the new `topics.test.ts`, `feed-sort.test.ts`, `topic-chips.test.tsx`.

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 3: End-to-end manual pass (per repo convention — Payload paths aren't integration-tested)**

As a community **admin**:
1. Settings → Topics: add "Wins ⭐" and "Resources 📚"; confirm cap blocks an 11th; confirm "General" can't be deleted.
2. Feed: post under "Wins"; confirm the chip row filters to it; confirm "All" shows everything.
3. Pin a post → it jumps to the top on "All"; under "Wins" filter it appears in normal order. Try a 4th pin → `pinCapReached` toast.
4. Settings → Links: add an external link and an internal `/communities/<slug>/events` link; confirm both render in the sidebar and the external opens in a new tab.
5. Sidebar shows the Stats grid (members / admins / active-this-week).

As a **plain member**: confirm no pin action, no settings tabs, but chips + topic picker work.

- [ ] **Step 4: Final commit (if any fixups)**

```bash
git add -A
git commit -m "test(feed): regression pass for topics, pins, and sidebar"
```

---

## Self-Review Notes (verified against the spec)

- **Topics** = per-community admin-defined labels, one per post, seeded "General", cap 10, pure label+filter (no postPolicy) → Tasks 1–5, 7. ✅
- **Pins** = mirror forum `pinThread`, owner/admin/mod-gated, "All"-only, soft cap 3 → Tasks 1, 4, 6. ✅
- **Sidebar card** = stats (members, admins, active-this-week; NO "online") + curated links (any URL/path) → Tasks 7–8. ✅
- **Forum frozen** (ADR-0026): no forum files touched. ✅
- **No XP coupling / no level gating**: topics carry no XP, no `minLevel`. ✅
- **Type consistency**: `topicSlug`, `isPinned`, `community-topics`, `community-links`, `topics.list/create/update/remove`, `links.list/setAll`, `feed.pinPost` used consistently across tasks. ✅
- **i18n**: every new key added to both en.json and nl.json. ✅
- **Tests**: pure helpers (`topic-helpers`, `feed-sort`) + component (`topic-chips`) per repo convention; Payload paths verified manually (repo does not integration-test Payload). ✅
