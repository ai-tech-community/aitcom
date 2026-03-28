# AI+Human Challenges — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build time-boxed challenges where members and their AI agents collaborate — agent proactively advises, human acts — with progress tracking, leaderboards, and gamification rewards.

**Architecture:** New Payload CMS collection for challenge content, two new Drizzle tables (enrollments + progress) in the `app` schema, a new `challenges` tRPC router, a progress-checking hook in `logActivity()`, and a scheduled advisory job that sends agent messages via the existing inbox. All progress tracked via existing `activity_events`.

**Tech Stack:** Next.js 15, Payload CMS 3, Drizzle ORM (Neon), tRPC 11, React 19, Tailwind CSS 4, next-intl, Vercel Cron

---

## Task 1: Drizzle Schema — Challenge Enrollment & Progress Tables

**Files:**
- Modify: `src/server/db/schema.ts`

**Step 1: Add challenge enrollment and progress tables to schema**

Add after the `activityEvents` table definition (around line 465):

```typescript
// Challenge enrollments (member joins a challenge)
export const challengeEnrollments = appSchema.table(
  "challenge_enrollment",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    challengeId: d.integer().notNull(), // References Payload challenges table
    userId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    enrolledAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    completedAt: d.timestamp({ withTimezone: true }),
    status: d
      .varchar({ length: 20 })
      .notNull()
      .default("active")
      .$type<"active" | "completed" | "abandoned">(),
  }),
  (t) => [
    index("enrollment_challenge_idx").on(t.challengeId),
    index("enrollment_user_idx").on(t.userId),
    uniqueIndex("enrollment_user_challenge_uidx").on(t.userId, t.challengeId),
  ],
);

export const challengeEnrollmentRelations = relations(
  challengeEnrollments,
  ({ one }) => ({
    user: one(user, {
      fields: [challengeEnrollments.userId],
      references: [user.id],
    }),
  }),
);

// Challenge progress (per-objective tracking within an enrollment)
export const challengeProgress = appSchema.table(
  "challenge_progress",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    enrollmentId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => challengeEnrollments.id),
    objectiveIndex: d.integer().notNull(),
    currentCount: d.integer().notNull().default(0),
    completedAt: d.timestamp({ withTimezone: true }),
  }),
  (t) => [
    index("progress_enrollment_idx").on(t.enrollmentId),
    uniqueIndex("progress_enrollment_objective_uidx").on(
      t.enrollmentId,
      t.objectiveIndex,
    ),
  ],
);

export const challengeProgressRelations = relations(
  challengeProgress,
  ({ one }) => ({
    enrollment: one(challengeEnrollments, {
      fields: [challengeProgress.enrollmentId],
      references: [challengeEnrollments.id],
    }),
  }),
);
```

**Step 2: Generate and run migration**

Run: `pnpm drizzle-kit generate`
Run: `pnpm drizzle-kit push`

**Step 3: Commit**

```bash
git add src/server/db/schema.ts drizzle/
git commit -m "feat(challenges): add enrollment and progress tables"
```

---

## Task 2: Payload CMS — Challenges Collection

**Files:**
- Create: `src/collections/Challenges.ts`
- Modify: `src/payload.config.ts`

**Step 1: Create the Challenges collection**

Create `src/collections/Challenges.ts`:

```typescript
import type { CollectionConfig } from "payload";

export const Challenges: CollectionConfig = {
  slug: "challenges",
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "type", "status", "startsAt", "endsAt"],
    description:
      "AI+Human challenges where members and their AI agents collaborate.",
  },
  fields: [
    { name: "title", type: "text", required: true },
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      admin: { position: "sidebar" },
    },
    { name: "description", type: "richText", required: true },
    {
      name: "type",
      type: "select",
      required: true,
      options: [
        { label: "Weekly", value: "weekly" },
        { label: "Monthly", value: "monthly" },
      ],
      admin: { position: "sidebar" },
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "draft",
      options: [
        { label: "Draft", value: "draft" },
        { label: "Active", value: "active" },
        { label: "Completed", value: "completed" },
        { label: "Archived", value: "archived" },
      ],
      admin: { position: "sidebar" },
    },
    {
      name: "startsAt",
      type: "date",
      required: true,
      admin: { position: "sidebar" },
    },
    {
      name: "endsAt",
      type: "date",
      required: true,
      admin: { position: "sidebar" },
    },
    {
      name: "objectives",
      type: "array",
      required: true,
      minRows: 1,
      maxRows: 5,
      fields: [
        {
          name: "description",
          type: "text",
          required: true,
        },
        {
          name: "action",
          type: "select",
          required: true,
          options: [
            { label: "Reply to thread", value: "thread.reply" },
            { label: "Create thread", value: "thread.create" },
            { label: "Share knowledge", value: "knowledge.share" },
            { label: "Submit idea", value: "idea.submitted" },
            { label: "Vote on idea", value: "idea.voted" },
          ],
        },
        {
          name: "targetCount",
          type: "number",
          required: true,
          min: 1,
          admin: { description: "How many times this action must be performed." },
        },
        {
          name: "filter",
          type: "json",
          admin: {
            description:
              'Optional scope filter, e.g. { "category": "question" } or { "tag": "automation" }',
          },
        },
      ],
    },
    {
      name: "xpReward",
      type: "number",
      required: true,
      min: 0,
      admin: {
        position: "sidebar",
        description: "XP awarded on completion.",
      },
    },
    {
      name: "badgeReward",
      type: "text",
      admin: {
        position: "sidebar",
        description: "Badge slug to award on completion (optional).",
      },
    },
    {
      name: "maxParticipants",
      type: "number",
      defaultValue: 0,
      admin: {
        position: "sidebar",
        description: "0 = unlimited.",
      },
    },
    {
      name: "proposedBy",
      type: "text",
      admin: {
        position: "sidebar",
        description: "User ID if community-proposed, blank if admin-created.",
      },
    },
    { name: "image", type: "upload", relationTo: "media" },
  ],
  timestamps: true,
};
```

