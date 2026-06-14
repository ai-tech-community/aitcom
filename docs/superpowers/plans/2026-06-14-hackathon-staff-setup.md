# Hackathon Organizer & Judge Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the raw "user id" text inputs for hackathon organizers/judges with a searchable browse-and-select picker, support inviting external people by email, and display staff with avatar + name + email.

**Architecture:** A new `hackathon_staff_invite` table records pending email invites (with a snapshot of `communityId` + `challengeTitle` so redemption needs no Payload call). New tRPC procedures back a browse list (`listStaffCandidates`), an enriched `listStaff`, an `inviteStaffByEmail` (with an existing-account shortcut to `grantStaff`), and `revokeStaffInvite`. A Better Auth `user.create.after` hook redeems matching invites silently on first signup. The UI is rebuilt from `Command`/`Popover`/`Avatar` primitives into a per-role section + picker.

**Tech Stack:** Next.js (App Router), tRPC, Drizzle ORM, Payload migrations (`db:apply`), Better Auth, Resend, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-06-14-hackathon-staff-setup-design.md`

---

## Conventions (read before starting)

- **Schema changes:** edit the Drizzle definition in `src/server/db/schema.ts` for types, AND hand-write a Payload migration in `src/migrations/`, register it in `src/migrations/index.ts`, then run `pnpm db:apply`. NEVER `db:push`/`db:migrate` for new schema. (`hackathon_staff_invite` is a plain Drizzle table, NOT a Payload collection — no `payload generate:types` needed.)
- **Tests:** pure functions get direct unit tests (model: `src/server/hackathon/staff-roles.test.ts`). Router wiring gets mocked-boundary caller tests (model: `src/server/api/routers/deadline-enforcement.test.ts`). Components use Testing Library with the `api` object mocked (model: `src/components/ideas/hub-ideas.test.tsx`).
- **Run a single test file:** `pnpm test src/path/to/file.test.ts`
- **Do NOT** `git checkout`/`switch` branches. Work stays on `feat/hackathon-staff-setup`.
- Commit after each task.

---

## Task 1: `hackathon_staff_invite` table (schema + migration)

**Files:**
- Modify: `src/server/db/schema.ts` (add table near `hackathonStaff`, ~line 1608)
- Create: `src/migrations/20260614b_hackathon_staff_invite.ts`
- Modify: `src/migrations/index.ts` (register the new migration at the end of the array)

- [ ] **Step 1: Add the Drizzle table definition**

In `src/server/db/schema.ts`, immediately after the `hackathonStaffRelations` block (~line 1615), add:

```ts
// Pending email invites for hackathon staff (organizer | judge). A row exists
// only until the invited email signs up (redeemedAt) or an organizer cancels it
// (revokedAt). communityId + challengeTitle are snapshotted at invite time so the
// signup-hook redemption path needs no Payload call.
export const hackathonStaffInvite = appSchema.table(
  "hackathon_staff_invite",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    challengeId: d.integer().notNull(),
    communityId: d.varchar({ length: 255 }), // null = hub-wide hackathon
    challengeTitle: d.varchar({ length: 255 }).notNull(),
    email: d.varchar({ length: 255 }).notNull(), // normalized (lowercased/trimmed)
    role: d.varchar({ length: 20 }).notNull().$type<"organizer" | "judge">(),
    code: d.varchar({ length: 255 }).notNull(),
    invitedBy: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    expiresAt: d.timestamp({ withTimezone: true }),
    redeemedAt: d.timestamp({ withTimezone: true }),
    redeemedUserId: d.varchar({ length: 255 }).references(() => user.id),
    revokedAt: d.timestamp({ withTimezone: true }),
  }),
  (t) => [
    index("hackathon_staff_invite_challenge_idx").on(t.challengeId),
    index("hackathon_staff_invite_email_idx").on(t.email),
    uniqueIndex("hackathon_staff_invite_code_uidx").on(t.code),
    // One live invite per (challenge, email, role); cancelled/redeemed rows don't count.
    uniqueIndex("hackathon_staff_invite_live_uidx")
      .on(t.challengeId, t.email, t.role)
      .where(sql`${t.revokedAt} is null and ${t.redeemedAt} is null`),
  ],
);
```

- [ ] **Step 2: Write the migration**

Create `src/migrations/20260614b_hackathon_staff_invite.ts`:

```ts
// src/migrations/20260614b_hackathon_staff_invite.ts
// Pending email invites for hackathon staff. Mirrors the Drizzle def in
// src/server/db/schema.ts (hackathonStaffInvite). Idempotent.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."hackathon_staff_invite" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "challenge_id" integer NOT NULL,
      "community_id" varchar(255),
      "challenge_title" varchar(255) NOT NULL,
      "email" varchar(255) NOT NULL,
      "role" varchar(20) NOT NULL,
      "code" varchar(255) NOT NULL,
      "invited_by" varchar(255) NOT NULL,
      "created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
      "expires_at" timestamptz,
      "redeemed_at" timestamptz,
      "redeemed_user_id" varchar(255),
      "revoked_at" timestamptz
    );
    CREATE INDEX IF NOT EXISTS "hackathon_staff_invite_challenge_idx" ON "app"."hackathon_staff_invite" ("challenge_id");
    CREATE INDEX IF NOT EXISTS "hackathon_staff_invite_email_idx" ON "app"."hackathon_staff_invite" ("email");
    CREATE UNIQUE INDEX IF NOT EXISTS "hackathon_staff_invite_code_uidx" ON "app"."hackathon_staff_invite" ("code");
    CREATE UNIQUE INDEX IF NOT EXISTS "hackathon_staff_invite_live_uidx" ON "app"."hackathon_staff_invite" ("challenge_id","email","role") WHERE "revoked_at" IS NULL AND "redeemed_at" IS NULL;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS "app"."hackathon_staff_invite";`);
}
```

- [ ] **Step 3: Register the migration**

In `src/migrations/index.ts`, add the import alongside the others near the top:

```ts
import * as migration_20260614b_hackathon_staff_invite from "./20260614b_hackathon_staff_invite";
```

And append to the end of the exported migrations array (after the `20260614a_event_deadlines` entry):

```ts
  {
    up: migration_20260614b_hackathon_staff_invite.up,
    down: migration_20260614b_hackathon_staff_invite.down,
    name: "20260614b_hackathon_staff_invite",
  },
```

- [ ] **Step 4: Apply the migration**

Run: `pnpm db:apply`
Expected: output reporting `20260614b_hackathon_staff_invite` applied with no error.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no errors (the new export compiles).

- [ ] **Step 6: Commit**

```bash
git add src/server/db/schema.ts src/migrations/20260614b_hackathon_staff_invite.ts src/migrations/index.ts
git commit -m "feat(hackathon): add hackathon_staff_invite table"
```

---

## Task 2: Pure invite helpers + tests

These are pure functions with no server-only imports, so both the server router and the client component can import them.

