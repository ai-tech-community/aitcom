# Community Spaces Plan 2b — Lobby + Membership Flows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Community Spaces membership loop visible and complete — real per-user room unread counts, in-app request/approve notifications, a deepened per-room Members approvals panel, and a Town Square rooms-directory lobby.

**Architecture:** All four deliverables ride existing seams. One new nullable column (`spaceMemberships.lastReadAt`) plus a migration; everything else is server procedures, two small pure/testable helper modules, two UI surfaces, and i18n. Notifications reuse the existing `notification` table + generic notification panel (deep-link via `metadata.reviewPath`). No new infra; realtime (ADR-0025 SSE) is untouched.

**Tech Stack:** Next.js App Router (RSC + client components), tRPC v11, Drizzle ORM (Postgres, `app` schema), Payload-runner migrations (`pnpm db:apply`), next-intl (en/nl), Vitest (pure unit + DB-gated integration), Tailwind + shadcn-style `@/components/ui/*`.

**Spec:** `docs/superpowers/specs/2026-06-22-community-spaces-plan-2b-lobby-membership-design.md`

**Conventions for every task:**
- Branch off `main` first (a worktree may already exist if set up via `superpowers:using-git-worktrees`). Do NOT `git checkout`/`switch` inside subagents.
- After code changes run `pnpm typecheck` and `pnpm lint` before committing.
- Pure unit tests run with `pnpm test <file>`. DB-gated integration tests run with `RUN_DB_TESTS=1` and a **local** Postgres `DATABASE_URL`; without that they `describe.skipIf` out (skipped, not failed) — note this in those tasks.
- Commit after each task with the message shown.

---

## File Structure

**Create:**
- `src/migrations/20260622b_space_membership_read_marker.ts` — additive `last_read_at` column migration.
- `src/server/communities/room-notifications.ts` — pure helper: notification recipient dedupe/exclude.
- `src/server/communities/room-notifications.test.ts` — unit tests for the above.
- `src/server/communities/room-unread.ts` — `countRoomUnread(db, conversationId, userId, lastReadAt)` query helper (the one tested seam for room unread).
- `src/components/communities/rooms/community-rooms-directory.tsx` — Town Square lobby directory (public cards + locked private teasers).

**Modify:**
- `src/server/db/schema.ts:3334` — add `lastReadAt` to `spaceMemberships`.
- `src/migrations/index.ts` — register the new migration (import + array entry).
- `src/server/api/routers/inbox.ts` — `getMessages` space `lastReadAt` write; `listConversations` room `lastReadAt` select + `countRoomUnread` (remove the `unreadCount = 0` short-circuit).
- `src/server/api/routers/spaces.ts` — notifications in `requestAccess`/`approveMember`; new `denyMember`; `listRooms` `memberCount` + scoped membership fetch; new imports.
- `src/components/communities/rooms/room-members-panel.tsx` — Deny button + `denyMember` mutation; invite labels.
- `src/app/[locale]/communities/[slug]/_overview-client.tsx` — render the directory above the feed for members.
- `src/server/api/routers/spaces.integration.test.ts` — DB-gated tests: `countRoomUnread`, `denyMember`, `listRooms.memberCount`.
- `messages/en.json` + `messages/nl.json` — new `communities.rooms.*` keys.

---

## Task 1: Read-marker column + migration

**Files:**
- Modify: `src/server/db/schema.ts:3334`
- Create: `src/migrations/20260622b_space_membership_read_marker.ts`
- Modify: `src/migrations/index.ts`

- [ ] **Step 1: Add the column to the Drizzle schema**

In `src/server/db/schema.ts`, inside the `spaceMemberships` table columns, add `lastReadAt` right after `updatedAt` (line ~3334):

```ts
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
    // Per-user room read marker (Plan 2b) — newest message the user has seen in
    // this room's conversation. Null = never opened (all messages unread).
    lastReadAt: d.timestamp({ withTimezone: true }),
```

- [ ] **Step 2: Write the migration**

Create `src/migrations/20260622b_space_membership_read_marker.ts`:

```ts
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Community Spaces Plan 2b — per-user room read marker. Adds a nullable
 * `last_read_at` to space_membership so room unread counts are real (replacing
 * the interim unreadCount=0). Additive + idempotent; applied via `pnpm db:apply`.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."space_membership" ADD COLUMN IF NOT EXISTS "last_read_at" timestamptz;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."space_membership" DROP COLUMN IF EXISTS "last_read_at";
  `);
}
```

- [ ] **Step 3: Register the migration**

In `src/migrations/index.ts`, add the import after the `20260622a_spaces_rooms` import (line 76):

```ts
import * as migration_20260622b_space_membership_read_marker from "./20260622b_space_membership_read_marker";
```

And add the array entry after the `20260622a_spaces_rooms` entry (after line 458):

```ts
  {
    up: migration_20260622b_space_membership_read_marker.up,
    down: migration_20260622b_space_membership_read_marker.down,
    name: "20260622b_space_membership_read_marker",
  },
