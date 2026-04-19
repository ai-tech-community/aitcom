import { z } from "zod";
import { eq, sql, and, or, ilike, inArray } from "drizzle-orm";

import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
} from "@/server/api/trpc";
import {
  memberProfiles,
  memberBadges,
  user,
  eventRegistrations,
  agentProfiles,
} from "@/server/db/schema";
import {
  awardXp,
  awardBadge,
  isProfileComplete,
  XP_AMOUNTS,
  BADGES,
} from "@/lib/gamification";
import { getAvatarUrl } from "@/lib/avatar";

const upsertProfileInput = z.object({
  displayName: z.string().min(1).max(255),
  bio: z.string().max(2000).nullable(),
  skills: z.array(z.string().max(50)).max(20),
  company: z.string().max(255).nullable(),
  linkedinUrl: z.string().url().max(255).nullable().or(z.literal("")),
  githubUrl: z.string().url().max(255).nullable().or(z.literal("")),
  websiteUrl: z.string().url().max(255).nullable().or(z.literal("")),
  isPublic: z.boolean(),
});

export const membersRouter = createTRPCRouter({
  /** Get the current user's own profile + badges. */
  getMyProfile: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const [profile] = await ctx.db
      .select()
      .from(memberProfiles)
      .where(eq(memberProfiles.userId, userId))
      .limit(1);

    const badges = await ctx.db
      .select()
      .from(memberBadges)
      .where(eq(memberBadges.userId, userId));

    return {
      profile: profile ?? null,
      badges: badges.map((b) => ({
        ...BADGES[b.badgeSlug],
        earnedAt: b.earnedAt,
      })),
    };
  }),

  /** Create or update the current user's profile. */
  upsertProfile: protectedProcedure
    .input(upsertProfileInput)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Normalize empty strings to null for URL fields
      const linkedinUrl =
        input.linkedinUrl === "" ? null : (input.linkedinUrl ?? null);
      const githubUrl =
        input.githubUrl === "" ? null : (input.githubUrl ?? null);
      const websiteUrl =
        input.websiteUrl === "" ? null : (input.websiteUrl ?? null);

      // Check if profile exists
      const [existing] = await ctx.db
        .select()
        .from(memberProfiles)
        .where(eq(memberProfiles.userId, userId))
        .limit(1);

      const isNew = !existing;

      if (isNew) {
        await ctx.db.insert(memberProfiles).values({
          userId,
          displayName: input.displayName,
          bio: input.bio,
          skills: input.skills,
          company: input.company,
          linkedinUrl,
          githubUrl,
          websiteUrl,
          isPublic: input.isPublic,
        });
      } else {
        await ctx.db
          .update(memberProfiles)
          .set({
            displayName: input.displayName,
            bio: input.bio,
            skills: input.skills,
            company: input.company,
            linkedinUrl,
            githubUrl,
            websiteUrl,
            isPublic: input.isPublic,
          })
          .where(eq(memberProfiles.userId, userId));
      }

      // Check profile completion for XP and badge
      if (
        isProfileComplete({
          displayName: input.displayName,
          bio: input.bio,
          skills: input.skills,
          company: input.company,
        })
      ) {
        const awarded = await awardBadge(ctx.db, userId, "profile_complete");
        if (awarded) {
          await awardXp(ctx.db, userId, XP_AMOUNTS.PROFILE_COMPLETE);
        }
      }

      return { success: true, isNew };
    }),

  /** Get a public member profile by userId. */
  getPublicProfile: publicProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [profile] = await ctx.db
        .select()
        .from(memberProfiles)
        .where(
          and(
            eq(memberProfiles.userId, input.userId),
            eq(memberProfiles.isPublic, true),
          ),
        )
        .limit(1);

      if (!profile) return null;

      const [memberUser] = await ctx.db
        .select({ email: user.email, image: user.image })
        .from(user)
        .where(eq(user.id, input.userId))
        .limit(1);

      const badges = await ctx.db
        .select()
        .from(memberBadges)
        .where(eq(memberBadges.userId, input.userId));

      const [attendedCount] = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(eventRegistrations)
        .where(
          and(
            eq(eventRegistrations.userId, input.userId),
            eq(eventRegistrations.status, "attended"),
          ),
        );

      return {
        profile,
        user: memberUser
          ? {
              image: memberUser.image,
              avatarUrl: getAvatarUrl(memberUser.email, memberUser.image),
            }
          : null,
        badges: badges.map((b) => ({
          ...BADGES[b.badgeSlug],
          earnedAt: b.earnedAt,
        })),
        eventsAttended: attendedCount?.count ?? 0,
      };
    }),

  /** List public members, paginated, with search and skill filter. Sorted by XP. */
  listMembers: publicProcedure
    .input(
      z.object({
        search: z.string().optional(),
        skill: z.string().optional(),
        cursor: z.number().default(0),
        limit: z.number().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conditions = [eq(memberProfiles.isPublic, true)];

      if (input.search) {
        conditions.push(
          or(
            ilike(memberProfiles.displayName, `%${input.search}%`),
            ilike(memberProfiles.company, `%${input.search}%`),
          )!,
        );
      }

      const profiles = await ctx.db
        .select({
          profile: memberProfiles,
          email: user.email,
          image: user.image,
          agentId: agentProfiles.id,
        })
        .from(memberProfiles)
        .innerJoin(user, eq(memberProfiles.userId, user.id))
        .leftJoin(
          agentProfiles,
          and(
            eq(agentProfiles.ownerId, memberProfiles.userId),
            eq(agentProfiles.status, "active"),
          ),
        )
        .where(and(...conditions))
        .orderBy(sql`${memberProfiles.xp} DESC`)
        .offset(input.cursor)
        .limit(input.limit + 1); // +1 to check if there are more

      const hasMore = profiles.length > input.limit;
      const items = hasMore ? profiles.slice(0, input.limit) : profiles;

      // Filter by skill in application layer (JSON column)
      const filtered = input.skill
        ? items.filter((item) =>
            item.profile.skills.some(
              (s) => s.toLowerCase() === input.skill?.toLowerCase(),
            ),
          )
        : items;

      // Get badge counts for each member
      const memberIds = filtered.map((m) => m.profile.userId);
      const badgeCounts =
        memberIds.length > 0
          ? await ctx.db
              .select({
                userId: memberBadges.userId,
                count: sql<number>`count(*)`,
              })
              .from(memberBadges)
              .where(inArray(memberBadges.userId, memberIds))
              .groupBy(memberBadges.userId)
          : [];

      const badgeCountMap = new Map(
        badgeCounts.map((bc) => [bc.userId, bc.count]),
      );

      return {
        items: filtered.map((m) => ({
          profile: m.profile,
          image: m.image,
          avatarUrl: getAvatarUrl(m.email, m.image),
          agentId: m.agentId,
          badgeCount: badgeCountMap.get(m.profile.userId) ?? 0,
          hasAgent: !!m.agentId,
        })),
        nextCursor: hasMore ? input.cursor + input.limit : null,
      };
    }),

  /** Top 5 members by XP for leaderboard. */
  getLeaderboard: publicProcedure.query(async ({ ctx }) => {
    const top = await ctx.db
      .select({
        profile: memberProfiles,
        email: user.email,
        image: user.image,
      })
      .from(memberProfiles)
      .innerJoin(user, eq(memberProfiles.userId, user.id))
      .where(eq(memberProfiles.isPublic, true))
      .orderBy(sql`${memberProfiles.xp} DESC`)
      .limit(5);

    // Get badge counts
    const userIds = top.map((t) => t.profile.userId);
    const badgeCounts =
      userIds.length > 0
        ? await ctx.db
            .select({
              userId: memberBadges.userId,
              count: sql<number>`count(*)`,
            })
            .from(memberBadges)
            .where(inArray(memberBadges.userId, userIds))
            .groupBy(memberBadges.userId)
        : [];

    const badgeCountMap = new Map(
      badgeCounts.map((bc) => [bc.userId, bc.count]),
    );

    return top.map((t) => ({
      profile: t.profile,
      image: t.image,
      avatarUrl: getAvatarUrl(t.email, t.image),
      badgeCount: badgeCountMap.get(t.profile.userId) ?? 0,
    }));
  }),
});
