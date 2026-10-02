import { z } from "zod";
import { eq, sql, and, or, ilike, inArray, desc, gte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
} from "@/server/api/trpc";
import {
  memberProfiles,
  memberBadges,
  user,
  agentProfiles,
  activityEvents,
  pointsEvents,
  account,
} from "@/server/db/schema";
import { computeStreakData, pointsTriggerType } from "@/lib/gamification";
import { getPayloadClient } from "@/server/payload";
import {
  awardXp,
  awardBadge,
  isProfileComplete,
  XP_AMOUNTS,
} from "@/lib/gamification";
import { getAvatarUrl } from "@/lib/avatar";
import { personNameSchema } from "@/lib/person-name";
import {
  OAUTH_PROVIDERS,
  canDisconnectProvider,
  enabledOAuthProviders,
  mapOAuthProviders,
} from "@/lib/oauth-providers";
import { auth } from "@/server/better-auth";
import { isSocialProvider } from "@/lib/social-identity";
import {
  clearVerifiedIdentity,
  ensureGithubIdentityForUser,
} from "@/server/social/sync";
import {
  loadGithubAccountIds,
  loadSocialIdentitiesForUsers,
  presentMemberSocials,
  toLeaderboardSocial,
  toPublicSocialJson,
} from "@/server/social/present";
import {
  publicRosterEmailVisibility,
  publicRosterVisibility,
} from "@/server/members/public-roster";
import {
  loadProfileGate,
  profileAudience,
  profileReach,
  profileReachColumns,
  profileReadableBy,
} from "@/server/members/profile-access";
import {
  loadProfileCommunities,
  type ProfileCommunity,
} from "@/server/members/profile-communities";
import {
  loadProfileActivity,
  type ProfileActivity,
} from "@/server/members/profile-activity";
import {
  loadProfileWork,
  RECENT_WORK_LIMIT,
  type ProfileWork,
} from "@/server/members/profile-work";
import { memberActiveDays } from "@/server/members/active-days";
import { routing } from "@/i18n/routing";
import {
  publicRosterColumns,
  toPublicRosterEntry,
  type PublicRosterEntry,
} from "@/server/members/public-roster-entry";
import {
  publicMemberProfileColumns,
  toPublicMemberProfile,
} from "@/server/members/public-member-profile";
import {
  displayableBadgeRows,
  toDisplayableBadges,
} from "@/server/members/displayable-badges";