```

- [ ] **Step 4: Apply the migration and typecheck**

Run: `pnpm db:apply`
Expected: applies `20260622b_space_membership_read_marker` with no error (idempotent — safe to re-run).

Run: `pnpm typecheck`
Expected: passes (the new column is now part of the inferred `spaceMemberships` type — no Payload type regen needed; this is a Drizzle app table, not a Payload collection).

- [ ] **Step 5: Commit**

```bash
git add src/server/db/schema.ts src/migrations/20260622b_space_membership_read_marker.ts src/migrations/index.ts
git commit -m "feat(spaces): add spaceMemberships.lastReadAt read marker + migration"
```

---

## Task 2: Notification recipients pure helper (TDD)

**Files:**
- Create: `src/server/communities/room-notifications.ts`
- Test: `src/server/communities/room-notifications.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/server/communities/room-notifications.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { roomAccessRequestRecipients } from "./room-notifications";

describe("roomAccessRequestRecipients", () => {
  it("dedupes admin ids preserving first-seen order", () => {
    expect(roomAccessRequestRecipients(["a", "a", "b"], "z")).toEqual(["a", "b"]);
  });

  it("excludes the requester", () => {
    expect(roomAccessRequestRecipients(["a", "b"], "a")).toEqual(["b"]);
  });

  it("returns empty when there are no admins", () => {
    expect(roomAccessRequestRecipients([], "z")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/server/communities/room-notifications.test.ts`
Expected: FAIL — cannot resolve `./room-notifications` / `roomAccessRequestRecipients is not a function`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/server/communities/room-notifications.ts`:

```ts
/**
 * Pure helpers for room membership notifications (Plan 2b). Side-effect free so
 * the recipient/dedupe logic is unit-testable without a database.
 */

/**
 * Recipients for a `room_access_request` notification: the community owners/
 * admins who can act on it (approve/deny), deduped and excluding the requester.
 */
export function roomAccessRequestRecipients(
  adminUserIds: string[],
  requesterId: string,
): string[] {
  return [...new Set(adminUserIds)].filter((id) => id !== requesterId);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/server/communities/room-notifications.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/communities/room-notifications.ts src/server/communities/room-notifications.test.ts
git commit -m "feat(spaces): pure roomAccessRequestRecipients helper + tests"
```

---

## Task 3: Room unread helper (`countRoomUnread`) + DB-gated test

**Files:**
- Create: `src/server/communities/room-unread.ts`
- Test: `src/server/api/routers/spaces.integration.test.ts` (add to the existing `rooms [DB integration]` describe)

- [ ] **Step 1: Write the helper**

Create `src/server/communities/room-unread.ts`:

```ts
import { and, eq, ne, or, sql } from "drizzle-orm";
import type { db as Db } from "@/server/db";
import { messages } from "@/server/db/schema";

/**
 * Count unread messages in a room conversation for a viewer: messages created
 * after `lastReadAt` (all of them when `lastReadAt` is null / never opened) that
 * the viewer didn't author as a human. Mirrors DM unread semantics so room
 * badges behave identically to direct-message badges.
 */
export async function countRoomUnread(
  database: typeof Db,
  conversationId: string,
  userId: string,
  lastReadAt: Date | null,
): Promise<number> {
  const [row] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        lastReadAt ? sql`${messages.createdAt} > ${lastReadAt}` : sql`true`,
        or(ne(messages.senderId, userId), ne(messages.senderType, "human")),
      ),
    );
  return row?.count ?? 0;
}
```

- [ ] **Step 2: Add a DB-gated integration test**

In `src/server/api/routers/spaces.integration.test.ts`, inside the `describe.skipIf(!RUN_DB)("rooms [DB integration]", ...)` block (after the existing `beforeEach`/`afterEach`), add a test. It creates the room conversation, inserts two messages from a different sender, then asserts `countRoomUnread` for the three lastReadAt cases:

```ts
  it("countRoomUnread honors lastReadAt and excludes the viewer's own human messages", async () => {
    const { db, schema, getOrCreateRoomConversation } = m;
    const { eq } = await import("drizzle-orm");
    const { countRoomUnread } = await import("@/server/communities/room-unread");

    // A second member who posts in the room.
    const otherId = `rm-other-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    await db.insert(schema.user).values({
      id: otherId,
      email: `${otherId}@example.test`,
      name: "Other Member",
    });

    // getOrCreateRoomConversation returns the conversation id. If your local
    // helper returns a row instead, use `.id` here.
    const conversationId = await getOrCreateRoomConversation(db, roomSpaceId);

    // Explicit timestamps so the before/after assertions are deterministic
    // (without these both rows default to "now" and the math breaks).
    const t1 = new Date(Date.now() - 60_000);
    const t2 = new Date(Date.now() - 30_000);
    await db.insert(schema.messages).values([
      { conversationId, senderId: otherId, senderType: "human", content: "first", createdAt: t1 },
      { conversationId, senderId: otherId, senderType: "human", content: "second", createdAt: t2 },
    ]);

    // Never read → both unread.
    expect(await countRoomUnread(db, conversationId, userId, null)).toBe(2);
    // Read at t1 → only the t2 message is unread.
    expect(await countRoomUnread(db, conversationId, userId, t1)).toBe(1);
    // Read after the latest → zero unread.
    expect(await countRoomUnread(db, conversationId, userId, new Date())).toBe(0);
    // The viewer's own human message does not count as unread.
    await db.insert(schema.messages).values({
      conversationId,
      senderId: userId,
      senderType: "human",
      content: "mine",
      createdAt: new Date(),
    });
    expect(
      await countRoomUnread(db, conversationId, userId, new Date(Date.now() - 1_000)),
    ).toBe(0);

    await db.delete(schema.messages).where(eq(schema.messages.conversationId, conversationId));
    await db.delete(schema.user).where(eq(schema.user.id, otherId));
  });
```

- [ ] **Step 3: Run the test**

Run: `RUN_DB_TESTS=1 pnpm test src/server/api/routers/spaces.integration.test.ts`
Expected (local DB configured): PASS, including the new `countRoomUnread` test.
Expected (no local DB): the suite is `skipIf`-skipped — run `pnpm typecheck` instead to confirm the helper + test compile.

- [ ] **Step 4: Typecheck + commit**

Run: `pnpm typecheck && pnpm lint`
Expected: passes.

```bash
git add src/server/communities/room-unread.ts src/server/api/routers/spaces.integration.test.ts
git commit -m "feat(spaces): countRoomUnread helper + DB-gated unread test"
```

---

## Task 4: `getMessages` writes the room read marker

**Files:**
- Modify: `src/server/api/routers/inbox.ts:435-447`

- [ ] **Step 1: Add the space `lastReadAt` write**

In `getMessages`, the existing fire-and-forget updates `conversationParticipants` (a no-op for space conversations, which have no participant rows). Add a parallel write to `spaceMemberships` for space conversations. Replace the existing block at lines 435–447:

```ts
      // Fire-and-forget: update lastReadAt
      ctx.db
        .update(conversationParticipants)
        .set({ lastReadAt: new Date() })
        .where(
          and(
            eq(conversationParticipants.conversationId, input.conversationId),
            eq(conversationParticipants.userId, userId),
          ),
        )
        .catch((err: unknown) => {
          console.error("[inbox] update failed:", err);
        });
```

with:

```ts
      // Fire-and-forget: update lastReadAt. DM/agent conversations track it on
      // conversationParticipants; space (room) conversations track it on the
      // caller's spaceMembership (rooms have no participant rows).
      if (conv.type === "space" && conv.spaceId) {
        ctx.db
          .update(spaceMemberships)
          .set({ lastReadAt: new Date() })
          .where(
            and(
              eq(spaceMemberships.spaceId, conv.spaceId),
              eq(spaceMemberships.userId, userId),
            ),
          )
          .catch((err: unknown) => {
            console.error("[inbox] space lastReadAt update failed:", err);
          });
      } else {
        ctx.db
          .update(conversationParticipants)
          .set({ lastReadAt: new Date() })
          .where(
            and(
              eq(conversationParticipants.conversationId, input.conversationId),
              eq(conversationParticipants.userId, userId),
            ),
          )
          .catch((err: unknown) => {
            console.error("[inbox] update failed:", err);
          });
      }
```

(`spaceMemberships` is already imported in `inbox.ts` — it is used by `listConversations`.)

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/server/api/routers/inbox.ts
git commit -m "feat(spaces): getMessages updates spaceMemberships.lastReadAt for rooms"
```

---

## Task 5: `listConversations` uses the real room read marker

**Files:**
- Modify: `src/server/api/routers/inbox.ts:156-199` (room rows select/map) and `:296-300` (unread short-circuit)

- [ ] **Step 1: Select the membership `lastReadAt` for room rows**

In the `roomRows` query (starts line 156), add `lastReadAt` to the select object (after the `memberCount` sql, before `.from`):

```ts
            memberCount: sql<number>`(SELECT COUNT(*)::int FROM app.space_membership WHERE space_id = ${conversations.spaceId} AND status = 'active')`,
            lastReadAt: spaceMemberships.lastReadAt,
```

Then in the `.map((r) => ({ ... }))` that builds each `ConvRow` (line 185), change the hard-coded `lastReadAt: null,` to:

```ts
        lastReadAt: r.lastReadAt,
```

- [ ] **Step 2: Remove the unread short-circuit so rooms compute a real count**

Replace the room short-circuit at lines 296–300:

```ts
          // Unread count: messages after lastReadAt that aren't sent by the current user as "human"
          let unreadCount = 0;
          if (isRoom) {
            // Rooms have no per-member read marker yet (Plan 2b/3) — show 0 rather than a permanently-inflated badge.
            unreadCount = 0;
          } else if (row.lastReadAt) {
```

with (route rooms through the tested helper, DMs keep their inline path):

```ts
          // Unread count: messages after lastReadAt not sent by the current user as "human"
          let unreadCount = 0;
          if (isRoom) {
            unreadCount = await countRoomUnread(
              ctx.db,
              row.conversationId,
              userId,
              row.lastReadAt,
            );
          } else if (row.lastReadAt) {
```

- [ ] **Step 3: Import the helper**

Near the top of `src/server/api/routers/inbox.ts`, add to the imports:

```ts
import { countRoomUnread } from "@/server/communities/room-unread";
```

- [ ] **Step 4: Typecheck + run inbox-related integration**

Run: `pnpm typecheck && pnpm lint`
Expected: passes.

Run: `RUN_DB_TESTS=1 pnpm test src/server/api/routers/spaces.integration.test.ts`
Expected: PASS (or skipped without local DB).

- [ ] **Step 5: Commit**

```bash
git add src/server/api/routers/inbox.ts
git commit -m "feat(spaces): real room unread counts in listConversations via lastReadAt"
```

---

## Task 6: Request-access notification in `requestAccess`

**Files:**
- Modify: `src/server/api/routers/spaces.ts` (imports + `requestAccess` body, lines 332-364)

- [ ] **Step 1: Add imports**

In `src/server/api/routers/spaces.ts`, extend the existing imports. Add `inArray` to the drizzle import (line 2) and `notifications`, `communityMemberships` to the schema import (lines 10-16), and import the pure helper:

```ts
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
```

```ts
import {
  communities,
  communityMemberships,
  spaces,
  spaceMemberships,
  memberProfiles,
  notifications,
  user,
} from "@/server/db/schema";
```

```ts
import { roomAccessRequestRecipients } from "@/server/communities/room-notifications";
```

- [ ] **Step 2: Select the room name + slug for the notification**

In `requestAccess` (line 336), extend the room select to include `name` and `slug`:

```ts
      const [room] = await ctx.db
        .select({
          id: spaces.id,
          visibility: spaces.visibility,
          name: spaces.name,
          slug: spaces.slug,
        })
        .from(spaces)
```

- [ ] **Step 3: Insert the membership with `.returning()` and notify admins**

Replace the insert + return at the end of `requestAccess` (lines 355-363):

```ts
      await ctx.db
        .insert(spaceMemberships)
        .values({
          spaceId: room.id,
          userId: ctx.session.user.id,
          status: "pending_request",
        })
        .onConflictDoNothing();
      return { success: true };
```

with:

```ts
      const inserted = await ctx.db
        .insert(spaceMemberships)
        .values({
          spaceId: room.id,
          userId: ctx.session.user.id,
          status: "pending_request",
        })
        .onConflictDoNothing()
        .returning({ id: spaceMemberships.id });

      // Only notify on a genuinely new request (a duplicate re-request inserts
      // nothing and must not re-ping admins).
      if (inserted.length > 0) {
        const admins = await ctx.db
          .select({ userId: communityMemberships.userId })
          .from(communityMemberships)
          .where(
            and(
              eq(communityMemberships.communityId, ctx.community.id),
              eq(communityMemberships.status, "active"),
              sql`${communityMemberships.role} IN ('owner', 'admin')`,
            ),
          );
        const recipients = roomAccessRequestRecipients(
          admins.map((a) => a.userId),
          ctx.session.user.id,
        );
        if (recipients.length > 0) {
          await ctx.db.insert(notifications).values(
            recipients.map((adminId) => ({
              userId: adminId,
              type: "room_access_request",
              title: "New room access request",
              content: `A member requested access to ${room.name ?? "a room"} in ${ctx.community.name}.`,
              metadata: {
                reviewPath: `/communities/${input.slug}/spaces/${room.slug}`,
                linkLabel: "Review request",
                spaceId: room.id,
              },
              communityId: ctx.community.id,
            })),
          );
        }
      }
      return { success: true };
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add src/server/api/routers/spaces.ts
git commit -m "feat(spaces): notify community admins on private-room access request"
```

---

## Task 7: Approve notification + `denyMember` procedure

**Files:**
- Modify: `src/server/api/routers/spaces.ts` (`approveMember`, lines 366-398; add `denyMember` after it)

- [ ] **Step 1: Select room name + slug in `approveMember`**

In `approveMember` (line 376), extend the room select:

```ts
      const [room] = await ctx.db
        .select({ id: spaces.id, name: spaces.name, slug: spaces.slug })
        .from(spaces)
```

- [ ] **Step 2: Notify the requester on approval**

Replace the update + return at the end of `approveMember` (lines 388-397):

```ts
      await ctx.db
        .update(spaceMemberships)
        .set({ status: "active" })
        .where(
          and(
            eq(spaceMemberships.spaceId, input.spaceId),
            eq(spaceMemberships.userId, input.userId),
          ),
        );
      return { success: true };
```

with:

```ts
      const updated = await ctx.db
        .update(spaceMemberships)
        .set({ status: "active" })
        .where(
          and(
            eq(spaceMemberships.spaceId, input.spaceId),
            eq(spaceMemberships.userId, input.userId),
          ),
        )
        .returning({ id: spaceMemberships.id });

      if (updated.length > 0) {
        await ctx.db.insert(notifications).values({
          userId: input.userId,
          type: "room_access_approved",
          title: "Access approved",
          content: `You're now a member of ${room.name ?? "a room"} in ${ctx.community.name}.`,
          metadata: {
            reviewPath: `/communities/${input.slug}/spaces/${room.slug}`,
            linkLabel: "Open room",
            spaceId: input.spaceId,
          },
          communityId: ctx.community.id,
        });
      }
      return { success: true };
