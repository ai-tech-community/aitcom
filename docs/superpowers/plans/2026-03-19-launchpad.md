# Launchpad Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Launchpad" section to the AIT Community platform where entrepreneurs can share ideas/prototypes, track their journey, and get community feedback.

**Architecture:** Extend existing patterns — Payload CMS collection for project content, Drizzle tables for dynamic interactions (updates, comments, votes), new tRPC router for API, new Next.js route group under `/[locale]/launchpad`. Follows the same hybrid pattern used by community ideas, forum, and challenges.

**Tech Stack:** Next.js 15, React 19, TypeScript, Payload CMS 3, Drizzle ORM, tRPC 11, Zod, next-intl, Tailwind CSS 4, shadcn/ui

**Spec:** `docs/superpowers/specs/2026-03-19-launchpad-design.md`

---

## File Structure

### New Files
- `src/collections/LaunchpadProjects.ts` — Payload CMS collection definition
- `src/server/api/routers/launchpad.ts` — tRPC router with all procedures
- `src/app/[locale]/launchpad/page.tsx` — Listing page route
- `src/app/[locale]/launchpad/[slug]/page.tsx` — Project detail page route
- `src/app/[locale]/launchpad/new/page.tsx` — Create project page route
- `src/app/[locale]/launchpad/[slug]/edit/page.tsx` — Edit project page route
- `src/components/launchpad/launchpad-listing.tsx` — Listing page component
- `src/components/launchpad/launchpad-detail.tsx` — Project detail component
- `src/components/launchpad/launchpad-form.tsx` — Shared create/edit form
- `src/components/launchpad/launchpad-timeline.tsx` — Timeline updates section
- `src/components/launchpad/launchpad-comments.tsx` — Comments section
- `src/components/launchpad/launchpad-card.tsx` — Project card for listing grid

### Modified Files
- `src/server/db/schema.ts` — Add 3 new Drizzle tables + relations
- `src/payload.config.ts` — Register LaunchpadProjects collection
- `src/server/api/root.ts` — Register launchpad router
- `src/lib/gamification.ts` — Add XP amounts and badge definition
- `src/components/navbar.tsx` — Add Launchpad nav link
- `messages/en.json` — Add English translations
- `messages/nl.json` — Add Dutch translations

---

## Task 1: Drizzle Schema — Launchpad Tables

**Files:**
- Modify: `src/server/db/schema.ts` (append after benchmark tables, ~line 1166)

- [ ] **Step 1: Add launchpad tables to schema.ts**

Add the following after the `benchmarkVotesRelations` block at the end of `src/server/db/schema.ts`:

```typescript
// ── Launchpad ────────────────────────────────────────────────────────────────

export const launchpadUpdates = appSchema.table(
  "launchpad_update",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: d.integer().notNull(),
    authorId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    title: d.varchar({ length: 500 }).notNull(),
    content: d.text().notNull(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    index("launchpad_update_project_idx").on(t.projectId),
    index("launchpad_update_author_idx").on(t.authorId),
  ],
);

export const launchpadComments = appSchema.table(
  "launchpad_comment",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: d.integer().notNull(),
    authorId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    content: d.text().notNull(),
    parentId: d.varchar({ length: 255 }),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    index("launchpad_comment_project_idx").on(t.projectId),
    index("launchpad_comment_author_idx").on(t.authorId),
    index("launchpad_comment_parent_idx").on(t.parentId),
  ],
);

export const launchpadVotes = appSchema.table(
  "launchpad_vote",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: d.integer().notNull(),
    voterId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    uniqueIndex("launchpad_vote_project_voter_idx").on(t.projectId, t.voterId),
  ],
);

// ── Launchpad Relations ──────────────────────────────────────────────────────

export const launchpadUpdateRelations = relations(
  launchpadUpdates,
  ({ one }) => ({
    author: one(user, {
      fields: [launchpadUpdates.authorId],
      references: [user.id],
    }),
  }),
);

export const launchpadCommentRelations = relations(
  launchpadComments,
  ({ one }) => ({
    author: one(user, {
      fields: [launchpadComments.authorId],
      references: [user.id],
    }),
    parent: one(launchpadComments, {
      fields: [launchpadComments.parentId],
      references: [launchpadComments.id],
    }),
  }),
);

export const launchpadVoteRelations = relations(
  launchpadVotes,
  ({ one }) => ({
    voter: one(user, {
      fields: [launchpadVotes.voterId],
      references: [user.id],
    }),
  }),
);
```

- [ ] **Step 2: Generate and run the migration**

```bash
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
```

Expected: Migration creates 3 tables in the `app` schema with all indexes.

- [ ] **Step 3: Verify build**

```bash
pnpm build
```

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/server/db/schema.ts drizzle/
git commit -m "feat(launchpad): add Drizzle schema tables for updates, comments, votes"
```

---

## Task 2: Payload CMS Collection — LaunchpadProjects

**Files:**
- Create: `src/collections/LaunchpadProjects.ts`
- Modify: `src/payload.config.ts`

- [ ] **Step 1: Create the LaunchpadProjects collection**

Create `src/collections/LaunchpadProjects.ts`:

```typescript
import type { CollectionConfig } from "payload";

