# Community Board Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the `/community` page as a full-viewport isometric village board where four clickable CSS buildings open Framer Motion modals for Community Rules, Ideas & Voting, Discussion Threads, and Contribute.

**Architecture:** Full-stack feature on the existing Next.js 15 monolith. All community data lives in **Payload CMS** — four new collections (`forum-threads`, `forum-replies`, `community-ideas`, `idea-votes`) and one Global (`community-rules`). No new Drizzle tables. tRPC `communityRouter` uses `getPayloadClient()` for all queries/mutations, consistent with the Events and Articles patterns. React client components for the board, buildings, and modals — server component only for the page wrapper.

**Tech Stack:** Next.js 15 App Router, Payload CMS (collections + global, local API), tRPC 11, Framer Motion, Tailwind CSS 4, shadcn/ui, next-intl, Better Auth (`protectedProcedure`), Lucide React icons

---

## Context

- Payload config: `src/payload.config.ts` — add new collections to `collections[]` array, add `globals: [CommunityRules]`
- Payload local API pattern: `const payload = await getPayloadClient(); payload.find({ collection: "...", where: {...} })` — see `src/server/payload.ts` and how events/articles pages use it
- Payload `create()` uses `data:` (not `values:`), returns the created document directly (not an array)
- Payload `find()` returns `{ docs, totalDocs, hasNextPage }` — use `docs`
- tRPC pattern: `src/server/api/routers/events.ts` — use `createTRPCRouter`, `publicProcedure`, `protectedProcedure` from `@/server/api/trpc`. For community router, call `getPayloadClient()` inside each procedure — no Drizzle imports needed
- Root router: `src/server/api/root.ts` — add `community: communityRouter`
- i18n: `messages/en.json` and `messages/nl.json` — `community` key already exists in `nav` but needs a full namespace
- Layout: `src/app/[locale]/layout.tsx` — main has light gradient bg; community page must set `bg-zinc-950` to override
- Navbar already has `/community` link — no changes needed
- The `LexicalRenderer` at `src/lib/lexical.tsx` already exists — reuse for rendering Rules content
- After editing `payload.config.ts`, always run `npx payload generate:types` to regenerate `src/payload-types.ts`

---

## Task 1: Create Payload collections — ForumThreads, ForumReplies, CommunityIdeas, IdeaVotes

**Files:**
- Create: `src/collections/ForumThreads.ts`
- Create: `src/collections/ForumReplies.ts`
- Create: `src/collections/CommunityIdeas.ts`
- Create: `src/collections/IdeaVotes.ts`
- Modify: `src/payload.config.ts`

These four collections replace what would otherwise be Drizzle tables. Payload handles the database schema automatically and gives admins full moderation control via `/admin`.

**Step 1: Create `src/collections/ForumThreads.ts`**

```typescript
import type { CollectionConfig } from "payload";

export const ForumThreads: CollectionConfig = {
  slug: "forum-threads",
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "category", "isPinned", "replyCount", "createdAt"],
    description: "Community discussion threads. Pin important threads, lock spam, delete abuse.",
  },
  fields: [
    { name: "title", type: "text", required: true },
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      admin: { description: "Auto-generated from title + timestamp. Do not edit manually." },
    },
    {
      name: "content",
      type: "textarea",
      required: true,
    },
    {
      name: "category",
      type: "select",
      required: true,
      defaultValue: "general",
      options: [
        { label: "General", value: "general" },
        { label: "Question", value: "question" },
        { label: "Showcase", value: "showcase" },
        { label: "Jobs", value: "job" },
      ],
      admin: { position: "sidebar" },
    },
    {
      name: "author",
      type: "relationship",
      relationTo: "users",
      required: true,
      admin: { position: "sidebar" },
    },
    {
      name: "isPinned",
      type: "checkbox",
      defaultValue: false,
      admin: { position: "sidebar", description: "Pinned threads appear at the top." },
    },
    {
      name: "isLocked",
      type: "checkbox",
      defaultValue: false,
      admin: { position: "sidebar", description: "Locked threads cannot receive new replies." },
    },
    {
      name: "replyCount",
      type: "number",
      defaultValue: 0,
      admin: { position: "sidebar", readOnly: true },
    },
    {
      name: "lastActivityAt",
      type: "date",
      admin: { position: "sidebar", readOnly: true },
    },
  ],
  timestamps: true,
};
```