```

- [ ] **Step 3: Add the `denyMember` procedure**

Immediately after `approveMember` (before `getRoom`), add:

```ts
  /** Deny (remove) a pending access request (owner/admin). Never touches active members. */
  denyMember: communityProcedure
    .input(
      z.object({ slug: z.string(), spaceId: z.string(), userId: z.string() }),
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.communityRole !== "owner" && ctx.communityRole !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      // Confirm the room belongs to this community before mutating membership.
      const [room] = await ctx.db
        .select({ id: spaces.id })
        .from(spaces)
        .where(
          and(
            eq(spaces.id, input.spaceId),
            eq(spaces.communityId, ctx.community.id),
            eq(spaces.kind, "room"),
          ),
        )
        .limit(1);
      if (!room) throw new TRPCError({ code: "NOT_FOUND" });
      // Only a still-pending request is removable here — guard against deleting
      // an active member by racing status.
      await ctx.db
        .delete(spaceMemberships)
        .where(
          and(
            eq(spaceMemberships.spaceId, input.spaceId),
            eq(spaceMemberships.userId, input.userId),
            eq(spaceMemberships.status, "pending_request"),
          ),
        );
      return { success: true };
    }),
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: passes.

- [ ] **Step 5: Add a DB-gated `denyMember` test**

