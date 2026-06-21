# Community Spaces — Plan 2a: Rooms + Realtime Chat + Per-Room Access

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let community admins create public/private **rooms** (a `space` with `kind='room'`), let members join (public = instant, private = request/approve), and chat inside a room in realtime — reusing the existing inbox messages + SSE infra.

**Architecture:** A room is a `space` row (`kind='room'`, `visibility`) paired with a `type='space'` conversation (`conversations.spaceId`). Room membership is a new `spaceMemberships` table — the single source of truth for who's in a room (status `active` | `pending_request`). Chat access and realtime fan-out both gate on **active** `spaceMemberships`: the inbox router's `getMessages`/`sendMessage` branch on `conversation.type === 'space'` to authorize via space membership and fan out to every active member's existing `inbox:user:{id}` SSE channel. The chat UI reuses `ConversationView` unchanged. Discovery (the Lobby, locked teasers) is **Plan 2b** — not built here.

**Tech Stack:** Next.js App Router, tRPC, Drizzle (`app` schema), Payload-style SQL migrations via `pnpm db:apply`, Upstash Redis + SSE, next-intl (en/nl), Vitest.

**Scope note:** Plan 2a of the [Spaces design spec](../specs/2026-06-21-spaces-design.md). Plan 2b = Lobby directory + locked private teasers + invite + request-access notifications. Plan 3 = posts-in-rooms + resident agent. Do NOT build those here. **Decision (confirmed):** unified membership — every room has explicit members; reading/posting requires active membership; public rooms allow one-click join, private rooms require request→approve.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/server/db/schema.ts` | `spaces.visibility`, `conversations.spaceId`, `spaceMemberships` table + relations | Modify |
| `src/migrations/20260622a_spaces_rooms.ts` | ALTER spaces/conversations + CREATE space_membership | Create |
| `src/migrations/index.ts` | Register migration | Modify |
| `src/server/communities/room-access.ts` | Pure predicates: `canJoinDirectly`, `isActiveMember`, `roomSlugFromName` | Create |
| `src/server/communities/room-access.test.ts` | Unit tests | Create |
| `src/server/communities/room-conversation.ts` | `getOrCreateRoomConversation(db, spaceId)` helper | Create |
| `src/server/api/routers/spaces.ts` | `createRoom`/`updateRoom`/`archiveRoom`/`listRooms`/`getRoom`/`joinRoom`/`requestAccess`/`approveMember`/`listRoomMembers` | Modify |
| `src/server/api/routers/inbox.ts` | Branch `getMessages`/`sendMessage` on `type==='space'`; exclude space convs from `listConversations` | Modify |
| `src/server/api/routers/spaces.integration.test.ts` | Room create/join/access integration tests | Modify |
| `src/app/[locale]/communities/[slug]/spaces/[spaceSlug]/page.tsx` | Room route: access gate + chat | Create |
| `src/components/communities/rooms/room-view.tsx` | Renders join-gate or `ConversationView` for a room | Create |
| `src/components/communities/settings/compose-spaces.tsx` | "Create room" form + room rows | Modify |
| `src/components/communities/community-nav.tsx` | Append room tabs the user can access | Modify |
| `messages/en.json`, `messages/nl.json` | i18n keys (`communities.rooms.*`) | Modify |

---

## Task 1: Schema — room columns, conversation seam, membership table

**Files:**
- Modify: `src/server/db/schema.ts`

- [ ] **Step 1: Add `visibility` to the `spaces` table**

In the `spaces` table column object (added in Plan 1), add `visibility` immediately after the `builtinSurface` column:

```typescript
    visibility: d
      .varchar({ length: 10 })
      .$type<"public" | "private">(),
```

- [ ] **Step 2: Add `spaceId` to the `conversations` table**

In the `conversations` table object, change the `type` comment and add a nullable `spaceId`:

```typescript
  type: d.varchar({ length: 10 }).notNull(), // "agent" | "dm" | "space"
  spaceId: d.varchar("space_id", { length: 255 }).references(() => spaces.id),
