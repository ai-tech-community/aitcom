import { z } from "zod";
import { and, asc, eq, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import {
  createTRPCRouter,
  publicProcedure,
  communityProcedure,
} from "@/server/api/trpc";
import { communities, spaces } from "@/server/db/schema";

/** Enabled spaces for the public nav, position-ordered. */
export const spacesRouter = createTRPCRouter({
  list: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const community = await ctx.db.query.communities.findFirst({
        where: and(
          eq(communities.slug, input.slug),
          isNull(communities.deletedAt),
        ),
      });
      if (!community) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.db
        .select({
          id: spaces.id,
          kind: spaces.kind,
          builtinSurface: spaces.builtinSurface,
          name: spaces.name,
          slug: spaces.slug,
          position: spaces.position,
        })
        .from(spaces)
        .where(
          and(eq(spaces.communityId, community.id), isNull(spaces.archivedAt)),
        )
        .orderBy(asc(spaces.position));
    }),

  /** All spaces incl. disabled, for the admin Compose page. */
  listForAdmin: communityProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx }) => {
      if (ctx.communityRole !== "owner" && ctx.communityRole !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const rows = await ctx.db
        .select({
          id: spaces.id,
          kind: spaces.kind,
          builtinSurface: spaces.builtinSurface,
          name: spaces.name,
          slug: spaces.slug,
          position: spaces.position,
          archivedAt: spaces.archivedAt,
        })
        .from(spaces)
        .where(eq(spaces.communityId, ctx.community.id))
        .orderBy(asc(spaces.position));
      return rows.map((r) => ({ ...r, enabled: r.archivedAt === null }));
    }),

  /** Persist a new ordering: ids in display order → position = index. */
  reorder: communityProcedure
    .input(z.object({ slug: z.string(), orderedIds: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.communityRole !== "owner" && ctx.communityRole !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      await ctx.db.transaction(async (tx) => {
        await Promise.all(
          input.orderedIds.map((id, position) =>
            tx
              .update(spaces)
              .set({ position })
              .where(
                and(
                  eq(spaces.id, id),
                  eq(spaces.communityId, ctx.community.id),
                ),
              ),
          ),
        );
      });
      return { success: true };
    }),

  /** Enable/disable a space (disable = archive; builtins only in Plan 1). */
  setEnabled: communityProcedure
    .input(
      z.object({
        slug: z.string(),
        spaceId: z.string(),
        enabled: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.communityRole !== "owner" && ctx.communityRole !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const [updated] = await ctx.db
        .update(spaces)
        .set({ archivedAt: input.enabled ? null : new Date() })
        .where(
          and(
            eq(spaces.id, input.spaceId),
            eq(spaces.communityId, ctx.community.id),
          ),
        )
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
      return updated;
    }),

  /** Set or clear the display-name override (null/empty resets to default). */
  rename: communityProcedure
    .input(
      z.object({
        slug: z.string(),
        spaceId: z.string(),
        name: z.string().max(60).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.communityRole !== "owner" && ctx.communityRole !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const trimmed = input.name?.trim();
      const [updated] = await ctx.db
        .update(spaces)
        .set({ name: trimmed && trimmed.length > 0 ? trimmed : null })
        .where(
          and(
            eq(spaces.id, input.spaceId),
            eq(spaces.communityId, ctx.community.id),
          ),
        )
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
      return updated;
    }),
});
