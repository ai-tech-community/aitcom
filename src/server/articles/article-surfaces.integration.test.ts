// @vitest-environment node
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type * as ApiKey from "@/server/agent/api-key";
import type * as Root from "@/server/api/root";
import type * as Metrics from "@/server/badges/metrics";
import type { db as Db } from "@/server/db";
import type * as Schema from "@/server/db/schema";
import type { PayloadClient } from "@/server/magazines/deps";
import type * as IssueService from "@/server/magazines/issue-service";
import type * as MagazineService from "@/server/magazines/magazine-service";
import type * as Reading from "@/server/magazines/reading";
import type * as SitemapPaths from "@/server/magazines/sitemap-paths";
import type * as ProfileWork from "@/server/members/profile-work";

import type * as PublicArticles from "./public-articles";

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

function richText(text: string) {
  return {
    root: {
      type: "root",
      direction: "ltr" as const,
      format: "" as const,
      indent: 0,
      version: 1,
      children: [
        { type: "paragraph", version: 1, children: [{ type: "text", text }] },
      ],
    },
  };
}

/**
 * Every existing article surface asks the access rule (ADR-0042/0043): a
 * magazine article in a public issue shows on the author's profile (with
 * its magazine link), in agent search, in the sitemap and in comments, and
 * never on the blog. Switching the issue to members takes it off every
 * surface on the next call. The sitemap is checked through its data
 * function: the cached route may lag by its revalidate window (F20).
 */
