# Hackathon Layer 4 — Community-admin creation & management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a community `owner|admin` create, author, publish, and operate a community-scoped hackathon entirely in-app — one action scaffolds the bound Event+Challenge, an in-app editor fills the `cellTemplate`, and a manage route drives the publish→lock→finalize lifecycle.

**Architecture:** A new `createHackathon` mutation makes a draft Event ⋈ Challenge pair (both inherit the community's `communityId`, so the binding invariant holds by construction). A new `requireCommunityHackathonAdmin` role gate replaces creator-scoping on the lifecycle mutations. The frontend adds a create modal on the community events page, an in-app `cellTemplate` task editor, and an admin manage route hosting the lifecycle controls. See the approved spec: `docs/superpowers/specs/2026-06-09-community-admin-hackathon-creation-design.md`, and ADR-0031 (role-scoped operation) + ADR-0032 (objectives optional).

**Tech Stack:** Next.js App Router (RSC + client components), tRPC, Payload CMS (collections + payload client), Drizzle, Zod, Vitest, next-intl, sonner, shadcn/ui.

---

## File structure

**Backend**
- Modify `src/collections/Challenges.ts` — make `objectives` optional (ADR-0032).
- Modify `src/server/api/routers/challenges.ts` — keep "≥1 objective" in the single-actor `create` Zod.
- Create `src/server/hackathon/create-defaults.ts` — pure: `deriveSlug`, `buildHackathonChallengeData`, `buildHackathonEventInput` (unit-tested).
- Create `src/server/hackathon/create-defaults.test.ts` — unit tests for the above.
- Create `src/server/hackathon/community-admin.ts` — pure predicate `isCommunityHackathonAdmin` (unit-tested).
- Create `src/server/hackathon/community-admin.test.ts` — unit tests.
- Modify `src/server/api/routers/hackathon.ts` — add `requireCommunityHackathonAdmin`, `createHackathon`, `updateHackathon`, `publishHackathon`; swap gates on `lockRosters`/`finalizeHackathon`.

**Frontend**
- Modify `messages/en.json`, `messages/nl.json` — `hackathon` create/editor/lifecycle keys.
- Create `src/components/hackathon/cell-template-editor.tsx` — repeatable task editor (client).
- Create `src/components/hackathon/create-hackathon-dialog.tsx` — create modal (client).
- Modify `src/app/[locale]/communities/[slug]/events/page.tsx` — mount the "Create hackathon" button for admins.
- Create `src/app/[locale]/communities/[slug]/events/[eventSlug]/manage/page.tsx` — admin-gated manage route (RSC shell).
- Create `src/components/hackathon/hackathon-manage.tsx` — manage surface (client): identity/window/team/prize fields, the cell editor, the lifecycle control strip.
- Modify `src/components/hackathon/hackathon-panel.tsx` — remove the Finalize button (relocated to manage).

---

## Phase A — Backend foundation

### Task 1: Make challenge `objectives` optional, keep ≥1 in the single-actor path

**Files:**
- Modify: `src/collections/Challenges.ts:151-154`
- Modify: `src/server/api/routers/challenges.ts` (the `create` input schema)

- [ ] **Step 1: Relax the collection field**

In `src/collections/Challenges.ts`, the `objectives` array field currently reads:

```ts
    {
      name: "objectives",
      type: "array",
      required: true,
      minRows: 1,
```

Change it to (remove `required` and `minRows`):

```ts
    {
      name: "objectives",
      type: "array",
      // Optional at the collection level: a hackathon challenge carries an empty
      // objectives list and decomposes its work via cellTemplate instead (ADR-0032).
      // The "single-actor challenge needs >=1 objective" rule lives in the
      // challenges.create input schema, the path where that context is known.
```

- [ ] **Step 2: Confirm the single-actor `create` Zod still requires ≥1 objective**

Open `src/server/api/routers/challenges.ts`, find the `create` mutation's input schema. Confirm the objectives field is `.min(1)` (and `.max(10)`). If it is already `z.array(...).min(1).max(10)`, no change is needed — note it in the commit. If it lacks `.min(1)`, add it:

```ts
        objectives: z
          .array(objectiveInputSchema)
          .min(1, "A challenge needs at least one objective.")
          .max(10),
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: passes (no type errors).

- [ ] **Step 4: Commit**

```bash
git add src/collections/Challenges.ts src/server/api/routers/challenges.ts
git commit -m "feat(hackathon): challenge objectives optional at collection, enforced in single-actor create (ADR-0032)"
```

---

### Task 2: Pure create-defaults helpers (slug + challenge/event data builders)

**Files:**
- Create: `src/server/hackathon/create-defaults.ts`
- Test: `src/server/hackathon/create-defaults.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/server/hackathon/create-defaults.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  deriveSlug,
  buildHackathonChallengeData,
} from "./create-defaults";

