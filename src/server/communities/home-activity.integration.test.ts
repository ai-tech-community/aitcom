// @vitest-environment node
/**
 * DB-INTEGRATION test for Home's "From your communities" (feed.getHomeActivity):
 * which communities feed it, the post rule per community, and paging across
 * communities. Against a REAL local DB + Payload.
 *
 *   RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 PAYLOAD_PUSH=false \
 *     NEON_LOCAL_PROXY=127.0.0.1:5433 \
 *     DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test \
 *     pnpm exec vitest run src/server/communities/home-activity.integration.test.ts
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

type MembershipStatus = "active" | "pending_approval" | "invited" | "banned";
type Role = "owner" | "admin" | "moderator" | "member";

describe.skipIf(!RUN_DB)("feed.getHomeActivity [DB integration]", () => {
  type Mods = {
    db: typeof import("@/server/db").db;
    schema: typeof import("@/server/db/schema");
    createCaller: typeof import("@/server/api/root").createCaller;
    payload: Awaited<
      ReturnType<typeof import("@/server/payload").getPayloadClient>
    >;
    plainTextToLexical: typeof import("@/server/challenge-engine/lexical").plainTextToLexical;
    ensureHub: typeof import("@/server/db/enroll-in-hub").ensureHub;
    home: typeof import("./home-activity");
    eq: typeof import("drizzle-orm").eq;
    inArray: typeof import("drizzle-orm").inArray;
    sql: typeof import("drizzle-orm").sql;
  };
  let m: Mods;

  let sfx: string;
  let viewerId: string;
  let authorId: string;
  const communityIds: string[] = [];
  const postIds: number[] = [];
  const threadIds: number[] = [];

  beforeAll(async () => {
    if (looksLikeCloudNeon(process.env.DATABASE_URL ?? "")) {
      throw new Error("Refusing to run against a cloud Neon DATABASE_URL.");
    }
    const [
      { db },
      schema,
      { createCaller },
      { getPayloadClient },
      lexical,
      drizzle,
      hubEnrollment,
      home,
    ] = await Promise.all([
      import("@/server/db"),
      import("@/server/db/schema"),
      import("@/server/api/root"),
      import("@/server/payload"),
      import("@/server/challenge-engine/lexical"),
      import("drizzle-orm"),
      import("@/server/db/enroll-in-hub"),
      import("./home-activity"),
    ]);
    m = {
      db,
      schema,
      createCaller,
      payload: await getPayloadClient(),
      plainTextToLexical: lexical.plainTextToLexical,
      ensureHub: hubEnrollment.ensureHub,
      home,
      eq: drizzle.eq,
      inArray: drizzle.inArray,
      sql: drizzle.sql,
    };
  }, 120_000);

  beforeEach(async () => {
    sfx = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    viewerId = `it-home-viewer-${sfx}`;
    authorId = `it-home-author-${sfx}`;
    await m.db.insert(m.schema.user).values([
      { id: viewerId, email: `${viewerId}@example.test`, name: "Viewer" },
      { id: authorId, email: `${authorId}@example.test`, name: "Author" },
    ]);
  });

  afterEach(async () => {
    for (const id of postIds) {
      await m.payload
        .delete({ collection: "feed-posts", id })
        .catch(() => null);
    }
    for (const id of threadIds) {
      await m.payload
        .delete({ collection: "forum-threads", id })
        .catch(() => null);
    }
    postIds.length = 0;
    threadIds.length = 0;
    if (communityIds.length > 0) {
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
    // The Hub itself stays: other tests and fixtures share it.
    await m.db
      .delete(m.schema.communityMemberships)
      .where(
        m.inArray(m.schema.communityMemberships.userId, [viewerId, authorId]),
      );
    await m.db
      .delete(m.schema.user)
      .where(m.inArray(m.schema.user.id, [viewerId, authorId]));
  });

  /**
   * A community the author owns, with the viewer's membership (or none).
   * Unlisted unless said otherwise.
   */
  async function community(
    name: string,
    viewer: { status: MembershipStatus; role?: Role } | null,
    listed = false,
  ) {
    const [row] = await m.db
      .insert(m.schema.communities)
      .values({
        name: `${name} ${sfx}`,
        slug: `${name}-${sfx}`,
        createdBy: authorId,
        isListedInDirectory: listed,
      })
      .returning({ id: m.schema.communities.id });
    communityIds.push(row!.id);
    await m.db.insert(m.schema.communityMemberships).values([
      { communityId: row!.id, userId: authorId, role: "owner" },
      ...(viewer
        ? [
            {
              communityId: row!.id,
              userId: viewerId,
              role: viewer.role ?? ("member" as const),
              status: viewer.status,
            },
          ]
        : []),
    ]);
    return row!.id;
  }

  async function post(
    communityId: string,
    content: string,
    options: {
      visibility?: "community" | "public";
      hidden?: boolean;
      pinned?: boolean;
      at?: string;
    } = {},
  ) {
    const doc = await m.payload.create({
      collection: "feed-posts",
      data: {
        content,
        authorId,
        authorName: "Author",
        communityId,
        topicSlug: "general",
        visibility: options.visibility ?? "public",
        ...(options.hidden ? { hiddenAt: new Date().toISOString() } : {}),
        ...(options.pinned ? { isPinned: true } : {}),
      },
    });
    postIds.push(doc.id);
    if (options.at) {
      await m.db.execute(
        m.sql`UPDATE "feed_posts" SET "created_at" = ${options.at}::timestamptz WHERE "id" = ${doc.id}`,
      );
    }
    return doc.id;
  }

  async function thread(communityId: string, title: string) {
    const doc = await m.payload.create({
      collection: "forum-threads",
      data: {
        title,
        slug: `${title}-${sfx}`,
        content: m.plainTextToLexical(`${title} body`),
        category: "general",
        authorId,
        authorName: "Author",
        communityId,
      },
    });
    threadIds.push(doc.id);
    return doc.id;
  }

  function asViewer() {
    return m.createCaller({
      db: m.db,
      session: { user: { id: viewerId, name: "Viewer" } } as never,
      headers: new Headers(),
    });
  }

  async function allItems() {
    const caller = asViewer();
    const items = [];
    let cursor: { at: string; key: string } | null = null;
    do {
      const page: Awaited<ReturnType<typeof caller.feed.getHomeActivity>> =
        await caller.feed.getHomeActivity({ limit: 30, cursor });
      items.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);
    return items;
  }

  it("shows only communities where the viewer is an active member", async () => {
    const active = await community("active", { status: "active" });
    const listedActive = await community("listed", { status: "active" }, true);
    const invited = await community("invited", { status: "invited" });
    const pending = await community("pending", {
      status: "pending_approval",
    });
    const banned = await community("banned", { status: "banned" });
    const stranger = await community("stranger", null);

    const shown = [
      await post(active, "In active"),
      await post(listedActive, "In listed"),
    ];
    const notShown = [
      await post(invited, "In invited"),
      await post(pending, "In pending"),
      await post(banned, "In banned"),
      await post(stranger, "In stranger"),
    ];
    const shownThread = await thread(active, "active-thread");
    await thread(invited, "invited-thread");
    await thread(stranger, "stranger-thread");

    const items = await allItems();

    expect(new Set(items.map((item) => item.communityId))).toEqual(
      new Set([active, listedActive]),
    );
    for (const item of items) {
      expect(item.community.id).toBe(item.communityId);
    }
    const postIdsShown = items.flatMap((item) =>
      item.kind === "post" ? [item.post.id] : [],
    );
    expect(postIdsShown.sort()).toEqual([...shown].sort());
    for (const id of notShown) expect(postIdsShown).not.toContain(id);
    expect(
      items.flatMap((item) => (item.kind === "thread" ? [item.thread.id] : [])),
    ).toEqual([shownThread]);
    const activeItem = items.find((item) => item.communityId === active)!;
    expect(activeItem.community).toMatchObject({
      slug: `active-${sfx}`,
      name: `active ${sfx}`,
      logoUrl: null,
      viewerRole: "member",
    });
  });

  it("says when the viewer belongs to no community", async () => {
    await community("invited", { status: "invited" });
    const page = await asViewer().feed.getHomeActivity({ limit: 15 });
    expect(page).toEqual({
      items: [],
      nextCursor: null,
      hasJoinedCommunities: false,
    });
  });

  /** The viewer's Hub membership, joined at `joinedAt`. */
  async function joinHub(joinedAt = new Date()) {
    const hub = await m.ensureHub(m.db);
    await m.db.insert(m.schema.communityMemberships).values({
      communityId: hub.id,
      userId: viewerId,
      status: "active",
      joinedAt,
    });
    return hub.id;
  }

  it("counts only communities besides the Hub as joined, and keeps the Hub in the stream", async () => {
    const hubId = await joinHub();
    const hubOnly = await m.home.loadHomeCommunities(m.db, viewerId);
    expect(hubOnly.map((c) => c.id)).toEqual([hubId]);
    expect(
      (await asViewer().feed.getHomeActivity({ limit: 15 }))
        .hasJoinedCommunities,
    ).toBe(false);

    await community("joined", { status: "active" });
    expect(
      (await asViewer().feed.getHomeActivity({ limit: 15 }))
        .hasJoinedCommunities,
    ).toBe(true);
  });

  it("keeps the Hub and the most recently joined communities past the cap", async () => {
    const cap = m.home.HOME_COMMUNITY_CAP;
    const start = Date.UTC(2026, 0, 1);
    // The Hub is the oldest membership, as it is for most members.
    const hubId = await joinHub(new Date(start));
    const rows = await m.db
      .insert(m.schema.communities)
      .values(
        Array.from({ length: cap + 1 }, (_, i) => ({
          name: `cap ${i} ${sfx}`,
          slug: `cap-${i}-${sfx}`,
          createdBy: authorId,
        })),
      )
      .returning({
        id: m.schema.communities.id,
        slug: m.schema.communities.slug,
      });
    const bySlug = new Map(rows.map((row) => [row.slug, row.id]));
    const ids = Array.from(
      { length: cap + 1 },
      (_, i) => bySlug.get(`cap-${i}-${sfx}`)!,
    );
    communityIds.push(...ids);
    await m.db.insert(m.schema.communityMemberships).values(
      ids.map((communityId, i) => ({
        communityId,
        userId: viewerId,
        status: "active" as const,
        // Community i was joined i minutes after the Hub.
        joinedAt: new Date(start + (i + 1) * 60_000),
      })),
    );

    const kept = (await m.home.loadHomeCommunities(m.db, viewerId)).map(
      (c) => c.id,
    );

    expect(kept).toHaveLength(cap);
    expect(kept[0]).toBe(hubId);
    // Hub + the newest cap-1: the two oldest non-Hub memberships drop out.
    expect(kept.slice(1)).toEqual(ids.slice(2).reverse());
  });

  it("shows pinned posts at their own time on Home, but apart on the Overview", async () => {
    const memberOf = await community("pins", { status: "active" });
    const older = await post(memberOf, "Older", {
      at: new Date(Date.UTC(2026, 8, 20, 9)).toISOString(),
    });
    const pinned = await post(memberOf, "Pinned", {
      pinned: true,
      at: new Date(Date.UTC(2026, 8, 20, 10)).toISOString(),
    });
    const newer = await post(memberOf, "Newer", {
      at: new Date(Date.UTC(2026, 8, 20, 11)).toISOString(),
    });

    const home = (await allItems()).flatMap((item) =>
      item.kind === "post" ? [item.post.id] : [],
    );
    expect(home).toEqual([newer, pinned, older]);

    const overview = await asViewer().feed.getActivity({
      communitySlug: `pins-${sfx}`,
    });
    expect(overview.pinned.map((p) => p.id)).toEqual([pinned]);
    expect(
      overview.items.flatMap((item) =>
        item.kind === "post" ? [item.post.id] : [],
      ),
    ).toEqual([newer, older]);
  });

  it("applies the post rule per community: members-only shows, reported posts only where the viewer moderates", async () => {
    const memberOf = await community("member", { status: "active" });
    const moderates = await community("moderates", {
      status: "active",
      role: "moderator",
    });
    const membersOnly = await post(memberOf, "Members only", {
      visibility: "community",
    });
    const reportedThere = await post(memberOf, "Reported, member", {
      hidden: true,
    });
    const reportedHere = await post(moderates, "Reported, moderator", {
      hidden: true,
    });

    const shown = (await allItems()).flatMap((item) =>
      item.kind === "post" ? [item.post.id] : [],
    );

    expect(shown).toContain(membersOnly);
    expect(shown).toContain(reportedHere);
    expect(shown).not.toContain(reportedThere);
  });

  it("pages across communities without repeats or gaps, also on tied instants", async () => {
    const first = await community("first", { status: "active" });
    const second = await community("second", { status: "active" });
    const expected: number[] = [];
    for (let i = 0; i < 6; i++) {
      // Both communities post at the same instant, every hour.
      const at = new Date(Date.UTC(2026, 8, 20, 12 - i)).toISOString();
      expected.push(await post(first, `First ${i}`, { at }));
      expected.push(await post(second, `Second ${i}`, { at }));
    }

    const caller = asViewer();
    const everything = await caller.feed.getHomeActivity({ limit: 30 });
    expect(everything.nextCursor).toBeNull();

    const paged: string[] = [];
    let cursor: { at: string; key: string } | null = null;
    let pages = 0;
    do {
      const page: Awaited<ReturnType<typeof caller.feed.getHomeActivity>> =
        await caller.feed.getHomeActivity({ limit: 4, cursor });
      paged.push(...page.items.map((item) => item.key));
      cursor = page.nextCursor;
      pages++;
    } while (cursor && pages < 20);

    expect(new Set(paged).size).toBe(paged.length);
    expect(paged).toEqual(everything.items.map((item) => item.key));
    expect(
      everything.items.flatMap((item) =>
        item.kind === "post" ? [item.post.id] : [],
      ),
    ).toEqual(expect.arrayContaining(expected));
  });
});