**Files:**
- Create: `src/server/hackathon/staff-invite.ts`
- Test: `src/server/hackathon/staff-invite.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/server/hackathon/staff-invite.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  normalizeEmail,
  isLikelyEmail,
  isInviteRedeemable,
} from "./staff-invite";

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Foo@Bar.COM ")).toBe("foo@bar.com");
  });
});

describe("isLikelyEmail", () => {
  it("accepts a normal address", () => {
    expect(isLikelyEmail("judge@example.com")).toBe(true);
  });
  it("rejects a bare token / partial", () => {
    expect(isLikelyEmail("judge")).toBe(false);
    expect(isLikelyEmail("judge@")).toBe(false);
    expect(isLikelyEmail("judge@example")).toBe(false);
  });
});

describe("isInviteRedeemable", () => {
  const now = new Date("2026-06-14T00:00:00.000Z");
  const base = { revokedAt: null, redeemedAt: null, expiresAt: null };
  it("is true for a fresh unexpired invite", () => {
    expect(isInviteRedeemable(base, now)).toBe(true);
  });
  it("is false when revoked", () => {
    expect(isInviteRedeemable({ ...base, revokedAt: now }, now)).toBe(false);
  });
  it("is false when already redeemed", () => {
    expect(isInviteRedeemable({ ...base, redeemedAt: now }, now)).toBe(false);
  });
  it("is false when expired", () => {
    expect(
      isInviteRedeemable(
        { ...base, expiresAt: new Date("2026-06-13T00:00:00.000Z") },
        now,
      ),
    ).toBe(false);
  });
  it("is true when expiry is in the future", () => {
    expect(
      isInviteRedeemable(
        { ...base, expiresAt: new Date("2026-06-20T00:00:00.000Z") },
        now,
      ),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/server/hackathon/staff-invite.test.ts`
Expected: FAIL — `Cannot find module './staff-invite'`.

- [ ] **Step 3: Implement the helpers**

Create `src/server/hackathon/staff-invite.ts`:

```ts
// Pure helpers for hackathon staff email invites. No server-only imports — safe
// to import from client components (the manage UI reuses isLikelyEmail/normalizeEmail).

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

// Pragmatic "looks like an email" check used to decide whether to offer the
// "invite by email" affordance. Not a validator — the server re-normalizes and
// the real address is proven by Better Auth's email verification on signup.
export function isLikelyEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim());
}

export interface RedeemableInviteFields {
  revokedAt: Date | null;
  redeemedAt: Date | null;
  expiresAt: Date | null;
}

export function isInviteRedeemable(
  invite: RedeemableInviteFields,
  now: Date,
): boolean {
  if (invite.revokedAt !== null) return false;
  if (invite.redeemedAt !== null) return false;
  if (invite.expiresAt !== null && invite.expiresAt.getTime() <= now.getTime())
    return false;
  return true;
}

// Days an invite stays valid before it expires.
export const STAFF_INVITE_TTL_DAYS = 14;

export function inviteExpiry(now: Date): Date {
  return new Date(now.getTime() + STAFF_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/server/hackathon/staff-invite.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add src/server/hackathon/staff-invite.ts src/server/hackathon/staff-invite.test.ts
git commit -m "feat(hackathon): pure helpers for staff email invites"
```

---

## Task 3: Enrich `listStaff` (names/emails + pending invites)

`listStaff` currently returns bare `userId`. Enrich active rows with `displayName`/`email`/`image`, and also return pending invites.

**Files:**
- Modify: `src/server/api/routers/hackathon.ts` (the `listStaff` procedure, ~lines 1082-1105; imports at top)
- Test: `src/server/api/routers/staff-management.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `src/server/api/routers/staff-management.test.ts`. This reuses the mocked-boundary pattern from `deadline-enforcement.test.ts`. Start with the full mock preamble plus the first test:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

type SelectResult = unknown[];
const dbHooks = {
  // FIFO queue of results for successive db.select(...) chains in one call.
  selectResults: [] as SelectResult[],
  insertValues: undefined as unknown,
  insertConflict: false,
  updateRan: false,
};

function makeSelectChain() {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "where", "innerJoin", "leftJoin", "orderBy", "groupBy"])
    chain[m] = () => chain;
  chain.limit = () => chain;
  chain.then = (resolve: (v: SelectResult) => unknown) =>
    Promise.resolve(dbHooks.selectResults.shift() ?? []).then(resolve);
  return chain;
}

function makeInsertChain() {
  const chain: Record<string, unknown> = {};
  chain.values = (v: unknown) => {
    dbHooks.insertValues = v;
    return chain;
  };
  chain.onConflictDoUpdate = () => {
    dbHooks.insertConflict = true;
    return Promise.resolve();
  };
  chain.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(undefined).then(resolve);
  return chain;
}

function makeUpdateChain() {
  const chain: Record<string, unknown> = {};
  chain.set = () => chain;
  chain.where = () => {
    dbHooks.updateRan = true;
    return Promise.resolve();
  };
  return chain;
}

vi.mock("@/server/db", () => ({
  db: {
    select: () => makeSelectChain(),
    insert: () => makeInsertChain(),
    update: () => makeUpdateChain(),
    query: {
      communityMemberships: { findFirst: async () => undefined },
      communities: { findFirst: async () => undefined },
    },
  },
}));

vi.mock("@/env", () => ({
  env: { NODE_ENV: "test", DATABASE_URL: "postgres://localhost:5432/test" },
}));
vi.mock("@/server/better-auth", () => ({
  auth: { api: { getSession: async () => null } },
}));

// requireHackathonOperator / requireHackathonOrganizer both call loadChallenge,
// which reads Payload. Return a controllable challenge doc.
const payloadHooks = {
  challenge: { id: 1, communityId: null as string | null, title: "Hack", creatorId: "user-1" },
};
vi.mock("@/server/payload", () => ({
  getPayloadClient: async () => ({
    findByID: async () => payloadHooks.challenge,
    find: async () => ({ docs: [] }),
  }),
}));

// Email send is a no-op in these tests.
const emailHooks = { sent: [] as unknown[] };
vi.mock("@/server/email", () => ({
  sendHackathonStaffInvite: async (...args: unknown[]) => {
    emailHooks.sent.push(args);
  },
}));

import { createCaller } from "@/server/api/root";
import { db as mockedDb } from "@/server/db";

function caller(userId = "user-1") {
  return createCaller({
    db: mockedDb,
    session: { user: { id: userId } } as never,
    headers: new Headers(),
  });
}

beforeEach(() => {
  dbHooks.selectResults = [];
  dbHooks.insertValues = undefined;
  dbHooks.insertConflict = false;
  dbHooks.updateRan = false;
  emailHooks.sent = [];
  payloadHooks.challenge = {
    id: 1,
    communityId: null,
    title: "Hack",
    creatorId: "user-1",
  };
});

describe("listStaff", () => {
  it("returns active organizers/judges enriched with name/email/image, plus pending invites", async () => {
    // The procedure runs: requireHackathonOrganizer (gate; hub-wide sponsor path
    // needs no db.select), then two selects: (1) active staff rows, (2) pending invites.
    dbHooks.selectResults = [
      [
        {
          id: "s1",
          userId: "u-org",
          role: "organizer",
          revokedAt: null,
          grantedAt: new Date("2026-06-10T00:00:00Z"),
          displayName: "Olivia Org",
          email: "olivia@example.com",
          image: "https://img/olivia.png",
        },
        {
          id: "s2",
          userId: "u-judge",
          role: "judge",
          revokedAt: null,
          grantedAt: new Date("2026-06-11T00:00:00Z"),
          displayName: "Judy Judge",
          email: "judy@example.com",
          image: null,
        },
      ],
      [
        {
          id: "inv1",
          email: "external@example.com",
          role: "judge",
          invitedBy: "user-1",
          createdAt: new Date("2026-06-12T00:00:00Z"),
        },
      ],
    ];

    const res = await caller().hackathon.listStaff({ challengeId: 1 });

    expect(res.organizers).toEqual([
      expect.objectContaining({
        userId: "u-org",
        displayName: "Olivia Org",
        email: "olivia@example.com",
        image: "https://img/olivia.png",
      }),
    ]);
    expect(res.judges).toHaveLength(1);
    expect(res.judges[0]).toEqual(
      expect.objectContaining({ userId: "u-judge", displayName: "Judy Judge" }),
    );
    expect(res.pendingInvites).toEqual([
      expect.objectContaining({ email: "external@example.com", role: "judge" }),
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/server/api/routers/staff-management.test.ts`
Expected: FAIL — `res.pendingInvites` is undefined / shape mismatch (procedure not updated yet).