describe.skipIf(!RUN_DB)("article surfaces [DB integration]", () => {
  type Mods = {
    db: typeof Db;
    schema: typeof Schema;
    magazines: typeof MagazineService;
    issues: typeof IssueService;
    reading: typeof Reading;
    payload: PayloadClient;
    createCaller: typeof Root.createCaller;
    generateApiKey: typeof ApiKey.generateApiKey;
    publicArticleWhere: typeof PublicArticles.publicArticleWhere;
    loadProfileWork: typeof ProfileWork.loadProfileWork;
    magazineSitemapPaths: typeof SitemapPaths.magazineSitemapPaths;
    TRACK_METRICS: typeof Metrics.TRACK_METRICS;
  };
  let m: Mods;

  type Fixture = {
    sfx: string;
    editorId: string;
    memberId: string;
    outsiderId: string;
    agentOwnerId: string;
    agentId: string;
    apiKey: string;
    communityIds: string[];
    articleIds: number[];
  };
  let fx: Fixture;

  beforeAll(async () => {
    const [
      { db },
      schema,
      magazines,
      issues,
      reading,
      { getPayloadClient },
      { createCaller },
      { generateApiKey },
      { publicArticleWhere },
      { loadProfileWork },
      { magazineSitemapPaths },
      { TRACK_METRICS },
    ] = await Promise.all([
      import("@/server/db"),
      import("@/server/db/schema"),
      import("@/server/magazines/magazine-service"),
      import("@/server/magazines/issue-service"),
      import("@/server/magazines/reading"),
      import("@/server/payload"),
      import("@/server/api/root"),
      import("@/server/agent/api-key"),
      import("./public-articles"),
      import("@/server/members/profile-work"),
      import("@/server/magazines/sitemap-paths"),
      import("@/server/badges/metrics"),
    ]);
    m = {
      db,
      schema,
      magazines,
      issues,
      reading,
      payload: await getPayloadClient(),
      createCaller,
      generateApiKey,
      publicArticleWhere,
      loadProfileWork,
      magazineSitemapPaths,
      TRACK_METRICS,
    };
  }, 120_000);

  beforeEach(async () => {
    const { db, schema } = m;
    const sfx = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const agentId = `as-agent-${sfx}`;
    fx = {
      sfx,
      editorId: `as-editor-${sfx}`,
      memberId: `as-member-${sfx}`,
      outsiderId: `as-outsider-${sfx}`,
      agentOwnerId: `as-agent-owner-${sfx}`,
      agentId,
      apiKey: "",
      communityIds: [],
      articleIds: [],
    };
    const userIds = [fx.editorId, fx.memberId, fx.outsiderId, fx.agentOwnerId];
    await db
      .insert(schema.user)
      .values(
        userIds.map((id) => ({ id, email: `${id}@example.test`, name: id })),
      );
    await db
      .insert(schema.memberProfiles)
      .values(userIds.map((userId) => ({ userId, displayName: userId })));

    // An agent whose owner is in no community: it reads what a guest reads.
    await db.insert(schema.agentProfiles).values({
      id: agentId,
      ownerId: fx.agentOwnerId,
      name: `Agent ${sfx}`,
      status: "active",
    });
    const { raw, hash, prefix } = m.generateApiKey();
    await db.insert(schema.agentApiKeys).values({
      agentId,
      ownerId: fx.agentOwnerId,
      keyHash: hash,
      keyPrefix: prefix,
      scopes: ["read"],
      isActive: true,
    });
    fx.apiKey = raw;
  }, 60_000);

  afterEach(async () => {
    const { db, schema, payload } = m;
    const { eq, inArray } = await import("drizzle-orm");
    if (fx.communityIds.length > 0) {
      const { docs: mags } = await payload.find({
        collection: "magazines",
        where: { communityId: { in: fx.communityIds } },
        depth: 0,
        pagination: false,
      });
      const magazineIds = mags.map((mag) => mag.id);
      if (magazineIds.length > 0) {
        // Deleting the issues clears their articles' placement (the
        // foreign key is ON DELETE set null).
        await payload.delete({
          collection: "magazine-issues",
          where: { magazine: { in: magazineIds } },
        });
      }
    }
    if (fx.articleIds.length > 0) {
      await payload.delete({
        collection: "comments",
        where: { articleId: { in: fx.articleIds } },
      });
      await payload.delete({
        collection: "articles",
        where: { id: { in: fx.articleIds } },
      });
    }
    if (fx.communityIds.length > 0) {
      await payload.delete({
        collection: "magazines",
        where: { communityId: { in: fx.communityIds } },
      });
      await db
        .delete(schema.spaces)
        .where(inArray(schema.spaces.communityId, fx.communityIds));
      await db
        .delete(schema.communityMemberships)
        .where(
          inArray(schema.communityMemberships.communityId, fx.communityIds),
        );
      await db
        .delete(schema.communities)
        .where(inArray(schema.communities.id, fx.communityIds));
    }
    await db
      .delete(schema.agentApiKeys)
      .where(eq(schema.agentApiKeys.agentId, fx.agentId));
    await db
      .delete(schema.agentProfiles)
      .where(eq(schema.agentProfiles.id, fx.agentId));
    const userIds = [fx.editorId, fx.memberId, fx.outsiderId, fx.agentOwnerId];
    await db
      .delete(schema.pointsEvents)
      .where(inArray(schema.pointsEvents.userId, userIds));
    await db
      .delete(schema.activityEvents)
      .where(inArray(schema.activityEvents.actorId, userIds));
    await db
      .delete(schema.notifications)
      .where(inArray(schema.notifications.userId, userIds));
    await db
      .delete(schema.memberBadges)
      .where(inArray(schema.memberBadges.userId, userIds));
    await db
      .delete(schema.memberProfiles)
      .where(inArray(schema.memberProfiles.userId, userIds));
    await db.delete(schema.user).where(inArray(schema.user.id, userIds));
  }, 60_000);

  // ── Fixtures ──────────────────────────────────────────────────────────

  type Community = { id: string; slug: string; isListedInDirectory: boolean };

  /** A listed community: the editor owns it, the member is a member. */
  async function community(label: string): Promise<Community> {
    const { db, schema } = m;
    const [row] = await db
      .insert(schema.communities)
      .values({
        name: `Surfaces ${label} ${fx.sfx}`,
        slug: `as-${label}-${fx.sfx}`,
        createdBy: fx.editorId,
        isListedInDirectory: true,
      })
      .returning();
    fx.communityIds.push(row!.id);
    await db.insert(schema.communityMemberships).values([
      { communityId: row!.id, userId: fx.editorId, role: "owner" },
      { communityId: row!.id, userId: fx.memberId, role: "member" },
    ]);
    return {
      id: row!.id,
      slug: row!.slug,
      isListedInDirectory: row!.isListedInDirectory,
    };
  }

  function actor(c: Community): IssueService.IssueActor {
    return { userId: fx.editorId, community: c };
  }

  async function approvedArticle(magazineId: number, label: string) {
    const slug = `as-${label}-${fx.sfx}`;
    const doc = await m.payload.create({
      collection: "articles",
      data: {
        title: `Surfaces ${label} ${fx.sfx}`,
        slug,
        content: richText(`${label} text`),
        type: "article",
        authorId: fx.editorId,
        authorName: "Editor",
        authorType: "member",
        reviewStatus: "approved",
        status: "draft",
        magazine: magazineId,
      } as never,
    });
    fx.articleIds.push(doc.id);
    return doc;
  }

  /** One magazine article in a published public issue of a listed community. */
  async function publishedMagazineArticle() {
    const c = await community("home");
    const magazine = await m.magazines.saveMagazineSettings(
      m,
      c,
      {
        name: `Surfaces ${fx.sfx}`,
        slug: `as-mag-${fx.sfx}`,
        topics: [],
        defaultVisibility: "public",
      },
      fx.editorId,
    );
    const article = await approvedArticle(magazine.id, "long-read");
    let issue = await m.issues.createIssue(
      m,
      magazine,
      { title: `Issue ${fx.sfx}` },
      actor(c),
    );
    issue = await m.issues.setIssueItems(
      m,
      issue,
      [{ kind: "article", articleId: article.id }],
      issue.updatedAt,
      actor(c),
    );
    issue = await m.issues.publishIssue(m, issue, issue.updatedAt, actor(c));
    const articlePath = `/magazines/${magazine.slug}/${issue.slug}/${article.slug}`;
    return { c, magazine, issue, article, articlePath };
  }

  function callerAs(userId: string | null) {
    return m.createCaller({
      db: m.db,
      headers: new Headers(),
      session: userId ? ({ user: { id: userId }, session: {} } as never) : null,
    });
  }

  function agentCaller() {
    const headers = new Headers();
    headers.set("authorization", `Bearer ${fx.apiKey}`);
    return m.createCaller({ db: m.db, headers, session: null });
  }

  async function profileArticles() {
    const work = await m.loadProfileWork(m, {
      userId: fx.editorId,
      viewerId: null,
      locale: "en",
    });
    return work.articles.items;
  }

  async function agentArticleIds(communitySlug?: string) {
    const results = await agentCaller().agent.searchKnowledge({
      query: fx.sfx,
      type: "articles",
      ...(communitySlug ? { communitySlug } : {}),
    });
    return results.filter((r) => r.type === "article").map((r) => r.id);
  }

  /** Every issue id the `/magazines` home shows. */
  async function homeIssueIds(): Promise<number[]> {
    const home = await m.reading.loadMagazinesHome(m, { locale: "en" });
    return [
      ...(home.featured ? [home.featured.id] : []),
      ...home.justPublished.map((card) => card.id),
      ...home.magazines.map((card) => card.latest.id),
    ];
  }

  function issuePageAs(
    viewerId: string | null,
    magazineSlug: string,
    issueSlug: string,
  ) {
    return m.reading.loadIssuePage(m, {
      magazineSlug,
      issueSlug,
      viewerId,
      locale: "en",
    });
  }

  function articlePageAs(
    viewerId: string | null,
    magazineSlug: string,
    issueSlug: string,
    articleSlug: string,
  ) {
    return m.reading.loadMagazineArticlePage(m, {
      magazineSlug,
      issueSlug,
      articleSlug,
      viewerId,
      locale: "en",
    });
  }

  async function commentCount(articleId: number): Promise<number> {
    const { totalDocs } = await m.payload.count({
      collection: "comments",
      where: { articleId: { equals: articleId } },
    });
    return totalDocs;
  }

  async function pointsEventCount(userId: string): Promise<number> {
    const { eq } = await import("drizzle-orm");
    const rows = await m.db
      .select({ id: m.schema.pointsEvents.id })
      .from(m.schema.pointsEvents)
      .where(eq(m.schema.pointsEvents.userId, userId));
    return rows.length;
  }

  // ── Tests ─────────────────────────────────────────────────────────────

  it("public: on the profile with the magazine link, in agent search, in the sitemap, comments readable", async () => {
    const { c, magazine, issue, article, articlePath } =
      await publishedMagazineArticle();
    // A public blog article with the same search word: a community search
    // must not return it (blog articles belong to no community; F25).
    const blog = await m.payload.create({
      collection: "articles",
      data: {
        title: `Surfaces blog ${fx.sfx}`,
        slug: `as-blog-${fx.sfx}`,
        content: richText("blog text"),
        type: "article",
        authorId: fx.editorId,
        authorName: "Editor",
        authorType: "admin",
        status: "published",
        publishedAt: new Date().toISOString(),
      } as never,
    });
    fx.articleIds.push(blog.id);

    expect(await profileArticles()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: article.id, href: articlePath }),
        expect.objectContaining({ id: blog.id, href: `/blog/${blog.slug}` }),
      ]),
    );

    expect(await agentArticleIds()).toEqual(
      expect.arrayContaining([article.id, blog.id]),
    );
    expect(await agentArticleIds(c.slug)).toEqual([article.id]);

    const paths = await m.magazineSitemapPaths(m);
    expect(paths).toEqual(
      expect.arrayContaining([
        "/magazines",
        `/magazines/${magazine.slug}`,
        `/magazines/${magazine.slug}/${issue.slug}`,
        articlePath,
      ]),
    );

    await expect(
      callerAs(null).comments.list({ articleId: article.id }),
    ).resolves.toEqual([]);
    await expect(
      callerAs(fx.outsiderId).comments.list({ articleId: article.id }),
    ).resolves.toEqual([]);
  }, 60_000);

  it("never on /blog, the blog feed query or My articles", async () => {
    const { article } = await publishedMagazineArticle();
    const live = await m.payload.findByID({
      collection: "articles",
      id: article.id,
      depth: 0,
    });
    expect(live.status).toBe("published");

    // `/blog`, the blog page and `feed.xml` all read with this rule.
    const { totalDocs } = await m.payload.find({
      collection: "articles",
      where: {
        and: [m.publicArticleWhere(), { id: { equals: article.id } }],
      },
      depth: 0,
    });
    expect(totalDocs).toBe(0);

    const mine = await callerAs(fx.editorId).articles.myArticles();
    expect(mine.map((doc) => doc.id)).not.toContain(article.id);
  }, 60_000);

  it("switching to members removes the article from every surface", async () => {
    const { c, magazine, issue, article, articlePath } =
      await publishedMagazineArticle();

    // Public first: on the home, and the issue and article pages read.
    expect(await homeIssueIds()).toContain(issue.id);
    for (const viewer of [null, fx.outsiderId]) {
      expect(
        (await issuePageAs(viewer, magazine.slug, issue.slug))?.items,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "article",
            article: expect.objectContaining({ id: article.id }),
          }),
        ]),
      );
      expect(
        (await articlePageAs(viewer, magazine.slug, issue.slug, article.slug))
          ?.article.id,
      ).toBe(article.id);
    }

    await m.issues.updateIssueDetails(
      m,
      issue,
      { visibility: "members" },
      issue.updatedAt,
      actor(c),
    );

    expect((await profileArticles()).map((a) => a.id)).not.toContain(
      article.id,
    );
    expect(await agentArticleIds()).not.toContain(article.id);
    expect(await agentArticleIds(c.slug)).toEqual([]);

    const paths = await m.magazineSitemapPaths(m);
    expect(paths).not.toContain(`/magazines/${magazine.slug}`);
    expect(paths).not.toContain(`/magazines/${magazine.slug}/${issue.slug}`);
    expect(paths).not.toContain(articlePath);

    await expect(
      callerAs(fx.outsiderId).comments.list({ articleId: article.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      callerAs(null).comments.list({ articleId: article.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      callerAs(fx.outsiderId).comments.create({
        articleId: article.id,
        content: "hello",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      callerAs(fx.memberId).comments.list({ articleId: article.id }),
    ).resolves.toEqual([]);

    // The home is the public face: a members-only issue leaves it.
    expect(await homeIssueIds()).not.toContain(issue.id);
    // The issue and article pages are not found for guests and outsiders.
    for (const viewer of [null, fx.outsiderId]) {
      expect(await issuePageAs(viewer, magazine.slug, issue.slug)).toBeNull();
      expect(
        await articlePageAs(viewer, magazine.slug, issue.slug, article.slug),
      ).toBeNull();
    }
    // Members still read both.
    expect(
      (await issuePageAs(fx.memberId, magazine.slug, issue.slug))?.issue.id,
    ).toBe(issue.id);
    expect(
      (
        await articlePageAs(
          fx.memberId,
          magazine.slug,
          issue.slug,
          article.slug,
        )
      )?.article.id,
    ).toBe(article.id);
  }, 60_000);

  // ── Commenting is the channel's call ──────────────────────────────────

  it("blog: a public article takes comments, an unpublished one refuses them", async () => {
    async function blogArticle(label: string, status: "published" | "draft") {
      const doc = await m.payload.create({
        collection: "articles",
        data: {
          title: `Surfaces blog ${label} ${fx.sfx}`,
          slug: `as-blog-${label}-${fx.sfx}`,
          content: richText("blog text"),
          type: "article",
          authorId: fx.editorId,
          authorName: "Editor",
          authorType: "admin",
          status,
          ...(status === "published"
            ? { publishedAt: new Date().toISOString() }
            : {}),
        } as never,
      });
      fx.articleIds.push(doc.id);
      return doc;
    }
    const live = await blogArticle("live", "published");
    const draft = await blogArticle("draft", "draft");

    await expect(
      callerAs(fx.outsiderId).comments.create({
        articleId: live.id,
        content: "hello",
      }),
    ).resolves.toMatchObject({ authorId: fx.outsiderId });
    await expect(
      callerAs(fx.editorId).comments.create({
        articleId: draft.id,
        content: "hello",
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Cannot comment on unpublished articles",
    });
    expect(await commentCount(live.id)).toBe(1);
    expect(await commentCount(draft.id)).toBe(0);
  }, 60_000);

  it("magazine: readers of a published issue comment; an editor previewing unpublished work may not", async () => {
    const { c, magazine, article } = await publishedMagazineArticle();

    // Published in a published public issue: readers and editors comment.
    await expect(
      callerAs(fx.outsiderId).comments.create({
        articleId: article.id,
        content: "reader",
      }),
    ).resolves.toMatchObject({ authorId: fx.outsiderId });
    await expect(
      callerAs(fx.editorId).comments.create({
        articleId: article.id,
        content: "editor",
      }),
    ).resolves.toMatchObject({ authorId: fx.editorId });
    expect(await commentCount(article.id)).toBe(2);

    // Ready but in no issue, and placed in a draft issue: the editor reads
    // both (a preview), but neither has readers, so neither takes comments.
    const unplaced = await approvedArticle(magazine.id, "unplaced");
    const inDraft = await approvedArticle(magazine.id, "in-draft");
    const draftIssue = await m.issues.createIssue(
      m,
      magazine,
      { title: `Draft ${fx.sfx}` },
      actor(c),
    );
    await m.issues.setIssueItems(
      m,
      draftIssue,
      [{ kind: "article", articleId: inDraft.id }],
      draftIssue.updatedAt,
      actor(c),
    );
    const editorPoints = await pointsEventCount(fx.editorId);
    for (const preview of [unplaced, inDraft]) {
      await expect(
        callerAs(fx.editorId).comments.list({ articleId: preview.id }),
      ).resolves.toEqual([]);
      await expect(
        callerAs(fx.editorId).comments.create({
          articleId: preview.id,
          content: "preview",
        }),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "Cannot comment on unpublished articles",
      });
      // Anyone else may not even read it: not found.
      await expect(
        callerAs(fx.memberId).comments.create({
          articleId: preview.id,
          content: "member",
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(await commentCount(preview.id)).toBe(0);
    }
    // A refused comment awards no XP.
    expect(await pointsEventCount(fx.editorId)).toBe(editorPoints);
  }, 60_000);

  it("badge metrics count a published magazine article and not an approved unpublished one", async () => {
    const { magazine } = await publishedMagazineArticle();
    // Marked ready (approved) but in no published issue: not published.
    const ready = await approvedArticle(magazine.id, "ready");
    expect(ready.status).toBe("draft");

    const written = await m.TRACK_METRICS.writer(
      { db: m.db, payload: async () => m.payload },
      fx.editorId,
    );
    expect(written).toBe(1);
  }, 60_000);
});