export const LaunchpadProjects: CollectionConfig = {
  slug: "launchpad-projects",
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "stage", "status", "voteCount", "authorName", "createdAt"],
    description: "Entrepreneur projects shared on Launchpad for community feedback.",
  },
  fields: [
    {
      name: "title",
      type: "text",
      required: true,
    },
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      admin: {
        description: "URL-friendly identifier. Auto-generated from title on creation.",
      },
    },
    {
      name: "pitch",
      type: "richText",
      required: true,
    },
    {
      name: "stage",
      type: "select",
      required: true,
      defaultValue: "idea",
      options: [
        { label: "Idea", value: "idea" },
        { label: "Prototype", value: "prototype" },
        { label: "MVP", value: "mvp" },
        { label: "Launched", value: "launched" },
      ],
      admin: { position: "sidebar" },
    },
    {
      name: "tags",
      type: "array",
      fields: [
        {
          name: "tag",
          type: "text",
          required: true,
        },
      ],
      admin: { position: "sidebar" },
    },
    {
      name: "links",
      type: "array",
      fields: [
        {
          name: "label",
          type: "text",
          required: true,
        },
        {
          name: "url",
          type: "text",
          required: true,
        },
      ],
    },
    {
      name: "coverImage",
      type: "upload",
      relationTo: "media",
    },
    {
      name: "authorId",
      type: "text",
      required: true,
      admin: {
        position: "sidebar",
        description: "Better Auth user ID (UUID).",
      },
    },
    {
      name: "authorName",
      type: "text",
      admin: { position: "sidebar", readOnly: true },
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "draft",
      options: [
        { label: "Draft", value: "draft" },
        { label: "Published", value: "published" },
        { label: "Archived", value: "archived" },
      ],
      admin: { position: "sidebar" },
    },
    {
      name: "voteCount",
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
      name: "updateCount",
      type: "number",
      defaultValue: 0,
      admin: { position: "sidebar", readOnly: true },
    },
  ],
  timestamps: true,
};
```

- [ ] **Step 2: Register in payload.config.ts**

In `src/payload.config.ts`, add the import and the collection:

```typescript
// Add import at top with other collection imports:
import { LaunchpadProjects } from "./collections/LaunchpadProjects";

// Add to the collections array (after CommunityIdeas or at the end):
LaunchpadProjects,
```

- [ ] **Step 3: Verify build**

```bash
pnpm build
```

Expected: Build succeeds. Payload auto-generates the `launchpad-projects` table in the `public` schema on next startup.

- [ ] **Step 4: Commit**

```bash
git add src/collections/LaunchpadProjects.ts src/payload.config.ts
git commit -m "feat(launchpad): add Payload CMS collection for LaunchpadProjects"
```

---

## Task 3: Gamification — XP Amounts and Badge

**Files:**
- Modify: `src/lib/gamification.ts`

- [ ] **Step 1: Add the "first_launch" badge definition**

In `src/lib/gamification.ts`, add to the `BADGES` object (after `tutorial_creator`):

```typescript
  first_launch: {
    slug: "first_launch",
    name: "First Launch",
    description: "Published your first project on Launchpad",
    icon: "🚀",
  },
```

- [ ] **Step 2: Add XP amounts for Launchpad actions**

In `src/lib/gamification.ts`, add to the `XP_AMOUNTS` object (after `FORUM_RECEIVE_REPLY`):

```typescript
  LAUNCHPAD_PROJECT_CREATE: 15,
  LAUNCHPAD_UPDATE_POST: 10,
  LAUNCHPAD_COMMENT_CREATE: 5,
  LAUNCHPAD_RECEIVE_VOTE: 3,
  LAUNCHPAD_RECEIVE_COMMENT: 3,
```

- [ ] **Step 3: Verify build**

```bash
pnpm build
```

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/lib/gamification.ts
git commit -m "feat(launchpad): add XP amounts and First Launch badge"
```

---

## Task 4: tRPC Router — Core CRUD Procedures

**Files:**
- Create: `src/server/api/routers/launchpad.ts`
- Modify: `src/server/api/root.ts`

- [ ] **Step 1: Create the launchpad router with list and getBySlug**

Create `src/server/api/routers/launchpad.ts`:

```typescript
import { z } from "zod";
import { eq, and, desc, gte, sql, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { Where } from "payload";

import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
} from "@/server/api/trpc";
import { getPayloadClient } from "@/server/payload";
import { logActivity } from "@/server/agent/activity";
import { awardXp, awardBadge, XP_AMOUNTS } from "@/lib/gamification";
import {
  launchpadUpdates,
  launchpadComments,
  launchpadVotes,
  notifications,
  user,
  memberProfiles,
} from "@/server/db/schema";

// Reuse the same pattern from community.ts
async function requireRulesAcceptance(userId: string) {
  const payload = await getPayloadClient();
  const rules = await payload.findGlobal({ slug: "community-rules" });

  if (!rules?.content) return; // No rules configured

  const { docs } = await payload.find({
    collection: "rules-acceptance",
    where: {
      and: [
        { userId: { equals: userId } },
        { rulesVersion: { equals: rules.version } },
      ],
    },
    limit: 1,
  });

  if (docs.length === 0) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "You must accept the community rules before participating.",
    });
  }
}

export const launchpadRouter = createTRPCRouter({
  list: publicProcedure
    .input(
      z.object({
        sort: z
          .enum(["newest", "mostVoted", "recentlyUpdated", "trending"])
          .default("newest"),
        stage: z
          .enum(["all", "idea", "prototype", "mvp", "launched"])
          .default("all"),
        tag: z.string().max(50).optional(),
        search: z.string().max(200).optional(),
        limit: z.number().min(1).max(50).default(20),
        page: z.number().min(1).default(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      const payload = await getPayloadClient();

      const conditions: Where[] = [
        { status: { equals: "published" } },
      ];

      if (input.stage !== "all") {
        conditions.push({ stage: { equals: input.stage } });
      }

      if (input.tag) {
        conditions.push({ "tags.tag": { equals: input.tag } });
      }

      if (input.search) {
        conditions.push({
          or: [
            { title: { like: input.search } },
            { "tags.tag": { like: input.search } },
          ],
        });
      }

      const sortMap: Record<string, string> = {
        newest: "-createdAt",
        mostVoted: "-voteCount",
        recentlyUpdated: "-updatedAt",
        trending: "-voteCount", // base sort; trending is refined below
      };

      const result = await payload.find({
        collection: "launchpad-projects",
        where: { and: conditions },
        sort: sortMap[input.sort] ?? "-createdAt",
        limit: input.limit,
        page: input.page,
        depth: 0,
      });

      let projects = result.docs;

      // For trending: re-query votes from the last 7 days
      if (input.sort === "trending" && projects.length > 0) {
        const projectIds = projects.map((p) => p.id);
        const sevenDaysAgo = new Date(
          Date.now() - 7 * 24 * 60 * 60 * 1000,
        );
        const recentVotes = await ctx.db
          .select({
            projectId: launchpadVotes.projectId,
            count: sql<number>`count(*)::int`,
          })
          .from(launchpadVotes)
          .where(
            and(
              inArray(launchpadVotes.projectId, projectIds),
              gte(launchpadVotes.createdAt, sevenDaysAgo),
            ),
          )
          .groupBy(launchpadVotes.projectId);

        const voteCounts = new Map(
          recentVotes.map((v) => [v.projectId, v.count]),
        );

        projects = [...projects].sort(
          (a, b) =>
            (voteCounts.get(b.id) ?? 0) - (voteCounts.get(a.id) ?? 0),
        );
      }

      // If logged in, check which projects the user has voted on
      const userId = ctx.session?.user?.id;
      let votedProjectIds = new Set<number>();

      if (userId) {
        const myVotes = await ctx.db
          .select({ projectId: launchpadVotes.projectId })
          .from(launchpadVotes)
          .where(eq(launchpadVotes.voterId, userId));
        votedProjectIds = new Set(myVotes.map((v) => v.projectId));
      }

      return {
        projects: projects.map((p) => ({
          ...p,
          hasVoted: votedProjectIds.has(p.id),
        })),
        totalPages: result.totalPages,
        totalDocs: result.totalDocs,
        page: result.page,
        hasNextPage: result.hasNextPage,
      };
    }),

  getBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const payload = await getPayloadClient();

      const { docs } = await payload.find({
        collection: "launchpad-projects",
        where: { slug: { equals: input.slug } },
        limit: 1,
        depth: 1, // resolve coverImage media
      });

      const project = docs[0];
      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }

      // Fetch updates
      const updates = await ctx.db
        .select({
          id: launchpadUpdates.id,
          title: launchpadUpdates.title,
          content: launchpadUpdates.content,
          createdAt: launchpadUpdates.createdAt,
        })
        .from(launchpadUpdates)
        .where(eq(launchpadUpdates.projectId, project.id))
        .orderBy(desc(launchpadUpdates.createdAt));

      // Fetch comments with author info
      const comments = await ctx.db
        .select({
          id: launchpadComments.id,
          content: launchpadComments.content,
          parentId: launchpadComments.parentId,
          createdAt: launchpadComments.createdAt,
          authorId: launchpadComments.authorId,
          authorName: user.name,
          authorImage: user.image,
        })
        .from(launchpadComments)
        .innerJoin(user, eq(launchpadComments.authorId, user.id))
        .where(eq(launchpadComments.projectId, project.id))
        .orderBy(launchpadComments.createdAt);

      // Check if current user has voted
      const userId = ctx.session?.user?.id;
      let hasVoted = false;

      if (userId) {
        const [vote] = await ctx.db
          .select({ id: launchpadVotes.id })
          .from(launchpadVotes)
          .where(
            and(
              eq(launchpadVotes.projectId, project.id),
              eq(launchpadVotes.voterId, userId),
            ),
          )
          .limit(1);
        hasVoted = !!vote;
      }

      // Fetch author profile for XP/level/badges display
      const [authorProfile] = await ctx.db
        .select({
          userId: memberProfiles.userId,
          displayName: memberProfiles.displayName,
          xp: memberProfiles.xp,
          level: memberProfiles.level,
        })
        .from(memberProfiles)
        .where(eq(memberProfiles.userId, project.authorId))
        .limit(1);

      return {
        ...project,
        updates,
        comments,
        hasVoted,
        authorProfile: authorProfile ?? null,
      };
    }),

  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(3).max(200),
        pitch: z.any(), // Lexical rich text JSON
        stage: z.enum(["idea", "prototype", "mvp", "launched"]),
        tags: z.array(z.string().max(50)).max(10).default([]),
        links: z
          .array(
            z.object({
              label: z.string().min(1).max(100),
              url: z.string().url().max(500),
            }),
          )
          .max(10)
          .default([]),
        coverImage: z.number().optional(), // Payload media ID
        status: z.enum(["draft", "published"]).default("draft"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireRulesAcceptance(ctx.session.user.id);
      const payload = await getPayloadClient();
      const userName = ctx.session.user.name ?? "member";

      // Generate slug from title
      const baseSlug = input.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      // Check for slug collision and append suffix if needed
      let slug = baseSlug;
      let suffix = 0;
      while (true) {
        const { docs } = await payload.find({
          collection: "launchpad-projects",
          where: { slug: { equals: slug } },
          limit: 1,
          depth: 0,
        });
        if (docs.length === 0) break;
        suffix++;
        slug = `${baseSlug}-${suffix}`;
      }

      const project = await payload.create({
        collection: "launchpad-projects",
        data: {
          title: input.title,
          slug,
          pitch: input.pitch,
          stage: input.stage,
          tags: input.tags.map((tag) => ({ tag })),
          links: input.links,
          coverImage: input.coverImage ?? undefined,
          authorId: ctx.session.user.id,
          authorName: userName,
          status: input.status,
          voteCount: 0,
          commentCount: 0,
          updateCount: 0,
        },
      });

      if (input.status === "published") {
        await logActivity(ctx.db, {
          actorId: ctx.session.user.id,
          actorType: "member",
          action: "launchpad.project.published",
          targetType: "launchpad-projects",
          targetId: String(project.id),
          metadata: { title: input.title, stage: input.stage },
        });

        await awardXp(
          ctx.db,
          ctx.session.user.id,
          XP_AMOUNTS.LAUNCHPAD_PROJECT_CREATE,
        );
        await awardBadge(ctx.db, ctx.session.user.id, "first_launch");
      }

      return { id: project.id, slug };
    }),

  update: protectedProcedure
    .input(
      z.object({
        projectId: z.number(),
        title: z.string().min(3).max(200).optional(),
        pitch: z.any().optional(),
        stage: z.enum(["idea", "prototype", "mvp", "launched"]).optional(),
        tags: z.array(z.string().max(50)).max(10).optional(),
        links: z
          .array(
            z.object({
              label: z.string().min(1).max(100),
              url: z.string().url().max(500),
            }),
          )
          .max(10)
          .optional(),
        coverImage: z.number().nullable().optional(),
        status: z.enum(["draft", "published", "archived"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();

      const project = await payload.findByID({
        collection: "launchpad-projects",
        id: input.projectId,
        depth: 0,
      });

      if (project.authorId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not the project author" });
      }

      const data: Record<string, unknown> = {};
      if (input.title !== undefined) data.title = input.title;
      if (input.pitch !== undefined) data.pitch = input.pitch;
      if (input.stage !== undefined) data.stage = input.stage;
      if (input.tags !== undefined) data.tags = input.tags.map((tag) => ({ tag }));
      if (input.links !== undefined) data.links = input.links;
      if (input.coverImage !== undefined)
        data.coverImage = input.coverImage ?? undefined;
      if (input.status !== undefined) data.status = input.status;

      await payload.update({
        collection: "launchpad-projects",
        id: input.projectId,
        data,
      });

      return { success: true };
    }),

  archive: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();

      const project = await payload.findByID({
        collection: "launchpad-projects",
        id: input.projectId,
        depth: 0,
      });

      if (project.authorId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not the project author" });
      }

      await payload.update({
        collection: "launchpad-projects",
        id: input.projectId,
        data: { status: "archived" },
      });

      return { success: true };
    }),

  postUpdate: protectedProcedure
    .input(
      z.object({
        projectId: z.number(),
        title: z.string().min(1).max(500),
        content: z.string().min(1).max(10000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireRulesAcceptance(ctx.session.user.id);
      const payload = await getPayloadClient();

      const project = await payload.findByID({
        collection: "launchpad-projects",
        id: input.projectId,
        depth: 0,
      });

      if (project.authorId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not the project author" });
      }

      const [update] = await ctx.db
        .insert(launchpadUpdates)
        .values({
          projectId: input.projectId,
          authorId: ctx.session.user.id,
          title: input.title,
          content: input.content,
        })
        .returning();

      // Increment update count on project
      await payload.update({
        collection: "launchpad-projects",
        id: input.projectId,
        data: { updateCount: (project.updateCount ?? 0) + 1 },
      });

      await logActivity(ctx.db, {
        actorId: ctx.session.user.id,
        actorType: "member",
        action: "launchpad.update.posted",
        targetType: "launchpad-projects",
        targetId: String(input.projectId),
        metadata: { title: input.title, projectTitle: project.title },
      });

      await awardXp(
        ctx.db,
        ctx.session.user.id,
        XP_AMOUNTS.LAUNCHPAD_UPDATE_POST,
      );

      return update;
    }),

  vote: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireRulesAcceptance(ctx.session.user.id);
      const payload = await getPayloadClient();
      const userId = ctx.session.user.id;

      const project = await payload.findByID({
        collection: "launchpad-projects",
        id: input.projectId,
        depth: 0,
      });

      const [existingVote] = await ctx.db
        .select({ id: launchpadVotes.id })
        .from(launchpadVotes)
        .where(
          and(
            eq(launchpadVotes.projectId, input.projectId),
            eq(launchpadVotes.voterId, userId),
          ),
        )
        .limit(1);

      if (existingVote) {
        // Remove vote
        await ctx.db
          .delete(launchpadVotes)
          .where(eq(launchpadVotes.id, existingVote.id));

        await payload.update({
          collection: "launchpad-projects",
          id: input.projectId,
          data: { voteCount: Math.max(0, (project.voteCount ?? 0) - 1) },
        });

        return { voted: false };
      } else {
        // Add vote
        await ctx.db.insert(launchpadVotes).values({
          projectId: input.projectId,
          voterId: userId,
        });

        await payload.update({
          collection: "launchpad-projects",
          id: input.projectId,
          data: { voteCount: (project.voteCount ?? 0) + 1 },
        });

        await logActivity(ctx.db, {
          actorId: userId,
          actorType: "member",
          action: "launchpad.project.voted",
          targetType: "launchpad-projects",
          targetId: String(input.projectId),
          metadata: { title: project.title },
        });

        // Award XP to project author for receiving a vote
        if (project.authorId !== userId) {
          await awardXp(
            ctx.db,
            project.authorId,
            XP_AMOUNTS.LAUNCHPAD_RECEIVE_VOTE,
          );

          // Notify project author
          await ctx.db.insert(notifications).values({
            userId: project.authorId,
            type: "launchpad_vote",
            title: "New vote on your project",
            content: `Someone voted for "${project.title}"`,
            metadata: {
              projectId: input.projectId,
              projectSlug: project.slug,
            },
          });
        }

        return { voted: true };
      }
    }),

  addComment: protectedProcedure
    .input(
      z.object({
        projectId: z.number(),
        content: z.string().min(1).max(5000),
        parentId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireRulesAcceptance(ctx.session.user.id);
      const payload = await getPayloadClient();

      const project = await payload.findByID({
        collection: "launchpad-projects",
        id: input.projectId,
        depth: 0,
      });

      const [comment] = await ctx.db
        .insert(launchpadComments)
        .values({
          projectId: input.projectId,
          authorId: ctx.session.user.id,
          content: input.content,
          parentId: input.parentId ?? null,
        })
        .returning();

      // Increment comment count
      await payload.update({
        collection: "launchpad-projects",
        id: input.projectId,
        data: { commentCount: (project.commentCount ?? 0) + 1 },
      });

      await logActivity(ctx.db, {
        actorId: ctx.session.user.id,
        actorType: "member",
        action: "launchpad.comment.created",
        targetType: "launchpad-projects",
        targetId: String(input.projectId),
        metadata: {
          projectTitle: project.title,
          isReply: !!input.parentId,
        },
      });

      await awardXp(
        ctx.db,
        ctx.session.user.id,
        XP_AMOUNTS.LAUNCHPAD_COMMENT_CREATE,
      );

      // Notify project author (unless commenting on own project)
      if (project.authorId !== ctx.session.user.id) {
        await awardXp(
          ctx.db,
          project.authorId,
          XP_AMOUNTS.LAUNCHPAD_RECEIVE_COMMENT,
        );

        await ctx.db.insert(notifications).values({
          userId: project.authorId,
          type: "launchpad_comment",
          title: input.parentId
            ? "New reply on your project"
            : "New comment on your project",
          content: `${ctx.session.user.name ?? "Someone"} commented on "${project.title}"`,
          metadata: {
            projectId: input.projectId,
            projectSlug: project.slug,
            commentId: comment!.id,
          },
        });
      }

      // If this is a reply, also notify the parent comment author
      if (input.parentId) {
        const [parentComment] = await ctx.db
          .select({ authorId: launchpadComments.authorId })
          .from(launchpadComments)
          .where(eq(launchpadComments.id, input.parentId))
          .limit(1);

        if (
          parentComment &&
          parentComment.authorId !== ctx.session.user.id &&
          parentComment.authorId !== project.authorId
        ) {
          await ctx.db.insert(notifications).values({
            userId: parentComment.authorId,
            type: "launchpad_reply",
            title: "Someone replied to your comment",
            content: `${ctx.session.user.name ?? "Someone"} replied to your comment on "${project.title}"`,
            metadata: {
              projectId: input.projectId,
              projectSlug: project.slug,
              commentId: comment!.id,
            },
          });
        }
      }

      return comment;
    }),

  deleteComment: protectedProcedure
    .input(z.object({ commentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [comment] = await ctx.db
        .select()
        .from(launchpadComments)
        .where(eq(launchpadComments.id, input.commentId))
        .limit(1);

      if (!comment) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Comment not found" });
      }

      // Check authorization: comment author or admin
      const isCommentAuthor = comment.authorId === ctx.session.user.id;
      // Check admin role from Payload
      const payload = await getPayloadClient();
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

      await ctx.db
        .delete(launchpadComments)
        .where(eq(launchpadComments.id, input.commentId));

      // Decrement comment count
      const project = await payload.findByID({
        collection: "launchpad-projects",
        id: comment.projectId,
        depth: 0,
      });
      await payload.update({
        collection: "launchpad-projects",
        id: comment.projectId,
        data: {
          commentCount: Math.max(0, (project.commentCount ?? 0) - 1),
        },
      });

      return { success: true };
    }),
});
```

