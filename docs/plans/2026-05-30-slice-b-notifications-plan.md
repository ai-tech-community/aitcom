# Slice B — Notifications Infra Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Govern member-facing notification volume at the Hub level — one consolidated weekly digest email per member (a section per community), a community-admin broadcast channel bounded by a Hub-wide fair-shared ceiling, transactional event reminders that bypass the ceiling, and a single preference center — reusing the existing Resend / Vercel-cron / `notification` rails.

**Architecture:** Pure logic (`src/server/notifications/*.ts`, vitest, injected clock) + thin tRPC routers (`broadcast`, `notificationPrefs`) + thin cron route handlers (`/api/cron/hub-digest`, `/api/cron/event-reminders`). New Drizzle tables in the `app` schema. Hub-invariant constants + a `requireHubOperator` seam (full Hub-operator role/UI deferred to its own epic).

**Tech Stack:** Next.js App Router (RSC + client), tRPC v11, Drizzle ORM (Neon HTTP), Payload CMS (events collection + migrations), vitest, Resend, Vercel Cron, shadcn/ui, next-intl.

**GitHub:** Epic #55 (Slice B). Tasks below become `role:task` sub-issues. Design: `docs/plans/2026-05-30-slice-b-notifications-design.md`. Governing decisions: `CONTEXT.md`, `docs/adr/0013`, `0014`, `0015`.

---

## Background facts (verified during planning)

- **Resend** is wired in `src/server/email.ts` (`getResend()`, `FROM_EMAIL`, `escapeHtml()`); senders are plain async functions that early-`return` if `getResend()` is null. Email bodies are inline monospace HTML, English-only.
- **In-app notifications:** `notifications` table (`src/server/db/schema.ts:425`) — columns `id, userId, type, title, content, metadata(jsonb), readAt, communityId, createdAt`. Insert pattern: `await db.insert(notifications).values({ userId, type, title, content, metadata, communityId })`.
- **Cron:** route handlers under `src/app/api/cron/*/route.ts` with `export const runtime = "nodejs"; export const dynamic = "force-dynamic";`, auth-gated by `if (req.headers.get("authorization") !== \`Bearer ${process.env.CRON_SECRET}\`) return 401`. Registered in `vercel.json` `crons` array. Payload access via `getPayloadClient()` from `@/server/payload`; Drizzle via `db` from `@/server/db`.
- **`communityProcedure`** (`src/server/api/trpc.ts:261`) injects `ctx.community`, `ctx.membership`, `ctx.communityRole`. Admin gate idiom: `if (ctx.communityRole !== "owner" && ctx.communityRole !== "admin") throw new TRPCError({ code: "FORBIDDEN" })`.
- **Router registration:** import in `src/server/api/root.ts`, add to the `createTRPCRouter({ ... })` object.
- **Drizzle tables** use `appSchema.table("name", (d) => ({ ... }), (t) => [indexes])`. Id idiom: `d.varchar({ length: 255 }).notNull().primaryKey().$defaultFn(() => crypto.randomUUID())`. Imports `index`, `uniqueIndex`, `sql` already present at top of `schema.ts`. Existing exports referenced here: `user`, `communities`, `communityMemberships`, `eventRegistrations`.
- **Migrations:** files `src/migrations/<key>.ts` export `up({db})`/`down({db})` using `sql` from `@payloadcms/db-postgres`. Each is imported AND added to the array in `src/migrations/index.ts` (both the `import * as migration_<key>` line near the top and the `{ up, down, name }` object near the bottom). App tables live in the `"app"` Postgres schema (quote as `"app"."table"`).
- **Event registrations:** `eventRegistrations` (Drizzle) has `eventId` (integer → Payload `events`), `userId`, `status` (`registered|waitlisted|cancelled|attended|...`). Events are a Payload collection (`payload.find({ collection: "events" })`), integer `id`.
- **Member dashboard route:** `src/app/[locale]/dashboard/(member)/` — home for the member-global preference center.
- **`activity_event`** (instrumented in Slice A) carries `communityId`, `action`, `actorId`, `createdAt`. Relevant actions for digest section counts: `thread.create`, `event.create`, `community.joined`.

## File structure

**Pure core (`src/server/notifications/`)**
- `constants.ts` — Hub-invariant constants + `currentWindowKey()` / `currentPeriodKey()`.
- `ceiling.ts` (+ `ceiling.test.ts`) — `perCommunitySubCap`, `allowPromotional`.
- `digest.ts` (+ `digest.test.ts`) — `summarizeCommunitySection`, `buildHubDigest`.
- `prefs.ts` (+ `prefs.test.ts`) — `resolvePrefs`.
- `render.ts` — `renderHubDigestHtml` (HTML string builder; no test, pure string).

**Schema / migrations**
- `src/server/db/schema.ts` — add `notificationOptouts`, `broadcasts`, `broadcastDeliveries`, `digestSendLog`.
- `src/migrations/20260530c_notifications_infra.ts` (+ register in `index.ts`).

**Routers**
- `src/server/api/routers/notificationPrefs.ts`, `src/server/api/routers/broadcast.ts`; register both in `root.ts`.
- `src/server/api/trpc.ts` — add `requireHubOperator` helper.

**Email**
- `src/server/email.ts` — add `sendHubDigestEmail`, `sendBroadcastEmail`, `sendEventReminderEmail`.

**Cron**
- `src/app/api/cron/hub-digest/route.ts`, `src/app/api/cron/event-reminders/route.ts`; `vercel.json` (+2 crons).

**UI**
- `src/app/[locale]/dashboard/(member)/notifications/page.tsx` + `src/components/notifications/notification-prefs.tsx`.
- `src/components/communities/settings/broadcast-composer.tsx` + wire into the community settings sidebar/route.
- `messages/en.json`, `messages/nl.json` — UI strings (`notificationPrefs.*`, `broadcast.*`).

---

## Task 1: Hub-invariant constants + window/period keys

**Files:**
- Create: `src/server/notifications/constants.ts`
- Test: `src/server/notifications/constants.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/server/notifications/constants.test.ts
import { describe, it, expect } from "vitest";
import {
  BROADCAST_CEILING,
  CEILING_WINDOW_DAYS,
  EVENT_REMINDER_LEAD_HOURS,
  currentWindowKey,
  currentPeriodKey,
} from "./constants";

describe("notification constants", () => {
  it("are the Hub-invariant defaults", () => {
    expect(BROADCAST_CEILING).toBe(3);
    expect(CEILING_WINDOW_DAYS).toBe(7);
    expect(EVENT_REMINDER_LEAD_HOURS).toBe(24);
  });
});

describe("currentWindowKey / currentPeriodKey", () => {
  it("produce a stable ISO-week bucket for a given date", () => {
    const d = new Date("2026-05-30T12:00:00.000Z"); // ISO week 22 of 2026
    expect(currentWindowKey(d)).toBe("2026-W22");
    expect(currentPeriodKey(d)).toBe("2026-W22");
  });
  it("bucket two days in the same ISO week identically", () => {
    expect(currentWindowKey(new Date("2026-05-25T00:00:00Z"))).toBe(
      currentWindowKey(new Date("2026-05-29T23:59:59Z")),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/notifications/constants.test.ts`
