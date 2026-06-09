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

export const linksRouter = createTRPCRouter({
  list: publicProcedure
    .input(z.object({ communitySlug: z.string() }))
    .query(async ({ ctx, input }) => {
      const community = await ctx.db.query.communities.findFirst({
        where: and(
          eq(communities.slug, input.communitySlug),
          isNull(communities.deletedAt),
        ),
        columns: { id: true },
      });
      if (!community) return [];
      const payload = await getPayloadClient();
      const { docs } = await payload.find({
        collection: "community-links",
        where: { communityId: { equals: community.id } },
        sort: "sortOrder",
        limit: 50,
        depth: 0,
      });
      return docs;
    }),

  setAll: protectedProcedure
    .input(
      z.object({
        communitySlug: z.string(),
        links: z
          .array(
            z.object({
              label: z.string().min(1).max(60),
              url: z
                .string()
                .min(1)
                .max(500)
                .refine((u) => /^https?:\/\//i.test(u) || u.startsWith("/"), {
                  message: "URL must start with http(s):// or /",
                }),
              emoji: z.string().max(8).optional(),
            }),
          )
          .max(20),
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
      if (!community) throw new TRPCError({ code: "NOT_FOUND" });
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
      const { docs: existing } = await payload.find({
        collection: "community-links",
        where: { communityId: { equals: community.id } },
        limit: 100,
        depth: 0,
      });
      // Non-atomic replace (delete-all then recreate). Acceptable for an
      // admin-only, ≤20-item list edited infrequently; Payload has no
      // multi-doc transaction here. A mid-loop failure can leave a partial
      // set — the admin simply re-saves.
      for (const doc of existing) {
        await payload.delete({ collection: "community-links", id: doc.id });
      }
      let i = 0;
      for (const link of input.links) {
        await payload.create({
          collection: "community-links",
          data: {
            label: link.label,
            url: link.url,
            emoji: link.emoji ?? undefined,
            communityId: community.id,
            sortOrder: i++,
          },
        });
      }
      return { ok: true, count: input.links.length };
    }),
});
