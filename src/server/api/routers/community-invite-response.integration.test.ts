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
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const fake = vi.hoisted(() => ({
  /** When set, the invitation notice fails to save (to prove atomicity). */
  failNotify: false,
  /** The agent an API key resolves to, for the agent procedures. */
  agent: null as null | {
    agentId: string;
    ownerId: string;
    scopes: string[];
  },
}));

vi.mock("@/server/communities/invite-notification", async (importOriginal) => {
  const real =
    await importOriginal<
      typeof import("@/server/communities/invite-notification")
    >();
  return {
    ...real,
    notifyCommunityInvite: async (
      ...args: Parameters<typeof real.notifyCommunityInvite>
    ) => {
      if (fake.failNotify) throw new Error("notice failed");
      return real.notifyCommunityInvite(...args);
    },
  };
});

vi.mock("@/server/agent/api-key", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/agent/api-key")>()),
  validateApiKey: async () => fake.agent,
}));

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
  let otherId: string;
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
    otherId = `it-inv-other-${sfx}`;
    await m.db.insert(m.schema.user).values([
      { id: ownerId, email: `${ownerId}@example.test`, name: "Olga Owner" },
      { id: inviteeId, email: `${inviteeId}@example.test`, name: "Ivan" },
      { id: otherId, email: `${otherId}@example.test`, name: "Otto" },
    ]);
  });

  afterEach(async () => {
    fake.failNotify = false;
    fake.agent = null;
    const users = [ownerId, inviteeId, otherId];
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

  it("declines: the invitation row is gone and only the decline is recorded", async () => {
    const c = await community("invite_only", "invited");
    await expect(
      as(inviteeId).communities.declineInvite({ slug: c.slug }),
    ).resolves.toEqual({ success: true });
    expect(await inviteeMembership(c.id)).toBeUndefined();
    const events = await m.db
      .select()
      .from(m.schema.activityEvents)
      .where(m.eq(m.schema.activityEvents.communityId, c.id));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: "community.invite_declined",
      actorId: inviteeId,
      actorType: "member",
      metadata: { invitedBy: ownerId },
    });
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
  // ─── Notice: length and atomicity ──────────────────────────────────────

  it("keeps the notice title within its column for very long names", async () => {
    await m.db
      .update(m.schema.user)
      .set({ name: "N".repeat(255) })
      .where(m.eq(m.schema.user.id, ownerId));
    const c = await community("invite_only");
    await m.db
      .update(m.schema.communities)
      .set({ name: `${"C".repeat(400)} ${sfx}` })
      .where(m.eq(m.schema.communities.id, c.id));

    await as(ownerId).communities.inviteMember({
      slug: c.slug,
      userId: inviteeId,
    });

    const [notice] = await inviteNotices();
    expect(Array.from(notice!.title).length).toBeLessThanOrEqual(255);
    expect(notice!.title).toContain(" invited you to ");
    expect((await inviteeMembership(c.id))?.status).toBe("invited");
  });

  it("saves the invitation and its notice together, or neither", async () => {
    const c = await community("invite_only");
    fake.failNotify = true;
    await expect(
      as(ownerId).communities.inviteMember({ slug: c.slug, userId: inviteeId }),
    ).rejects.toThrow();
    expect(await inviteeMembership(c.id)).toBeUndefined();
    expect(await inviteNotices()).toHaveLength(0);

    // A retry, once the notice can be saved, invites and notifies.
    fake.failNotify = false;
    await as(ownerId).communities.inviteMember({
      slug: c.slug,
      userId: inviteeId,
    });
    expect((await inviteeMembership(c.id))?.status).toBe("invited");
    expect(await inviteNotices()).toHaveLength(1);
  });

  // ─── Abuse limits ──────────────────────────────────────────────────────

  it("limits how many invitations one organizer sends per hour", async () => {
    const { INVITES_PER_HOUR } =
      await import("@/server/communities/invite-limits");
    const c = await community("invite_only");
    const caller = as(ownerId);
    // Re-inviting the same person counts as well, and needs no new users.
    for (let i = 0; i < INVITES_PER_HOUR; i++) {
      await caller.communities.inviteMember({
        slug: c.slug,
        userId: inviteeId,
      });
    }
    await expect(
      caller.communities.inviteMember({ slug: c.slug, userId: otherId }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(
      await m.db.query.communityMemberships.findFirst({
        where: m.and(
          m.eq(m.schema.communityMemberships.communityId, c.id),
          m.eq(m.schema.communityMemberships.userId, otherId),
        ),
      }),
    ).toBeUndefined();
  }, 60_000);

  it("after a decline, the community cannot invite them again for 30 days", async () => {
    const c = await community("invite_only");
    await as(ownerId).communities.inviteMember({
      slug: c.slug,
      userId: inviteeId,
    });
    await as(inviteeId).communities.declineInvite({ slug: c.slug });

    await expect(
      as(ownerId).communities.inviteMember({ slug: c.slug, userId: inviteeId }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await inviteeMembership(c.id)).toBeUndefined();
    expect(await inviteNotices()).toHaveLength(1);

    // 31 days later the community may ask again.
    await m.db
      .update(m.schema.activityEvents)
      .set({ createdAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) })
      .where(
        m.and(
          m.eq(m.schema.activityEvents.communityId, c.id),
          m.eq(m.schema.activityEvents.action, "community.invite_declined"),
        ),
      );
    await as(ownerId).communities.inviteMember({
      slug: c.slug,
      userId: inviteeId,
    });
    expect((await inviteeMembership(c.id))?.status).toBe("invited");
  });

  // ─── Notices resolved once answered ────────────────────────────────────

  it.each(["accepted", "declined"] as const)(
    "marks the invitation notice read and drops its link once %s",
    async (resolution) => {
      const c = await community("invite_only");
      await as(ownerId).communities.inviteMember({
        slug: c.slug,
        userId: inviteeId,
      });
      if (resolution === "accepted") {
        await as(inviteeId).communities.acceptInvite({ slug: c.slug });
      } else {
        await as(inviteeId).communities.declineInvite({ slug: c.slug });
      }
      const [notice] = await inviteNotices();
      expect(notice!.readAt).not.toBeNull();
      expect(notice!.metadata).toMatchObject({ resolution });
      expect(notice!.metadata).not.toHaveProperty("reviewPath");
      expect(notice!.metadata).not.toHaveProperty("linkLabel");
    },
  );

  // ─── Invite-link uses and concurrent joins ─────────────────────────────

  async function inviteLink(
    communityId: string,
    over: Partial<typeof m.schema.communityInvites.$inferInsert> = {},
  ) {
    const code = `code-${sfx}-${Math.floor(Math.random() * 1e6)}`;
    await m.db.insert(m.schema.communityInvites).values({
      communityId,
      code,
      createdBy: ownerId,
      ...over,
    });
    return code;
  }

  async function usesOf(code: string) {
    const row = await m.db.query.communityInvites.findFirst({
      where: m.eq(m.schema.communityInvites.code, code),
    });
    return row!.useCount;
  }

  it("a used-up link spends nothing and changes no membership", async () => {
    const c = await community("invite_only", "invited");
    const code = await inviteLink(c.id, { maxUses: 1, useCount: 1 });
    await expect(
      as(inviteeId).communities.redeemInvite({ token: code }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(await usesOf(code)).toBe(1);
    expect((await inviteeMembership(c.id))?.status).toBe("invited");
    expect(await joinedEvents(c.id)).toHaveLength(0);
  });

  it("two redeems racing by one member spend one use, not two", async () => {
    const c = await community("invite_only");
    const code = await inviteLink(c.id, { maxUses: 2 });
    const results = await Promise.allSettled([
      as(inviteeId).communities.redeemInvite({ token: code }),
      as(inviteeId).communities.redeemInvite({ token: code }),
    ]);
    // Whichever way they interleave: a loser either saw the member already
    // in (no use spent) or lost the insert (a conflict, its use rolled back).
    for (const r of results) {
      if (r.status === "rejected") {
        expect(r.reason).toMatchObject({ code: "CONFLICT" });
      }
    }
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
    expect(await usesOf(code)).toBe(1);
    expect((await inviteeMembership(c.id))?.status).toBe("active");
    expect(await joinedEvents(c.id)).toHaveLength(1);
  });

  it("an activation that loses to a membership change spends no use", async () => {
    const [{ activateMembership }, { consumeInviteUse }] = await Promise.all([
      import("@/server/communities/activate-membership"),
      import("@/server/communities/invite-uses"),
    ]);
    const c = await community("invite_only", "invited");
    const code = await inviteLink(c.id, { maxUses: 1 });
    const invite = await m.db.query.communityInvites.findFirst({
      where: m.eq(m.schema.communityInvites.code, code),
    });
    const row = await inviteeMembership(c.id);
    // The caller read the row before it changed (e.g. it was banned since).
    await m.db
      .update(m.schema.communityMemberships)
      .set({ status: "banned" })
      .where(m.eq(m.schema.communityMemberships.id, row!.id));

    const activated = await activateMembership(m.db, {
      communityId: c.id,
      userId: inviteeId,
      existing: { id: row!.id, status: "invited" },
      alongside: async (tx) => {
        if (!(await consumeInviteUse(tx, invite!))) throw new Error("used");
      },
    });
    expect(activated).toBe(false);
    expect(await usesOf(code)).toBe(0);
    expect((await inviteeMembership(c.id))?.status).toBe("banned");
    expect(await joinedEvents(c.id)).toHaveLength(0);
  });

  it("two joins racing: one joins, the other gets a conflict, never a 500", async () => {
    const c = await community("open");
    const results = await Promise.allSettled([
      as(inviteeId).communities.join({ slug: c.slug }),
      as(inviteeId).communities.join({ slug: c.slug }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({
      reason: { code: "CONFLICT" },
    });
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
    expect(await joinedEvents(c.id)).toHaveLength(1);
  });

  // ─── Agents ─────────────────────────────────────────────────────────────

  function asAgentOf(ownerUserId: string) {
    fake.agent = {
      agentId: `it-inv-agent-${sfx}`,
      ownerId: ownerUserId,
      scopes: ["read", "contribute"],
    };
    return m.createCaller({
      db: m.db,
      session: null,
      headers: new Headers({ authorization: "Bearer test-key" }),
    });
  }

  it("an agent cannot redeem an invite bound to someone else's email", async () => {
    const c = await community("invite_only");
    const code = await inviteLink(c.id, {
      targetEmail: `${otherId}@example.test`,
    });
    await expect(
      asAgentOf(inviteeId).agent.acceptCommunityInvite({ code }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await usesOf(code)).toBe(0);
    expect(await inviteeMembership(c.id)).toBeUndefined();
  });

  it("an agent redeems an invite bound to its owner's email, keeping the inviter", async () => {
    const c = await community("invite_only", "invited");
    await m.db
      .update(m.schema.communityMemberships)
      .set({ invitedBy: null })
      .where(
        m.and(
          m.eq(m.schema.communityMemberships.communityId, c.id),
          m.eq(m.schema.communityMemberships.userId, inviteeId),
        ),
      );
    const code = await inviteLink(c.id, {
      targetEmail: ` ${inviteeId.toUpperCase()}@EXAMPLE.TEST `,
      maxUses: 1,
    });
    await expect(
      asAgentOf(inviteeId).agent.acceptCommunityInvite({ code }),
    ).resolves.toMatchObject({ success: true, communitySlug: c.slug });
    expect(await usesOf(code)).toBe(1);
    // As before the shared helper: an existing row keeps its inviter.
    expect(await inviteeMembership(c.id)).toMatchObject({
      status: "active",
      invitedBy: null,
    });
  });

  it("an agent spends no use when its owner is already a member", async () => {
    const c = await community("invite_only", "active");
    const code = await inviteLink(c.id, { maxUses: 1 });
    await asAgentOf(inviteeId).agent.acceptCommunityInvite({ code });
    expect(await usesOf(code)).toBe(0);
  });
});
