import { z } from "zod";
import { eq, and, desc, gte, sql, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { Where } from "payload";

import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
} from "@/server/api/trpc";
import { getPayloadClient } from "@/server/payload";
import { logActivity } from "@/server/agent/activity";
import { awardXp, awardBadge, XP_AMOUNTS } from "@/lib/gamification";
import {
  launchpadUpdates,
  launchpadComments,
  launchpadVotes,
  notifications,
  user,
  memberProfiles,
} from "@/server/db/schema";

async function requireRulesAcceptance(userId: string, communityId?: string) {
  if (!communityId) return;

  const payload = await getPayloadClient();
  const { docs } = await payload.find({
    collection: "community-rules",
    where: { communityId: { equals: communityId } },
    limit: 1,
    depth: 0,
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
  });

  if (acceptanceDocs.length === 0) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "RULES_NOT_ACCEPTED",
    });
  }
}

export const launchpadRouter = createTRPCRouter({
  list: publicProcedure
    .input(
      z.object({
        sort: z
          .enum(["newest", "mostVoted", "recentlyUpdated", "trending"])
          .default("newest"),
        stage: z
          .enum(["all", "idea", "prototype", "mvp", "launched"])
          .default("all"),
        tag: z.string().max(50).optional(),
        search: z.string().max(200).optional(),
        limit: z.number().min(1).max(50).default(20),
        page: z.number().min(1).default(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      const payload = await getPayloadClient();

      const conditions: Where[] = [
        { status: { equals: "published" } },
      ];

      if (input.stage !== "all") {
        conditions.push({ stage: { equals: input.stage } });
      }

      if (input.tag) {
        conditions.push({ "tags.tag": { equals: input.tag } });
      }

      if (input.search) {
        conditions.push({
          or: [
            { title: { like: input.search } },
            { "tags.tag": { like: input.search } },
          ],
        });
      }

      const sortMap: Record<string, string> = {
        newest: "-createdAt",
        mostVoted: "-voteCount",
        recentlyUpdated: "-updatedAt",
        trending: "-voteCount",
      };

      const result = await payload.find({
        collection: "launchpad-projects",
        where: { and: conditions },
        sort: sortMap[input.sort] ?? "-createdAt",
        limit: input.limit,
        page: input.page,
        depth: 0,
      });

      let projects = result.docs;

      if (input.sort === "trending" && projects.length > 0) {
        const projectIds = projects.map((p) => p.id);
        const sevenDaysAgo = new Date(
          Date.now() - 7 * 24 * 60 * 60 * 1000,
        );
        const recentVotes = await ctx.db
          .select({
            projectId: launchpadVotes.projectId,
            count: sql<number>`count(*)::int`,
          })
          .from(launchpadVotes)
          .where(
            and(
              inArray(launchpadVotes.projectId, projectIds),
              gte(launchpadVotes.createdAt, sevenDaysAgo),
            ),
          )
          .groupBy(launchpadVotes.projectId);

        const voteCounts = new Map(
          recentVotes.map((v) => [v.projectId, v.count]),
        );

        projects = [...projects].sort(
          (a, b) =>
            (voteCounts.get(b.id) ?? 0) - (voteCounts.get(a.id) ?? 0),
        );
      }

      const userId = ctx.session?.user?.id;
      let votedProjectIds = new Set<number>();

      if (userId) {
        const myVotes = await ctx.db
          .select({ projectId: launchpadVotes.projectId })
          .from(launchpadVotes)
          .where(eq(launchpadVotes.voterId, userId));
        votedProjectIds = new Set(myVotes.map((v) => v.projectId));
      }

      return {
        projects: projects.map((p) => ({
          ...p,
          hasVoted: votedProjectIds.has(p.id),
        })),
        totalPages: result.totalPages,
        totalDocs: result.totalDocs,
        page: result.page,
        hasNextPage: result.hasNextPage,
      };
    }),

  getBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const payload = await getPayloadClient();

      const { docs } = await payload.find({
        collection: "launchpad-projects",
        where: { slug: { equals: input.slug } },
        limit: 1,
        depth: 1,
      });

      const project = docs[0];
      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }

      const updates = await ctx.db
        .select({
          id: launchpadUpdates.id,
          title: launchpadUpdates.title,
          content: launchpadUpdates.content,
          createdAt: launchpadUpdates.createdAt,
        })
        .from(launchpadUpdates)
        .where(eq(launchpadUpdates.projectId, project.id))
        .orderBy(desc(launchpadUpdates.createdAt));

      const comments = await ctx.db
        .select({
          id: launchpadComments.id,
          content: launchpadComments.content,
          parentId: launchpadComments.parentId,
          createdAt: launchpadComments.createdAt,
          authorId: launchpadComments.authorId,
          authorName: user.name,
          authorImage: user.image,
        })
        .from(launchpadComments)
        .innerJoin(user, eq(launchpadComments.authorId, user.id))
        .where(eq(launchpadComments.projectId, project.id))
        .orderBy(launchpadComments.createdAt);

      const userId = ctx.session?.user?.id;
      let hasVoted = false;

      if (userId) {
        const [vote] = await ctx.db
          .select({ id: launchpadVotes.id })
          .from(launchpadVotes)
          .where(
            and(
              eq(launchpadVotes.projectId, project.id),
              eq(launchpadVotes.voterId, userId),
            ),
          )
          .limit(1);
        hasVoted = !!vote;
      }

      const [authorProfile] = await ctx.db
        .select({
          userId: memberProfiles.userId,
          displayName: memberProfiles.displayName,
          xp: memberProfiles.xp,
          level: memberProfiles.level,
        })
        .from(memberProfiles)
        .where(eq(memberProfiles.userId, project.authorId))
        .limit(1);

      return {
        ...project,
        updates,
        comments,
        hasVoted,
        authorProfile: authorProfile ?? null,
      };
    }),

  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(3).max(200),
        pitch: z.any(),
        stage: z.enum(["idea", "prototype", "mvp", "launched"]),
        tags: z.array(z.string().max(50)).max(10).default([]),
        links: z
          .array(
            z.object({
              label: z.string().min(1).max(100),
              url: z.string().url().max(500),
            }),
          )
          .max(10)
          .default([]),
        coverImage: z.number().optional(),
        status: z.enum(["draft", "published"]).default("draft"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireRulesAcceptance(ctx.session.user.id);
      const payload = await getPayloadClient();
      const userName = ctx.session.user.name ?? "member";

      const baseSlug = input.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      let slug = baseSlug;
      let suffix = 0;
      while (true) {
        const { docs } = await payload.find({
          collection: "launchpad-projects",
          where: { slug: { equals: slug } },
          limit: 1,
          depth: 0,
        });
        if (docs.length === 0) break;
        suffix++;
        slug = `${baseSlug}-${suffix}`;
      }

      const project = await payload.create({
        collection: "launchpad-projects",
        data: {
          title: input.title,
          slug,
          pitch: input.pitch,
          stage: input.stage,
          tags: input.tags.map((tag) => ({ tag })),
          links: input.links,
          coverImage: input.coverImage ?? undefined,
          authorId: ctx.session.user.id,
          authorName: userName,
          status: input.status,
          voteCount: 0,
          commentCount: 0,
          updateCount: 0,
        },
      });

      if (input.status === "published") {
        await logActivity(ctx.db, {
          actorId: ctx.session.user.id,
          actorType: "member",
          action: "launchpad.project.published",
          targetType: "launchpad-projects",
          targetId: String(project.id),
          metadata: { title: input.title, stage: input.stage },
        });

        await awardXp(
          ctx.db,
          ctx.session.user.id,
          XP_AMOUNTS.LAUNCHPAD_PROJECT_CREATE,
        );
        await awardBadge(ctx.db, ctx.session.user.id, "first_launch");
      }

      return { id: project.id, slug };
    }),

  update: protectedProcedure
    .input(
      z.object({
        projectId: z.number(),
        title: z.string().min(3).max(200).optional(),
        pitch: z.any().optional(),
        stage: z.enum(["idea", "prototype", "mvp", "launched"]).optional(),
        tags: z.array(z.string().max(50)).max(10).optional(),
        links: z
          .array(
            z.object({
              label: z.string().min(1).max(100),
              url: z.string().url().max(500),
            }),
          )
          .max(10)
          .optional(),
        coverImage: z.number().nullable().optional(),
        status: z.enum(["draft", "published", "archived"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();

      const project = await payload.findByID({
        collection: "launchpad-projects",
        id: input.projectId,
        depth: 0,
      });

      if (project.authorId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not the project author" });
      }

      const data: Record<string, unknown> = {};
      if (input.title !== undefined) data.title = input.title;
      if (input.pitch !== undefined) data.pitch = input.pitch;
      if (input.stage !== undefined) data.stage = input.stage;
      if (input.tags !== undefined) data.tags = input.tags.map((tag) => ({ tag }));
      if (input.links !== undefined) data.links = input.links;
      if (input.coverImage !== undefined)
        data.coverImage = input.coverImage ?? undefined;
      if (input.status !== undefined) data.status = input.status;

      await payload.update({
        collection: "launchpad-projects",
        id: input.projectId,
        data,
      });

      return { success: true };
    }),

  archive: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();

      const project = await payload.findByID({
        collection: "launchpad-projects",
        id: input.projectId,
        depth: 0,
      });

      if (project.authorId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not the project author" });
      }

      await payload.update({
        collection: "launchpad-projects",
        id: input.projectId,
        data: { status: "archived" },
      });

      return { success: true };
    }),

  postUpdate: protectedProcedure
    .input(
      z.object({
        projectId: z.number(),
        title: z.string().min(1).max(500),
        content: z.string().min(1).max(10000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireRulesAcceptance(ctx.session.user.id);
      const payload = await getPayloadClient();

      const project = await payload.findByID({
        collection: "launchpad-projects",
        id: input.projectId,
        depth: 0,
      });

      if (project.authorId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not the project author" });
      }

      const [update] = await ctx.db
        .insert(launchpadUpdates)
        .values({
          projectId: input.projectId,
          authorId: ctx.session.user.id,
          title: input.title,
          content: input.content,
        })
        .returning();

      await payload.update({
        collection: "launchpad-projects",
        id: input.projectId,
        data: { updateCount: (project.updateCount ?? 0) + 1 },
      });

      await logActivity(ctx.db, {
        actorId: ctx.session.user.id,
        actorType: "member",
        action: "launchpad.update.posted",
        targetType: "launchpad-projects",
        targetId: String(input.projectId),
        metadata: { title: input.title, projectTitle: project.title },
      });

      await awardXp(
        ctx.db,
        ctx.session.user.id,
        XP_AMOUNTS.LAUNCHPAD_UPDATE_POST,
      );

      return update;
    }),

  vote: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireRulesAcceptance(ctx.session.user.id);
      const payload = await getPayloadClient();
      const userId = ctx.session.user.id;

      const project = await payload.findByID({
        collection: "launchpad-projects",
        id: input.projectId,
        depth: 0,
      });

      const [existingVote] = await ctx.db
        .select({ id: launchpadVotes.id })
        .from(launchpadVotes)
        .where(
          and(
            eq(launchpadVotes.projectId, input.projectId),
            eq(launchpadVotes.voterId, userId),
          ),
        )
        .limit(1);

      if (existingVote) {
        await ctx.db
          .delete(launchpadVotes)
          .where(eq(launchpadVotes.id, existingVote.id));

        await payload.update({
          collection: "launchpad-projects",
          id: input.projectId,
          data: { voteCount: Math.max(0, (project.voteCount ?? 0) - 1) },
        });

        return { voted: false };
      } else {
        await ctx.db.insert(launchpadVotes).values({
          projectId: input.projectId,
          voterId: userId,
        });

        await payload.update({
          collection: "launchpad-projects",
          id: input.projectId,
          data: { voteCount: (project.voteCount ?? 0) + 1 },
        });

        await logActivity(ctx.db, {
          actorId: userId,
          actorType: "member",
          action: "launchpad.project.voted",
          targetType: "launchpad-projects",
          targetId: String(input.projectId),
          metadata: { title: project.title },
        });

        if (project.authorId !== userId) {
          await awardXp(
            ctx.db,
            project.authorId,
            XP_AMOUNTS.LAUNCHPAD_RECEIVE_VOTE,
          );

          await ctx.db.insert(notifications).values({
            userId: project.authorId,
            type: "launchpad_vote",
            title: "New vote on your project",
            content: `Someone voted for "${project.title}"`,
            metadata: {
              projectId: input.projectId,
              projectSlug: project.slug,
            },
          });
        }

        return { voted: true };
      }
    }),

  addComment: protectedProcedure
    .input(
      z.object({
        projectId: z.number(),
        content: z.string().min(1).max(5000),
        parentId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireRulesAcceptance(ctx.session.user.id);
      const payload = await getPayloadClient();

      const project = await payload.findByID({
        collection: "launchpad-projects",
        id: input.projectId,
        depth: 0,
      });

      const [comment] = await ctx.db
        .insert(launchpadComments)
        .values({
          projectId: input.projectId,
          authorId: ctx.session.user.id,
          content: input.content,
          parentId: input.parentId ?? null,
        })
        .returning();

      await payload.update({
        collection: "launchpad-projects",
        id: input.projectId,
        data: { commentCount: (project.commentCount ?? 0) + 1 },
      });

      await logActivity(ctx.db, {
        actorId: ctx.session.user.id,
        actorType: "member",
        action: "launchpad.comment.created",
        targetType: "launchpad-projects",
        targetId: String(input.projectId),
        metadata: {
          projectTitle: project.title,
          isReply: !!input.parentId,
        },
      });

      await awardXp(
        ctx.db,
        ctx.session.user.id,
        XP_AMOUNTS.LAUNCHPAD_COMMENT_CREATE,
      );

      if (project.authorId !== ctx.session.user.id) {
        await awardXp(
          ctx.db,
          project.authorId,
          XP_AMOUNTS.LAUNCHPAD_RECEIVE_COMMENT,
        );

        await ctx.db.insert(notifications).values({
          userId: project.authorId,
          type: "launchpad_comment",
          title: input.parentId
            ? "New reply on your project"
            : "New comment on your project",
          content: `${ctx.session.user.name ?? "Someone"} commented on "${project.title}"`,
          metadata: {
            projectId: input.projectId,
            projectSlug: project.slug,
            commentId: comment!.id,
          },
        });
      }

      if (input.parentId) {
        const [parentComment] = await ctx.db
          .select({ authorId: launchpadComments.authorId })
          .from(launchpadComments)
          .where(eq(launchpadComments.id, input.parentId))
          .limit(1);

        if (
          parentComment &&
          parentComment.authorId !== ctx.session.user.id &&
          parentComment.authorId !== project.authorId
        ) {
          await ctx.db.insert(notifications).values({
            userId: parentComment.authorId,
            type: "launchpad_reply",
            title: "Someone replied to your comment",
            content: `${ctx.session.user.name ?? "Someone"} replied to your comment on "${project.title}"`,
            metadata: {
              projectId: input.projectId,
              projectSlug: project.slug,
              commentId: comment!.id,
            },
          });
        }
      }

      return comment;
    }),

  deleteComment: protectedProcedure
    .input(z.object({ commentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [comment] = await ctx.db
        .select()
        .from(launchpadComments)
        .where(eq(launchpadComments.id, input.commentId))
        .limit(1);

      if (!comment) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Comment not found" });
      }

      const isCommentAuthor = comment.authorId === ctx.session.user.id;
      const payload = await getPayloadClient();
      let isAdmin = false;
      try {
        const { docs } = await payload.find({
          collection: "users",
          where: { email: { equals: ctx.session.user.email } },
          limit: 1,
          depth: 0,
        });
        isAdmin = docs[0]?.role === "admin";
      } catch {
        // Not a Payload user — not admin
      }

      if (!isCommentAuthor && !isAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized" });
      }

      await ctx.db
        .delete(launchpadComments)
        .where(eq(launchpadComments.id, input.commentId));

      const project = await payload.findByID({
        collection: "launchpad-projects",
        id: comment.projectId,
        depth: 0,
      });
      await payload.update({
        collection: "launchpad-projects",
        id: comment.projectId,
        data: {
          commentCount: Math.max(0, (project.commentCount ?? 0) - 1),
        },
      });

      return { success: true };
    }),
});