- [ ] **Step 2: Register the router in root.ts**

In `src/server/api/root.ts`, add the import and register:

```typescript
// Add import:
import { launchpadRouter } from "@/server/api/routers/launchpad";

// Add to createTRPCRouter object:
  launchpad: launchpadRouter,
```

- [ ] **Step 3: Verify build**

```bash
pnpm build
```

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/server/api/routers/launchpad.ts src/server/api/root.ts
git commit -m "feat(launchpad): add tRPC router with all CRUD and interaction procedures"
```

---

## Task 5: i18n — Translation Keys

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/nl.json`

- [ ] **Step 1: Add English translations**

Add a `"launchpad"` key to `messages/en.json` and a `"launchpad"` entry under `"nav"`:

Under `"nav"`:
```json
"launchpad": "Launchpad"
```

New top-level section:
```json
"launchpad": {
  "title": "Launchpad",
  "subtitle": "Share your ideas and prototypes. Get feedback from the community.",
  "submitProject": "Submit Project",
  "editProject": "Edit Project",
  "postUpdate": "Post Update",
  "noProjects": "No projects yet. Be the first to launch!",
  "stage": {
    "idea": "Idea",
    "prototype": "Prototype",
    "mvp": "MVP",
    "launched": "Launched"
  },
  "sort": {
    "newest": "Newest",
    "mostVoted": "Most Voted",
    "recentlyUpdated": "Recently Updated",
    "trending": "Trending"
  },
  "filter": {
    "allStages": "All Stages"
  },
  "form": {
    "title": "Project Title",
    "titlePlaceholder": "What are you building?",
    "pitch": "Pitch",
    "pitchPlaceholder": "Describe your idea...",
    "stage": "Current Stage",
    "tags": "Tags",
    "tagsPlaceholder": "Add a tag",
    "links": "Links",
    "linkLabel": "Label",
    "linkUrl": "URL",
    "addLink": "Add Link",
    "coverImage": "Cover Image",
    "saveDraft": "Save as Draft",
    "publish": "Publish",
    "saveChanges": "Save Changes"
  },
  "update": {
    "title": "Update Title",
    "titlePlaceholder": "What's new?",
    "content": "Update Content",
    "contentPlaceholder": "Share your progress...",
    "submit": "Post Update",
    "timeline": "Timeline",
    "noUpdates": "No updates yet."
  },
  "comments": {
    "title": "Comments",
    "placeholder": "Share your feedback...",
    "submit": "Post Comment",
    "reply": "Reply",
    "delete": "Delete",
    "noComments": "No comments yet. Be the first to share feedback!",
    "signInToComment": "Sign in to leave feedback"
  },
  "vote": {
    "signInToVote": "Sign in to vote"
  },
  "detail": {
    "by": "by",
    "pitch": "Pitch",
    "links": "Links",
    "archived": "This project has been archived."
  }
}
```

