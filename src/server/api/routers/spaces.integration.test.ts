import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

function looksLikeCloudNeon(url: string): boolean {
  return /neon\.tech|neon\.build|pooler\.[^/]*\.neon/i.test(url);
}
function isLocalDbConfigured(): boolean {
  if (process.env.RUN_DB_TESTS !== "1") return false;
  const dbUrl = process.env.DATABASE_URL?.trim() ?? "";
  if (dbUrl && looksLikeCloudNeon(dbUrl)) return false;
  return /(@|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0|db|postgres|host\.docker\.internal)(:|\/)/i.test(
    dbUrl,
  );
}
const RUN_DB = isLocalDbConfigured();

describe.skipIf(!RUN_DB)("spaces router [DB integration]", () => {
  type Mods = {
    db: typeof import("@/server/db").db;
    schema: typeof import("@/server/db/schema");
    buildDefaultSpaceRows: typeof import("@/server/communities/space-defaults").buildDefaultSpaceRows;
    getOrCreateRoomConversation: typeof import("@/server/communities/room-conversation").getOrCreateRoomConversation;
  };
  let m: Mods;
  let communityId: string;
  let userId: string;

  beforeAll(async () => {
    const [{ db }, schema, { buildDefaultSpaceRows }, { getOrCreateRoomConversation }] =
      await Promise.all([
        import("@/server/db"),
        import("@/server/db/schema"),
        import("@/server/communities/space-defaults"),
        import("@/server/communities/room-conversation"),
      ]);
    m = { db, schema, buildDefaultSpaceRows, getOrCreateRoomConversation };
  });

  beforeEach(async () => {
    const { db, schema, buildDefaultSpaceRows } = m;
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    userId = `sp-owner-${suffix}`;
    await db.insert(schema.user).values({
      id: userId,
      email: `sp-${suffix}@example.test`,
      name: "Spaces Owner",
    });
    const [c] = await db
      .insert(schema.communities)
      .values({
        name: `Spaces Test ${suffix}`,
        slug: `spaces-test-${suffix}`,
        createdBy: userId,
      })
      .returning();
    communityId = c!.id;
    await db.insert(schema.spaces).values(buildDefaultSpaceRows(communityId));
  });

  afterEach(async () => {
    const { db, schema } = m;
    const { eq } = await import("drizzle-orm");
    // Clean up in dependency order: conversations → space_memberships → spaces → communities → users
    const roomSpaces = await db
      .select({ id: schema.spaces.id })
      .from(schema.spaces)
      .where(eq(schema.spaces.communityId, communityId));
    for (const space of roomSpaces) {
      await db
        .delete(schema.conversations)
        .where(eq(schema.conversations.spaceId, space.id));
      await db
        .delete(schema.spaceMemberships)
        .where(eq(schema.spaceMemberships.spaceId, space.id));
    }
    await db
      .delete(schema.spaces)
      .where(eq(schema.spaces.communityId, communityId));
    await db
      .delete(schema.communities)
      .where(eq(schema.communities.id, communityId));
    await db.delete(schema.user).where(eq(schema.user.id, userId));
  });

  it("seeds five ordered builtin spaces", async () => {
    const { db, schema } = m;
    const { eq, asc } = await import("drizzle-orm");
    const rows = await db
      .select()
      .from(schema.spaces)
      .where(eq(schema.spaces.communityId, communityId))
      .orderBy(asc(schema.spaces.position));
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.builtinSurface)).toEqual([
      "forum",
      "events",
      "classroom",
      "ideas",
      "members",
    ]);
  });

  it("archiving a space hides it from an enabled-only query", async () => {
    const { db, schema } = m;
    const { eq, and, isNull } = await import("drizzle-orm");
    const [forum] = await db
      .select()
      .from(schema.spaces)
      .where(
        and(
          eq(schema.spaces.communityId, communityId),
          eq(schema.spaces.builtinSurface, "forum"),
        ),
      );
    await db
      .update(schema.spaces)
      .set({ archivedAt: new Date() })
      .where(eq(schema.spaces.id, forum!.id));
    const enabled = await db
      .select()
      .from(schema.spaces)
      .where(
        and(
          eq(schema.spaces.communityId, communityId),
          isNull(schema.spaces.archivedAt),
        ),
      );
    expect(enabled).toHaveLength(4);
  });
});