Expected: FAIL — `Cannot find module './constants'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/server/notifications/constants.ts

/** Hub-invariant notification limits. These live in the Hub-invariant zone
 *  (ADR-0013) — never per-community admin settings. A future Hub-operator epic
 *  will make them operator-tunable; for now they are platform constants. */
export const BROADCAST_CEILING = 3; // promotional broadcast emails / member / window
export const CEILING_WINDOW_DAYS = 7;
export const DIGEST_CADENCE = "weekly" as const;
export const EVENT_REMINDER_LEAD_HOURS = 24;

/** ISO-week bucket key, e.g. "2026-W22". Used as the ceiling window key and the
 *  weekly digest period key (idempotency). Deterministic for a given instant. */
function isoWeekKey(now: Date): string {
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  // ISO 8601: week day Mon=1..Sun=7; shift to nearest Thursday.
  const dayNum = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function currentWindowKey(now: Date): string {
  return isoWeekKey(now);
}

export function currentPeriodKey(now: Date): string {
  return isoWeekKey(now);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/server/notifications/constants.test.ts`
Expected: PASS (4 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/server/notifications/constants.ts src/server/notifications/constants.test.ts
git commit -m "feat(notifications): hub-invariant constants + ISO-week keys (T1 / #55)"
```

---

## Task 2: `allowPromotional` ceiling + fair-share (pure)

**Files:**
- Create: `src/server/notifications/ceiling.ts`
- Test: `src/server/notifications/ceiling.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/server/notifications/ceiling.test.ts
import { describe, it, expect } from "vitest";
import { perCommunitySubCap, allowPromotional } from "./ceiling";

describe("perCommunitySubCap", () => {
  it("splits the ceiling evenly, floor, min 1", () => {
    expect(perCommunitySubCap(1, 3)).toBe(3); // single community gets the whole ceiling
    expect(perCommunitySubCap(2, 3)).toBe(1); // floor(3/2)=1
    expect(perCommunitySubCap(4, 3)).toBe(1); // floor(3/4)=0 -> min 1
  });
});

describe("allowPromotional", () => {
  const base = { ceiling: 3, nCommunities: 4, communityId: "c1" };

  it("allows a member with no sends this window", () => {
    expect(allowPromotional({ ...base, sendsByCommunity: {} })).toBe(true);
  });

  it("rejects once the member hit the global ceiling", () => {
    expect(
      allowPromotional({
        ...base,
        sendsByCommunity: { c1: 0, c2: 1, c3: 1, c4: 1 }, // total 3 == ceiling
      }),
    ).toBe(false);
  });

  it("rejects when THIS community already used its sub-cap, even with global room", () => {
    // 4 communities, ceiling 3 -> sub-cap 1. c1 already sent 1; global total only 1.
    expect(
      allowPromotional({ ...base, sendsByCommunity: { c1: 1 } }),
    ).toBe(false);
  });

  it("fair-shares: a fast community cannot exceed its slice while others are silent", () => {
    // c1 wants a 2nd send; sub-cap is 1 -> blocked regardless of c2..c4 silence
    expect(
      allowPromotional({ ...base, sendsByCommunity: { c1: 1, c2: 0 } }),
    ).toBe(false);
  });

  it("single-community member may receive up to the full ceiling from that community", () => {
    const solo = { ceiling: 3, nCommunities: 1, communityId: "c1" };
    expect(allowPromotional({ ...solo, sendsByCommunity: { c1: 2 } })).toBe(true);
    expect(allowPromotional({ ...solo, sendsByCommunity: { c1: 3 } })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/notifications/ceiling.test.ts`
Expected: FAIL — `Cannot find module './ceiling'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/server/notifications/ceiling.ts

/** Each community's slice of a member's promotional-broadcast budget for the
 *  window. floor(ceiling / N), min 1 — so no single community can monopolise a
 *  multi-community member's inbox (ADR-0014 fair-share). */
export function perCommunitySubCap(
  nCommunities: number,
  ceiling: number,
): number {
  return Math.max(1, Math.floor(ceiling / Math.max(1, nCommunities)));
}

/** Whether a promotional broadcast from `communityId` may email this member.
 *  `sendsByCommunity` is the member's promotional emails sent THIS window,
 *  keyed by communityId. Enforces the global ceiling and the per-community
 *  sub-cap. Transactional sends never call this (they are exempt). */
export function allowPromotional(opts: {
  sendsByCommunity: Record<string, number>;
  communityId: string;
  nCommunities: number;
  ceiling: number;
}): boolean {
  const { sendsByCommunity, communityId, nCommunities, ceiling } = opts;
  const total = Object.values(sendsByCommunity).reduce((a, b) => a + b, 0);
  if (total >= ceiling) return false; // global ceiling
  const subCap = perCommunitySubCap(nCommunities, ceiling);
  const thisCommunity = sendsByCommunity[communityId] ?? 0;
  return thisCommunity < subCap; // per-community sub-cap
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/server/notifications/ceiling.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/notifications/ceiling.ts src/server/notifications/ceiling.test.ts
git commit -m "feat(notifications): fair-shared promotional ceiling (T2 / #55)"
```

---

## Task 3: `summarizeCommunitySection` + `buildHubDigest` (pure)

**Files:**
- Create: `src/server/notifications/digest.ts`
- Test: `src/server/notifications/digest.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/server/notifications/digest.test.ts
import { describe, it, expect } from "vitest";
import {
  summarizeCommunitySection,
  buildHubDigest,
  type CommunitySection,
} from "./digest";

const section = (
  communityId: string,
  over: Partial<CommunitySection> = {},
): CommunitySection =>
  summarizeCommunitySection({
    communityId,
    communityName: `Community ${communityId}`,
    newThreads: 0,
    newEvents: 0,
    newMembers: 0,
    ritualItems: [],
    ...over,
  });

describe("summarizeCommunitySection", () => {
  it("marks a section with no activity as empty", () => {
    expect(section("c1").isEmpty).toBe(true);
  });
  it("marks a section with any activity as non-empty", () => {
    expect(section("c1", { newThreads: 2 }).isEmpty).toBe(false);
    expect(section("c1", { ritualItems: ["Intro thread"] }).isEmpty).toBe(false);
  });
});

describe("buildHubDigest", () => {
  it("drops empty sections", () => {
    const digest = buildHubDigest({
      userId: "u1",
      sections: [section("c1", { newThreads: 1 }), section("c2")],
      optedOutCommunityIds: new Set(),
    });
    expect(digest?.sections.map((s) => s.communityId)).toEqual(["c1"]);
  });

  it("drops opted-out sections", () => {
    const digest = buildHubDigest({
      userId: "u1",
      sections: [
        section("c1", { newThreads: 1 }),
        section("c2", { newThreads: 1 }),
      ],
      optedOutCommunityIds: new Set(["c2"]),
    });
    expect(digest?.sections.map((s) => s.communityId)).toEqual(["c1"]);
  });

  it("returns null when nothing survives (no email)", () => {
    expect(
      buildHubDigest({
        userId: "u1",
        sections: [section("c1"), section("c2")],
        optedOutCommunityIds: new Set(),
      }),
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/notifications/digest.test.ts`
Expected: FAIL — `Cannot find module './digest'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/server/notifications/digest.ts

export type CommunitySectionInput = {
  communityId: string;
  communityName: string;
  newThreads: number;
  newEvents: number;
  newMembers: number;
  /** Ritual / revival items — typed slot Slice C (Engage) fills. Empty in B. */
  ritualItems: string[];
};

export type CommunitySection = CommunitySectionInput & { isEmpty: boolean };

export function summarizeCommunitySection(
  input: CommunitySectionInput,
): CommunitySection {
  const isEmpty =
    input.newThreads === 0 &&
    input.newEvents === 0 &&
    input.newMembers === 0 &&
    input.ritualItems.length === 0;
  return { ...input, isEmpty };
}

export type HubDigest = { userId: string; sections: CommunitySection[] };

/** Assemble a member's consolidated digest: drop empty sections and sections
 *  the member opted out of. Returns null when nothing survives (suppress the
 *  whole email). */
export function buildHubDigest(opts: {
  userId: string;
  sections: CommunitySection[];
  optedOutCommunityIds: Set<string>;
}): HubDigest | null {
  const visible = opts.sections.filter(
    (s) => !s.isEmpty && !opts.optedOutCommunityIds.has(s.communityId),
  );
  if (visible.length === 0) return null;
  return { userId: opts.userId, sections: visible };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/server/notifications/digest.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/notifications/digest.ts src/server/notifications/digest.test.ts
git commit -m "feat(notifications): consolidated digest assembly (T3 / #55)"
```

---

## Task 4: `resolvePrefs` (pure)

**Files:**
- Create: `src/server/notifications/prefs.ts`
- Test: `src/server/notifications/prefs.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/server/notifications/prefs.test.ts
import { describe, it, expect } from "vitest";
import { resolvePrefs } from "./prefs";

describe("resolvePrefs", () => {
  it("defaults to fully opted-in when there are no opt-out rows", () => {
    const p = resolvePrefs([]);
    expect(p.globalDigestOptOut).toBe(false);
    expect(p.digestOptOutCommunityIds.size).toBe(0);
    expect(p.broadcastOptOutCommunityIds.size).toBe(0);
  });

  it("reads a global digest opt-out (communityId null)", () => {
    const p = resolvePrefs([{ communityId: null, category: "digest" }]);
    expect(p.globalDigestOptOut).toBe(true);
  });

  it("reads per-community digest and broadcast opt-outs", () => {
    const p = resolvePrefs([
      { communityId: "c1", category: "digest" },
      { communityId: "c2", category: "broadcast" },
    ]);
    expect(p.digestOptOutCommunityIds.has("c1")).toBe(true);
    expect(p.broadcastOptOutCommunityIds.has("c2")).toBe(true);
    expect(p.digestOptOutCommunityIds.has("c2")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/notifications/prefs.test.ts`
Expected: FAIL — `Cannot find module './prefs'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/server/notifications/prefs.ts

export type OptoutRow = {
  communityId: string | null; // null = global
  category: "digest" | "broadcast";
};

export type ResolvedPrefs = {
  globalDigestOptOut: boolean;
  digestOptOutCommunityIds: Set<string>;
  broadcastOptOutCommunityIds: Set<string>;
};

/** Fold sparse opt-OUT rows into resolved preferences. Absence of a row means
 *  opted in (digests default opt-in, ADR-0014). */
export function resolvePrefs(rows: OptoutRow[]): ResolvedPrefs {
  const resolved: ResolvedPrefs = {
    globalDigestOptOut: false,
    digestOptOutCommunityIds: new Set(),
    broadcastOptOutCommunityIds: new Set(),
  };
  for (const row of rows) {
    if (row.category === "digest" && row.communityId === null) {
      resolved.globalDigestOptOut = true;
    } else if (row.category === "digest" && row.communityId) {
      resolved.digestOptOutCommunityIds.add(row.communityId);
    } else if (row.category === "broadcast" && row.communityId) {
      resolved.broadcastOptOutCommunityIds.add(row.communityId);
    }
  }
  return resolved;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/server/notifications/prefs.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/notifications/prefs.ts src/server/notifications/prefs.test.ts
git commit -m "feat(notifications): preference resolver (T4 / #55)"
```

---

## Task 5: Schema + migration for the four new tables

**Files:**
- Modify: `src/server/db/schema.ts` (append after the `notificationsRelations` block, ~line 456)
- Create: `src/migrations/20260530c_notifications_infra.ts`
- Modify: `src/migrations/index.ts`

- [ ] **Step 1: Add the Drizzle tables** — append to `schema.ts`:

```ts
// --- Slice B: Notifications infra (digest prefs, broadcasts, ceiling ledger) ---

/** Sparse opt-OUT rows. Absence = opted in. communityId null = global digest
 *  opt-out. category: "digest" | "broadcast". (ADR-0014 preference center.) */
export const notificationOptouts = appSchema.table(
  "notification_optout",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    communityId: d.varchar("community_id", { length: 255 }),
    category: d.varchar({ length: 20 }).notNull().$type<"digest" | "broadcast">(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [index("notification_optout_user_idx").on(t.userId)],
);

/** A community-admin broadcast. class "promotional" is ceiling-limited;
 *  "transactional" is system-reserved (event reminders) and exempt. */
export const broadcasts = appSchema.table(
  "broadcast",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    communityId: d
      .varchar("community_id", { length: 255 })
      .notNull()
      .references(() => communities.id),
    authorId: d
      .varchar("author_id", { length: 255 })
      .notNull()
      .references(() => user.id),
    subject: d.varchar({ length: 255 }).notNull(),
    body: d.text().notNull(),
    class: d
      .varchar({ length: 20 })
      .notNull()
      .default("promotional")
      .$type<"promotional" | "transactional">(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    sentAt: d.timestamp({ withTimezone: true }),
  }),
  (t) => [index("broadcast_community_idx").on(t.communityId)],
);

/** Per-recipient delivery ledger. Ceiling source of truth (count promotional
 *  emailSent rows per (userId, windowKey)) AND dedupe for transactional event
 *  reminders (dedupeKey = "event:<eventId>", broadcastId null). */
export const broadcastDeliveries = appSchema.table(
  "broadcast_delivery",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    broadcastId: d
      .varchar("broadcast_id", { length: 255 })
      .references(() => broadcasts.id),
    userId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    communityId: d.varchar("community_id", { length: 255 }),
    class: d.varchar({ length: 20 }).notNull().$type<"promotional" | "transactional">(),
    emailSent: d.boolean("email_sent").notNull().default(false),
    windowKey: d.varchar("window_key", { length: 16 }).notNull(),
    dedupeKey: d.varchar("dedupe_key", { length: 255 }),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    index("broadcast_delivery_user_window_idx").on(t.userId, t.windowKey),
    index("broadcast_delivery_user_dedupe_idx").on(t.userId, t.dedupeKey),
  ],
);

/** Weekly digest idempotency: one row per (userId, periodKey). */
export const digestSendLog = appSchema.table(
  "digest_send_log",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    periodKey: d.varchar("period_key", { length: 16 }).notNull(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [uniqueIndex("digest_send_log_user_period_uidx").on(t.userId, t.periodKey)],
);
```

- [ ] **Step 2: Write the migration**

```ts
// src/migrations/20260530c_notifications_infra.ts
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."notification_optout" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "user_id" varchar(255) NOT NULL,
      "community_id" varchar(255),
      "category" varchar(20) NOT NULL,
      "created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "notification_optout_user_idx"
      ON "app"."notification_optout" USING btree ("user_id");

    CREATE TABLE IF NOT EXISTS "app"."broadcast" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "community_id" varchar(255) NOT NULL,
      "author_id" varchar(255) NOT NULL,
      "subject" varchar(255) NOT NULL,
      "body" text NOT NULL,
      "class" varchar(20) DEFAULT 'promotional' NOT NULL,
      "created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
      "sent_at" timestamptz
    );
    CREATE INDEX IF NOT EXISTS "broadcast_community_idx"
      ON "app"."broadcast" USING btree ("community_id");

    CREATE TABLE IF NOT EXISTS "app"."broadcast_delivery" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "broadcast_id" varchar(255),
      "user_id" varchar(255) NOT NULL,
      "community_id" varchar(255),
      "class" varchar(20) NOT NULL,
      "email_sent" boolean DEFAULT false NOT NULL,
      "window_key" varchar(16) NOT NULL,
      "dedupe_key" varchar(255),
      "created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "broadcast_delivery_user_window_idx"
      ON "app"."broadcast_delivery" USING btree ("user_id", "window_key");
    CREATE INDEX IF NOT EXISTS "broadcast_delivery_user_dedupe_idx"
      ON "app"."broadcast_delivery" USING btree ("user_id", "dedupe_key");

    CREATE TABLE IF NOT EXISTS "app"."digest_send_log" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "user_id" varchar(255) NOT NULL,
      "period_key" varchar(16) NOT NULL,
      "created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "digest_send_log_user_period_uidx"
      ON "app"."digest_send_log" USING btree ("user_id", "period_key");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "app"."digest_send_log";
    DROP TABLE IF EXISTS "app"."broadcast_delivery";
    DROP TABLE IF EXISTS "app"."broadcast";
    DROP TABLE IF EXISTS "app"."notification_optout";
  `);
}
```

- [ ] **Step 3: Register the migration in `src/migrations/index.ts`**

Add the import near the other imports (alphabetical-by-date is the convention; place after the `20260530b_...` import):

```ts
import * as migration_20260530c_notifications_infra from "./20260530c_notifications_infra";
```

Add the object as the LAST element of the exported array (after the `20260530b_...` entry):

```ts
  {
    up: migration_20260530c_notifications_infra.up,
    down: migration_20260530c_notifications_infra.down,
    name: "20260530c_notifications_infra",
  },
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: clean (no new errors). The migration runs via `pnpm db:migrate` in the deploy flow — do NOT run against prod here.

- [ ] **Step 5: Commit**

```bash
git add src/server/db/schema.ts src/migrations/20260530c_notifications_infra.ts src/migrations/index.ts
git commit -m "feat(notifications): schema + migration for prefs/broadcast/ledger (T5 / #55)"
```

---

## Task 6: `notificationPrefs` tRPC router

**Files:**
- Create: `src/server/api/routers/notificationPrefs.ts`
- Modify: `src/server/api/root.ts`

- [ ] **Step 1: Write the router**

```ts
// src/server/api/routers/notificationPrefs.ts
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { notificationOptouts } from "@/server/db/schema";
import { resolvePrefs, type OptoutRow } from "@/server/notifications/prefs";

export const notificationPrefsRouter = createTRPCRouter({
  /** All opt-out rows for the current user, plus the resolved view. */
  get: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        communityId: notificationOptouts.communityId,
        category: notificationOptouts.category,
      })
      .from(notificationOptouts)
      .where(eq(notificationOptouts.userId, ctx.session.user.id));

    const resolved = resolvePrefs(rows as OptoutRow[]);
    return {
      globalDigestOptOut: resolved.globalDigestOptOut,
      digestOptOutCommunityIds: [...resolved.digestOptOutCommunityIds],
      broadcastOptOutCommunityIds: [...resolved.broadcastOptOutCommunityIds],
    };
  }),

  /** Toggle one opt-out. optedOut=true inserts (if absent); false deletes. */
  setOptout: protectedProcedure
    .input(
      z.object({
        communityId: z.string().nullable(),
        category: z.enum(["digest", "broadcast"]),
        optedOut: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const match = and(
        eq(notificationOptouts.userId, userId),
        input.communityId === null
          ? isNull(notificationOptouts.communityId)
          : eq(notificationOptouts.communityId, input.communityId),
        eq(notificationOptouts.category, input.category),
      );

      if (input.optedOut) {
        const existing = await ctx.db
          .select({ id: notificationOptouts.id })
          .from(notificationOptouts)
          .where(match)
          .limit(1);
        if (existing.length === 0) {
          await ctx.db.insert(notificationOptouts).values({
            userId,
            communityId: input.communityId,
            category: input.category,
          });
        }
      } else {
        await ctx.db.delete(notificationOptouts).where(match);
      }
      return { ok: true };
    }),
});
```

- [ ] **Step 2: Register the router** in `src/server/api/root.ts`:

```ts
// import block
import { notificationPrefsRouter } from "@/server/api/routers/notificationPrefs";
// inside createTRPCRouter({ ... })
  notificationPrefs: notificationPrefsRouter,
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/server/api/routers/notificationPrefs.ts src/server/api/root.ts
git commit -m "feat(notifications): notificationPrefs router (T6 / #55)"
```

---

## Task 7: Preference center UI

**Files:**
- Create: `src/app/[locale]/dashboard/(member)/notifications/page.tsx`
- Create: `src/components/notifications/notification-prefs.tsx`
- Modify: `messages/en.json`, `messages/nl.json`

- [ ] **Step 1: Add i18n strings** — add a `notificationPrefs` block to `messages/en.json` (mirror nesting in `nl.json` with Dutch):

```json
"notificationPrefs": {
  "title": "Notifications",
  "description": "Choose what reaches your inbox. You can opt out of the weekly digest globally or per community, and stop a community's announcements.",
  "globalDigest": "Weekly digest email",
  "globalDigestHint": "One consolidated email with a section per community.",
  "perCommunity": "Per community",
  "digestColumn": "Digest section",
  "broadcastColumn": "Announcements",
  "saved": "Saved"
}
```

`nl.json` (same keys, Dutch values, e.g. `"title": "Meldingen"`).

- [ ] **Step 2: Build the prefs component**

```tsx
// src/components/notifications/notification-prefs.tsx
"use client";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Switch } from "@/components/ui/switch";

export function NotificationPrefs() {
  const t = useTranslations("notificationPrefs");
  const utils = api.useUtils();
  const prefs = api.notificationPrefs.get.useQuery();
  const communities = api.communities.getMyCommunities.useQuery();
  const setOptout = api.notificationPrefs.setOptout.useMutation({
    onSuccess: () => utils.notificationPrefs.get.invalidate(),
  });

  if (prefs.isLoading || communities.isLoading || !prefs.data) {
    return <div className="h-40 animate-pulse rounded-lg border" />;
  }
  const digestOut = new Set(prefs.data.digestOptOutCommunityIds);
  const bcastOut = new Set(prefs.data.broadcastOptOutCommunityIds);
  const myCommunities = (communities.data ?? []).filter(
    (c) => c.status === "active",
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div>
          <p className="text-sm font-medium">{t("globalDigest")}</p>
          <p className="text-muted-foreground text-xs">{t("globalDigestHint")}</p>
        </div>
        <Switch
          checked={!prefs.data.globalDigestOptOut}
          onCheckedChange={(on) =>
            setOptout.mutate({
              communityId: null,
              category: "digest",
              optedOut: !on,
            })
          }
        />
      </div>

      <div className="rounded-lg border">
        <div className="grid grid-cols-[1fr_auto_auto] gap-4 border-b p-4 text-xs font-medium text-zinc-500">
          <span>{t("perCommunity")}</span>
          <span>{t("digestColumn")}</span>
          <span>{t("broadcastColumn")}</span>
        </div>
        <div className="divide-y">
          {myCommunities.map((c) => (
            <div
              key={c.id}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-4 p-4"
            >
              <span className="text-sm font-medium">{c.name}</span>
              <Switch
                checked={!digestOut.has(c.id)}
                onCheckedChange={(on) =>
                  setOptout.mutate({
                    communityId: c.id,
                    category: "digest",
                    optedOut: !on,
                  })
                }
              />
              <Switch
                checked={!bcastOut.has(c.id)}
                onCheckedChange={(on) =>
                  setOptout.mutate({
                    communityId: c.id,
                    category: "broadcast",
                    optedOut: !on,
                  })
                }
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

> Verify `getMyCommunities` returns `{ id, name, slug, status }` (it is used the same way in the settings layout). Verify `@/components/ui/switch` exists; if the project uses a `Checkbox` instead, swap the component but keep the `checked = !optedOut` inversion.

- [ ] **Step 3: Add the page**

```tsx
// src/app/[locale]/dashboard/(member)/notifications/page.tsx
import { getTranslations } from "next-intl/server";
import { NotificationPrefs } from "@/components/notifications/notification-prefs";

export default async function NotificationsSettingsPage() {
  const t = await getTranslations("notificationPrefs");
  return (
    <div className="mx-auto max-w-2xl space-y-6 py-6">
      <div>
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("description")}</p>
      </div>
      <NotificationPrefs />
    </div>
  );
}
```

- [ ] **Step 4: Verify in app**

Run: `pnpm dev`, sign in, visit `/dashboard/notifications`. Toggle a per-community digest switch off → reload → it stays off (a `notification_optout` row persisted). Toggle on → row removed.

- [ ] **Step 5: Commit**

```bash
git add "src/app/[locale]/dashboard/(member)/notifications" src/components/notifications messages/
git commit -m "feat(notifications): member preference center UI (T7 / #55)"
```

---

## Task 8: Digest render + weekly cron

**Files:**
- Create: `src/server/notifications/render.ts`
- Modify: `src/server/email.ts` (add `sendHubDigestEmail`)
- Create: `src/app/api/cron/hub-digest/route.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Digest HTML renderer**

```ts
// src/server/notifications/render.ts
import type { HubDigest } from "./digest";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Render the consolidated digest as inline-HTML (English; per-member locale is
 *  deferred — no locale field exists yet). */
export function renderHubDigestHtml(digest: HubDigest): string {
  const sections = digest.sections
    .map((s) => {
      const lines: string[] = [];
      if (s.newThreads) lines.push(`${s.newThreads} new discussion(s)`);
      if (s.newEvents) lines.push(`${s.newEvents} new event(s)`);
      if (s.newMembers) lines.push(`${s.newMembers} new member(s)`);
      for (const item of s.ritualItems) lines.push(esc(item));
      return `
        <div style="margin: 20px 0; padding-bottom: 16px; border-bottom: 1px solid #eee;">
          <h3 style="font-size: 15px; margin: 0 0 8px;">${esc(s.communityName)}</h3>
          <ul style="margin: 0; padding-left: 18px; font-size: 14px; color: #333;">
            ${lines.map((l) => `<li>${l}</li>`).join("")}
          </ul>
        </div>`;
    })
    .join("");

  return `
    <div style="font-family: monospace; max-width: 600px; margin: 0 auto;">
      <h2 style="font-size: 18px;">Your weekly AIT digest</h2>
      <p style="font-size: 14px; color: #555;">Here's what happened across your communities this week.</p>
      ${sections}
      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
      <p style="font-size: 12px; color: #999;">
        AIT Community ·
        <a href="https://www.aitcommunity.org/en/dashboard/notifications" style="color:#999;">Manage notifications</a>
      </p>
    </div>`;
}
```

- [ ] **Step 2: Add the digest sender to `email.ts`** (append near the other senders):

```ts
/** Send the consolidated weekly Hub digest. */
export async function sendHubDigestEmail(to: string, html: string) {
  const resend = getResend();
  if (!resend) return false;
  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: "Your weekly AIT digest",
    html,
  });
  return true;
}
```

- [ ] **Step 3: Write the cron route**

```ts
// src/app/api/cron/hub-digest/route.ts
import { NextResponse } from "next/server";
import { and, eq, gte, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  communityMemberships,
  communities,
  activityEvents,
  digestSendLog,
  notificationOptouts,
  user,
} from "@/server/db/schema";
import {
  buildHubDigest,
  summarizeCommunitySection,
} from "@/server/notifications/digest";
import { resolvePrefs, type OptoutRow } from "@/server/notifications/prefs";
import { currentPeriodKey } from "@/server/notifications/constants";
import { renderHubDigestHtml } from "@/server/notifications/render";
import { sendHubDigestEmail } from "@/server/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const periodKey = currentPeriodKey(now);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  let sent = 0;

  // Per-community window counts, grouped by (community_id, action).
  const counts = await db
    .select({
      communityId: activityEvents.communityId,
      action: activityEvents.action,
      n: sql<number>`count(*)::int`,
    })
    .from(activityEvents)
    .where(gte(activityEvents.createdAt, weekAgo))
    .groupBy(activityEvents.communityId, activityEvents.action);

  const countOf = (communityId: string, action: string) =>
    counts.find((c) => c.communityId === communityId && c.action === action)?.n ?? 0;

  // All active members with their communities.
  const memberships = await db
    .select({
      userId: communityMemberships.userId,
      communityId: communityMemberships.communityId,
      communityName: communities.name,
      email: user.email,
    })
    .from(communityMemberships)
    .innerJoin(communities, eq(communityMemberships.communityId, communities.id))
    .innerJoin(user, eq(communityMemberships.userId, user.id))
    .where(eq(communityMemberships.status, "active"));

  const byUser = new Map<
    string,
    { email: string; rows: typeof memberships }
  >();
  for (const m of memberships) {
    const entry = byUser.get(m.userId) ?? { email: m.email, rows: [] };
    entry.rows.push(m);
    byUser.set(m.userId, entry);
  }

  for (const [userId, { email, rows }] of byUser) {
    // Idempotency: skip if already sent this period.
    const already = await db
      .select({ id: digestSendLog.id })
      .from(digestSendLog)
      .where(
        and(
          eq(digestSendLog.userId, userId),
          eq(digestSendLog.periodKey, periodKey),
        ),
      )
      .limit(1);
    if (already.length > 0) continue;

    const optoutRows = await db
      .select({
        communityId: notificationOptouts.communityId,
        category: notificationOptouts.category,
      })
      .from(notificationOptouts)
      .where(eq(notificationOptouts.userId, userId));
    const prefs = resolvePrefs(optoutRows as OptoutRow[]);
    if (prefs.globalDigestOptOut) continue;

    const sections = rows.map((r) =>
      summarizeCommunitySection({
        communityId: r.communityId,
        communityName: r.communityName,
        newThreads: countOf(r.communityId, "thread.create"),
        newEvents: countOf(r.communityId, "event.create"),
        newMembers: countOf(r.communityId, "community.joined"),
        ritualItems: [], // Slice C fills this
      }),
    );

    const digest = buildHubDigest({
      userId,
      sections,
      optedOutCommunityIds: prefs.digestOptOutCommunityIds,
    });
    if (!digest) continue;

    const ok = await sendHubDigestEmail(email, renderHubDigestHtml(digest));
    if (ok) {
      await db.insert(digestSendLog).values({ userId, periodKey });
      sent++;
    }
  }

  return NextResponse.json({ success: true, sent, periodKey });
}
```

> Confirm the Drizzle export name for the activity-events table — it is `activityEvents` (used in `src/server/api/routers/insights.ts`). Confirm `communities.name` exists (it is selected in the settings layout via `getMyCommunities`).

- [ ] **Step 4: Register the cron in `vercel.json`** — add to the `crons` array:

```json
{ "path": "/api/cron/hub-digest", "schedule": "0 14 * * 1" }
```

(Mondays 14:00 UTC — once weekly. The `currentPeriodKey` idempotency makes accidental re-runs safe.)

- [ ] **Step 5: Verify locally**

Run: `pnpm dev`, then in a second terminal:
`curl -s -H "authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/hub-digest`
Expected: JSON `{ success: true, sent: <n>, periodKey: "2026-W.." }`. With `RESEND_API_KEY` unset, `sendHubDigestEmail` returns false (no send, `sent: 0`) but the route must still 200. Re-running immediately returns the same/lower `sent` (idempotency rows block re-send).

- [ ] **Step 6: Commit**

```bash
git add src/server/notifications/render.ts src/server/email.ts src/app/api/cron/hub-digest vercel.json
git commit -m "feat(notifications): consolidated digest render + weekly cron (T8 / #55)"
```

---

## Task 9: `broadcast` tRPC router (in-app + ceiling-gated email)

**Files:**
- Modify: `src/server/email.ts` (add `sendBroadcastEmail`)
- Create: `src/server/api/routers/broadcast.ts`
- Modify: `src/server/api/root.ts`

- [ ] **Step 1: Add the broadcast email sender to `email.ts`**

```ts
/** Send a community broadcast announcement email. Returns whether it was sent. */
export async function sendBroadcastEmail(
  to: string,
  subject: string,
  body: string,
) {
  const resend = getResend();
  if (!resend) return false;
  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: escapeHtml(subject),
    html: `
      <div style="font-family: monospace; max-width: 600px; margin: 0 auto;">
        <p style="font-size: 14px; white-space: pre-wrap;">${escapeHtml(body)}</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="font-size: 12px; color: #999;">
          AIT Community ·
          <a href="https://www.aitcommunity.org/en/dashboard/notifications" style="color:#999;">Manage notifications</a>
        </p>
      </div>`,
  });
  return true;
}
```

- [ ] **Step 2: Write the router**

```ts
// src/server/api/routers/broadcast.ts
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, sql } from "drizzle-orm";

import { createTRPCRouter, communityProcedure } from "@/server/api/trpc";
import {
  communityMemberships,
  notificationOptouts,
  notifications,
  broadcasts,
  broadcastDeliveries,
  user,
} from "@/server/db/schema";
import { allowPromotional } from "@/server/notifications/ceiling";
import {
  BROADCAST_CEILING,
  currentWindowKey,
} from "@/server/notifications/constants";
import { sendBroadcastEmail } from "@/server/email";

export const broadcastRouter = createTRPCRouter({
  /** Compose and send a PROMOTIONAL broadcast to a community's active members.
   *  In-app notification is always created; email is ceiling-gated per member.
   *  Transactional class is system-reserved (event reminders) — not sendable here. */
  send: communityProcedure
    .input(
      z.object({
        slug: z.string(),
        subject: z.string().min(1).max(200),
        body: z.string().min(1).max(5000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.communityRole !== "owner" && ctx.communityRole !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const communityId = ctx.community.id;
      const now = new Date();
      const windowKey = currentWindowKey(now);

      const [broadcast] = await ctx.db
        .insert(broadcasts)
        .values({
          communityId,
          authorId: ctx.session.user.id,
          subject: input.subject,
          body: input.body,
          class: "promotional",
        })
        .returning({ id: broadcasts.id });

      // Active members of this community.
      const members = await ctx.db
        .select({
          userId: communityMemberships.userId,
          email: user.email,
        })
        .from(communityMemberships)
        .innerJoin(user, eq(communityMemberships.userId, user.id))
        .where(
          and(
            eq(communityMemberships.communityId, communityId),
            eq(communityMemberships.status, "active"),
          ),
        );
      const memberIds = members.map((m) => m.userId);
      if (memberIds.length === 0) return { broadcastId: broadcast!.id, emailed: 0 };

      // Members who opted out of THIS community's broadcasts.
      const optedOut = new Set(
        (
          await ctx.db
            .select({ userId: notificationOptouts.userId })
            .from(notificationOptouts)
            .where(
              and(
                inArray(notificationOptouts.userId, memberIds),
                eq(notificationOptouts.communityId, communityId),
                eq(notificationOptouts.category, "broadcast"),
              ),
            )
        ).map((r) => r.userId),
      );

      // Each member's total active-community count (fair-share denominator).
      const communityCounts = new Map<string, number>(
        (
          await ctx.db
            .select({
              userId: communityMemberships.userId,
              n: sql<number>`count(*)::int`,
            })
            .from(communityMemberships)
            .where(
              and(
                inArray(communityMemberships.userId, memberIds),
                eq(communityMemberships.status, "active"),
              ),
            )
            .groupBy(communityMemberships.userId)
        ).map((r) => [r.userId, r.n]),
      );

      // Each member's promotional emails already sent this window, per community.
      const priorSends = await ctx.db
        .select({
          userId: broadcastDeliveries.userId,
          communityId: broadcastDeliveries.communityId,
          n: sql<number>`count(*)::int`,
        })
        .from(broadcastDeliveries)
        .where(
          and(
            inArray(broadcastDeliveries.userId, memberIds),
            eq(broadcastDeliveries.windowKey, windowKey),
            eq(broadcastDeliveries.class, "promotional"),
            eq(broadcastDeliveries.emailSent, true),
          ),
        )
        .groupBy(broadcastDeliveries.userId, broadcastDeliveries.communityId);

      const sendsByUser = new Map<string, Record<string, number>>();
      for (const r of priorSends) {
        const m = sendsByUser.get(r.userId) ?? {};
        if (r.communityId) m[r.communityId] = r.n;
        sendsByUser.set(r.userId, m);
      }

      let emailed = 0;
      for (const m of members) {
        if (optedOut.has(m.userId)) continue;

        // In-app notification: always (pull, not ceiling-limited).
        await ctx.db.insert(notifications).values({
          userId: m.userId,
          type: "broadcast",
          title: input.subject,
          content: input.body,
          communityId,
          metadata: { broadcastId: broadcast!.id },
        });

        const emailAllowed = allowPromotional({
          sendsByCommunity: sendsByUser.get(m.userId) ?? {},
          communityId,
          nCommunities: communityCounts.get(m.userId) ?? 1,
          ceiling: BROADCAST_CEILING,
        });

        let emailSent = false;
        if (emailAllowed) {
          emailSent = await sendBroadcastEmail(m.email, input.subject, input.body);
          if (emailSent) emailed++;
        }
        await ctx.db.insert(broadcastDeliveries).values({
          broadcastId: broadcast!.id,
          userId: m.userId,
          communityId,
          class: "promotional",
          emailSent,
          windowKey,
        });
      }

      await ctx.db
        .update(broadcasts)
        .set({ sentAt: now })
        .where(eq(broadcasts.id, broadcast!.id));

      return { broadcastId: broadcast!.id, emailed };
    }),
});
```

> Note: per-member queries are batched (no N+1) — counts and prior-sends are single grouped queries over `memberIds`. The fan-out loop does one notification insert + at most one email + one ledger insert per member; acceptable for v1 community sizes.

- [ ] **Step 3: Register the router** in `src/server/api/root.ts`:

```ts
import { broadcastRouter } from "@/server/api/routers/broadcast";
// inside createTRPCRouter({ ... })
  broadcast: broadcastRouter,
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/server/email.ts src/server/api/routers/broadcast.ts src/server/api/root.ts
git commit -m "feat(notifications): broadcast sender + ceiling-gated email (T9 / #55)"
```

---

## Task 10: Broadcast composer UI + admin entry

**Files:**
- Create: `src/components/communities/settings/broadcast-composer.tsx`
- Create: `src/app/[locale]/communities/[slug]/settings/broadcast/page.tsx`
- Modify: `src/components/communities/settings/settings-sidebar.tsx` (add a "Broadcast" link)
- Modify: `messages/en.json`, `messages/nl.json` (add `broadcast.*`)

- [ ] **Step 1: Add i18n strings** — `broadcast` block in `messages/en.json` (+ Dutch in `nl.json`):

```json
"broadcast": {
  "title": "Send an announcement",
  "description": "Reach your community's members. Promotional announcements are subject to a Hub-wide weekly limit per member; event reminders to people who registered are always delivered.",
  "subject": "Subject",
  "body": "Message",
  "send": "Send announcement",
  "sent": "Sent — emailed {emailed} member(s); everyone sees it in-app.",
  "sending": "Sending…"
}
```

- [ ] **Step 2: Build the composer**

```tsx
// src/components/communities/settings/broadcast-composer.tsx
"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function BroadcastComposer({ slug }: { slug: string }) {
  const t = useTranslations("broadcast");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [result, setResult] = useState<string | null>(null);

  const send = api.broadcast.send.useMutation({
    onSuccess: (r) => {
      setResult(t("sent", { emailed: r.emailed }));
      setSubject("");
      setBody("");
    },
  });

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="text-muted-foreground mt-1 text-sm">{t("description")}</p>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">{t("subject")}</label>
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">{t("body")}</label>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          maxLength={5000}
        />
      </div>
      <Button
        disabled={send.isPending || !subject.trim() || !body.trim()}
        onClick={() => {
          setResult(null);
          send.mutate({ slug, subject, body });
        }}
      >
        {send.isPending ? t("sending") : t("send")}
      </Button>
      {result ? <p className="text-sm text-green-700">{result}</p> : null}
    </div>
  );
}
```

> Verify `@/components/ui/{button,input,textarea}` exist (shadcn). If `Textarea` is absent, use a native `<textarea className="...">`.

- [ ] **Step 3: Add the route** (the existing settings `layout.tsx` already gates to owner/admin):

```tsx
// src/app/[locale]/communities/[slug]/settings/broadcast/page.tsx
"use client";
import { use } from "react";
import { BroadcastComposer } from "@/components/communities/settings/broadcast-composer";

export default function BroadcastSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return <BroadcastComposer slug={slug} />;
}
```

- [ ] **Step 4: Add the sidebar link** — in `settings-sidebar.tsx`, add a nav entry pointing to `${base}/settings/broadcast` labelled from a new `communities.manage.broadcast` key (mirror an existing sidebar entry exactly; copy the `members` entry's structure and swap the href + label key). Add `"broadcast": "Announcements"` under `communities.manage` in `messages/en.json` / `nl.json`.

- [ ] **Step 5: Verify in app**

Run: `pnpm dev`. As a community admin, open `/communities/<slug>/settings/broadcast`, send a test announcement. Confirm: every active member gets an in-app `notification` row (`type: "broadcast"`); the success line reports how many were emailed; `broadcast` + `broadcast_delivery` rows exist. As a plain member, the route is access-denied (existing layout gate).

- [ ] **Step 6: Commit**

```bash
git add src/components/communities/settings/broadcast-composer.tsx "src/app/[locale]/communities/[slug]/settings/broadcast" src/components/communities/settings/settings-sidebar.tsx messages/
git commit -m "feat(notifications): broadcast composer UI + admin entry (T10 / #55)"
```

---

## Task 11: Event-reminder cron (transactional, ceiling-exempt)

**Files:**
- Modify: `src/server/email.ts` (add `sendEventReminderEmail`)
- Create: `src/app/api/cron/event-reminders/route.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Add the event-reminder sender to `email.ts`**

```ts
/** Send a transactional reminder to a member who registered for an event.
 *  Ceiling-EXEMPT (member opted in by registering). */
export async function sendEventReminderEmail(
  to: string,
  event: { title: string; whenText: string; slug: string },
) {
  const resend = getResend();
  if (!resend) return false;
  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `Reminder: ${event.title}`,
    html: `
      <div style="font-family: monospace; max-width: 600px; margin: 0 auto;">
        <h2 style="font-size: 18px;">See you soon</h2>
        <p style="font-size: 14px;">This is a reminder for <strong>${escapeHtml(event.title)}</strong>, ${escapeHtml(event.whenText)}.</p>
        <p style="margin-top: 24px;">
          <a href="https://www.aitcommunity.org/en/events/${encodeURIComponent(event.slug)}" style="color:#000;font-weight:bold;">View event details →</a>
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="font-size: 12px; color: #999;">AIT Community</p>
      </div>`,
  });
  return true;
}
```

- [ ] **Step 2: Write the cron route**

```ts
// src/app/api/cron/event-reminders/route.ts
import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/server/db";
import { getPayloadClient } from "@/server/payload";
import {
  eventRegistrations,
  broadcastDeliveries,
  notifications,
  user,
} from "@/server/db/schema";
import { sendEventReminderEmail } from "@/server/email";
import {
  EVENT_REMINDER_LEAD_HOURS,
  currentWindowKey,
} from "@/server/notifications/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const windowKey = currentWindowKey(now);
  const horizon = new Date(now.getTime() + EVENT_REMINDER_LEAD_HOURS * 3600 * 1000);
  let reminded = 0;

  const payload = await getPayloadClient();
  // Published events whose start is between now and the reminder horizon.
  const { docs: events } = await payload.find({
    collection: "events",
    where: {
      and: [
        { startDate: { greater_than: now.toISOString() } },
        { startDate: { less_than: horizon.toISOString() } },
      ],
    },
    limit: 200,
    depth: 0,
  });

  for (const event of events) {
    const dedupeKey = `event:${event.id}`;
    const regs = await db
      .select({ userId: eventRegistrations.userId, email: user.email })
      .from(eventRegistrations)
      .innerJoin(user, eq(eventRegistrations.userId, user.id))
      .where(
        and(
          eq(eventRegistrations.eventId, event.id as number),
          inArray(eventRegistrations.status, ["registered", "waitlisted"]),
        ),
      );

    for (const reg of regs) {
      // Dedupe: already reminded for this event?
      const already = await db
        .select({ id: broadcastDeliveries.id })
        .from(broadcastDeliveries)
        .where(
          and(
            eq(broadcastDeliveries.userId, reg.userId),
            eq(broadcastDeliveries.dedupeKey, dedupeKey),
          ),
        )
        .limit(1);
      if (already.length > 0) continue;

      const title = String(event.title ?? "your event");
      const whenText = new Date(String(event.startDate)).toUTCString();

      // In-app (always) + transactional email (ceiling-EXEMPT).
      await db.insert(notifications).values({
        userId: reg.userId,
        type: "event_reminder",
        title: `Reminder: ${title}`,
        content: `${title} starts ${whenText}.`,
        metadata: { eventId: event.id },
      });
      const emailSent = await sendEventReminderEmail(reg.email, {
        title,
        whenText,
        slug: String(event.slug ?? ""),
      });
      await db.insert(broadcastDeliveries).values({
        userId: reg.userId,
        class: "transactional",
        emailSent,
        windowKey,
        dedupeKey,
      });
      reminded++;
    }
  }

  return NextResponse.json({ success: true, reminded, windowKey });
}
```

> Confirm the Payload `events` field names for start time and slug. The plan uses `startDate` and `slug`; if the collection uses `date`/`startsAt`, adjust the `where` filter and the read accordingly (grep `src/collections` or `src/payload.config.ts` for the events collection field config). `event.id` is a number (Payload), matching `eventRegistrations.eventId` (integer).

- [ ] **Step 3: Register the cron in `vercel.json`** — add to `crons`:

```json
{ "path": "/api/cron/event-reminders", "schedule": "0 * * * *" }
```

(Hourly — events starting within the next `EVENT_REMINDER_LEAD_HOURS`; the `dedupeKey` guarantees one reminder per (member, event).)

- [ ] **Step 4: Verify locally**

Run: `pnpm dev`. Seed/ensure an event starts within 24h with a `registered` registration, then:
`curl -s -H "authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/event-reminders`
Expected: `{ success: true, reminded: >=1, windowKey }`, an `event_reminder` notification row, and a `broadcast_delivery` row with `class: "transactional"` and the `dedupeKey`. Re-run immediately → `reminded: 0` (deduped). This proves the exemption path (no ceiling check on the transactional branch).

- [ ] **Step 5: Commit**

```bash
git add src/server/email.ts src/app/api/cron/event-reminders vercel.json
git commit -m "feat(notifications): transactional event-reminder cron (T11 / #55)"
```

---

## Task 12: `requireHubOperator` seam + constants read

**Files:**
- Modify: `src/server/api/trpc.ts` (add `requireHubOperator`)
- Create: `src/server/api/routers/hubOperator.ts`
- Modify: `src/server/api/root.ts`

This lays the Hub-operator seam (ADR-0013 Hub-invariant zone) so a later epic can make the constants tunable. It ships a single gated read of the current ceiling/cadence — no mutation, no UI.

- [ ] **Step 1: Add the gate helper to `trpc.ts`** (near `requireOwner`, ~line 203):

```ts
import { communities, communityMemberships } from "@/server/db/schema"; // ensure imported

/** The root Hub community slug (the "ait" row every user belongs to). */
export const HUB_SLUG = "ait";

/** Throws unless the caller is owner/admin of the root Hub community.
 *  Seam for the future Hub-operator role/settings epic. */
export async function requireHubOperator(ctx: {
  db: typeof import("@/server/db")["db"];
  session: { user: { id: string } } | null;
}): Promise<void> {
  if (!ctx.session?.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  const hub = await ctx.db.query.communities.findFirst({
    where: eq(communities.slug, HUB_SLUG),
  });
  if (!hub) throw new TRPCError({ code: "FORBIDDEN" });
  const membership = await ctx.db.query.communityMemberships.findFirst({
    where: and(
      eq(communityMemberships.communityId, hub.id),
      eq(communityMemberships.userId, ctx.session.user.id),
    ),
  });
  const role = membership?.status === "active" ? membership.role : null;
  if (role !== "owner" && role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
}
```

> `eq`/`and` are already imported in `trpc.ts` (used by `communityAuth`). Add `communities`/`communityMemberships` to the existing schema import if not present.

- [ ] **Step 2: Write the gated constants-read router**

```ts
// src/server/api/routers/hubOperator.ts
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { requireHubOperator } from "@/server/api/trpc";
import {
  BROADCAST_CEILING,
  CEILING_WINDOW_DAYS,
  DIGEST_CADENCE,
} from "@/server/notifications/constants";

export const hubOperatorRouter = createTRPCRouter({
  /** Read the Hub-invariant notification limits. Hub-operator only.
   *  Mutation/tuning UI is deferred to the dedicated Hub-operator epic. */
  notificationLimits: protectedProcedure.query(async ({ ctx }) => {
    await requireHubOperator(ctx);
    return {
      broadcastCeiling: BROADCAST_CEILING,
      ceilingWindowDays: CEILING_WINDOW_DAYS,
      digestCadence: DIGEST_CADENCE,
      tunable: false, // becomes true when the Hub-operator settings epic lands
    };
  }),
});
```

- [ ] **Step 3: Register the router** in `src/server/api/root.ts`:

```ts
import { hubOperatorRouter } from "@/server/api/routers/hubOperator";
// inside createTRPCRouter({ ... })
  hubOperator: hubOperatorRouter,
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/server/api/trpc.ts src/server/api/routers/hubOperator.ts src/server/api/root.ts
git commit -m "feat(notifications): requireHubOperator seam + limits read (T12 / #55)"
```

---

## Task 13: Final verification + cleanup

**Files:** none (verification only)

- [ ] **Step 1: Full check**

Run: `pnpm check` (lint + typecheck) → clean. Then `pnpm vitest run src/server/notifications` → all pure-function suites pass (constants, ceiling, digest, prefs).

- [ ] **Step 2: End-to-end smoke (manual)**

`pnpm dev`, then with `CRON_SECRET` set:
1. `/dashboard/notifications` — toggle a community's digest + broadcast off, confirm persistence.
2. Send a broadcast from `/communities/<slug>/settings/broadcast` — opted-out member gets neither in-app nor email; others get in-app + (≤ceiling) email.
3. `curl` the `hub-digest` cron — opted-out sections are absent from the assembled digest; idempotent on re-run.
4. `curl` the `event-reminders` cron — RSVP'd member reminded once (deduped on re-run), exempt from the ceiling.

- [ ] **Step 3: Commit (if any lint fixups)**

```bash
git add -A
git commit -m "chore(notifications): final lint/typecheck pass (T13 / #55)" || echo "nothing to commit"
```

---

## Self-review notes

- **Spec coverage:** preference center (T6/T7), consolidated digest pipeline (T3/T8), broadcast sender (T9/T10), Hub-wide fair-shared ceiling (T2/T9), transactional event consumer (T11), Hub-operator seam + constants (T1/T12). All ADR-0014 mechanisms implemented; every CONTEXT.md term in scope (`hub-digest`, `community-digest`, `broadcast`, `notification-ceiling`) is realised.
- **Type consistency:** `OptoutRow`/`resolvePrefs` (T4) consumed unchanged in T6 + T8. `CommunitySection`/`buildHubDigest` (T3) consumed in T8. `allowPromotional` (T2) consumed in T9 with the same `{ sendsByCommunity, communityId, nCommunities, ceiling }` shape. `currentWindowKey`/`currentPeriodKey` (T1) used in T8/T9/T11. `broadcastDeliveries` columns (T5) match every insert/select in T9/T11.
- **Ceiling semantics:** in-app notification is never ceiling-limited (pull); only promotional *email* is gated; transactional (event) email bypasses `allowPromotional` entirely (T11 never calls it). Over-budget promotional → ledger row with `emailSent: false`, in-app still present — exactly the "drop the email, protect the inbox" decision.
- **Known limitations (surface in epic #55):** digest section content is derived from `activity_event` counts only (rituals/revival come from Slice C via the empty `ritualItems` slot); email bodies are English (no per-member locale field exists); `notification_optout` global rows rely on the router's existence-check rather than a partial unique index (Postgres treats NULL `community_id` as distinct) — acceptable because `setOptout` is idempotent.
- **Deferred (not this slice):** full Hub-operator role + tunable settings UI (separate epic, T12 is only the seam); in-app notification bell UI (pre-existing deferred work); agent-drafted broadcasts (Slice F wires `agent_draft`); digest content backfill (forward-only, like Slice A).
```