- [ ] **Step 2: Add Dutch translations**

Add matching keys to `messages/nl.json`:

Under `"nav"`:
```json
"launchpad": "Launchpad"
```

New top-level section:
```json
"launchpad": {
  "title": "Launchpad",
  "subtitle": "Deel je ideeën en prototypes. Ontvang feedback van de community.",
  "submitProject": "Project Indienen",
  "editProject": "Project Bewerken",
  "postUpdate": "Update Plaatsen",
  "noProjects": "Nog geen projecten. Wees de eerste!",
  "stage": {
    "idea": "Idee",
    "prototype": "Prototype",
    "mvp": "MVP",
    "launched": "Gelanceerd"
  },
  "sort": {
    "newest": "Nieuwste",
    "mostVoted": "Meeste Stemmen",
    "recentlyUpdated": "Recent Bijgewerkt",
    "trending": "Trending"
  },
  "filter": {
    "allStages": "Alle Fases"
  },
  "form": {
    "title": "Projectnaam",
    "titlePlaceholder": "Wat bouw je?",
    "pitch": "Pitch",
    "pitchPlaceholder": "Beschrijf je idee...",
    "stage": "Huidige Fase",
    "tags": "Tags",
    "tagsPlaceholder": "Voeg een tag toe",
    "links": "Links",
    "linkLabel": "Label",
    "linkUrl": "URL",
    "addLink": "Link Toevoegen",
    "coverImage": "Omslagafbeelding",
    "saveDraft": "Opslaan als Concept",
    "publish": "Publiceren",
    "saveChanges": "Wijzigingen Opslaan"
  },
  "update": {
    "title": "Update Titel",
    "titlePlaceholder": "Wat is er nieuw?",
    "content": "Update Inhoud",
    "contentPlaceholder": "Deel je voortgang...",
    "submit": "Update Plaatsen",
    "timeline": "Tijdlijn",
    "noUpdates": "Nog geen updates."
  },
  "comments": {
    "title": "Reacties",
    "placeholder": "Deel je feedback...",
    "submit": "Reactie Plaatsen",
    "reply": "Reageren",
    "delete": "Verwijderen",
    "noComments": "Nog geen reacties. Wees de eerste om feedback te geven!",
    "signInToComment": "Log in om feedback te geven"
  },
  "vote": {
    "signInToVote": "Log in om te stemmen"
  },
  "detail": {
    "by": "door",
    "pitch": "Pitch",
    "links": "Links",
    "archived": "Dit project is gearchiveerd."
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add messages/en.json messages/nl.json
git commit -m "feat(launchpad): add English and Dutch translations"
```

