// @vitest-environment node
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { IssueReaderAccess } from "@/lib/magazines/access";
import type { db as Db } from "@/server/db";
import type * as Schema from "@/server/db/schema";

import type { PayloadClient } from "../deps";
import type * as Registry from "./registry";
import type { ItemContext } from "./types";

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
 * The `article` item kind against real Payload documents (ADR-0043): which
 * articles an issue may hold, and which text readers and editors see.
 */
describe.skipIf(!RUN_DB)("article item kind [DB integration]", () => {
  type Mods = {
    db: typeof Db;
    schema: typeof Schema;
    registry: typeof Registry;
    payload: PayloadClient;
  };
  let m: Mods;

  type Fixture = {
    sfx: string;
    userId: string;
    communityIds: string[];
    magazineIds: number[];
    issueIds: number[];
    articleIds: number[];
  };
  let fx: Fixture;

  beforeAll(async () => {
    const [{ db }, schema, registry, { getPayloadClient }] = await Promise.all([
      import("@/server/db"),
      import("@/server/db/schema"),
      import("./registry"),
      import("@/server/payload"),
    ]);
    m = { db, schema, registry, payload: await getPayloadClient() };
  }, 120_000);

  beforeEach(async () => {
    const { db, schema } = m;
    const sfx = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const userId = `aik-editor-${sfx}`;
    await db
      .insert(schema.user)
      .values({ id: userId, email: `${userId}@example.test`, name: userId });
    fx = {
      sfx,
      userId,
      communityIds: [],
      magazineIds: [],
      issueIds: [],
      articleIds: [],
    };
  }, 60_000);

  afterEach(async () => {
    const { db, schema } = m;
    const { eq, inArray } = await import("drizzle-orm");
    // Issues first: their article blocks hold a required reference.
    if (fx.issueIds.length > 0) {
      await m.payload.delete({
        collection: "magazine-issues",
        where: { id: { in: fx.issueIds } },
      });
    }
    if (fx.articleIds.length > 0) {
      await m.payload.delete({
        collection: "articles",
        where: { id: { in: fx.articleIds } },
      });
    }
    if (fx.magazineIds.length > 0) {
      await m.payload.delete({
        collection: "magazines",
        where: { id: { in: fx.magazineIds } },
      });
    }
    await db
      .delete(schema.communities)
      .where(inArray(schema.communities.id, fx.communityIds));
    await db.delete(schema.user).where(eq(schema.user.id, fx.userId));
  }, 60_000);

  /** A community with its magazine (one magazine per community). */
  async function magazine(
    label: string,
  ): Promise<{ id: number; communityId: string }> {
    const [community] = await m.db
      .insert(m.schema.communities)
      .values({
        name: `Article items ${label} ${fx.sfx}`,
        slug: `aik-${label}-${fx.sfx}`,
        createdBy: fx.userId,
      })
      .returning();
    fx.communityIds.push(community!.id);
    const doc = await m.payload.create({
      collection: "magazines",
      data: {
        name: `Items ${label} ${fx.sfx}`,
        slug: `aik-${label}-${fx.sfx}`,
        communityId: community!.id,
        createdBy: fx.userId,
      },
    });
    fx.magazineIds.push(doc.id);
    return { id: doc.id, communityId: community!.id };
  }

  async function issue(
    mag: { id: number; communityId: string },
    number: number,
    items: Registry.StoredBlock[] = [],
  ) {
    const doc = await m.payload.create({
      collection: "magazine-issues",
      data: {
        magazine: mag.id,
        communityId: mag.communityId,
        number,
        title: `Issue ${number}`,
        slug: `issue-${number}`,
        status: "draft",
        visibility: "members",
        items: items as never,
      },
    });
    fx.issueIds.push(doc.id);
    return doc;
  }

  async function article(
    label: string,
    data: Record<string, unknown>,
  ): Promise<number> {
    const doc = await m.payload.create({
      collection: "articles",
      data: {
        title: `${label} first text`,
        slug: `aik-${label}-${fx.sfx}`,
        content: richText(`${label} first text`),
        type: "article",
        authorId: fx.userId,
        authorName: "Editor",
        authorType: "member",
        reviewStatus: "approved",
        status: "draft",
        ...data,
      } as never,
    });
    fx.articleIds.push(doc.id);
    return doc.id;
  }

  /**
   * Places an article the way the issue service does: the claim writes the
   * main row by SQL, then a draft save carries it to the latest version
   * (a Payload save never places by itself; see `placementForSave`).
   */
  async function place(articleId: number, issueId: number) {
    const { sql } = await import("drizzle-orm");
    await m.db.execute(sql`
      UPDATE "public"."articles" SET "magazine_issue_id" = ${issueId}
      WHERE "id" = ${articleId}
    `);
    await m.payload.update({
      collection: "articles",
      id: articleId,
      data: {},
      draft: true,
    });
  }

  function ctx(
    magazineId: number,
    issueId: number | null,
    access: IssueReaderAccess,
  ): ItemContext {
    return { payload: m.payload, magazineId, issueId, locale: "en", access };
  }

  it("refuses an article from another magazine, one not approved, and one placed in another issue", async () => {
    const ours = await magazine("ours");
    const theirs = await magazine("theirs");
    const otherIssue = await issue(ours, 1);
    const thisIssue = await issue(ours, 2);

    const foreign = await article("foreign", {
      magazine: theirs.id,
      reviewStatus: "approved",
    });
    const pending = await article("pending", {
      magazine: ours.id,
      reviewStatus: "pending_review",
    });
    const placedElsewhere = await article("placed", { magazine: ours.id });
    await place(placedElsewhere, otherIssue.id);
    const placedHere = await article("here", { magazine: ours.id });
    await place(placedHere, thisIssue.id);
    const ready = await article("ready", { magazine: ours.id });

    const blocks = m.registry.toStoredItems(
      [foreign, pending, placedElsewhere, placedHere, ready].map(
        (articleId) => ({ kind: "article" as const, articleId }),
      ),
    );

    expect(
      await m.registry.validateIssueItems(
        blocks,
        ctx(ours.id, thisIssue.id, "editor"),
      ),
    ).toEqual([
      { itemIndex: 0, code: "ITEM_INVALID" },
      { itemIndex: 1, code: "ARTICLE_NOT_READY" },
      { itemIndex: 2, code: "ARTICLE_PLACED" },
    ]);
  });

  it("readers never see an unpublished article; editors see it with its latest draft text", async () => {
    const ours = await magazine("ours");
    const unpublished = await article("unpublished", { magazine: ours.id });
    const published = await article("published", {
      magazine: ours.id,
      status: "published",
      publishedAt: new Date().toISOString(),
    });
    for (const id of [unpublished, published]) {
      await m.payload.update({
        collection: "articles",
        id,
        draft: true,
        data: { title: `${id} latest text` },
      });
    }

    const saved = await issue(
      ours,
      1,
      m.registry.toStoredItems([
        { kind: "article", articleId: unpublished },
        { kind: "article", articleId: published },
      ]),
    );
    const blocks = saved.items ?? [];
    expect(blocks).toHaveLength(2);

    const titles = (
      views: Awaited<ReturnType<typeof m.registry.loadIssueItemViews>>,
    ) =>
      views.map((v) =>
        "unavailable" in v
          ? `unavailable:${v.reason}`
          : v.kind === "article"
            ? v.article.title
            : v.kind,
      );

    expect(
      titles(
        await m.registry.loadIssueItemViews(
          blocks,
          ctx(ours.id, saved.id, "full"),
        ),
      ),
    ).toEqual(["published first text"]);

    expect(
      titles(
        await m.registry.loadIssueItemViews(
          blocks,
          ctx(ours.id, saved.id, "editor"),
        ),
      ),
    ).toEqual([`${unpublished} latest text`, `${published} latest text`]);
  });
});
