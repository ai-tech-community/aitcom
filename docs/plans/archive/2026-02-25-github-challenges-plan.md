# GitHub Challenges — Unified System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current simple challenge system with a unified system supporting repo-based challenges, dedicated channels, test verification, sponsor integration, and AI agent collaboration from the IDE.

**Architecture:** Clean replacement of the existing challenge Payload collection and Drizzle tables. New `challengeChannel` tRPC router for forum-per-challenge. Extended `agent` and `challenges` routers with new procedures. New MCP tools for agent-challenge interaction. Updated activity system with multi-mode verification engine.

**Tech Stack:** Payload CMS 3 (challenge content), Drizzle ORM + Neon PostgreSQL (enrollment, progress, channels, test results), tRPC 11 (API), MCP SDK (agent tools), Next.js 15 App Router (UI), shadcn/ui + Tailwind CSS 4 (components)

**Design doc:** `docs/plans/2026-02-25-github-challenges-design.md`

---

## Phase 1: Schema & Foundation

### Task 1: Replace Payload Challenge Collection

**Files:**
- Modify: `src/collections/Challenges.ts`

**Step 1: Rewrite the Challenges collection**

Replace the entire file with the new unified schema:

```typescript
import type { CollectionConfig } from "payload";

export const Challenges: CollectionConfig = {
  slug: "challenges",
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "type", "status", "difficulty", "startsAt"],
    description:
      "Unified challenges: platform-action, repo-based, or mixed. Supports sponsor publishing, test verification, and agent collaboration.",
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
        { label: "Open-Ended", value: "open-ended" },
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
      name: "difficulty",
      type: "select",
      required: true,
      defaultValue: "beginner",
      options: [
        { label: "Beginner", value: "beginner" },
        { label: "Intermediate", value: "intermediate" },
        { label: "Advanced", value: "advanced" },
        { label: "Expert", value: "expert" },
      ],
      admin: { position: "sidebar" },
    },
    {
      name: "startsAt",
      type: "date",
      admin: {
        position: "sidebar",
        description: "Optional for open-ended challenges.",
      },
    },
    {
      name: "endsAt",
      type: "date",
      admin: {
        position: "sidebar",
        description: "Optional for open-ended challenges.",
      },
    },
    {
      name: "publishedBy",
      type: "select",
      required: true,
      defaultValue: "member",
      options: [
        { label: "Member", value: "member" },
        { label: "Sponsor", value: "sponsor" },
      ],
      admin: { position: "sidebar" },
    },
    {
      name: "creatorId",
      type: "text",
      required: true,
      admin: {
        position: "sidebar",
        description: "User ID or Sponsor ID of the challenge creator.",
      },
    },
    // ── Repo config (optional group) ─────────────────────────────────────
    {
      name: "repo",
      type: "group",
      admin: {
        description: "GitHub repo configuration for repo-based challenges.",
      },
      fields: [
        {
          name: "templateUrl",
          type: "text",
          admin: {
            description: "GitHub template repo URL (e.g., https://github.com/org/repo).",
          },
        },
        {
          name: "configFile",
          type: "checkbox",
          defaultValue: false,
          admin: {
            description: "Whether .aitchallenge.yml is expected in participant repos.",
          },
        },
        {
          name: "testCommand",
          type: "text",
          admin: {
            description: 'Shell command to run tests (e.g., "npm test", "pytest").',
          },
        },
      ],
    },
    // ── Objectives ───────────────────────────────────────────────────────
    {
      name: "objectives",
      type: "array",
      required: true,
      minRows: 1,
      maxRows: 10,
      fields: [
        {
          name: "description",
          type: "text",
          required: true,
        },
        {
          name: "verification",
          type: "select",
          required: true,
          defaultValue: "self-report",
          options: [
            { label: "Platform Action", value: "platform-action" },
            { label: "Test", value: "test" },
            { label: "Self-Report", value: "self-report" },
            { label: "Peer Review", value: "peer-review" },
          ],
        },
        {
          name: "action",
          type: "select",
          options: [
            { label: "Reply to thread", value: "thread.reply" },
            { label: "Create thread", value: "thread.create" },
            { label: "Share knowledge", value: "knowledge.share" },
            { label: "Submit idea", value: "idea.submitted" },
            { label: "Vote on idea", value: "idea.voted" },
          ],
          admin: {
            description: "Only for platform-action verification.",
            condition: (_, siblingData) => siblingData?.verification === "platform-action",
          },
        },
        {
          name: "testPattern",
          type: "text",
          admin: {
            description: "Regex matching test names/files for test verification.",
            condition: (_, siblingData) => siblingData?.verification === "test",
          },
        },
        {
          name: "targetCount",
          type: "number",
          required: true,
          min: 1,
          defaultValue: 1,
          admin: {
            description: "How many times this must be completed. For tests, usually 1.",
          },
        },
        {
          name: "filter",
          type: "json",
          admin: {
            description: 'Optional scope filter for platform-action, e.g. { "category": "question" }.',
          },
        },
      ],
    },
    // ── Rewards ──────────────────────────────────────────────────────────
    {
      name: "rewards",
      type: "group",
      fields: [
        {
          name: "xpReward",
          type: "number",
          required: true,
          min: 0,
          defaultValue: 0,
          admin: { description: "XP awarded on completion." },
        },
        {
          name: "badgeReward",
          type: "text",
          admin: { description: "Badge slug to award on completion (optional)." },
        },
        {
          name: "sponsorReward",
          type: "text",
          admin: {
            description: "Sponsor-provided reward description (prizes, interviews, licenses).",
          },
        },
      ],
    },
    // ── Settings ─────────────────────────────────────────────────────────
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
      name: "tags",
      type: "json",
      admin: {
        description: 'Array of tags for discovery, e.g. ["mcp", "typescript", "automation"].',
      },
    },
    {
      name: "rankingMode",
      type: "select",
      defaultValue: "speed",
      options: [
        { label: "Speed", value: "speed" },
        { label: "Thoroughness", value: "thoroughness" },
        { label: "Collaboration", value: "collaboration" },
      ],
      admin: {
        position: "sidebar",
        description: "How the leaderboard is sorted.",
      },
    },
    {
      name: "proposedBy",
      type: "text",
      admin: {
        position: "sidebar",
        description: "User ID if community-proposed.",
      },
    },
    { name: "image", type: "upload", relationTo: "media" },
  ],
  timestamps: true,
};
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors related to Challenges collection

**Step 3: Commit**

```bash
git add src/collections/Challenges.ts
git commit -m "feat(challenges): replace Payload collection with unified schema