In `src/server/api/routers/spaces.integration.test.ts`, inside the `rooms [DB integration]` describe, add a db-level assertion of the deny semantics (delete a pending row, leave active rows intact):

```ts
  it("denyMember-style delete removes only pending_request rows", async () => {
    const { db, schema } = m;
    const { eq, and } = await import("drizzle-orm");
    const pendingId = `rm-pending-${Date.now()}`;
    const activeId = `rm-active-${Date.now()}`;
    await db.insert(schema.user).values([
      { id: pendingId, email: `${pendingId}@example.test`, name: "Pending" },
      { id: activeId, email: `${activeId}@example.test`, name: "Active" },
    ]);
    await db.insert(schema.spaceMemberships).values([
      { spaceId: roomSpaceId, userId: pendingId, status: "pending_request" },
      { spaceId: roomSpaceId, userId: activeId, status: "active" },
    ]);

    // Mirror denyMember's where-clause.
    await db
      .delete(schema.spaceMemberships)
      .where(
        and(
          eq(schema.spaceMemberships.spaceId, roomSpaceId),
          eq(schema.spaceMemberships.userId, pendingId),
          eq(schema.spaceMemberships.status, "pending_request"),
        ),
      );

    const remaining = await db
      .select({ userId: schema.spaceMemberships.userId })
      .from(schema.spaceMemberships)
      .where(eq(schema.spaceMemberships.spaceId, roomSpaceId));
    expect(remaining.map((r) => r.userId)).toEqual([activeId]);

    await db.delete(schema.spaceMemberships).where(eq(schema.spaceMemberships.spaceId, roomSpaceId));
    await db.delete(schema.user).where(eq(schema.user.id, pendingId));
    await db.delete(schema.user).where(eq(schema.user.id, activeId));
  });
```

