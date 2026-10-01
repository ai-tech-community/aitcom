// @vitest-environment node
/**
 * DB-INTEGRATION test for @mentions in feed posts, against a REAL local DB
 * + Payload: which mentions a post keeps, who is told, and whom the editor
 * offers.
 *
 *   RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 PAYLOAD_PUSH=false \
 *     NEON_LOCAL_PROXY=127.0.0.1:5433 \
 *     DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test \
 *     pnpm exec vitest run src/server/communities/post-mentions.integration.test.ts
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

// Mention emails go through a fake: what would be sent, never sent.
const mail = vi.hoisted(() => ({
  send: vi.fn(async () => true),
  broadcast: vi.fn(async () => true),
}));
vi.mock("@/server/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/email")>()),
  sendPostMentionEmail: mail.send,
  sendBroadcastEmail: mail.broadcast,
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

describe.skipIf(!RUN_DB)("@mentions in feed posts [DB integration]", () => {
  type Mods = {
    db: typeof import("@/server/db").db;
    schema: typeof import("@/server/db/schema");
    createCaller: typeof import("@/server/api/root").createCaller;
    getPayloadClient: typeof import("@/server/payload").getPayloadClient;
    eq: typeof import("drizzle-orm").eq;
    and: typeof import("drizzle-orm").and;
    inArray: typeof import("drizzle-orm").inArray;
    sql: typeof import("drizzle-orm").sql;
  };
  let m: Mods;
  let fx: {
    communityId: string;
    slug: string;
    author: string;
    jane: string;
    janet: string;
    left: string;
    outsider: string;
  };
  const posts: number[] = [];

  beforeAll(async () => {
    if (looksLikeCloudNeon(process.env.DATABASE_URL ?? "")) {
      throw new Error("Refusing to run against a cloud Neon DATABASE_URL.");
    }
    const [{ db }, schema, { createCaller }, { getPayloadClient }, drizzle] =
      await Promise.all([
        import("@/server/db"),
        import("@/server/db/schema"),
        import("@/server/api/root"),
        import("@/server/payload"),
        import("drizzle-orm"),
      ]);
    m = {
      db,
      schema,
      createCaller,
      getPayloadClient,
      eq: drizzle.eq,
      and: drizzle.and,
      inArray: drizzle.inArray,
      sql: drizzle.sql,
    };
  });

  function allUsers() {
    return [fx.author, fx.jane, fx.janet, fx.left, fx.outsider];
  }

  beforeEach(async () => {
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    const id = (who: string) => `it-men-${who}-${suffix}`;
    fx = {
      communityId: "",
      slug: `men-${suffix}`,
      author: id("author"),
      jane: id("jane"),
      janet: id("janet"),
      left: id("left"),
      outsider: id("outsider"),
    };
    await m.db.insert(m.schema.user).values(
      allUsers().map((userId) => ({
        id: userId,
        email: `${userId}@example.test`,
        name: `Account ${userId}`,
      })),
    );
    // Jane has a public profile; Janet, whose name is the start of Jane's,
    // a private one; the member who left and the outsider are named too,
    // to prove they are refused.
    await m.db.insert(m.schema.memberProfiles).values([
      { userId: fx.jane, displayName: `Jane ${suffix} Doe`, isPublic: true },
      { userId: fx.janet, displayName: `Jane ${suffix}`, isPublic: false },
      { userId: fx.left, displayName: `Leaver ${suffix}` },
      { userId: fx.outsider, displayName: `Outsider ${suffix}` },
    ]);
    const [community] = await m.db
      .insert(m.schema.communities)
      .values({ name: `Men ${suffix}`, slug: fx.slug, createdBy: fx.author })
      .returning({ id: m.schema.communities.id });
    fx.communityId = community!.id;
    await m.db.insert(m.schema.communityMemberships).values([
      { communityId: fx.communityId, userId: fx.author, role: "owner" },
      { communityId: fx.communityId, userId: fx.jane, role: "member" },
      { communityId: fx.communityId, userId: fx.janet, role: "member" },
      {
        communityId: fx.communityId,
        userId: fx.left,
        role: "member",
        status: "banned",
      },
    ]);
  });

  afterEach(async () => {
    mail.send.mockClear();
    mail.broadcast.mockClear();
    await m.db
      .delete(m.schema.broadcastDeliveries)
      .where(m.eq(m.schema.broadcastDeliveries.communityId, fx.communityId));
    await m.db
      .delete(m.schema.broadcasts)
      .where(m.eq(m.schema.broadcasts.communityId, fx.communityId));
    await m.db
      .delete(m.schema.notificationOptouts)
      .where(m.eq(m.schema.notificationOptouts.communityId, fx.communityId));
    await m.db
      .delete(m.schema.hubMailPrefs)
      .where(m.inArray(m.schema.hubMailPrefs.userId, allUsers()));
    const payload = await m.getPayloadClient();
    for (const id of posts) {
      await payload.delete({ collection: "feed-posts", id }).catch(() => null);
    }
    posts.length = 0;
    await m.db
      .delete(m.schema.notifications)
      .where(m.eq(m.schema.notifications.communityId, fx.communityId));
    await m.db
      .delete(m.schema.communityMemberships)
      .where(m.eq(m.schema.communityMemberships.communityId, fx.communityId));
    await m.db
      .delete(m.schema.communities)
      .where(m.eq(m.schema.communities.id, fx.communityId));
    await m.db
      .delete(m.schema.memberProfiles)
      .where(m.inArray(m.schema.memberProfiles.userId, allUsers()));
    await m.db
      .delete(m.schema.user)
      .where(m.inArray(m.schema.user.id, allUsers()));
  });

  function caller(userId: string) {
    return m.createCaller({
      db: m.db,
      session: { user: { id: userId, name: "Author" } } as never,
      headers: new Headers(),
    });
  }

  async function names() {
    const rows = await m.db
      .select({
        userId: m.schema.memberProfiles.userId,
        name: m.schema.memberProfiles.displayName,
      })
      .from(m.schema.memberProfiles)
      .where(m.inArray(m.schema.memberProfiles.userId, allUsers()));
    return Object.fromEntries(rows.map((r) => [r.userId, r.name]));
  }

  async function saved(id: number) {
    const payload = await m.getPayloadClient();
    return payload.findByID({ collection: "feed-posts", id, depth: 0 });
  }

  async function toldUsers() {
    const rows = await m.db
      .select({
        userId: m.schema.notifications.userId,
        type: m.schema.notifications.type,
        metadata: m.schema.notifications.metadata,
      })
      .from(m.schema.notifications)
      .where(m.eq(m.schema.notifications.communityId, fx.communityId));
    return rows;
  }

  it("keeps checked mentions and tells each mentioned member once", async () => {
    const n = await names();
    const post = await caller(fx.author).feed.createPost({
      communitySlug: fx.slug,
      content: `Thanks @${n[fx.jane]} and @${n[fx.left]} and @${n[fx.outsider]}`,
      mentions: [fx.jane, fx.left, fx.outsider, fx.author, fx.janet],
    });
    posts.push(post.id);

    // Not a member (or no longer), or not in the text: left out.
    expect((await saved(post.id)).mentions).toEqual([
      { userId: fx.jane, name: n[fx.jane] },
    ]);
    const told = await toldUsers();
    expect(told).toEqual([
      {
        userId: fx.jane,
        type: "post_mention",
        metadata: {
          postId: post.id,
          reviewPath: `/communities/${fx.slug}`,
          linkLabel: "Open the feed",
        },
      },
    ]);

    // An edit that adds Janet tells Janet only; Jane was told already.
    await caller(fx.author).feed.editPost({
      postId: post.id,
      communitySlug: fx.slug,
      content: `Thanks @${n[fx.jane]} and @${n[fx.janet]}`,
      mentions: [fx.janet],
    });
    expect((await saved(post.id)).mentions).toEqual([
      { userId: fx.janet, name: n[fx.janet] },
      { userId: fx.jane, name: n[fx.jane] },
    ]);
    expect((await toldUsers()).map((r) => r.userId).sort()).toEqual(
      [fx.jane, fx.janet].sort(),
    );
  });

  it("emails each newly mentioned member once, unless they turned it off", async () => {
    const n = await names();
    // Janet turned mention mail off; Jane has no saved choice (default on).
    await m.db
      .insert(m.schema.hubMailPrefs)
      .values({ userId: fx.janet, mention: false });
    const post = await caller(fx.author).feed.createPost({
      communitySlug: fx.slug,
      content: `Hi @${n[fx.jane]} and @${n[fx.janet]}`,
      mentions: [fx.jane, fx.janet],
    });
    posts.push(post.id);
    // Outside a request the emails are sent before the save returns.
    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(mail.send).toHaveBeenCalledWith(`${fx.jane}@example.test`, {
      locale: "en",
      mail: {
        authorName: "Author",
        communityName: expect.stringMatching(/^Men /) as string,
        isVideo: false,
      },
      urls: {
        post: `/en/communities/${fx.slug}`,
        manage: "/en/dashboard/notifications",
      },
    });

    // An edit that keeps the mention emails no one again.
    await caller(fx.author).feed.editPost({
      postId: post.id,
      communitySlug: fx.slug,
      content: `Hi @${n[fx.jane]} and @${n[fx.janet]}!`,
      mentions: [fx.jane, fx.janet],
    });
    expect(mail.send).toHaveBeenCalledTimes(1);
  });

  it("limits mention emails per author, keeps a record members cannot delete, and frees a failed send", async () => {
    const n = await names();
    const mention = async (text: string) => {
      const post = await caller(fx.author).feed.createPost({
        communitySlug: fx.slug,
        content: `${text} @${n[fx.jane]}`,
        mentions: [fx.jane],
      });
      posts.push(post.id);
      return post.id;
    };
    // A failed send is not recorded, so it may be tried again.
    mail.send.mockResolvedValueOnce(false);
    await mention("First");
    expect(mail.send).toHaveBeenCalledTimes(1);
    const log = () =>
      m.db
        .select()
        .from(m.schema.postMentionMailLog)
        .where(m.eq(m.schema.postMentionMailLog.userId, fx.jane));
    expect(await log()).toHaveLength(0);

    const second = await mention("Second");
    expect(mail.send).toHaveBeenCalledTimes(2);
    expect(await log()).toHaveLength(1);
    // The same author again within the hour: in the app only.
    await mention("Third");
    expect(mail.send).toHaveBeenCalledTimes(2);
    expect((await toldUsers()).filter((r) => r.userId === fx.jane)).toHaveLength(
      3,
    );

    // Deleting the in-app notices does not bring the email back.
    await m.db
      .delete(m.schema.notifications)
      .where(m.eq(m.schema.notifications.communityId, fx.communityId));
    await m.db
      .delete(m.schema.postMentionMailLog)
      .where(
        m.and(
          m.eq(m.schema.postMentionMailLog.userId, fx.jane),
          m.sql`${m.schema.postMentionMailLog.postId} <> ${second}`,
        ),
      );
    await m.db.execute(
      m.sql`UPDATE "app"."post_mention_mail_log" SET "created_at" = now() - interval '2 hours'`,
    );
    await caller(fx.author).feed.editPost({
      postId: second,
      communitySlug: fx.slug,
      content: `Second, edited @${n[fx.jane]}`,
      mentions: [fx.jane],
    });
    expect(mail.send).toHaveBeenCalledTimes(2);
  });

  it("announces an owner's @everyone to the community once, minding opt-outs", async () => {
    // Janet stopped this community's announcements.
    await m.db.insert(m.schema.notificationOptouts).values({
      userId: fx.janet,
      communityId: fx.communityId,
      category: "broadcast",
    });
    const post = await caller(fx.author).feed.createPost({
      communitySlug: fx.slug,
      content: "Big news @everyone: we meet **Friday**!",
    });
    posts.push(post.id);
    expect((await toldUsers()).map((r) => r.userId)).toEqual([fx.jane]);
    const [notice] = await toldUsers();
    expect(notice).toMatchObject({
      type: "broadcast",
      metadata: expect.objectContaining({
        reviewPath: `/communities/${fx.slug}`,
        linkLabel: "Open the feed",
      }) as unknown,
    });
    expect(mail.broadcast).toHaveBeenCalledTimes(1);
    expect(mail.broadcast).toHaveBeenCalledWith(
      `${fx.jane}@example.test`,
      // No "@everyone" in the subject; why they got it under the text.
      expect.stringMatching(/^Author in Men .*: Big news we meet Friday!$/),
      expect.stringMatching(
        /^Big news @everyone: we meet Friday!\n\nYou're getting this because you're a member of Men /,
      ),
      { label: "Open the feed", url: `/en/communities/${fx.slug}` },
    );
    expect((await saved(post.id)).announcedAt).toBeTruthy();

    // Only a new post announces: never an edit or a pin, even with the
    // mark lost.
    await m.db.execute(
      m.sql`UPDATE "feed_posts" SET "announced_at" = NULL WHERE "id" = ${post.id}`,
    );
    await caller(fx.author).feed.editPost({
      postId: post.id,
      communitySlug: fx.slug,
      content: "Big news @everyone: we meet Friday at 6!",
    });
    await caller(fx.author).feed.pinPost({ postId: post.id, isPinned: true });
    expect(await toldUsers()).toHaveLength(1);
    expect(mail.broadcast).toHaveBeenCalledTimes(1);
  });

  it("sends no mention emails on top of an announcement", async () => {
    const n = await names();
    const post = await caller(fx.author).feed.createPost({
      communitySlug: fx.slug,
      content: `@everyone thanks @${n[fx.jane]}`,
      mentions: [fx.jane],
    });
    posts.push(post.id);
    expect(mail.broadcast).toHaveBeenCalled();
    expect(mail.send).not.toHaveBeenCalled();
  });

  it("does not let a moderator announce", async () => {
    await m.db
      .update(m.schema.communityMemberships)
      .set({ role: "moderator" })
      .where(
        m.and(
          m.eq(m.schema.communityMemberships.communityId, fx.communityId),
          m.eq(m.schema.communityMemberships.userId, fx.jane),
        ),
      );
    const post = await caller(fx.jane).feed.createPost({
      communitySlug: fx.slug,
      content: "@everyone listen up",
    });
    posts.push(post.id);
    expect(await toldUsers()).toEqual([]);
    expect(
      (
        await caller(fx.jane).feed.mentionCandidates({
          communitySlug: fx.slug,
          query: "ev",
        })
      ).some((c) => c.everyone),
    ).toBe(false);
  });

  it("leaves a member's @everyone as plain text, and offers it to owners only", async () => {
    const post = await caller(fx.jane).feed.createPost({
      communitySlug: fx.slug,
      content: "Hey @everyone, buy my course",
    });
    posts.push(post.id);
    expect(await toldUsers()).toEqual([]);
    expect((await saved(post.id)).announcedAt).toBeFalsy();

    const forOwner = await caller(fx.author).feed.mentionCandidates({
      communitySlug: fx.slug,
      query: "al",
    });
    // Offered last, never the first pick; a bare "@" never offers it.
    expect(forOwner.at(-1)).toMatchObject({ userId: "everyone", everyone: true });
    expect(
      (
        await caller(fx.author).feed.mentionCandidates({
          communitySlug: fx.slug,
          query: "",
        })
      ).some((c) => c.everyone),
    ).toBe(false);
    const forMember = await caller(fx.jane).feed.mentionCandidates({
      communitySlug: fx.slug,
      query: "ev",
    });
    expect(forMember.some((c) => c.everyone)).toBe(false);
  });

  it("drops a mention whose name leaves the text, and keeps a renamed one", async () => {
    const n = await names();
    const post = await caller(fx.author).feed.createPost({
      communitySlug: fx.slug,
      content: `Hi @${n[fx.jane]} and @${n[fx.janet]}`,
      mentions: [fx.jane, fx.janet],
    });
    posts.push(post.id);
    // Jane renames; the text still says the old name.
    await m.db
      .update(m.schema.memberProfiles)
      .set({ displayName: "Someone Else" })
      .where(m.eq(m.schema.memberProfiles.userId, fx.jane));

    await caller(fx.author).feed.editPost({
      postId: post.id,
      communitySlug: fx.slug,
      content: `Hi @${n[fx.jane]}, bye`,
      mentions: [fx.jane],
    });
    expect((await saved(post.id)).mentions).toEqual([
      { userId: fx.jane, name: n[fx.jane] },
    ]);
  });

  it("does not mention the longer name's prefix, and empties on delete", async () => {
    const n = await names();
    // Janet's name is the start of Jane's ("Jane x" / "Jane x Doe").
    const post = await caller(fx.author).feed.createPost({
      communitySlug: fx.slug,
      content: `Hello @${n[fx.jane]}`,
      mentions: [fx.janet, fx.jane],
    });
    posts.push(post.id);
    expect((await saved(post.id)).mentions).toEqual([
      { userId: fx.jane, name: n[fx.jane] },
    ]);
    await caller(fx.author).feed.deletePost({ postId: post.id });
    expect((await saved(post.id)).mentions).toEqual([]);
  });

  it("never tells a member twice about one post, even after a name is put back", async () => {
    const n = await names();
    const post = await caller(fx.author).feed.createPost({
      communitySlug: fx.slug,
      content: `Hi @${n[fx.jane]}`,
      mentions: [fx.jane],
    });
    posts.push(post.id);
    const edit = (content: string, mentions: string[]) =>
      caller(fx.author).feed.editPost({
        postId: post.id,
        communitySlug: fx.slug,
        content,
        mentions,
      });
    await edit("Hi all", []);
    await edit(`Hi _@${n[fx.jane]}_ again`, [fx.jane]);
    // The italic mention still counts.
    expect((await saved(post.id)).mentions).toEqual([
      { userId: fx.jane, name: n[fx.jane] },
    ]);
    expect((await toldUsers()).map((r) => r.userId)).toEqual([fx.jane]);
  });

  it("tells a member mentioned while the post was hidden once it is restored", async () => {
    const n = await names();
    const payload = await m.getPayloadClient();
    const post = await payload.create({
      collection: "feed-posts",
      data: {
        content: `Hi @${n[fx.jane]}`,
        mentions: [{ userId: fx.jane, name: n[fx.jane] }],
        authorId: fx.author,
        authorName: "Author",
        communityId: fx.communityId,
        topicSlug: "general",
        likeCount: 0,
        commentCount: 0,
        visibility: "community",
        hiddenAt: new Date().toISOString(),
      },
    });
    posts.push(post.id);
    expect(await toldUsers()).toEqual([]);
    await payload.update({
      collection: "feed-posts",
      id: post.id,
      data: { hiddenAt: null },
    });
    expect((await toldUsers()).map((r) => r.userId)).toEqual([fx.jane]);
  });

  it("tells no one when the author is no longer a member", async () => {
    const n = await names();
    const post = await caller(fx.author).feed.createPost({
      communitySlug: fx.slug,
      content: "Hello",
    });
    posts.push(post.id);
    await m.db
      .update(m.schema.communityMemberships)
      .set({ status: "banned" })
      .where(
        m.and(
          m.eq(m.schema.communityMemberships.communityId, fx.communityId),
          m.eq(m.schema.communityMemberships.userId, fx.author),
        ),
      );
    await caller(fx.author).feed.editPost({
      postId: post.id,
      communitySlug: fx.slug,
      content: `Hello @${n[fx.jane]}`,
      mentions: [fx.jane],
    });
    expect(await toldUsers()).toEqual([]);
  });

  it("tells no one about a post hidden for review", async () => {
    const n = await names();
    const payload = await m.getPayloadClient();
    const post = await payload.create({
      collection: "feed-posts",
      data: {
        content: `Hi @${n[fx.jane]}`,
        mentions: [{ userId: fx.jane, name: n[fx.jane] }],
        authorId: fx.author,
        authorName: "Author",
        communityId: fx.communityId,
        topicSlug: "general",
        likeCount: 0,
        commentCount: 0,
        visibility: "community",
        hiddenAt: new Date().toISOString(),
      },
    });
    posts.push(post.id);
    expect(await toldUsers()).toEqual([]);
  });

  it("shows a mention as a link only for an open profile", async () => {
    const n = await names();
    const post = await caller(fx.author).feed.createPost({
      communitySlug: fx.slug,
      content: `Hi @${n[fx.jane]} and @${n[fx.janet]}`,
      mentions: [fx.jane, fx.janet],
    });
    posts.push(post.id);
    const feed = await caller(fx.author).feed.getFeed({
      communitySlug: fx.slug,
    });
    const shown = feed.posts.find((p) => p.id === post.id);
    expect(shown?.mentions).toEqual([
      { userId: fx.jane, name: n[fx.jane], hasProfile: true },
      { userId: fx.janet, name: n[fx.janet], hasProfile: false },
    ]);
  });

  it("offers active members matching the typed name, never the author", async () => {
    const n = await names();
    const offered = await caller(fx.author).feed.mentionCandidates({
      communitySlug: fx.slug,
      query: "jane",
    });
    // Names starting with the query first, then by name.
    expect(offered.map((c) => c.name)).toEqual([n[fx.janet], n[fx.jane]]);
    const inside = await caller(fx.author).feed.mentionCandidates({
      communitySlug: fx.slug,
      query: "doe",
    });
    expect(inside.map((c) => c.userId)).toEqual([fx.jane]);
    expect(
      (
        await caller(fx.author).feed.mentionCandidates({
          communitySlug: fx.slug,
          query: "%",
        })
      ).length,
    ).toBe(0);
    const everyone = await caller(fx.jane).feed.mentionCandidates({
      communitySlug: fx.slug,
      query: "",
    });
    expect(everyone.map((c) => c.userId).sort()).toEqual(
      [fx.author, fx.janet].sort(),
    );
    await expect(
      caller(fx.outsider).feed.mentionCandidates({
        communitySlug: fx.slug,
        query: "",
      }),
    ).rejects.toThrow();
  });
});