**Step 2: Create `src/collections/ForumReplies.ts`**

```typescript
import type { CollectionConfig } from "payload";

export const ForumReplies: CollectionConfig = {
  slug: "forum-replies",
  admin: {
    useAsTitle: "content",
    defaultColumns: ["thread", "author", "createdAt"],
    description: "Replies to forum threads. Delete spam or abusive replies here.",
  },
  fields: [
    {
      name: "thread",
      type: "relationship",
      relationTo: "forum-threads",
      required: true,
    },
    {
      name: "content",
      type: "textarea",
      required: true,
    },
    {
      name: "author",
      type: "relationship",
      relationTo: "users",
      required: true,
    },
  ],
  timestamps: true,
};
```

**Step 3: Create `src/collections/CommunityIdeas.ts`**

```typescript
import type { CollectionConfig } from "payload";

export const CommunityIdeas: CollectionConfig = {
  slug: "community-ideas",
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "status", "voteCount", "author", "createdAt"],
    description: "Community feature requests and proposals. Change status as ideas are implemented or declined.",
  },
  fields: [
    {
      name: "title",
      type: "text",
      required: true,
      maxLength: 100,
    },
    {
      name: "description",
      type: "textarea",
      maxLength: 500,
    },
    {
      name: "author",
      type: "relationship",
      relationTo: "users",
      required: true,
      admin: { position: "sidebar" },
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "open",
      options: [
        { label: "Open", value: "open" },
        { label: "Implemented", value: "implemented" },
        { label: "Rejected", value: "rejected" },
      ],
      admin: { position: "sidebar" },
    },
    {
      name: "voteCount",
      type: "number",
      defaultValue: 0,
      admin: { position: "sidebar", readOnly: true },
    },
  ],
  timestamps: true,
};
```

**Step 4: Create `src/collections/IdeaVotes.ts`**

```typescript
import type { CollectionConfig } from "payload";

export const IdeaVotes: CollectionConfig = {
  slug: "idea-votes",
  admin: {
    useAsTitle: "id",
    defaultColumns: ["idea", "voter", "createdAt"],
    description: "Tracks which users have voted for which ideas. One vote per user per idea (enforced by hook).",
  },
  hooks: {
    beforeChange: [
      async ({ data, operation, req }) => {
        // Prevent double-voting: on create, check if this (idea, voter) pair already exists
        if (operation === "create") {
          const { docs } = await req.payload.find({
            collection: "idea-votes",
            where: {
              and: [
                { idea: { equals: data.idea } },
                { voter: { equals: data.voter } },
              ],
            },
            limit: 1,
          });
          if (docs.length > 0) {
            throw new Error("You have already voted for this idea.");
          }
        }
        return data;
      },
    ],
  },
  fields: [
    {
      name: "idea",
      type: "relationship",
      relationTo: "community-ideas",
      required: true,
    },
    {
      name: "voter",
      type: "relationship",
      relationTo: "users",
      required: true,
    },
  ],
  timestamps: true,
};
```

**Step 5: Register all four collections in `src/payload.config.ts`**

Add imports at the top:
```typescript
import { ForumThreads } from "./collections/ForumThreads";
import { ForumReplies } from "./collections/ForumReplies";
import { CommunityIdeas } from "./collections/CommunityIdeas";
import { IdeaVotes } from "./collections/IdeaVotes";
```

Add to the `collections` array inside `buildConfig`:
```typescript
collections: [
  Events,
  Speakers,
  Articles,
  Pages,
  Media,
  ForumThreads,   // ← add
  ForumReplies,   // ← add
  CommunityIdeas, // ← add
  IdeaVotes,      // ← add
  { slug: "users", auth: true, /* ... existing ... */ },
],
```

**Step 6: Regenerate Payload types**

```bash
npx payload generate:types
```

Expected: `src/payload-types.ts` updated with `ForumThread`, `ForumReply`, `CommunityIdea`, `IdeaVote` types.

