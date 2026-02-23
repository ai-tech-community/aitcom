# Community Board Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the `/community` page as a full-viewport isometric village board where four clickable CSS buildings open Framer Motion modals for Community Rules, Ideas & Voting, Discussion Threads, and Contribute.

**Architecture:** Full-stack feature on the existing Next.js 15 monolith. New Drizzle tables (`forum_threads`, `forum_replies`, `community_ideas`, `idea_votes`) in the `app` schema. A Payload CMS Global (`CommunityRules`) managed via the admin. tRPC `communityRouter` for all mutations/queries. React client components for the board, buildings, and modals — server component only for the page wrapper.

**Tech Stack:** Next.js 15 App Router, Drizzle ORM (PostgreSQL, `app` schema), tRPC 11, Payload CMS (Global), Framer Motion, Tailwind CSS 4, shadcn/ui, next-intl, Better Auth (`protectedProcedure`), Lucide React icons

---

## Context

- Drizzle schema: `src/server/db/schema.ts` — all tables use `appSchema` (`pgSchema("app")`), `casing: "snake_case"`, varchar for UUIDs
- tRPC pattern: `src/server/api/routers/events.ts` and `members.ts` — use `createTRPCRouter`, `publicProcedure`, `protectedProcedure` from `@/server/api/trpc`
- Root router: `src/server/api/root.ts` — add `community: communityRouter`
- Payload config: `src/payload.config.ts` — add `globals: [CommunityRules]`
- i18n: `messages/en.json` and `messages/nl.json` — `community` key already exists in `nav` but needs a full namespace
- Layout: `src/app/[locale]/layout.tsx` — main has light gradient bg; community page must set `bg-zinc-950` to override
- Navbar already has `/community` link — no changes needed
- Migrations: run `npx drizzle-kit generate` then add entry to `src/migrations/index.ts`
- The `LexicalRenderer` component at `src/lib/lexical.tsx` already exists — reuse for rendering Rules content

---

## Task 1: Add DB tables — forum_threads, forum_replies, community_ideas, idea_votes

**Files:**
- Modify: `src/server/db/schema.ts`

**Step 1: Add four new tables to the end of `src/server/db/schema.ts`**

Add after the last table (`memberBadgeRelations`):

```typescript
// Forum threads
export const forumThreads = appSchema.table(
  "forum_thread",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    slug: d.varchar({ length: 255 }).notNull().unique(),
    title: d.varchar({ length: 255 }).notNull(),
    content: d.text().notNull(),
    authorId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    category: d
      .varchar({ length: 20 })
      .notNull()
      .default("general")
      .$type<"general" | "question" | "showcase" | "job">(),
    isPinned: d.boolean().default(false).notNull(),
    isLocked: d.boolean().default(false).notNull(),
    replyCount: d.integer().default(0).notNull(),
    lastActivityAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    index("forum_thread_author_idx").on(t.authorId),
    index("forum_thread_category_idx").on(t.category),
    index("forum_thread_last_activity_idx").on(t.lastActivityAt),
  ],
);

export const forumThreadRelations = relations(forumThreads, ({ one, many }) => ({
  author: one(user, { fields: [forumThreads.authorId], references: [user.id] }),
  replies: many(forumReplies),
}));

// Forum replies
export const forumReplies = appSchema.table(
  "forum_reply",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    threadId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => forumThreads.id, { onDelete: "cascade" }),
    authorId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    content: d.text().notNull(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    index("forum_reply_thread_idx").on(t.threadId),
    index("forum_reply_author_idx").on(t.authorId),
  ],
);

export const forumReplyRelations = relations(forumReplies, ({ one }) => ({
  thread: one(forumThreads, { fields: [forumReplies.threadId], references: [forumThreads.id] }),
  author: one(user, { fields: [forumReplies.authorId], references: [user.id] }),
}));

// Community ideas (voting board)
export const communityIdeas = appSchema.table(
  "community_idea",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    title: d.varchar({ length: 100 }).notNull(),
    description: d.text(),
    authorId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    status: d
      .varchar({ length: 20 })
      .notNull()
      .default("open")
      .$type<"open" | "implemented" | "rejected">(),
    voteCount: d.integer().default(0).notNull(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    index("community_idea_author_idx").on(t.authorId),
    index("community_idea_votes_idx").on(t.voteCount),
  ],
);

export const communityIdeaRelations = relations(communityIdeas, ({ one, many }) => ({
  author: one(user, { fields: [communityIdeas.authorId], references: [user.id] }),
  votes: many(ideaVotes),
}));

// Idea votes — composite PK prevents double-voting
export const ideaVotes = appSchema.table(
  "idea_vote",
  (d) => ({
    ideaId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => communityIdeas.id, { onDelete: "cascade" }),
    userId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    uniqueIndex("idea_vote_uidx").on(t.ideaId, t.userId),
    index("idea_vote_idea_idx").on(t.ideaId),
  ],
);

export const ideaVoteRelations = relations(ideaVotes, ({ one }) => ({
  idea: one(communityIdeas, { fields: [ideaVotes.ideaId], references: [communityIdeas.id] }),
  user: one(user, { fields: [ideaVotes.userId], references: [user.id] }),
}));
```

**Step 2: Generate migration**

```bash
npx drizzle-kit generate
```

Expected: creates a new file in `src/migrations/` like `20260223_XXXXXX.ts` and a JSON snapshot.

**Step 3: Register migration in `src/migrations/index.ts`**

Open `src/migrations/index.ts` and add the new migration import. Pattern from the existing file:

```typescript
import * as migration_20260223_064427 from './20260223_064427';
import * as migration_XXXXXXXXXXXXXXXX from './XXXXXXXXXXXXXXXX'; // ← use the actual filename

export const migrations = [
  {
    up: migration_20260223_064427.up,
    down: migration_20260223_064427.down,
    name: '20260223_064427'
  },
  {
    up: migration_XXXXXXXXXXXXXXXX.up,
    down: migration_XXXXXXXXXXXXXXXX.down,
    name: 'XXXXXXXXXXXXXXXX'  // ← use actual name without extension
  },
];
```

**Step 4: Run migration against database**

```bash
npx drizzle-kit migrate
```

Expected: "Applying migration XXXXXXXX..." followed by success.

**Step 5: Commit**

```bash
git add src/server/db/schema.ts src/migrations/
git commit -m "feat: add forum threads, replies, community ideas and votes tables"
```

---

## Task 2: Add Payload CommunityRules Global

**Files:**
- Create: `src/collections/CommunityRules.ts`
- Modify: `src/payload.config.ts`

**Step 1: Create `src/collections/CommunityRules.ts`**