```

- [ ] **Step 3: Add the `spaceMemberships` table + relations**

Immediately after the `spacesRelations` block, add:

```typescript
// Room membership — the single source of truth for who is in a kind='room'
// space. status='active' members can read/post the room chat; 'pending_request'
// is a private-room join awaiting owner/admin approval (Plan 2b surfaces it).
export const spaceMemberships = appSchema.table(
  "space_membership",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    spaceId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => spaces.id),
    userId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    role: d
      .varchar({ length: 20 })
      .notNull()
      .default("member")
      .$type<"moderator" | "member">(),
    status: d
      .varchar({ length: 30 })
      .notNull()
      .default("active")
      .$type<"active" | "pending_request">(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
  }),
  (t) => [
    uniqueIndex("space_membership_space_user_uidx").on(t.spaceId, t.userId),
    index("space_membership_user_idx").on(t.userId),
    index("space_membership_space_status_idx").on(t.spaceId, t.status),
  ],
);

export const spaceMembershipsRelations = relations(
  spaceMemberships,
  ({ one }) => ({
    space: one(spaces, {
      fields: [spaceMemberships.spaceId],
      references: [spaces.id],
    }),
    user: one(user, {
      fields: [spaceMemberships.userId],
      references: [user.id],
    }),
  }),
);
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/db/schema.ts
git commit -m "feat(rooms): schema — visibility, conversation spaceId, space_membership"
```

---

## Task 2: Migration — apply the room schema

**Files:**
- Create: `src/migrations/20260622a_spaces_rooms.ts`
- Modify: `src/migrations/index.ts`

- [ ] **Step 1: Write the migration**

Create `src/migrations/20260622a_spaces_rooms.ts`:

```typescript
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Community Spaces Plan 2a — rooms. Adds `visibility` to space, a nullable
 * `space_id` seam to conversation (type='space' rooms), and the
 * space_membership table. Additive + idempotent; applied via `pnpm db:apply`.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."space" ADD COLUMN IF NOT EXISTS "visibility" varchar(10);
    ALTER TABLE "app"."conversation" ADD COLUMN IF NOT EXISTS "space_id" varchar(255) REFERENCES "app"."space"("id");
    CREATE TABLE IF NOT EXISTS "app"."space_membership" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "space_id" varchar(255) NOT NULL REFERENCES "app"."space"("id"),
      "user_id" varchar(255) NOT NULL REFERENCES "app"."user"("id"),
      "role" varchar(20) NOT NULL DEFAULT 'member',
      "status" varchar(30) NOT NULL DEFAULT 'active',
      "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" timestamptz
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "space_membership_space_user_uidx" ON "app"."space_membership" ("space_id", "user_id");
    CREATE INDEX IF NOT EXISTS "space_membership_user_idx" ON "app"."space_membership" ("user_id");
    CREATE INDEX IF NOT EXISTS "space_membership_space_status_idx" ON "app"."space_membership" ("space_id", "status");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "app"."space_membership";
    ALTER TABLE "app"."conversation" DROP COLUMN IF EXISTS "space_id";
    ALTER TABLE "app"."space" DROP COLUMN IF EXISTS "visibility";
  `);
}
```

- [ ] **Step 2: Register it** in `src/migrations/index.ts` — add the import after `20260621c_spaces_backfill` and append the `{ up, down, name: "20260622a_spaces_rooms" }` entry to the end of the `migrations` array:

```typescript
import * as migration_20260622a_spaces_rooms from "./20260622a_spaces_rooms";
```
```typescript
  {
    up: migration_20260622a_spaces_rooms.up,
    down: migration_20260622a_spaces_rooms.down,
    name: "20260622a_spaces_rooms",
  },
```

- [ ] **Step 3: Apply** — Run: `pnpm db:apply` — Expected: `20260622a_spaces_rooms` applied, no error.

- [ ] **Step 4: Commit**

```bash
git add src/migrations/20260622a_spaces_rooms.ts src/migrations/index.ts
git commit -m "feat(rooms): migration for room visibility + space_membership"
```

---

## Task 3: Pure room-access predicates

