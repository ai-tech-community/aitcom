// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import { roleCan } from "@/lib/magazines/roles";
import { isLocalDbConfigured } from "@/test/magazine-auto-draft-fixture";
import { readingFixture } from "@/test/magazine-reading-fixture";

const RUN_DB = isLocalDbConfigured();

/**
 * The reading-page read models (ADR-0042) against real Payload documents:
 * what the `/magazines` home, a shelf, an issue, a magazine article and the
 * community Magazine tab show to editors, members, outsiders and guests.
 */
describe.skipIf(!RUN_DB)("magazine read models [DB integration]", () => {
  const fixture = readingFixture();
  let m: typeof fixture.m;
  let fx: typeof fixture.fx;
  const {
    community,
    magazineIn,
    draftIssue,
    publishedIssue,
    approvedArticle,
    richText,
  } = fixture;
  const LOCALE = "en" as const;
  beforeEach(() => {
    m = fixture.m;
    fx = fixture.fx;
  });

  it("the subscription lookup and shelf agree on who may know a magazine", async () => {
    const { loadIssueReadScope } = await import("./readable-issues");
    for (const listed of [true, false]) {
      const c = await community(listed ? "known-listed" : "known-private", {
        listed,
      });
      const mag = await magazineIn(
        c,
        listed ? "known-listed" : "known-private",
        { defaultVisibility: "members" },
      );
      for (const viewerId of [null, fx.outsiderId, fx.memberId, fx.editorId]) {
        const opts = { magazineSlug: mag.slug, viewerId, locale: LOCALE };
        const shelf = await m.reading.loadMagazineShelf(m, opts);
        expect(Boolean(await m.reading.findMagazineForViewer(m, opts))).toBe(
          Boolean(shelf),
        );
        expect(
          await m.reading.readableIssueExists(
            m,
            await loadIssueReadScope(m.db, viewerId),
            mag.id,
          ),
        ).toBe(false);
      }
      await publishedIssue(c, mag, "Private issue");
      expect(
        await m.reading.readableIssueExists(
          m,
          await loadIssueReadScope(m.db, fx.memberId),
          mag.id,
        ),
      ).toBe(true);
      expect(
        await m.reading.readableIssueExists(
          m,
          await loadIssueReadScope(m.db, null),
          mag.id,
        ),
      ).toBe(false);
      const publicMag = await magazineIn(
        c,
        listed ? "known-listed" : "known-private",
        {
          defaultVisibility: "public",
          confirmUnlistedPublic: true,
        },
      );
      await publishedIssue(c, publicMag, "Public issue");
      expect(
        await m.reading.findMagazineForViewer(m, {
          magazineSlug: mag.slug,
          viewerId: null,
        }),
      ).not.toBeNull();
      const { eq } = await import("drizzle-orm");
      await m.db
        .update(m.schema.communities)
        .set({ deletedAt: new Date() })
        .where(eq(m.schema.communities.id, c.id));
      expect(
        await m.reading.findMagazineForViewer(m, {
          magazineSlug: mag.slug,
          viewerId: fx.editorId,
        }),
      ).toBeNull();
    }
    expect(
      await m.reading.findMagazineForViewer(m, {
        magazineSlug: `missing-${fx.sfx}`,
        viewerId: null,
      }),
    ).toBeNull();
  }, 30_000);

  const ids = (cards: { id: number }[]) => cards.map((c) => c.id);

  // ── Home ──────────────────────────────────────────────────────────────

  it("each card carries the resolver's outsider reach", async () => {
    const listed = await community("reach-listed");
    const mag = await magazineIn(listed, "reach-listed");
    const full = await publishedIssue(listed, mag, "Public");
    const preview = await publishedIssue(listed, mag, "Preview", {
      visibility: "teaser",
    });
    const home = await m.reading.loadMagazinesHome(m, { locale: LOCALE });
    const cards = [
      ...home.justPublished,
      ...home.magazines.map((m) => m.latest),
      ...(home.featured ? [home.featured] : []),
    ];
    expect(cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: full.id, outsiderReach: "full" }),
        expect.objectContaining({ id: preview.id, outsiderReach: "teaser" }),
      ]),
    );
    const unlisted = await community("reach-unlisted", { listed: false });
    const privateMag = await magazineIn(unlisted, "reach-unlisted", {
      defaultVisibility: "members",
    });
    // A listed community becoming unlisted leaves its preview unconfirmed.
    const unconfirmed = await m.payload.create({
      collection: "magazine-issues",
      data: {
        magazine: privateMag.id,
        communityId: unlisted.id,
        number: 1,
        title: "Unconfirmed preview",
        slug: "unconfirmed-preview",
        status: "published",
        visibility: "teaser",
      },
    });
    const tab = await m.reading.loadCommunityMagazineTab(m, {
      communitySlug: unlisted.slug,
      viewerId: fx.memberId,
      locale: LOCALE,
    });
    expect(tab?.latest).toMatchObject({
      id: unconfirmed.id,
      effectiveVisibility: "members",
      outsiderReach: "none",
    });
  }, 60_000);

  it("home lists only issues outsiders may see, newest first, featured = newest with a cover", async () => {
    const c = await community("home");
    const mag = await magazineIn(c, "home");
    const covered = await publishedIssue(c, mag, "Covered", {
      coverImageUrl: "https://example.test/cover.png",
    });
    const plain = await publishedIssue(c, mag, "Plain");
    const membersOnly = await publishedIssue(c, mag, "Members", {
      visibility: "members",
    });
    await draftIssue(c, mag, "Draft");

    // The home takes no viewer: a member of this community gets exactly
    // this result too, so members-only issues never reach it.
    const home = await m.reading.loadMagazinesHome(m, { locale: LOCALE });

    expect(home.featured?.id).toBe(covered.id);
    expect(home.featured?.effectiveVisibility).toBe("public");
    // Newest first; the featured issue is not repeated beside itself.
    const ours = ids(home.justPublished).filter((id) =>
      [covered.id, plain.id, membersOnly.id].includes(id),
    );
    expect(ours).toEqual([plain.id]);

    const card = home.magazines.find((mc) => mc.slug === mag.slug);
    expect(card).toBeDefined();
    // The magazine's latest public issue, not its newer members-only one.
    expect(card!.latest.id).toBe(plain.id);
    expect(card!.community).toEqual({
      name: `Reading home ${fx.sfx}`,
      slug: c.slug,
    });
    const everyListedIssue = [
      ...(home.featured ? [home.featured] : []),
      ...home.justPublished,
      ...home.magazines.map((mc) => mc.latest),
    ];
    // Outsiders may see public issues and previews; members-only never.
    for (const issue of everyListedIssue)
      expect(["public", "teaser"]).toContain(issue.effectiveVisibility);
    expect(ids(everyListedIssue)).not.toContain(membersOnly.id);
  });

  it("home filters magazines by topic", async () => {
    const topicA = `agents${fx.sfx.replace(/\D/g, "")}`;
    const topicB = `robots${fx.sfx.replace(/\D/g, "")}`;
    const ca = await community("topica");
    const cb = await community("topicb");
    const magA = await magazineIn(ca, "topica", { topics: [topicA] });
    const magB = await magazineIn(cb, "topicb", { topics: [topicB] });
    await publishedIssue(ca, magA, "A one");
    await publishedIssue(cb, magB, "B one");

    const all = await m.reading.loadMagazinesHome(m, { locale: LOCALE });
    const slugs = all.magazines.map((mc) => mc.slug);
    expect(slugs).toEqual(expect.arrayContaining([magA.slug, magB.slug]));
    expect(all.topics.length).toBeLessThanOrEqual(8);

    const filtered = await m.reading.loadMagazinesHome(m, {
      locale: LOCALE,
      topic: ` ${topicA.toUpperCase()} `,
    });
    expect(filtered.magazines.map((mc) => mc.slug)).toEqual([magA.slug]);
    expect(filtered.magazines[0]!.topics).toEqual([topicA]);
  });

  // ── Shelf ─────────────────────────────────────────────────────────────

  it("shelf: members see members-only issues, outsiders only public ones", async () => {
    const c = await community("shelf");
    const mag = await magazineIn(c, "shelf");
    const pub = await publishedIssue(c, mag, "Public one");
    const members = await publishedIssue(c, mag, "Members one", {
      visibility: "members",
    });
    const draft = await draftIssue(c, mag, "Draft one");

    const shelf = (viewerId: string | null) =>
      m.reading.loadMagazineShelf(m, {
        magazineSlug: mag.slug,
        viewerId,
        locale: LOCALE,
      });

    const asMember = await shelf(fx.memberId);
    expect(ids(asMember!.issues)).toEqual([members.id, pub.id]);
    expect(asMember!.viewerIsEditor).toBe(false);
    expect(asMember!.issues[0]!.effectiveVisibility).toBe("members");

    const asOutsider = await shelf(fx.outsiderId);
    expect(ids(asOutsider!.issues)).toEqual([pub.id]);
    const asGuest = await shelf(null);
    expect(ids(asGuest!.issues)).toEqual([pub.id]);

    // The public shelf stays published-only. Editors are told drafts exist
    // so the page does not claim there are no issues; the drafts themselves
    // are listed on the Magazine tab.
    const asEditor = await shelf(fx.editorId);
    expect(asEditor!.viewerIsEditor).toBe(true);
    expect(ids(asEditor!.issues)).toEqual([members.id, pub.id]);
    expect(ids(asEditor!.issues)).not.toContain(draft.id);
    expect(asEditor!.unpublishedForEditor).toBe(true);
    expect(asMember!.unpublishedForEditor).toBe(false);

    expect(
      await m.reading.loadMagazineShelf(m, {
        magazineSlug: `rd-missing-${fx.sfx}`,
        viewerId: fx.memberId,
        locale: LOCALE,
      }),
    ).toBeNull();
  });

  it("shelf of a magazine in a private community with no public issue is null for outsiders", async () => {
    const c = await community("private", { listed: false });
    const mag = await magazineIn(c, "private", {
      defaultVisibility: "members",
    });
    const issue = await publishedIssue(c, mag, "Inside");

    const shelf = (viewerId: string | null) =>
      m.reading.loadMagazineShelf(m, {
        magazineSlug: mag.slug,
        viewerId,
        locale: LOCALE,
      });

    expect(await shelf(fx.outsiderId)).toBeNull();
    expect(await shelf(null)).toBeNull();
    expect(ids((await shelf(fx.memberId))!.issues)).toEqual([issue.id]);
  });

  async function previewFixture(codeFirst = false) {
    const c = await community("preview");
    const mag = await magazineIn(c, "preview");
    const opening = "This opening is safe to read.";
    const late = "PRIVATE_LATE_SENTENCE must never reach a preview reader.";
    const content = richText(`${opening} ${"word ".repeat(120)} ${late}`);
    if (codeFirst) {
      content.root.children.unshift({
        type: "code",
        version: 1,
        children: [{ type: "text", text: "PRIVATE_CODE_MARKER ".repeat(50) }],
      });
    }
    const first = await approvedArticle("preview-first", mag.id, content);
    const second = await approvedArticle("preview-next", mag.id, content);
    const issue = await publishedIssue(c, mag, "Preview", {
      visibility: "teaser",
      items: [
        { kind: "article", articleId: first.id },
        { kind: "article", articleId: second.id },
        {
          kind: "editorial",
          heading: "A public heading",
          intro: "A public intro",
          body: richText("PRIVATE_EDITORIAL_BODY"),
        },
      ],
    });
    const opts = {
      magazineSlug: mag.slug,
      issueSlug: issue.slug,
      locale: LOCALE,
    };
    return { c, mag, first, opts, opening, late };
  }

  it("a teaser reader gets openings only", async () => {
    const { opts, opening, late } = await previewFixture();
    for (const viewerId of [null, fx.outsiderId]) {
      const page = await m.reading.loadIssuePage(m, { ...opts, viewerId });
      expect(page?.access).toBe("teaser");
      expect(JSON.stringify(page)).toContain(opening);
      expect(JSON.stringify(page)).not.toContain(late);
      expect(JSON.stringify(page)).not.toContain("PRIVATE_EDITORIAL_BODY");
      expect(
        page?.items.find((item) => item.kind === "editorial"),
      ).toMatchObject({ body: null });
      const article = page?.items.find((item) => item.kind === "article");
      expect(article).toMatchObject({
        article: { opening: expect.stringContaining(opening) },
      });
      if (article?.kind === "article" && !("unavailable" in article)) {
        expect(article.article.opening.split(/\s+/)).toHaveLength(80);
      }
    }
  });

  it("the teaser article page carries no body", async () => {
    const { opts, first, opening, late } = await previewFixture();
    for (const viewerId of [null, fx.outsiderId]) {
      const page = await m.reading.loadMagazineArticlePage(m, {
        ...opts,
        articleSlug: first.slug,
        viewerId,
      });
      expect(page?.mode).toBe("teaser");
      expect("content" in page!.article).toBe(false);
      expect(JSON.stringify(page)).toContain(opening);
      expect(JSON.stringify(page)).not.toContain(late);
      expect(JSON.stringify(page)).not.toContain("PRIVATE_EDITORIAL_BODY");
    }
    const memberPage = await m.reading.loadMagazineArticlePage(m, {
      ...opts,
      articleSlug: first.slug,
      viewerId: fx.memberId,
    });
    expect(memberPage?.mode).toBe("full");
    expect(memberPage?.article).toHaveProperty("content");
    expect(JSON.stringify(memberPage)).toContain(late);
  });

  it("a preview reader never gets code text", async () => {
    const { opts, first } = await previewFixture(true);
    for (const viewerId of [null, fx.outsiderId]) {
      const page = await m.reading.loadIssuePage(m, { ...opts, viewerId });
      const articlePage = await m.reading.loadMagazineArticlePage(m, {
        ...opts,
        viewerId,
        articleSlug: first.slug,
      });
      expect(page).not.toBeNull();
      expect(articlePage?.nextInIssue).not.toBeNull();
      expect(JSON.stringify(page)).not.toContain("PRIVATE_CODE_MARKER");
      expect(JSON.stringify(articlePage)).not.toContain("PRIVATE_CODE_MARKER");
    }
  });

  it("only the issue and article pages carry the join rule", async () => {
    const { opts, first, mag } = await previewFixture();
    const page = await m.reading.loadIssuePage(m, { ...opts, viewerId: null });
    const article = await m.reading.loadMagazineArticlePage(m, {
      ...opts,
      viewerId: null,
      articleSlug: first.slug,
    });
    expect(page?.community).toHaveProperty("joinPolicy", "open");
    expect(article?.community).toHaveProperty("joinPolicy", "open");
    const home = await m.reading.loadMagazinesHome(m, { locale: LOCALE });
    const card = home.magazines.find(
      (card) => Number(card.id) === Number(mag.id),
    );
    expect(card).toBeDefined();
    expect(card!.community).not.toHaveProperty("joinPolicy");
    expect(card!.latest.community).not.toHaveProperty("joinPolicy");
    const shelf = await m.reading.loadMagazineShelf(m, {
      ...opts,
      viewerId: null,
    });
    expect(shelf!.community).not.toHaveProperty("joinPolicy");
    expect(page!.issue.community).not.toHaveProperty("joinPolicy");
  });

  // ── Issue page ────────────────────────────────────────────────────────

  it("issue page is null for outsiders on a members issue and for everyone but editors on a draft", async () => {
    const c = await community("issue");
    const mag = await magazineIn(c, "issue");
    const older = await publishedIssue(c, mag, "Older");
    const members = await publishedIssue(c, mag, "Members issue", {
      visibility: "members",
    });
    const draft = await draftIssue(c, mag, "Draft issue");

    const page = (issueSlug: string, viewerId: string | null) =>
      m.reading.loadIssuePage(m, {
        magazineSlug: mag.slug,
        issueSlug,
        viewerId,
        locale: LOCALE,
      });

    expect(await page(members.slug, fx.outsiderId)).toBeNull();
    expect(await page(members.slug, null)).toBeNull();

    const asMember = await page(members.slug, fx.memberId);
    expect(asMember!.access).toBe("full");
    expect(asMember!.issue.id).toBe(members.id);
    expect(asMember!.issue.effectiveVisibility).toBe("members");
    expect(asMember!.issue.status).toBe("published");
    expect(asMember!.items.map((i) => i.kind)).toEqual(["editorial"]);
    expect(ids(asMember!.pastIssues)).toEqual([older.id]);
    expect(asMember!.readingMinutes).toBeGreaterThanOrEqual(1);
    expect(asMember!.community.slug).toBe(c.slug);
    // The editor who published it signs the note, by their profile name.
    expect(asMember!.issue.signedBy).toBe(fx.editorId);

    expect(await page(draft.slug, fx.memberId)).toBeNull();
    expect(await page(draft.slug, fx.outsiderId)).toBeNull();
    expect(await page(draft.slug, null)).toBeNull();
    const asEditor = await page(draft.slug, fx.editorId);
    expect(asEditor!.access).toBe("editor");
    expect(asEditor!.issue.id).toBe(draft.id);
    expect(asEditor!.issue.status).toBe("draft");
    // Nobody has published a draft, so nobody signs it yet.
    expect(asEditor!.issue.signedBy).toBeNull();
  });

  // ── Article page ──────────────────────────────────────────────────────

  it("article page is null when the article is not placed in that issue", async () => {
    const c = await community("article");
    const mag = await magazineIn(c, "article");
    const first = await approvedArticle("first", mag.id);
    const second = await approvedArticle("second", mag.id);
    const holding = await publishedIssue(c, mag, "Holding", {
      items: [
        { kind: "article", articleId: first.id },
        { kind: "article", articleId: second.id },
      ],
    });
    const other = await publishedIssue(c, mag, "Other");

    const page = (
      issueSlug: string,
      articleSlug: string,
      viewerId: string | null,
    ) =>
      m.reading.loadMagazineArticlePage(m, {
        magazineSlug: mag.slug,
        issueSlug,
        articleSlug,
        viewerId,
        locale: LOCALE,
      });

    const read = await page(holding.slug, first.slug, null);
    expect(read!.access).toBe("full");
    expect(read!.article.id).toBe(first.id);
    expect(read!.issue.id).toBe(holding.id);
    expect(read!.issue.status).toBe("published");
    expect(read!.nextInIssue?.article.id).toBe(second.id);
    expect(
      (await page(holding.slug, second.slug, null))!.nextInIssue,
    ).toBeNull();

    // The same article through an issue that does not hold it.
    expect(await page(other.slug, first.slug, null)).toBeNull();
    expect(await page(other.slug, first.slug, fx.editorId)).toBeNull();
  });

  it("article page is null for readers while its issue is a draft, even when the article is published", async () => {
    const c = await community("draftart");
    const mag = await magazineIn(c, "draftart");
    const art = await approvedArticle("placed", mag.id);
    const draft = await draftIssue(c, mag, "Unpublished", {
      items: [{ kind: "article", articleId: art.id }],
    });
    // Published on its own (e.g. by staff), but its issue is not out yet.
    await m.payload.update({
      collection: "articles",
      id: art.id,
      data: { status: "published", _status: "published" } as never,
    });
    const live = await m.payload.findByID({
      collection: "articles",
      id: art.id,
      depth: 0,
      draft: false,
    });
    expect(live.status).toBe("published");
    expect(live.magazineIssue).toBe(draft.id);

    const page = (viewerId: string | null) =>
      m.reading.loadMagazineArticlePage(m, {
        magazineSlug: mag.slug,
        issueSlug: draft.slug,
        articleSlug: art.slug,
        viewerId,
        locale: LOCALE,
      });

    expect(await page(null)).toBeNull();
    expect(await page(fx.memberId)).toBeNull();
    const asEditor = await page(fx.editorId);
    expect(asEditor!.access).toBe("editor");
    expect(asEditor!.issue.status).toBe("draft");
  });

  it("a hidden magazine leaves the home and the sitemap but its pages still open", async () => {
    const { magazineSitemapPaths } = await import("./sitemap-paths");
    const c = await community("hidden");
    const mag = await magazineIn(c, "hidden");
    const art = await approvedArticle("hidden", mag.id);
    const issue = await publishedIssue(c, mag, "Hidden issue", {
      coverImageUrl: "https://example.test/hidden-cover.png",
      items: [{ kind: "article", articleId: art.id }],
    });
    const homeBefore = await m.reading.loadMagazinesHome(m, { locale: LOCALE });
    expect(ids(homeBefore.magazines)).toContain(Number(mag.id));
    const prefix = `/magazines/${mag.slug}`;
    const beforePaths = await magazineSitemapPaths(m);
    expect(beforePaths).toContain(prefix);
    expect(beforePaths).toContain(`${prefix}/${issue.slug}`);
    expect(beforePaths).toContain(`${prefix}/${issue.slug}/${art.slug}`);
    await m.payload.update({
      collection: "magazines",
      id: mag.id,
      data: { listingHidden: true },
    });
    const home = await m.reading.loadMagazinesHome(m, { locale: LOCALE });
    expect(ids(home.magazines)).not.toContain(Number(mag.id));
    expect(home.featured?.id).not.toBe(Number(issue.id));
    expect(ids(home.justPublished)).not.toContain(Number(issue.id));
    expect(
      (await magazineSitemapPaths(m)).some((path) => path.startsWith(prefix)),
    ).toBe(false);
    const opts = {
      magazineSlug: mag.slug,
      viewerId: fx.outsiderId,
      locale: LOCALE,
    };
    expect(
      (await m.reading.loadIssuePage(m, { ...opts, issueSlug: issue.slug }))
        ?.magazine.staffHidden,
    ).toBe(true);
    expect(
      (await m.reading.loadMagazineShelf(m, opts))?.magazine.staffHidden,
    ).toBe(true);
    expect(
      (
        await m.reading.loadMagazineArticlePage(m, {
          ...opts,
          issueSlug: issue.slug,
          articleSlug: art.slug,
        })
      )?.magazine.staffHidden,
    ).toBe(true);
    expect(
      (
        await m.reading.loadCommunityMagazineTab(m, {
          communitySlug: c.slug,
          viewerId: fx.outsiderId,
          locale: LOCALE,
        })
      )?.latest?.id,
    ).toBe(Number(issue.id));
  });

  it("saving the settings never shows a hidden magazine again", async () => {
    const c = await community("hidden-settings");
    const mag = await magazineIn(c, "hidden-settings");
    await m.payload.update({
      collection: "magazines",
      id: mag.id,
      data: { listingHidden: true },
    });
    const hidden = await m.payload.findByID({
      collection: "magazines",
      id: mag.id,
      depth: 0,
    });
    const saved = await m.magazines.saveMagazineSettings(
      m,
      c,
      {
        name: "Changed name",
        slug: mag.slug,
        topics: [],
        defaultVisibility: "public",
      },
      fx.editorId,
      true,
    );
    expect(saved).toMatchObject({
      listingHidden: true,
      listingHiddenAt: hidden.listingHiddenAt,
      listingHiddenBy: hidden.listingHiddenBy,
    });
  });

  // ── Community tab ─────────────────────────────────────────────────────

  it("the Magazine tab tells the viewer their role", async () => {
    const c = await community("tab-roles");
    await m.db.insert(m.schema.communityMemberships).values([
      { communityId: c.id, userId: fx.contributorId, role: "member" },
      { communityId: c.id, userId: fx.staffEditorId, role: "member" },
    ]);
    const tab = (viewerId: string) =>
      m.reading.loadCommunityMagazineTab(m, {
        communitySlug: c.slug,
        viewerId,
        locale: LOCALE,
      });
    // Before a magazine exists, only community leaders have a job on its desk.
    for (const [viewerId, viewerRole] of [
      [fx.editorId, "editor_in_chief"],
      [fx.contributorId, null],
      [fx.staffEditorId, null],
      [fx.memberId, null],
    ] as const) {
      const data = await tab(viewerId);
      expect(data).toMatchObject({
        magazine: null,
        viewerRole,
        viewerIsEditor: roleCan(viewerRole, "edit"),
      });
      expect(data!.viewerIsEditor).toBe(roleCan(data!.viewerRole, "edit"));
    }
    const mag = await magazineIn(c, "tab-roles");
    await m.db.insert(m.schema.magazineStaff).values([
      {
        communityId: c.id,
        magazineId: mag.id,
        userId: fx.contributorId,
        role: "contributor",
      },
      {
        communityId: c.id,
        magazineId: mag.id,
        userId: fx.staffEditorId,
        role: "editor",
      },
    ]);
    for (const [viewerId, viewerRole, viewerIsEditor] of [
      [fx.contributorId, "contributor", false],
      [fx.staffEditorId, "editor", true],
      [fx.editorId, "editor_in_chief", true],
      [fx.memberId, null, false],
    ] as const) {
      const data = await tab(viewerId);
      expect(data).toMatchObject({ viewerRole, viewerIsEditor });
      expect(data!.viewerIsEditor).toBe(roleCan(data!.viewerRole, "edit"));
    }
  });

  it("the community tab has no magazine (not null) when the community has none; null for an unknown community", async () => {
    const c = await community("tab");

    const tab = (communitySlug: string, viewerId: string | null) =>
      m.reading.loadCommunityMagazineTab(m, {
        communitySlug,
        viewerId,
        locale: LOCALE,
      });

    expect(await tab(c.slug, fx.editorId)).toEqual({
      magazine: null,
      latest: null,
      issues: [],
      viewerIsEditor: true,
      viewerRole: "editor_in_chief",
      draftIssues: [],
    });
    expect((await tab(c.slug, fx.memberId))!.viewerIsEditor).toBe(false);
    expect(await tab(`rd-nowhere-${fx.sfx}`, fx.editorId)).toBeNull();

    const mag = await magazineIn(c, "tab");
    const first = await publishedIssue(c, mag, "First");
    const second = await publishedIssue(c, mag, "Second", {
      visibility: "members",
    });
    const asMember = await tab(c.slug, fx.memberId);
    expect(asMember!.magazine?.slug).toBe(mag.slug);
    expect(asMember!.latest?.id).toBe(second.id);
    expect(ids(asMember!.issues)).toEqual([second.id, first.id]);
    const asGuest = await tab(c.slug, null);
    expect(asGuest!.latest?.id).toBe(first.id);
  });
});