const upsertProfileInput = z.object({
  displayName: z.string().min(1).max(255),
  bio: z.string().max(2000).nullable(),
  skills: z.array(z.string().max(50)).max(20),
  company: z.string().max(255).nullable(),
  linkedinUrl: z.string().url().max(255).nullable().or(z.literal("")),
  githubUrl: z.string().url().max(255).nullable().or(z.literal("")),
  websiteUrl: z.string().url().max(255).nullable().or(z.literal("")),
  isPublic: z.boolean(),
  // Account names the event organizer sees (ADR-0038). Omitted: unchanged.
  // Empty: cleared, so the next registration asks again.
  firstName: z.union([personNameSchema, z.literal("")]).optional(),
  lastName: z.union([personNameSchema, z.literal("")]).optional(),
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
      .select({
        badgeSlug: memberBadges.badgeSlug,
        earnedAt: memberBadges.earnedAt,
      })
      .from(memberBadges)
      .where(and(eq(memberBadges.userId, userId), displayableBadgeRows()));

    const [names] = await ctx.db
      .select({ firstName: user.firstName, lastName: user.lastName })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    await ensureGithubIdentityForUser(ctx.db, userId);

    const [identitiesByUser, githubAccountIds, accounts] = await Promise.all([
      loadSocialIdentitiesForUsers(ctx.db, [userId]),
      loadGithubAccountIds(ctx.db, [userId]),
      ctx.db
        .select({ providerId: account.providerId })
        .from(account)
        .where(eq(account.userId, userId)),
    ]);

    const social = presentMemberSocials({
      userId,
      identities: identitiesByUser.get(userId) ?? [],
      hasGithubAccount: githubAccountIds.has(userId),
      pasted: {
        githubUrl: profile?.githubUrl,
        linkedinUrl: profile?.linkedinUrl,
        websiteUrl: profile?.websiteUrl,
      },
      subject: "member",
    });

    return {
      profile: profile ?? null,
      names: {
        firstName: names?.firstName ?? null,
        lastName: names?.lastName ?? null,
      },
      badges: toDisplayableBadges(badges),
      social: toPublicSocialJson(social),
      accounts: {
        ...mapOAuthProviders((provider) =>
          accounts.some((a) => a.providerId === provider),
        ),
        password: accounts.some((a) => a.providerId === "credential"),
      },
      canDisconnect: mapOAuthProviders(
        (provider) =>
          canDisconnectProvider(provider, accounts, enabledOAuthProviders()).ok,
      ),
    };
  }),

  /** Public flag for auth pages — request-time env, not a build-time snapshot. */
  getAuthProviders: publicProcedure.query(() => enabledOAuthProviders()),

  /**
   * The current user's activity streak, from the shared active days
   * (`memberActiveDays`, also behind the profile's Activity tab).
   */
  getMyStreak: protectedProcedure.query(async ({ ctx }) => {
    const days = await memberActiveDays(ctx.db, ctx.session.user.id);
    const today = new Date().toISOString().slice(0, 10);
    return computeStreakData(days, today);
  }),

  /** Recent XP awards for the current user (points history). */
  getMyPointsHistory: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const rows = await ctx.db
      .select()
      .from(pointsEvents)
      .where(eq(pointsEvents.userId, userId))
      .orderBy(desc(pointsEvents.createdAt))
      .limit(25);

    return rows.map((e) => ({
      id: e.id,
      awarded: e.amount,
      date: e.createdAt.toISOString(),
      total: e.totalAfter ?? 0,
      reason: e.reason,
      type: pointsTriggerType(e.reason),
    }));
  }),

  /**
   * Daily XP totals for the current user over the last 30 days (for the
   * XP-over-time chart). `total` is the cumulative XP at end of day (max
   * totalAfter — XP only increases), `change` is that day's gain.
   */
  getMyPointsChart: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const dayExpr = sql<string>`to_char(${pointsEvents.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`;

    const rows = await ctx.db
      .select({
        day: dayExpr,
        change: sql<number>`sum(${pointsEvents.amount})`,
        total: sql<number>`max(${pointsEvents.totalAfter})`,
      })
      .from(pointsEvents)
      .where(
        and(
          eq(pointsEvents.userId, userId),
          gte(pointsEvents.createdAt, since),
        ),
      )
      .groupBy(dayExpr)
      .orderBy(dayExpr);

    return rows.map((r) => ({
      date: r.day,
      total: Number(r.total ?? 0),
      change: Number(r.change ?? 0),
    }));
  }),

  /** The currently-active XP boost campaign (for the dashboard banner), or null. */
  getActiveBoost: publicProcedure.query(async () => {
    const payload = await getPayloadClient();
    const now = new Date().toISOString();
    const res = await payload.find({
      collection: "points-boosts",
      where: {
        and: [
          { enabled: { equals: true } },
          { startsAt: { less_than_equal: now } },
          { endsAt: { greater_than_equal: now } },
        ],
      },
      sort: "-multiplier",
      limit: 1,
      depth: 0,
    });
    const boost = res.docs[0];
    if (!boost) return null;
    return {
      name: boost.name,
      multiplier: boost.multiplier,
      description: boost.description ?? null,
      ctaText: boost.ctaText ?? null,
      ctaLink: boost.ctaLink ?? null,
      endsAt: boost.endsAt,
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

      const nameChanges = {
        ...(input.firstName !== undefined && {
          firstName: input.firstName || null,
        }),
        ...(input.lastName !== undefined && {
          lastName: input.lastName || null,
        }),
      };
      if (Object.keys(nameChanges).length > 0) {
        await ctx.db.update(user).set(nameChanges).where(eq(user.id, userId));
      }

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

  /** Disconnect an OAuth sign-in provider (Google / GitHub / LinkedIn). */
  disconnectSocial: protectedProcedure
    .input(z.object({ provider: z.enum(OAUTH_PROVIDERS) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const accounts = await ctx.db
        .select({ providerId: account.providerId })
        .from(account)
        .where(eq(account.userId, userId));

      const allowed = canDisconnectProvider(
        input.provider,
        accounts,
        enabledOAuthProviders(),
      );
      if (!allowed.ok) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Add another sign-in method before disconnecting.",
        });
      }

      try {
        await auth.api.unlinkAccount({
          headers: ctx.headers,
          body: { providerId: input.provider },
        });
      } catch {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Could not disconnect that account.",
        });
      }

      if (isSocialProvider(input.provider)) {
        await clearVerifiedIdentity(ctx.db, userId, input.provider);
      }
      return { success: true };
    }),

  /**
   * A member's public profile by userId. Visitors get it only when the
   * profile is on the public roster; the owner always gets their own, with
   * `reach` telling them whether visitors can see it.
   */
  getPublicProfile: publicProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      const audience = profileAudience(ctx.session?.user.id, input.userId);
      const [profile] = await ctx.db
        .select({
          ...publicMemberProfileColumns,
          ...profileReachColumns(),
        })
        .from(memberProfiles)
        .where(
          and(
            eq(memberProfiles.userId, input.userId),
            profileReadableBy(audience),
          ),
        )
        .limit(1);

      if (!profile) return null;

      await ensureGithubIdentityForUser(ctx.db, input.userId);

      const [memberUser] = await ctx.db
        .select({ email: user.email, image: user.image })
        .from(user)
        .where(eq(user.id, input.userId))
        .limit(1);

      const badges = await ctx.db
        .select({
          badgeSlug: memberBadges.badgeSlug,
          earnedAt: memberBadges.earnedAt,
        })
        .from(memberBadges)
        .where(
          and(eq(memberBadges.userId, input.userId), displayableBadgeRows()),
        )
        .orderBy(desc(memberBadges.earnedAt), memberBadges.badgeSlug);

      const [identitiesByUser, githubAccountIds] = await Promise.all([
        loadSocialIdentitiesForUsers(ctx.db, [input.userId]),
        loadGithubAccountIds(ctx.db, [input.userId]),
      ]);

      const social = presentMemberSocials({
        userId: input.userId,
        identities: identitiesByUser.get(input.userId) ?? [],
        hasGithubAccount: githubAccountIds.has(input.userId),
        pasted: {
          githubUrl: profile.githubUrl,
          linkedinUrl: profile.linkedinUrl,
          websiteUrl: profile.websiteUrl,
        },
        subject: "member",
      });

      return {
        profile: toPublicMemberProfile(profile),
        audience,
        reach: profileReach(profile),
        user: memberUser
          ? {
              image: memberUser.image,
              avatarUrl: getAvatarUrl(memberUser.email, memberUser.image),
            }
          : null,
        badges: toDisplayableBadges(badges),
        social: toPublicSocialJson(social),
      };
    }),

  /**
   * The communities shown in a member's identity panel, as this viewer may
   * see them. Null when the viewer may not see the profile.
   */
  getPublicCommunities: publicProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }): Promise<ProfileCommunity[] | null> => {
      const viewerId = ctx.session?.user.id ?? null;
      const gate = await loadProfileGate(ctx.db, {
        userId: input.userId,
        viewerId,
      });
      if (!gate) return null;
      return loadProfileCommunities(ctx.db, { userId: input.userId, viewerId });
    }),

  /**
   * A member's public activity calendar: active days with their XP totals
   * and the streaks, from points only. Null when the viewer may not see the
   * profile.
   */
  getPublicActivity: publicProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }): Promise<ProfileActivity | null> => {
      const gate = await loadProfileGate(ctx.db, {
        userId: input.userId,
        viewerId: ctx.session?.user.id,
      });
      if (!gate) return null;
      return loadProfileActivity(ctx.db, {
        userId: input.userId,
        today: new Date().toISOString().slice(0, 10),
      });
    }),

  /**
   * A member's Work (articles, projects, courses, certificates, events
   * hosted), as this viewer may see it. Null when the viewer may not see the
   * profile.
   */
  getPublicWork: publicProcedure
    .input(
      z.object({
        userId: z.string(),
        locale: z.enum(routing.locales).default(routing.defaultLocale),
      }),
    )
    .query(async ({ ctx, input }): Promise<ProfileWork | null> => {
      const viewerId = ctx.session?.user.id ?? null;
      const gate = await loadProfileGate(ctx.db, {
        userId: input.userId,
        viewerId,
      });
      if (!gate) return null;
      return loadProfileWork(
        { db: ctx.db, payload: await getPayloadClient() },
        { userId: input.userId, viewerId, locale: input.locale },
      );
    }),

  /**
   * The few newest items of a member's Work for the Overview: the same
   * lists and rules as `getPublicWork`, capped short, and only events that
   * have started. Null when the viewer may not see the profile.
   */
  getPublicRecentWork: publicProcedure
    .input(
      z.object({
        userId: z.string(),
        locale: z.enum(routing.locales).default(routing.defaultLocale),
      }),
    )
    .query(async ({ ctx, input }): Promise<ProfileWork | null> => {
      const viewerId = ctx.session?.user.id ?? null;
      const gate = await loadProfileGate(ctx.db, {
        userId: input.userId,
        viewerId,
      });
      if (!gate) return null;
      return loadProfileWork(
        { db: ctx.db, payload: await getPayloadClient() },
        {
          userId: input.userId,
          viewerId,
          locale: input.locale,
          limit: RECENT_WORK_LIMIT,
          startedBy: new Date().toISOString(),
        },
      );
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
    .query(
      async ({
        ctx,
        input,
      }): Promise<{
        items: PublicRosterEntry[];
        nextCursor: number | null;
      }> => {
        const conditions = [
          publicRosterVisibility(),
          publicRosterEmailVisibility(),
        ];

        if (input.search) {
          conditions.push(
            or(
              ilike(memberProfiles.displayName, `%${input.search}%`),
              ilike(memberProfiles.company, `%${input.search}%`),
            ),
          );
        }

        const profiles = await ctx.db
          .select({
            profile: publicRosterColumns,
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
              (item.profile.skills ?? []).some(
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
                  count: sql<number>`count(*)`.mapWith(Number),
                })
                .from(memberBadges)
                .where(
                  and(
                    inArray(memberBadges.userId, memberIds),
                    displayableBadgeRows(),
                  ),
                )
                .groupBy(memberBadges.userId)
            : [];

        const badgeCountMap = new Map(
          badgeCounts.map((bc) => [bc.userId, bc.count]),
        );

        const [identitiesByUser, githubAccountIds] = await Promise.all([
          loadSocialIdentitiesForUsers(ctx.db, memberIds),
          loadGithubAccountIds(ctx.db, memberIds),
        ]);

        return {
          items: filtered.map((m) => {
            const social = presentMemberSocials({
              userId: m.profile.userId,
              identities: identitiesByUser.get(m.profile.userId) ?? [],
              hasGithubAccount: githubAccountIds.has(m.profile.userId),
              pasted: {
                githubUrl: m.profile.githubUrl,
                linkedinUrl: m.profile.linkedinUrl,
                websiteUrl: m.profile.websiteUrl,
              },
              subject: "member",
            });
            return toPublicRosterEntry({
              profile: m.profile,
              email: m.email,
              image: m.image,
              ownedActiveAgentId: m.agentId,
              badgeCount: badgeCountMap.get(m.profile.userId) ?? 0,
              social: toLeaderboardSocial(social),
            });
          }),
          nextCursor: hasMore ? input.cursor + input.limit : null,
        };
      },
    ),
});