Adds: type open-ended, difficulty, repo group, verification modes per
objective (platform-action/test/self-report/peer-review), rewards group
with sponsorReward, tags, rankingMode, publishedBy/creatorId."
```

---

### Task 2: Update Drizzle Schema — New & Modified Tables

**Files:**
- Modify: `src/server/db/schema.ts`

**Step 1: Replace challengeEnrollments table (lines 467-507)**

Replace from `// Challenge enrollments` comment through `challengeEnrollmentRelations` closing paren:

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
    progressLogThreadId: d.varchar({ length: 255 }), // FK → challengeThreads.id (set after creation)
    enrolledAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    completedAt: d.timestamp({ withTimezone: true }),
    submittedAt: d.timestamp({ withTimezone: true }), // When solution submitted for review
    status: d
      .varchar({ length: 20 })
      .notNull()
      .default("active")
      .$type<"active" | "completed" | "abandoned" | "submitted">(),
  }),
  (t) => [
    index("enrollment_challenge_idx").on(t.challengeId),
    index("enrollment_user_idx").on(t.userId),
    uniqueIndex("enrollment_user_challenge_uidx").on(t.userId, t.challengeId),
  ],
);

export const challengeEnrollmentRelations = relations(
  challengeEnrollments,
  ({ one, many }) => ({
    user: one(user, {
      fields: [challengeEnrollments.userId],
      references: [user.id],
    }),
    progress: many(challengeProgress),
    testResults: many(challengeTestResults),
  }),
);
```

**Step 2: Replace challengeProgress table (lines 509-543)**

Replace from `// Challenge progress` comment through `challengeProgressRelations` closing paren:

```typescript
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
    verificationMode: d
      .varchar({ length: 20 })
      .notNull()
      .default("self-report")
      .$type<"platform-action" | "test" | "self-report" | "peer-review">(),
    reviewedBy: d.varchar({ length: 255 }), // userId of reviewer (for peer-review)
    reviewedAt: d.timestamp({ withTimezone: true }),
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

**Step 3: Add new tables after challengeProgressRelations**

Add these new tables:

```typescript
// Challenge test results (test run history per enrollment)
export const challengeTestResults = appSchema.table(
  "challenge_test_result",
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
    passed: d.boolean().notNull(),
    details: d.text(), // Test output summary
    reportedBy: d
      .varchar({ length: 10 })
      .notNull()
      .default("agent")
      .$type<"agent" | "ci">(),
    reportedAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    index("test_result_enrollment_idx").on(t.enrollmentId),
    index("test_result_enrollment_objective_idx").on(
      t.enrollmentId,
      t.objectiveIndex,
    ),
  ],
);

export const challengeTestResultRelations = relations(
  challengeTestResults,
  ({ one }) => ({
    enrollment: one(challengeEnrollments, {
      fields: [challengeTestResults.enrollmentId],
      references: [challengeEnrollments.id],
    }),
  }),
);

// Challenge channels (dedicated forum per challenge)
export const challengeChannels = appSchema.table(
  "challenge_channel",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    challengeId: d.integer().notNull().unique(), // One channel per challenge
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    uniqueIndex("channel_challenge_uidx").on(t.challengeId),
  ],
);

export const challengeChannelRelations = relations(
  challengeChannels,
  ({ many }) => ({
    threads: many(challengeThreads),
  }),
);

// Challenge threads (threads within a channel)
export const challengeThreads = appSchema.table(
  "challenge_thread",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    channelId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => challengeChannels.id),
    type: d
      .varchar({ length: 20 })
      .notNull()
      .$type<"announcement" | "discussion" | "question" | "progress-log" | "solution">(),
    authorId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    authorType: d
      .varchar({ length: 10 })
      .notNull()
      .default("member")
      .$type<"member" | "agent" | "sponsor">(),
    title: d.varchar({ length: 500 }).notNull(),
    content: d.text().notNull(),
    isPinned: d.boolean().notNull().default(false),
    metadata: d.json().$type<Record<string, unknown>>(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull()
      .$onUpdate(() => new Date()),
  }),
  (t) => [
    index("thread_channel_idx").on(t.channelId),
    index("thread_type_idx").on(t.type),
    index("thread_author_idx").on(t.authorId),
  ],
);

export const challengeThreadRelations = relations(
  challengeThreads,
  ({ one, many }) => ({
    channel: one(challengeChannels, {
      fields: [challengeThreads.channelId],
      references: [challengeChannels.id],
    }),
    author: one(user, {
      fields: [challengeThreads.authorId],
      references: [user.id],
    }),
    replies: many(challengeReplies),
  }),
);

// Challenge replies (replies within a thread)
export const challengeReplies = appSchema.table(
  "challenge_reply",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    threadId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => challengeThreads.id),
    authorId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    authorType: d
      .varchar({ length: 10 })
      .notNull()
      .default("member")
      .$type<"member" | "agent" | "sponsor">(),
    content: d.text().notNull(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    index("reply_thread_idx").on(t.threadId),
    index("reply_author_idx").on(t.authorId),
  ],
);

export const challengeReplyRelations = relations(
  challengeReplies,
  ({ one }) => ({
    thread: one(challengeThreads, {
      fields: [challengeReplies.threadId],
      references: [challengeThreads.id],
    }),
    author: one(user, {
      fields: [challengeReplies.authorId],
      references: [user.id],
    }),
  }),
);
```

**Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors in schema.ts

**Step 5: Push schema to database**

Run: `pnpm db:push`
Expected: New tables created, existing tables altered. Review the SQL output carefully — it will drop/recreate columns on `challenge_enrollment` and `challenge_progress`.

**Step 6: Commit**

```bash
git add src/server/db/schema.ts
git commit -m "feat(challenges): add unified Drizzle schema

New tables: challenge_test_result, challenge_channel, challenge_thread,
challenge_reply. Extended: challenge_enrollment (progressLogThreadId,
submittedAt, submitted status), challenge_progress (verificationMode,
reviewedBy, reviewedAt)."
```

---

## Phase 2: Core Backend

### Task 3: Update Gamification — New Badges & XP

**Files:**
- Modify: `src/lib/gamification.ts`

**Step 1: Add new badges to BADGES object (after `mission_impossible`)**

```typescript
  repo_first: {
    slug: "repo_first",
    name: "Repo Warrior",
    description: "Completed your first repo-based challenge",
    icon: "🏗️",
  },
  test_perfect: {
    slug: "test_perfect",
    name: "Test Master",
    description: "100% test pass on a challenge with 10+ tests",
    icon: "✅",
  },
  challenge_helper: {
    slug: "challenge_helper",
    name: "Helpful Hand",
    description: "Answered 10 questions across challenge channels",
    icon: "🤝",
  },
  sponsor_pick: {
    slug: "sponsor_pick",
    name: "Sponsor's Pick",
    description: "A sponsor approved your peer-review solution",
    icon: "⭐",
  },
  challenge_author: {
    slug: "challenge_author",
    name: "Challenge Author",
    description: "Published a challenge that got 5+ enrollments",
    icon: "📝",
  },
  speed_demon: {
    slug: "speed_demon",
    name: "Speed Demon",
    description: "Completed a weekly challenge in under 24 hours",
    icon: "⚡",
  },
  agent_collab: {
    slug: "agent_collab",
    name: "Full Stack Agent",
    description: "Completed a challenge where your agent posted 5+ progress updates",
    icon: "🤖",
  },
  streak_10: {
    slug: "streak_10",
    name: "Streak Master",
    description: "Completed 10 challenges",
    icon: "🔥",
  },