**Step 2: Register the collection in Payload config**

In `src/payload.config.ts`, add the import and register it:

Add import at top:
```typescript
import { Challenges } from "./collections/Challenges";
```

Add `Challenges` to the `collections` array (after `Jobs`):
```typescript
collections: [
  Events,
  Speakers,
  Articles,
  ForumThreads,
  ForumReplies,
  CommunityIdeas,
  IdeaVotes,
  Challenges, // <-- add here
  Pages,
  Media,
  Sponsors,
  SponsorApplications,
  Jobs,
  // ... users inline
],
```

**Step 3: Commit**

```bash
git add src/collections/Challenges.ts src/payload.config.ts
git commit -m "feat(challenges): add Payload CMS challenges collection"
```

---

## Task 3: Gamification — New Challenge Badges & XP

**Files:**
- Modify: `src/lib/gamification.ts`

**Step 1: Add challenge badges and XP amounts**

Add new badges to the `BADGES` record:

```typescript
first_challenge: {
  slug: "first_challenge",
  name: "First Challenge",
  description: "Completed your first challenge",
},
challenge_streak_3: {
  slug: "challenge_streak_3",
  name: "Streak Master",
  description: "Completed 3 consecutive weekly challenges",
},
challenge_streak_10: {
  slug: "challenge_streak_10",
  name: "Unstoppable",
  description: "Completed 10 consecutive weekly challenges",
},
challenge_proposer: {
  slug: "challenge_proposer",
  name: "Challenge Proposer",
  description: "Your proposed challenge was published",
},
mission_impossible: {
  slug: "mission_impossible",
  name: "Mission Impossible",
  description: "Completed a monthly challenge in the first week",
},
```

Add new XP amounts to `XP_AMOUNTS`:

```typescript
CHALLENGE_COMPLETE: 0, // Overridden per-challenge by xpReward field
CHALLENGE_PROPOSE_PUBLISHED: 50,
```

**Step 2: Add challenge badge check helper**

Add at the bottom of the file:

```typescript
/**
 * Check and award challenge-related badges based on completion count.
 */
export async function checkChallengeBadges(
  db: DB,
  userId: string,
  completedCount: number,
  consecutiveWeekly: number,
  challengeType: "weekly" | "monthly",
  daysToComplete: number,
) {
  if (completedCount >= 1) {
    await awardBadge(db, userId, "first_challenge");
  }
  if (consecutiveWeekly >= 3) {
    await awardBadge(db, userId, "challenge_streak_3");
  }
  if (consecutiveWeekly >= 10) {
    await awardBadge(db, userId, "challenge_streak_10");
  }
  if (challengeType === "monthly" && daysToComplete <= 7) {
    await awardBadge(db, userId, "mission_impossible");
  }
}
```

**Step 3: Commit**

```bash
git add src/lib/gamification.ts
git commit -m "feat(challenges): add challenge badges and XP definitions"
```

---

## Task 4: tRPC Router — Challenges

**Files:**
- Create: `src/server/api/routers/challenges.ts`
- Modify: `src/server/api/root.ts`

**Step 1: Create the challenges router**

Create `src/server/api/routers/challenges.ts`:

