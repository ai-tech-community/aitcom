import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNull } from "drizzle-orm";

import { awardXp, XP_AMOUNTS } from "@/lib/gamification";
import {
  buildRoleHelpPost,
  matchCommunityClassroom,
  roleHelpThreadPath,
  type RoleHelpError,
  type RoleHelpRequest,
} from "@/lib/investigations/startup-role-help";
import { logActivity } from "@/server/agent/activity";
import { plainTextToLexical } from "@/server/challenge-engine/lexical";
import { syncForumThreadCounters } from "@/server/communities/forum-thread-counters";
import { db } from "@/server/db";
import {
  communities,
  communityMemberships,
  startupRoleHelp,
  startupRoles,
  startups,
} from "@/server/db/schema";
import { getPayloadClient } from "@/server/payload";
import { findStartupRoleApplication } from "@/server/startups/member-jobs";
import { toPublicRole } from "@/server/startups/queries";

type HelpLocale = "en" | "nl";

async function assertCommunityRulesAccepted(
  userId: string,
  communityId: string,
) {
  const payload = await getPayloadClient();
  const { docs } = await payload.find({
    collection: "community-rules",
    where: { communityId: { equals: communityId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  if (docs.length === 0) return;

  const rules = docs[0]!;
  const { docs: acceptanceDocs } = await payload.find({
    collection: "rules-acceptance",
    where: {
      and: [
        { userId: { equals: userId } },
        { rulesVersion: { equals: rules.version } },
        { communityId: { equals: communityId } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  if (acceptanceDocs.length === 0) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "RULES_NOT_ACCEPTED" satisfies RoleHelpError,
    });
  }
}

function threadSlug(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${base || "help"}-${Date.now()}`;
}

/**
 * Throws when the read fails: the Job tracker shows an error with retry
 * instead of an empty board (DESIGN.md No-Silent-Failure Rule).
 */
export async function listMyRoleHelp(
  userId: string,
): Promise<RoleHelpRequest[]> {
  const rows = await db
    .select({
      roleId: startupRoleHelp.roleId,
      note: startupRoleHelp.note,
      classroomTitle: startupRoleHelp.classroomTitle,
      threadSlug: startupRoleHelp.threadSlug,
      communitySlug: communities.slug,
      communityName: communities.name,
    })
    .from(startupRoleHelp)
    .innerJoin(communities, eq(startupRoleHelp.communityId, communities.id))
    .where(
      and(eq(startupRoleHelp.userId, userId), isNull(communities.deletedAt)),
    )
    .orderBy(desc(startupRoleHelp.createdAt));
  return rows.map((row) => ({
    roleId: row.roleId,
    communitySlug: row.communitySlug,
    communityName: row.communityName,
    note: row.note,
    classroom: row.classroomTitle,
    path: roleHelpThreadPath(row.communitySlug, row.threadSlug),
  }));
}

export async function askMyTrackedRoleHelp(input: {
  userId: string;
  userName: string;
  roleId: string;
  communitySlug: string;
  note: string;
  classroom: string;
  locale: HelpLocale;
}): Promise<RoleHelpRequest> {
  const note = input.note.trim();
  if (!note) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "NOTE_REQUIRED" satisfies RoleHelpError,
    });
  }

  const tracked = await findStartupRoleApplication(input.userId, input.roleId);
  if (!tracked) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "ROLE_NOT_TRACKED" satisfies RoleHelpError,
    });
  }

  const [roleRow] = await db
    .select({
      role: startupRoles,
      startupSlug: startups.slug,
      startupName: startups.name,
      startupLogoUrl: startups.logoUrl,
    })
    .from(startupRoles)
    .innerJoin(startups, eq(startupRoles.startupId, startups.id))
    .where(
      and(eq(startupRoles.id, input.roleId), eq(startups.status, "approved")),
    )
    .limit(1);
  const role = roleRow
    ? toPublicRole(roleRow.role, {
        slug: roleRow.startupSlug,
        name: roleRow.startupName,
        logoUrl: roleRow.startupLogoUrl,
      })
    : null;
  if (!role) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "ROLE_NOT_FOUND" satisfies RoleHelpError,
    });
  }

  const community = await db.query.communities.findFirst({
    where: and(
      eq(communities.slug, input.communitySlug),
      isNull(communities.deletedAt),
    ),
    columns: { id: true, slug: true, name: true },
  });
  if (!community) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "COMMUNITY_NOT_FOUND" satisfies RoleHelpError,
    });
  }

  const membership = await db.query.communityMemberships.findFirst({
    where: and(
      eq(communityMemberships.communityId, community.id),
      eq(communityMemberships.userId, input.userId),
      eq(communityMemberships.status, "active"),
    ),
    columns: { userId: true },
  });
  if (!membership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "NOT_A_MEMBER" satisfies RoleHelpError,
    });
  }

  await assertCommunityRulesAccepted(input.userId, community.id);

  const payload = await getPayloadClient();
  let classroomTitle = "";
  let classroomSlug = "";
  let classroomPath: string | null = null;
  const classroomName = input.classroom.trim();
  if (classroomName) {
    const { docs } = await payload.find({
      collection: "courses",
      where: {
        and: [
          { communityId: { equals: community.id } },
          { status: { equals: "published" } },
        ],
      },
      limit: 200,
      depth: 0,
      overrideAccess: true,
    });
    const courses = docs.flatMap((doc) => {
      if (typeof doc.title !== "string" || typeof doc.slug !== "string") {
        return [];
      }
      return [{ title: doc.title, slug: doc.slug }];
    });
    const match = matchCommunityClassroom(courses, classroomName);
    if (!match) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "CLASSROOM_NOT_FOUND" satisfies RoleHelpError,
      });
    }
    classroomTitle = match.title;
    classroomSlug = match.slug;
    classroomPath = `/${input.locale}/communities/${community.slug}/classroom/${match.slug}`;
  }

  const post = buildRoleHelpPost({
    locale: input.locale,
    roleTitle: role.title,
    startupName: role.startupName,
    rolePath: `/${input.locale}/jobs/${role.slug}`,
    sourceUrl: role.sourceUrl,
    note,
    classroomTitle: classroomTitle || null,
    classroomPath,
  });

  let existing: { threadId: number } | undefined;
  try {
    const [row] = await db
      .select({
        threadId: startupRoleHelp.threadId,
      })
      .from(startupRoleHelp)
      .where(
        and(
          eq(startupRoleHelp.userId, input.userId),
          eq(startupRoleHelp.roleId, input.roleId),
          eq(startupRoleHelp.communityId, community.id),
        ),
      )
      .limit(1);
    existing = row;
  } catch {
    existing = undefined;
  }

  let threadId = existing?.threadId ?? null;
  let slug = "";
  if (threadId !== null) {
    try {
      const thread = await payload.findByID({
        collection: "forum-threads",
        id: threadId,
        depth: 0,
        overrideAccess: true,
      });
      slug = typeof thread.slug === "string" ? thread.slug : "";
      if (!slug || thread.isDeleted) threadId = null;
    } catch {
      threadId = null;
    }
  }

  if (threadId !== null && slug) {
    await payload.create({
      collection: "forum-replies",
      overrideAccess: true,
      data: {
        thread: threadId,
        content: plainTextToLexical(post.content),
        authorId: input.userId,
        authorName: input.userName,
        authorRole: "member",
        communityId: community.id,
      },
    });
    await syncForumThreadCounters(payload, threadId, { touch: true });
    await awardXp(db, input.userId, XP_AMOUNTS.FORUM_REPLY_CREATE);
    await logActivity(db, {
      actorId: input.userId,
      actorType: "member",
      action: "thread.reply",
      targetType: "forum-threads",
      targetId: String(threadId),
      communityId: community.id,
      metadata: { threadSlug: slug, title: post.title },
    });
  } else {
    slug = threadSlug(post.title);
    const thread = await payload.create({
      collection: "forum-threads",
      data: {
        title: post.title,
        slug,
        content: plainTextToLexical(post.content),
        category: "question",
        authorId: input.userId,
        authorName: input.userName,
        authorRole: "member",
        isPinned: false,
        isLocked: false,
        replyCount: 0,
        lastActivityAt: new Date().toISOString(),
        communityId: community.id,
      },
    });
    threadId = thread.id;
    slug = typeof thread.slug === "string" ? thread.slug : slug;
    await awardXp(db, input.userId, XP_AMOUNTS.FORUM_THREAD_CREATE);
    await logActivity(db, {
      actorId: input.userId,
      actorType: "member",
      action: "thread.create",
      targetType: "forum-threads",
      targetId: String(thread.id),
      communityId: community.id,
      metadata: { title: post.title, category: "question", slug },
    });
  }

  const now = new Date();
  try {
    await db
      .insert(startupRoleHelp)
      .values({
        userId: input.userId,
        roleId: input.roleId,
        communityId: community.id,
        note,
        classroomTitle,
        classroomSlug,
        threadId,
        threadSlug: slug,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          startupRoleHelp.userId,
          startupRoleHelp.roleId,
          startupRoleHelp.communityId,
        ],
        set: {
          note,
          classroomTitle,
          classroomSlug,
          threadId,
          threadSlug: slug,
          updatedAt: now,
        },
      });
  } catch {
    // The forum thread is the post. A missing link row must not hide it.
  }

  return {
    roleId: input.roleId,
    communitySlug: community.slug,
    communityName: community.name,
    note,
    classroom: classroomTitle,
    path: roleHelpThreadPath(community.slug, slug),
  };
}
