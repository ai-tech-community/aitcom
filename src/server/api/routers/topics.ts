import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
} from "@/server/api/trpc";
import { getPayloadClient } from "@/server/payload";
import { and, eq, isNull } from "drizzle-orm";
import { communities, communityMemberships } from "@/server/db/schema";
import { releaseDeletedTopic } from "@/server/communities/post-topics";
import { requireReadableCommunityBySlug } from "@/server/communities/content-access";
import { isActiveCommunityMember } from "@/server/communities/content-visibility-queries";
import { topicSlugify, isAtTopicCap } from "./topic-helpers";

type Payload = Awaited<ReturnType<typeof getPayloadClient>>;

/** Create the community's default 'general' topic when it is missing. */
async function ensureDefaultTopic(payload: Payload, communityId: string) {
  const { docs } = await payload.find({
    collection: "community-topics",
    where: {
      and: [
        { communityId: { equals: communityId } },
        { slug: { equals: "general" } },
      ],
    },
    limit: 1,
    depth: 0,
  });
  if (docs.length > 0) return;
  await payload.create({
    collection: "community-topics",
    data: {
      label: "General",
      slug: "general",
      communityId,
      sortOrder: 0,
      isDefault: true,
    },
  });
}

export const topicsRouter = createTRPCRouter({
  /**
   * A community's topics, for whoever may read its content (ADR-0050). The
   * first active member to ask creates the default 'general' topic; a
   * reader from outside never writes.
   */
  list: publicProcedure
    .input(z.object({ communitySlug: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session?.user?.id;
      const community = await requireReadableCommunityBySlug(
        ctx.db,
        input.communitySlug,
        userId,
      );

      const payload = await getPayloadClient();

      if (await isActiveCommunityMember(ctx.db, community.id, userId)) {
        await ensureDefaultTopic(payload, community.id);
      }

      const { docs } = await payload.find({
        collection: "community-topics",
        where: { communityId: { equals: community.id } },
        sort: "sortOrder",
        limit: 50,
        depth: 0,
      });

      return docs;
    }),

  /** ADMIN (owner|admin): create a topic. */
  create: protectedProcedure
    .input(
      z.object({
        communitySlug: z.string(),
        label: z.string().min(1).max(40),
        emoji: z.string().max(8).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const community = await ctx.db.query.communities.findFirst({
        where: and(
          eq(communities.slug, input.communitySlug),
          isNull(communities.deletedAt),
        ),
        columns: { id: true },
      });
      if (!community) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const membership = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, community.id),
          eq(communityMemberships.userId, ctx.session.user.id),
          eq(communityMemberships.status, "active"),
        ),
      });
      if (
        !membership ||
        (membership.role !== "owner" && membership.role !== "admin")
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const payload = await getPayloadClient();

      const { totalDocs } = await payload.find({
        collection: "community-topics",
        where: { communityId: { equals: community.id } },
        limit: 0,
        depth: 0,
      });

      if (isAtTopicCap(totalDocs)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "TOPIC_CAP_REACHED",
        });
      }

      const slug = topicSlugify(input.label) || `topic-${totalDocs + 1}`;

      if (slug === "general") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "TOPIC_SLUG_RESERVED",
        });
      }

      const { docs: clashing } = await payload.find({
        collection: "community-topics",
        where: {
          and: [
            { communityId: { equals: community.id } },
            { slug: { equals: slug } },
          ],
        },
        limit: 1,
        depth: 0,
      });
      if (clashing.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "TOPIC_SLUG_EXISTS",
        });
      }

      const topic = await payload.create({
        collection: "community-topics",
        data: {
          label: input.label,
          slug,
          emoji: input.emoji ?? undefined,
          communityId: community.id,
          sortOrder: totalDocs,
          isDefault: false,
        },
      });

      return topic;
    }),

  /** ADMIN: update label/emoji/sortOrder of a topic. */
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        label: z.string().min(1).max(40),
        emoji: z.string().max(8).optional(),
        sortOrder: z.number().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();

      const topic = await payload.findByID({
        collection: "community-topics",
        id: input.id,
        depth: 0,
      });

      const membership = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, topic.communityId),
          eq(communityMemberships.userId, ctx.session.user.id),
          eq(communityMemberships.status, "active"),
        ),
      });
      if (
        !membership ||
        (membership.role !== "owner" && membership.role !== "admin")
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const updated = await payload.update({
        collection: "community-topics",
        id: input.id,
        data: {
          label: input.label,
          emoji: input.emoji ?? undefined,
          ...(input.sortOrder !== undefined
            ? { sortOrder: input.sortOrder }
            : {}),
        },
      });

      return updated;
    }),

  /** ADMIN: delete a topic; refuse default, release its content first. */
  remove: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();

      const topic = await payload.findByID({
        collection: "community-topics",
        id: input.id,
        depth: 0,
      });

      const membership = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, topic.communityId),
          eq(communityMemberships.userId, ctx.session.user.id),
          eq(communityMemberships.status, "active"),
        ),
      });
      if (
        !membership ||
        (membership.role !== "owner" && membership.role !== "admin")
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      if (topic.isDefault) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "CANNOT_DELETE_DEFAULT",
        });
      }

      // Feed posts move to 'general'; gallery items lose their category.
      await releaseDeletedTopic(payload, topic);

      await payload.delete({
        collection: "community-topics",
        id: input.id,
      });

      return { ok: true };
    }),
});