```typescript
import type { GlobalConfig } from "payload";

export const CommunityRules: GlobalConfig = {
  slug: "community-rules",
  label: "Community Rules",
  admin: {
    description: "The community code of conduct displayed on the Community board.",
  },
  fields: [
    {
      name: "content",
      type: "richText",
      label: "Rules Content",
      required: true,
    },
  ],
};
```

**Step 2: Register global in `src/payload.config.ts`**

Add the import at the top:
```typescript
import { CommunityRules } from "./collections/CommunityRules";
```

Add `globals` array to the `buildConfig` call (after `collections`):
```typescript
globals: [CommunityRules],
```

**Step 3: Regenerate Payload types**

```bash
npx payload generate:types
```

Expected: `src/payload-types.ts` updated with `CommunityRules` global type.

**Step 4: Commit**

```bash
git add src/collections/CommunityRules.ts src/payload.config.ts src/payload-types.ts
git commit -m "feat: add CommunityRules Payload global"
```

---

## Task 3: Add community i18n translations

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/nl.json`

**Step 1: Add `community` namespace to `messages/en.json`**

Add after the `"blog"` object:

```json
"community": {
  "title": "Community",
  "subtitle": "The AIT community board. Explore, participate, and contribute.",
  "rules": {
    "title": "Community Rules",
    "building": "The Constitution",
    "subtitle": "How we work together"
  },
  "ideas": {
    "title": "Ideas & Voting",
    "building": "Town Hall",
    "subtitle": "Shape the community",
    "mostVoted": "Most Voted",
    "recent": "Recent",
    "submit": "Submit Idea",
    "submitting": "Submitting...",
    "titleLabel": "Idea Title",
    "titlePlaceholder": "What should we build or change?",
    "descriptionLabel": "Description (optional)",
    "descriptionPlaceholder": "Tell us more...",
    "loginToVote": "Sign in to vote",
    "loginToSubmit": "Sign in to submit ideas",
    "noIdeas": "No ideas yet. Be the first!",
    "statusOpen": "Open",
    "statusImplemented": "Implemented",
    "statusRejected": "Rejected"
  },
  "threads": {
    "title": "Discussion",
    "building": "The Forum",
    "subtitle": "Ask, share, connect",
    "all": "All",
    "general": "General",
    "question": "Question",
    "showcase": "Showcase",
    "job": "Jobs",
    "newThread": "New Thread",
    "titleLabel": "Title",
    "titlePlaceholder": "What's on your mind?",
    "contentLabel": "Content",
    "contentPlaceholder": "Write your post...",
    "categoryLabel": "Category",
    "noThreads": "No threads yet. Start the conversation!",
    "replies": "{count} replies",
    "loginToPost": "Sign in to post",
    "readThread": "Read thread →"
  },
  "contribute": {
    "title": "Get Involved",
    "building": "The Workshop",
    "subtitle": "Help us grow",
    "speak": {
      "title": "Speak at an Event",
      "description": "Share your expertise with the community. We welcome talks on AI, automation, and innovation.",
      "cta": "Express Interest"
    },
    "write": {
      "title": "Write an Article",
      "description": "Contribute tutorials, deep-dives, or talk write-ups to the blog.",
      "cta": "Go to Dashboard"
    },
    "mentor": {
      "title": "Mentor a Member",
      "description": "Help junior engineers grow. Mentorship connections coming soon.",
      "cta": "Coming Soon"
    },
    "partner": {
      "title": "Partner / Sponsor",
      "description": "Support the community and connect with Dutch tech talent.",
      "cta": "Get in Touch"
    }
  }
},
```

**Step 2: Add `community` namespace to `messages/nl.json`**

Add after the `"blog"` object:

```json
"community": {
  "title": "Community",
  "subtitle": "Het AIT community board. Verken, doe mee en draag bij.",
  "rules": {
    "title": "Community Regels",
    "building": "De Grondwet",
    "subtitle": "Hoe we samenwerken"
  },
  "ideas": {
    "title": "Ideeën & Stemmen",
    "building": "Gemeentehuis",
    "subtitle": "Vorm de community",
    "mostVoted": "Meest gestemd",
    "recent": "Recent",
    "submit": "Idee indienen",
    "submitting": "Indienen...",
    "titleLabel": "Idee titel",
    "titlePlaceholder": "Wat moeten we bouwen of veranderen?",
    "descriptionLabel": "Beschrijving (optioneel)",
    "descriptionPlaceholder": "Vertel ons meer...",
    "loginToVote": "Inloggen om te stemmen",
    "loginToSubmit": "Inloggen om ideeën in te dienen",
    "noIdeas": "Nog geen ideeën. Wees de eerste!",
    "statusOpen": "Open",
    "statusImplemented": "Geïmplementeerd",
    "statusRejected": "Afgewezen"
  },
  "threads": {
    "title": "Discussie",
    "building": "Het Forum",
    "subtitle": "Vraag, deel, verbind",
    "all": "Alle",
    "general": "Algemeen",
    "question": "Vraag",
    "showcase": "Showcase",
    "job": "Vacatures",
    "newThread": "Nieuw topic",
    "titleLabel": "Titel",
    "titlePlaceholder": "Wat heb je op je hart?",
    "contentLabel": "Inhoud",
    "contentPlaceholder": "Schrijf je bericht...",
    "categoryLabel": "Categorie",
    "noThreads": "Nog geen topics. Start het gesprek!",
    "replies": "{count} reacties",
    "loginToPost": "Inloggen om te posten",
    "readThread": "Lees topic →"
  },
  "contribute": {
    "title": "Doe mee",
    "building": "De Workshop",
    "subtitle": "Help ons groeien",
    "speak": {
      "title": "Spreek op een evenement",
      "description": "Deel je expertise met de community. We verwelkomen talks over AI, automatisering en innovatie.",
      "cta": "Interesse tonen"
    },
    "write": {
      "title": "Schrijf een artikel",
      "description": "Draag tutorials, deep-dives of lezing verslagen bij aan de blog.",
      "cta": "Naar dashboard"
    },
    "mentor": {
      "title": "Begeleid een lid",
      "description": "Help junior engineers groeien. Mentorverbindingen komen binnenkort.",
      "cta": "Binnenkort"
    },
    "partner": {
      "title": "Partner / Sponsor",
      "description": "Ondersteun de community en maak contact met Nederlands tech talent.",
      "cta": "Neem contact op"
    }
  }
},
```

**Step 3: Commit**

```bash
git add messages/en.json messages/nl.json
git commit -m "feat: add community i18n translations"
```

---

## Task 4: Build tRPC community router

**Files:**
- Create: `src/server/api/routers/community.ts`
- Modify: `src/server/api/root.ts`

**Step 1: Create `src/server/api/routers/community.ts`**

```typescript
import { z } from "zod";
import { eq, and, sql, desc } from "drizzle-orm";

import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
} from "@/server/api/trpc";
import {
  communityIdeas,
  ideaVotes,
  forumThreads,
  user,
} from "@/server/db/schema";
import { getPayloadClient } from "@/server/payload";