Run: `RUN_DB_TESTS=1 pnpm test src/server/api/routers/spaces.integration.test.ts`
Expected: PASS (or skipped without local DB).

- [ ] **Step 6: Commit**

```bash
git add src/server/api/routers/spaces.ts src/server/api/routers/spaces.integration.test.ts
git commit -m "feat(spaces): approve notification + denyMember procedure"
```

---

## Task 8: `listRooms` member count + scoped membership fetch

**Files:**
- Modify: `src/server/api/routers/spaces.ts:262-294`

- [ ] **Step 1: Add `memberCount` and scope the membership query**

Replace the `listRooms` body (lines 264-293):

```ts
    .query(async ({ ctx }) => {
      const rooms = await ctx.db
        .select({
          id: spaces.id,
          name: spaces.name,
          purpose: spaces.purpose,
          slug: spaces.slug,
          visibility: spaces.visibility,
        })
        .from(spaces)
        .where(
          and(
            eq(spaces.communityId, ctx.community.id),
            eq(spaces.kind, "room"),
            isNull(spaces.archivedAt),
          ),
        )
        .orderBy(asc(spaces.position));
      const mine = await ctx.db
        .select({
          spaceId: spaceMemberships.spaceId,
          status: spaceMemberships.status,
        })
        .from(spaceMemberships)
        .where(eq(spaceMemberships.userId, ctx.session.user.id));
      const byId = new Map(mine.map((m) => [m.spaceId, m.status]));
      return rooms.map((r) => ({
        ...r,
        membership: byId.get(r.id) ?? null,
      }));
    }),
```