**Step 7: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

**Step 8: Commit**

```bash
git add src/collections/ForumThreads.ts src/collections/ForumReplies.ts \
        src/collections/CommunityIdeas.ts src/collections/IdeaVotes.ts \
        src/payload.config.ts src/payload-types.ts
git commit -m "feat: add ForumThreads, ForumReplies, CommunityIdeas, IdeaVotes Payload collections"
```

---

## Task 2: Add Payload CommunityRules Global

**Files:**
- Create: `src/collections/CommunityRules.ts`
- Modify: `src/payload.config.ts` (already modified in Task 1 — just add the global)

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

Add the import at the top (alongside the other new imports from Task 1):
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

## Task 4: Build tRPC community router (Payload-backed)

**Files:**
- Create: `src/server/api/routers/community.ts`
- Modify: `src/server/api/root.ts`

All queries and mutations use `getPayloadClient()`. No Drizzle imports. The Payload local API is called server-side inside each tRPC procedure.

**Step 1: Create `src/server/api/routers/community.ts`**

```typescript
import { z } from "zod";
import { TRPCError } from "@trpc/server";

import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
} from "@/server/api/trpc";
import { getPayloadClient } from "@/server/payload";
import type { ForumThread, CommunityIdea, IdeaVote } from "@/payload-types";

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
      const payload = await getPayloadClient();

      const { docs } = await payload.find({
        collection: "community-ideas",
        sort: input.sort === "votes" ? "-voteCount" : "-createdAt",
        limit: 50,
        depth: 1, // populate author relationship
      });

      const userId = ctx.session?.user?.id;

      // If authenticated, find which ideas this user has already voted on
      if (userId) {
        const { docs: myVotes } = await payload.find({
          collection: "idea-votes",
          where: { voter: { equals: userId } },
          limit: 200,
          depth: 0,
        });
        const votedIdeaIds = new Set(
          myVotes.map((v) => {
            const vote = v as IdeaVote;
            return typeof vote.idea === "object" ? vote.idea.id : vote.idea;
          }),
        );
        return docs.map((idea) => ({
          ...idea,
          hasVoted: votedIdeaIds.has(idea.id),
        }));
      }

      return docs.map((idea) => ({ ...idea, hasVoted: false }));
    }),

  submitIdea: protectedProcedure
    .input(
      z.object({
        title: z.string().min(3).max(100),
        description: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();

      const idea = await payload.create({
        collection: "community-ideas",
        data: {
          title: input.title,
          description: input.description ?? undefined,
          author: ctx.session.user.id,
          status: "open",
          voteCount: 0,
        },
      });

      return idea;
    }),

  toggleVote: protectedProcedure
    .input(z.object({ ideaId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();
      const userId = ctx.session.user.id;

      // Check if this user already voted for this idea
      const { docs: existingVotes } = await payload.find({
        collection: "idea-votes",
        where: {
          and: [
            { idea: { equals: input.ideaId } },
            { voter: { equals: userId } },
          ],
        },
        limit: 1,
        depth: 0,
      });

      // Get current idea to update vote count
      const idea = await payload.findByID({
        collection: "community-ideas",
        id: input.ideaId,
        depth: 0,
      }) as CommunityIdea;

      if (existingVotes.length > 0) {
        // Remove vote
        await payload.delete({
          collection: "idea-votes",
          id: existingVotes[0]!.id,
        });
        await payload.update({
          collection: "community-ideas",
          id: input.ideaId,
          data: { voteCount: Math.max(0, (idea.voteCount ?? 0) - 1) },
        });
        return { voted: false };
      } else {
        // Add vote
        await payload.create({
          collection: "idea-votes",
          data: {
            idea: input.ideaId,
            voter: userId,
          },
        });
        await payload.update({
          collection: "community-ideas",
          id: input.ideaId,
          data: { voteCount: (idea.voteCount ?? 0) + 1 },
        });
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
    .query(async ({ input }) => {
      const payload = await getPayloadClient();

      const whereClause =
        input.category === "all"
          ? {}
          : { category: { equals: input.category } };

      const { docs } = await payload.find({
        collection: "forum-threads",
        where: Object.keys(whereClause).length > 0 ? whereClause : undefined,
        sort: "-isPinned,-lastActivityAt",
        limit: 30,
        depth: 1, // populate author
      });

      return docs as ForumThread[];
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
      const payload = await getPayloadClient();

      // Generate slug from title + timestamp to ensure uniqueness
      const baseSlug = input.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80);
      const slug = `${baseSlug}-${Date.now()}`;

      const thread = await payload.create({
        collection: "forum-threads",
        data: {
          title: input.title,
          slug,
          content: input.content,
          category: input.category,
          author: ctx.session.user.id,
          isPinned: false,
          isLocked: false,
          replyCount: 0,
          lastActivityAt: new Date().toISOString(),
        },
      });

      return thread as ForumThread;
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

Expected: no errors. If Payload-generated types haven't been regenerated yet, run `npx payload generate:types` first.

**Step 4: Commit**

```bash
git add src/server/api/routers/community.ts src/server/api/root.ts
git commit -m "feat: add community tRPC router using Payload local API"
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