---

## Task 6: Navigation — Add Launchpad Link

**Files:**
- Modify: `src/components/navbar.tsx`

- [ ] **Step 1: Add Launchpad to navLinks array**

In `src/components/navbar.tsx`, add to the `navLinks` array:

```typescript
{ href: "/launchpad", key: "launchpad", shortcut: "L" },
```

Place it near "community" since they're related concepts.

- [ ] **Step 2: Verify build**

```bash
pnpm build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/navbar.tsx
git commit -m "feat(launchpad): add Launchpad to main navigation"
```

---

## Task 7: Frontend — Launchpad Card Component

**Files:**
- Create: `src/components/launchpad/launchpad-card.tsx`

- [ ] **Step 1: Create the project card component**

Create `src/components/launchpad/launchpad-card.tsx`. This card is used in the listing grid.

Follow the existing component patterns:
- `"use client"` directive
- `useTranslations("launchpad")` for i18n
- `Link` from `@/i18n/navigation`
- shadcn/ui `Card`, `Badge` components
- Display: cover image (if any), title, stage badge, author name, tags, vote count, comment count
- Vote button with optimistic update (follow ideas-modal.tsx pattern)

The card should link to `/launchpad/[slug]`.

- [ ] **Step 2: Commit**

```bash
git add src/components/launchpad/launchpad-card.tsx
git commit -m "feat(launchpad): add LaunchpadCard component"
```

