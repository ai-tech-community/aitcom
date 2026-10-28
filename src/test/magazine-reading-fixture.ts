import { afterEach, beforeAll, beforeEach } from "vitest";

import type { IssueVisibility } from "@/lib/magazines/values";
import type { MagazineIssue } from "@/payload-types";
import type { db as Db } from "@/server/db";
import type * as Schema from "@/server/db/schema";

import type { PayloadClient } from "@/server/magazines/deps";
import type * as IssueService from "@/server/magazines/issue-service";
import type * as Registry from "@/server/magazines/items/registry";
import type * as MagazineService from "@/server/magazines/magazine-service";
import type * as Reading from "@/server/magazines/reading";

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

/** Shared seeding and cleanup for magazine reading guarantees. */
export function readingFixture() {
  type Mods = {
    db: typeof Db;
    schema: typeof Schema;
    magazines: typeof MagazineService;
    issues: typeof IssueService;
    reading: typeof Reading;
    payload: PayloadClient;
  };
  let m: Mods;

  type Fixture = {
    sfx: string;
    editorId: string;
    memberId: string;
    outsiderId: string;
    contributorId: string;
    staffEditorId: string;
    communityIds: string[];
    articleIds: number[];
    agentIds: string[];
  };
  let fx: Fixture;

  beforeAll(async () => {
    const [{ db }, schema, magazines, issues, reading, { getPayloadClient }] =
      await Promise.all([
        import("@/server/db"),
        import("@/server/db/schema"),
        import("@/server/magazines/magazine-service"),
        import("@/server/magazines/issue-service"),
        import("@/server/magazines/reading"),
        import("@/server/payload"),
      ]);
    const { sql } = await import("drizzle-orm");
    const { rows } = await db.execute<{ name: string }>(
      sql`select current_database() as name`,
    );
    if (rows[0]?.name !== "aitcom_test")
      throw new Error("Reading tests require aitcom_test");
    m = {
      db,
      schema,
      magazines,
      issues,
      reading,
      payload: await getPayloadClient(),
    };
  }, 120_000);

  beforeEach(async () => {
    const { db, schema } = m;
    const sfx = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    fx = {
      sfx,
      editorId: `rd-editor-${sfx}`,
      memberId: `rd-member-${sfx}`,
      outsiderId: `rd-outsider-${sfx}`,
      contributorId: `rd-contributor-${sfx}`,
      staffEditorId: `rd-staff-editor-${sfx}`,
      communityIds: [],
      articleIds: [],
      agentIds: [],
    };
    const userIds = [
      fx.editorId,
      fx.memberId,
      fx.outsiderId,
      fx.contributorId,
      fx.staffEditorId,
    ];
    await db
      .insert(schema.user)
      .values(
        userIds.map((id) => ({ id, email: `${id}@example.test`, name: id })),
      );
    await db
      .insert(schema.memberProfiles)
      .values(userIds.map((userId) => ({ userId, displayName: userId })));
  }, 60_000);

  afterEach(async () => {
    if (!fx || !m) return;
    const { db, schema, payload } = m;
    const { inArray } = await import("drizzle-orm");
    await db
      .delete(schema.magazineStaff)
      .where(
        inArray(schema.magazineStaff.userId, [
          fx.editorId,
          fx.memberId,
          fx.outsiderId,
          fx.contributorId,
          fx.staffEditorId,
        ]),
      );
    if (fx.communityIds.length > 0) {
      const { docs: mags } = await payload.find({
        collection: "magazines",
        where: { communityId: { in: fx.communityIds } },
        depth: 0,
        pagination: false,
      });
      const magazineIds = mags.map((mag) => mag.id);
      if (magazineIds.length > 0) {
        await db
          .delete(schema.magazineReads)
          .where(inArray(schema.magazineReads.magazineId, magazineIds));
        await db
          .delete(schema.magazineSubscriptions)
          .where(inArray(schema.magazineSubscriptions.magazineId, magazineIds));
        // Deleting the issues clears their articles' placement (the
        // foreign key is ON DELETE set null).
        await payload.delete({
          collection: "magazine-issues",
          where: { magazine: { in: magazineIds } },
        });
      }
      if (fx.articleIds.length > 0) {
        await payload.delete({
          collection: "articles",
          where: { id: { in: fx.articleIds } },
        });
      }
      if (magazineIds.length > 0) {
        await payload.delete({
          collection: "magazines",
          where: { id: { in: magazineIds } },
        });
      }
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
    const userIds = [
      fx.editorId,
      fx.memberId,
      fx.outsiderId,
      fx.contributorId,
      fx.staffEditorId,
    ];
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
    await db
      .delete(schema.communityMemberships)
      .where(inArray(schema.communityMemberships.userId, userIds));
    if (fx.agentIds.length) {
      await db
        .delete(schema.agentApiKeys)
        .where(inArray(schema.agentApiKeys.agentId, fx.agentIds));
      await db
        .delete(schema.agentProfiles)
        .where(inArray(schema.agentProfiles.id, fx.agentIds));
    }
    await db.delete(schema.user).where(inArray(schema.user.id, userIds));
  }, 60_000);

  // ── Fixtures ──────────────────────────────────────────────────────────

  type Community = { id: string; slug: string; isListedInDirectory: boolean };

  /** A community where the editor is owner and the member is a member. */
  async function community(
    label: string,
    opts: {
      listed?: boolean;
      joinPolicy?: "open" | "approval_required" | "invite_only";
    } = {},
  ): Promise<Community> {
    const { db, schema } = m;
    const [row] = await db
      .insert(schema.communities)
      .values({
        name: `Reading ${label} ${fx.sfx}`,
        slug: `rd-${label}-${fx.sfx}`,
        createdBy: fx.editorId,
        isListedInDirectory: opts.listed ?? true,
        joinPolicy: opts.joinPolicy ?? "open",
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

  async function magazineIn(
    c: Community,
    label: string,
    extra: Partial<MagazineService.MagazineSettingsInput> = {},
  ) {
    return m.magazines.saveMagazineSettings(
      m,
      c,
      {
        name: `Magazine ${label} ${fx.sfx}`,
        slug: `rd-${label}-${fx.sfx}`,
        topics: [],
        defaultVisibility: "public",
        ...extra,
      },
      fx.editorId,
      true,
    );
  }

  function actor(c: Community): IssueService.IssueActor {
    return { userId: fx.editorId, community: c };
  }

  function editorialItem(text: string): Registry.IssueItemInput {
    return { kind: "editorial", heading: text, body: richText(text) };
  }

  type Magazine = Awaited<ReturnType<typeof magazineIn>>;

  /** A draft issue with the given items, details and visibility. */
  async function draftIssue(
    c: Community,
    magazine: Magazine,
    title: string,
    opts: {
      visibility?: IssueVisibility;
      coverImageUrl?: string;
      items?: Registry.IssueItemInput[];
    } = {},
  ): Promise<MagazineIssue> {
    let issue = await m.issues.createIssue(m, magazine, { title }, actor(c));
    if (opts.visibility || opts.coverImageUrl) {
      issue = await m.issues.updateIssueDetails(
        m,
        issue,
        {
          ...(opts.visibility ? { visibility: opts.visibility } : {}),
          ...(opts.coverImageUrl ? { coverImageUrl: opts.coverImageUrl } : {}),
        },
        issue.updatedAt,
        actor(c),
        true,
      );
    }
    return (
      await m.issues.setIssueItems(
        m,
        issue,
        opts.items ?? [editorialItem(`${title} note`)],
        issue.updatedAt,
        actor(c),
      )
    ).issue;
  }

  async function publishedIssue(
    c: Community,
    magazine: Magazine,
    title: string,
    opts: Parameters<typeof draftIssue>[3] = {},
  ): Promise<MagazineIssue> {
    const draft = await draftIssue(c, magazine, title, opts);
    return m.issues.publishIssue(m, draft, draft.updatedAt, actor(c));
  }

  async function approvedArticle(
    label: string,
    magazineId: number,
    content = richText(`${label} text`),
  ): Promise<{ id: number; slug: string }> {
    const slug = `rd-${label}-${fx.sfx}`;
    const doc = await m.payload.create({
      collection: "articles",
      data: {
        title: `${label} title`,
        slug,
        content,
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
    return { id: doc.id, slug };
  }

  return {
    get m() {
      return m;
    },
    get fx() {
      return fx;
    },
    community,
    magazineIn,
    actor,
    editorialItem,
    draftIssue,
    publishedIssue,
    approvedArticle,
    richText,
  };
}