This is the thread detail page. Uses Payload local API — same pattern as `src/app/[locale]/blog/[slug]/page.tsx`. Depth 1 populates the author relationship.

```tsx
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getPayloadClient } from "@/server/payload";
import type { Metadata } from "next";
import type { ForumThread, ForumReply, User } from "@/payload-types";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const payload = await getPayloadClient();
  const { docs } = await payload.find({
    collection: "forum-threads",
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
  });
  return { title: (docs[0] as ForumThread | undefined)?.title ?? "Thread" };
}

export default async function ThreadDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const payload = await getPayloadClient();

  // Fetch thread with author populated (depth: 1)
  const { docs: threadDocs } = await payload.find({
    collection: "forum-threads",
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 1,
  });

  const thread = threadDocs[0] as ForumThread | undefined;
  if (!thread) notFound();

  // Fetch replies with authors populated
  const { docs: replyDocs } = await payload.find({
    collection: "forum-replies",
    where: { thread: { equals: thread.id } },
    sort: "createdAt",
    limit: 200,
    depth: 1,
  });

  const replies = replyDocs as ForumReply[];
  const authorUser = typeof thread.author === "object" ? (thread.author as User) : null;

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
          <span>{thread.category}</span>
          <span>·</span>
          <span>{new Date(thread.createdAt).toLocaleDateString()}</span>
          {authorUser?.name && (
            <>
              <span>·</span>
              <span>{authorUser.name}</span>
            </>
          )}
        </div>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-zinc-100">
          {thread.title}
        </h1>
      </div>

      {/* Thread content */}
      <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900 p-5">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
          {thread.content}
        </p>
      </div>

      {/* Replies */}
      <div className="mt-8">
        <h2 className="mb-4 font-mono text-[10px] font-semibold tracking-widest text-zinc-500 uppercase">
          {replies.length} {replies.length === 1 ? "Reply" : "Replies"}
        </h2>
        <div className="space-y-3">
          {replies.map((reply) => {
            const replyAuthor = typeof reply.author === "object" ? (reply.author as User) : null;
            return (
              <div
                key={reply.id}
                className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4"
              >
                <div className="mb-2 flex items-center gap-2 font-mono text-[9px] tracking-wider text-zinc-600">
                  <span>{replyAuthor?.name ?? "member"}</span>
                  <span>·</span>
                  <span>{new Date(reply.createdAt).toLocaleDateString()}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
                  {reply.content}
                </p>
              </div>
            );
          })}
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
| 1 | Payload collections: ForumThreads, ForumReplies, CommunityIdeas, IdeaVotes | ⬜ |
| 2 | Payload global: CommunityRules | ⬜ |
| 3 | i18n translations | ⬜ |
| 4 | tRPC community router (Payload-backed) | ⬜ |
| 5 | IsometricBuilding + BuildingCard | ⬜ |
| 6 | Modal shell + 4 modals | ⬜ |
| 7 | CommunityBoard | ⬜ |
| 8 | Community page + thread detail (Payload-backed) | ⬜ |
| 9 | TypeScript + build check | ⬜ |