---

## Task 8: Frontend — Listing Page

**Files:**
- Create: `src/app/[locale]/launchpad/page.tsx`
- Create: `src/components/launchpad/launchpad-listing.tsx`

- [ ] **Step 1: Create the listing page route**

Create `src/app/[locale]/launchpad/page.tsx`:

```typescript
import type { Metadata } from "next";
import { buildAlternates, buildOgMeta } from "@/lib/metadata";
import { LaunchpadListing } from "@/components/launchpad/launchpad-listing";

export const metadata: Metadata = {
  title: "Launchpad",
  description:
    "Share your ideas and prototypes. Get feedback from the AI Tech Community.",
  ...buildOgMeta(
    "Launchpad",
    "Share your ideas and prototypes. Get feedback from the AI Tech Community.",
    "Launchpad",
  ),
  alternates: buildAlternates("/launchpad"),
};

export default function LaunchpadPage() {
  return <LaunchpadListing />;
}
```

- [ ] **Step 2: Create the listing component**

Create `src/components/launchpad/launchpad-listing.tsx`.

Follow the `forum-page.tsx` pattern:
- `"use client"` with state for sort, stage filter, search, page
- `api.launchpad.list.useQuery(...)` with debounced search
- Grid of `LaunchpadCard` components
- Sort dropdown (newest, mostVoted, recentlyUpdated, trending)
- Stage filter dropdown (all, idea, prototype, mvp, launched)
- Tag filter (clickable tag pills from visible projects, or dropdown)
- Search input with debounce
- Pagination (next/prev)
- "Submit Project" button linking to `/launchpad/new` (shown only if authenticated)
- Empty state message when no projects

- [ ] **Step 3: Verify build**

```bash
pnpm build
```

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/[locale]/launchpad/page.tsx src/components/launchpad/launchpad-listing.tsx
git commit -m "feat(launchpad): add listing page with sort, filter, search"
```

---

## Task 9: Frontend — Timeline and Comments Components

**Files:**
- Create: `src/components/launchpad/launchpad-timeline.tsx`
- Create: `src/components/launchpad/launchpad-comments.tsx`

- [ ] **Step 1: Create the timeline component**

Create `src/components/launchpad/launchpad-timeline.tsx`:
- Displays a list of updates in reverse chronological order
- Each update shows: title, content, date
- If the current user is the author, show a "Post Update" button that opens an inline form
- The form calls `api.launchpad.postUpdate.useMutation(...)` and invalidates `getBySlug`

- [ ] **Step 2: Create the comments component**

Create `src/components/launchpad/launchpad-comments.tsx`:
- Follow existing forum reply patterns
- Display threaded comments (top-level + replies grouped by parentId)
- Each comment shows: author name, avatar, content, date, reply button, delete button (if author/admin)
- Comment form at the top for adding new comments
- Reply form appears inline when "Reply" is clicked
- Uses `api.launchpad.addComment.useMutation(...)` and `api.launchpad.deleteComment.useMutation(...)`
- signin prompt for unauthenticated users

- [ ] **Step 3: Commit**

```bash
git add src/components/launchpad/launchpad-timeline.tsx src/components/launchpad/launchpad-comments.tsx
git commit -m "feat(launchpad): add Timeline and Comments components"
```

---

## Task 10: Frontend — Project Detail Page

**Files:**
- Create: `src/app/[locale]/launchpad/[slug]/page.tsx`
- Create: `src/components/launchpad/launchpad-detail.tsx`

- [ ] **Step 1: Create the detail page route**

Create `src/app/[locale]/launchpad/[slug]/page.tsx`:

```typescript
import type { Metadata } from "next";
import { getPayloadClient } from "@/server/payload";
import { buildAlternates, buildOgMeta } from "@/lib/metadata";
import { LaunchpadDetail } from "@/components/launchpad/launchpad-detail";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const payload = await getPayloadClient();
  const { docs } = await payload.find({
    collection: "launchpad-projects",
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
  });

  const project = docs[0];
  if (!project) {
    return { title: "Project Not Found" };
  }

  return {
    title: `${project.title} - Launchpad`,
    description: `${project.title} — a ${project.stage} stage project on AIT Community Launchpad`,
    ...buildOgMeta(
      project.title,
      `${project.title} — a ${project.stage} stage project on AIT Community Launchpad`,
      "Launchpad",
    ),
    alternates: buildAlternates(`/launchpad/${slug}`),
  };
}