```

**Step 2: Add new XP amounts**

```typescript
export const XP_AMOUNTS = {
  PROFILE_COMPLETE: 50,
  REGISTER_EVENT: 25,
  ATTEND_EVENT: 100,
  FIRST_EVENT_BONUS: 50,
  AGENT_SETUP: 25,
  ONBOARDING_STEP: 10,
  ONBOARDING_COMPLETE: 50,
  CHALLENGE_PROPOSE_PUBLISHED: 50,
  CHALLENGE_ENROLL: 10,
  CHALLENGE_CHANNEL_POST: 5,
  CHALLENGE_ANSWER_QUESTION: 10,
  CHALLENGE_SOLUTION_APPROVED: 25,
} as const;
```

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

**Step 4: Commit**

```bash
git add src/lib/gamification.ts
git commit -m "feat(challenges): add new badges and XP amounts

Badges: repo_first, test_perfect, challenge_helper, sponsor_pick,
challenge_author, speed_demon, agent_collab, streak_10.
XP: enroll, channel post, answer question, solution approved."
```

---

### Task 4: Update Activity System — Multi-Mode Verification Engine

**Files:**
- Modify: `src/server/agent/activity.ts`

**Step 1: Rewrite activity.ts with new verification engine**

The `logActivity` function stays the same. Replace `checkChallengeProgress` to only handle `platform-action` verification (the other modes are handled by explicit MCP tool calls, not activity events):

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

  // Fire-and-forget: check challenge progress for member platform actions
  if (event.actorType === "member") {
    checkPlatformActionProgress(db, event.actorId, event.action, event.metadata).catch(
      (err) => console.error("[challenges] progress check failed:", err),
    );
  }
}

/**
 * Check if a member's platform action advances any "platform-action" objectives.
 * Other verification modes (test, self-report, peer-review) are handled by
 * explicit MCP tool calls in the challenges/agent routers.
 */
async function checkPlatformActionProgress(
  db: DB,
  userId: string,
  action: string,
  metadata?: Record<string, unknown>,
) {
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
    const challenge = await payload.findByID({
      collection: "challenges",
      id: enrollment.challengeId,
      depth: 0,
    });

    const objectives =
      (challenge.objectives as
        | {
            verification?: string;
            action?: string;
            targetCount: number;
            filter?: Record<string, unknown>;
          }[]
        | undefined) ?? [];

    for (let i = 0; i < objectives.length; i++) {
      const objective = objectives[i]!;

      // Only handle platform-action verification
      if (objective.verification !== "platform-action") continue;
      if (objective.action !== action) continue;

      // Check filter match
      if (objective.filter && metadata) {
        const filterMatch = Object.entries(objective.filter).every(
          ([key, value]) => metadata[key] === value,
        );
        if (!filterMatch) continue;
      }

      // Increment progress (only for platform-action objectives)
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
            eq(challengeProgress.verificationMode, "platform-action"),
            sql`${challengeProgress.completedAt} IS NULL`,
          ),
        )
        .returning();

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
    await checkEnrollmentCompletion(db, enrollment.enrollmentId, enrollment.challengeId, userId);
  }
}

/**
 * Shared function: check if all objectives for an enrollment are complete.
 * Called by platform-action progress, test results, self-report, and peer-review flows.
 */
export async function checkEnrollmentCompletion(
  db: DB,
  enrollmentId: string,
  challengeId: number,
  userId: string,
) {
  const [incompleteCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(challengeProgress)
    .where(
      and(
        eq(challengeProgress.enrollmentId, enrollmentId),
        sql`${challengeProgress.completedAt} IS NULL`,
      ),
    );

  if ((incompleteCount?.count ?? 0) !== 0) return;

  // All objectives complete — mark enrollment
  const [enrollment] = await db
    .update(challengeEnrollments)
    .set({ status: "completed", completedAt: new Date() })
    .where(
      and(
        eq(challengeEnrollments.id, enrollmentId),
        eq(challengeEnrollments.status, "active"),
      ),
    )
    .returning();

  if (!enrollment) return; // Already completed

  const payload = await getPayloadClient();
  const challenge = await payload.findByID({
    collection: "challenges",
    id: challengeId,
    depth: 0,
  });

  const rewards = challenge.rewards as
    | { xpReward?: number; badgeReward?: string }
    | undefined;

  if (rewards?.xpReward && typeof rewards.xpReward === "number") {
    await awardXp(db, userId, rewards.xpReward);
  }

  if (rewards?.badgeReward && typeof rewards.badgeReward === "string") {
    await awardBadge(db, userId, rewards.badgeReward);
  }

  await db.insert(activityEvents).values({
    actorId: userId,
    actorType: "member",
    action: "challenge.completed",
    targetType: "challenges",
    targetId: String(challengeId),
    metadata: {
      title: challenge.title,
      xpReward: rewards?.xpReward,
    },
  });
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/server/agent/activity.ts
git commit -m "feat(challenges): update activity system for multi-mode verification

Platform-action objectives tracked via logActivity. Other modes (test,
self-report, peer-review) use explicit calls. Extract shared
checkEnrollmentCompletion for reuse across all verification flows."
```

---

### Task 5: Rewrite Challenges tRPC Router

**Files:**
- Modify: `src/server/api/routers/challenges.ts`

**Step 1: Rewrite the entire router**

This is the largest single file change. The router keeps `list`, `getById`, `enroll`, `abandon`, `getMyEnrollments`, `getProgress`, `getLeaderboard`, `propose` but updates them all for the new schema, and adds: `create` (sponsor), `submitSolution`, `reviewSolution`, `getTestResults`.

Key changes vs. current:
- `enroll` now creates a channel (if needed), a progress-log thread, and stores `progressLogThreadId`
- `enroll` sets `verificationMode` per progress row from the objective definition
- `getLeaderboard` supports ranking modes (speed/thoroughness/collaboration)
- New `create` procedure for sponsor challenge creation
- New `submitSolution` and `reviewSolution` for peer-review flow
- Rewards are now in `challenge.rewards` group, not top-level
- `xpReward` → `challenge.rewards.xpReward`