with:

```ts
    .query(async ({ ctx }) => {
      const rooms = await ctx.db
        .select({
          id: spaces.id,
          name: spaces.name,
          purpose: spaces.purpose,
          slug: spaces.slug,
          visibility: spaces.visibility,
          memberCount: sql<number>`(SELECT COUNT(*)::int FROM app.space_membership WHERE space_id = ${spaces.id} AND status = 'active')`,
        })
        .from(spaces)
        .where(
          and(
            eq(spaces.communityId, ctx.community.id),
            eq(spaces.kind, "room"),
            isNull(spaces.archivedAt),
          ),
        )
        .orderBy(asc(spaces.position));
      const roomIds = rooms.map((r) => r.id);
      // Scope the caller's membership lookup to the listed rooms (was: all rooms).
      const mine = roomIds.length
        ? await ctx.db
            .select({
              spaceId: spaceMemberships.spaceId,
              status: spaceMemberships.status,
            })
            .from(spaceMemberships)
            .where(
              and(
                eq(spaceMemberships.userId, ctx.session.user.id),
                inArray(spaceMemberships.spaceId, roomIds),
              ),
            )
        : [];
      const byId = new Map(mine.map((mem) => [mem.spaceId, mem.status]));
      return rooms.map((r) => ({
        ...r,
        membership: byId.get(r.id) ?? null,
      }));
    }),
```

- [ ] **Step 2: Add a DB-gated `memberCount` assertion**

In `src/server/api/routers/spaces.integration.test.ts` (`rooms [DB integration]` describe), add:

```ts
  it("active member count subquery counts only active members", async () => {
    const { db, schema } = m;
    const { eq, and, sql } = await import("drizzle-orm");
    const aId = `rm-a-${Date.now()}`;
    await db.insert(schema.user).values({ id: aId, email: `${aId}@example.test`, name: "A" });
    await db.insert(schema.spaceMemberships).values([
      { spaceId: roomSpaceId, userId: aId, status: "active" },
      { spaceId: roomSpaceId, userId: userId, status: "pending_request" },
    ]);
    const [row] = await db
      .select({
        memberCount: sql<number>`(SELECT COUNT(*)::int FROM app.space_membership WHERE space_id = ${schema.spaces.id} AND status = 'active')`,
      })
      .from(schema.spaces)
      .where(eq(schema.spaces.id, roomSpaceId));
    expect(row?.memberCount).toBe(1);
    await db.delete(schema.spaceMemberships).where(eq(schema.spaceMemberships.spaceId, roomSpaceId));
    await db.delete(schema.user).where(eq(schema.user.id, aId));
  });
```

Run: `RUN_DB_TESTS=1 pnpm test src/server/api/routers/spaces.integration.test.ts`
Expected: PASS (or skipped without local DB).

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm typecheck && pnpm lint`
Expected: passes.

```bash
git add src/server/api/routers/spaces.ts src/server/api/routers/spaces.integration.test.ts
git commit -m "feat(spaces): listRooms returns memberCount + scopes membership fetch"
```

---

## Task 9: i18n keys (en + nl)

**Files:**
- Modify: `messages/en.json` (`communities.rooms`)
- Modify: `messages/nl.json` (`communities.rooms`)

- [ ] **Step 1: Add English keys**

In `messages/en.json`, inside `communities.rooms`, add these keys (place them logically near existing ones; `memberCount`, `pending`, `approve` already exist):

```json
      "open": "Open",
      "pendingShort": "Pending",
      "deny": "Deny",
      "invite": "Invite",
      "inviteMembers": "Invite members",
      "directoryTitle": "Rooms",
      "directoryEmpty": "No rooms yet."
```

- [ ] **Step 2: Add Dutch keys**

In `messages/nl.json`, inside `communities.rooms`, add the matching keys:

```json
      "open": "Openen",
      "pendingShort": "In afwachting",
      "deny": "Weigeren",
      "invite": "Uitnodigen",
      "inviteMembers": "Leden uitnodigen",
      "directoryTitle": "Ruimtes",
      "directoryEmpty": "Nog geen ruimtes."
```

- [ ] **Step 3: Verify JSON validity + typecheck**

Run: `node -e "require('./messages/en.json'); require('./messages/nl.json'); console.log('ok')"`
Expected: prints `ok`.

Run: `pnpm typecheck`
Expected: passes (next-intl message keys resolve).

- [ ] **Step 4: Commit**

```bash
git add messages/en.json messages/nl.json
git commit -m "i18n(spaces): rooms lobby + approvals keys (en/nl)"
```

---

## Task 10: Members panel — Deny button + invite labels

**Files:**
- Modify: `src/components/communities/rooms/room-members-panel.tsx`

- [ ] **Step 1: Add the `denyMember` mutation**

After the `addMutation` definition (line ~94), add:

```tsx
  const denyMutation = api.spaces.denyMember.useMutation({
    onSuccess: () => {
      void utils.spaces.listRoomMembers.invalidate({ slug, spaceId });
      void utils.spaces.getRoom.invalidate({ slug, spaceSlug });
    },
    onError: (e) => toast.error(e.message),
  });