**Files:**
- Create: `src/server/communities/room-access.ts`
- Test: `src/server/communities/room-access.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/server/communities/room-access.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import {
  canJoinDirectly,
  isActiveMember,
  roomSlugFromName,
} from "./room-access";

describe("canJoinDirectly", () => {
  it("is true only for public rooms", () => {
    expect(canJoinDirectly("public")).toBe(true);
    expect(canJoinDirectly("private")).toBe(false);
    expect(canJoinDirectly(null)).toBe(false);
  });
});

describe("isActiveMember", () => {
  it("is true only for an active membership row", () => {
    expect(isActiveMember({ status: "active" })).toBe(true);
    expect(isActiveMember({ status: "pending_request" })).toBe(false);
    expect(isActiveMember(null)).toBe(false);
    expect(isActiveMember(undefined)).toBe(false);
  });
});

describe("roomSlugFromName", () => {
  it("slugifies and appends a short suffix for uniqueness", () => {
    const slug = roomSlugFromName("Cohort 12!", "abc123");
    expect(slug).toBe("cohort-12-abc123");
  });
  it("handles empty/odd names", () => {
    expect(roomSlugFromName("   ", "zz99")).toBe("room-zz99");
  });
});
```

- [ ] **Step 2: Run it — Expected: FAIL** (module missing).

Run: `pnpm test src/server/communities/room-access.test.ts`

- [ ] **Step 3: Implement**

Create `src/server/communities/room-access.ts`:

```typescript
/** Pure room-access predicates (no DB). */

export function canJoinDirectly(
  visibility: "public" | "private" | null | undefined,
): boolean {
  return visibility === "public";
}

export function isActiveMember(
  membership: { status: "active" | "pending_request" } | null | undefined,
): boolean {
  return membership?.status === "active";
}

/** Slugify a room name and append a short id suffix for per-community uniqueness. */
export function roomSlugFromName(name: string, suffix: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || "room"}-${suffix}`;
}
```

- [ ] **Step 4: Run it — Expected: PASS.**

- [ ] **Step 5: Commit**

```bash
git add src/server/communities/room-access.ts src/server/communities/room-access.test.ts
git commit -m "feat(rooms): pure room-access predicates (TDD)"
```

---

## Task 4: Room conversation helper

**Files:**
- Create: `src/server/communities/room-conversation.ts`

- [ ] **Step 1: Implement the get-or-create helper**

Create `src/server/communities/room-conversation.ts`. Each room has exactly one `type='space'` conversation, linked by `spaceId`. This helper finds it or creates it:

```typescript
import { and, eq } from "drizzle-orm";

import type { db as Database } from "@/server/db";
import { conversations } from "@/server/db/schema";

/**
 * Return the id of the room's space-conversation, creating it on first use.
 * One conversation per space (type='space', spaceId set).
 */
export async function getOrCreateRoomConversation(
  db: typeof Database,
  spaceId: string,
): Promise<string> {
  const [existing] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(eq(conversations.type, "space"), eq(conversations.spaceId, spaceId)),
    )
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(conversations)
    .values({ type: "space", spaceId })
    .returning({ id: conversations.id });
  return created!.id;
}
```

- [ ] **Step 2: Typecheck** — Run: `pnpm typecheck` — Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/server/communities/room-conversation.ts
git commit -m "feat(rooms): get-or-create room conversation helper"
```

---

## Task 5: Room CRUD + membership procedures (spaces router)

**Files:**
- Modify: `src/server/api/routers/spaces.ts`

- [ ] **Step 1: Extend the imports**

At the top of `src/server/api/routers/spaces.ts`, add to the schema import and bring in the helpers:

```typescript
import { and, asc, eq, isNull } from "drizzle-orm";
import { communities, spaces, spaceMemberships } from "@/server/db/schema";
import { canJoinDirectly, roomSlugFromName } from "@/server/communities/room-access";
import { getOrCreateRoomConversation } from "@/server/communities/room-conversation";
```

- [ ] **Step 2: Add the room procedures**

Inside the `createTRPCRouter({ ... })` for `spacesRouter`, add these procedures (after the existing `rename`):

