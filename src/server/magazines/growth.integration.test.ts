// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from "vitest";

import type * as Env from "@/env";
import type { createCaller as CreateCaller } from "@/server/api/root";
import { isIssueIndexable } from "@/lib/magazines/indexing";
import { TEASER_OPENING_WORDS } from "@/lib/magazines/teaser";
import { isLocalDbConfigured } from "@/test/magazine-auto-draft-fixture";
import { readingFixture } from "@/test/magazine-reading-fixture";

vi.mock("@/server/email", () => ({ sendGatedEmail: vi.fn(async () => true) }));
vi.mock("@/env", async (original) => {
  const { env } = await original<typeof Env>();
  return { env: { ...env, BETTER_AUTH_SECRET: "magazine-growth-test-secret" } };
});

describe.skipIf(!isLocalDbConfigured())(
  "magazine growth [DB integration]",
  () => {
    const fixture = readingFixture();
    let createCaller: typeof CreateCaller;

    beforeAll(async () => {
      ({ createCaller } = await import("@/server/api/root"));
    }, 120_000);

    function callerAs(userId: string | null, headers = new Headers()) {
      return createCaller({
        db: fixture.m.db,
        headers,
        session: userId
          ? ({ user: { id: userId }, session: {} } as never)
          : null,
      });
    }

    it("a preview issue grows the community and never leaks", async () => {
      const { m, fx, community, approvedArticle, richText } = fixture;
      const [
        { canReadArticle },
        { generateApiKey },
        { loadProfileWork },
        { magazineSitemapPaths },
        { loadShareCard },
        { loadIssueStats },
        { GET },
      ] = await Promise.all([
        import("@/server/articles/article-access"),
        import("@/server/agent/api-key"),
        import("@/server/members/profile-work"),
        import("./sitemap-paths"),
        import("./share-cards"),
        import("./stats/issue-stats"),
        import("@/app/feed.xml/route"),
      ]);
      const c = await community("growth", {
        listed: false,
        joinPolicy: "approval_required",
      });
      const owner = callerAs(fx.editorId);
      const outsider = callerAs(fx.outsiderId);
      const slug = c.slug;
      const magazine = await owner.magazines.saveSettings({
        slug,
        name: `Magazine growth ${fx.sfx}`,
        magazineSlug: `rd-growth-${fx.sfx}`,
        topics: [],
        defaultVisibility: "members",
      });
      const { id: issueId } = await owner.magazines.createIssue({
        slug,
        title: `Growth ${fx.sfx}`,
      });
      let issue = (await owner.magazines.getIssueForEditing({ slug, issueId }))
        .issue;
      await expect(
        owner.magazines.updateIssue({
          slug,
          issueId,
          expectedUpdatedAt: issue.updatedAt,
          visibility: "teaser",
        }),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "CONFIRM_UNLISTED_PUBLIC",
      });
      issue = await owner.magazines.updateIssue({
        slug,
        issueId,
        expectedUpdatedAt: issue.updatedAt,
        visibility: "teaser",
        confirmUnlistedPublic: true,
        coverImageUrl: "https://example.test/growth-cover.png",
        editorNote: richText("A note for every reader."),
      });
      expect(issue.visibility).toBe("teaser");
      expect(issue.publicConfirmedAt).toEqual(expect.any(String));
      expect(issue.publicConfirmedBy).toBe(fx.editorId);

      const codeMarker = `PRIVATE_CODE_${fx.sfx}`;
      const editorialMarker = `PRIVATE_EDITORIAL_${fx.sfx}`;
      const words = Array.from(
        { length: 120 },
        (_, i) => `openingWord${i + 1}`,
      );
      const content = richText(words.join(" "));
      content.root.children.unshift({
        type: "code",
        version: 1,
        children: [{ type: "text", text: codeMarker }],
      });
      const article = await approvedArticle(
        `growth-${fx.sfx}`,
        Number(magazine.id),
        content,
      );
      ({ issue } = await owner.magazines.setIssueItems({
        slug,
        issueId,
        expectedUpdatedAt: issue.updatedAt,
        items: [
          { kind: "article", articleId: Number(article.id) },
          {
            kind: "editorial",
            heading: "From the editors",
            intro: "A public introduction",
            body: richText(editorialMarker),
          },
        ],
      }));
      issue = await owner.magazines.publishIssue({
        slug,
        issueId,
        expectedUpdatedAt: issue.updatedAt,
      });
      const opts = {
        magazineSlug: magazine.slug,
        issueSlug: issue.slug,
        locale: "en" as const,
      };
      const issuePath = `/magazines/${magazine.slug}/${issue.slug}`;
      const articlePath = `${issuePath}/${article.slug}`;
      const expectedOpening = `${words.slice(0, TEASER_OPENING_WORDS).join(" ")}…`;
      expect(TEASER_OPENING_WORDS).toBe(80);
      const liveArticle = await m.payload.findByID({
        collection: "articles",
        id: article.id,
        depth: 0,
        draft: false,
      });

      for (const viewerId of [null, fx.outsiderId]) {
        const page = await m.reading.loadIssuePage(m, { ...opts, viewerId });
        expect(page?.access).toBe("teaser");
        expect(page?.community.joinPolicy).toBe("approval_required");
        expect(page?.issue).toMatchObject({
          coverImageUrl: "https://example.test/growth-cover.png",
          editorNote: richText("A note for every reader."),
        });
        expect(page?.items).toEqual([
          expect.objectContaining({
            kind: "article",
            article: expect.objectContaining({
              id: Number(article.id),
              opening: expectedOpening,
            }),
          }),
          expect.objectContaining({
            kind: "editorial",
            heading: "From the editors",
            intro: "A public introduction",
            body: null,
          }),
        ]);
        const articlePage = await m.reading.loadMagazineArticlePage(m, {
          ...opts,
          articleSlug: article.slug,
          viewerId,
        });
        expect(articlePage?.mode).toBe("teaser");
        expect(articlePage?.article).toMatchObject({
          opening: expectedOpening,
        });
        expect(articlePage?.article).not.toHaveProperty("content");
        for (const payload of [page, articlePage]) {
          const serialized = JSON.stringify(payload);
          expect(serialized).toContain(words.slice(0, 80).join(" "));
          expect(serialized).not.toContain(words[80]);
          expect(serialized).not.toContain(codeMarker);
          expect(serialized).not.toContain(editorialMarker);
        }
        expect(await canReadArticle(m, liveArticle, viewerId)).toBe(false);
      }

      const paths = await magazineSitemapPaths(m);
      expect(paths).not.toContain(issuePath);
      expect(paths).not.toContain(articlePath);
      const work = await loadProfileWork(m, {
        userId: fx.editorId,
        viewerId: null,
        locale: "en",
      });
      expect(work.articles.items.map((item) => Number(item.id))).not.toContain(
        Number(article.id),
      );
      // Use the same agent authentication setup as article-surfaces.integration.test.ts.
      const agentId = `growth-agent-${fx.sfx}`;
      await m.db.insert(m.schema.agentProfiles).values({
        id: agentId,
        ownerId: fx.outsiderId,
        name: "Growth reader",
        status: "active",
      });
      fx.agentIds.push(agentId);
      const key = generateApiKey();
      await m.db.insert(m.schema.agentApiKeys).values({
        agentId,
        ownerId: fx.outsiderId,
        keyHash: key.hash,
        keyPrefix: key.prefix,
        scopes: ["read"],
        isActive: true,
      });
      const agent = callerAs(
        null,
        new Headers({ authorization: `Bearer ${key.raw}` }),
      );
      const search = await agent.agent.searchKnowledge({
        query: fx.sfx,
        type: "articles",
      });
      expect(
        search
          .filter((item) => item.type === "article")
          .map((item) => Number(item.id)),
      ).not.toContain(Number(article.id));
      const feed = await GET();
      expect(feed.status).toBe(200);
      const xml = await feed.text();
      expect(xml).not.toContain(article.slug);
      expect(xml).not.toContain("/magazines/");
      expect(xml).not.toContain(codeMarker);
      expect(xml).not.toContain(editorialMarker);
      for (const articleSlug of [null, article.slug]) {
        expect(await loadShareCard(m, { ...opts, articleSlug })).toMatchObject({
          issueTitle: issue.title,
        });
      }
      const home = await m.reading.loadMagazinesHome(m, { locale: "en" });
      expect(home.magazines.map((card) => Number(card.id))).toContain(
        Number(magazine.id),
      );
      expect(
        home.magazines.find((card) => Number(card.id) === Number(magazine.id))
          ?.latest.id,
      ).toBe(Number(issue.id));

      await outsider.communities.requestToJoin({
        slug,
        source: {
          via: "magazine",
          magazineId: Number(magazine.id),
          issueId: Number(issue.id),
        },
      });
      expect(
        (await m.reading.loadIssuePage(m, { ...opts, viewerId: fx.outsiderId }))
          ?.access,
      ).toBe("teaser");
      expect((await loadIssueStats(m, Number(issue.id), "en"))?.joins).toBe(0);
      await owner.communities.approveRequest({ slug, userId: fx.outsiderId });
      const memberPage = await m.reading.loadIssuePage(m, {
        ...opts,
        viewerId: fx.outsiderId,
      });
      expect(memberPage?.access).toBe("full");
      expect(JSON.stringify(memberPage)).toContain(editorialMarker);
      const fullArticle = await m.reading.loadMagazineArticlePage(m, {
        ...opts,
        articleSlug: article.slug,
        viewerId: fx.outsiderId,
      });
      expect(fullArticle?.mode).toBe("full");
      expect(JSON.stringify(fullArticle)).toContain(codeMarker);
      expect((await loadIssueStats(m, Number(issue.id), "en"))?.joins).toBe(1);

      for (const input of [
        { issueId: Number(issue.id), event: "view" as const },
        {
          issueId: Number(issue.id),
          articleId: Number(article.id),
          event: "view" as const,
        },
        {
          issueId: Number(issue.id),
          articleId: Number(article.id),
          event: "read_end" as const,
        },
      ]) {
        await expect(outsider.magazineStats.record(input)).resolves.toEqual({
          recorded: true,
        });
        await expect(owner.magazineStats.record(input)).resolves.toEqual({
          recorded: false,
        });
      }
      expect(await loadIssueStats(m, Number(issue.id), "en")).toMatchObject({
        views: 1,
        readers: 1,
        joins: 1,
        articles: [{ articleId: Number(article.id), readers: 1, readToEnd: 1 }],
      });

      // Exercise visibility while the magazine is still shown. Staff hiding
      // below must not be what makes the issue disappear from these surfaces.
      async function expectHomeIssue(present: boolean) {
        const current = await m.reading.loadMagazinesHome(m, { locale: "en" });
        expect(
          current.magazines.some(
            (card) =>
              Number(card.id) === Number(magazine.id) &&
              Number(card.latest.id) === Number(issue.id),
          ),
        ).toBe(present);
        const latest = [current.featured, ...current.justPublished];
        expect(
          latest.some((card) => Number(card?.id) === Number(issue.id)),
        ).toBe(present);
      }

      await expectHomeIssue(true);
      // Previews are deliberately absent from the full-reading sitemap.
      expect(await magazineSitemapPaths(m)).not.toContain(issuePath);
      issue = await owner.magazines.updateIssue({
        slug,
        issueId,
        expectedUpdatedAt: issue.updatedAt,
        visibility: "members",
      });
      await expectHomeIssue(false);
      expect(await magazineSitemapPaths(m)).not.toContain(issuePath);
      expect(await magazineSitemapPaths(m)).not.toContain(articlePath);

      // A public issue supplies the positive sitemap control for the same
      // transition, then disappears immediately when returned to members.
      issue = await owner.magazines.updateIssue({
        slug,
        issueId,
        expectedUpdatedAt: issue.updatedAt,
        visibility: "public",
        confirmUnlistedPublic: true,
      });
      await expectHomeIssue(true);
      expect(await magazineSitemapPaths(m)).toContain(issuePath);
      expect(await magazineSitemapPaths(m)).toContain(articlePath);
      issue = await owner.magazines.updateIssue({
        slug,
        issueId,
        expectedUpdatedAt: issue.updatedAt,
        visibility: "members",
      });
      await expectHomeIssue(false);
      expect(await magazineSitemapPaths(m)).not.toContain(issuePath);
      expect(await magazineSitemapPaths(m)).not.toContain(articlePath);

      issue = await owner.magazines.updateIssue({
        slug,
        issueId,
        expectedUpdatedAt: issue.updatedAt,
        visibility: "teaser",
        confirmUnlistedPublic: true,
      });

      const hidden = await m.payload.update({
        collection: "magazines",
        id: magazine.id,
        data: { listingHidden: true },
        user: { id: 1, collection: "users" },
      });
      expect(hidden.listingHiddenBy).toBe("1");
      expect(hidden.listingHiddenAt).toEqual(expect.any(String));
      const hiddenHome = await m.reading.loadMagazinesHome(m, { locale: "en" });
      expect(hiddenHome.magazines.map((card) => Number(card.id))).not.toContain(
        Number(magazine.id),
      );
      expect(hiddenHome.featured?.id).not.toBe(Number(issue.id));
      expect(
        hiddenHome.justPublished.map((card) => Number(card.id)),
      ).not.toContain(Number(issue.id));
      expect(
        (await magazineSitemapPaths(m)).some((path) =>
          path.startsWith(`/magazines/${magazine.slug}`),
        ),
      ).toBe(false);
      for (const viewerId of [null, fx.outsiderId]) {
        const data = await m.reading.loadIssuePage(m, { ...opts, viewerId });
        expect(data?.access).toBe(viewerId ? "full" : "teaser");
        expect(data).not.toBeNull();
        expect(isIssueIndexable(data!.issue, data!.magazine)).toBe(false);
      }
      const saved = await owner.magazines.saveSettings({
        slug,
        name: "Still hidden",
        magazineSlug: magazine.slug,
        topics: [],
        defaultVisibility: "members",
      });
      expect(saved).toMatchObject({
        listingHidden: true,
        listingHiddenBy: "1",
        listingHiddenAt: hidden.listingHiddenAt,
      });

      await owner.magazines.updateIssue({
        slug,
        issueId,
        expectedUpdatedAt: issue.updatedAt,
        visibility: "members",
      });
      // The contributor fixture has never joined this community.
      for (const viewerId of [null, fx.contributorId]) {
        expect(
          await m.reading.loadIssuePage(m, { ...opts, viewerId }),
        ).toBeNull();
        expect(
          await m.reading.loadMagazineArticlePage(m, {
            ...opts,
            articleSlug: article.slug,
            viewerId,
          }),
        ).toBeNull();
      }
      for (const articleSlug of [null, article.slug]) {
        expect(await loadShareCard(m, { ...opts, articleSlug })).toBeNull();
      }
      expect(
        (await m.reading.loadIssuePage(m, { ...opts, viewerId: fx.outsiderId }))
          ?.access,
      ).toBe("full");
    }, 120_000);
  },
);