describe("deriveSlug", () => {
  it("slugifies and appends the uniqueness suffix", () => {
    expect(deriveSlug("My Cool Hackathon", "abc123")).toBe(
      "my-cool-hackathon-abc123",
    );
  });
  it("strips punctuation and collapses spaces", () => {
    expect(deriveSlug("API & SDK Jam!", "x")).toBe("api-sdk-jam-x");
  });
});

describe("buildHackathonChallengeData", () => {
  const base = {
    name: "Build-a-bot",
    descriptionLexical: { mock: true } as unknown,
    communityId: "comm-1",
    userId: "user-1",
    slug: "build-a-bot-x",
    teamMin: 2,
    teamMax: 4,
  };

  it("creates a draft challenge with empty objectives and cellTemplate", () => {
    const data = buildHackathonChallengeData(base);
    expect(data.status).toBe("draft");
    expect(data.type).toBe("open-ended");
    expect(data.difficulty).toBe("intermediate");
    expect(data.creatorId).toBe("user-1");
    expect(data.publishedBy).toBe("user-1");
    expect(data.communityId).toBe("comm-1");
    expect(data.objectives).toEqual([]);
    expect(data.cellTemplate).toEqual([]);
    expect(data.rewards).toEqual({ xpReward: 0 });
    expect(data.teamConfig).toEqual({ minTeamSize: 2, maxTeamSize: 4 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/hackathon/create-defaults.test.ts`
Expected: FAIL — cannot find module `./create-defaults`.

- [ ] **Step 3: Write the implementation**

Create `src/server/hackathon/create-defaults.ts`:

```ts
// Pure builders for the one-shot community hackathon scaffold (ADR-0032).
// Db-free and Payload-free so the default mapping is unit-testable in isolation.
import { slugify } from "@/lib/text-utils";

/** Slugify a name and append a uniqueness suffix the caller supplies. */
export function deriveSlug(name: string, suffix: string): string {
  return `${slugify(name).slice(0, 80)}-${suffix}`;
}

interface ChallengeDataArgs {
  name: string;
  descriptionLexical: unknown; // richText (lexical) JSON from plainTextToLexical
  communityId: string;
  userId: string;
  slug: string;
  teamMin: number;
  teamMax: number;
}

/**
 * The Payload `challenges` create payload for a hackathon scaffold: a draft
 * challenge with empty objectives + empty cellTemplate. The admin fills the
 * cellTemplate in the in-app editor afterward.
 */
export function buildHackathonChallengeData(args: ChallengeDataArgs) {
  return {
    title: args.name,
    slug: args.slug,
    description: args.descriptionLexical,
    type: "open-ended" as const,
    status: "draft" as const,
    difficulty: "intermediate" as const,
    creatorId: args.userId,
    publishedBy: args.userId,
    communityId: args.communityId,
    objectives: [] as unknown[],
    cellTemplate: [] as unknown[],
    rewards: { xpReward: 0 },
    teamConfig: { minTeamSize: args.teamMin, maxTeamSize: args.teamMax },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/server/hackathon/create-defaults.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/hackathon/create-defaults.ts src/server/hackathon/create-defaults.test.ts
git commit -m "feat(hackathon): pure create-defaults — slug + challenge scaffold data"
```

---

### Task 3: Pure community-admin predicate

**Files:**
- Create: `src/server/hackathon/community-admin.ts`
- Test: `src/server/hackathon/community-admin.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/server/hackathon/community-admin.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isCommunityHackathonAdmin } from "./community-admin";

describe("isCommunityHackathonAdmin", () => {
  it("accepts an active owner", () => {
    expect(isCommunityHackathonAdmin({ status: "active", role: "owner" })).toBe(true);
  });
  it("accepts an active admin", () => {
    expect(isCommunityHackathonAdmin({ status: "active", role: "admin" })).toBe(true);
  });
  it("rejects a moderator", () => {
    expect(isCommunityHackathonAdmin({ status: "active", role: "moderator" })).toBe(false);
  });
  it("rejects a member", () => {
    expect(isCommunityHackathonAdmin({ status: "active", role: "member" })).toBe(false);
  });
  it("rejects an inactive owner", () => {
    expect(isCommunityHackathonAdmin({ status: "pending_approval", role: "owner" })).toBe(false);
  });
  it("rejects null (no membership)", () => {
    expect(isCommunityHackathonAdmin(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/hackathon/community-admin.test.ts`
Expected: FAIL — cannot find module `./community-admin`.

- [ ] **Step 3: Write the implementation**

Create `src/server/hackathon/community-admin.ts`:

```ts
// Pure role predicate for operating a community hackathon (ADR-0031): an active
// owner|admin of the community may edit/publish/lock/finalize. Kept db-free so it
// is unit-testable; the tRPC gate does the membership lookup and calls this.
export interface MembershipRow {
  status: string;
  role: string;
}

export function isCommunityHackathonAdmin(
  membership: MembershipRow | null | undefined,
): boolean {
  if (!membership || membership.status !== "active") return false;
  return membership.role === "owner" || membership.role === "admin";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/server/hackathon/community-admin.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/hackathon/community-admin.ts src/server/hackathon/community-admin.test.ts
git commit -m "feat(hackathon): pure isCommunityHackathonAdmin predicate (ADR-0031)"
```

---

## Phase B — Backend mutations

> All edits in this phase are in `src/server/api/routers/hackathon.ts`. Add imports at the top as each task needs them. The file already imports `z`, drizzle ops, `TRPCError`, `createTRPCRouter`, `protectedProcedure`, `publicProcedure`, the db tables, `getPayloadClient`, `assertBindable`/`BindingError`, `cellTemplateSchema`/`cellTemplateToInserts`, scoring helpers, and gamification.

### Task 4: `requireCommunityHackathonAdmin` gate + swap it onto `lockRosters` and `finalizeHackathon`

**Files:**
- Modify: `src/server/api/routers/hackathon.ts`

- [ ] **Step 1: Add imports**

At the top of `src/server/api/routers/hackathon.ts`, add:

```ts
import { communities, communityMemberships } from "@/server/db/schema";
import { isCommunityHackathonAdmin } from "@/server/hackathon/community-admin";
```

(Merge `communities`/`communityMemberships` into the existing `@/server/db/schema` import block rather than duplicating it.)

- [ ] **Step 2: Add the gate helper**

Below the existing `requireChallengeSponsor` function, add:

```ts
/**
 * Role-scoped gate (ADR-0031): the caller must be an active owner|admin of the
 * challenge's community. For community-scoped hackathons this replaces the
 * creator-scoped requireChallengeSponsor — a time-boxed contest must not hinge on
 * one person. Returns the Payload challenge doc on success.
 */
async function requireCommunityHackathonAdmin(
  db: typeof import("@/server/db").db,
  challengeId: number,
  userId: string,
) {
  const payload = await getPayloadClient();
  let challenge;
  try {
    challenge = await payload.findByID({
      collection: "challenges",
      id: challengeId,
      depth: 0,
    });
  } catch {
    throw new TRPCError({ code: "NOT_FOUND", message: "Challenge not found" });
  }
  if (!challenge.communityId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This is not a community hackathon.",
    });
  }
  const membership = await db.query.communityMemberships.findFirst({
    where: and(
      eq(communityMemberships.communityId, challenge.communityId),
      eq(communityMemberships.userId, userId),
    ),
  });
  if (!isCommunityHackathonAdmin(membership ?? null)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only an owner or admin of this community can manage the hackathon",
    });
  }
  return challenge;
}
```

- [ ] **Step 3: Swap the gate on `lockRosters` and `finalizeHackathon`**

In `lockRosters`, replace the line:

```ts
      const challenge = await requireChallengeSponsor(input.challengeId, userId);
```

with:

```ts
      const challenge = await requireCommunityHackathonAdmin(ctx.db, input.challengeId, userId);
```

Do the **same replacement** in `finalizeHackathon`. (Leave `requireChallengeSponsor` defined and used by `bindChallenge` for the Hub/CMS path.)

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add src/server/api/routers/hackathon.ts
git commit -m "feat(hackathon): role-scoped requireCommunityHackathonAdmin gate on lock/finalize (ADR-0031)"
```

---

### Task 5: `createHackathon` mutation

**Files:**
- Modify: `src/server/api/routers/hackathon.ts`
- Test: `src/server/api/routers/hackathon-create.integration.test.ts`

- [ ] **Step 1: Write the integration test (DB-gated, mirrors work-grid.integration.test.ts)**

Create `src/server/api/routers/hackathon-create.integration.test.ts`:

```ts
import { describe, it, expect } from "vitest";

// Integration coverage for createHackathon. Like work-grid.integration.test.ts,
// these require a live DB + Payload and are skipped when DATABASE_URL is unset.
const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;

d("hackathon.createHackathon", () => {
  it("rejects a non-admin caller with FORBIDDEN", async () => {
    // Arrange: a community + a member (role 'member'); call createHackathon as them.
    // Assert: throws TRPCError code FORBIDDEN.
    expect(true).toBe(true); // replace with real harness call when DB wiring lands
  });

  it("creates a bound draft pair carrying the community's communityId", async () => {
    // Arrange: a community + an owner.
    // Act: createHackathon({ communitySlug, name, description, date, location, teamMin, teamMax }).
    // Assert: event.status === 'draft', event.type === 'hackathon',
    //         challenge.status === 'draft', challenge.cellTemplate === [],
    //         event.communityId === challenge.communityId, event.challengeId === challenge.id.
    expect(true).toBe(true);
  });
});
```

> Note: the repo's router integration tests are scaffolds run against a live DB (see `work-grid.integration.test.ts`, currently skipped in CI). Keep these as documented skip-guards; the real TDD signal for this feature is the Phase-A pure unit tests.

- [ ] **Step 2: Run the test (verify it is skipped without a DB)**

Run: `pnpm vitest run src/server/api/routers/hackathon-create.integration.test.ts`
Expected: tests SKIPPED (no `DATABASE_URL`), file reported as skipped.

- [ ] **Step 3: Add imports**

At the top of `hackathon.ts`, add:

```ts
import { isNull } from "drizzle-orm"; // merge into existing drizzle-orm import
import { plainTextToLexical } from "@/server/challenge-engine/lexical";
import {
  deriveSlug,
  buildHackathonChallengeData,
} from "@/server/hackathon/create-defaults";
import { buildEventPayloadData } from "@/server/api/routers/event-upsert-data";
```

(`isNull` may already be imported — don't duplicate.)

- [ ] **Step 4: Add the mutation**

Inside `createTRPCRouter({ ... })`, add:

```ts
  /**
   * One-shot community hackathon scaffold (ADR-0024/0031): create a draft
   * Challenge + draft hackathon Event and bind them. Both inherit the community's
   * communityId, so the binding invariant holds by construction. Draft-tolerant:
   * a mid-sequence failure leaves at most an invisible draft (no compensation).
   */
  createHackathon: protectedProcedure
    .input(
      z.object({
        communitySlug: z.string(),
        name: z.string().min(3).max(255),
        description: z.string().max(5000).optional(),
        date: z.string(),
        startTime: z.string().optional(),
        endTime: z.string().optional(),
        location: z.string().min(1).max(255),
        format: z.enum(["in-person", "online", "hybrid"]).optional(),
        teamMin: z.number().int().min(1).default(1),
        teamMax: z.number().int().min(1).default(5),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const community = await ctx.db.query.communities.findFirst({
        where: and(
          eq(communities.slug, input.communitySlug),
          isNull(communities.deletedAt),
        ),
      });
      if (!community) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Community not found" });
      }
      const membership = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, community.id),
          eq(communityMemberships.userId, userId),
        ),
      });
      if (!isCommunityHackathonAdmin(membership ?? null)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only community admins can create hackathons",
        });
      }

      const payload = await getPayloadClient();
      const suffix = String(Date.now());

      // 1. Challenge (draft, empty objectives + cellTemplate)
      const challenge = await payload.create({
        collection: "challenges",
        data: buildHackathonChallengeData({
          name: input.name,
          descriptionLexical: plainTextToLexical(input.description ?? ""),
          communityId: community.id,
          userId,
          slug: deriveSlug(input.name, `c-${suffix}`),
          teamMin: input.teamMin,
          teamMax: input.teamMax,
        }),
      });

      // 2. Event (draft, type hackathon, same communityId)
      const event = await payload.create({
        collection: "events",
        data: {
          slug: deriveSlug(input.name, `e-${suffix}`),
          status: "draft",
          communityId: community.id,
          ...buildEventPayloadData({
            title: input.name,
            description: input.description,
            type: "hackathon",
            date: input.date,
            startTime: input.startTime,
            endTime: input.endTime,
            location: input.location,
            format: input.format,
          }),
        },
      });

      // 3. Bind (invariant holds by construction; assert defensively)
      assertBindable(
        { type: event.type, communityId: event.communityId ?? null },
        { communityId: challenge.communityId ?? null },
      );
      await payload.update({
        collection: "events",
        id: Number(event.id),
        data: { challengeId: String(challenge.id) },
      });

      return {
        eventId: Number(event.id),
        eventSlug: event.slug as string,
        challengeId: Number(challenge.id),
        communitySlug: input.communitySlug,
      };
    }),
```

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: passes. (If `buildEventPayloadData` complains about the `format` enum, align `format` with `EVENT_FORMAT_OPTIONS` in `src/lib/event-metadata.ts` — use those exact values in the input enum.)

- [ ] **Step 6: Commit**

```bash
git add src/server/api/routers/hackathon.ts src/server/api/routers/hackathon-create.integration.test.ts
git commit -m "feat(hackathon): createHackathon — scaffold a bound draft Event+Challenge (ADR-0024)"
```

---

### Task 6: `updateHackathon` mutation (edits identity/team/prize + cellTemplate)

**Files:**
- Modify: `src/server/api/routers/hackathon.ts`

- [ ] **Step 1: Add the mutation**

Inside the router, add:

```ts
  /**
   * Edit a community hackathon's authored content — the cellTemplate task list
   * plus team/prize fields. Role-scoped (ADR-0031). cellTemplate is validated
   * against the canonical schema before it is written.
   */
  updateHackathon: protectedProcedure
    .input(
      z.object({
        challengeId: z.number(),
        cellTemplate: cellTemplateSchema.optional(),
        teamMin: z.number().int().min(1).optional(),
        teamMax: z.number().int().min(1).optional(),
        xpReward: z.number().int().min(0).optional(),
        sponsorReward: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const challenge = await requireCommunityHackathonAdmin(
        ctx.db,
        input.challengeId,
        userId,
      );

      const data: Record<string, unknown> = {};
      if (input.cellTemplate !== undefined) data.cellTemplate = input.cellTemplate;
      if (input.teamMin !== undefined || input.teamMax !== undefined) {
        data.teamConfig = {
          minTeamSize: input.teamMin ?? challenge.teamConfig?.minTeamSize ?? 1,
          maxTeamSize: input.teamMax ?? challenge.teamConfig?.maxTeamSize ?? 5,
        };
      }
      if (input.xpReward !== undefined || input.sponsorReward !== undefined) {
        data.rewards = {
          ...(challenge.rewards ?? {}),
          ...(input.xpReward !== undefined ? { xpReward: input.xpReward } : {}),
          ...(input.sponsorReward !== undefined
            ? { sponsorReward: input.sponsorReward }
            : {}),
        };
      }

      const payload = await getPayloadClient();
      const updated = await payload.update({
        collection: "challenges",
        id: input.challengeId,
        data,
      });
      return { challengeId: Number(updated.id) };
    }),
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/server/api/routers/hackathon.ts
git commit -m "feat(hackathon): updateHackathon — edit cellTemplate + team/prize (role-scoped)"
```

---

### Task 7: `publishHackathon` mutation (≥1 cell gate → event published, challenge active)

**Files:**
- Modify: `src/server/api/routers/hackathon.ts`

- [ ] **Step 1: Add the mutation**

Inside the router, add:

```ts
  /**
   * Publish a community hackathon: requires >=1 cellTemplate row (no empty
   * hackathon), then flips the Event to `published` and the Challenge to `active`
   * (the challenges status enum is draft|active|completed|archived — there is no
   * `published`). Publishing the event opens team formation. Role-scoped.
   */
  publishHackathon: protectedProcedure
    .input(z.object({ challengeId: z.number(), eventId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const challenge = await requireCommunityHackathonAdmin(
        ctx.db,
        input.challengeId,
        userId,
      );

      const cells = cellTemplateSchema.parse(challenge.cellTemplate ?? []);
      if (cells.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Add at least one task before publishing the hackathon.",
        });
      }

      const payload = await getPayloadClient();
      await payload.update({
        collection: "challenges",
        id: input.challengeId,
        data: { status: "active" },
      });
      await payload.update({
        collection: "events",
        id: input.eventId,
        data: { status: "published" },
      });
      return { published: true };
    }),
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/server/api/routers/hackathon.ts
git commit -m "feat(hackathon): publishHackathon — >=1-cell gate, event published + challenge active"
```

---

## Phase C — Frontend

### Task 8: i18n keys

**Files:**
- Modify: `messages/en.json` (the `hackathon` object)
- Modify: `messages/nl.json` (the `hackathon` object)

- [ ] **Step 1: Add keys to `messages/en.json`**

Inside the existing `"hackathon": { ... }` object, add:

```json
    "createHackathonCta": "Create hackathon",
    "createTitle": "New hackathon",
    "name": "Name",
    "description": "Description",
    "date": "Date",
    "startTime": "Start time",
    "endTime": "End time",
    "location": "Location",
    "teamMin": "Min team size",
    "teamMax": "Max team size",
    "manage": "Manage",
    "tasks": "Tasks",
    "addTask": "Add task",
    "removeTask": "Remove",
    "taskDescription": "Task description",
    "taskType": "Task type",
    "verificationMode": "Verification",
    "deadlineMinutes": "Deadline (minutes)",
    "publish": "Publish",
    "publishHint": "Add at least one task before publishing.",
    "lockRosters": "Lock rosters",
    "saveTasks": "Save tasks",
    "statusDraft": "Draft",
    "statusPublished": "Published",
    "statusLocked": "Rosters locked"
```

- [ ] **Step 2: Add the same keys to `messages/nl.json`** with Dutch values, e.g.:

```json
    "createHackathonCta": "Hackathon aanmaken",
    "createTitle": "Nieuwe hackathon",
    "name": "Naam",
    "description": "Beschrijving",
    "date": "Datum",
    "startTime": "Starttijd",
    "endTime": "Eindtijd",
    "location": "Locatie",
    "teamMin": "Min. teamgrootte",
    "teamMax": "Max. teamgrootte",
    "manage": "Beheren",
    "tasks": "Taken",
    "addTask": "Taak toevoegen",
    "removeTask": "Verwijderen",
    "taskDescription": "Taakomschrijving",
    "taskType": "Taaktype",
    "verificationMode": "Verificatie",
    "deadlineMinutes": "Deadline (minuten)",
    "publish": "Publiceren",
    "publishHint": "Voeg minstens één taak toe voordat je publiceert.",
    "lockRosters": "Roosters vergrendelen",
    "saveTasks": "Taken opslaan",
    "statusDraft": "Concept",
    "statusPublished": "Gepubliceerd",
    "statusLocked": "Roosters vergrendeld"
```

- [ ] **Step 3: Typecheck (next-intl key check via the IDE / build)**

Run: `pnpm typecheck`
Expected: passes. (The i18n-ally key-missing warnings disappear once both files carry the keys.)

- [ ] **Step 4: Commit**

```bash
git add messages/en.json messages/nl.json
git commit -m "feat(hackathon): i18n keys for community creation + manage UI"
```

---

### Task 9: `cellTemplate` task editor component

**Files:**
- Create: `src/components/hackathon/cell-template-editor.tsx`

> Mirrors the repeatable objectives list in `src/components/challenges/sponsor-challenge-form.tsx` (add/remove rows, per-row select), but writes `cellTemplate` rows.

- [ ] **Step 1: Write the component**

Create `src/components/hackathon/cell-template-editor.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface CellRow {
  description: string;
  taskType: string;
  verificationMode:
    | "platform-action"
    | "test"
    | "self-report"
    | "peer-review"
    | "consensus";
  deadlineMinutes: number;
}

export const emptyCell = (): CellRow => ({
  description: "",
  taskType: "",
  verificationMode: "self-report",
  deadlineMinutes: 60,
});

const MODES: CellRow["verificationMode"][] = [
  "platform-action",
  "test",
  "self-report",
  "peer-review",
  "consensus",
];

export function CellTemplateEditor({
  cells,
  onChange,
}: {
  cells: CellRow[];
  onChange: (next: CellRow[]) => void;
}) {
  const t = useTranslations("hackathon");

  const update = (i: number, patch: Partial<CellRow>) =>
    onChange(cells.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const remove = (i: number) => onChange(cells.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-3">
      {cells.map((cell, i) => (
        <div key={i} className="grid gap-2 rounded-md border p-3 sm:grid-cols-2">
          <Input
            placeholder={t("taskDescription")}
            value={cell.description}
            onChange={(e) => update(i, { description: e.target.value })}
          />
          <Input
            placeholder={t("taskType")}
            value={cell.taskType}
            onChange={(e) => update(i, { taskType: e.target.value })}
          />
          <Select
            value={cell.verificationMode}
            onValueChange={(v) =>
              update(i, { verificationMode: v as CellRow["verificationMode"] })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder={t("verificationMode")} />
            </SelectTrigger>
            <SelectContent>
              {MODES.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            min={1}
            placeholder={t("deadlineMinutes")}
            value={cell.deadlineMinutes}
            onChange={(e) =>
              update(i, { deadlineMinutes: Number(e.target.value) || 1 })
            }
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => remove(i)}
          >
            {t("removeTask")}
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => onChange([...cells, emptyCell()])}
      >
        {t("addTask")}
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/components/hackathon/cell-template-editor.tsx
git commit -m "feat(hackathon): in-app cellTemplate task editor component"
```

---

### Task 10: Create-hackathon dialog + button on the community events page

**Files:**
- Create: `src/components/hackathon/create-hackathon-dialog.tsx`
- Modify: `src/app/[locale]/communities/[slug]/events/page.tsx`

- [ ] **Step 1: Write the dialog component**

Create `src/components/hackathon/create-hackathon-dialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function CreateHackathonDialog({ communitySlug }: { communitySlug: string }) {
  const t = useTranslations("hackathon");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [location, setLocation] = useState("");
  const [teamMin, setTeamMin] = useState(1);
  const [teamMax, setTeamMax] = useState(5);

  const create = api.hackathon.createHackathon.useMutation({
    onSuccess: (res) => {
      setOpen(false);
      router.push(
        `/communities/${res.communitySlug}/events/${res.eventSlug}/manage`,
      );
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">{t("createHackathonCta")}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("createTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input placeholder={t("name")} value={name} onChange={(e) => setName(e.target.value)} />
          <Textarea
            placeholder={t("description")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Input
            placeholder={t("location")}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              min={1}
              placeholder={t("teamMin")}
              value={teamMin}
              onChange={(e) => setTeamMin(Number(e.target.value) || 1)}
            />
            <Input
              type="number"
              min={1}
              placeholder={t("teamMax")}
              value={teamMax}
              onChange={(e) => setTeamMax(Number(e.target.value) || 1)}
            />
          </div>
          <Button
            className="w-full"
            disabled={create.isPending || name.trim().length < 3 || !date || !location.trim()}
            onClick={() =>
              create.mutate({
                communitySlug,
                name: name.trim(),
                description: description.trim() || undefined,
                date,
                location: location.trim(),
                teamMin,
                teamMax,
              })
            }
          >
            {t("create")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Mount it for admins on the community events page**

In `src/app/[locale]/communities/[slug]/events/page.tsx`, locate where the existing create-event action renders for admins (search for `EventFormDialog` or the admin/role check already present on that page). Add, next to it, gated by the same admin condition:

```tsx
import { CreateHackathonDialog } from "@/components/hackathon/create-hackathon-dialog";

// ...inside the admin-only action area, alongside the existing create-event control:
{isAdminOrOwner ? <CreateHackathonDialog communitySlug={slug} /> : null}
```

Use the page's existing admin boolean (e.g. `isAdminOrOwner`) and its `slug` value — do not introduce a new role check; reuse what the page already computes.

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm typecheck`
Expected: passes.
Run: `pnpm lint`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/hackathon/create-hackathon-dialog.tsx "src/app/[locale]/communities/[slug]/events/page.tsx"
git commit -m "feat(hackathon): create-hackathon dialog + admin entry on community events page"
```

---

### Task 11: Admin manage route + manage surface (editor + lifecycle controls)

**Files:**
- Create: `src/app/[locale]/communities/[slug]/events/[eventSlug]/manage/page.tsx`
- Create: `src/components/hackathon/hackathon-manage.tsx`

- [ ] **Step 1: Write the RSC shell (admin gate + data load)**

Create `src/app/[locale]/communities/[slug]/events/[eventSlug]/manage/page.tsx`:

```tsx
import { notFound, redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { communities, communityMemberships } from "@/server/db/schema";
import { getServerAuthSession } from "@/server/auth";
import { getPayloadClient } from "@/server/payload";
import { isCommunityHackathonAdmin } from "@/server/hackathon/community-admin";
import { HackathonManage } from "@/components/hackathon/hackathon-manage";

export default async function ManageHackathonPage({
  params,
}: {
  params: Promise<{ slug: string; eventSlug: string }>;
}) {
  const { slug, eventSlug } = await params;
  const session = await getServerAuthSession();
  if (!session?.user) redirect(`/communities/${slug}/events`);

  const community = await db.query.communities.findFirst({
    where: and(eq(communities.slug, slug), isNull(communities.deletedAt)),
  });
  if (!community) notFound();

  const membership = await db.query.communityMemberships.findFirst({
    where: and(
      eq(communityMemberships.communityId, community.id),
      eq(communityMemberships.userId, session.user.id),
    ),
  });
  if (!isCommunityHackathonAdmin(membership ?? null)) {
    redirect(`/communities/${slug}/events`);
  }

  const payload = await getPayloadClient();
  const { docs } = await payload.find({
    collection: "events",
    where: { slug: { equals: eventSlug } },
    limit: 1,
    depth: 0,
  });
  const event = docs[0];
  if (!event?.challengeId) notFound();
  const challenge = await payload.findByID({
    collection: "challenges",
    id: Number(event.challengeId),
    depth: 0,
  });

  return (
    <HackathonManage
      communitySlug={slug}
      eventId={Number(event.id)}
      eventStatus={String(event.status)}
      challengeId={Number(challenge.id)}
      challengeStatus={String(challenge.status)}
      initialCells={(challenge.cellTemplate ?? []) as never[]}
      teamMin={challenge.teamConfig?.minTeamSize ?? 1}
      teamMax={challenge.teamConfig?.maxTeamSize ?? 5}
    />
  );
}
```

> If the auth import differs, use the project's canonical server-session accessor (search for how other RSC pages under `communities/[slug]` get the session — e.g. `getServerAuthSession` or the better-auth server helper) and match it exactly.

- [ ] **Step 2: Write the manage surface (client)**

Create `src/components/hackathon/hackathon-manage.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  CellTemplateEditor,
  type CellRow,
} from "@/components/hackathon/cell-template-editor";

export function HackathonManage({
  communitySlug,
  eventId,
  eventStatus,
  challengeId,
  challengeStatus,
  initialCells,
  teamMin,
  teamMax,
}: {
  communitySlug: string;
  eventId: number;
  eventStatus: string;
  challengeId: number;
  challengeStatus: string;
  initialCells: CellRow[];
  teamMin: number;
  teamMax: number;
}) {
  const t = useTranslations("hackathon");
  const [cells, setCells] = useState<CellRow[]>(initialCells);
  const [status, setStatus] = useState({ event: eventStatus, challenge: challengeStatus });

  const save = api.hackathon.updateHackathon.useMutation({
    onSuccess: () => toast.success(t("saveTasks")),
    onError: (e) => toast.error(e.message),
  });
  const publish = api.hackathon.publishHackathon.useMutation({
    onSuccess: () => {
      setStatus((s) => ({ ...s, event: "published", challenge: "active" }));
      toast.success(t("statusPublished"));
    },
    onError: (e) => toast.error(e.message),
  });
  const lock = api.hackathon.lockRosters.useMutation({
    onSuccess: () => toast.success(t("statusLocked")),
    onError: (e) => toast.error(e.message),
  });
  const finalize = api.hackathon.finalizeHackathon.useMutation({
    onSuccess: () => toast.success(t("finalize")),
    onError: (e) => toast.error(e.message),
  });

  const isDraft = status.event === "draft";

  return (
    <section className="mx-auto max-w-3xl space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t("manage")}</h1>
        <Badge variant={isDraft ? "outline" : "secondary"}>
          {isDraft ? t("statusDraft") : t("statusPublished")}
        </Badge>
      </div>

      <Card className="space-y-3 p-4">
        <h2 className="text-sm font-medium">{t("tasks")}</h2>
        <CellTemplateEditor cells={cells} onChange={setCells} />
        <Button
          size="sm"
          disabled={save.isPending}
          onClick={() => save.mutate({ challengeId, cellTemplate: cells })}
        >
          {t("saveTasks")}
        </Button>
      </Card>

      <Card className="flex flex-wrap gap-2 p-4">
        <Button
          disabled={publish.isPending || !isDraft || cells.length === 0}
          onClick={() => publish.mutate({ challengeId, eventId })}
        >
          {t("publish")}
        </Button>
        <Button
          variant="secondary"
          disabled={lock.isPending || isDraft}
          onClick={() => lock.mutate({ challengeId })}
        >
          {t("lockRosters")}
        </Button>
        <Button
          variant="destructive"
          disabled={finalize.isPending || isDraft}
          onClick={() => finalize.mutate({ challengeId })}
        >
          {t("finalize")}
        </Button>
      </Card>
    </section>
  );
}
```

> Note `communitySlug`, `teamMin`, `teamMax` are passed for future team/prize editing; if lint flags them as unused, wire a small team-size editor calling `updateHackathon` or remove the props. Keep `cells.length === 0` disabling Publish to mirror the backend ≥1-cell gate (defense in depth + clearer UX via `publishHint`).

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm typecheck`
Expected: passes.
Run: `pnpm lint`
Expected: no new errors (resolve any unused-prop warnings per the note above).

- [ ] **Step 4: Commit**

```bash
git add "src/app/[locale]/communities/[slug]/events/[eventSlug]/manage/page.tsx" src/components/hackathon/hackathon-manage.tsx
git commit -m "feat(hackathon): admin manage route — cell editor + publish/lock/finalize controls"
```

---

### Task 12: Remove Finalize from the public `HackathonPanel`

**Files:**
- Modify: `src/components/hackathon/hackathon-panel.tsx`

- [ ] **Step 1: Remove the sponsor finalize block**

In `src/components/hackathon/hackathon-panel.tsx`, delete the `finalize` mutation hook and the `{isSponsor ? (<Button … finalize …/>) : null}` block (finalize now lives on the manage route). Also remove the now-unused `isSponsor`/`challengeCreatorId` derivation **only if** nothing else uses it; if `challengeCreatorId` is still a prop, leave the prop but drop the finalize usage.

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck`
Expected: passes.
Run: `pnpm lint`
Expected: no new errors (no unused `finalize`/`isSponsor`).

- [ ] **Step 3: Commit**

```bash
git add src/components/hackathon/hackathon-panel.tsx
git commit -m "refactor(hackathon): move Finalize off the public panel to the admin manage route"
```

---

## Final verification

- [ ] **Run the full unit suite**

Run: `pnpm test`
Expected: all pass; the new pure tests (`create-defaults`, `community-admin`) green; integration scaffolds skipped without a DB.

- [ ] **Typecheck + lint clean**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors.

- [ ] **Manual smoke (optional, needs dev DB + an owner membership)**

1. `pnpm dev:db && pnpm dev`
2. As a community `owner|admin`, open `/communities/<slug>/events`, click **Create hackathon**, fill name/date/location → submit.
3. Land on the manage route; add ≥1 task; **Save tasks**; **Publish**.
4. Open `/events/<eventSlug>` → the `HackathonPanel` renders; form a team.
5. Back on manage: **Lock rosters** (grids built), then **Finalize**.

---

## Self-review notes (author)

- **Spec coverage:** community-scoped only (Task 5 admin gate + communityId fanned to both records); scaffold-then-fill (Tasks 5/9/11); lifecycle create→publish→lock with finalize relocated (Tasks 5–7, 11–12); draft-tolerant single mutation (Task 5, no compensation); objectives optional (Task 1, ADR-0032); single-source identity + derived timing (Task 5 builders); in-app cell editor (Task 9); role-scoped operation (Tasks 3–7, ADR-0031); UI entry + manage route (Tasks 10–11). All spec sections map to a task.
- **Status enum:** publish sets challenge `active`, event `published` (Task 7) — matches the corrected spec.
- **Out of scope** (Hub-wide, cron auto-lock, human judging, launchpad, disband/lock race) — intentionally no tasks.