```typescript
  /** Create a room (owner/admin). Auto-creates its space conversation and adds the creator as a member. */
  createRoom: communityProcedure
    .input(
      z.object({
        slug: z.string(),
        name: z.string().min(1).max(60),
        purpose: z.string().max(500).optional(),
        visibility: z.enum(["public", "private"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.communityRole !== "owner" && ctx.communityRole !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const [maxPos] = await ctx.db
        .select({ position: spaces.position })
        .from(spaces)
        .where(eq(spaces.communityId, ctx.community.id))
        .orderBy(asc(spaces.position))
        .limit(1);
      const room = await ctx.db.transaction(async (tx) => {
        const id = crypto.randomUUID();
        const [created] = await tx
          .insert(spaces)
          .values({
            id,
            communityId: ctx.community.id,
            kind: "room",
            name: input.name,
            purpose: input.purpose,
            visibility: input.visibility,
            slug: roomSlugFromName(input.name, id.slice(0, 6)),
            position: (maxPos?.position ?? 0) + 1,
            createdBy: ctx.session.user.id,
          })
          .returning();
        await tx.insert(spaceMemberships).values({
          spaceId: created!.id,
          userId: ctx.session.user.id,
          role: "moderator",
          status: "active",
        });
        return created!;
      });
      // Eagerly create the conversation so the first open is instant.
      await getOrCreateRoomConversation(ctx.db, room.id);
      return room;
    }),

  /** Update a room's name/purpose/visibility (owner/admin). */
  updateRoom: communityProcedure
    .input(
      z.object({
        slug: z.string(),
        spaceId: z.string(),
        name: z.string().min(1).max(60),
        purpose: z.string().max(500).optional(),
        visibility: z.enum(["public", "private"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.communityRole !== "owner" && ctx.communityRole !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const [updated] = await ctx.db
        .update(spaces)
        .set({
          name: input.name,
          purpose: input.purpose,
          visibility: input.visibility,
        })
        .where(
          and(
            eq(spaces.id, input.spaceId),
            eq(spaces.communityId, ctx.community.id),
            eq(spaces.kind, "room"),
          ),
        )
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
      return updated;
    }),

  /** Archive a room (owner/admin). */
  archiveRoom: communityProcedure
    .input(z.object({ slug: z.string(), spaceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.communityRole !== "owner" && ctx.communityRole !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const [updated] = await ctx.db
        .update(spaces)
        .set({ archivedAt: new Date() })
        .where(
          and(
            eq(spaces.id, input.spaceId),
            eq(spaces.communityId, ctx.community.id),
            eq(spaces.kind, "room"),
          ),
        )
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
      return { success: true };
    }),

  /** Rooms the caller can see: active rooms in the community + the caller's membership status for each. */
  listRooms: communityProcedure
    .input(z.object({ slug: z.string() }))
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

  /** Join a PUBLIC room instantly (active community member). */
  joinRoom: communityProcedure
    .input(z.object({ slug: z.string(), spaceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.communityRole) throw new TRPCError({ code: "FORBIDDEN" });
      const [room] = await ctx.db
        .select({ id: spaces.id, visibility: spaces.visibility })
        .from(spaces)
        .where(
          and(
            eq(spaces.id, input.spaceId),
            eq(spaces.communityId, ctx.community.id),
            eq(spaces.kind, "room"),
            isNull(spaces.archivedAt),
          ),
        )
        .limit(1);
      if (!room) throw new TRPCError({ code: "NOT_FOUND" });
      if (!canJoinDirectly(room.visibility)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This room is private — request access instead.",
        });
      }
      await ctx.db
        .insert(spaceMemberships)
        .values({ spaceId: room.id, userId: ctx.session.user.id, status: "active" })
        .onConflictDoNothing();
      return { success: true };
    }),

  /** Request access to a PRIVATE room (creates a pending_request membership). */
  requestAccess: communityProcedure
    .input(z.object({ slug: z.string(), spaceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.communityRole) throw new TRPCError({ code: "FORBIDDEN" });
      const [room] = await ctx.db
        .select({ id: spaces.id })
        .from(spaces)
        .where(
          and(
            eq(spaces.id, input.spaceId),
            eq(spaces.communityId, ctx.community.id),
            eq(spaces.kind, "room"),
            isNull(spaces.archivedAt),
          ),
        )
        .limit(1);
      if (!room) throw new TRPCError({ code: "NOT_FOUND" });
      await ctx.db
        .insert(spaceMemberships)
        .values({
          spaceId: room.id,
          userId: ctx.session.user.id,
          status: "pending_request",
        })
        .onConflictDoNothing();
      return { success: true };
    }),

  /** Approve a pending member (owner/admin). */
  approveMember: communityProcedure
    .input(z.object({ slug: z.string(), spaceId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.communityRole !== "owner" && ctx.communityRole !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      // Confirm the room belongs to this community before mutating membership.
      const [room] = await ctx.db
        .select({ id: spaces.id })
        .from(spaces)
        .where(
          and(eq(spaces.id, input.spaceId), eq(spaces.communityId, ctx.community.id)),
        )
        .limit(1);
      if (!room) throw new TRPCError({ code: "NOT_FOUND" });
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
    }),

  /** List a room's members (owner/admin) — for Plan 2b approval UI. */
  listRoomMembers: communityProcedure
    .input(z.object({ slug: z.string(), spaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      if (ctx.communityRole !== "owner" && ctx.communityRole !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return ctx.db
        .select({
          userId: spaceMemberships.userId,
          role: spaceMemberships.role,
          status: spaceMemberships.status,
        })
        .from(spaceMemberships)
        .where(eq(spaceMemberships.spaceId, input.spaceId));
    }),
```

