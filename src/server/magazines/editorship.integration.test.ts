// @vitest-environment node
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Magazine } from "@/payload-types";
import type { db as Db } from "@/server/db";
import type * as Schema from "@/server/db/schema";

import type { Deps } from "./deps";
import type * as Desk from "./desk";
import type * as Editorship from "./editorship";
import type * as Articles from "./magazine-articles";

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

describe.skipIf(!RUN_DB)("magazine editorship [DB integration]", () => {
  let m: {
    db: typeof Db;
    schema: typeof Schema;
    deps: Deps;
    editorship: typeof Editorship;
    desk: typeof Desk;
    articles: typeof Articles;
  };
  let fx: {
    sfx: string;
    users: {
      owner: string;
      admin: string;
      moderator: string;
      editor: string;
      contributor: string;
      banned: string;
    };
    community: {
      id: string;
      slug: string;
      name: string;
      isListedInDirectory: boolean;
    };
    magazine: Magazine;
  };

  beforeAll(async () => {
    const [{ db }, schema, editorship, desk, articles, { getPayloadClient }] =
      await Promise.all([
        import("@/server/db"),
        import("@/server/db/schema"),
        import("./editorship"),
        import("./desk"),
        import("./magazine-articles"),
        import("@/server/payload"),
      ]);
    m = {
      db,
      schema,
      editorship,
      desk,
      articles,
      deps: { db, payload: await getPayloadClient() },
    };
  }, 120_000);

  beforeEach(async () => {
    const { db, schema } = m;
    const sfx = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const users = {
      owner: `me-owner-${sfx}`,
      admin: `me-admin-${sfx}`,
      moderator: `me-mod-${sfx}`,
      editor: `me-editor-${sfx}`,
      contributor: `me-contributor-${sfx}`,
      banned: `me-banned-${sfx}`,
    };
    await db.insert(schema.user).values(
      Object.values(users).map((id) => ({
        id,
        email: `${id}@example.test`,
        name: id,
      })),
    );
    await db
      .insert(schema.memberProfiles)
      .values(
        Object.values(users).map((userId) => ({ userId, displayName: userId })),
      );
    const [community] = await db
      .insert(schema.communities)
      .values({
        name: `Editorship ${sfx}`,
        slug: `me-${sfx}`,
        createdBy: users.owner,
        isListedInDirectory: false,
      })
      .returning();
    await db.insert(schema.communityMemberships).values([
      { communityId: community!.id, userId: users.owner, role: "owner" },
      { communityId: community!.id, userId: users.admin, role: "admin" },
      {
        communityId: community!.id,
        userId: users.moderator,
        role: "moderator",
      },
      { communityId: community!.id, userId: users.editor, role: "member" },
      { communityId: community!.id, userId: users.contributor, role: "member" },
      {
        communityId: community!.id,
        userId: users.banned,
        role: "member",
        status: "banned",
      },
    ]);
    const magazine = await m.deps.payload.create({
      collection: "magazines",
      data: {
        name: `The Gazette ${sfx}`,
        slug: `me-gazette-${sfx}`,
        communityId: community!.id,
        createdBy: users.owner,
      },
    });
    await db.insert(schema.magazineStaff).values([
      {
        magazineId: magazine.id,
        communityId: community!.id,
        userId: users.owner,
        role: "contributor",
      },
      {
        magazineId: magazine.id,
        communityId: community!.id,
        userId: users.editor,
        role: "editor",
      },
      {
        magazineId: magazine.id,
        communityId: community!.id,
        userId: users.contributor,
        role: "contributor",
      },
      {
        magazineId: magazine.id,
        communityId: community!.id,
        userId: users.banned,
        role: "editor",
      },
    ]);
    fx = {
      sfx,
      users,
      community: {
        id: community!.id,
        slug: community!.slug,
        name: community!.name,
        isListedInDirectory: community!.isListedInDirectory,
      },
      magazine,
    };
  }, 60_000);

  afterEach(async () => {
    if (!fx) return;
    const {
      db,
      schema,
      deps: { payload },
    } = m;
    const { eq, inArray } = await import("drizzle-orm");
    const userIds = Object.values(fx.users);
    await db
      .delete(schema.magazineStaff)
      .where(inArray(schema.magazineStaff.userId, userIds));
    await payload.delete({
      collection: "articles",
      where: { authorId: { in: userIds } },
    });
    await payload.delete({
      collection: "magazines",
      where: { id: { equals: fx.magazine.id } },
    });
    await db
      .delete(schema.spaces)
      .where(eq(schema.spaces.communityId, fx.community.id));
    await db
      .delete(schema.communityMemberships)
      .where(inArray(schema.communityMemberships.userId, userIds));
    await db
      .delete(schema.communities)
      .where(eq(schema.communities.id, fx.community.id));
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

  const ref = () => ({
    communityId: fx.community.id,
    magazineId: fx.magazine.id,
  });
  const at = (viewerId: string | null) => ({
    communitySlug: fx.community.slug,
    viewerId,
  });

  it("loadMagazineEditorship reads the staff role", async () => {
    for (const [userId, expected] of [
      [
        fx.users.owner,
        {
          role: "editor_in_chief",
          isEditor: true,
          isMember: true,
          leadsCommunity: true,
        },
      ],
      [
        fx.users.admin,
        {
          role: "editor_in_chief",
          isEditor: true,
          isMember: true,
          leadsCommunity: true,
        },
      ],
      [
        fx.users.editor,
        {
          role: "editor",
          isEditor: true,
          isMember: true,
          leadsCommunity: false,
        },
      ],
      [
        fx.users.contributor,
        {
          role: "contributor",
          isEditor: false,
          isMember: true,
          leadsCommunity: false,
        },
      ],
      [
        fx.users.moderator,
        { role: null, isEditor: false, isMember: true, leadsCommunity: false },
      ],
    ] as const) {
      expect(
        await m.editorship.loadMagazineEditorship(m.db, ref(), userId),
      ).toEqual(expected);
    }
  });

  it("a staff row without an active membership grants nothing", async () => {
    expect(
      await m.editorship.loadMagazineEditorship(m.db, ref(), fx.users.banned),
    ).toEqual(m.editorship.NO_STANDING);
    expect(await m.editorship.loadEditorScope(m.db, fx.users.banned)).toEqual({
      editorCommunityIds: [],
      memberCommunityIds: [],
    });
    expect(await m.editorship.loadEditorScope(m.db, fx.users.editor)).toEqual({
      editorCommunityIds: [fx.community.id],
      memberCommunityIds: [fx.community.id],
    });
    expect(
      await m.articles.loadMagazineWriting(m.deps, at(fx.users.banned)),
    ).toBeNull();
    await expect(
      m.articles.requireMagazineCapability(
        m.deps,
        fx.magazine.id,
        fx.users.banned,
        "write",
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lists the editors to notify", async () => {
    expect(await m.editorship.listMagazineEditorIds(m.db, ref())).toEqual(
      [fx.users.owner, fx.users.admin, fx.users.editor].sort(),
    );
  });

  it("loadMagazineWriting answers per role", async () => {
    const writing = {
      magazineId: fx.magazine.id,
      magazineName: fx.magazine.name,
    };
    expect(
      await m.articles.loadMagazineWriting(m.deps, at(fx.users.contributor)),
    ).toEqual({ ...writing, handIn: "send_for_review" });
    expect(
      await m.articles.loadMagazineWriting(m.deps, at(fx.users.editor)),
    ).toEqual({ ...writing, handIn: "mark_ready" });
    expect(
      await m.articles.loadMagazineWriting(m.deps, at(fx.users.moderator)),
    ).toBeNull();
    expect(await m.articles.loadMagazineWriting(m.deps, at(null))).toBeNull();
    expect(
      await m.desk.loadMagazineDesk(m.deps, at(fx.users.contributor)),
    ).toEqual({
      community: fx.community,
      magazine: fx.magazine,
      standing: {
        role: "contributor",
        isEditor: false,
        isMember: true,
        leadsCommunity: false,
      },
    });
  });

  it("a contributor's article is editable only while open", async () => {
    const article = await m.deps.payload.create({
      collection: "articles",
      data: {
        title: "Writer's draft",
        slug: `me-draft-${fx.sfx}`,
        authorId: fx.users.contributor,
        magazine: fx.magazine.id,
        status: "draft",
        reviewStatus: "pending_review",
      },
      draft: true,
    });
    const opts = { ...at(fx.users.contributor), articleSlug: article.slug };
    expect(
      await m.articles.loadMagazineArticleForEditing(m.deps, opts),
    ).toMatchObject({ article: { id: article.id }, editable: false });
    for (const reviewStatus of [
      "changes_requested",
      null,
      "approved",
      "rejected",
    ] as const) {
      await m.deps.payload.update({
        collection: "articles",
        id: article.id,
        data: { reviewStatus },
        draft: true,
      });
      expect(
        await m.articles.loadMagazineArticleForEditing(m.deps, opts),
      ).toMatchObject({
        editable: reviewStatus === null || reviewStatus === "changes_requested",
      });
    }
    expect(
      await m.articles.loadMagazineArticleForEditing(m.deps, {
        ...opts,
        viewerId: fx.users.editor,
      }),
    ).toBeNull();
  });

  it("a soft-deleted community gives its team nothing", async () => {
    const { eq } = await import("drizzle-orm");
    await m.db
      .update(m.schema.communities)
      .set({ deletedAt: new Date() })
      .where(eq(m.schema.communities.id, fx.community.id));
    await expect(
      m.articles.requireMagazineCapability(
        m.deps,
        fx.magazine.id,
        fx.users.contributor,
        "write",
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      m.articles.requireEditorOfMagazine(
        m.deps,
        fx.magazine.id,
        fx.users.editor,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(
      await m.desk.loadMagazineDesk(m.deps, at(fx.users.contributor)),
    ).toBeNull();
  });

  it("the desk lets a community leader start a magazine", async () => {
    const { eq } = await import("drizzle-orm");
    await m.db
      .delete(m.schema.magazineStaff)
      .where(eq(m.schema.magazineStaff.magazineId, fx.magazine.id));
    await m.deps.payload.delete({
      collection: "magazines",
      id: fx.magazine.id,
    });
    expect(
      await m.desk.loadMagazineDesk(m.deps, at(fx.users.owner)),
    ).toMatchObject({
      community: fx.community,
      magazine: null,
      standing: { role: "editor_in_chief", leadsCommunity: true },
    });
    expect(
      await m.desk.loadMagazineDesk(m.deps, {
        communitySlug: `missing-${fx.sfx}`,
        viewerId: fx.users.owner,
      }),
    ).toBeNull();
    await expect(
      m.articles.requireMagazineCapability(
        m.deps,
        fx.magazine.id,
        fx.users.owner,
        "write",
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
