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
} from "vitest";

vi.mock("./validate-webhook-url", () => ({
  validateWebhookUrl: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("@/server/net/pinned-transport", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/net/pinned-transport")>()),
  pinnedFetch: vi.fn(),
}));

import { pinnedFetch } from "@/server/net/pinned-transport";

const fetchMock = vi.mocked(pinnedFetch);

// Updating an event runs the Events geocode hook, which calls the public
// Nominatim service. Keep the suite offline: no place resolves.
vi.mock("@/server/geocoding/nominatim", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/geocoding/nominatim")>()),
  geocodeEvent: vi.fn().mockResolvedValue(null),
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
    and: typeof import("drizzle-orm").and;
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
  const extraCommunityIds: string[] = [];
  const activityIds: string[] = [];

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
      and: drizzle.and,
      inArray: drizzle.inArray,
    };
  }, 120_000);

  async function createPerson(label: string): Promise<Person> {
    const { db, schema } = m;
    const userId = `it-scope-${label}-${sfx}`;
    await db
      .insert(schema.user)
      .values({ id: userId, email: `${userId}@example.test`, name: label });
    await db.insert(schema.memberProfiles).values({
      userId,
      displayName: `Scope ${label} ${sfx}`,
      xp: 0,
      level: 1,
      isPublic: true,
    });
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
    extra: Record<string, unknown> = {},
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
        ...extra,
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
      {
        communityId: listed.id,
        userId: member.userId,
        status: "active",
        role: "admin",
      },
      { communityId: unlisted.id, userId: coMember.userId, status: "active" },
    ]);
    fetchMock.mockResolvedValue({ ok: true, status: 200 } as never);
  });

  afterEach(async () => {
    const { db, schema, eq, inArray } = m;
    vi.restoreAllMocks();
    fetchMock.mockReset();
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
    const communityIds = [unlisted.id, listed.id, ...extraCommunityIds];
    extraCommunityIds.length = 0;
    await db
      .delete(schema.communityMemberships)
      .where(inArray(schema.communityMemberships.communityId, communityIds));
    await db
      .delete(schema.communities)
      .where(inArray(schema.communities.id, communityIds));
    for (const p of [member, coMember, outsider]) {
      await db
        .delete(schema.notifications)
        .where(eq(schema.notifications.userId, p.userId));
      await db
        .delete(schema.agentWebhooks)
        .where(eq(schema.agentWebhooks.agentId, p.agentId));
      await db
        .delete(schema.agentProfiles)
        .where(eq(schema.agentProfiles.id, p.agentId));
      await db
        .delete(schema.memberProfiles)
        .where(eq(schema.memberProfiles.userId, p.userId));
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
          // The actor's own agents keep their own activity.
          e.draftEventUpdate,
          e.unknownCommunityThread,
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
          // Their own reply stays with them.
          e.replyToMember,
        ]),
      );
    });
  });

  describe("person-scoped and membership rules", () => {
    it("never sends an idea vote to other members' agents", async () => {
      const id = await activity({
        action: "idea.voted",
        communityId: listed.id,
        targetType: "community-ideas",
        targetId: "1",
        metadata: { title: "Listed idea" },
      });
      await m.dispatchWebhooks(m.db);
      expect(idsDeliveredTo(member)).toEqual([id]);
      expect(idsDeliveredTo(coMember)).toEqual([]);
      expect(idsDeliveredTo(outsider)).toEqual([]);
    });

    it("sends an event rejection to the submitter's agent", async () => {
      const eventId = await createEvent("rejected", listed.id, "draft", {
        submittedBy: coMember.userId,
      });
      const caller = m.createCaller({
        db: m.db,
        headers: new Headers(),
        session: { user: { id: member.userId }, session: {} } as never,
      });
      await caller.events.rejectEvent({
        eventId,
        communitySlug: listed.slug,
      });
      // Move the router's row into this test's window.
      const [row] = await m.db
        .update(m.schema.activityEvents)
        .set({ createdAt: new Date(base + seq++ * 1000) })
        .where(
          m.and(
            m.eq(m.schema.activityEvents.action, "event.reject"),
            m.eq(m.schema.activityEvents.targetId, String(eventId)),
          ),
        )
        .returning();
      activityIds.push(row!.id);
      expect(row!.metadata).toMatchObject({ submittedBy: coMember.userId });

      await m.dispatchWebhooks(m.db);

      expect(idsDeliveredTo(coMember)).toEqual([row!.id]);
      expect(idsDeliveredTo(member)).toEqual([row!.id]);
      expect(idsDeliveredTo(outsider)).toEqual([]);
      expect(deliveredTo(coMember)[0]!.data.metadata).toEqual({
        communitySlug: listed.slug,
      });
    });

    it("keeps a public actor's own challenge events in a community their owner cannot read", async () => {
      const [other] = await m.db
        .insert(m.schema.communities)
        .values({
          name: `Scope other ${sfx}`,
          slug: `scope-other-${sfx}`,
          createdBy: coMember.userId,
          isListedInDirectory: false,
        })
        .returning();
      extraCommunityIds.push(other!.id);
      const ids = [
        await activity({
          action: "challenge.enrolled",
          communityId: other!.id,
          metadata: { title: "Race" },
        }),
        await activity({
          action: "challenge.completed",
          communityId: other!.id,
          metadata: { title: "Race" },
        }),
      ];
      await m.dispatchWebhooks(m.db);
      expect(idsDeliveredTo(member)).toEqual(sorted(ids));
      expect(idsDeliveredTo(coMember)).toEqual([]);
      expect(idsDeliveredTo(outsider)).toEqual([]);
    });

    it.each(["pending_approval", "invited", "banned"] as const)(
      "treats a %s membership as unable to read an unlisted community",
      async (status) => {
        await m.db
          .update(m.schema.communityMemberships)
          .set({ status })
          .where(
            m.and(
              m.eq(m.schema.communityMemberships.userId, coMember.userId),
              m.eq(m.schema.communityMemberships.communityId, unlisted.id),
            ),
          );
        const id = await activity({
          action: "thread.create",
          communityId: unlisted.id,
          metadata: { title: "Members only", category: "general", slug: "mo" },
        });
        await m.dispatchWebhooks(m.db);
        expect(idsDeliveredTo(member)).toEqual([id]);
        expect(idsDeliveredTo(coMember)).toEqual([]);
      },
    );
  });

  describe("challenge race events and profile visibility", () => {
    async function setPublic(p: Person, isPublic: boolean) {
      await m.db
        .update(m.schema.memberProfiles)
        .set({ isPublic })
        .where(m.eq(m.schema.memberProfiles.userId, p.userId));
    }

    it("sends a public member's challenge completion to co-members' agents", async () => {
      const id = await activity({
        action: "challenge.completed",
        communityId: unlisted.id,
        targetType: "challenges",
        targetId: "1",
        metadata: { title: "Race", xp: 50 },
      });
      await m.dispatchWebhooks(m.db);
      expect(idsDeliveredTo(member)).toEqual([id]);
      expect(idsDeliveredTo(coMember)).toEqual([id]);
      expect(idsDeliveredTo(outsider)).toEqual([]);
    });

    it("sends a private member's challenge completion only to their own agent", async () => {
      await setPublic(member, false);
      const id = await activity({
        action: "challenge.completed",
        communityId: listed.id,
        targetType: "challenges",
        targetId: "1",
        metadata: { title: "Race" },
      });
      await m.dispatchWebhooks(m.db);
      expect(idsDeliveredTo(member)).toEqual([id]);
      expect(idsDeliveredTo(coMember)).toEqual([]);
      expect(idsDeliveredTo(outsider)).toEqual([]);
    });

    it("treats an acting agent as public only while it is visible and its owner is public", async () => {
      const enrolledBy = () =>
        activity({
          action: "challenge.enrolled",
          actorId: member.agentId,
          actorType: "agent",
          communityId: listed.id,
          targetType: "challenges",
          targetId: "1",
          metadata: { title: "Race" },
        });
      const visible = await enrolledBy();
      await m.dispatchWebhooks(m.db);
      expect(idsDeliveredTo(outsider)).toEqual([visible]);

      fetchMock.mockClear();
      await m.db
        .update(m.schema.agentProfiles)
        .set({ visibilityMode: "ghost" })
        .where(m.eq(m.schema.agentProfiles.id, member.agentId));
      await enrolledBy();
      await m.dispatchWebhooks(m.db);
      expect(idsDeliveredTo(outsider)).toEqual([]);
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

    it("returns readable rows older than a page of unreadable ones", async () => {
      const readable = await activity({
        action: "thread.create",
        communityId: listed.id,
        metadata: { title: "Listed", category: "general", slug: "l" },
      });
      const rows = Array.from({ length: 60 }, () => ({
        actorId: member.userId,
        actorType: "member",
        action: "thread.create",
        communityId: unlisted.id,
        metadata: { title: "Hidden", category: "general", slug: "h" },
        createdAt: new Date(base + seq++ * 1000),
      }));
      const inserted = await m.db
        .insert(m.schema.activityEvents)
        .values(rows)
        .returning({ id: m.schema.activityEvents.id });
      activityIds.push(...inserted.map((r) => r.id));

      agentKey.agentId = outsider.agentId;
      agentKey.ownerId = outsider.userId;
      const res = await m
        .createCaller({
          db: m.db,
          headers: new Headers({ authorization: "Bearer test-key" }),
          session: null,
        })
        .agent.getNotifications({
          since: new Date(base - 1000).toISOString(),
          limit: 5,
        });
      expect(res.map((n) => n.id)).toEqual([readable]);
    });

    it("counts in the briefing only activity the owner may read", async () => {
      await seedEvents();
      agentKey.agentId = outsider.agentId;
      agentKey.ownerId = outsider.userId;
      const briefing = await m
        .createCaller({
          db: m.db,
          headers: new Headers({ authorization: "Bearer test-key" }),
          session: null,
        })
        .agent.getBriefing({ since: new Date(base - 1000).toISOString() });
      // listedThread and hubThread only.
      expect(briefing.notifications).toBe(2);
      expect(briefing.notificationsCapped).toBe(false);
    });

    it("follows the same rules as webhook delivery", async () => {
      const e = await seedEvents();

      expect(await notificationIds(member)).toEqual(
        sorted([
          e.unlistedThread,
          e.unlistedIdea,
          e.listedThread,
          e.hubThread,
          e.replyToMember,
          e.unknownCommunityThread,
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