The full implementation follows the exact same patterns as the current router (see `src/server/api/routers/challenges.ts`). Key imports to add:

```typescript
import {
  challengeEnrollments,
  challengeProgress,
  challengeTestResults,
  challengeChannels,
  challengeThreads,
  challengeReplies,
  memberProfiles,
  user,
} from "@/server/db/schema";
import { checkEnrollmentCompletion } from "@/server/agent/activity";
```

The implementation for each procedure should:
- Use the same `ctx.db`, `ctx.session.user.id`, `getPayloadClient()` patterns
- Reference `challenge.rewards.xpReward` instead of `challenge.xpReward`
- Create channel + progress-log thread in `enroll`
- Use `verificationMode` column when creating progress rows
- `submitSolution`: creates a solution thread + sets enrollment `submittedAt`
- `reviewSolution`: protected procedure, verifies caller is challenge creator, updates `reviewedBy`/`reviewedAt`/`completedAt` on the matching progress row, then calls `checkEnrollmentCompletion`

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/server/api/routers/challenges.ts
git commit -m "feat(challenges): rewrite tRPC router for unified system

Updated: list, getById, enroll (with channel+thread creation),
abandon, getMyEnrollments, getProgress, getLeaderboard (ranking modes).
New: create (sponsor), submitSolution, reviewSolution, getTestResults."
```

---

### Task 6: Create Challenge Channel tRPC Router

**Files:**
- Create: `src/server/api/routers/challenge-channel.ts`
- Modify: `src/server/api/root.ts`

**Step 1: Create the challengeChannel router**

New router with procedures: `getChannel`, `listThreads`, `getThread`, `createThread`, `replyToThread`, `pinThread`.

Pattern: same as `src/server/api/routers/inbox.ts` — mix of `publicProcedure` and `protectedProcedure`.

```typescript
import { z } from "zod";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
} from "@/server/api/trpc";
import {
  challengeChannels,
  challengeThreads,
  challengeReplies,
  challengeEnrollments,
  memberProfiles,
  user,
} from "@/server/db/schema";
import { logActivity } from "@/server/agent/activity";
import { XP_AMOUNTS, awardXp } from "@/lib/gamification";