```

- [ ] **Step 2: Render Approve + Deny for each pending request**

In the pending-requests section (lines 181-204), replace the single-button `trailing` with an Approve/Deny pair:

```tsx
                  {pendingMembers.map((m) => (
                    <PersonRow
                      key={m.userId}
                      name={m.displayName ?? ""}
                      avatarUrl={m.avatarUrl}
                      trailing={
                        <div className="flex shrink-0 gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={approveMutation.isPending}
                            aria-label={`${t("approve")} ${m.displayName ?? ""}`}
                            onClick={() =>
                              approveMutation.mutate({
                                slug,
                                spaceId,
                                userId: m.userId,
                              })
                            }
                          >
                            {t("approve")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={denyMutation.isPending}
                            aria-label={`${t("deny")} ${m.displayName ?? ""}`}
                            onClick={() =>
                              denyMutation.mutate({
                                slug,
                                spaceId,
                                userId: m.userId,
                              })
                            }
                          >
                            {t("deny")}
                          </Button>
                        </div>
                      }
                    />
                  ))}
```

- [ ] **Step 3: Reframe the add section as "Invite"**

In the add-members section (line 212), change the section label and the trailing button label from add to invite:

```tsx
                <SectionLabel as="h3">{t("inviteMembers")}</SectionLabel>
```

and in the candidate row button (lines 247-256), change the label and aria-label:

```tsx
                            aria-label={`${t("invite")} ${m.profile.displayName ?? ""}`}
                            onClick={() =>
                              addMutation.mutate({
                                slug,
                                spaceId,
                                userId: m.profile.userId,
                              })
                            }
                          >
                            {t("invite")}
```

- [ ] **Step 4: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add src/components/communities/rooms/room-members-panel.tsx
git commit -m "feat(spaces): Members panel approvals queue — deny + invite framing"
```

---

## Task 11: Town Square rooms-directory component

**Files:**
- Create: `src/components/communities/rooms/community-rooms-directory.tsx`

> This task ships the functional directory. Visual refinement happens in Task 12 via the `impeccable` skill (cards, locked teasers, hierarchy against DESIGN.md). Do not gold-plate the markup here.

- [ ] **Step 1: Create the component**

Create `src/components/communities/rooms/community-rooms-directory.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { api } from "@/trpc/react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ErrorState } from "@/components/ui/error-state";
import { SectionLabel } from "@/components/ui/section-label";

/**
 * Town Square (Plan 2b): a directory of the community's rooms. Public rooms show
 * Join/Open; private rooms render as locked teaser cards (name + purpose + count)
 * with Request access — nothing private leaks. Scoped to community members
 * (listRooms is a communityProcedure).
 */
export function CommunityRoomsDirectory({ slug }: { slug: string }) {
  const t = useTranslations("communities.rooms");
  const utils = api.useUtils();
  const roomsQuery = api.spaces.listRooms.useQuery({ slug });

  const joinMutation = api.spaces.joinRoom.useMutation({
    onSuccess: () => void utils.spaces.listRooms.invalidate({ slug }),
    onError: (e) => toast.error(e.message),
  });
  const requestMutation = api.spaces.requestAccess.useMutation({
    onSuccess: () => void utils.spaces.listRooms.invalidate({ slug }),
    onError: (e) => toast.error(e.message),
  });

  if (roomsQuery.isLoading) {
    return (
      <div className="flex justify-center py-6">
        <Spinner className="size-5" />
      </div>
    );
  }
  if (roomsQuery.isError) {
    return (
      <div className="mb-6">
        <ErrorState onRetry={() => roomsQuery.refetch()} />
      </div>
    );
  }

  const rooms = roomsQuery.data ?? [];
  if (rooms.length === 0) return null;

  return (
    <section className="mb-6">
      <SectionLabel as="h2">{t("directoryTitle")}</SectionLabel>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {rooms.map((room) => {
          const isPrivate = room.visibility === "private";
          const isMemberOfRoom = room.membership === "active";
          const isPending = room.membership === "pending_request";
          const locked = isPrivate && !isMemberOfRoom;
          return (
            <div
              key={room.id}
              className="border-border flex flex-col gap-2 rounded-lg border p-4"
            >
              <div className="flex items-center gap-2">
                {locked ? (
                  <Lock className="text-muted-foreground size-4 shrink-0" />
                ) : null}
                <h3 className="truncate text-sm font-medium">
                  {room.name ?? t("untitled")}
                </h3>
              </div>
              {room.purpose ? (
                <p className="text-muted-foreground line-clamp-2 text-sm">
                  {room.purpose}
                </p>
              ) : null}
              <p className="text-muted-foreground font-mono text-xs">
                {t("memberCount", { count: room.memberCount })}
              </p>
              <div className="mt-1">
                {isMemberOfRoom ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/communities/${slug}/spaces/${room.slug}`}>
                      {t("open")}
                    </Link>
                  </Button>
                ) : isPending ? (
                  <Button variant="outline" size="sm" disabled>
                    {t("pendingShort")}
                  </Button>
                ) : isPrivate ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={requestMutation.isPending}
                    onClick={() =>
                      requestMutation.mutate({ slug, spaceId: room.id })
                    }
                  >
                    {t("requestAccess.label")}
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={joinMutation.isPending}
                    onClick={() => joinMutation.mutate({ slug, spaceId: room.id })}
                  >
                    {t("join.label")}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/components/communities/rooms/community-rooms-directory.tsx