export default async function LaunchpadProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <LaunchpadDetail slug={slug} />;
}
```

- [ ] **Step 2: Create the detail component**

Create `src/components/launchpad/launchpad-detail.tsx`:
- `"use client"` component that receives `slug` as a prop
- Calls `api.launchpad.getBySlug.useQuery({ slug })`
- Layout sections:
  - **Header**: cover image (full-width banner if present), title, stage badge, author info (name, level from authorProfile), vote button + count, external links as buttons/pills
  - **Pitch section**: render Lexical rich text content (use Payload's rich text renderer or equivalent)
  - **Timeline section**: `<LaunchpadTimeline>` component
  - **Comments section**: `<LaunchpadComments>` component
- If current user is the author, show "Edit Project" link and "Post Update" access
- Vote button with optimistic update (toggle via `api.launchpad.vote.useMutation(...)`)
- Loading skeleton while fetching
- 404 handling if project not found

- [ ] **Step 3: Verify build**

```bash
pnpm build
```

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/[locale]/launchpad/[slug]/page.tsx src/components/launchpad/launchpad-detail.tsx
git commit -m "feat(launchpad): add project detail page with pitch, timeline, comments"
```

---

## Task 11: Frontend — Create and Edit Forms

**Files:**
- Create: `src/components/launchpad/launchpad-form.tsx`
- Create: `src/app/[locale]/launchpad/new/page.tsx`
- Create: `src/app/[locale]/launchpad/[slug]/edit/page.tsx`

- [ ] **Step 1: Create the shared form component**

Create `src/components/launchpad/launchpad-form.tsx`:
- Shared form used for both create and edit
- Props: `mode: "create" | "edit"`, optional `initialData` for edit mode
- Fields: title input, rich text editor for pitch (use the same Lexical editor as forum threads), stage select, tags input (add/remove chips), links array (label + URL pairs with add/remove), cover image upload, status toggle (draft/published)
- On submit: calls `api.launchpad.create.useMutation(...)` or `api.launchpad.update.useMutation(...)`
- After successful create: redirect to `/launchpad/[slug]`
- After successful edit: redirect to `/launchpad/[slug]`
- Uses `useTranslations("launchpad.form")` for labels

- [ ] **Step 2: Create the "new project" page**

Create `src/app/[locale]/launchpad/new/page.tsx`:

```typescript
import type { Metadata } from "next";
import { LaunchpadForm } from "@/components/launchpad/launchpad-form";

export const metadata: Metadata = {
  title: "Submit Project - Launchpad",
};

export default function NewLaunchpadProjectPage() {
  return <LaunchpadForm mode="create" />;
}
```

- [ ] **Step 3: Create the "edit project" page**

Create `src/app/[locale]/launchpad/[slug]/edit/page.tsx`:

```typescript
import { LaunchpadForm } from "@/components/launchpad/launchpad-form";

export default async function EditLaunchpadProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <LaunchpadForm mode="edit" slug={slug} />;
}
```

The form component in edit mode fetches the project data via `api.launchpad.getBySlug.useQuery({ slug })` and pre-fills the form.

- [ ] **Step 4: Verify build**

```bash
pnpm build
```

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/launchpad/launchpad-form.tsx src/app/[locale]/launchpad/new/page.tsx src/app/[locale]/launchpad/[slug]/edit/page.tsx
git commit -m "feat(launchpad): add create and edit project pages with shared form"
```

---

## Task 12: Final Verification

- [ ] **Step 1: Run full build**

```bash
pnpm build
```

Expected: Full Next.js build succeeds with zero errors.

- [ ] **Step 2: Start dev server and manually verify**

```bash
pnpm dev
```

Verify:
- `/launchpad` listing page renders
- Navigation shows "Launchpad" link with "L" shortcut
- Create project form at `/launchpad/new` works
- Published project appears in listing
- Project detail page at `/launchpad/[slug]` shows pitch, timeline, comments
- Voting toggles correctly
- Comments and replies work
- Edit form pre-fills and saves
- Timeline updates post correctly
- Stage filter and sort work on listing page
- Dutch locale shows translated strings

- [ ] **Step 3: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix(launchpad): address issues found during manual testing"
```