```typescript
import { z } from "zod";
import { eq, and, desc, sql, count } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
} from "@/server/api/trpc";
import {
  challengeEnrollments,
  challengeProgress,
  memberProfiles,
  user,
} from "@/server/db/schema";
import { getPayloadClient } from "@/server/payload";
import { logActivity } from "@/server/agent/activity";
import { awardXp, awardBadge } from "@/lib/gamification";

export const challengesRouter = createTRPCRouter({
  // ── List active + upcoming challenges ───────────────────────────────────

  list: publicProcedure.query(async () => {
    const payload = await getPayloadClient();
    const { docs } = await payload.find({
      collection: "challenges",
      where: {
        status: { in: ["active", "draft"] },
      },
      sort: "-startsAt",
      limit: 50,
      depth: 0,
    });
    return docs;
  }),

  // ── Get challenge by ID ─────────────────────────────────────────────────

  getById: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const payload = await getPayloadClient();
      return payload.findByID({
        collection: "challenges",
        id: input.id,
        depth: 0,
      });
    }),

  // ── Enroll in a challenge ───────────────────────────────────────────────

  enroll: protectedProcedure
    .input(z.object({ challengeId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const payload = await getPayloadClient();

      // Verify challenge exists and is active
      const challenge = await payload.findByID({
        collection: "challenges",
        id: input.challengeId,
        depth: 0,
      });

      if (challenge.status !== "active") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Challenge is not active",
        });
      }

      // Check max participants
      if (challenge.maxParticipants && challenge.maxParticipants > 0) {
        const [countResult] = await ctx.db
          .select({ count: sql<number>`count(*)::int` })
          .from(challengeEnrollments)
          .where(eq(challengeEnrollments.challengeId, input.challengeId));

        if ((countResult?.count ?? 0) >= challenge.maxParticipants) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Challenge is full",
          });
        }
      }

      // Create enrollment (unique constraint prevents duplicates)
      const [enrollment] = await ctx.db
        .insert(challengeEnrollments)
        .values({
          challengeId: input.challengeId,
          userId,
        })
        .onConflictDoNothing()
        .returning();

      if (!enrollment) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Already enrolled in this challenge",
        });
      }

      // Create progress rows for each objective
      const objectives = (challenge.objectives as { description: string; action: string; targetCount: number; filter?: unknown }[]) ?? [];
      if (objectives.length > 0) {
        await ctx.db.insert(challengeProgress).values(
          objectives.map((_, index) => ({
            enrollmentId: enrollment.id,
            objectiveIndex: index,
            currentCount: 0,
          })),
        );
      }

      // Log activity
      await logActivity(ctx.db, {
        actorId: userId,
        actorType: "member",
        action: "challenge.enrolled",
        targetType: "challenges",
        targetId: String(input.challengeId),
        metadata: { title: challenge.title },
      });

      return enrollment;
    }),

  // ── Abandon a challenge ─────────────────────────────────────────────────

  abandon: protectedProcedure
    .input(z.object({ challengeId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const [enrollment] = await ctx.db
        .update(challengeEnrollments)
        .set({ status: "abandoned" })
        .where(
          and(
            eq(challengeEnrollments.challengeId, input.challengeId),
            eq(challengeEnrollments.userId, userId),
            eq(challengeEnrollments.status, "active"),
          ),
        )
        .returning();

      if (!enrollment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No active enrollment found",
        });
      }

      await logActivity(ctx.db, {
        actorId: userId,
        actorType: "member",
        action: "challenge.abandoned",
        targetType: "challenges",
        targetId: String(input.challengeId),
      });

      return { success: true };
    }),

  // ── Get my enrollments ──────────────────────────────────────────────────

  getMyEnrollments: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const enrollments = await ctx.db
      .select()
      .from(challengeEnrollments)
      .where(eq(challengeEnrollments.userId, userId))
      .orderBy(desc(challengeEnrollments.enrolledAt));

    return enrollments;
  }),

  // ── Get progress for a specific enrollment ──────────────────────────────

  getProgress: protectedProcedure
    .input(z.object({ challengeId: z.number() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const [enrollment] = await ctx.db
        .select()
        .from(challengeEnrollments)
        .where(
          and(
            eq(challengeEnrollments.challengeId, input.challengeId),
            eq(challengeEnrollments.userId, userId),
          ),
        )
        .limit(1);

      if (!enrollment) {
        return null;
      }

      const progress = await ctx.db
        .select()
        .from(challengeProgress)
        .where(eq(challengeProgress.enrollmentId, enrollment.id))
        .orderBy(challengeProgress.objectiveIndex);

      return { enrollment, progress };
    }),

  // ── Leaderboard for a challenge ─────────────────────────────────────────

  getLeaderboard: publicProcedure
    .input(z.object({ challengeId: z.number(), limit: z.number().min(1).max(50).default(20) }))
    .query(async ({ ctx, input }) => {
      // Get enrollments with completed objective counts
      const rows = await ctx.db
        .select({
          enrollmentId: challengeEnrollments.id,
          userId: challengeEnrollments.userId,
          status: challengeEnrollments.status,
          completedAt: challengeEnrollments.completedAt,
          completedObjectives: sql<number>`(
            SELECT count(*)::int FROM ${challengeProgress}
            WHERE ${challengeProgress.enrollmentId} = ${challengeEnrollments.id}
            AND ${challengeProgress.completedAt} IS NOT NULL
          )`,
          totalProgress: sql<number>`(
            SELECT coalesce(sum(${challengeProgress.currentCount}), 0)::int FROM ${challengeProgress}
            WHERE ${challengeProgress.enrollmentId} = ${challengeEnrollments.id}
          )`,
        })
        .from(challengeEnrollments)
        .where(eq(challengeEnrollments.challengeId, input.challengeId))
        .orderBy(
          sql`(SELECT count(*) FROM ${challengeProgress} WHERE ${challengeProgress.enrollmentId} = ${challengeEnrollments.id} AND ${challengeProgress.completedAt} IS NOT NULL) DESC`,
          challengeEnrollments.completedAt,
        )
        .limit(input.limit);

      // Enrich with member info
      const userIds = rows.map((r) => r.userId);
      if (userIds.length === 0) return [];

      const memberRows = await ctx.db
        .select({
          userId: memberProfiles.userId,
          displayName: memberProfiles.displayName,
          image: user.image,
        })
        .from(memberProfiles)
        .innerJoin(user, eq(memberProfiles.userId, user.id))
        .where(sql`${memberProfiles.userId} IN (${sql.join(userIds.map(id => sql`${id}`), sql`, `)})`);

      const memberMap = new Map(memberRows.map((m) => [m.userId, m]));

      return rows.map((row, index) => ({
        rank: index + 1,
        userId: row.userId,
        displayName: memberMap.get(row.userId)?.displayName ?? "Unknown",
        image: memberMap.get(row.userId)?.image ?? null,
        status: row.status,
        completedAt: row.completedAt,
        completedObjectives: row.completedObjectives,
        totalProgress: row.totalProgress,
      }));
    }),

  // ── Propose a community challenge ───────────────────────────────────────

  propose: protectedProcedure
    .input(
      z.object({
        title: z.string().min(3).max(100),
        description: z.string().min(10).max(2000),
        objectives: z
          .array(
            z.object({
              description: z.string().min(3),
              action: z.enum([
                "thread.reply",
                "thread.create",
                "knowledge.share",
                "idea.submitted",
                "idea.voted",
              ]),
              targetCount: z.number().min(1),
            }),
          )
          .min(1)
          .max(5),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();
      const userId = ctx.session.user.id;

      const challenge = await payload.create({
        collection: "challenges",
        data: {
          title: input.title,
          slug: `${input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80)}-${Date.now()}`,
          description: { root: { type: "root", children: [{ type: "paragraph", children: [{ type: "text", text: input.description }] }] } },
          type: "weekly",
          status: "draft",
          startsAt: new Date().toISOString(),
          endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          objectives: input.objectives.map((obj) => ({
            description: obj.description,
            action: obj.action,
            targetCount: obj.targetCount,
          })),
          xpReward: 100,
          maxParticipants: 0,
          proposedBy: userId,
        },
      });

      await logActivity(ctx.db, {
        actorId: userId,
        actorType: "member",
        action: "challenge.proposed",
        targetType: "challenges",
        targetId: String(challenge.id),
        metadata: { title: input.title },
      });

      return challenge;
    }),
});
```