export const communityRouter = createTRPCRouter({
  // ── Rules ──────────────────────────────────────────────────────────────────

  getRules: publicProcedure.query(async () => {
    const payload = await getPayloadClient();
    const rules = await payload.findGlobal({ slug: "community-rules" });
    return rules;
  }),

  // ── Ideas ──────────────────────────────────────────────────────────────────

  getIdeas: publicProcedure
    .input(
      z.object({
        sort: z.enum(["votes", "recent"]).default("votes"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          id: communityIdeas.id,
          title: communityIdeas.title,
          description: communityIdeas.description,
          status: communityIdeas.status,
          voteCount: communityIdeas.voteCount,
          authorId: communityIdeas.authorId,
          createdAt: communityIdeas.createdAt,
          authorName: user.name,
        })
        .from(communityIdeas)
        .leftJoin(user, eq(communityIdeas.authorId, user.id))
        .orderBy(
          input.sort === "votes"
            ? desc(communityIdeas.voteCount)
            : desc(communityIdeas.createdAt),
        )
        .limit(50);

      // If authenticated, also fetch which ideas the user has voted on
      const userId = ctx.session?.user?.id;
      if (!userId) {
        return rows.map((r) => ({ ...r, hasVoted: false }));
      }

      const votes = await ctx.db
        .select({ ideaId: ideaVotes.ideaId })
        .from(ideaVotes)
        .where(eq(ideaVotes.userId, userId));

      const votedSet = new Set(votes.map((v) => v.ideaId));

      return rows.map((r) => ({ ...r, hasVoted: votedSet.has(r.id) }));
    }),

  submitIdea: protectedProcedure
    .input(
      z.object({
        title: z.string().min(3).max(100),
        description: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [idea] = await ctx.db
        .insert(communityIdeas)
        .values({
          title: input.title,
          description: input.description ?? null,
          authorId: ctx.session.user.id,
        })
        .returning();

      return idea!;
    }),

  toggleVote: protectedProcedure
    .input(z.object({ ideaId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Check if vote exists
      const [existing] = await ctx.db
        .select()
        .from(ideaVotes)
        .where(
          and(
            eq(ideaVotes.ideaId, input.ideaId),
            eq(ideaVotes.userId, userId),
          ),
        )
        .limit(1);

      if (existing) {
        // Remove vote
        await ctx.db
          .delete(ideaVotes)
          .where(
            and(
              eq(ideaVotes.ideaId, input.ideaId),
              eq(ideaVotes.userId, userId),
            ),
          );
        await ctx.db
          .update(communityIdeas)
          .set({ voteCount: sql`${communityIdeas.voteCount} - 1` })
          .where(eq(communityIdeas.id, input.ideaId));
        return { voted: false };
      } else {
        // Add vote
        await ctx.db.insert(ideaVotes).values({
          ideaId: input.ideaId,
          userId,
        });
        await ctx.db
          .update(communityIdeas)
          .set({ voteCount: sql`${communityIdeas.voteCount} + 1` })
          .where(eq(communityIdeas.id, input.ideaId));
        return { voted: true };
      }
    }),

  // ── Threads ────────────────────────────────────────────────────────────────

  getThreads: publicProcedure
    .input(
      z.object({
        category: z
          .enum(["all", "general", "question", "showcase", "job"])
          .default("all"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          id: forumThreads.id,
          slug: forumThreads.slug,
          title: forumThreads.title,
          category: forumThreads.category,
          isPinned: forumThreads.isPinned,
          replyCount: forumThreads.replyCount,
          lastActivityAt: forumThreads.lastActivityAt,
          createdAt: forumThreads.createdAt,
          authorId: forumThreads.authorId,
          authorName: user.name,
          authorImage: user.image,
        })
        .from(forumThreads)
        .leftJoin(user, eq(forumThreads.authorId, user.id))
        .where(
          input.category === "all"
            ? undefined
            : eq(forumThreads.category, input.category),
        )
        .orderBy(
          sql`${forumThreads.isPinned} DESC`,
          desc(forumThreads.lastActivityAt),
        )
        .limit(30);

      return rows;
    }),

  createThread: protectedProcedure
    .input(
      z.object({
        title: z.string().min(3).max(255),
        content: z.string().min(10).max(10000),
        category: z.enum(["general", "question", "showcase", "job"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Generate slug from title
      const baseSlug = input.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80);
      const slug = `${baseSlug}-${Date.now()}`;

      const [thread] = await ctx.db
        .insert(forumThreads)
        .values({
          slug,
          title: input.title,
          content: input.content,
          authorId: ctx.session.user.id,
          category: input.category,
        })
        .returning();

      return thread!;
    }),
});
```

**Step 2: Register router in `src/server/api/root.ts`**

Add import:
```typescript
import { communityRouter } from "@/server/api/routers/community";
```

Add to `appRouter`:
```typescript
export const appRouter = createTRPCRouter({
  post: postRouter,
  events: eventsRouter,
  members: membersRouter,
  community: communityRouter,  // ← add this
});
```

**Step 3: Check TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

**Step 4: Commit**

```bash
git add src/server/api/routers/community.ts src/server/api/root.ts
git commit -m "feat: add community tRPC router (ideas, threads, rules)"
```

---

## Task 5: Build IsometricBuilding and BuildingCard components

**Files:**
- Create: `src/components/community/isometric-building.tsx`
- Create: `src/components/community/building-card.tsx`

**Step 1: Create `src/components/community/isometric-building.tsx`**

This component renders a CSS isometric box using SVG polygons. The `size` prop controls overall scale. Three faces: top (lightest), left (mid), right (darkest).

```tsx
import React from "react";

type IsometricBuildingProps = {
  /** Base width in px — the building footprint (isometric square side) */
  size?: number;
  /** Building height in px */
  height?: number;
  /** Base color hsl string or tailwind hex — used to derive face tones */
  color?: string;
  /** Accent color (e.g. orange) for windows/highlights */
  accent?: string;
  /** Number of window rows to draw */
  windows?: number;
};

/**
 * Renders an isometric box as an inline SVG.
 *
 * Geometry: standard isometric projection.
 * - The "footprint" is a rhombus at the top.
 * - Left face and right face hang below it.
 *
 * Coordinate system (all in SVG user units):
 *   w = size  (footprint side in isometric 2D)
 *   h = height
 *
 * Isometric top face vertices (rhombus):
 *   top-center (tc):   (w, 0)
 *   right (r):         (2w, w*0.5)
 *   bottom-center(bc): (w, w)
 *   left (l):          (0, w*0.5)
 *
 * Left face (below left side of rhombus):
 *   (0, w*0.5), (w, w), (w, w + h), (0, w*0.5 + h)
 *
 * Right face (below right side of rhombus):
 *   (w, w), (2w, w*0.5), (2w, w*0.5 + h), (w, w + h)
 */
export function IsometricBuilding({
  size = 60,
  height = 80,
  color = "#3f3f46",   // zinc-700
  accent = "#f97316",  // orange-500
  windows = 2,
}: IsometricBuildingProps) {
  const w = size;
  const h = height;

  // Derive face colors from base color
  // In a real project you'd compute lighter/darker shades;
  // here we use hardcoded zinc shades that work for the dark theme.
  const topFace   = "#52525b"; // zinc-600
  const leftFace  = "#27272a"; // zinc-800
  const rightFace = "#18181b"; // zinc-900

  // SVG viewBox dimensions
  const vbW = w * 2;
  const vbH = w + h;

  // Top rhombus
  const topPts = `${w},0 ${w * 2},${w * 0.5} ${w},${w} 0,${w * 0.5}`;

  // Left face
  const leftPts = `0,${w * 0.5} ${w},${w} ${w},${w + h} 0,${w * 0.5 + h}`;

  // Right face
  const rightPts = `${w},${w} ${w * 2},${w * 0.5} ${w * 2},${w * 0.5 + h} ${w},${w + h}`;

  // Window positions on the right face (2 columns × windows rows)
  const windowEls: React.ReactNode[] = [];
  if (windows > 0) {
    const rowH = h / (windows + 1);
    for (let row = 1; row <= windows; row++) {
      const y0 = w + row * rowH - 4;
      // right face: x goes from w to 2w as y goes from w to w+h (skewed)
      // window offset in right face local coords: col 1 at ~30%, col 2 at ~65%
      for (const col of [0.32, 0.65]) {
        const xOffset = col * w;
        // The right face skews horizontally: as y increases by 1, x decreases by 0.5
        const skewX = ((y0 - w) / h) * w * 0; // no skew correction needed for simple rects
        const wx = w + xOffset;
        const wy = y0;
        windowEls.push(
          <rect
            key={`w-${row}-${col}`}
            x={wx}
            y={wy}
            width={5}
            height={6}
            fill={accent}
            opacity={0.7}
            rx={0.5}
          />,
        );
      }
    }
  }

  return (
    <svg
      viewBox={`0 0 ${vbW} ${vbH}`}
      width={vbW}
      height={vbH}
      style={{ display: "block", overflow: "visible" }}
      aria-hidden="true"
    >
      {/* Right face */}
      <polygon points={rightPts} fill={rightFace} />
      {/* Left face */}
      <polygon points={leftPts} fill={leftFace} />
      {/* Top face */}
      <polygon points={topPts} fill={topFace} />

      {/* Outline strokes for crispness */}
      <polygon points={topPts} fill="none" stroke="#000" strokeWidth={0.5} opacity={0.4} />
      <polygon points={leftPts} fill="none" stroke="#000" strokeWidth={0.5} opacity={0.4} />
      <polygon points={rightPts} fill="none" stroke="#000" strokeWidth={0.5} opacity={0.4} />

      {/* Windows */}
      {windowEls}
    </svg>
  );
}
```

**Step 2: Create `src/components/community/building-card.tsx`**

```tsx
"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { IsometricBuilding } from "./isometric-building";

type BuildingCardProps = {
  icon: LucideIcon;
  label: string;
  sublabel: string;
  size?: "sm" | "md" | "lg";
  accent?: boolean;
  onClick: () => void;
};

const sizeConfig = {
  sm: { buildingSize: 50, buildingHeight: 55, windows: 1 },
  md: { buildingSize: 65, buildingHeight: 75, windows: 2 },
  lg: { buildingSize: 80, buildingHeight: 100, windows: 3 },
};

export function BuildingCard({
  icon: Icon,
  label,
  sublabel,
  size = "md",
  accent = false,
  onClick,
}: BuildingCardProps) {
  const cfg = sizeConfig[size];

  return (
    <motion.button
      className="group flex cursor-pointer flex-col items-center gap-2 p-4 focus:outline-none"
      onClick={onClick}
      whileHover={{ y: -6 }}
      whileTap={{ scale: 0.96 }}
      transition={{ type: "spring", stiffness: 400, damping: 20 }}
      aria-label={label}
    >
      {/* Building SVG */}
      <div
        className="relative"
        style={{
          filter: accent
            ? "drop-shadow(0 0 12px rgb(249 115 22 / 0.4))"
            : "drop-shadow(0 4px 6px rgb(0 0 0 / 0.5))",
          transition: "filter 0.2s",
        }}
      >
        {/* Glow on hover */}
        <div
          className="pointer-events-none absolute inset-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{ opacity: 0 }}
        >
          <div
            className="h-full w-full rounded-full opacity-30 blur-xl"
            style={{
              background: accent
                ? "rgb(249 115 22)"
                : "rgb(161 161 170)",
            }}
          />
        </div>

        <IsometricBuilding
          size={cfg.buildingSize}
          height={cfg.buildingHeight}
          windows={cfg.windows}
          accent={accent ? "#f97316" : "#f97316"}
        />
      </div>

      {/* Icon badge on top of building */}
      <div
        className={`absolute -mt-2 flex h-7 w-7 items-center justify-center rounded-full border ${
          accent
            ? "border-orange-500/50 bg-orange-500/10 text-orange-400"
            : "border-zinc-700 bg-zinc-800 text-zinc-400"
        } transition-colors duration-200 group-hover:border-orange-500/50 group-hover:text-orange-400`}
        style={{
          marginTop: -(cfg.buildingHeight * 0.4),
          marginLeft: cfg.buildingSize * 0.9,
        }}
      >
        <Icon className="h-3.5 w-3.5" />
      </div>

      {/* Label */}
      <div className="flex flex-col items-center">
        <span className="font-mono text-[11px] font-semibold tracking-widest text-zinc-300 uppercase group-hover:text-white transition-colors duration-200">
          {label}
        </span>
        <span className="font-mono text-[9px] tracking-wide text-zinc-600 group-hover:text-zinc-500 transition-colors duration-200">
          {sublabel}
        </span>
      </div>
    </motion.button>
  );
}
```

**Step 3: Check TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

**Step 4: Commit**

```bash
git add src/components/community/
git commit -m "feat: add IsometricBuilding and BuildingCard components"
```

---

## Task 6: Build modal shell and four modal contents

**Files:**
- Create: `src/components/community/building-modal.tsx`
- Create: `src/components/community/modals/rules-modal.tsx`
- Create: `src/components/community/modals/ideas-modal.tsx`
- Create: `src/components/community/modals/threads-modal.tsx`
- Create: `src/components/community/modals/contribute-modal.tsx`

**Step 1: Create `src/components/community/building-modal.tsx`**

```tsx
"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

type BuildingModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  accent?: boolean;
  children: React.ReactNode;
};

export function BuildingModal({
  isOpen,
  onClose,
  title,
  subtitle,
  accent = false,
  children,
}: BuildingModalProps) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Modal panel */}
          <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              className="pointer-events-auto relative w-full max-w-2xl rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl"
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              {/* Header */}
              <div
                className={`flex items-start justify-between border-b border-zinc-800 px-6 py-4 ${
                  accent ? "border-l-2 border-l-orange-500" : ""
                }`}
              >
                <div>
                  <h2 className="font-mono text-sm font-bold tracking-widest text-white uppercase">
                    {title}
                  </h2>
                  {subtitle && (
                    <p className="mt-0.5 font-mono text-[10px] tracking-wider text-zinc-500">
                      {subtitle}
                    </p>
                  )}
                </div>
                <button
                  onClick={onClose}
                  className="ml-4 shrink-0 rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Content */}
              <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
                {children}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
```

**Step 2: Create `src/components/community/modals/rules-modal.tsx`**

```tsx
"use client";

import { api } from "@/trpc/react";
import { LexicalRenderer } from "@/lib/lexical";
import { BuildingModal } from "../building-modal";

type RulesModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
};

export function RulesModal({ isOpen, onClose, title, subtitle }: RulesModalProps) {
  const { data, isLoading } = api.community.getRules.useQuery(undefined, {
    enabled: isOpen,
    staleTime: 5 * 60 * 1000, // 5 min cache
  });

  return (
    <BuildingModal isOpen={isOpen} onClose={onClose} title={title} subtitle={subtitle}>
      {isLoading && (
        <div className="space-y-2 py-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-4 animate-pulse rounded bg-zinc-800" />
          ))}
        </div>
      )}
      {data && (
        <div className="prose-invert prose prose-sm max-w-none">
          <LexicalRenderer content={data.content} />
        </div>
      )}
      {!isLoading && !data && (
        <p className="py-4 font-mono text-xs text-zinc-500">
          Community rules are being written. Check back soon.
        </p>
      )}
    </BuildingModal>
  );
}
```

**Step 3: Create `src/components/community/modals/ideas-modal.tsx`**

```tsx
"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronUp, Lightbulb } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { BuildingModal } from "../building-modal";
import { toast } from "sonner";

type IdeasModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
};

const statusColors: Record<string, string> = {
  open: "text-zinc-400 border-zinc-700",
  implemented: "text-green-400 border-green-800",
  rejected: "text-zinc-600 border-zinc-800",
};

export function IdeasModal({ isOpen, onClose, title, subtitle }: IdeasModalProps) {
  const t = useTranslations("community.ideas");
  const [sort, setSort] = useState<"votes" | "recent">("votes");
  const [showForm, setShowForm] = useState(false);
  const [ideaTitle, setIdeaTitle] = useState("");
  const [ideaDesc, setIdeaDesc] = useState("");

  const { data: session } = authClient.useSession();
  const utils = api.useUtils();

  const { data: ideas = [], isLoading } = api.community.getIdeas.useQuery(
    { sort },
    { enabled: isOpen },
  );

  const submitMutation = api.community.submitIdea.useMutation({
    onSuccess: () => {
      setIdeaTitle("");
      setIdeaDesc("");
      setShowForm(false);
      void utils.community.getIdeas.invalidate();
      toast.success("Idea submitted!");
    },
    onError: (err) => toast.error(err.message),
  });

  const voteMutation = api.community.toggleVote.useMutation({
    onMutate: async ({ ideaId }) => {
      // Optimistic update
      await utils.community.getIdeas.cancel();
      const prev = utils.community.getIdeas.getData({ sort });
      utils.community.getIdeas.setData({ sort }, (old) =>
        old?.map((idea) =>
          idea.id === ideaId
            ? {
                ...idea,
                hasVoted: !idea.hasVoted,
                voteCount: idea.hasVoted ? idea.voteCount - 1 : idea.voteCount + 1,
              }
            : idea,
        ),
      );
      return { prev };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.prev) utils.community.getIdeas.setData({ sort }, ctx.prev);
    },
    onSettled: () => void utils.community.getIdeas.invalidate(),
  });

  return (
    <BuildingModal isOpen={isOpen} onClose={onClose} title={title} subtitle={subtitle} accent>
      {/* Sort tabs */}
      <div className="mb-4 flex gap-1 border-b border-zinc-800 pb-3">
        {(["votes", "recent"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSort(s)}
            className={`rounded px-3 py-1 font-mono text-[10px] font-semibold tracking-widest uppercase transition-colors ${
              sort === s
                ? "bg-orange-500/10 text-orange-400"
                : "text-zinc-600 hover:text-zinc-400"
            }`}
          >
            {s === "votes" ? t("mostVoted") : t("recent")}
          </button>
        ))}
      </div>

      {/* Ideas list */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-zinc-800" />
          ))}
        </div>
      ) : ideas.length === 0 ? (
        <p className="py-6 text-center font-mono text-xs text-zinc-500">{t("noIdeas")}</p>
      ) : (
        <div className="space-y-2">
          {ideas.map((idea) => (
            <motion.div
              key={idea.id}
              className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-800/40 p-3"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {/* Vote button */}
              <button
                onClick={() => {
                  if (!session?.user) {
                    toast.info(t("loginToVote"));
                    return;
                  }
                  voteMutation.mutate({ ideaId: idea.id });
                }}
                className={`flex shrink-0 flex-col items-center gap-0.5 rounded px-2 py-1.5 font-mono text-[10px] font-bold transition-colors ${
                  idea.hasVoted
                    ? "bg-orange-500/10 text-orange-400"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                <ChevronUp className="h-3 w-3" />
                {idea.voteCount}
              </button>

              {/* Content */}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-zinc-200 leading-snug">{idea.title}</p>
                {idea.description && (
                  <p className="mt-0.5 text-[11px] text-zinc-500 leading-relaxed line-clamp-2">
                    {idea.description}
                  </p>
                )}
                <div className="mt-1 flex items-center gap-2">
                  <span
                    className={`rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider ${statusColors[idea.status]}`}
                  >
                    {t(`status${idea.status.charAt(0).toUpperCase()}${idea.status.slice(1)}` as keyof typeof t)}
                  </span>
                  <span className="font-mono text-[9px] text-zinc-600">
                    {idea.authorName ?? "member"}
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Submit idea section */}
      <div className="mt-4 border-t border-zinc-800 pt-4">
        {!session?.user ? (
          <p className="font-mono text-[10px] text-zinc-600">{t("loginToSubmit")}</p>
        ) : !showForm ? (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 font-mono text-[10px] font-semibold tracking-widest text-orange-500 uppercase hover:text-orange-400 transition-colors"
          >
            <Lightbulb className="h-3 w-3" />
            {t("submit")}
          </button>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitMutation.mutate({ title: ideaTitle, description: ideaDesc || undefined });
            }}
            className="space-y-3"
          >
            <div>
              <label className="mb-1 block font-mono text-[10px] font-semibold tracking-wider text-zinc-400 uppercase">
                {t("titleLabel")}
              </label>
              <input
                value={ideaTitle}
                onChange={(e) => setIdeaTitle(e.target.value)}
                placeholder={t("titlePlaceholder")}
                maxLength={100}
                required
                className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-orange-500/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block font-mono text-[10px] font-semibold tracking-wider text-zinc-400 uppercase">
                {t("descriptionLabel")}
              </label>
              <textarea
                value={ideaDesc}
                onChange={(e) => setIdeaDesc(e.target.value)}
                placeholder={t("descriptionPlaceholder")}
                maxLength={500}
                rows={3}
                className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-orange-500/50 focus:outline-none resize-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitMutation.isPending}
                className="rounded bg-orange-500 px-4 py-1.5 font-mono text-[10px] font-semibold tracking-widest text-white uppercase hover:bg-orange-600 disabled:opacity-50 transition-colors"
              >
                {submitMutation.isPending ? t("submitting") : t("submit")}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded border border-zinc-700 px-4 py-1.5 font-mono text-[10px] font-semibold tracking-widest text-zinc-500 uppercase hover:text-zinc-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </BuildingModal>
  );
}
```

**Step 4: Create `src/components/community/modals/threads-modal.tsx`**

```tsx
"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { MessageSquare, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { BuildingModal } from "../building-modal";
import { toast } from "sonner";

type ThreadsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  locale: string;
};

type Category = "all" | "general" | "question" | "showcase" | "job";

const categoryColors: Record<string, string> = {
  general: "text-zinc-400 border-zinc-700",
  question: "text-blue-400 border-blue-800",
  showcase: "text-purple-400 border-purple-800",
  job: "text-green-400 border-green-800",
};

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function ThreadsModal({
  isOpen,
  onClose,
  title,
  subtitle,
  locale,
}: ThreadsModalProps) {
  const t = useTranslations("community.threads");
  const [category, setCategory] = useState<Category>("all");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", content: "", category: "general" as Exclude<Category, "all"> });
  const router = useRouter();

  const { data: session } = authClient.useSession();
  const utils = api.useUtils();

  const { data: threads = [], isLoading } = api.community.getThreads.useQuery(
    { category },
    { enabled: isOpen },
  );

  const createMutation = api.community.createThread.useMutation({
    onSuccess: (thread) => {
      setShowForm(false);
      setForm({ title: "", content: "", category: "general" });
      void utils.community.getThreads.invalidate();
      // Navigate to the thread detail page
      onClose();
      router.push(`/${locale}/community/${thread.slug}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const tabs: { key: Category; label: string }[] = [
    { key: "all", label: t("all") },
    { key: "general", label: t("general") },
    { key: "question", label: t("question") },
    { key: "showcase", label: t("showcase") },
    { key: "job", label: t("job") },
  ];

  return (
    <BuildingModal isOpen={isOpen} onClose={onClose} title={title} subtitle={subtitle}>
      {/* Category tabs */}
      <div className="mb-4 flex flex-wrap gap-1 border-b border-zinc-800 pb-3">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setCategory(tab.key)}
            className={`rounded px-2.5 py-1 font-mono text-[10px] font-semibold tracking-widest uppercase transition-colors ${
              category === tab.key
                ? "bg-zinc-800 text-zinc-200"
                : "text-zinc-600 hover:text-zinc-400"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Thread list */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-zinc-800" />
          ))}
        </div>
      ) : threads.length === 0 ? (
        <p className="py-6 text-center font-mono text-xs text-zinc-500">{t("noThreads")}</p>
      ) : (
        <div className="space-y-1.5">
          {threads.map((thread) => (
            <motion.button
              key={thread.id}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-800/40 p-3 text-left hover:border-zinc-700 hover:bg-zinc-800 transition-colors"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => {
                onClose();
                router.push(`/${locale}/community/${thread.slug}`);
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-zinc-200 leading-snug">
                  {thread.isPinned && (
                    <span className="mr-1 font-mono text-[9px] text-orange-500">📌</span>
                  )}
                  {thread.title}
                </p>
                <span
                  className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider ${categoryColors[thread.category]}`}
                >
                  {t(thread.category as keyof typeof t)}
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-3">
                <span className="flex items-center gap-1 font-mono text-[9px] text-zinc-600">
                  <MessageSquare className="h-2.5 w-2.5" />
                  {t("replies", { count: thread.replyCount })}
                </span>
                <span className="font-mono text-[9px] text-zinc-600">
                  {timeAgo(thread.lastActivityAt)}
                </span>
                {thread.authorName && (
                  <span className="font-mono text-[9px] text-zinc-600">{thread.authorName}</span>
                )}
              </div>
            </motion.button>
          ))}
        </div>
      )}

      {/* New thread section */}
      <div className="mt-4 border-t border-zinc-800 pt-4">
        {!session?.user ? (
          <p className="font-mono text-[10px] text-zinc-600">{t("loginToPost")}</p>
        ) : !showForm ? (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 font-mono text-[10px] font-semibold tracking-widest text-zinc-400 uppercase hover:text-zinc-200 transition-colors"
          >
            <Plus className="h-3 w-3" />
            {t("newThread")}
          </button>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate(form);
            }}
            className="space-y-3"
          >
            <div>
              <label className="mb-1 block font-mono text-[10px] font-semibold tracking-wider text-zinc-400 uppercase">
                {t("titleLabel")}
              </label>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder={t("titlePlaceholder")}
                maxLength={255}
                required
                className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block font-mono text-[10px] font-semibold tracking-wider text-zinc-400 uppercase">
                {t("categoryLabel")}
              </label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as typeof form.category })}
                className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 focus:border-zinc-500 focus:outline-none"
              >
                <option value="general">{t("general")}</option>
                <option value="question">{t("question")}</option>
                <option value="showcase">{t("showcase")}</option>
                <option value="job">{t("job")}</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block font-mono text-[10px] font-semibold tracking-wider text-zinc-400 uppercase">
                {t("contentLabel")}
              </label>
              <textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder={t("contentPlaceholder")}
                maxLength={10000}
                rows={4}
                required
                className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none resize-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="rounded bg-zinc-700 px-4 py-1.5 font-mono text-[10px] font-semibold tracking-widest text-zinc-200 uppercase hover:bg-zinc-600 disabled:opacity-50 transition-colors"
              >
                {createMutation.isPending ? "Posting..." : "Post"}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded border border-zinc-700 px-4 py-1.5 font-mono text-[10px] font-semibold tracking-widest text-zinc-500 uppercase hover:text-zinc-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </BuildingModal>
  );
}
```

**Step 5: Create `src/components/community/modals/contribute-modal.tsx`**

```tsx
"use client";

import { ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { BuildingModal } from "../building-modal";

type ContributeModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
};

export function ContributeModal({
  isOpen,
  onClose,
  title,
  subtitle,
}: ContributeModalProps) {
  const t = useTranslations("community.contribute");

  const cards = [
    {
      key: "speak" as const,
      color: "border-orange-800/50 hover:border-orange-700",
      badge: "bg-orange-500/10 text-orange-400",
      href: null, // TODO: link to speaker interest form page
      external: false,
    },
    {
      key: "write" as const,
      color: "border-zinc-800 hover:border-zinc-700",
      badge: "bg-zinc-800 text-zinc-400",
      href: "/dashboard",
      external: false,
    },
    {
      key: "mentor" as const,
      color: "border-zinc-800",
      badge: "bg-zinc-800 text-zinc-600",
      href: null,
      external: false,
      disabled: true,
    },
    {
      key: "partner" as const,
      color: "border-zinc-800 hover:border-zinc-700",
      badge: "bg-zinc-800 text-zinc-400",
      href: null, // TODO: link to partner form
      external: false,
    },
  ];

  return (
    <BuildingModal isOpen={isOpen} onClose={onClose} title={title} subtitle={subtitle}>
      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map(({ key, color, badge, href, external, disabled }) => (
          <div
            key={key}
            className={`rounded-lg border p-4 transition-colors ${color} ${disabled ? "opacity-50" : ""}`}
          >
            <h3 className="font-mono text-xs font-bold tracking-wider text-zinc-200 uppercase">
              {t(`${key}.title`)}
            </h3>
            <p className="mt-1.5 text-[12px] leading-relaxed text-zinc-500">
              {t(`${key}.description`)}
            </p>
            <div className="mt-3">
              {disabled ? (
                <span
                  className={`inline-block rounded px-2.5 py-1 font-mono text-[9px] font-semibold tracking-widest uppercase ${badge}`}
                >
                  {t(`${key}.cta`)}
                </span>
              ) : href ? (
                <Link
                  href={href}
                  onClick={onClose}
                  className={`inline-flex items-center gap-1 rounded px-2.5 py-1 font-mono text-[9px] font-semibold tracking-widest uppercase transition-colors ${badge} hover:opacity-80`}
                >
                  {t(`${key}.cta`)}
                  {external && <ExternalLink className="h-2.5 w-2.5" />}
                </Link>
              ) : (
                <button
                  className={`rounded px-2.5 py-1 font-mono text-[9px] font-semibold tracking-widest uppercase transition-colors ${badge} hover:opacity-80`}
                >
                  {t(`${key}.cta`)}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </BuildingModal>
  );
}
```

**Step 6: Check TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

**Step 7: Commit**

```bash
git add src/components/community/
git commit -m "feat: add BuildingModal and four community modal components"
```

---

## Task 7: Build CommunityBoard

**Files:**
- Create: `src/components/community/community-board.tsx`

**Step 1: Create `src/components/community/community-board.tsx`**

```tsx
"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Scale, Lightbulb, MessageSquare, Wrench } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { BuildingCard } from "./building-card";
import { RulesModal } from "./modals/rules-modal";
import { IdeasModal } from "./modals/ideas-modal";
import { ThreadsModal } from "./modals/threads-modal";
import { ContributeModal } from "./modals/contribute-modal";

type ActiveModal = "rules" | "ideas" | "threads" | "contribute" | null;

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.12,
    },
  },
};

const buildingVariants = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 200, damping: 20 } },
};