- [ ] **Step 3: Typecheck** — `pnpm typecheck` — Expected: PASS. (`crypto.randomUUID()` is available in the Node runtime used by tRPC handlers, matching schema `$defaultFn`.)

- [ ] **Step 4: Commit**

```bash
git add src/server/api/routers/spaces.ts
git commit -m "feat(rooms): room CRUD + join/request/approve procedures"
```

---

## Task 6: Space-aware chat in the inbox router

**Files:**
- Modify: `src/server/api/routers/inbox.ts`

Background: today `getMessages`/`sendMessage` authorize via `conversationParticipants`, and `sendMessage` publishes to the single other participant. Space conversations have NO participant rows — they authorize via active `spaceMemberships` and fan out to all active members.

- [ ] **Step 1: Add imports**

Add to the schema import in `inbox.ts`: `conversations`, `spaceMemberships`. Add helper import:

```typescript
import { isActiveMember } from "@/server/communities/room-access";
```

- [ ] **Step 2: Add a shared space-access helper at module scope** (above the router):

```typescript
/**
 * For a space conversation, the caller must be an active member of the room.
 * Returns the active member user-ids (for realtime fan-out) or throws FORBIDDEN.
 */
async function requireSpaceConversationAccess(
  db: ConversationDb,
  conversationSpaceId: string,
  userId: string,
): Promise<string[]> {
  const members = await db
    .select({ userId: spaceMemberships.userId, status: spaceMemberships.status })
    .from(spaceMemberships)
    .where(
      and(
        eq(spaceMemberships.spaceId, conversationSpaceId),
        eq(spaceMemberships.status, "active"),
      ),
    );
  const mine = members.find((m) => m.userId === userId);
  if (!isActiveMember(mine ? { status: "active" } : null)) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return members.map((m) => m.userId);
}
```

(Type `ConversationDb` = `typeof ctx.db`; if no such alias exists, use `Parameters<...>` or just type the param as `typeof import("@/server/db").db`. Match the typing style already used by `runUiTool`/`dispatchEventImmediately` imports in this file.)

- [ ] **Step 3: Branch `getMessages`**

In `getMessages`, the handler currently loads the conversation's participant for the caller and throws FORBIDDEN if absent. Replace the access check with a branch: first load the conversation (`id`, `type`, `spaceId`); if `type === "space"`, call `requireSpaceConversationAccess(ctx.db, conv.spaceId!, userId)`; otherwise keep the existing participant check. The message-fetch query below is unchanged (it keys on `conversationId`).

```typescript
      const [conv] = await ctx.db
        .select({ id: conversations.id, type: conversations.type, spaceId: conversations.spaceId })
        .from(conversations)
        .where(eq(conversations.id, input.conversationId))
        .limit(1);
      if (!conv) throw new TRPCError({ code: "NOT_FOUND" });
      if (conv.type === "space") {
        await requireSpaceConversationAccess(ctx.db, conv.spaceId!, userId);
      } else {
        // existing participant check (unchanged):
        const [participant] = await ctx.db
          .select({ id: conversationParticipants.id })
          .from(conversationParticipants)
          .where(
            and(
              eq(conversationParticipants.conversationId, input.conversationId),
              eq(conversationParticipants.userId, userId),
            ),
          )
          .limit(1);
        if (!participant) throw new TRPCError({ code: "FORBIDDEN" });
      }
```

- [ ] **Step 4: Branch `sendMessage`**