**Step 2: Register the router in root.ts**

In `src/server/api/root.ts`, add the import and register:

Add import:
```typescript
import { challengesRouter } from "@/server/api/routers/challenges";
```

Add to `appRouter`:
```typescript
challenges: challengesRouter,
```

**Step 3: Commit**

```bash
git add src/server/api/routers/challenges.ts src/server/api/root.ts
git commit -m "feat(challenges): add tRPC challenges router with CRUD and leaderboard"
```

---

## Task 5: Challenge Progress Hook — Extend logActivity

**Files:**
- Modify: `src/server/agent/activity.ts`

**Step 1: Add challenge progress checking to logActivity**

Replace the contents of `src/server/agent/activity.ts`:

```typescript
import type { db as _db } from "@/server/db";
import {
  activityEvents,
  challengeEnrollments,
  challengeProgress,
} from "@/server/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getPayloadClient } from "@/server/payload";
import { awardXp, awardBadge } from "@/lib/gamification";

type DB = typeof _db;

export async function logActivity(
  db: DB,
  event: {
    actorId: string;
    actorType: "member" | "agent";
    action: string;
    targetType?: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
  },
) {
  await db.insert(activityEvents).values({
    actorId: event.actorId,
    actorType: event.actorType,
    action: event.action,
    targetType: event.targetType,
    targetId: event.targetId,
    metadata: event.metadata,
  });

  // Fire-and-forget: check challenge progress for member actions
  if (event.actorType === "member") {
    checkChallengeProgress(db, event.actorId, event.action, event.metadata).catch(
      (err) => console.error("[challenges] progress check failed:", err),
    );
  }
}

/**
 * Check if a member's action advances any active challenge objectives.
 */
async function checkChallengeProgress(
  db: DB,
  userId: string,
  action: string,
  metadata?: Record<string, unknown>,
) {
  // Find active enrollments for this user
  const enrollments = await db
    .select({
      enrollmentId: challengeEnrollments.id,
      challengeId: challengeEnrollments.challengeId,
    })
    .from(challengeEnrollments)
    .where(
      and(
        eq(challengeEnrollments.userId, userId),
        eq(challengeEnrollments.status, "active"),
      ),
    );

  if (enrollments.length === 0) return;

  const payload = await getPayloadClient();

  for (const enrollment of enrollments) {
    // Fetch challenge objectives
    const challenge = await payload.findByID({
      collection: "challenges",
      id: enrollment.challengeId,
      depth: 0,
    });

    const objectives = (challenge.objectives as { action: string; targetCount: number; filter?: Record<string, unknown> }[]) ?? [];

    for (let i = 0; i < objectives.length; i++) {
      const objective = objectives[i]!;

      // Check if this action matches the objective
      if (objective.action !== action) continue;

      // Check filter match (if present)
      if (objective.filter && metadata) {
        const filterMatch = Object.entries(objective.filter).every(
          ([key, value]) => metadata[key] === value,
        );
        if (!filterMatch) continue;
      }

      // Increment progress
      const [updated] = await db
        .update(challengeProgress)
        .set({
          currentCount: sql`${challengeProgress.currentCount} + 1`,
          completedAt: sql`CASE WHEN ${challengeProgress.currentCount} + 1 >= ${objective.targetCount} THEN CURRENT_TIMESTAMP ELSE ${challengeProgress.completedAt} END`,
        })
        .where(
          and(
            eq(challengeProgress.enrollmentId, enrollment.enrollmentId),
            eq(challengeProgress.objectiveIndex, i),
            sql`${challengeProgress.completedAt} IS NULL`, // Don't increment already completed
          ),
        )
        .returning();

      // Log objective completion for personal feed
      if (updated && updated.currentCount >= objective.targetCount) {
        await db.insert(activityEvents).values({
          actorId: userId,
          actorType: "member",
          action: "challenge.objective_completed",
          targetType: "challenges",
          targetId: String(enrollment.challengeId),
          metadata: {
            title: challenge.title,
            objectiveIndex: i,
            objectiveDescription: objective.action,
          },
        });
      }
    }

    // Check if all objectives are now complete
    const [incompleteCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(challengeProgress)
      .where(
        and(
          eq(challengeProgress.enrollmentId, enrollment.enrollmentId),
          sql`${challengeProgress.completedAt} IS NULL`,
        ),
      );

    if ((incompleteCount?.count ?? 0) === 0) {
      // All objectives complete — mark enrollment as completed
      await db
        .update(challengeEnrollments)
        .set({ status: "completed", completedAt: new Date() })
        .where(eq(challengeEnrollments.id, enrollment.enrollmentId));

      // Award XP
      if (challenge.xpReward && typeof challenge.xpReward === "number") {
        await awardXp(db, userId, challenge.xpReward);
      }

      // Award badge
      if (challenge.badgeReward && typeof challenge.badgeReward === "string") {
        await awardBadge(db, userId, challenge.badgeReward);
      }

      // Log challenge completion for community feed
      await db.insert(activityEvents).values({
        actorId: userId,
        actorType: "member",
        action: "challenge.completed",
        targetType: "challenges",
        targetId: String(enrollment.challengeId),
        metadata: {
          title: challenge.title,
          xpReward: challenge.xpReward,
        },
      });
    }
  }
}
```

**Step 2: Commit**

```bash
git add src/server/agent/activity.ts
git commit -m "feat(challenges): add progress tracking hook to logActivity"
```

---

## Task 6: Activity Feed — Add Challenge Action Verbs