- [ ] **Step 3: Implement the enriched `listStaff`**

First ensure the imports exist at the top of `src/server/api/routers/hackathon.ts`. Confirm `memberProfiles` and `hackathonStaffInvite` are imported from `@/server/db/schema` (add to the existing import list if missing):

```ts
import {
  // ...existing imports...
  hackathonStaffInvite,
  memberProfiles,
} from "@/server/db/schema";
```

Replace the body of the `listStaff` procedure (currently ~lines 1082-1105) with:

```ts
  listStaff: protectedProcedure
    .input(z.object({ challengeId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireHackathonOrganizer(
        ctx.db,
        input.challengeId,
        ctx.session.user.id,
      );
      // Active grants, joined to user/profile so the UI shows a person, not a uuid.
      const rows = await ctx.db
        .select({
          id: hackathonStaff.id,
          userId: hackathonStaff.userId,
          role: hackathonStaff.role,
          revokedAt: hackathonStaff.revokedAt,
          grantedAt: hackathonStaff.grantedAt,
          displayName: memberProfiles.displayName,
          email: user.email,
          image: user.image,
        })
        .from(hackathonStaff)
        .innerJoin(user, eq(hackathonStaff.userId, user.id))
        .leftJoin(memberProfiles, eq(hackathonStaff.userId, memberProfiles.userId))
        .where(eq(hackathonStaff.challengeId, input.challengeId));
      const active = rows.filter((r) => r.revokedAt === null);
      // Pending (un-redeemed, un-revoked) email invites.
      const pendingInvites = await ctx.db
        .select({
          id: hackathonStaffInvite.id,
          email: hackathonStaffInvite.email,
          role: hackathonStaffInvite.role,
          invitedBy: hackathonStaffInvite.invitedBy,
          createdAt: hackathonStaffInvite.createdAt,
        })
        .from(hackathonStaffInvite)
        .where(
          and(
            eq(hackathonStaffInvite.challengeId, input.challengeId),
            isNull(hackathonStaffInvite.redeemedAt),
            isNull(hackathonStaffInvite.revokedAt),
          ),
        );
      return {
        organizers: active.filter((r) => r.role === "organizer"),
        judges: active.filter((r) => r.role === "judge"),
        pendingInvites,
      };
    }),
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/server/api/routers/staff-management.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/api/routers/hackathon.ts src/server/api/routers/staff-management.test.ts
git commit -m "feat(hackathon): enrich listStaff with profiles and pending invites"
```

---

## Task 4: `listStaffCandidates` (browse list)

A keyset-paginated, searchable list of people who can be added — community members for a community hackathon, bound-event attendees for a hub-wide one — excluding existing active staff.