In `sendMessage`, after loading the conversation, branch on `type === "space"`:
- Authorize + collect fan-out targets via `requireSpaceConversationAccess`.
- Insert the message with `senderType: "human"` (unchanged insert shape).
- For realtime, publish to every active member except the sender:

```typescript
      if (conv.type === "space") {
        const memberIds = await requireSpaceConversationAccess(ctx.db, conv.spaceId!, userId);
        // ...existing message insert + conversation.updatedAt bump...
        for (const memberId of memberIds) {
          if (memberId === userId) continue;
          void publishInboxEvent(memberId, { kind: "message", conversationId: input.conversationId, message });
        }
        // also refresh the sender's own other tabs:
        void publishInboxEvent(userId, { kind: "message", conversationId: input.conversationId, message });
        return message;
      }
      // ...existing dm/agent path unchanged...
```

Keep the existing dm/agent code path exactly as-is below the space branch (do not remove the agent webhook dispatch for dm/agent conversations — space rooms have no agents in Plan 2a).

- [ ] **Step 5: Exclude space conversations from the personal inbox**

In `listConversations`, add `ne(conversations.type, "space")` (import `ne` from drizzle-orm if not already) to the WHERE so rooms never appear in the floating inbox / `/messages` page — they live in the community.

- [ ] **Step 6: Typecheck + run inbox-adjacent tests**

Run: `pnpm typecheck`
Run: `pnpm test src/lib/chat/trust.test.ts`
Expected: PASS (no regression to chat trust unit tests; full message-path verification is Task 8 integration).

- [ ] **Step 7: Commit**

```bash
git add src/server/api/routers/inbox.ts
git commit -m "feat(rooms): space-aware access + fan-out in inbox getMessages/sendMessage"
```

---

## Task 7: Room route + room view

**Files:**
- Create: `src/components/communities/rooms/room-view.tsx`
- Create: `src/app/[locale]/communities/[slug]/spaces/[spaceSlug]/page.tsx`

- [ ] **Step 1: Add the spaces router lookup the page needs**

