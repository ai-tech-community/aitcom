import { z } from "zod";
import { and, count, desc, eq, gt, ilike, inArray, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, communityProcedure } from "@/server/api/trpc";
import {
  connectionTypeInput,
  matchingProfileInput,
  emptyMatchingProfile,
  findCommunityMatches,
  matchingPairKey,
} from "@/lib/communities/matching";
import {
  connectionTypes,
  matchingParticipants,
  proposeCommunityIntroduction,
  validateMatchingAnswers,
} from "@/server/communities/matching";
import {
  communityConnectionTypes,
  communityMatchingProfiles,
  communityMatchDismissals,
  communityMemberships,
  introductions,
  memberProfiles,
  user,
} from "@/server/db/schema";

const slugInput = z.object({ slug: z.string() });
const memberProcedure = communityProcedure.use(({ ctx, next }) => {
  if (!ctx.communityRole) throw new TRPCError({ code: "FORBIDDEN" });
  return next({ ctx });
});
const ownerProcedure = memberProcedure.use(({ ctx, next }) => {
  if (ctx.communityRole !== "owner" && ctx.communityRole !== "admin")
    throw new TRPCError({ code: "FORBIDDEN" });
  return next({ ctx });
});

export const communityMatchingRouter = createTRPCRouter({
  setup: memberProcedure.input(slugInput).query(async ({ ctx }) => {
    const types = await connectionTypes(ctx.db, ctx.community.id);
    const [profile] = await ctx.db
      .select()
      .from(communityMatchingProfiles)
      .where(
        and(
          eq(communityMatchingProfiles.communityId, ctx.community.id),
          eq(communityMatchingProfiles.userId, ctx.session.user.id),
        ),
      );
    return {
      types,
      profile: profile ?? emptyMatchingProfile,
      canManage: ctx.communityRole === "owner" || ctx.communityRole === "admin",
    };
  }),

  saveProfile: memberProcedure
    .input(slugInput.extend({ profile: matchingProfileInput }))
    .mutation(async ({ ctx, input }) => {
      const types = await connectionTypes(ctx.db, ctx.community.id);
      const profile = input.profile;
      const answers = validateMatchingAnswers(profile, types);
      const values = { ...profile, answers, updatedAt: new Date() };
      await ctx.db
        .insert(communityMatchingProfiles)
        .values({
          ...values,
          communityId: ctx.community.id,
          userId: ctx.session.user.id,
        })
        .onConflictDoUpdate({
          target: [
            communityMatchingProfiles.communityId,
            communityMatchingProfiles.userId,
          ],
          set: values,
        });
      return { ok: true };
    }),

  saveType: ownerProcedure
    .input(slugInput.extend({ type: connectionTypeInput }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.transaction(async (tx) => {
        // Serialize the per-community cap across simultaneous creates.
        await tx
          .select({ id: communityMemberships.id })
          .from(communityMemberships)
          .where(
            and(
              eq(communityMemberships.communityId, ctx.community.id),
              eq(communityMemberships.role, "owner"),
            ),
          )
          .for("update");
        const types = await connectionTypes(tx, ctx.community.id);
        const { id, ...values } = input.type;
        if (id) {
          const existing = types.find((t) => t.id === id);
          if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
          if (existing.mode !== values.mode)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "MATCHING_MODE_IMMUTABLE",
            });
          await tx
            .update(communityConnectionTypes)
            .set(values)
            .where(
              and(
                eq(communityConnectionTypes.id, id),
                eq(communityConnectionTypes.communityId, ctx.community.id),
              ),
            );
          return { id };
        }
        if (types.filter((t) => t.active).length >= 20)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "MATCHING_TYPE_LIMIT",
          });
        const [created] = await tx
          .insert(communityConnectionTypes)
          .values({ ...values, communityId: ctx.community.id })
          .returning({ id: communityConnectionTypes.id });
        return created!;
      });
    }),

  archiveType: ownerProcedure
    .input(slugInput.extend({ id: z.string(), active: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.transaction(async (tx) => {
        await tx
          .select({ id: communityMemberships.id })
          .from(communityMemberships)
          .where(
            and(
              eq(communityMemberships.communityId, ctx.community.id),
              eq(communityMemberships.role, "owner"),
            ),
          )
          .for("update");
        const types = await connectionTypes(tx, ctx.community.id);
        const type = types.find((t) => t.id === input.id);
        if (!type) throw new TRPCError({ code: "NOT_FOUND" });
        if (
          input.active &&
          !type.active &&
          types.filter((t) => t.active).length >= 20
        )
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "MATCHING_TYPE_LIMIT",
          });
        await tx
          .update(communityConnectionTypes)
          .set({ active: input.active })
          .where(
            and(
              eq(communityConnectionTypes.id, input.id),
              eq(communityConnectionTypes.communityId, ctx.community.id),
            ),
          );
        return { ok: true };
      });
    }),

  suggestions: ownerProcedure
    .input(
      slugInput.extend({
        typeId: z.string().optional(),
        memberId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const [types, rows, previous, dismissals, totals] = await Promise.all([
        connectionTypes(ctx.db, ctx.community.id),
        matchingParticipants(ctx.db, ctx.community.id).limit(500),
        ctx.db
          .select({ pairKey: introductions.pairKey })
          .from(introductions)
          .where(eq(introductions.communityId, ctx.community.id)),
        ctx.db
          .select({ pairKey: communityMatchDismissals.pairKey })
          .from(communityMatchDismissals)
          .where(eq(communityMatchDismissals.communityId, ctx.community.id)),
        ctx.db
          .select({ total: count() })
          .from(communityMatchingProfiles)
          .innerJoin(
            communityMemberships,
            and(
              eq(
                communityMatchingProfiles.communityId,
                communityMemberships.communityId,
              ),
              eq(communityMatchingProfiles.userId, communityMemberships.userId),
            ),
          )
          .where(
            and(
              eq(communityMatchingProfiles.communityId, ctx.community.id),
              eq(communityMatchingProfiles.optedIn, true),
              eq(communityMemberships.status, "active"),
            ),
          ),
      ]);
      const matches = findCommunityMatches({
        members: rows,
        types,
        typeId: input.typeId,
        memberId: input.memberId,
        excludePairs: new Set(
          [...previous, ...dismissals].map((p) => p.pairKey),
        ),
      });
      // Return only the identities required to explain matches/filter the scanned pool.
      return {
        matches,
        members: rows.map(({ userId, displayName, image }) => ({
          userId,
          displayName,
          image,
        })),
        scanned: rows.length,
        total: totals[0]?.total ?? 0,
        dismissedCount: dismissals.length,
      };
    }),

  dismiss: ownerProcedure
    .input(slugInput.extend({ userIdA: z.string(), userIdB: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (input.userIdA === input.userIdB)
        throw new TRPCError({ code: "BAD_REQUEST" });
      const pairKey = matchingPairKey(input.userIdA, input.userIdB);
      await ctx.db
        .insert(communityMatchDismissals)
        .values({
          communityId: ctx.community.id,
          pairKey,
          dismissedBy: ctx.session.user.id,
        })
        .onConflictDoNothing();
      return { ok: true };
    }),

  restoreDismissed: ownerProcedure
    .input(slugInput)
    .mutation(async ({ ctx }) => {
      await ctx.db
        .delete(communityMatchDismissals)
        .where(eq(communityMatchDismissals.communityId, ctx.community.id));
      return { ok: true };
    }),

  participants: ownerProcedure
    .input(
      slugInput.extend({
        q: z.string().trim().max(100).default(""),
        cursor: z.string().nullish(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conditions = [
        eq(communityMatchingProfiles.communityId, ctx.community.id),
        eq(communityMatchingProfiles.optedIn, true),
        eq(communityMemberships.status, "active"),
      ];
      if (input.cursor)
        conditions.push(gt(communityMatchingProfiles.userId, input.cursor));
      if (input.q) {
        const escaped = input.q.replace(/[\\%_]/g, "\\$&");
        conditions.push(
          or(
            ilike(memberProfiles.displayName, `%${escaped}%`),
            ilike(user.name, `%${escaped}%`),
          )!,
        );
      }
      const rows = await matchingParticipants(ctx.db, ctx.community.id)
        .where(and(...conditions))
        .limit(51);
      const more = rows.length > 50;
      const items = rows.slice(0, 50).map(({ userId, displayName, image }) => ({
        userId,
        displayName,
        image,
      }));
      return { items, nextCursor: more ? items.at(-1)!.userId : undefined };
    }),

  propose: ownerProcedure
    .input(
      slugInput.extend({
        userIdA: z.string().min(1),
        userIdB: z.string().min(1),
        reason: z.string().trim().min(1).max(1000),
        connectionTypeId: z.string().optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      proposeCommunityIntroduction(ctx.db, {
        ...input,
        communityId: ctx.community.id,
        organizerId: ctx.session.user.id,
      }),
    ),

  history: ownerProcedure
    .input(slugInput.extend({ cursor: z.number().int().min(0).default(0) }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          id: introductions.id,
          userIdA: introductions.userIdA,
          userIdB: introductions.userIdB,
          status: introductions.status,
          reason: introductions.reason,
          createdAt: introductions.createdAt,
          connectionTypeId: introductions.connectionTypeId,
        })
        .from(introductions)
        .where(eq(introductions.communityId, ctx.community.id))
        .orderBy(desc(introductions.createdAt), desc(introductions.id))
        .limit(51)
        .offset(input.cursor);
      const items = rows.slice(0, 50);
      const ids = [...new Set(items.flatMap((r) => [r.userIdA, r.userIdB]))];
      const members = ids.length
        ? await ctx.db
            .select({
              userId: user.id,
              displayName: memberProfiles.displayName,
              name: user.name,
              image: user.image,
            })
            .from(user)
            .leftJoin(memberProfiles, eq(memberProfiles.userId, user.id))
            .where(inArray(user.id, ids))
        : [];
      return {
        items,
        members: members.map((m) => ({
          userId: m.userId,
          displayName: m.displayName ?? m.name,
          image: m.image,
        })),
        nextCursor: rows.length > 50 ? input.cursor + 50 : undefined,
      };
    }),
});
