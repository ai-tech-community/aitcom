import { z } from "zod";
import { eq, and, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
  communities,
  communityMemberships,
  communityLumaIntegrations,
} from "@/server/db/schema";
import { encryptApiKey, decryptApiKey } from "@/server/luma/crypto";
import { validateApiKey, getCalendars } from "@/server/luma/client";
import { invalidateCache } from "@/server/luma/cache";
import type { db as DbType } from "@/server/db";

async function requireCommunityAdmin(
  db: typeof DbType,
  userId: string,
  communitySlug: string,
) {
  const community = await db.query.communities.findFirst({
    where: and(
      eq(communities.slug, communitySlug),
      isNull(communities.deletedAt),
    ),
  });
  if (!community) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Community not found" });
  }

  const membership = await db.query.communityMemberships.findFirst({
    where: and(
      eq(communityMemberships.communityId, community.id),
      eq(communityMemberships.userId, userId),
    ),
  });
  if (
    membership?.status !== "active" ||
    (membership.role !== "owner" && membership.role !== "admin")
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only community admins can manage integrations",
    });
  }

  return community;
}

export const lumaRouter = createTRPCRouter({
  connect: protectedProcedure
    .input(
      z.object({
        communitySlug: z.string(),
        apiKey: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const community = await requireCommunityAdmin(
        ctx.db,
        ctx.session.user.id,
        input.communitySlug,
      );

      const result = await validateApiKey(input.apiKey);
      if (!result.valid) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid Luma API key. Make sure you have a Luma Plus subscription.",
        });
      }

      const encrypted = encryptApiKey(input.apiKey);

      const [existing] = await ctx.db
        .select({ id: communityLumaIntegrations.id })
        .from(communityLumaIntegrations)
        .where(eq(communityLumaIntegrations.communityId, community.id))
        .limit(1);

      if (existing) {
        await ctx.db
          .update(communityLumaIntegrations)
          .set({
            apiKeyEncrypted: encrypted,
            calendarApiId: "",
            isEnabled: false,
          })
          .where(eq(communityLumaIntegrations.id, existing.id));
      } else {
        await ctx.db.insert(communityLumaIntegrations).values({
          communityId: community.id,
          apiKeyEncrypted: encrypted,
          calendarApiId: "",
          isEnabled: false,
        });
      }

      const calendars = await getCalendars(input.apiKey);

      return {
        lumaUser: result.user.name,
        calendars,
      };
    }),

  selectCalendar: protectedProcedure
    .input(
      z.object({
        communitySlug: z.string(),
        calendarApiId: z.string().min(1),
        calendarName: z.string(),
        tagFilters: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const community = await requireCommunityAdmin(
        ctx.db,
        ctx.session.user.id,
        input.communitySlug,
      );

      await ctx.db
        .update(communityLumaIntegrations)
        .set({
          calendarApiId: input.calendarApiId,
          calendarName: input.calendarName,
          tagFilters: input.tagFilters ?? null,
          isEnabled: true,
        })
        .where(eq(communityLumaIntegrations.communityId, community.id));

      invalidateCache(`luma-events:${community.id}`);

      return { success: true };
    }),

  getConfig: protectedProcedure
    .input(z.object({ communitySlug: z.string() }))
    .query(async ({ ctx, input }) => {
      const community = await requireCommunityAdmin(
        ctx.db,
        ctx.session.user.id,
        input.communitySlug,
      );

      const [integration] = await ctx.db
        .select({
          calendarApiId: communityLumaIntegrations.calendarApiId,
          calendarName: communityLumaIntegrations.calendarName,
          tagFilters: communityLumaIntegrations.tagFilters,
          isEnabled: communityLumaIntegrations.isEnabled,
          lastSyncCheck: communityLumaIntegrations.lastSyncCheck,
          createdAt: communityLumaIntegrations.createdAt,
        })
        .from(communityLumaIntegrations)
        .where(eq(communityLumaIntegrations.communityId, community.id))
        .limit(1);

      return integration ?? null;
    }),

  updateConfig: protectedProcedure
    .input(
      z.object({
        communitySlug: z.string(),
        tagFilters: z.array(z.string()).optional(),
        isEnabled: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const community = await requireCommunityAdmin(
        ctx.db,
        ctx.session.user.id,
        input.communitySlug,
      );

      const updates: Record<string, unknown> = {};
      if (input.tagFilters !== undefined) updates.tagFilters = input.tagFilters;
      if (input.isEnabled !== undefined) updates.isEnabled = input.isEnabled;

      await ctx.db
        .update(communityLumaIntegrations)
        .set(updates)
        .where(eq(communityLumaIntegrations.communityId, community.id));

      invalidateCache(`luma-events:${community.id}`);

      return { success: true };
    }),

  disconnect: protectedProcedure
    .input(z.object({ communitySlug: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const community = await requireCommunityAdmin(
        ctx.db,
        ctx.session.user.id,
        input.communitySlug,
      );

      await ctx.db
        .delete(communityLumaIntegrations)
        .where(eq(communityLumaIntegrations.communityId, community.id));

      invalidateCache(`luma-events:${community.id}`);

      return { success: true };
    }),

  testConnection: protectedProcedure
    .input(z.object({ communitySlug: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const community = await requireCommunityAdmin(
        ctx.db,
        ctx.session.user.id,
        input.communitySlug,
      );

      const [integration] = await ctx.db
        .select({
          apiKeyEncrypted: communityLumaIntegrations.apiKeyEncrypted,
        })
        .from(communityLumaIntegrations)
        .where(eq(communityLumaIntegrations.communityId, community.id))
        .limit(1);

      if (!integration) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No Luma integration configured",
        });
      }

      const apiKey = decryptApiKey(integration.apiKeyEncrypted);
      const result = await validateApiKey(apiKey);

      if (!result.valid) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Luma API key is no longer valid. Please reconnect.",
        });
      }

      invalidateCache(`luma-events:${community.id}`);

      return { ok: true, lumaUser: result.user.name };
    }),
});