In `src/server/api/routers/spaces.ts`, add a `getRoom` query (public-within-community read of room meta + the caller's membership + the conversation id when the caller has access):

```typescript
  getRoom: communityProcedure
    .input(z.object({ slug: z.string(), spaceSlug: z.string() }))
    .query(async ({ ctx, input }) => {
      const [room] = await ctx.db
        .select({
          id: spaces.id,
          name: spaces.name,
          purpose: spaces.purpose,
          visibility: spaces.visibility,
          slug: spaces.slug,
        })
        .from(spaces)
        .where(
          and(
            eq(spaces.communityId, ctx.community.id),
            eq(spaces.kind, "room"),
            eq(spaces.slug, input.spaceSlug),
            isNull(spaces.archivedAt),
          ),
        )
        .limit(1);
      if (!room) throw new TRPCError({ code: "NOT_FOUND" });
      const [mine] = await ctx.db
        .select({ status: spaceMemberships.status })
        .from(spaceMemberships)
        .where(
          and(
            eq(spaceMemberships.spaceId, room.id),
            eq(spaceMemberships.userId, ctx.session.user.id),
          ),
        )
        .limit(1);
      let conversationId: string | null = null;
      if (mine?.status === "active") {
        conversationId = await getOrCreateRoomConversation(ctx.db, room.id);
      }
      return { ...room, membership: mine?.status ?? null, conversationId };
    }),
```

- [ ] **Step 2: Create the room view component**

Create `src/components/communities/rooms/room-view.tsx`. When the caller is an active member, render the reused `ConversationView`; otherwise render a join/request gate:

```typescript
"use client";

import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Spinner } from "@/components/ui/spinner";
import { ErrorState } from "@/components/ui/error-state";
import { Button } from "@/components/ui/button";
import { ConversationView } from "@/components/messages/conversation-view";

export function RoomView({ slug, spaceSlug }: { slug: string; spaceSlug: string }) {
  const t = useTranslations("communities.rooms");
  const utils = api.useUtils();
  const { data: room, isLoading, isError, refetch } =
    api.spaces.getRoom.useQuery({ slug, spaceSlug });

  const invalidate = () => utils.spaces.getRoom.invalidate({ slug, spaceSlug });
  const join = api.spaces.joinRoom.useMutation({
    onSuccess: invalidate,
    onError: (e) => void e,
  });
  const request = api.spaces.requestAccess.useMutation({
    onSuccess: invalidate,
    onError: (e) => void e,
  });

  if (isLoading) return <div className="flex justify-center py-16"><Spinner className="size-6" /></div>;
  if (isError || !room) return <ErrorState onRetry={refetch} />;

  if (room.membership === "active" && room.conversationId) {
    return (
      <div className="h-[70vh]">
        <ConversationView
          conversationId={room.conversationId}
          peer={{ name: room.name ?? t("untitled"), image: null, isAgent: false }}
          onToggleProfile={() => undefined}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md rounded-lg border p-8 text-center">
      <h2 className="text-lg font-semibold">{room.name}</h2>
      {room.purpose ? <p className="text-muted-foreground mt-1 text-sm">{room.purpose}</p> : null}
      {room.membership === "pending_request" ? (
        <p className="text-muted-foreground mt-6 text-sm">{t("pending")}</p>
      ) : room.visibility === "public" ? (
        <Button className="mt-6" onClick={() => join.mutate({ slug, spaceId: room.id })} disabled={join.isPending}>
          {t("join")}
        </Button>
      ) : (
        <Button className="mt-6" variant="outline" onClick={() => request.mutate({ slug, spaceId: room.id })} disabled={request.isPending}>
          {t("requestAccess")}
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create the route**

Create `src/app/[locale]/communities/[slug]/spaces/[spaceSlug]/page.tsx`:

```typescript
"use client";

import { use } from "react";
import { RoomView } from "@/components/communities/rooms/room-view";

export default function RoomPage({
  params,
}: {
  params: Promise<{ slug: string; spaceSlug: string }>;
}) {
  const { slug, spaceSlug } = use(params);
  return <RoomView slug={slug} spaceSlug={spaceSlug} />;
}
```

- [ ] **Step 4: Typecheck** — `pnpm typecheck` — Expected: PASS. (Confirm `ConversationView`'s required props match: `conversationId`, `peer`, `onToggleProfile`; `agentLastActiveAt`/`onBack` are optional per its prop type.)

- [ ] **Step 5: Commit**

```bash
git add "src/components/communities/rooms/room-view.tsx" "src/app/[locale]/communities/[slug]/spaces/[spaceSlug]/page.tsx" src/server/api/routers/spaces.ts
git commit -m "feat(rooms): room route + join/request gate + reused chat view"
```

---

## Task 8: Create-room UI + nav entries + i18n

**Files:**
- Modify: `src/components/communities/settings/compose-spaces.tsx`
- Modify: `src/components/communities/community-nav.tsx`
- Modify: `messages/en.json`, `messages/nl.json`

- [ ] **Step 1: Add a "Create room" form to the Compose page**

In `compose-spaces.tsx`, below the existing spaces list, add a create-room form (name, purpose, a public/private select) wired to `api.spaces.createRoom`, invalidating `listForAdmin` + `listRooms` on success and showing `toast.error` on error. Use existing `Input`/`Button`/`Switch` primitives. Render the community's existing rooms (`api.spaces.listRooms`) with an edit (`updateRoom`) / archive (`archiveRoom`) control. (Concrete form code: a `name` `<Input>`, a `purpose` `<Input>`, a visibility toggle labeled by `t("public")`/`t("private")`, and a "Create" `<Button>` calling `createRoom.mutate({ slug, name, purpose, visibility })`.)

- [ ] **Step 2: Append room links to the community nav**

In `community-nav.tsx`, after the surface tabs, fetch `api.spaces.listRooms.useQuery({ slug })` and append a nav entry per room the user can see, linking to `${basePath}/spaces/${room.slug}`, labeled with the room name and a lock glyph when `room.visibility === "private" && room.membership !== "active"`. Keep the query non-blocking (`?? []`), matching the Plan-1 error-fallback pattern.

- [ ] **Step 3: i18n keys**

Add a `communities.rooms` namespace to BOTH `messages/en.json` and `messages/nl.json`:

```json
    "rooms": {
      "join": "Join",
      "requestAccess": "Request access",
      "pending": "Your request is pending approval.",
      "untitled": "Room",
      "create": "Create room",
      "name": "Room name",
      "purpose": "Purpose",
      "public": "Public",
      "private": "Private",
      "visibility": "Who can join?"
    }
```

(Dutch values: `Deelnemen` / `Toegang aanvragen` / `Je verzoek wacht op goedkeuring.` / `Ruimte` / `Ruimte aanmaken` / `Ruimtenaam` / `Doel` / `Openbaar` / `Privé` / `Wie kan deelnemen?`.)

- [ ] **Step 4: Validate JSON + typecheck**

Run: `node -e "require('./messages/en.json');require('./messages/nl.json');console.log('ok')"`
Run: `pnpm typecheck`
Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/communities/settings/compose-spaces.tsx src/components/communities/community-nav.tsx messages/en.json messages/nl.json
git commit -m "feat(rooms): create-room UI, nav room links, i18n"
```

---

## Task 9: Integration tests + whole-feature verification

**Files:**
- Modify: `src/server/api/routers/spaces.integration.test.ts`

- [ ] **Step 1: Add room integration tests** (DB-gated, same `describe.skipIf(!RUN_DB)` pattern as the existing file). Cover, with direct DB + the helpers:
  - `createRoom` inserts a `kind='room'` space, a moderator `spaceMembership`, and (via `getOrCreateRoomConversation`) exactly one `type='space'` conversation for that space.
  - A second call to `getOrCreateRoomConversation` for the same space returns the SAME conversation id (no duplicate).
  - A non-member's `requireSpaceConversationAccess` throws; after `joinRoom` (public) it returns the member list including them.
  - `requestAccess` on a private room creates a `pending_request` row that does NOT grant chat access until `approveMember` flips it to `active`.

  (Write these as DB assertions following the existing fixture setup — create user + community + room, then assert membership/conversation rows.)

- [ ] **Step 2: Run the targeted tests** — Run: `pnpm test src/server/communities/room-access.test.ts src/server/api/routers/spaces.integration.test.ts` — Expected: room-access unit tests PASS; integration tests PASS (with local DB) or SKIP cleanly.

- [ ] **Step 3: Whole-feature gate** — Run: `pnpm typecheck && pnpm lint && pnpm test` — Expected: all PASS (integration suites skip without a local DB).

- [ ] **Step 4: Live browser QA (manual checklist)** — `pnpm dev`, sign in as an admin, then: create a public room in Settings → Spaces; open it from the nav and send a message; in a second session as another member, open the room, **Join**, and confirm the message appears in realtime; create a private room, request access as the member, approve as admin, confirm chat unlocks; confirm rooms do NOT appear in the `/messages` personal inbox.

- [ ] **Step 5: Commit**

```bash
git add src/server/api/routers/spaces.integration.test.ts
git commit -m "test(rooms): room create/join/access integration coverage"
```

---

## Self-review checklist (plan author)

- **Spec coverage (Plan 2a slice):** room data model (visibility/spaceId/spaceMemberships) ✅ T1/T2; per-room access (`requireSpaceConversationAccess` + active-membership gate) ✅ T6; room CRUD ✅ T5; join/request/approve ✅ T5; realtime chat reuse + fan-out ✅ T6; room route + reused `ConversationView` ✅ T7; create-room UI + nav + i18n ✅ T8; tests ✅ T9. Deferred to Plan 2b: the Lobby directory, locked-teaser cards, invite flow, request-access notifications, members/approval UI (the procedures `listRoomMembers`/`approveMember` exist; their admin UI is 2b).
- **Type consistency:** `spaceMemberships.status` is `'active' | 'pending_request'` everywhere; `visibility` is `'public' | 'private'`; `getOrCreateRoomConversation` returns `string` (conversation id) and is used identically in T5/T7; `requireSpaceConversationAccess` returns `string[]` (member ids) used for both the access throw and the fan-out in T6.
- **No placeholders:** load-bearing tasks (schema, migration, access predicates, room procedures, inbox branch, room route) carry full code; the two UI tasks (T8 create-room form, nav links) describe exact wiring with the concrete mutations/props named — implementer fills standard form markup following the Plan-1 `compose-spaces.tsx` pattern in the same file.
- **Risk note for the implementer:** Task 6 edits the battle-tested `inbox.ts` — keep the existing dm/agent path byte-for-byte; only ADD the `type==='space'` branch and the `listConversations` exclusion.