git commit -m "feat(spaces): Town Square rooms-directory component (functional)"
```

---

## Task 12: Wire directory into the overview + impeccable polish

**Files:**
- Modify: `src/app/[locale]/communities/[slug]/_overview-client.tsx`

- [ ] **Step 1: Render the directory above the feed for members**

In `_overview-client.tsx`, add the import:

```tsx
import { CommunityRoomsDirectory } from "@/components/communities/rooms/community-rooms-directory";
```

Then render it inside the returned fragment, after the liveness-preview block and before `<FeedPage ... />` (line 70), gated on membership (directory data is member-scoped):

```tsx
      {isMember ? <CommunityRoomsDirectory slug={slug} /> : null}

      <FeedPage
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: passes.

- [ ] **Step 3: Visual pass with the impeccable skill**

Invoke the `impeccable` skill (polish) on the two new/changed room surfaces against PRODUCT.md / DESIGN.md:
- `src/components/communities/rooms/community-rooms-directory.tsx` (cards + locked teaser cards)
- `src/components/communities/rooms/room-members-panel.tsx` (approvals queue rhythm)

Apply its recommendations honoring the named rules: One Voice (Signal Orange ≤10%, reserved for the single primary action — likely the public-room Join/Request), Flat-By-Default (border-defined cards, no decorative shadow), House Kicker (the `/ ROOMS` mono section marker), Mono-Is-Machine (member count is mono; names/purpose are sans), No-Cream (pure white/true dark surfaces). The lock + "Request access" is the conversion hook — make it legible, not loud.

- [ ] **Step 4: Run the app and verify the lobby**

Run the dev server and load a community overview as a member:
- Public room card shows Join → clicking joins and flips to Open.
- Private room renders locked with Request access → clicking flips to Pending and (as an admin in another session) produces a `room_access_request` notification; approving produces a `room_access_approved` notification to the requester.
- Member count is accurate; opening a room and returning clears its unread badge in `/messages`.

(Use the project's run skill / `pnpm dev`. If a local DB isn't wired for manual run, capture this as a verification note for review.)

- [ ] **Step 5: Commit**

```bash
git add src/app/[locale]/communities/[slug]/_overview-client.tsx src/components/communities/rooms/community-rooms-directory.tsx src/components/communities/rooms/room-members-panel.tsx
git commit -m "feat(spaces): mount Town Square directory on overview + impeccable polish"
```

---

## Task 13: Whole-branch verification

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: both pass with no errors.

- [ ] **Step 2: Full unit test run**

Run: `pnpm test`
Expected: PASS; the DB-gated `spaces.integration.test.ts` suites skip cleanly when `RUN_DB_TESTS` is unset.

- [ ] **Step 3: DB integration run (if local Postgres available)**

Run: `RUN_DB_TESTS=1 pnpm test src/server/api/routers/spaces.integration.test.ts`
Expected: PASS — `countRoomUnread`, deny-delete, and member-count tests included.

- [ ] **Step 4: Confirm migration is registered + idempotent**

Run: `pnpm db:apply`
Expected: no pending migrations (already applied in Task 1), no error.

- [ ] **Step 5: Spec coverage self-check**

Confirm each spec deliverable maps to shipped tasks: read-marker (T1, T3–T5), notifications (T2, T6, T7), Members panel deepening (T7 denyMember, T10), Town Square lobby (T8, T11, T12), i18n (T9). Note any deferred items match spec §8.

- [ ] **Step 6: Request code review**

Use the `superpowers:requesting-code-review` skill (or `/code-review`) on the branch diff before opening the PR.

---

## Self-Review Notes (author)

- **Spec coverage:** read-marker → T1/T3/T4/T5; request→admin notification → T6; approve→requester notification → T7; denyMember → T7; deepened Members panel → T10; lobby directory + memberCount → T8/T11/T12; i18n → T9. listRooms over-fetch fix folded into T8. All §-mapped.
- **Type consistency:** helper names are stable across tasks — `roomAccessRequestRecipients` (T2 → T6), `countRoomUnread` (T3 → T5), `denyMember` (T7 → T10), `memberCount` field (T8 → T11). Notification `metadata.reviewPath`/`linkLabel` match the panel's `reviewPathFromMetadata` contract (T6/T7 ↔ existing panel).
- **Deferred (spec §8):** aggregate admin page, room-moderator approve rights, presence, agent badge, email/push, denied/invited notifications, non-member public lobby teaser. None block this plan.