**Files:**
- Modify: `src/components/activity-feed.tsx`

**Step 1: Add challenge verbs to ACTION_VERBS**

Add the following entries to the `ACTION_VERBS` record (around line 8):

```typescript
"challenge.enrolled": "joined a challenge",
"challenge.completed": "completed a challenge",
"challenge.abandoned": "left a challenge",
"challenge.proposed": "proposed a challenge",
"challenge.objective_completed": "completed a challenge objective",
```

**Step 2: Commit**

```bash
git add src/components/activity-feed.tsx
git commit -m "feat(challenges): add challenge actions to activity feed"
```

---

## Task 7: i18n — Challenge Translations

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/nl.json`

**Step 1: Add challenge translations to en.json**

Add a new `"challenges"` section and update the `"dashboard"` section:

In the `"dashboard"` section, add:
```json
"challenges": "Challenges"
```

Add a new top-level `"challenges"` section:
```json
"challenges": {
  "title": "Challenges",
  "active": "Active",
  "upcoming": "Upcoming",
  "completed": "Completed",
  "join": "Join Challenge",
  "leave": "Leave",
  "joined": "Joined",
  "full": "Full",
  "progress": "Progress",
  "timeLeft": "{days}d left",
  "ended": "Ended",
  "objectives": "Objectives",
  "leaderboard": "Leaderboard",
  "rank": "Rank",
  "reward": "Reward",
  "xp": "{amount} XP",
  "completedAll": "All objectives complete!",
  "empty": "No active challenges yet.",
  "propose": "Propose Challenge",
  "proposeDescription": "Suggest a challenge for the community",
  "proposedBy": "Proposed by {name}",
  "myChallenges": "My Challenges",
  "muteAdvice": "Mute agent advice",
  "unmuteAdvice": "Unmute agent advice"
}
```

**Step 2: Add Dutch translations to nl.json**

Add equivalent translations for Dutch (same structure, Dutch text).

**Step 3: Commit**

```bash
git add messages/en.json messages/nl.json
git commit -m "feat(challenges): add i18n translations for challenges"
```

---

## Task 8: Dashboard Tab — Add Challenges Tab

**Files:**
- Modify: `src/components/dashboard-tabs.tsx`

**Step 1: Add challenges tab**

Add the `TrophyIcon` import and a new tab entry:

```typescript
import {
  ActivityIcon,
  BotIcon,
  CalendarIcon,
  SettingsIcon,
  TrophyIcon,
} from "lucide-react";
```

Add to the `tabs` array after the agent tab:
```typescript
{ path: "/dashboard/challenges", icon: TrophyIcon, labelKey: "challenges" },
```

**Step 2: Commit**

```bash
git add src/components/dashboard-tabs.tsx
git commit -m "feat(challenges): add challenges tab to dashboard"
```

---

## Task 9: Challenge Dashboard Page

**Files:**
- Create: `src/app/[locale]/dashboard/challenges/page.tsx`
- Create: `src/components/challenges/challenge-list.tsx`
- Create: `src/components/challenges/challenge-card.tsx`
- Create: `src/components/challenges/challenge-progress.tsx`

**Step 1: Create the dashboard challenges page**

Create `src/app/[locale]/dashboard/challenges/page.tsx`:

```typescript
import type { Metadata } from "next";
import { getSession } from "@/server/better-auth/server";
import { redirect } from "next/navigation";
import { HydrateClient } from "@/trpc/server";
import { ChallengeList } from "@/components/challenges/challenge-list";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function ChallengesPage() {
  const session = await getSession();
  if (!session?.user) redirect("/auth/signin");

  return (
    <HydrateClient>
      <ChallengeList />
    </HydrateClient>
  );
}
```

**Step 2: Create the ChallengeList component**

Create `src/components/challenges/challenge-list.tsx`:

```typescript
"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { useTranslations } from "next-intl";
import { ChallengeCard } from "./challenge-card";

export function ChallengeList() {
  const t = useTranslations("challenges");
  const [tab, setTab] = useState<"active" | "my">("active");

  const { data: challenges, isLoading } = api.challenges.list.useQuery();
  const { data: myEnrollments } = api.challenges.getMyEnrollments.useQuery();

  const enrolledIds = new Set(myEnrollments?.map((e) => e.challengeId) ?? []);

  const activeChallenges = (challenges ?? []).filter(
    (c) => c.status === "active",
  );

  return (
    <div>
      <div className="border-b border-border pb-4">
        <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
          / CHALLENGES
        </span>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          onClick={() => setTab("active")}
          className={`rounded-full px-3 py-1 font-mono text-xs tracking-wider transition-colors ${
            tab === "active"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-muted-foreground hover:text-foreground"
          }`}
        >
          {t("active")}
        </button>
        <button
          onClick={() => setTab("my")}
          className={`rounded-full px-3 py-1 font-mono text-xs tracking-wider transition-colors ${
            tab === "my"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-muted-foreground hover:text-foreground"
          }`}
        >
          {t("myChallenges")}
        </button>
      </div>

      <div className="mt-4 space-y-4">
        {isLoading && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Loading...
          </p>
        )}

        {!isLoading && activeChallenges.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("empty")}
          </p>
        )}

        {activeChallenges.map((challenge) => (
          <ChallengeCard
            key={challenge.id}
            challenge={challenge}
            isEnrolled={enrolledIds.has(challenge.id)}
          />
        ))}
      </div>
    </div>
  );
}
```

**Step 3: Create the ChallengeCard component**

Create `src/components/challenges/challenge-card.tsx`:

```typescript
"use client";

import { api } from "@/trpc/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ChallengeProgress } from "./challenge-progress";

