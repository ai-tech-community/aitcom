// @vitest-environment node
/**
 * DB-INTEGRATION test for answering a direct invitation
 * (`communities.inviteMember` → `acceptInvite` / `declineInvite`), and for
 * `join` still activating an invited row on an open community. Against a
 * REAL local DB.
 *
 *   RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 PAYLOAD_PUSH=false \
 *     NEON_LOCAL_PROXY=127.0.0.1:5433 \
 *     DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test \
 *     pnpm exec vitest run src/server/api/routers/community-invite-response.integration.test.ts
 */
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

type JoinPolicy = "open" | "approval_required" | "invite_only";
type Status = "active" | "pending_approval" | "invited" | "banned";

describe.skipIf(!RUN_DB)("community invitations [DB integration]", () => {
  type Mods = {
    db: typeof import("@/server/db").db;
    schema: typeof import("@/server/db/schema");
    createCaller: typeof import("@/server/api/root").createCaller;
    and: typeof import("drizzle-orm").and;
    eq: typeof import("drizzle-orm").eq;
    inArray: typeof import("drizzle-orm").inArray;
  };
  let m: Mods;

  let sfx: string;
  let ownerId: string;
  let inviteeId: string;
  const communityIds: string[] = [];

  beforeAll(async () => {
    if (looksLikeCloudNeon(process.env.DATABASE_URL ?? "")) {
      throw new Error("Refusing to run against a cloud Neon DATABASE_URL.");
    }
    const [{ db }, schema, { createCaller }, drizzle] = await Promise.all([
      import("@/server/db"),
      import("@/server/db/schema"),
      import("@/server/api/root"),
      import("drizzle-orm"),
    ]);
    m = {
      db,
      schema,
      createCaller,
      and: drizzle.and,
      eq: drizzle.eq,
      inArray: drizzle.inArray,
    };
  }, 120_000);

  beforeEach(async () => {
    sfx = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    ownerId = `it-inv-owner-${sfx}`;
    inviteeId = `it-inv-invitee-${sfx}`;
    await m.db.insert(m.schema.user).values([
      { id: ownerId, email: `${ownerId}@example.test`, name: "Olga Owner" },
      { id: inviteeId, email: `${inviteeId}@example.test`, name: "Ivan" },
    ]);
  });

  afterEach(async () => {
    const users = [ownerId, inviteeId];
    if (communityIds.length > 0) {
      await m.db
        .delete(m.schema.activityEvents)
        .where(m.inArray(m.schema.activityEvents.communityId, communityIds));
      await m.db
        .delete(m.schema.communityInvites)
        .where(m.inArray(m.schema.communityInvites.communityId, communityIds));
      await m.db
        .delete(m.schema.communityMemberships)
        .where(
          m.inArray(m.schema.communityMemberships.communityId, communityIds),
        );
      await m.db
        .delete(m.schema.communities)
        .where(m.inArray(m.schema.communities.id, communityIds));
    }
    communityIds.length = 0;
    await m.db
      .delete(m.schema.notifications)
      .where(m.inArray(m.schema.notifications.userId, users));
    await m.db
      .delete(m.schema.activityEvents)
      .where(m.inArray(m.schema.activityEvents.actorId, users));
    await m.db
      .delete(m.schema.communityMemberships)
      .where(m.inArray(m.schema.communityMemberships.userId, users));
    await m.db.delete(m.schema.user).where(m.inArray(m.schema.user.id, users));
  });

  function as(userId: string) {
    return m.createCaller({
      db: m.db,
      session: { user: { id: userId, name: userId } } as never,
      headers: new Headers(),
    });
  }

  /** A community the owner runs, with the invitee's membership (or none). */
  async function community(
    joinPolicy: JoinPolicy,
    invitee: Status | null = null,
  ): Promise<{ id: string; slug: string; name: string }> {
    const slug = `inv-${joinPolicy.replace("_", "-")}-${sfx}`;
    const name = `Invites ${joinPolicy} ${sfx}`;
    const [row] = await m.db
      .insert(m.schema.communities)
      .values({ name, slug, createdBy: ownerId, joinPolicy })
      .returning({ id: m.schema.communities.id });
    communityIds.push(row!.id);
    await m.db.insert(m.schema.communityMemberships).values([
      { communityId: row!.id, userId: ownerId, role: "owner" },
      ...(invitee
        ? [
            {
              communityId: row!.id,
              userId: inviteeId,
              status: invitee,
              invitedBy: invitee === "invited" ? ownerId : null,
            },
          ]
        : []),
    ]);
    return { id: row!.id, slug, name };
  }

  async function inviteeMembership(communityId: string) {
    return m.db.query.communityMemberships.findFirst({
      where: m.and(
        m.eq(m.schema.communityMemberships.communityId, communityId),
        m.eq(m.schema.communityMemberships.userId, inviteeId),
      ),
    });
  }

  async function joinedEvents(communityId: string) {
    return m.db
      .select()
      .from(m.schema.activityEvents)
      .where(
        m.and(
          m.eq(m.schema.activityEvents.communityId, communityId),
          m.eq(m.schema.activityEvents.actorId, inviteeId),
          m.eq(m.schema.activityEvents.action, "community.joined"),
        ),
      );
  }

  async function inviteNotices() {
    return m.db
      .select()
      .from(m.schema.notifications)
      .where(
        m.and(
          m.eq(m.schema.notifications.userId, inviteeId),
          m.eq(m.schema.notifications.type, "community_invite"),
        ),
      );
  }

  it("invites by name, notifies once, and the invitee accepts an invite-only community", async () => {
    const c = await community("invite_only");

    await as(ownerId).communities.inviteMember({
      slug: c.slug,
      userId: inviteeId,
    });
    // Inviting again while the invitation is open does not notify twice.
    await as(ownerId).communities.inviteMember({
      slug: c.slug,
      userId: inviteeId,
    });

    const notices = await inviteNotices();
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      title: `Olga Owner invited you to ${c.name}`,
      communityId: c.id,
      metadata: expect.objectContaining({
        reviewPath: `/communities/${c.slug}`,
        inviterId: ownerId,
      }),
    });
    expect((await inviteeMembership(c.id))?.status).toBe("invited");

    await expect(
      as(inviteeId).communities.acceptInvite({ slug: c.slug }),
    ).resolves.toEqual({ success: true });

    const after = await inviteeMembership(c.id);
    expect(after).toMatchObject({
      status: "active",
      role: "member",
      invitedBy: ownerId,
    });
    const events = await joinedEvents(c.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actorType: "member",
      targetType: "community",
      targetId: c.id,
      metadata: expect.objectContaining({ via: "direct_invite" }),
    });

    // The community page reads the membership from here.
    const mine = await as(inviteeId).communities.getMyCommunities();
    expect(mine.find((row) => row.slug === c.slug)?.status).toBe("active");
  });

  it("accepts an invitation to an approval-required community without a request", async () => {
    const c = await community("approval_required", "invited");
    await as(inviteeId).communities.acceptInvite({ slug: c.slug });
    expect((await inviteeMembership(c.id))?.status).toBe("active");
    expect(await joinedEvents(c.id)).toHaveLength(1);
  });

  it("declines: the invitation row is gone and nothing else is written", async () => {
    const c = await community("invite_only", "invited");
    await expect(
      as(inviteeId).communities.declineInvite({ slug: c.slug }),
    ).resolves.toEqual({ success: true });
    expect(await inviteeMembership(c.id)).toBeUndefined();
    const events = await m.db
      .select()
      .from(m.schema.activityEvents)
      .where(m.eq(m.schema.activityEvents.communityId, c.id));
    expect(events).toHaveLength(0);
  });

  it("refuses a caller with no invitation, or only a pending request", async () => {
    const none = await community("invite_only");
    await expect(
      as(inviteeId).communities.acceptInvite({ slug: none.slug }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      as(inviteeId).communities.declineInvite({ slug: none.slug }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await inviteeMembership(none.id)).toBeUndefined();

    sfx = `${sfx}b`;
    const pending = await community("approval_required", "pending_approval");
    await expect(
      as(inviteeId).communities.acceptInvite({ slug: pending.slug }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await inviteeMembership(pending.id))?.status).toBe(
      "pending_approval",
    );
  });

  it("refuses a banned member, and leaves the ban in place", async () => {
    const c = await community("invite_only", "banned");
    await expect(
      as(inviteeId).communities.acceptInvite({ slug: c.slug }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      as(inviteeId).communities.declineInvite({ slug: c.slug }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await inviteeMembership(c.id))?.status).toBe("banned");
    expect(await joinedEvents(c.id)).toHaveLength(0);
  });

  it("refuses an active member", async () => {
    const c = await community("invite_only", "active");
    await expect(
      as(inviteeId).communities.acceptInvite({ slug: c.slug }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("refuses an unknown community", async () => {
    await expect(
      as(inviteeId).communities.acceptInvite({ slug: `missing-${sfx}` }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("join on an open community still activates an invited row", async () => {
    const c = await community("open", "invited");
    await as(inviteeId).communities.join({ slug: c.slug });
    const rows = await m.db
      .select()
      .from(m.schema.communityMemberships)
      .where(
        m.and(
          m.eq(m.schema.communityMemberships.communityId, c.id),
          m.eq(m.schema.communityMemberships.userId, inviteeId),
        ),
      );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "active", invitedBy: ownerId });
    const events = await joinedEvents(c.id);
    expect(events).toHaveLength(1);
    expect(events[0]?.actorType).toBe("member");
  });

  it("an invite link still activates an invited row, with the link's role", async () => {
    const c = await community("invite_only", "invited");
    const code = `code-${sfx}`;
    await m.db.insert(m.schema.communityInvites).values({
      communityId: c.id,
      code,
      createdBy: ownerId,
      role: "moderator",
    });
    await expect(
      as(inviteeId).communities.redeemInvite({ token: code }),
    ).resolves.toEqual({ communitySlug: c.slug, status: "active" });
    expect(await inviteeMembership(c.id)).toMatchObject({
      status: "active",
      role: "moderator",
      invitedBy: ownerId,
    });
    const events = await joinedEvents(c.id);
    expect(events).toHaveLength(1);
    expect(events[0]?.metadata).toMatchObject({
      via: "invite",
      role: "moderator",
    });
  });

  it("an organizer adding by email activates an invited row", async () => {
    const c = await community("invite_only", "invited");
    await as(ownerId).communities.addMemberByEmail({
      slug: c.slug,
      email: `${inviteeId}@example.test`,
      role: "admin",
    });
    expect(await inviteeMembership(c.id)).toMatchObject({
      status: "active",
      role: "admin",
    });
    const events = await joinedEvents(c.id);
    expect(events).toHaveLength(1);
    expect(events[0]?.metadata).toMatchObject({ via: "admin_add" });
  });

  it("join on an open community with no row inserts an active member", async () => {
    const c = await community("open");
    await as(inviteeId).communities.join({ slug: c.slug });
    expect(await inviteeMembership(c.id)).toMatchObject({
      status: "active",
      role: "member",
    });
    expect(await joinedEvents(c.id)).toHaveLength(1);
  });
});
