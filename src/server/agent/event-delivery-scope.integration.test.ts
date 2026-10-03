// @vitest-environment node
/**
 * DB-INTEGRATION test: agents receive only events their owner may read, on
 * every delivery path (the webhook cron, the realtime inbox wake, and
 * agent.getNotifications), under one delivery policy.
 *
 *   RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 NEON_LOCAL_PROXY=127.0.0.1:5433 \
 *     DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test \
 *     pnpm vitest run src/server/agent/event-delivery-scope.integration.test.ts
 *
 * Fixture rows are dated a century ahead so the cron cursor and the
 * newest-first notification query see only this test's rows.
 */
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";

vi.mock("./validate-webhook-url", () => ({
  validateWebhookUrl: vi.fn().mockResolvedValue({ ok: true }),
}));

// Agent calls authenticate with an API key; stub only the key lookup so a
// test can pick the calling agent. Everything else runs for real.
const agentKey = vi.hoisted(() => ({
  agentId: null as string | null,
  ownerId: null as string | null,
}));
vi.mock("@/server/agent/api-key", () => ({
  validateApiKey: vi.fn(async () => ({
    agentId: agentKey.agentId,
    ownerId: agentKey.ownerId,
    scopes: ["read"],
    status: "active",
  })),
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

const RICH_TEXT = {
  root: {
    type: "root",
    direction: "ltr" as const,
    format: "" as const,
    indent: 0,
    version: 1,
    children: [
      {
        type: "paragraph",
        version: 1,
        children: [{ type: "text", text: "delivery scope test" }],
      },
    ],
  },
};

const ALL_CATEGORIES = [
  "forum",
  "challenges",
  "inbox",
  "content",
  "events",
  "community",
  "benchmark",
];

describe.skipIf(!RUN_DB)("agent event delivery scope [DB integration]", () => {
  type Mods = {
    db: typeof import("@/server/db").db;
    schema: typeof import("@/server/db/schema");
    createCaller: typeof import("@/server/api/root").createCaller;
    payload: Awaited<
      ReturnType<typeof import("@/server/payload").getPayloadClient>
    >;
    dispatchWebhooks: typeof import("./webhook-dispatch").dispatchWebhooks;
    dispatchEventImmediately: typeof import("./dispatch-immediate").dispatchEventImmediately;
    eq: typeof import("drizzle-orm").eq;
    inArray: typeof import("drizzle-orm").inArray;
  };
  let m: Mods;

  type Person = { userId: string; agentId: string; url: string };
  let sfx: string;
  let base: number;
  let member: Person; // member of the unlisted and the listed community
  let coMember: Person; // member of the unlisted community only
  let outsider: Person; // member of neither
  let unlisted: { id: string; slug: string };
  let listed: { id: string; slug: string };
  const payloadEventIds: number[] = [];
  const activityIds: string[] = [];
  let fetchMock: MockInstance<typeof fetch>;

  beforeAll(async () => {
    if (looksLikeCloudNeon(process.env.DATABASE_URL ?? "")) {
      throw new Error("Refusing to run against a cloud Neon DATABASE_URL.");
    }
    const [
      { db },
      schema,
      { createCaller },
      { getPayloadClient },
      { dispatchWebhooks },
      { dispatchEventImmediately },
      drizzle,
    ] = await Promise.all([
      import("@/server/db"),
      import("@/server/db/schema"),
      import("@/server/api/root"),
      import("@/server/payload"),
      import("./webhook-dispatch"),
      import("./dispatch-immediate"),
      import("drizzle-orm"),
    ]);
    m = {
      db,
      schema,
      createCaller,
      payload: await getPayloadClient(),
      dispatchWebhooks,
      dispatchEventImmediately,
      eq: drizzle.eq,
      inArray: drizzle.inArray,
    };
  }, 120_000);

  async function createPerson(label: string): Promise<Person> {
    const { db, schema } = m;
    const userId = `it-scope-${label}-${sfx}`;
    await db
      .insert(schema.user)
      .values({ id: userId, email: `${userId}@example.test`, name: label });
    const [agent] = await db
      .insert(schema.agentProfiles)
      .values({ ownerId: userId, name: `Agent ${label} ${sfx}` })
      .returning({ id: schema.agentProfiles.id });
    const url = `https://example.com/hook/${userId}`;
    await db.insert(schema.agentWebhooks).values({
      agentId: agent!.id,
      ownerId: userId,
      url,
      secret: "test-secret",
      categories: ALL_CATEGORIES,
      // Just before this test's rows, so the cron run starts at them.
      cursor: new Date(base - 1000),
      isEnabled: true,
      status: "active",
    });
    return { userId, agentId: agent!.id, url };
  }

  async function createEvent(
    label: string,
    communityId: string,
    status: "published" | "draft",
  ): Promise<number> {
    const doc = await m.payload.create({
      collection: "events",
      data: {
        title: `Scope ${label} ${sfx}`,
        slug: `it-scope-${label}-${sfx}`,
        description: RICH_TEXT,
        type: "meetup" as const,
        status,
        date: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
        startTime: "19:00",
        timezone: "Europe/Amsterdam",
        location: "Test Lab",
        communityId,
      } as never,
      context: { skipGeocode: true },
    });
    payloadEventIds.push(Number(doc.id));
    return Number(doc.id);
  }

  let seq = 0;
  async function activity(
    row: Partial<typeof m.schema.activityEvents.$inferInsert> & {
      action: string;
    },
  ): Promise<string> {
    const [inserted] = await m.db
      .insert(m.schema.activityEvents)
      .values({
        actorId: member.userId,
        actorType: "member",
        createdAt: new Date(base + seq++ * 1000),
        ...row,
      })
      .returning({ id: m.schema.activityEvents.id });
    activityIds.push(inserted!.id);
    return inserted!.id;
  }

  beforeEach(async () => {
    const { db, schema } = m;
    sfx = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    base =
      Date.now() + 100 * 365 * 86_400_000 + Math.floor(Math.random() * 1e9);
    seq = 0;
    member = await createPerson("member");
    coMember = await createPerson("comember");
    outsider = await createPerson("outsider");
    const [u, l] = await db
      .insert(schema.communities)
      .values([
        {
          name: `Scope unlisted ${sfx}`,
          slug: `scope-unlisted-${sfx}`,
          createdBy: member.userId,
          isListedInDirectory: false,
        },
        {
          name: `Scope listed ${sfx}`,
          slug: `scope-listed-${sfx}`,
          createdBy: member.userId,
          isListedInDirectory: true,
        },
      ])
      .returning();
    unlisted = { id: u!.id, slug: u!.slug };
    listed = { id: l!.id, slug: l!.slug };
    await db.insert(schema.communityMemberships).values([
      { communityId: unlisted.id, userId: member.userId, status: "active" },
      { communityId: listed.id, userId: member.userId, status: "active" },
      { communityId: unlisted.id, userId: coMember.userId, status: "active" },
    ]);
    fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({ ok: true, status: 200 } as Response);
  });

  afterEach(async () => {
    const { db, schema, eq, inArray } = m;
    vi.restoreAllMocks();
    if (activityIds.length > 0) {
      await db
        .delete(schema.activityEvents)
        .where(inArray(schema.activityEvents.id, activityIds));
    }
    activityIds.length = 0;
    for (const id of payloadEventIds) {
      await m.payload
        .delete({ collection: "events", id, overrideAccess: true })
        .catch(() => null);
    }
    payloadEventIds.length = 0;
    const communityIds = [unlisted.id, listed.id];
    await db
      .delete(schema.communityMemberships)
      .where(inArray(schema.communityMemberships.communityId, communityIds));
    await db
      .delete(schema.communities)
      .where(inArray(schema.communities.id, communityIds));
    for (const p of [member, coMember, outsider]) {
      await db
        .delete(schema.agentWebhooks)
        .where(eq(schema.agentWebhooks.agentId, p.agentId));
      await db
        .delete(schema.agentProfiles)
        .where(eq(schema.agentProfiles.id, p.agentId));
      await db.delete(schema.user).where(eq(schema.user.id, p.userId));
    }
    agentKey.agentId = null;
    agentKey.ownerId = null;
  });

  type Delivered = {
    type: string;
    eventId: string;
    data: { metadata: Record<string, unknown> };
  };
  function deliveredTo(p: Person): Delivered[] {
    return fetchMock.mock.calls
      .filter(([url]) => url === p.url)
      .map(([, init]) => JSON.parse(init!.body as string) as Delivered);
  }
  function idsDeliveredTo(p: Person): string[] {
    return deliveredTo(p)
      .map((d) => d.eventId)
      .sort();
  }
  const sorted = (ids: string[]) => [...ids].sort();

  /** One row per audience rule the cron must honour. */
  async function seedEvents() {
    const publishedInUnlisted = await createEvent(
      "pub",
      unlisted.id,
      "published",
    );
    const draftInListed = await createEvent("draft", listed.id, "draft");
    const e = {
      unlistedThread: await activity({
        action: "thread.create",
        communityId: unlisted.id,
        targetType: "forum-threads",
        targetId: "1",
        metadata: {
          title: "Unlisted plans",
          category: "general",
          slug: "unlisted-plans",
          ritualId: 9,
          internal: "not for agents",
        },
      }),
      unlistedIdea: await activity({
        action: "idea.submitted",
        communityId: unlisted.id,
        metadata: { title: "Unlisted idea" },
      }),
      unlistedEnroll: await activity({
        action: "challenge.enrolled",
        communityId: unlisted.id,
        metadata: { title: "Unlisted challenge", ownerId: member.userId },
      }),
      unlistedEventCreate: await activity({
        action: "event.create",
        communityId: unlisted.id,
        targetType: "event",
        targetId: String(publishedInUnlisted),
        metadata: { title: "Unlisted meetup", communitySlug: unlisted.slug },
      }),
      // Written without communityId: the community comes from the event.
      unlistedEventCancel: await activity({
        action: "event.cancel",
        targetType: "event",
        targetId: String(publishedInUnlisted),
        metadata: { communitySlug: unlisted.slug },
      }),
      draftEventUpdate: await activity({
        action: "event.update",
        targetType: "event",
        targetId: String(draftInListed),
        metadata: { title: "Pending meetup", communitySlug: listed.slug },
      }),
      listedThread: await activity({
        action: "thread.create",
        communityId: listed.id,
        metadata: { title: "Listed plans", category: "general", slug: "lp" },
      }),
      hubThread: await activity({
        action: "thread.create",
        communityId: null,
        metadata: { title: "Hub plans", category: "general", slug: "hp" },
      }),
      unknownCommunityThread: await activity({
        action: "thread.create",
        communityId: `missing-${sfx}`,
        metadata: { title: "Ghost", category: "general", slug: "g" },
      }),
      replyToMember: await activity({
        action: "thread.reply",
        actorId: coMember.userId,
        communityId: unlisted.id,
        recipientId: member.userId,
        metadata: {
          threadTitle: "Unlisted plans",
          threadSlug: "unlisted-plans",
          threadAuthorId: member.userId,
        },
      }),
      dmToCoMember: await activity({
        action: "message.sent",
        recipientId: coMember.userId,
        targetType: "conversations",
        targetId: `conv-${sfx}`,
      }),
      listedRegister: await activity({
        action: "event.register",
        communityId: listed.id,
        targetType: "event",
        targetId: "1",
        metadata: { eventTitle: "Listed meetup" },
      }),
      approvalForCoMember: await activity({
        action: "challenge.solution_approved",
        targetType: "challenges",
        targetId: "1",
        metadata: { participantUserId: coMember.userId, objectiveIndex: 0 },
      }),
      notListed: await activity({
        action: "knowledge.updated",
        metadata: { title: "Not a deliverable action" },
      }),
    };
    return e;
  }

  describe("webhook cron", () => {
    it("delivers each event only to agents whose owner may read it", async () => {
      const e = await seedEvents();

      await m.dispatchWebhooks(m.db);

      expect(idsDeliveredTo(member)).toEqual(
        sorted([
          e.unlistedThread,
          e.unlistedIdea,
          e.unlistedEnroll,
          e.unlistedEventCreate,
          e.unlistedEventCancel,
          e.listedThread,
          e.hubThread,
          e.replyToMember,
          e.listedRegister,
        ]),
      );
      expect(idsDeliveredTo(coMember)).toEqual(
        sorted([
          e.unlistedThread,
          e.unlistedIdea,
          e.unlistedEnroll,
          e.unlistedEventCreate,
          e.unlistedEventCancel,
          e.listedThread,
          e.hubThread,
          e.replyToMember,
          e.dmToCoMember,
          e.approvalForCoMember,
        ]),
      );
      expect(idsDeliveredTo(outsider)).toEqual(
        sorted([e.listedThread, e.hubThread]),
      );
    });

    it("never delivers an attendee registration to another member's agent", async () => {
      const e = await seedEvents();
      await m.dispatchWebhooks(m.db);
      for (const p of [coMember, outsider]) {
        expect(idsDeliveredTo(p)).not.toContain(e.listedRegister);
      }
    });

    it("delivers only the action's listed metadata fields", async () => {
      const e = await seedEvents();
      await m.dispatchWebhooks(m.db);

      const thread = deliveredTo(coMember).find(
        (d) => d.eventId === e.unlistedThread,
      );
      expect(thread?.data.metadata).toEqual({
        title: "Unlisted plans",
        category: "general",
        slug: "unlisted-plans",
      });
      const enroll = deliveredTo(coMember).find(
        (d) => d.eventId === e.unlistedEnroll,
      );
      expect(enroll?.data.metadata).toEqual({ title: "Unlisted challenge" });
      const reply = deliveredTo(member).find(
        (d) => d.eventId === e.replyToMember,
      );
      expect(reply?.data.metadata).toEqual({
        threadTitle: "Unlisted plans",
        threadSlug: "unlisted-plans",
      });
    });

    it("stops delivering a community's events once the owner leaves it", async () => {
      await m.db
        .delete(m.schema.communityMemberships)
        .where(m.eq(m.schema.communityMemberships.userId, coMember.userId));
      const e = await seedEvents();
      await m.dispatchWebhooks(m.db);
      expect(idsDeliveredTo(coMember)).toEqual(
        sorted([
          e.listedThread,
          e.hubThread,
          e.dmToCoMember,
          e.approvalForCoMember,
        ]),
      );
    });
  });

  describe("realtime inbox wake", () => {
    it("wakes only the recipient's agent", async () => {
      const id = await activity({
        action: "message.sent",
        recipientId: coMember.userId,
        targetType: "conversations",
        targetId: `conv-${sfx}`,
      });
      const [row] = await m.db
        .select()
        .from(m.schema.activityEvents)
        .where(m.eq(m.schema.activityEvents.id, id));

      await m.dispatchEventImmediately(m.db, row!);

      expect(idsDeliveredTo(coMember)).toEqual([id]);
      expect(idsDeliveredTo(member)).toEqual([]);
      expect(idsDeliveredTo(outsider)).toEqual([]);
    });

    it("wakes no one for a message without a recipient", async () => {
      const id = await activity({
        action: "message.sent",
        recipientId: null,
        targetType: "conversations",
        targetId: `conv-${sfx}`,
      });
      const [row] = await m.db
        .select()
        .from(m.schema.activityEvents)
        .where(m.eq(m.schema.activityEvents.id, id));

      await m.dispatchEventImmediately(m.db, row!);

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("agent.getNotifications", () => {
    async function notificationIds(p: Person): Promise<string[]> {
      agentKey.agentId = p.agentId;
      agentKey.ownerId = p.userId;
      const caller = m.createCaller({
        db: m.db,
        headers: new Headers({ authorization: "Bearer test-key" }),
        session: null,
      });
      const res = await caller.agent.getNotifications({
        since: new Date(base - 1000).toISOString(),
        limit: 50,
      });
      return res.map((n) => n.id).sort();
    }

    it("follows the same rules as webhook delivery", async () => {
      const e = await seedEvents();

      expect(await notificationIds(member)).toEqual(
        sorted([
          e.unlistedThread,
          e.unlistedIdea,
          e.listedThread,
          e.hubThread,
          e.replyToMember,
        ]),
      );
      expect(await notificationIds(coMember)).toEqual(
        sorted([
          e.unlistedThread,
          e.unlistedIdea,
          e.listedThread,
          e.hubThread,
          e.replyToMember,
        ]),
      );
      expect(await notificationIds(outsider)).toEqual(
        sorted([e.listedThread, e.hubThread]),
      );
    });
  });
});