export function CommunityBoard() {
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const t = useTranslations("community");
  const locale = useLocale();

  const buildings = [
    {
      key: "rules" as const,
      icon: Scale,
      label: t("rules.building"),
      sublabel: t("rules.subtitle"),
      size: "sm" as const,
      accent: false,
      // top-left area
      style: { top: "15%", left: "12%" },
    },
    {
      key: "ideas" as const,
      icon: Lightbulb,
      label: t("ideas.building"),
      sublabel: t("ideas.subtitle"),
      size: "lg" as const,
      accent: true,
      // center-left
      style: { top: "30%", left: "38%" },
    },
    {
      key: "threads" as const,
      icon: MessageSquare,
      label: t("threads.building"),
      sublabel: t("threads.subtitle"),
      size: "md" as const,
      accent: false,
      // top-right area
      style: { top: "12%", right: "18%" },
    },
    {
      key: "contribute" as const,
      icon: Wrench,
      label: t("contribute.building"),
      sublabel: t("contribute.subtitle"),
      size: "md" as const,
      accent: false,
      // bottom-right
      style: { bottom: "20%", right: "12%" },
    },
  ];

  return (
    <>
      {/* Full-viewport board */}
      <div className="relative min-h-screen w-full overflow-hidden bg-zinc-950">
        {/* Graph-paper grid */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(rgb(39 39 42 / 0.5) 1px, transparent 1px),
              linear-gradient(90deg, rgb(39 39 42 / 0.5) 1px, transparent 1px)
            `,
            backgroundSize: "40px 40px",
          }}
        />

        {/* Orange ambient glow — bottom-left */}
        <div className="pointer-events-none absolute bottom-0 left-0 h-96 w-96 rounded-full bg-orange-500/5 blur-3xl" />
        {/* Orange ambient glow — top-right */}
        <div className="pointer-events-none absolute right-0 top-0 h-64 w-64 rounded-full bg-orange-500/5 blur-3xl" />

        {/* Page breadcrumb */}
        <div className="absolute left-6 top-6 z-10">
          <span className="font-mono text-[10px] font-semibold tracking-widest text-zinc-600 uppercase">
            / {t("title").toUpperCase()}
          </span>
        </div>

        {/* Subtitle */}
        <div className="absolute bottom-6 left-6 z-10">
          <p className="max-w-xs font-mono text-[9px] leading-relaxed text-zinc-700">
            {t("subtitle")}
          </p>
        </div>

        {/* Mobile layout: 2×2 grid */}
        <div className="flex min-h-screen items-center justify-center md:hidden">
          <motion.div
            className="grid grid-cols-2 gap-6 p-8"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {buildings.map((b) => (
              <motion.div key={b.key} variants={buildingVariants}>
                <BuildingCard
                  icon={b.icon}
                  label={b.label}
                  sublabel={b.sublabel}
                  size={b.size}
                  accent={b.accent}
                  onClick={() => setActiveModal(b.key)}
                />
              </motion.div>
            ))}
          </motion.div>
        </div>

        {/* Desktop layout: scattered absolute positioning */}
        <motion.div
          className="relative hidden h-screen w-full md:block"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {buildings.map((b) => (
            <motion.div
              key={b.key}
              className="absolute"
              style={b.style}
              variants={buildingVariants}
            >
              <BuildingCard
                icon={b.icon}
                label={b.label}
                sublabel={b.sublabel}
                size={b.size}
                accent={b.accent}
                onClick={() => setActiveModal(b.key)}
              />
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* Modals */}
      <RulesModal
        isOpen={activeModal === "rules"}
        onClose={() => setActiveModal(null)}
        title={t("rules.title")}
        subtitle={t("rules.subtitle")}
      />
      <IdeasModal
        isOpen={activeModal === "ideas"}
        onClose={() => setActiveModal(null)}
        title={t("ideas.title")}
        subtitle={t("ideas.subtitle")}
      />
      <ThreadsModal
        isOpen={activeModal === "threads"}
        onClose={() => setActiveModal(null)}
        title={t("threads.title")}
        subtitle={t("threads.subtitle")}
        locale={locale}
      />
      <ContributeModal
        isOpen={activeModal === "contribute"}
        onClose={() => setActiveModal(null)}
        title={t("contribute.title")}
        subtitle={t("contribute.subtitle")}
      />
    </>
  );
}
```

**Step 2: Check TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

**Step 3: Commit**

```bash
git add src/components/community/community-board.tsx
git commit -m "feat: add CommunityBoard component with scattered buildings layout"
```

---

## Task 8: Community page route + thread detail page

**Files:**
- Create: `src/app/[locale]/community/page.tsx`
- Create: `src/app/[locale]/community/[slug]/page.tsx`

**Step 1: Create `src/app/[locale]/community/page.tsx`**

```tsx
import { CommunityBoard } from "@/components/community/community-board";

// Override the layout's background — community board has its own full-screen dark canvas.
// We do this by rendering with no padding/container wrapper; the board handles its own layout.
export default function CommunityPage() {
  return <CommunityBoard />;
}
```

**Step 2: Fix layout gradient override**

The layout wraps `children` in:
```tsx
<main className="min-h-screen to-background bg-linear-to-b from-orange-50/60 via-amber-50/30">
```

The `CommunityBoard` uses `bg-zinc-950` which will cover the light gradient visually (it's opaque). No layout changes needed — the board's own background covers the main's background.

**Step 3: Create `src/app/[locale]/community/[slug]/page.tsx`**

This is the thread detail page. Basic implementation — shows thread content and its replies.

```tsx
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getLocale } from "next-intl/server";
import { db } from "@/server/db";
import { forumThreads, forumReplies, user as userTable } from "@/server/db/schema";
import { Link } from "@/i18n/navigation";
import { auth } from "@/server/better-auth";
import { headers } from "next/headers";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const [thread] = await db
    .select({ title: forumThreads.title })
    .from(forumThreads)
    .where(eq(forumThreads.slug, slug))
    .limit(1);
  return { title: thread?.title ?? "Thread" };
}

export default async function ThreadDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // Fetch thread
  const [row] = await db
    .select({
      id: forumThreads.id,
      title: forumThreads.title,
      content: forumThreads.content,
      category: forumThreads.category,
      createdAt: forumThreads.createdAt,
      replyCount: forumThreads.replyCount,
      authorName: userTable.name,
    })
    .from(forumThreads)
    .leftJoin(userTable, eq(forumThreads.authorId, userTable.id))
    .where(eq(forumThreads.slug, slug))
    .limit(1);

  if (!row) notFound();

  // Fetch replies
  const replies = await db
    .select({
      id: forumReplies.id,
      content: forumReplies.content,
      createdAt: forumReplies.createdAt,
      authorName: userTable.name,
      authorImage: userTable.image,
    })
    .from(forumReplies)
    .leftJoin(userTable, eq(forumReplies.authorId, userTable.id))
    .where(eq(forumReplies.threadId, row.id))
    .orderBy(forumReplies.createdAt);

  return (
    <div className="mx-auto max-w-3xl px-6 py-12 sm:px-12">
      {/* Back link */}
      <Link
        href="/community"
        className="font-mono text-xs tracking-wider text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        ← Community Board
      </Link>

      {/* Thread header */}
      <div className="mt-6">
        <div className="flex items-center gap-2 font-mono text-[10px] tracking-widest text-zinc-600 uppercase">
          <span>{row.category}</span>
          <span>·</span>
          <span>{new Date(row.createdAt).toLocaleDateString()}</span>
          {row.authorName && (
            <>
              <span>·</span>
              <span>{row.authorName}</span>
            </>
          )}
        </div>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-zinc-100">
          {row.title}
        </h1>
      </div>

      {/* Thread content */}
      <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900 p-5">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
          {row.content}
        </p>
      </div>

      {/* Replies */}
      <div className="mt-8">
        <h2 className="mb-4 font-mono text-[10px] font-semibold tracking-widest text-zinc-500 uppercase">
          {replies.length} {replies.length === 1 ? "Reply" : "Replies"}
        </h2>
        <div className="space-y-3">
          {replies.map((reply) => (
            <div
              key={reply.id}
              className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4"
            >
              <div className="mb-2 flex items-center gap-2 font-mono text-[9px] tracking-wider text-zinc-600">
                <span>{reply.authorName ?? "member"}</span>
                <span>·</span>
                <span>{new Date(reply.createdAt).toLocaleDateString()}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
                {reply.content}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

**Step 4: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

**Step 5: Test the pages in browser**

1. Open `http://localhost:3000/en/community`
   - Expected: full dark board with 4 isometric buildings scattered
   - Click each building — modal opens with correct content
   - Press Escape — modal closes
   - Buildings float on hover

2. Open Ideas modal (logged in)
   - Expected: idea list renders, upvote button works optimistically

3. Open Threads modal, create a thread
   - Expected: navigates to `/en/community/[slug]`

4. Check mobile at 375px width
   - Expected: 2×2 grid of buildings

**Step 6: Commit**

```bash
git add src/app/[locale]/community/
git commit -m "feat: add community board page and thread detail page"
```

---

## Task 9: Final TypeScript + build check

**Step 1: Full TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

**Step 2: Build check**

```bash
npx next build
```

Expected: builds without errors. Note: may have warnings about `generateStaticParams` for thread detail — acceptable for now.

**Step 3: Commit any fixes found during build**

```bash
git add -p
git commit -m "fix: resolve build errors in community board"
```

---

## Summary

| Task | Files | Status |
|---|---|---|
| 1 | DB schema + migration | ⬜ |
| 2 | Payload CommunityRules global | ⬜ |
| 3 | i18n translations | ⬜ |
| 4 | tRPC community router | ⬜ |
| 5 | IsometricBuilding + BuildingCard | ⬜ |
| 6 | Modal shell + 4 modals | ⬜ |
| 7 | CommunityBoard | ⬜ |
| 8 | Community page + thread detail | ⬜ |
| 9 | TypeScript + build check | ⬜ |