**Files:**
- Modify: `src/server/api/routers/hackathon.ts` (add procedure after `listStaff`; confirm `boundHackathonEvent` import)
- Test: `src/server/api/routers/staff-management.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `src/server/api/routers/staff-management.test.ts`:

```ts
describe("listStaffCandidates", () => {
  it("community hackathon: returns members excluding existing staff", async () => {
    payloadHooks.challenge = {
      id: 1,
      communityId: "comm-1",
      title: "Hack",
      creatorId: "user-1",
    };
    // Gate (requireHackathonOrganizer) for a community hackathon reads
    // membership + grants via db.select; give it an admin membership then grants.
    dbHooks.selectResults = [
      [{ status: "active", role: "admin" }], // loadMembershipForChallenge
      [], // loadHackathonGrants
      // candidate rows (already-staff filtered out in SQL via NOT EXISTS):
      [
        {
          userId: "m1",
          displayName: "Mara Member",
          email: "mara@example.com",
          image: null,
          joinedAt: new Date("2026-06-01T00:00:00Z"),
        },
      ],
    ];

    const res = await caller().hackathon.listStaffCandidates({
      challengeId: 1,
      role: "judge",
    });

    expect(res.items).toEqual([
      expect.objectContaining({ userId: "m1", displayName: "Mara Member" }),
    ]);
    expect(res.nextCursor).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/server/api/routers/staff-management.test.ts -t listStaffCandidates`
Expected: FAIL — `listStaffCandidates` is not a function.

- [ ] **Step 3: Implement the procedure**

Confirm the import near the top of `hackathon.ts`:

```ts
import { boundHackathonEvent } from "@/server/hackathon/bound-event";
```

(It is already imported per the existing file — verify, don't duplicate.)

Add this procedure immediately after `listStaff`:

```ts
  // Browse list for the manage UI's add-control. Community hackathon → active
  // community members; hub-wide → attendees of the bound event. Existing active
  // staff for THIS challenge are excluded. Auth mirrors the corresponding grant.
  listStaffCandidates: protectedProcedure
    .input(
      z.object({
        challengeId: z.number(),
        role: z.enum(["organizer", "judge"]),
        search: z.string().trim().optional(),
        cursor: z
          .object({ joinedAt: z.string(), userId: z.string() })
          .nullish(),
        limit: z.number().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const actorId = ctx.session.user.id;
      const challenge =
        input.role === "organizer"
          ? await requireHackathonOperator(ctx.db, input.challengeId, actorId)
          : await requireHackathonOrganizer(ctx.db, input.challengeId, actorId);

      // Exclude anyone already an active staff member for this challenge.
      const notAlreadyStaff = sql`NOT EXISTS (
        SELECT 1 FROM ${hackathonStaff} hs
        WHERE hs.challenge_id = ${input.challengeId}
          AND hs.user_id = ${user.id}
          AND hs.revoked_at IS NULL
      )`;
      const searchClause = input.search
        ? sql`(${memberProfiles.displayName} ILIKE ${"%" + input.search + "%"} OR ${user.email} ILIKE ${"%" + input.search + "%"})`
        : undefined;

      if (challenge.communityId) {
        const conditions = [
          eq(communityMemberships.communityId, challenge.communityId),
          eq(communityMemberships.status, "active"),
          notAlreadyStaff,
        ];
        if (searchClause) conditions.push(searchClause);
        if (input.cursor) {
          conditions.push(
            sql`(${communityMemberships.joinedAt}, ${communityMemberships.userId}) < (${input.cursor.joinedAt}, ${input.cursor.userId})`,
          );
        }
        const items = await ctx.db
          .select({
            userId: communityMemberships.userId,
            displayName: memberProfiles.displayName,
            email: user.email,
            image: user.image,
            joinedAt: communityMemberships.joinedAt,
          })
          .from(communityMemberships)
          .innerJoin(user, eq(communityMemberships.userId, user.id))
          .leftJoin(
            memberProfiles,
            eq(communityMemberships.userId, memberProfiles.userId),
          )
          .where(and(...conditions))
          .orderBy(
            desc(communityMemberships.joinedAt),
            desc(communityMemberships.userId),
          )
          .limit(input.limit + 1);

        let nextCursor: typeof input.cursor | undefined;
        if (items.length > input.limit) {
          const next = items.pop()!;
          nextCursor = {
            joinedAt: next.joinedAt.toISOString(),
            userId: next.userId,
          };
        }
        return { items, nextCursor };
      }

      // Hub-wide: candidates are attendees of the bound event. No keyset cursor
      // here (registration lists are small); paginate by a simple limit.
      const event = await boundHackathonEvent(input.challengeId);
      if (!event) return { items: [], nextCursor: undefined };
      const conditions = [
        eq(eventRegistrations.eventId, Number(event.id)),
        sql`${eventRegistrations.status} IN ('registered', 'attended')`,
        notAlreadyStaff,
      ];
      if (searchClause) conditions.push(searchClause);
      const rows = await ctx.db
        .select({
          userId: user.id,
          displayName: memberProfiles.displayName,
          email: user.email,
          image: user.image,
          name: user.name,
        })
        .from(eventRegistrations)
        .innerJoin(user, eq(eventRegistrations.userId, user.id))
        .leftJoin(
          memberProfiles,
          eq(eventRegistrations.userId, memberProfiles.userId),
        )
        .where(and(...conditions))
        .limit(input.limit);
      return {
        items: rows.map((r) => ({
          userId: r.userId,
          displayName: r.displayName ?? r.name ?? "Anonymous",
          email: r.email,
          image: r.image,
          joinedAt: null as Date | null,
        })),
        nextCursor: undefined,
      };
    }),
```

> Note: confirm `eventRegistrations` and `desc` are imported in `hackathon.ts`. Add to the schema import / drizzle-orm import lists if missing (`eventRegistrations` from `@/server/db/schema`; `desc` from `drizzle-orm`).

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/server/api/routers/staff-management.test.ts -t listStaffCandidates`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm typecheck
git add src/server/api/routers/hackathon.ts src/server/api/routers/staff-management.test.ts
git commit -m "feat(hackathon): add listStaffCandidates browse query"
```

---

## Task 5: `sendHackathonStaffInvite` email

**Files:**
- Modify: `src/server/email.ts` (add an exported function near the other senders)

- [ ] **Step 1: Add the email sender**

Append to `src/server/email.ts` (after an existing sender such as `sendMemberWelcome`):

```ts
/**
 * Invite an external person to be a hackathon organizer/judge. The link points at
 * the normal signup flow carrying the invite code; the Better Auth user.create
 * hook redeems the invite on first signup. Non-blocking when Resend is unset.
 */
export async function sendHackathonStaffInvite(
  to: string,
  role: "organizer" | "judge",
  challengeTitle: string,
  signupUrl: string,
) {
  const resend = getResend();
  if (!resend) return;
  const roleLabel = role === "organizer" ? "an organizer" : "a judge";
  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `You're invited to be ${roleLabel} for "${challengeTitle}"`,
    html: `<p>You've been invited to be ${roleLabel} for the hackathon <strong>${escapeHtml(
      challengeTitle,
    )}</strong> on AIT Community.</p><p>Create your account to accept: <a href="${signupUrl}">${signupUrl}</a></p><p>This invite expires in ${String(
      STAFF_INVITE_TTL_DAYS,
    )} days.</p>`,
  });
}
```

Add the import at the top of `src/server/email.ts`:

```ts
import { STAFF_INVITE_TTL_DAYS } from "@/server/hackathon/staff-invite";
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/server/email.ts
git commit -m "feat(hackathon): add staff invite email sender"
```

---

## Task 6: `inviteStaffByEmail` mutation

Existing-account shortcut → `grantStaff` (auto-adding community membership for a community hackathon); otherwise insert a pending invite row + send email.

**Files:**
- Modify: `src/server/api/routers/hackathon.ts` (add procedure after `grantStaff`)
- Test: `src/server/api/routers/staff-management.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `src/server/api/routers/staff-management.test.ts`:

```ts
describe("inviteStaffByEmail", () => {
  it("new email (hub-wide): inserts a pending invite and sends the email", async () => {
    payloadHooks.challenge = {
      id: 1,
      communityId: null,
      title: "Hack",
      creatorId: "user-1",
    };
    // Operator gate is hub-sponsor (creatorId === actor), no db.select needed.
    // Then: select existing user by email → none.
    dbHooks.selectResults = [[]];

    const res = await caller().hackathon.inviteStaffByEmail({
      challengeId: 1,
      email: "New.Judge@Example.com",
      role: "judge",
    });

    expect(res.kind).toBe("invited");
    expect(dbHooks.insertValues).toEqual(
      expect.objectContaining({
        challengeId: 1,
        email: "new.judge@example.com", // normalized
        role: "judge",
        challengeTitle: "Hack",
        communityId: null,
      }),
    );
    expect(emailHooks.sent).toHaveLength(1);
  });

  it("existing email: grants immediately, no invite row, no email", async () => {
    payloadHooks.challenge = {
      id: 1,
      communityId: null,
      title: "Hack",
      creatorId: "user-1",
    };
    // 1) lookup user by email → found. Then grantStaff (hub-wide) re-selects the
    // user-exists check → found. grantStaff insert uses onConflictDoUpdate, and a
    // notification insert follows.
    dbHooks.selectResults = [
      [{ id: "existing-1", email: "known@example.com" }],
      [{ id: "existing-1" }],
    ];

    const res = await caller().hackathon.inviteStaffByEmail({
      challengeId: 1,
      email: "known@example.com",
      role: "judge",
    });

    expect(res.kind).toBe("granted");
    expect(emailHooks.sent).toHaveLength(0);
    expect(dbHooks.insertConflict).toBe(true); // grantStaff upsert ran
  });

  it("rejects a non-operator inviting an organizer", async () => {
    payloadHooks.challenge = {
      id: 1,
      communityId: null,
      title: "Hack",
      creatorId: "someone-else",
    };
    await expect(
      caller("user-1").hackathon.inviteStaffByEmail({
        challengeId: 1,
        email: "x@example.com",
        role: "organizer",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/server/api/routers/staff-management.test.ts -t inviteStaffByEmail`
Expected: FAIL — `inviteStaffByEmail` is not a function.

- [ ] **Step 3: Implement the mutation**

Add imports at the top of `hackathon.ts` if missing:

```ts
import {
  normalizeEmail,
  inviteExpiry,
} from "@/server/hackathon/staff-invite";
import { sendHackathonStaffInvite } from "@/server/email";
import { env } from "@/env";
```

Add this procedure immediately after `grantStaff`:

```ts
  // Invite by email. If the address already has an account, grant immediately
  // (adding an active community membership first for a community hackathon);
  // otherwise persist a pending invite and email a signup link. The signup hook
  // wires the grant in on first login. Auth mirrors grantStaff.
  inviteStaffByEmail: protectedProcedure
    .input(
      z.object({
        challengeId: z.number(),
        email: z.string().email(),
        role: z.enum(["organizer", "judge"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const actorId = ctx.session.user.id;
      const challenge =
        input.role === "organizer"
          ? await requireHackathonOperator(ctx.db, input.challengeId, actorId)
          : await requireHackathonOrganizer(ctx.db, input.challengeId, actorId);
      const email = normalizeEmail(input.email);

      // Existing-account shortcut.
      const [existing] = await ctx.db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, email))
        .limit(1);
      if (existing) {
        // For a community hackathon, ensure an active membership exists so
        // grantStaff's membership check passes (idempotent upsert).
        if (challenge.communityId) {
          await ctx.db
            .insert(communityMemberships)
            .values({
              communityId: challenge.communityId,
              userId: existing.id,
              status: "active",
              role: "member",
              invitedBy: actorId,
            })
            .onConflictDoNothing();
        }
        await grantStaffInternal(ctx.db, {
          challenge,
          challengeId: input.challengeId,
          userId: existing.id,
          role: input.role,
          grantedBy: actorId,
        });
        return { kind: "granted" as const };
      }

      // New address → pending invite + email.
      const now = new Date();
      const code = crypto.randomUUID();
      await ctx.db.insert(hackathonStaffInvite).values({
        challengeId: input.challengeId,
        communityId: challenge.communityId ?? null,
        challengeTitle: challenge.title,
        email,
        role: input.role,
        code,
        invitedBy: actorId,
        expiresAt: inviteExpiry(now),
      });
      const signupUrl = `${env.NEXT_PUBLIC_APP_URL}/en/sign-up?invite=${code}&email=${encodeURIComponent(email)}`;
      await sendHackathonStaffInvite(
        email,
        input.role,
        challenge.title,
        signupUrl,
      ).catch(() => {
        /* email failure is non-fatal; invite row persists for resend */
      });
      return { kind: "invited" as const };
    }),
```

The shortcut path needs the grant logic without re-running the auth gate (already checked). Extract the grant body of `grantStaff` into a module-level helper and have `grantStaff` call it too. Add this helper near the other module-level helpers (e.g. just above `hackathonRouter`):

```ts
// The grant + notification body shared by grantStaff and the inviteStaffByEmail
// shortcut. Callers MUST have already authorized the actor and validated the
// target is grantable (active member / existing user).
async function grantStaffInternal(
  db: typeof import("@/server/db").db,
  args: {
    challenge: { communityId?: string | null; title: string };
    challengeId: number;
    userId: string;
    role: "organizer" | "judge";
    grantedBy: string;
  },
) {
  await db
    .insert(hackathonStaff)
    .values({
      challengeId: args.challengeId,
      userId: args.userId,
      role: args.role,
      grantedBy: args.grantedBy,
    })
    .onConflictDoUpdate({
      target: [
        hackathonStaff.challengeId,
        hackathonStaff.userId,
        hackathonStaff.role,
      ],
      set: { revokedAt: null, grantedBy: args.grantedBy, grantedAt: new Date() },
    });
  await db.insert(notifications).values({
    userId: args.userId,
    type: "hackathon_staff_grant",
    title:
      args.role === "organizer"
        ? "You're now an organizer"
        : "You're now a judge",
    content: `You were added as ${args.role === "organizer" ? "an organizer" : "a judge"} for "${args.challenge.title}".`,
    metadata: { challengeId: String(args.challengeId), role: args.role },
    communityId: args.challenge.communityId ?? null,
  });
}
```

Then in `grantStaff`, replace the existing insert-then-notify block (current lines ~1162-1191) with a single call:

```ts
      await grantStaffInternal(ctx.db, {
        challenge,
        challengeId: input.challengeId,
        userId: input.userId,
        role: input.role,
        grantedBy: actorId,
      });
      return { ok: true };
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test src/server/api/routers/staff-management.test.ts -t inviteStaffByEmail`
Expected: PASS (all three cases).

- [ ] **Step 5: Re-run the whole staff suite (no regressions)**

Run: `pnpm test src/server/api/routers/staff-management.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck + commit**

```bash
pnpm typecheck
git add src/server/api/routers/hackathon.ts src/server/api/routers/staff-management.test.ts
git commit -m "feat(hackathon): inviteStaffByEmail with existing-account shortcut"
```

---

## Task 7: `revokeStaffInvite` mutation

**Files:**
- Modify: `src/server/api/routers/hackathon.ts` (add after `revokeStaff`)
- Test: `src/server/api/routers/staff-management.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append:

```ts
describe("revokeStaffInvite", () => {
  it("cancels a pending invite after authorizing for its role", async () => {
    payloadHooks.challenge = {
      id: 1,
      communityId: null,
      title: "Hack",
      creatorId: "user-1",
    };
    // 1) load invite by id → a judge invite for challenge 1.
    dbHooks.selectResults = [
      [{ id: "inv1", challengeId: 1, role: "judge", revokedAt: null }],
    ];

    const res = await caller().hackathon.revokeStaffInvite({ inviteId: "inv1" });

    expect(res.ok).toBe(true);
    expect(dbHooks.updateRan).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/server/api/routers/staff-management.test.ts -t revokeStaffInvite`
Expected: FAIL — not a function.

- [ ] **Step 3: Implement**

Add after `revokeStaff`:

```ts
  // Cancel a pending email invite. Auth mirrors the grant for the invite's role.
  revokeStaffInvite: protectedProcedure
    .input(z.object({ inviteId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const actorId = ctx.session.user.id;
      const [invite] = await ctx.db
        .select({
          id: hackathonStaffInvite.id,
          challengeId: hackathonStaffInvite.challengeId,
          role: hackathonStaffInvite.role,
          revokedAt: hackathonStaffInvite.revokedAt,
        })
        .from(hackathonStaffInvite)
        .where(eq(hackathonStaffInvite.id, input.inviteId))
        .limit(1);
      if (!invite) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No such invite." });
      }
      if (invite.role === "organizer") {
        await requireHackathonOperator(ctx.db, invite.challengeId, actorId);
      } else {
        await requireHackathonOrganizer(ctx.db, invite.challengeId, actorId);
      }
      await ctx.db
        .update(hackathonStaffInvite)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(hackathonStaffInvite.id, input.inviteId),
            isNull(hackathonStaffInvite.redeemedAt),
            isNull(hackathonStaffInvite.revokedAt),
          ),
        );
      return { ok: true };
    }),
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test src/server/api/routers/staff-management.test.ts -t revokeStaffInvite`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/api/routers/hackathon.ts src/server/api/routers/staff-management.test.ts
git commit -m "feat(hackathon): add revokeStaffInvite mutation"
```

---

## Task 8: Redeem invites on signup (Better Auth hook)

A pure-db redemption helper, unit-tested with a fake db, wired into the existing `user.create.after` hook.

**Files:**
- Create: `src/server/hackathon/redeem-staff-invites.ts`
- Test: `src/server/hackathon/redeem-staff-invites.test.ts`
- Modify: `src/server/better-auth/config.ts` (call the helper in the existing hook)

- [ ] **Step 1: Write the failing test**

Create `src/server/hackathon/redeem-staff-invites.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { redeemPendingStaffInvites } from "./redeem-staff-invites";

// Minimal fake db capturing inserts/updates and serving queued select results.
function makeFakeDb(selectQueue: unknown[][]) {
  const calls = { inserts: [] as unknown[], membershipInserts: 0, updates: 0 };
  const db = {
    select: () => {
      const chain: Record<string, unknown> = {};
      for (const m of ["from", "where", "innerJoin", "leftJoin", "orderBy"])
        chain[m] = () => chain;
      chain.limit = () => chain;
      chain.then = (r: (v: unknown[]) => unknown) =>
        Promise.resolve(selectQueue.shift() ?? []).then(r);
      return chain;
    },
    insert: (table: { _: { name?: string } } | unknown) => {
      const chain: Record<string, unknown> = {};
      chain.values = (v: unknown) => {
        // membership inserts use onConflictDoNothing; staff inserts use onConflictDoUpdate.
        chain._v = v;
        return chain;
      };
      chain.onConflictDoNothing = () => {
        calls.membershipInserts++;
        return Promise.resolve();
      };
      chain.onConflictDoUpdate = () => {
        calls.inserts.push((chain as { _v: unknown })._v);
        return Promise.resolve();
      };
      chain.then = (r: (v: unknown) => unknown) =>
        Promise.resolve(undefined).then(r);
      return chain;
    },
    update: () => {
      const chain: Record<string, unknown> = {};
      chain.set = () => chain;
      chain.where = () => {
        calls.updates++;
        return Promise.resolve();
      };
      return chain;
    },
  };
  return { db, calls };
}

describe("redeemPendingStaffInvites", () => {
  const now = new Date("2026-06-14T00:00:00.000Z");

  it("grants + marks each redeemable invite; hub-wide makes no membership", async () => {
    const { db, calls } = makeFakeDb([
      [
        {
          id: "inv1",
          challengeId: 1,
          communityId: null,
          challengeTitle: "Hack",
          role: "judge",
          invitedBy: "u-host",
          revokedAt: null,
          redeemedAt: null,
          expiresAt: null,
        },
      ],
    ]);

    await redeemPendingStaffInvites(db as never, {
      userId: "new-1",
      email: "new@example.com",
      now,
    });

    expect(calls.inserts).toHaveLength(1); // staff grant
    expect(calls.membershipInserts).toBe(0); // hub-wide → no membership
    expect(calls.updates).toBe(1); // invite marked redeemed
  });

  it("community invite also creates a membership", async () => {
    const { db, calls } = makeFakeDb([
      [
        {
          id: "inv2",
          challengeId: 2,
          communityId: "comm-9",
          challengeTitle: "CHack",
          role: "organizer",
          invitedBy: "u-host",
          revokedAt: null,
          redeemedAt: null,
          expiresAt: null,
        },
      ],
    ]);

    await redeemPendingStaffInvites(db as never, {
      userId: "new-2",
      email: "c@example.com",
      now,
    });

    expect(calls.membershipInserts).toBe(1);
    expect(calls.inserts).toHaveLength(1);
    expect(calls.updates).toBe(1);
  });

  it("skips expired/revoked invites (filtered before any write)", async () => {
    const { db, calls } = makeFakeDb([
      [
        {
          id: "inv3",
          challengeId: 3,
          communityId: null,
          challengeTitle: "Old",
          role: "judge",
          invitedBy: "u-host",
          revokedAt: null,
          redeemedAt: null,
          expiresAt: new Date("2026-06-01T00:00:00.000Z"), // past
        },
      ],
    ]);

    await redeemPendingStaffInvites(db as never, {
      userId: "new-3",
      email: "x@example.com",
      now,
    });

    expect(calls.inserts).toHaveLength(0);
    expect(calls.updates).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/server/hackathon/redeem-staff-invites.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

Create `src/server/hackathon/redeem-staff-invites.ts`:

```ts
// Redeems any pending hackathon-staff invites for a freshly-created account.
// Pure db operations only (no Payload) — communityId + challengeTitle are
// snapshotted on the invite row. Runs in the Better Auth user.create.after hook.
import { and, eq, isNull } from "drizzle-orm";

import type { db as Db } from "@/server/db";
import {
  communityMemberships,
  hackathonStaff,
  hackathonStaffInvite,
  notifications,
} from "@/server/db/schema";
import { isInviteRedeemable } from "./staff-invite";

export async function redeemPendingStaffInvites(
  db: typeof Db,
  args: { userId: string; email: string; now: Date },
): Promise<void> {
  const invites = await db
    .select({
      id: hackathonStaffInvite.id,
      challengeId: hackathonStaffInvite.challengeId,
      communityId: hackathonStaffInvite.communityId,
      challengeTitle: hackathonStaffInvite.challengeTitle,
      role: hackathonStaffInvite.role,
      invitedBy: hackathonStaffInvite.invitedBy,
      revokedAt: hackathonStaffInvite.revokedAt,
      redeemedAt: hackathonStaffInvite.redeemedAt,
      expiresAt: hackathonStaffInvite.expiresAt,
    })
    .from(hackathonStaffInvite)
    .where(
      and(
        eq(hackathonStaffInvite.email, args.email),
        isNull(hackathonStaffInvite.redeemedAt),
        isNull(hackathonStaffInvite.revokedAt),
      ),
    );

  for (const invite of invites) {
    if (!isInviteRedeemable(invite, args.now)) continue;

    if (invite.communityId) {
      await db
        .insert(communityMemberships)
        .values({
          communityId: invite.communityId,
          userId: args.userId,
          status: "active",
          role: "member",
          invitedBy: invite.invitedBy,
        })
        .onConflictDoNothing();
    }

    await db
      .insert(hackathonStaff)
      .values({
        challengeId: invite.challengeId,
        userId: args.userId,
        role: invite.role,
        grantedBy: invite.invitedBy,
      })
      .onConflictDoUpdate({
        target: [
          hackathonStaff.challengeId,
          hackathonStaff.userId,
          hackathonStaff.role,
        ],
        set: { revokedAt: null, grantedBy: invite.invitedBy, grantedAt: args.now },
      });

    await db.insert(notifications).values({
      userId: args.userId,
      type: "hackathon_staff_grant",
      title:
        invite.role === "organizer"
          ? "You're now an organizer"
          : "You're now a judge",
      content: `You were added as ${invite.role === "organizer" ? "an organizer" : "a judge"} for "${invite.challengeTitle}".`,
      metadata: { challengeId: String(invite.challengeId), role: invite.role },
      communityId: invite.communityId ?? null,
    });

    await db
      .update(hackathonStaffInvite)
      .set({ redeemedAt: args.now, redeemedUserId: args.userId })
      .where(eq(hackathonStaffInvite.id, invite.id));
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test src/server/hackathon/redeem-staff-invites.test.ts`
Expected: PASS (all three cases).

- [ ] **Step 5: Wire into the auth hook**

In `src/server/better-auth/config.ts`, add the import:

```ts
import { redeemPendingStaffInvites } from "@/server/hackathon/redeem-staff-invites";
```

Inside the existing `databaseHooks.user.create.after` callback, after the `sendMemberWelcome(...)` line (and before the closing brace), add a non-blocking redemption:

```ts
          redeemPendingStaffInvites(db, {
            userId: user.id,
            email: user.email.toLowerCase(),
            now: new Date(),
          }).catch(() => {
            /* non-blocking: a failed redemption must never fail signup */
          });
```

- [ ] **Step 6: Typecheck + commit**

```bash
pnpm typecheck
git add src/server/hackathon/redeem-staff-invites.ts src/server/hackathon/redeem-staff-invites.test.ts src/server/better-auth/config.ts
git commit -m "feat(hackathon): redeem staff invites on signup"
```

---

## Task 9: `StaffPicker` component (search + browse list + invite-by-email)

**Files:**
- Create: `src/components/hackathon/manage/staff-picker.tsx`

- [ ] **Step 1: Implement the picker**

Create `src/components/hackathon/manage/staff-picker.tsx`:

```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";

import { api } from "@/trpc/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isLikelyEmail } from "@/server/hackathon/staff-invite";

export function StaffPicker({
  challengeId,
  role,
}: {
  challengeId: number;
  role: "organizer" | "judge";
}) {
  const utils = api.useUtils();
  const [search, setSearch] = useState("");

  const candidates = api.hackathon.listStaffCandidates.useQuery(
    { challengeId, role, search: search || undefined },
    { enabled: search.length > 0 },
  );

  const invalidate = () => {
    void utils.hackathon.listStaff.invalidate({ challengeId });
    void utils.hackathon.listStaffCandidates.invalidate({ challengeId, role });
  };

  const grant = api.hackathon.grantStaff.useMutation({
    onSuccess: () => {
      invalidate();
      setSearch("");
    },
    onError: (e) => toast.error(e.message),
  });

  const invite = api.hackathon.inviteStaffByEmail.useMutation({
    onSuccess: (res) => {
      invalidate();
      setSearch("");
      toast.success(
        res.kind === "granted" ? "Added to the team." : "Invite sent.",
      );
    },
    onError: (e) => toast.error(e.message),
  });

  const roleLabel = role === "organizer" ? "organizer" : "judge";
  const items = candidates.data?.items ?? [];
  const showInviteByEmail =
    isLikelyEmail(search) && items.length === 0 && !candidates.isFetching;

  return (
    <div className="mt-3 space-y-2">
      <Input
        placeholder={`Search members by name or email to add a ${roleLabel}…`}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {search.length > 0 && (
        <ul className="divide-y rounded-md border">
          {items.map((c) => (
            <li
              key={c.userId}
              className="flex items-center justify-between gap-2 px-3 py-2"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Avatar className="size-7">
                  <AvatarImage src={c.image ?? undefined} alt={c.displayName} />
                  <AvatarFallback>
                    {c.displayName.slice(0, 1).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {c.displayName}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {c.email}
                  </span>
                </span>
              </span>
              <Button
                size="sm"
                disabled={grant.isPending}
                onClick={() =>
                  grant.mutate({ challengeId, userId: c.userId, role })
                }
              >
                Add
              </Button>
            </li>
          ))}

          {showInviteByEmail && (
            <li className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="truncate text-sm">
                No member matches. Invite{" "}
                <span className="font-medium">{search.trim()}</span> by email.
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={invite.isPending}
                onClick={() =>
                  invite.mutate({ challengeId, email: search.trim(), role })
                }
              >
                Invite {roleLabel}
              </Button>
            </li>
          )}

          {!showInviteByEmail && items.length === 0 && !candidates.isFetching && (
            <li className="px-3 py-2 text-sm text-muted-foreground">
              No matches.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/hackathon/manage/staff-picker.tsx
git commit -m "feat(hackathon): StaffPicker search + invite-by-email control"
```

---

## Task 10: `StaffSection` + rewritten `ManageStaff`

**Files:**
- Create: `src/components/hackathon/manage/staff-section.tsx`
- Modify (rewrite): `src/components/hackathon/manage/manage-staff.tsx`

- [ ] **Step 1: Implement `StaffSection`**

Create `src/components/hackathon/manage/staff-section.tsx`:

```tsx
"use client";

import { toast } from "sonner";

import { api } from "@/trpc/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { StaffPicker } from "./staff-picker";

type StaffMember = {
  id: string;
  userId: string;
  displayName: string | null;
  email: string;
  image: string | null;
};
type PendingInvite = {
  id: string;
  email: string;
  role: "organizer" | "judge";
};

export function StaffSection({
  challengeId,
  role,
  title,
  members,
  pendingInvites,
}: {
  challengeId: number;
  role: "organizer" | "judge";
  title: string;
  members: StaffMember[];
  pendingInvites: PendingInvite[];
}) {
  const utils = api.useUtils();
  const invalidate = () =>
    void utils.hackathon.listStaff.invalidate({ challengeId });

  const revoke = api.hackathon.revokeStaff.useMutation({
    onSuccess: invalidate,
    onError: (e) => toast.error(e.message),
  });
  const revokeInvite = api.hackathon.revokeStaffInvite.useMutation({
    onSuccess: invalidate,
    onError: (e) => toast.error(e.message),
  });

  const roleInvites = pendingInvites.filter((i) => i.role === role);

  return (
    <section>
      <h3 className="font-medium">{title}</h3>

      <ul className="mt-2 divide-y rounded-md border">
        {members.length === 0 && roleInvites.length === 0 && (
          <li className="px-3 py-2 text-sm text-muted-foreground">
            None yet.
          </li>
        )}

        {members.map((m) => (
          <li
            key={m.id}
            className="flex items-center justify-between gap-2 px-3 py-2"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Avatar className="size-7">
                <AvatarImage src={m.image ?? undefined} alt={m.displayName ?? m.email} />
                <AvatarFallback>
                  {(m.displayName ?? m.email).slice(0, 1).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">
                  {m.displayName ?? m.email}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {m.email}
                </span>
              </span>
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="text-red-600"
              disabled={revoke.isPending}
              onClick={() =>
                revoke.mutate({ challengeId, userId: m.userId, role })
              }
            >
              Remove
            </Button>
          </li>
        ))}

        {roleInvites.map((inv) => (
          <li
            key={inv.id}
            className="flex items-center justify-between gap-2 px-3 py-2 opacity-70"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm">{inv.email}</span>
              <span className="block text-xs text-muted-foreground">
                Invited · pending
              </span>
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={revokeInvite.isPending}
              onClick={() => revokeInvite.mutate({ inviteId: inv.id })}
            >
              Cancel
            </Button>
          </li>
        ))}
      </ul>

      <StaffPicker challengeId={challengeId} role={role} />
    </section>
  );
}
```

- [ ] **Step 2: Rewrite `ManageStaff`**

Replace the entire contents of `src/components/hackathon/manage/manage-staff.tsx` with:

```tsx
"use client";

import { api } from "@/trpc/react";
import { StaffSection } from "./staff-section";

export function ManageStaff({
  challengeId,
  isAdmin,
}: {
  challengeId: number;
  isAdmin: boolean;
}) {
  const staff = api.hackathon.listStaff.useQuery({ challengeId });

  if (staff.isLoading || !staff.data) return null;

  return (
    <div className="space-y-6">
      {isAdmin && (
        <StaffSection
          challengeId={challengeId}
          role="organizer"
          title="Organizers"
          members={staff.data.organizers}
          pendingInvites={staff.data.pendingInvites}
        />
      )}
      <StaffSection
        challengeId={challengeId}
        role="judge"
        title="Judges"
        members={staff.data.judges}
        pendingInvites={staff.data.pendingInvites}
      />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no errors. (If `staff.data.organizers` items lack `displayName`/`email`/`image`, Task 3 was not completed correctly — fix there.)

- [ ] **Step 4: Lint**

Run: `pnpm lint`
Expected: no errors in the touched files.

- [ ] **Step 5: Commit**

```bash
git add src/components/hackathon/manage/staff-section.tsx src/components/hackathon/manage/manage-staff.tsx
git commit -m "feat(hackathon): rebuild ManageStaff with avatar rows + per-role sections"
```

---

## Task 11: Component tests

**Files:**
- Test: `src/components/hackathon/manage/staff-picker.test.tsx`
- Test: `src/components/hackathon/manage/staff-section.test.tsx`

- [ ] **Step 1: Write `StaffPicker` test**

Create `src/components/hackathon/manage/staff-picker.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StaffPicker } from "./staff-picker";

const { mockCandidates, mockUseUtils, mockGrant, mockInvite } = vi.hoisted(
  () => ({
    mockCandidates: vi.fn(),
    mockUseUtils: vi.fn(),
    mockGrant: vi.fn(),
    mockInvite: vi.fn(),
  }),
);

vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: mockUseUtils,
    hackathon: {
      listStaffCandidates: { useQuery: mockCandidates },
      listStaff: { invalidate: vi.fn() },
      grantStaff: { useMutation: mockGrant },
      inviteStaffByEmail: { useMutation: mockInvite },
    },
  },
}));

function setup() {
  mockUseUtils.mockReturnValue({
    hackathon: {
      listStaff: { invalidate: vi.fn() },
      listStaffCandidates: { invalidate: vi.fn() },
    },
  });
  mockGrant.mockReturnValue({ mutate: vi.fn(), isPending: false });
  mockInvite.mockReturnValue({ mutate: vi.fn(), isPending: false });
}

describe("StaffPicker", () => {
  it("renders matching candidates with email + Add", () => {
    setup();
    mockCandidates.mockReturnValue({
      isFetching: false,
      data: {
        items: [
          {
            userId: "m1",
            displayName: "Mara Member",
            email: "mara@example.com",
            image: null,
          },
        ],
      },
    });

    render(<StaffPicker challengeId={1} role="judge" />);
    fireEvent.change(screen.getByPlaceholderText(/search members/i), {
      target: { value: "mara" },
    });

    expect(screen.getByText("Mara Member")).toBeInTheDocument();
    expect(screen.getByText("mara@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });

  it("offers invite-by-email when the term is an email with no match", () => {
    setup();
    const inviteMutate = vi.fn();
    mockInvite.mockReturnValue({ mutate: inviteMutate, isPending: false });
    mockCandidates.mockReturnValue({
      isFetching: false,
      data: { items: [] },
    });

    render(<StaffPicker challengeId={1} role="judge" />);
    fireEvent.change(screen.getByPlaceholderText(/search members/i), {
      target: { value: "outsider@example.com" },
    });

    const inviteBtn = screen.getByRole("button", { name: /invite judge/i });
    fireEvent.click(inviteBtn);
    expect(inviteMutate).toHaveBeenCalledWith({
      challengeId: 1,
      email: "outsider@example.com",
      role: "judge",
    });
  });
});
```

- [ ] **Step 2: Run the picker test**

Run: `pnpm test src/components/hackathon/manage/staff-picker.test.tsx`
Expected: PASS.

- [ ] **Step 3: Write `StaffSection` test**

Create `src/components/hackathon/manage/staff-section.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StaffSection } from "./staff-section";

const { mockUseUtils, mockRevoke, mockRevokeInvite } = vi.hoisted(() => ({
  mockUseUtils: vi.fn(),
  mockRevoke: vi.fn(),
  mockRevokeInvite: vi.fn(),
}));

vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: mockUseUtils,
    hackathon: {
      listStaff: { invalidate: vi.fn() },
      revokeStaff: { useMutation: mockRevoke },
      revokeStaffInvite: { useMutation: mockRevokeInvite },
      // referenced by the nested StaffPicker:
      listStaffCandidates: { useQuery: () => ({ isFetching: false, data: undefined }) },
      grantStaff: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      inviteStaffByEmail: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
  },
}));

describe("StaffSection", () => {
  it("renders members (avatar/name/email + Remove) and pending invites (Cancel)", () => {
    mockUseUtils.mockReturnValue({
      hackathon: {
        listStaff: { invalidate: vi.fn() },
        listStaffCandidates: { invalidate: vi.fn() },
      },
    });
    const revokeMutate = vi.fn();
    mockRevoke.mockReturnValue({ mutate: revokeMutate, isPending: false });
    const cancelMutate = vi.fn();
    mockRevokeInvite.mockReturnValue({ mutate: cancelMutate, isPending: false });

    render(
      <StaffSection
        challengeId={1}
        role="judge"
        title="Judges"
        members={[
          {
            id: "s1",
            userId: "u1",
            displayName: "Judy Judge",
            email: "judy@example.com",
            image: null,
          },
        ]}
        pendingInvites={[
          { id: "inv1", email: "ext@example.com", role: "judge" },
        ]}
      />,
    );

    expect(screen.getByText("Judy Judge")).toBeInTheDocument();
    expect(screen.getByText("judy@example.com")).toBeInTheDocument();
    expect(screen.getByText("ext@example.com")).toBeInTheDocument();
    expect(screen.getByText(/invited · pending/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(revokeMutate).toHaveBeenCalledWith({
      challengeId: 1,
      userId: "u1",
      role: "judge",
    });

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(cancelMutate).toHaveBeenCalledWith({ inviteId: "inv1" });
  });
});
```

- [ ] **Step 4: Run the section test**

Run: `pnpm test src/components/hackathon/manage/staff-section.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/hackathon/manage/staff-picker.test.tsx src/components/hackathon/manage/staff-section.test.tsx
git commit -m "test(hackathon): cover StaffPicker and StaffSection"
```

---

## Task 12: Full verification

- [ ] **Step 1: Typecheck the whole project**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 3: Full test suite**

Run: `pnpm test`
Expected: all pass, including the new `staff-management`, `staff-invite`, `redeem-staff-invites`, `staff-picker`, and `staff-section` suites.

- [ ] **Step 4: Manual smoke (optional but recommended)**

Use the `/run` skill or `pnpm dev`, open a hackathon's Events → manage screen, and confirm:
- The Organizers/Judges lists render avatar + name + email.
- Typing a member name shows candidates with Add; adding removes them from the list and shows them as staff.
- Typing a non-member email shows "Invite … by email"; clicking it shows a toast and a pending-invite row with Cancel.

- [ ] **Step 5: Final commit (if any fixes were needed)**

```bash
git add -A
git commit -m "chore(hackathon): staff setup verification fixes"
```

---

## Self-review notes (verified during planning)

- **Spec coverage:** new table (Task 1), pending-invite display + enriched staff (Tasks 3, 10), browse list with hub-wide attendees branch (Task 4), email invite + existing-account shortcut (Tasks 5, 6), cancel invite (Task 7), signup-hook redemption (Task 8), picker/section UI (Tasks 9, 10), error handling via reused auth gates + non-fatal email (Tasks 6, 8), tests at every layer (Tasks 2-8, 11). All spec sections map to a task.
- **Type consistency:** `listStaff` returns `{ organizers, judges, pendingInvites }` where staff rows carry `id/userId/role/displayName/email/image` — consumed unchanged by `ManageStaff` → `StaffSection`. `listStaffCandidates` items carry `userId/displayName/email/image` — consumed by `StaffPicker`. `inviteStaffByEmail` returns `{ kind: "granted" | "invited" }` — matched in the picker's `onSuccess`. `grantStaffInternal` is the single grant body shared by `grantStaff` and the invite shortcut.
- **Import audit reminder:** before running each server task, confirm `hackathon.ts` imports `memberProfiles`, `hackathonStaffInvite`, `eventRegistrations` (from `@/server/db/schema`), `desc` (from `drizzle-orm`), and `boundHackathonEvent`, `normalizeEmail`/`inviteExpiry`, `sendHackathonStaffInvite`, `env`. Add any that are missing — they are called by the new code.