export const challengeChannelRouter = createTRPCRouter({
  getChannel: publicProcedure
    .input(z.object({ challengeId: z.number() }))
    .query(async ({ ctx, input }) => {
      const [channel] = await ctx.db
        .select()
        .from(challengeChannels)
        .where(eq(challengeChannels.challengeId, input.challengeId))
        .limit(1);
      return channel ?? null;
    }),

  listThreads: publicProcedure
    .input(
      z.object({
        channelId: z.string(),
        type: z
          .enum(["announcement", "discussion", "question", "progress-log", "solution"])
          .optional(),
        limit: z.number().min(1).max(100).default(50),
        cursor: z.string().nullable().default(null),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conditions = [eq(challengeThreads.channelId, input.channelId)];
      if (input.type) {
        conditions.push(eq(challengeThreads.type, input.type));
      }
      if (input.cursor) {
        conditions.push(sql`${challengeThreads.createdAt} < ${new Date(input.cursor)}`);
      }

      const threads = await ctx.db
        .select({
          id: challengeThreads.id,
          type: challengeThreads.type,
          authorId: challengeThreads.authorId,
          authorType: challengeThreads.authorType,
          title: challengeThreads.title,
          content: challengeThreads.content,
          isPinned: challengeThreads.isPinned,
          metadata: challengeThreads.metadata,
          createdAt: challengeThreads.createdAt,
          updatedAt: challengeThreads.updatedAt,
          authorName: memberProfiles.displayName,
        })
        .from(challengeThreads)
        .leftJoin(memberProfiles, eq(challengeThreads.authorId, memberProfiles.userId))
        .where(and(...conditions))
        .orderBy(desc(challengeThreads.isPinned), desc(challengeThreads.createdAt))
        .limit(input.limit + 1);

      const hasMore = threads.length > input.limit;
      const items = hasMore ? threads.slice(0, input.limit) : threads;
      const nextCursor = hasMore ? items[items.length - 1]!.createdAt.toISOString() : null;

      return { threads: items, nextCursor };
    }),

  getThread: publicProcedure
    .input(z.object({ threadId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [thread] = await ctx.db
        .select()
        .from(challengeThreads)
        .where(eq(challengeThreads.id, input.threadId))
        .limit(1);

      if (!thread) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Thread not found" });
      }

      const replies = await ctx.db
        .select({
          id: challengeReplies.id,
          authorId: challengeReplies.authorId,
          authorType: challengeReplies.authorType,
          content: challengeReplies.content,
          createdAt: challengeReplies.createdAt,
          authorName: memberProfiles.displayName,
        })
        .from(challengeReplies)
        .leftJoin(memberProfiles, eq(challengeReplies.authorId, memberProfiles.userId))
        .where(eq(challengeReplies.threadId, input.threadId))
        .orderBy(asc(challengeReplies.createdAt));

      return { thread, replies };
    }),

  createThread: protectedProcedure
    .input(
      z.object({
        channelId: z.string(),
        type: z.enum(["discussion", "question", "solution"]),
        title: z.string().min(1).max(500),
        content: z.string().min(1).max(10000),
        metadata: z.record(z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Verify channel exists and user is enrolled in the challenge
      const [channel] = await ctx.db
        .select()
        .from(challengeChannels)
        .where(eq(challengeChannels.id, input.channelId))
        .limit(1);

      if (!channel) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Channel not found" });
      }

      const [enrollment] = await ctx.db
        .select()
        .from(challengeEnrollments)
        .where(
          and(
            eq(challengeEnrollments.challengeId, channel.challengeId),
            eq(challengeEnrollments.userId, userId),
          ),
        )
        .limit(1);

      if (!enrollment) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Must be enrolled to post" });
      }

      const [thread] = await ctx.db
        .insert(challengeThreads)
        .values({
          channelId: input.channelId,
          type: input.type,
          authorId: userId,
          authorType: "member",
          title: input.title,
          content: input.content,
          metadata: input.metadata,
        })
        .returning();

      // Award XP for channel post
      await awardXp(ctx.db, userId, XP_AMOUNTS.CHALLENGE_CHANNEL_POST);

      await logActivity(ctx.db, {
        actorId: userId,
        actorType: "member",
        action: "challenge.channel_post",
        targetType: "challenges",
        targetId: String(channel.challengeId),
        metadata: { threadType: input.type, title: input.title },
      });

      return thread!;
    }),

  replyToThread: protectedProcedure
    .input(
      z.object({
        threadId: z.string(),
        content: z.string().min(1).max(10000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const [thread] = await ctx.db
        .select({ channelId: challengeThreads.channelId, type: challengeThreads.type })
        .from(challengeThreads)
        .where(eq(challengeThreads.id, input.threadId))
        .limit(1);

      if (!thread) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Thread not found" });
      }

      const [reply] = await ctx.db
        .insert(challengeReplies)
        .values({
          threadId: input.threadId,
          authorId: userId,
          authorType: "member",
          content: input.content,
        })
        .returning();

      // Update thread updatedAt
      await ctx.db
        .update(challengeThreads)
        .set({ updatedAt: new Date() })
        .where(eq(challengeThreads.id, input.threadId));

      // Extra XP for answering questions
      if (thread.type === "question") {
        await awardXp(ctx.db, userId, XP_AMOUNTS.CHALLENGE_ANSWER_QUESTION);
      } else {
        await awardXp(ctx.db, userId, XP_AMOUNTS.CHALLENGE_CHANNEL_POST);
      }

      return reply!;
    }),

  pinThread: protectedProcedure
    .input(
      z.object({
        threadId: z.string(),
        isPinned: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // TODO: verify caller is challenge creator or sponsor
      await ctx.db
        .update(challengeThreads)
        .set({ isPinned: input.isPinned })
        .where(eq(challengeThreads.id, input.threadId));
      return { success: true };
    }),
});
```

**Step 2: Register in root router**

In `src/server/api/root.ts`, add:

```typescript
import { challengeChannelRouter } from "@/server/api/routers/challenge-channel";
```

And in the `appRouter` object:

```typescript
challengeChannel: challengeChannelRouter,
```

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

**Step 4: Commit**

```bash
git add src/server/api/routers/challenge-channel.ts src/server/api/root.ts
git commit -m "feat(challenges): add challengeChannel tRPC router

Procedures: getChannel, listThreads, getThread, createThread,
replyToThread, pinThread. Registered in root router."
```

---

### Task 7: Extend Agent tRPC Router — Challenge Procedures

**Files:**
- Modify: `src/server/api/routers/agent.ts`

**Step 1: Add challenge-related agent procedures**

Add these new procedures to the existing `agentRouter`. They follow the same `agentProcedure` + `requireScope` pattern as existing tools.

New procedures to add:

```typescript
// ── Challenge read tools (scope: "read") ─────────────────────────────────

browseChallenges: agentProcedure
  .input(z.object({
    difficulty: z.enum(["beginner", "intermediate", "advanced", "expert"]).optional(),
    type: z.enum(["weekly", "monthly", "open-ended"]).optional(),
    limit: z.number().min(1).max(50).default(20),
  }))
  .query(async ({ ctx, input }) => {
    requireScope(ctx.agent.scopes, "read");
    const payload = await getPayloadClient();
    const where: Record<string, unknown> = { status: { equals: "active" } };
    if (input.difficulty) where.difficulty = { equals: input.difficulty };
    if (input.type) where.type = { equals: input.type };
    const { docs } = await payload.find({
      collection: "challenges",
      where,
      sort: "-createdAt",
      limit: input.limit,
      depth: 0,
    });
    return docs.map((c) => ({
      id: c.id,
      title: c.title,
      slug: c.slug,
      type: c.type,
      difficulty: c.difficulty,
      tags: c.tags,
      repo: c.repo,
      startsAt: c.startsAt,
      endsAt: c.endsAt,
    }));
  }),

getChallengeDetails: agentProcedure
  .input(z.object({ challengeId: z.number() }))
  .query(async ({ ctx, input }) => {
    requireScope(ctx.agent.scopes, "read");
    const payload = await getPayloadClient();
    const challenge = await payload.findByID({
      collection: "challenges",
      id: input.challengeId,
      depth: 0,
    });
    // Check if owner is enrolled
    const [enrollment] = await ctx.db
      .select()
      .from(challengeEnrollments)
      .where(and(
        eq(challengeEnrollments.challengeId, input.challengeId),
        eq(challengeEnrollments.userId, ctx.agent.ownerId),
      ))
      .limit(1);
    return { challenge, enrollment: enrollment ?? null };
  }),

getMyChallengeProgress: agentProcedure
  .input(z.object({ challengeId: z.number() }))
  .query(async ({ ctx, input }) => {
    requireScope(ctx.agent.scopes, "read");
    const [enrollment] = await ctx.db
      .select()
      .from(challengeEnrollments)
      .where(and(
        eq(challengeEnrollments.challengeId, input.challengeId),
        eq(challengeEnrollments.userId, ctx.agent.ownerId),
        eq(challengeEnrollments.status, "active"),
      ))
      .limit(1);
    if (!enrollment) return null;
    const progress = await ctx.db
      .select()
      .from(challengeProgress)
      .where(eq(challengeProgress.enrollmentId, enrollment.id));
    return { enrollment, progress };
  }),

browseChallengeChannel: agentProcedure
  .input(z.object({
    challengeId: z.number(),
    type: z.enum(["announcement", "discussion", "question", "progress-log", "solution"]).optional(),
    limit: z.number().min(1).max(50).default(20),
  }))
  .query(async ({ ctx, input }) => {
    requireScope(ctx.agent.scopes, "read");
    const [channel] = await ctx.db
      .select()
      .from(challengeChannels)
      .where(eq(challengeChannels.challengeId, input.challengeId))
      .limit(1);
    if (!channel) return { threads: [] };
    const conditions = [eq(challengeThreads.channelId, channel.id)];
    if (input.type) conditions.push(eq(challengeThreads.type, input.type));
    const threads = await ctx.db
      .select({
        id: challengeThreads.id,
        type: challengeThreads.type,
        authorType: challengeThreads.authorType,
        title: challengeThreads.title,
        content: challengeThreads.content,
        isPinned: challengeThreads.isPinned,
        createdAt: challengeThreads.createdAt,
        authorName: memberProfiles.displayName,
      })
      .from(challengeThreads)
      .leftJoin(memberProfiles, eq(challengeThreads.authorId, memberProfiles.userId))
      .where(and(...conditions))
      .orderBy(desc(challengeThreads.isPinned), desc(challengeThreads.createdAt))
      .limit(input.limit);
    return { threads };
  }),

// ── Challenge contribute tools (scope: "contribute") ─────────────────────

enrollInChallenge: agentProcedure
  .input(z.object({ challengeId: z.number() }))
  .mutation(async ({ ctx, input }) => {
    requireScope(ctx.agent.scopes, "contribute");
    // Delegate to the challenges router's enroll logic
    // (or duplicate the enroll logic here for the agent's owner)
    // This calls the same enrollment flow but for ctx.agent.ownerId
    // Implementation follows the same pattern as challenges.enroll
  }),

reportObjectiveProgress: agentProcedure
  .input(z.object({
    challengeId: z.number(),
    objectiveIndex: z.number(),
    details: z.string().max(2000).optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    requireScope(ctx.agent.scopes, "contribute");
    // Find enrollment, verify it's active, verify objective is self-report mode
    // Increment currentCount, check completion
    // Call checkEnrollmentCompletion
  }),

reportTestResults: agentProcedure
  .input(z.object({
    challengeId: z.number(),
    results: z.array(z.object({
      objectiveIndex: z.number(),
      passed: z.boolean(),
      details: z.string().max(2000).optional(),
    })),
  }))
  .mutation(async ({ ctx, input }) => {
    requireScope(ctx.agent.scopes, "contribute");
    // Find enrollment, for each result:
    // - Insert into challengeTestResults
    // - If passed, mark objective complete
    // - Call checkEnrollmentCompletion
  }),

postToChallengeChannel: agentProcedure
  .input(z.object({
    challengeId: z.number(),
    content: z.string().min(1).max(5000),
    threadType: z.enum(["discussion", "question"]).default("discussion"),
    title: z.string().min(1).max(500).optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    requireScope(ctx.agent.scopes, "contribute");
    // If ghost mode → create agent draft with type "challenge_channel_post"
    // If visible → post to progress-log thread (or create discussion/question thread)
    // Respects existing ghost mode pattern from replyToThread
  }),

replyInChallengeChannel: agentProcedure
  .input(z.object({
    threadId: z.string(),
    content: z.string().min(1).max(5000),
  }))
  .mutation(async ({ ctx, input }) => {
    requireScope(ctx.agent.scopes, "contribute");
    // If ghost mode → create draft
    // If visible → insert reply
  }),

submitSolution: agentProcedure
  .input(z.object({
    challengeId: z.number(),
    title: z.string().min(1).max(500),
    content: z.string().min(1).max(10000),
    repoUrl: z.string().url().optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    requireScope(ctx.agent.scopes, "contribute");
    // Create solution thread in channel
    // Update enrollment submittedAt
  }),

initChallengeConfig: agentProcedure
  .input(z.object({ challengeId: z.number() }))
  .query(async ({ ctx, input }) => {
    requireScope(ctx.agent.scopes, "read");
    // Fetch challenge, generate .aitchallenge.yml content as string
    // Return the YAML content for the agent to write to disk
  }),
```

Each procedure follows the exact same pattern as existing agent procedures. The `// ...` comments indicate implementation that follows established patterns (see existing `replyToThread`, `shareKnowledge` in the agent router for ghost mode handling, etc.).

**Step 2: Add imports for new tables**

Add to the import block:

```typescript
import {
  challengeEnrollments,
  challengeProgress,
  challengeTestResults,
  challengeChannels,
  challengeThreads,
  challengeReplies,
} from "@/server/db/schema";
import { checkEnrollmentCompletion } from "@/server/agent/activity";
```

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

**Step 4: Commit**

```bash
git add src/server/api/routers/agent.ts
git commit -m "feat(challenges): extend agent router with challenge procedures

New agent procedures: browseChallenges, getChallengeDetails,
getMyChallengeProgress, browseChallengeChannel, enrollInChallenge,
reportObjectiveProgress, reportTestResults, postToChallengeChannel,
replyInChallengeChannel, submitSolution, initChallengeConfig."
```

---

## Phase 3: MCP Integration

### Task 8: Register Challenge MCP Tools

**Files:**
- Modify: `src/app/api/mcp/route.ts`

**Step 1: Add challenge read tools**

After the existing tool registrations (around line 268), add:

```typescript
// ── Challenge read tools ────────────────────────────────────────────────

server.registerTool("browse-challenges", {
  description: "Browse active challenges. Filter by difficulty or type.",
  inputSchema: {
    difficulty: z.enum(["beginner", "intermediate", "advanced", "expert"]).optional()
      .describe("Filter by difficulty level."),
    type: z.enum(["weekly", "monthly", "open-ended"]).optional()
      .describe("Filter by challenge type."),
    limit: z.number().min(1).max(50).default(20).describe("Max challenges to return."),
  },
}, async ({ difficulty, type, limit }) => {
  const result = await caller.agent.browseChallenges({ difficulty, type, limit });
  return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
});

server.registerTool("get-challenge-details", {
  description: "Get full details for a challenge including objectives, rewards, repo config, and your enrollment status.",
  inputSchema: {
    challengeId: z.number().describe("Challenge ID."),
  },
}, async ({ challengeId }) => {
  const result = await caller.agent.getChallengeDetails({ challengeId });
  return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
});

server.registerTool("get-my-challenge-progress", {
  description: "Get your owner's progress on a specific challenge. Shows per-objective completion.",
  inputSchema: {
    challengeId: z.number().describe("Challenge ID."),
  },
}, async ({ challengeId }) => {
  const result = await caller.agent.getMyChallengeProgress({ challengeId });
  return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
});

server.registerTool("browse-challenge-channel", {
  description: "Read threads in a challenge's channel. Filter by thread type (announcement, discussion, question, progress-log, solution).",
  inputSchema: {
    challengeId: z.number().describe("Challenge ID."),
    type: z.enum(["announcement", "discussion", "question", "progress-log", "solution"]).optional()
      .describe("Filter by thread type."),
    limit: z.number().min(1).max(50).default(20).describe("Max threads."),
  },
}, async ({ challengeId, type, limit }) => {
  const result = await caller.agent.browseChallengeChannel({ challengeId, type, limit });
  return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
});
```

**Step 2: Add challenge contribute tools**

```typescript
// ── Challenge contribute tools ──────────────────────────────────────────

server.registerTool("enroll-in-challenge", {
  description: "Enroll your owner in a challenge. Creates progress tracking and a progress-log thread in the challenge channel.",
  inputSchema: {
    challengeId: z.number().describe("Challenge ID to enroll in."),
  },
}, async ({ challengeId }) => {
  const result = await caller.agent.enrollInChallenge({ challengeId });
  return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
});

server.registerTool("report-objective-progress", {
  description: "Self-report progress on a challenge objective. Only works for self-report verification mode.",
  inputSchema: {
    challengeId: z.number().describe("Challenge ID."),
    objectiveIndex: z.number().describe("0-based index of the objective."),
    details: z.string().max(2000).optional().describe("Optional description of what was done."),
  },
}, async ({ challengeId, objectiveIndex, details }) => {
  const result = await caller.agent.reportObjectiveProgress({ challengeId, objectiveIndex, details });
  return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
});

server.registerTool("report-test-results", {
  description: "Report test run results for test-verified objectives. Run the tests locally first, then report which passed/failed.",
  inputSchema: {
    challengeId: z.number().describe("Challenge ID."),
    results: z.array(z.object({
      objectiveIndex: z.number().describe("0-based objective index."),
      passed: z.boolean().describe("Whether tests for this objective passed."),
      details: z.string().max(2000).optional().describe("Test output summary."),
    })).describe("Test results per objective."),
  },
}, async ({ challengeId, results }) => {
  const result = await caller.agent.reportTestResults({ challengeId, results });
  return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
});

server.registerTool("post-to-challenge-channel", {
  description: "Post a message to the challenge's channel. In ghost mode, saves as draft for owner review. Use for progress updates, questions, or discussions.",
  inputSchema: {
    challengeId: z.number().describe("Challenge ID."),
    content: z.string().min(1).max(5000).describe("Post content."),
    threadType: z.enum(["discussion", "question"]).default("discussion")
      .describe("Type of thread to create."),
    title: z.string().min(1).max(500).optional().describe("Thread title. Auto-generated if omitted."),
  },
}, async ({ challengeId, content, threadType, title }) => {
  const result = await caller.agent.postToChallengeChannel({ challengeId, content, threadType, title });
  return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
});

server.registerTool("reply-in-challenge-channel", {
  description: "Reply to an existing thread in a challenge channel. In ghost mode, saves as draft.",
  inputSchema: {
    threadId: z.string().describe("Thread ID to reply to."),
    content: z.string().min(1).max(5000).describe("Reply content."),
  },
}, async ({ threadId, content }) => {
  const result = await caller.agent.replyInChallengeChannel({ threadId, content });
  return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
});

server.registerTool("submit-solution", {
  description: "Submit your solution for a challenge. Creates a solution thread in the channel. For peer-review objectives, this triggers the review process.",
  inputSchema: {
    challengeId: z.number().describe("Challenge ID."),
    title: z.string().min(1).max(500).describe("Solution title."),
    content: z.string().min(1).max(10000).describe("Solution description."),
    repoUrl: z.string().url().optional().describe("Link to your solution repository."),
  },
}, async ({ challengeId, title, content, repoUrl }) => {
  const result = await caller.agent.submitSolution({ challengeId, title, content, repoUrl });
  return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
});

server.registerTool("init-challenge-config", {
  description: "Generate .aitchallenge.yml content for a challenge. Use this for bring-your-own-repo challenges to create the config file.",
  inputSchema: {
    challengeId: z.number().describe("Challenge ID."),
  },
}, async ({ challengeId }) => {
  const result = await caller.agent.initChallengeConfig({ challengeId });
  return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
});
```

**Step 3: Update MCP server version**

Change: `version: "0.2.0"` → `version: "0.3.0"`

**Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

**Step 5: Commit**

```bash
git add src/app/api/mcp/route.ts
git commit -m "feat(challenges): register 11 new MCP tools for challenges

Read: browse-challenges, get-challenge-details, get-my-challenge-progress,
browse-challenge-channel. Contribute: enroll-in-challenge,
report-objective-progress, report-test-results, post-to-challenge-channel,
reply-in-challenge-channel, submit-solution, init-challenge-config."
```

---

## Phase 4: Automation

### Task 9: Update Cron Jobs

**Files:**
- Modify: `src/app/api/cron/challenge-expiry/route.ts`
- Modify: `src/app/api/cron/challenge-advisory/route.ts`
- Create: `src/app/api/cron/challenge-digest/route.ts`
- Create: `src/app/api/cron/stale-review-reminder/route.ts`

**Step 1: Update challenge-expiry**

Key changes:
- Rewards now at `challenge.rewards.xpReward` instead of `challenge.xpReward`
- Handle `open-ended` type (no expiry for these)
- Add `endsAt: { less_than: new Date().toISOString() }` filter to exclude open-ended challenges (which have null endsAt)

**Step 2: Update challenge-advisory**

Key changes:
- Include `verificationMode` in advisory message per objective
- Mention repo URL if present
- Reference challenge channel for discussion

**Step 3: Create challenge-digest cron**

Weekly job that sends channel activity summary to all enrolled members via their agent conversation. Counts new threads, replies, leaderboard changes since last week.

**Step 4: Create stale-review-reminder cron**

Daily job that finds `peer-review` objectives where `submittedAt` is set but `reviewedAt` is null and `submittedAt` is older than 3 days. Sends a reminder to the challenge creator.

**Step 5: Register new crons in vercel.json (if exists) or document**

**Step 6: Commit**

```bash
git add src/app/api/cron/
git commit -m "feat(challenges): update and add cron jobs

Updated: challenge-expiry (rewards group), challenge-advisory
(verification modes). New: challenge-digest (weekly), stale-review-reminder
(daily)."
```

---

## Phase 5: UI

### Task 10: Update Challenge List Page

**Files:**
- Modify: `src/components/challenges/challenge-list.tsx`
- Modify: `src/components/challenges/challenge-card.tsx`

**Step 1: Update ChallengeList with filters**

Add difficulty filter tabs and type filter. Update to show new fields (difficulty badge, repo indicator, sponsor badge, tags).

**Step 2: Update ChallengeCard**

Show: difficulty badge, type, repo icon (if repo.templateUrl), sponsor badge (if publishedBy === "sponsor"), tags, sponsorReward text. Link to challenge detail page.

**Step 3: Commit**

```bash
git add src/components/challenges/
git commit -m "feat(challenges): update challenge list and card components

Difficulty filter, type filter, repo indicator, sponsor badge, tags display."
```

---

### Task 11: Create Challenge Detail Page

**Files:**
- Create: `src/app/[locale]/challenges/[slug]/page.tsx`
- Create: `src/app/[locale]/challenges/[slug]/content.tsx`

**Step 1: Create server page component**

```typescript
// page.tsx — server component
import { getPayloadClient } from "@/server/payload";
import { notFound } from "next/navigation";
import { HydrateClient } from "@/trpc/server";
import { ChallengeDetailContent } from "./content";

export default async function ChallengeDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const payload = await getPayloadClient();
  const { docs } = await payload.find({
    collection: "challenges",
    where: { slug: { equals: slug } },
    limit: 1,
  });
  const challenge = docs[0];
  if (!challenge) notFound();

  return (
    <HydrateClient>
      <ChallengeDetailContent challenge={challenge} />
    </HydrateClient>
  );
}
```

**Step 2: Create client content component with tabs**

Tabs: Overview | Channel | My Progress | Participants

- **Overview**: description, objectives list, repo link, rewards, difficulty, sponsor info
- **Channel**: renders `<ChallengeChannelView />`
- **My Progress**: renders `<ChallengeProgressDetail />`
- **Participants**: renders `<ChallengeLeaderboard />`

Use existing tab pattern from agent dashboard (button-based tabs with conditional rendering).

**Step 3: Commit**

```bash
git add src/app/[locale]/challenges/
git commit -m "feat(challenges): add challenge detail page with tabs

Tabs: Overview, Channel, My Progress, Participants."
```

---

### Task 12: Create Challenge Channel Components

**Files:**
- Create: `src/components/challenges/challenge-channel-view.tsx`
- Create: `src/components/challenges/challenge-thread-card.tsx`
- Create: `src/components/challenges/challenge-thread-detail.tsx`
- Create: `src/components/challenges/challenge-compose.tsx`

**Step 1: ChallengeChannelView**

Main channel view with thread type filter tabs (All, Announcements, Discussion, Q&A, Progress Logs, Solutions). Lists threads using `api.challengeChannel.listThreads`. Has "New Thread" button opening compose form.

**Step 2: ChallengeThreadCard**

Compact card showing: type badge, title, author name + type badge, reply count, date. Clickable to expand.

**Step 3: ChallengeThreadDetail**

Full thread view with content + chronological replies. Reply compose box at bottom.

**Step 4: ChallengeCompose**

Form for creating new threads: type selector, title, content textarea.

**Step 5: Commit**

```bash
git add src/components/challenges/
git commit -m "feat(challenges): add challenge channel components

Components: ChallengeChannelView, ChallengeThreadCard,
ChallengeThreadDetail, ChallengeCompose."
```

---

### Task 13: Update Challenge Progress & Leaderboard

**Files:**
- Modify: `src/components/challenges/challenge-progress.tsx`
- Modify: `src/components/challenges/challenge-leaderboard.tsx`
- Modify: `src/components/challenges/active-challenges-widget.tsx`

**Step 1: Update ChallengeProgress**

Show verification mode per objective (icon: test tube for test, check for self-report, users for peer-review, zap for platform-action). Show test result history for test objectives. Show review status for peer-review objectives.

**Step 2: Update ChallengeLeaderboard**

Support ranking modes. Show agent name alongside member. Show test score and channel contributions columns. Show status badges (active/completed/submitted).

**Step 3: Update ActiveChallengesWidget**

Show difficulty badge and repo indicator. Link to challenge detail page instead of dashboard.

**Step 4: Commit**

```bash
git add src/components/challenges/
git commit -m "feat(challenges): update progress and leaderboard components

Verification mode icons, test result history, ranking modes,
agent names, enhanced widget."
```

---

### Task 14: Sponsor Challenge Creation

**Files:**
- Create: `src/components/challenges/sponsor-challenge-form.tsx`
- Modify: `src/app/[locale]/dashboard/challenges/page.tsx`

**Step 1: Create SponsorChallengeForm**

Form with: title, description, difficulty, type, tags, repo URL, test command, objectives (dynamic array with verification mode per objective), rewards (XP, badge, sponsor reward text), max participants.

Uses `api.challenges.create` mutation.

**Step 2: Add "Propose Challenge" / "Create Challenge" button to dashboard**

Show "Create Challenge" for sponsors, "Propose Challenge" for members. Opens the form in a dialog or new section.

**Step 3: Commit**

```bash
git add src/components/challenges/ src/app/[locale]/dashboard/challenges/
git commit -m "feat(challenges): add sponsor challenge creation form

SponsorChallengeForm with full unified schema fields.
Dashboard integration with propose/create buttons."
```

---

## Phase 6: Template Repo

### Task 15: Create Challenge Template Repo Structure

**Files:**
- Create: `docs/challenge-template/` (local reference copy)

**Step 1: Create template files**

Create a reference copy of the template repo structure in the docs folder. This will be pushed to a separate GitHub repo (`aitcommunity/challenge-template`) later.

Files:
- `.aitchallenge.yml` — annotated example
- `README.md` — template with sections
- `CONTRIBUTING.md` — how to work with your agent
- `.github/workflows/challenge-ci.yml` — optional CI workflow

**Step 2: Commit**

```bash
git add docs/challenge-template/
git commit -m "docs: add challenge template repo reference files

Template for .aitchallenge.yml, README, CONTRIBUTING, and CI workflow.
To be published as aitcommunity/challenge-template on GitHub."
```

---

## Phase 7: Integration & Cleanup

### Task 16: Update Agent Connect Guide

**Files:**
- Modify: `src/components/agent-connect-guide.tsx`

**Step 1: Update system prompt template**

Add challenge-related instructions to the suggested system prompt:

```
When working on a challenge repo, read .aitchallenge.yml first.
Use get-challenge-details and get-my-challenge-progress to understand context.
Report test results with report-test-results after running tests.
Post progress updates with post-to-challenge-channel.
Browse the challenge channel for announcements and community discussions.
```

**Step 2: Add challenge tools to the MCP tools documentation section**

**Step 3: Commit**

```bash
git add src/components/agent-connect-guide.tsx
git commit -m "feat(challenges): update agent connect guide with challenge tools

Add challenge workflow to system prompt template and document new MCP tools."
```

---

### Task 17: Update Briefing to Include Challenge Info

**Files:**
- Modify: `src/server/api/routers/agent.ts` (getBriefing procedure)

**Step 1: Add challenge data to briefing**

The `getBriefing` agent procedure should include:
- Active challenge enrollments with progress summary
- Pending peer reviews (if owner is a challenge creator)
- New channel activity since last check

**Step 2: Commit**

```bash
git add src/server/api/routers/agent.ts
git commit -m "feat(challenges): include challenge data in agent briefing

Briefing now shows active enrollments, progress, pending reviews, and
recent channel activity."
```

---

### Task 18: Final TypeScript Check & Schema Push

**Step 1: Full TypeScript check**

Run: `npx tsc --noEmit`
Expected: Zero errors

**Step 2: Push final schema**

Run: `pnpm db:push`
Expected: All tables in sync

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat(challenges): unified GitHub challenge system complete

Replaces simple challenge system with full repo-based collaborative
challenges. Supports test verification, sponsor integration, dedicated
channels, and AI agent collaboration from the IDE."
```

---

## Task Dependency Graph

```
Task 1 (Payload Collection) ──┐
Task 2 (Drizzle Schema) ──────┼── Task 5 (Challenges Router) ──┐
Task 3 (Gamification) ────────┘                                 │
Task 4 (Activity System) ─────── Task 7 (Agent Router) ────── Task 8 (MCP Tools)
                                  │
Task 6 (Channel Router) ─────────┘
                                  │
Task 9 (Cron Jobs) ──────────────┘
                                  │
Tasks 10-14 (UI) ────────────────┘
Task 15 (Template Repo) ── independent
Tasks 16-18 (Integration) ── after all above
```

Tasks 1-4 can be done in parallel. Task 5 depends on 1+2. Task 6 depends on 2. Tasks 7-8 depend on 4+5+6. Tasks 10-14 depend on 5+6. Task 15 is independent.
