// @vitest-environment node
/**
 * DB-INTEGRATION test for polls on feed posts, against a REAL local DB +
 * Payload: posting a poll, voting, changing and taking back a vote, the
 * closing time, and what edits do to a poll and its votes.
 *
 *   RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 PAYLOAD_PUSH=false \
 *     NEON_LOCAL_PROXY=127.0.0.1:5433 \
 *     DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test \
 *     pnpm exec vitest run src/server/communities/post-polls.integration.test.ts
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

describe.skipIf(!RUN_DB)("polls on feed posts [DB integration]", () => {
  type Mods = {
    db: typeof import("@/server/db").db;
    schema: typeof import("@/server/db/schema");
    createCaller: typeof import("@/server/api/root").createCaller;
    getPayloadClient: typeof import("@/server/payload").getPayloadClient;
    eq: typeof import("drizzle-orm").eq;
    inArray: typeof import("drizzle-orm").inArray;
    sql: typeof import("drizzle-orm").sql;
  };
  let m: Mods;
  let fx: {
    communityId: string;
    slug: string;
    author: string;
    voter: string;
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
      inArray: drizzle.inArray,
      sql: drizzle.sql,
    };
  });

  const users = () => [fx.author, fx.voter, fx.outsider];

  beforeEach(async () => {
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    fx = {
      communityId: "",
      slug: `poll-${suffix}`,
      author: `it-poll-author-${suffix}`,
      voter: `it-poll-voter-${suffix}`,
      outsider: `it-poll-out-${suffix}`,
    };
    await m.db
      .insert(m.schema.user)
      .values(
        users().map((id) => ({ id, email: `${id}@example.test`, name: id })),
      );
    const [community] = await m.db
      .insert(m.schema.communities)
      .values({ name: `Poll ${suffix}`, slug: fx.slug, createdBy: fx.author })
      .returning({ id: m.schema.communities.id });
    fx.communityId = community!.id;
    await m.db.insert(m.schema.communityMemberships).values([
      { communityId: fx.communityId, userId: fx.author, role: "owner" },
      { communityId: fx.communityId, userId: fx.voter, role: "member" },
    ]);
  });

  afterEach(async () => {
    const payload = await m.getPayloadClient();
    for (const id of posts) {
      await payload.delete({ collection: "feed-posts", id }).catch(() => null);
    }
    posts.length = 0;
    await m.db
      .delete(m.schema.communityMemberships)
      .where(m.eq(m.schema.communityMemberships.communityId, fx.communityId));
    await m.db
      .delete(m.schema.communities)
      .where(m.eq(m.schema.communities.id, fx.communityId));
    await m.db
      .delete(m.schema.user)
      .where(m.inArray(m.schema.user.id, users()));
  });

  function caller(userId: string) {
    return m.createCaller({
      db: m.db,
      session: { user: { id: userId, name: "Member" } } as never,
      headers: new Headers(),
    });
  }

  async function pollPost() {
    const post = await caller(fx.author).feed.createPost({
      communitySlug: fx.slug,
      content: "Pizza or tacos?",
      poll: { options: [" Pizza ", "Tacos", "Both"], days: 3 },
    });
    posts.push(post.id);
    return post.id;
  }

  async function shown(postId: number, viewer: string) {
    const feed = await caller(viewer).feed.getFeed({ communitySlug: fx.slug });
    return feed.posts.find((p) => p.id === postId)!.poll!;
  }

  async function voteCount(postId: number) {
    const rows = await m.db
      .select()
      .from(m.schema.feedPollVotes)
      .where(m.eq(m.schema.feedPollVotes.postId, postId));
    return rows.length;
  }

  it("posts a poll, and members vote, change and take back their vote", async () => {
    const postId = await pollPost();
    const before = await shown(postId, fx.voter);
    expect(before.options.map((o) => o.label)).toEqual([
      "Pizza",
      "Tacos",
      "Both",
    ]);
    expect(before).toMatchObject({
      totalVotes: 0,
      closed: false,
      myVote: null,
    });
    const closesIn =
      new Date(before.closesAt).getTime() - Date.now() - 3 * 86_400_000;
    expect(Math.abs(closesIn)).toBeLessThan(60_000);

    const [pizza, tacos] = before.options;
    const afterVote = await caller(fx.voter).feed.votePoll({
      postId,
      optionId: pizza!.id,
    });
    expect(afterVote).toMatchObject({ totalVotes: 1, myVote: pizza!.id });
    await caller(fx.author).feed.votePoll({ postId, optionId: pizza!.id });
    // Changing a vote moves it; it never counts twice.
    await caller(fx.voter).feed.votePoll({ postId, optionId: tacos!.id });
    const changed = await shown(postId, fx.voter);
    expect(changed.options.map((o) => o.votes)).toEqual([1, 1, 0]);
    expect(changed.myVote).toBe(tacos!.id);
    expect((await shown(postId, fx.author)).myVote).toBe(pizza!.id);

    const takenBack = await caller(fx.voter).feed.votePoll({
      postId,
      optionId: null,
    });
    expect(takenBack).toMatchObject({ totalVotes: 1, myVote: null });
  });

  it("refuses outsiders, unknown answers, a second media kind, a missing end, and a closed poll", async () => {
    const postId = await pollPost();
    const [pizza] = (await shown(postId, fx.voter)).options;
    await expect(
      caller(fx.outsider).feed.votePoll({ postId, optionId: pizza!.id }),
    ).rejects.toThrow();
    await expect(
      caller(fx.voter).feed.votePoll({ postId, optionId: "not-an-answer" }),
    ).rejects.toThrow(/not in this poll/);
    await expect(
      caller(fx.author).feed.createPost({
        communitySlug: fx.slug,
        content: "Two kinds",
        gifId: "abc",
        poll: { options: ["a", "b"], days: 1 },
      }),
    ).rejects.toThrow();
    await expect(
      caller(fx.author).feed.createPost({
        communitySlug: fx.slug,
        content: "Same twice",
        poll: { options: ["Yes", "yes"], days: 1 },
      }),
    ).rejects.toThrow(/same/);
    await expect(
      caller(fx.author).feed.createPost({
        communitySlug: fx.slug,
        content: "No end",
        poll: { options: ["a", "b"], days: null },
      }),
    ).rejects.toThrow(/how long/);

    await m.db.execute(
      m.sql`UPDATE "feed_posts" SET "poll_closes_at" = now() - interval '1 minute' WHERE "id" = ${postId}`,
    );
    await expect(
      caller(fx.voter).feed.votePoll({ postId, optionId: pizza!.id }),
    ).rejects.toThrow(/closed/);
    expect((await shown(postId, fx.voter)).closed).toBe(true);
  });

  it("keeps the poll and its votes through a text edit and a pin", async () => {
    const postId = await pollPost();
    const [pizza] = (await shown(postId, fx.voter)).options;
    await caller(fx.voter).feed.votePoll({ postId, optionId: pizza!.id });

    await caller(fx.author).feed.editPost({
      postId,
      communitySlug: fx.slug,
      content: "Pizza or tacos? Vote by Friday",
    });
    await caller(fx.author).feed.pinPost({ postId, isPinned: true });
    const after = await shown(postId, fx.voter);
    expect(after.myVote).toBe(pizza!.id);
    expect(after.totalVotes).toBe(1);
  });

  it("replacing or removing a voted poll removes its votes, and a stale vote is refused", async () => {
    const postId = await pollPost();
    const before = await shown(postId, fx.voter);
    await caller(fx.voter).feed.votePoll({
      postId,
      optionId: before.options[0]!.id,
    });

    // New answers in one save: the old votes go with the old answers.
    await caller(fx.author).feed.editPost({
      postId,
      communitySlug: fx.slug,
      content: "New answers",
      media: { kind: "poll", poll: { options: ["x", "y"], days: null } },
    });
    const replaced = await shown(postId, fx.voter);
    expect(replaced.options.map((o) => o.label)).toEqual(["x", "y"]);
    expect(replaced.totalVotes).toBe(0);
    // It kept its end.
    expect(replaced.closesAt).toBe(before.closesAt);
    expect(await voteCount(postId)).toBe(0);

    // A vote for an answer read before the change is refused, never stored.
    const { castPollVote } = await import("./post-polls");
    const payload = await m.getPayloadClient();
    const fresh = await payload.findByID({
      collection: "feed-posts",
      id: postId,
      depth: 0,
    });
    const stale = {
      ...fresh,
      poll: {
        ...fresh.poll,
        options: [{ id: before.options[0]!.id, label: "Pizza" }],
      },
    };
    await expect(
      castPollVote(m.db, stale, {
        userId: fx.voter,
        optionId: before.options[0]!.id,
      }),
    ).rejects.toThrow(/just changed/);
    expect(await voteCount(postId)).toBe(0);

    await caller(fx.author).feed.editPost({
      postId,
      communitySlug: fx.slug,
      content: "No poll after all",
      media: { kind: "none" },
    });
    const feed = await caller(fx.voter).feed.getFeed({
      communitySlug: fx.slug,
    });
    expect(feed.posts.find((p) => p.id === postId)!.poll).toBeNull();
  });

  it("lets the author change the answers while no one has voted", async () => {
    const postId = await pollPost();
    await caller(fx.author).feed.editPost({
      postId,
      communitySlug: fx.slug,
      content: "Pizza or tacos?",
      media: { kind: "poll", poll: { options: ["Pizza", "Sushi"], days: 7 } },
    });
    const after = await shown(postId, fx.voter);
    expect(after.options.map((o) => o.label)).toEqual(["Pizza", "Sushi"]);
  });

  it("removes a post's votes with the post", async () => {
    const postId = await pollPost();
    const [pizza] = (await shown(postId, fx.voter)).options;
    await caller(fx.voter).feed.votePoll({ postId, optionId: pizza!.id });
    const payload = await m.getPayloadClient();
    await payload.delete({ collection: "feed-posts", id: postId });
    expect(await voteCount(postId)).toBe(0);
  });
});