interface ChallengeCardProps {
  challenge: {
    id: number;
    title: string;
    type: string;
    status: string;
    startsAt: string;
    endsAt: string;
    xpReward: number;
    badgeReward?: string | null;
    objectives: { description: string; action: string; targetCount: number }[];
  };
  isEnrolled: boolean;
}

export function ChallengeCard({ challenge, isEnrolled }: ChallengeCardProps) {
  const t = useTranslations("challenges");
  const utils = api.useUtils();

  const enroll = api.challenges.enroll.useMutation({
    onSuccess: () => {
      void utils.challenges.getMyEnrollments.invalidate();
      void utils.challenges.getProgress.invalidate({ challengeId: challenge.id });
    },
  });

  const abandon = api.challenges.abandon.useMutation({
    onSuccess: () => {
      void utils.challenges.getMyEnrollments.invalidate();
    },
  });

  const daysLeft = Math.max(
    0,
    Math.ceil(
      (new Date(challenge.endsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    ),
  );

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-medium text-foreground">{challenge.title}</h3>
          <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            {challenge.type} &middot;{" "}
            {daysLeft > 0 ? t("timeLeft", { days: daysLeft }) : t("ended")}
          </span>
        </div>
        <div className="text-right">
          {!isEnrolled ? (
            <Button
              size="sm"
              className="font-mono text-xs tracking-wider"
              onClick={() => enroll.mutate({ challengeId: challenge.id })}
              disabled={enroll.isPending || daysLeft === 0}
            >
              {t("join")}
            </Button>
          ) : (
            <span className="rounded-full bg-secondary px-3 py-1 font-mono text-xs tracking-wider text-muted-foreground">
              {t("joined")}
            </span>
          )}
        </div>
      </div>

      {isEnrolled && (
        <div className="mt-4">
          <ChallengeProgress challengeId={challenge.id} objectives={challenge.objectives} />
        </div>
      )}

      <div className="mt-3 text-xs text-muted-foreground">
        {t("reward")}: {t("xp", { amount: challenge.xpReward })}
        {challenge.badgeReward && ` + badge`}
      </div>
    </div>
  );
}
```

**Step 4: Create the ChallengeProgress component**

Create `src/components/challenges/challenge-progress.tsx`:

```typescript
"use client";

import { api } from "@/trpc/react";
import { CheckIcon } from "lucide-react";

interface ChallengeProgressProps {
  challengeId: number;
  objectives: { description: string; action: string; targetCount: number }[];
}

export function ChallengeProgress({ challengeId, objectives }: ChallengeProgressProps) {
  const { data } = api.challenges.getProgress.useQuery({ challengeId });

  if (!data) return null;

  return (
    <div className="space-y-2">
      {objectives.map((objective, index) => {
        const progress = data.progress.find((p) => p.objectiveIndex === index);
        const current = progress?.currentCount ?? 0;
        const target = objective.targetCount;
        const isComplete = progress?.completedAt !== null && progress?.completedAt !== undefined;
        const pct = Math.min(100, Math.round((current / target) * 100));

        return (
          <div key={index} className="flex items-center gap-2">
            <div className="flex-1">
              <div className="flex items-center justify-between text-xs">
                <span className={isComplete ? "text-foreground line-through" : "text-foreground"}>
                  {objective.description}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {current}/{target}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
                <div
                  className={`h-full rounded-full transition-all ${isComplete ? "bg-green-500" : "bg-primary"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
            {isComplete && (
              <CheckIcon className="h-4 w-4 shrink-0 text-green-500" />
            )}
          </div>
        );
      })}
    </div>
  );
}
```

**Step 5: Commit**

```bash
git add src/app/[locale]/dashboard/challenges/ src/components/challenges/
git commit -m "feat(challenges): add challenges dashboard page with list, card, and progress UI"
```

---

## Task 10: Dashboard Home — Add Active Challenges Widget

**Files:**
- Create: `src/components/challenges/active-challenges-widget.tsx`
- Modify: `src/app/[locale]/dashboard/page.tsx`

**Step 1: Create ActiveChallengesWidget**

Create `src/components/challenges/active-challenges-widget.tsx`:

```typescript
"use client";

import { api } from "@/trpc/react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { TrophyIcon } from "lucide-react";
import { ChallengeProgress } from "./challenge-progress";

export function ActiveChallengesWidget() {
  const t = useTranslations("challenges");
  const { data: challenges } = api.challenges.list.useQuery();
  const { data: enrollments } = api.challenges.getMyEnrollments.useQuery();

  const activeEnrollments = (enrollments ?? []).filter(
    (e) => e.status === "active",
  );

  if (activeEnrollments.length === 0) return null;

  // Match enrollments with challenge data
  const challengeMap = new Map(
    (challenges ?? []).map((c) => [c.id, c]),
  );

  return (
    <div>
      <div className="border-b border-border pb-4">
        <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
          / ACTIVE CHALLENGES
        </span>
      </div>

      <div className="mt-4 space-y-4">
        {activeEnrollments.map((enrollment) => {
          const challenge = challengeMap.get(enrollment.challengeId);
          if (!challenge) return null;

          const objectives = (challenge.objectives as { description: string; action: string; targetCount: number }[]) ?? [];
          const daysLeft = Math.max(
            0,
            Math.ceil(
              (new Date(challenge.endsAt).getTime() - Date.now()) /
                (1000 * 60 * 60 * 24),
            ),
          );

          return (
            <Link
              key={enrollment.id}
              href="/dashboard/challenges"
              className="block rounded-lg border border-border p-3 transition-colors hover:bg-secondary/30"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrophyIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{challenge.title}</span>
                </div>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {t("timeLeft", { days: daysLeft })}
                </span>
              </div>
              <div className="mt-2">
                <ChallengeProgress
                  challengeId={challenge.id}
                  objectives={objectives}
                />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
```

**Step 2: Add widget to dashboard page**

In `src/app/[locale]/dashboard/page.tsx`, add the import and component:

Add import:
```typescript
import { ActiveChallengesWidget } from "@/components/challenges/active-challenges-widget";
```

Add `<ActiveChallengesWidget />` after `<OnboardingChecklist />`:
```typescript
<div className="space-y-8">
  <DashboardProfile ... />
  <OnboardingChecklist />
  <ActiveChallengesWidget />
  <ActivityFeed />
  <SocialSuggestions />
</div>
```

**Step 3: Commit**

```bash
git add src/components/challenges/active-challenges-widget.tsx src/app/[locale]/dashboard/page.tsx
git commit -m "feat(challenges): add active challenges widget to dashboard home"
```

---

## Task 11: Challenge Leaderboard Component

**Files:**
- Create: `src/components/challenges/challenge-leaderboard.tsx`

**Step 1: Create leaderboard component**

Create `src/components/challenges/challenge-leaderboard.tsx`:

```typescript
"use client";

import { api } from "@/trpc/react";
import { useTranslations } from "next-intl";

interface ChallengeLeaderboardProps {
  challengeId: number;
}

export function ChallengeLeaderboard({ challengeId }: ChallengeLeaderboardProps) {
  const t = useTranslations("challenges");
  const { data, isLoading } = api.challenges.getLeaderboard.useQuery({
    challengeId,
    limit: 10,
  });

  if (isLoading || !data || data.length === 0) return null;

  return (
    <div className="mt-4">
      <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
        {t("leaderboard")}
      </span>
      <div className="mt-2 space-y-1">
        {data.map((entry) => (
          <div
            key={entry.userId}
            className="flex items-center gap-3 rounded px-2 py-1.5 text-sm"
          >
            <span className="w-6 font-mono text-xs text-muted-foreground">
              #{entry.rank}
            </span>
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary font-mono text-[10px] font-medium text-muted-foreground">
              {entry.displayName.charAt(0).toUpperCase()}
            </div>
            <span className="flex-1 font-medium">{entry.displayName}</span>
            <span className="font-mono text-xs text-muted-foreground">
              {entry.completedObjectives} obj
              {entry.status === "completed" && " \u2713"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/challenges/challenge-leaderboard.tsx
git commit -m "feat(challenges): add challenge leaderboard component"
```

---

## Task 12: Proactive Agent Advisory — Scheduled Job

**Files:**
- Create: `src/app/api/cron/challenge-advisory/route.ts`

**Step 1: Create the advisory cron route**

Create `src/app/api/cron/challenge-advisory/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { eq, and, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  challengeEnrollments,
  challengeProgress,
  agentProfiles,
  conversations,
  conversationParticipants,
  messages,
} from "@/server/db/schema";
import { getPayloadClient } from "@/server/payload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron job: runs daily to send proactive challenge advice from agents to members.
 * Protected by CRON_SECRET header to prevent unauthorized access.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await getPayloadClient();

  // Get all active challenges
  const { docs: activeChallenges } = await payload.find({
    collection: "challenges",
    where: { status: { equals: "active" } },
    limit: 100,
    depth: 0,
  });

  let advisorySent = 0;

  for (const challenge of activeChallenges) {
    // Get active enrollments for this challenge
    const enrollments = await db
      .select({
        enrollmentId: challengeEnrollments.id,
        userId: challengeEnrollments.userId,
      })
      .from(challengeEnrollments)
      .where(
        and(
          eq(challengeEnrollments.challengeId, challenge.id),
          eq(challengeEnrollments.status, "active"),
        ),
      );

    for (const enrollment of enrollments) {
      // Check if member has an active agent
      const [agent] = await db
        .select({ id: agentProfiles.id, name: agentProfiles.name })
        .from(agentProfiles)
        .where(
          and(
            eq(agentProfiles.ownerId, enrollment.userId),
            eq(agentProfiles.status, "active"),
          ),
        )
        .limit(1);

      if (!agent) continue;

      // Get incomplete objectives
      const progressRows = await db
        .select()
        .from(challengeProgress)
        .where(
          and(
            eq(challengeProgress.enrollmentId, enrollment.enrollmentId),
            sql`${challengeProgress.completedAt} IS NULL`,
          ),
        );

      if (progressRows.length === 0) continue;

      // Build advice message
      const objectives = (challenge.objectives as { description: string; action: string; targetCount: number }[]) ?? [];
      const totalObjectives = objectives.length;
      const completedCount = totalObjectives - progressRows.length;

      let message = `**Challenge Update: "${challenge.title}"**\n\n`;
      message += `You've completed ${completedCount}/${totalObjectives} objectives. Here's what's left:\n\n`;

      for (const progress of progressRows) {
        const objective = objectives[progress.objectiveIndex];
        if (!objective) continue;
        message += `- **${objective.description}** (${progress.currentCount}/${objective.targetCount})\n`;
      }

      message += `\nI'll keep scouting for opportunities. Check the community forum and ideas board!`;

      // Find or create agent conversation
      const [existingConv] = await db
        .select({ id: conversations.id })
        .from(conversations)
        .innerJoin(
          conversationParticipants,
          eq(conversationParticipants.conversationId, conversations.id),
        )
        .where(
          and(
            eq(conversations.type, "agent"),
            eq(conversationParticipants.userId, enrollment.userId),
          ),
        )
        .limit(1);

      let convId: string;
      if (existingConv) {
        convId = existingConv.id;
      } else {
        const [newConv] = await db
          .insert(conversations)
          .values({ type: "agent" })
          .returning();
        await db.insert(conversationParticipants).values({
          conversationId: newConv!.id,
          userId: enrollment.userId,
          isPinned: true,
        });
        convId = newConv!.id;
      }

      // Send the advisory message
      await db.insert(messages).values({
        conversationId: convId,
        senderId: enrollment.userId,
        senderType: "agent",
        content: message,
        metadata: {
          type: "challenge_advisory",
          challengeId: challenge.id,
        },
      });

      await db
        .update(conversations)
        .set({ updatedAt: new Date() })
        .where(eq(conversations.id, convId));

      advisorySent++;
    }
  }

  return NextResponse.json({
    success: true,
    advisorySent,
    timestamp: new Date().toISOString(),
  });
}
```

**Step 2: Add Vercel cron config**

Add to `vercel.json` (create if doesn't exist) or the existing config:

```json
{
  "crons": [
    {
      "path": "/api/cron/challenge-advisory",
      "schedule": "0 9 * * *"
    }
  ]
}
```

**Step 3: Commit**

```bash
git add src/app/api/cron/challenge-advisory/route.ts vercel.json
git commit -m "feat(challenges): add daily proactive agent advisory cron job"
```

---

## Task 13: Challenge Expiry — Scheduled Job

**Files:**
- Create: `src/app/api/cron/challenge-expiry/route.ts`

**Step 1: Create the expiry cron route**

Create `src/app/api/cron/challenge-expiry/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { eq, and, sql, lte } from "drizzle-orm";
import { db } from "@/server/db";
import {
  challengeEnrollments,
  challengeProgress,
  activityEvents,
} from "@/server/db/schema";
import { getPayloadClient } from "@/server/payload";
import { awardXp } from "@/lib/gamification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron job: runs daily to expire challenges past their end date.
 * Awards partial XP for incomplete enrollments.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await getPayloadClient();

  // Find active challenges past their end date
  const { docs: expiredChallenges } = await payload.find({
    collection: "challenges",
    where: {
      and: [
        { status: { equals: "active" } },
        { endsAt: { less_than: new Date().toISOString() } },
      ],
    },
    limit: 100,
    depth: 0,
  });

  let expired = 0;

  for (const challenge of expiredChallenges) {
    // Mark challenge as completed in CMS
    await payload.update({
      collection: "challenges",
      id: challenge.id,
      data: { status: "completed" },
    });

    // Find active enrollments
    const activeEnrollments = await db
      .select()
      .from(challengeEnrollments)
      .where(
        and(
          eq(challengeEnrollments.challengeId, challenge.id),
          eq(challengeEnrollments.status, "active"),
        ),
      );

    for (const enrollment of activeEnrollments) {
      // Calculate partial completion
      const objectives = (challenge.objectives as { targetCount: number }[]) ?? [];
      const totalObjectives = objectives.length;

      const [completedResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(challengeProgress)
        .where(
          and(
            eq(challengeProgress.enrollmentId, enrollment.id),
            sql`${challengeProgress.completedAt} IS NOT NULL`,
          ),
        );

      const completedCount = completedResult?.count ?? 0;

      // Mark as abandoned
      await db
        .update(challengeEnrollments)
        .set({ status: "abandoned" })
        .where(eq(challengeEnrollments.id, enrollment.id));

      // Award partial XP (proportional to objectives completed)
      if (completedCount > 0 && challenge.xpReward && typeof challenge.xpReward === "number") {
        const partialXp = Math.round(
          (challenge.xpReward * completedCount) / totalObjectives,
        );
        if (partialXp > 0) {
          await awardXp(db, enrollment.userId, partialXp);
        }
      }

      // Log activity
      await db.insert(activityEvents).values({
        actorId: enrollment.userId,
        actorType: "member",
        action: "challenge.abandoned",
        targetType: "challenges",
        targetId: String(challenge.id),
        metadata: {
          title: challenge.title,
          completedObjectives: completedCount,
          totalObjectives,
        },
      });

      expired++;
    }
  }

  return NextResponse.json({
    success: true,
    expiredEnrollments: expired,
    expiredChallenges: expiredChallenges.length,
    timestamp: new Date().toISOString(),
  });
}
```

**Step 2: Add to vercel.json crons**

Add alongside the advisory cron:
```json
{
  "path": "/api/cron/challenge-expiry",
  "schedule": "0 0 * * *"
}
```

**Step 3: Commit**

```bash
git add src/app/api/cron/challenge-expiry/route.ts vercel.json
git commit -m "feat(challenges): add daily challenge expiry cron with partial XP"
```

---

## Task 14: Build Verification & Type Check

**Step 1: Run TypeScript type check**

Run: `pnpm tsc --noEmit`
Expected: No type errors

**Step 2: Run build**

Run: `pnpm build`
Expected: Build succeeds

**Step 3: Fix any issues found**

Address any type errors or build failures.

**Step 4: Commit fixes (if any)**

```bash
git add -A
git commit -m "fix(challenges): resolve build issues"
```

---

## Task Summary

| Task | What | Files |
|------|------|-------|
| 1 | Drizzle schema (enrollments + progress) | `schema.ts` |
| 2 | Payload CMS Challenges collection | `Challenges.ts`, `payload.config.ts` |
| 3 | New badges & XP | `gamification.ts` |
| 4 | tRPC challenges router | `challenges.ts`, `root.ts` |
| 5 | Progress hook in logActivity | `activity.ts` |
| 6 | Activity feed verbs | `activity-feed.tsx` |
| 7 | i18n translations | `en.json`, `nl.json` |
| 8 | Dashboard tab | `dashboard-tabs.tsx` |
| 9 | Challenges page + components | 4 new component files |
| 10 | Dashboard widget | `active-challenges-widget.tsx`, `page.tsx` |
| 11 | Leaderboard component | `challenge-leaderboard.tsx` |
| 12 | Proactive advisory cron | `challenge-advisory/route.ts` |
| 13 | Challenge expiry cron | `challenge-expiry/route.ts` |
| 14 | Build verification | N/A |