// ── Room integration tests ───────────────────────────────────────────────────

describe.skipIf(!RUN_DB)("rooms [DB integration]", () => {
  type Mods = {
    db: typeof import("@/server/db").db;
    schema: typeof import("@/server/db/schema");
    getOrCreateRoomConversation: typeof import("@/server/communities/room-conversation").getOrCreateRoomConversation;
  };
  let m: Mods;
  let communityId: string;
  let userId: string;
  let roomSpaceId: string;

  beforeAll(async () => {
    const [{ db }, schema, { getOrCreateRoomConversation }] = await Promise.all([
      import("@/server/db"),
      import("@/server/db/schema"),
      import("@/server/communities/room-conversation"),
    ]);
    m = { db, schema, getOrCreateRoomConversation };
  });

  beforeEach(async () => {
    const { db, schema } = m;
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    userId = `rm-owner-${suffix}`;
    await db.insert(schema.user).values({
      id: userId,
      email: `rm-${suffix}@example.test`,
      name: "Room Owner",
    });
    const [c] = await db
      .insert(schema.communities)
      .values({
        name: `Room Test ${suffix}`,
        slug: `room-test-${suffix}`,
        createdBy: userId,
      })
      .returning();
    communityId = c!.id;
    // Insert a kind='room' space
    const [space] = await db
      .insert(schema.spaces)
      .values({
        communityId,
        kind: "room",
        visibility: "public",
        name: "General Room",
        slug: `general-room-${suffix}`,
        position: 100,
        createdBy: userId,
      })
      .returning();
    roomSpaceId = space!.id;
  });

  afterEach(async () => {
    const { db, schema } = m;
    const { eq } = await import("drizzle-orm");
    // Clean up in dependency order
    await db
      .delete(schema.conversations)
      .where(eq(schema.conversations.spaceId, roomSpaceId));
    await db
      .delete(schema.spaceMemberships)
      .where(eq(schema.spaceMemberships.spaceId, roomSpaceId));
    await db
      .delete(schema.spaces)
      .where(eq(schema.spaces.communityId, communityId));
    await db
      .delete(schema.communities)
      .where(eq(schema.communities.id, communityId));
    await db.delete(schema.user).where(eq(schema.user.id, userId));
  });

  it("inserting a kind='room' space + moderator membership creates the expected rows", async () => {
    const { db, schema } = m;
    const { eq, and } = await import("drizzle-orm");

    // Insert moderator membership
    await db.insert(schema.spaceMemberships).values({
      spaceId: roomSpaceId,
      userId,
      role: "moderator",
      status: "active",
    });

    // Verify the room space row
    const [roomSpace] = await db
      .select()
      .from(schema.spaces)
      .where(eq(schema.spaces.id, roomSpaceId));
    expect(roomSpace?.kind).toBe("room");

    // Verify the moderator membership row
    const memberships = await db
      .select()
      .from(schema.spaceMemberships)
      .where(
        and(
          eq(schema.spaceMemberships.spaceId, roomSpaceId),
          eq(schema.spaceMemberships.userId, userId),
        ),
      );
    expect(memberships).toHaveLength(1);
    expect(memberships[0]?.role).toBe("moderator");
    expect(memberships[0]?.status).toBe("active");
  });

  it("getOrCreateRoomConversation creates exactly one type='space' conversation and is idempotent", async () => {
    const { db, schema, getOrCreateRoomConversation } = m;
    const { eq, and } = await import("drizzle-orm");

    // First call — should create
    const id1 = await getOrCreateRoomConversation(db, roomSpaceId);
    expect(typeof id1).toBe("string");
    expect(id1.length).toBeGreaterThan(0);

    // Verify exactly one conversation row with type='space' and the correct spaceId
    const convs = await db
      .select()
      .from(schema.conversations)
      .where(
        and(
          eq(schema.conversations.type, "space"),
          eq(schema.conversations.spaceId, roomSpaceId),
        ),
      );
    expect(convs).toHaveLength(1);
    expect(convs[0]?.id).toBe(id1);

    // Second call — must return the SAME id (no duplicate)
    const id2 = await getOrCreateRoomConversation(db, roomSpaceId);
    expect(id2).toBe(id1);

    // Still exactly one row
    const convsAfter = await db
      .select()
      .from(schema.conversations)
      .where(
        and(
          eq(schema.conversations.type, "space"),
          eq(schema.conversations.spaceId, roomSpaceId),
        ),
      );
    expect(convsAfter).toHaveLength(1);
  });

  it("a non-member is not among the active members of a room", async () => {
    const { db, schema } = m;
    const { eq, and } = await import("drizzle-orm");
    const nonMemberId = `non-member-${Date.now()}`;

    // Query active memberships — nonMemberId should not appear
    const activeMembers = await db
      .select({ userId: schema.spaceMemberships.userId })
      .from(schema.spaceMemberships)
      .where(
        and(
          eq(schema.spaceMemberships.spaceId, roomSpaceId),
          eq(schema.spaceMemberships.status, "active"),
        ),
      );
    const activeMemberIds = activeMembers.map((m) => m.userId);
    expect(activeMemberIds).not.toContain(nonMemberId);
  });

  it("after inserting an active membership the user IS among active members", async () => {
    const { db, schema } = m;
    const { eq, and } = await import("drizzle-orm");

    // Insert active membership for userId
    await db.insert(schema.spaceMemberships).values({
      spaceId: roomSpaceId,
      userId,
      role: "member",
      status: "active",
    });

    const activeMembers = await db
      .select({ userId: schema.spaceMemberships.userId })
      .from(schema.spaceMemberships)
      .where(
        and(
          eq(schema.spaceMemberships.spaceId, roomSpaceId),
          eq(schema.spaceMemberships.status, "active"),
        ),
      );
    const activeMemberIds = activeMembers.map((m) => m.userId);
    expect(activeMemberIds).toContain(userId);
  });

  it("a pending_request membership does NOT count as active until flipped to active", async () => {
    const { db, schema } = m;
    const { eq, and } = await import("drizzle-orm");

    // Insert pending_request membership
    await db.insert(schema.spaceMemberships).values({
      spaceId: roomSpaceId,
      userId,
      role: "member",
      status: "pending_request",
    });

    // Should NOT appear in active members query
    const beforeApproval = await db
      .select({ userId: schema.spaceMemberships.userId })
      .from(schema.spaceMemberships)
      .where(
        and(
          eq(schema.spaceMemberships.spaceId, roomSpaceId),
          eq(schema.spaceMemberships.status, "active"),
        ),
      );
    expect(beforeApproval.map((m) => m.userId)).not.toContain(userId);

    // Flip to active (approve)
    await db
      .update(schema.spaceMemberships)
      .set({ status: "active" })
      .where(
        and(
          eq(schema.spaceMemberships.spaceId, roomSpaceId),
          eq(schema.spaceMemberships.userId, userId),
        ),
      );

    // Now should appear in active members
    const afterApproval = await db
      .select({ userId: schema.spaceMemberships.userId })
      .from(schema.spaceMemberships)
      .where(
        and(
          eq(schema.spaceMemberships.spaceId, roomSpaceId),
          eq(schema.spaceMemberships.status, "active"),
        ),
      );
    expect(afterApproval.map((m) => m.userId)).toContain(userId);
  });
});
