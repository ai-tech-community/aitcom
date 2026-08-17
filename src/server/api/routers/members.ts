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
  eventRegistrations,
  agentProfiles,
  hackathonCertificates,
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
  BADGES,
} from "@/lib/gamification";
import { getAvatarUrl } from "@/lib/avatar";
import { isLinkedinOAuthEnabled } from "@/lib/linkedin-oauth-env";
import { auth } from "@/server/better-auth";
import { canDisconnectProvider } from "@/lib/social-identity";
import {
  clearVerifiedIdentity,
  ensureGithubIdentityForUser,
} from "@/server/social/sync";
import {
  loadGithubAccountIds,
  loadSocialIdentitiesForUsers,
  presentMemberSocials,
  toPublicSocialJson,
} from "@/server/social/present";

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
      badges: badges.map((b) => ({
        ...BADGES[b.badgeSlug],
        earnedAt: b.earnedAt,
      })),
      social: toPublicSocialJson(social),
      accounts: {
        github: accounts.some((a) => a.providerId === "github"),
        linkedin: accounts.some((a) => a.providerId === "linkedin"),
        password: accounts.some((a) => a.providerId === "credential"),
      },
      canDisconnect: {
        github: canDisconnectProvider("github", accounts).ok,
        linkedin: canDisconnectProvider("linkedin", accounts).ok,
      },
      linkedinConnectAvailable: isLinkedinOAuthEnabled(),
    };
  }),

  /** Public flag for auth pages — request-time env, not a build-time snapshot. */
  getAuthProviders: publicProcedure.query(() => ({
    github: true,
    linkedin: isLinkedinOAuthEnabled(),
  })),

  /**
   * The current user's activity streak, derived from activityEvents (no
   * dedicated streak table) — an "active day" is any day with >=1 event.
   */
  getMyStreak: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const rows = await ctx.db
      .selectDistinct({
        day: sql<string>`to_char(${activityEvents.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`,
      })
      .from(activityEvents)
      .where(
        and(
          eq(activityEvents.actorId, userId),
          eq(activityEvents.actorType, "member"),
        ),
      )
      .orderBy(
        sql`to_char(${activityEvents.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`,
      );

    const today = new Date().toISOString().slice(0, 10);
    return computeStreakData(
      rows.map((r) => r.day),
      today,
    );
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

  /** Disconnect a verified social provider (GitHub / LinkedIn). */
  disconnectSocial: protectedProcedure
    .input(z.object({ provider: z.enum(["github", "linkedin"]) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const accounts = await ctx.db
        .select({ providerId: account.providerId })
        .from(account)
        .where(eq(account.userId, userId));

      const allowed = canDisconnectProvider(input.provider, accounts);
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

      await clearVerifiedIdentity(ctx.db, userId, input.provider);
      return { success: true };
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

      await ensureGithubIdentityForUser(ctx.db, input.userId);

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

      // Hackathon certificates (issued at finalize), shown alongside badges.
      // Same isPublic gate as the rest of the profile (early return above).
      const certificates = await ctx.db
        .select()
        .from(hackathonCertificates)
        .where(eq(hackathonCertificates.userId, input.userId))
        .orderBy(desc(hackathonCertificates.issuedAt));

      let challengeTitleById = new Map<number, string>();
      if (certificates.length > 0) {
        const payload = await getPayloadClient();
        const { docs } = await payload.find({
          collection: "challenges",
          where: { id: { in: certificates.map((c) => c.challengeId) } },
          depth: 0,
          limit: certificates.length,
          pagination: false,
        });
        challengeTitleById = new Map(docs.map((d) => [d.id, d.title]));
      }

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
        certificates: certificates.map((c) => ({
          id: c.id,
          challengeId: c.challengeId,
          challengeTitle: challengeTitleById.get(c.challengeId) ?? null,
          kind: c.kind,
          issuedAt: c.issuedAt,
        })),
        eventsAttended: attendedCount?.count ?? 0,
        social: toPublicSocialJson(social),
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
          return {
            profile: m.profile,
            image: m.image,
            avatarUrl: getAvatarUrl(m.email, m.image),
            agentId: m.agentId,
            badgeCount: badgeCountMap.get(m.profile.userId) ?? 0,
            hasAgent: !!m.agentId,
            social: {
              github: social.github?.verified
                ? {
                    handle: social.github.handle,
                    url: social.github.url,
                    verified: true as const,
                  }
                : null,
              linkedin: social.linkedin?.verified
                ? {
                    handle: social.linkedin.handle,
                    url: social.linkedin.url,
                    verified: true as const,
                  }
                : null,
            },
          };
        }),
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

    const [identitiesByUser, githubAccountIds] = await Promise.all([
      loadSocialIdentitiesForUsers(ctx.db, userIds),
      loadGithubAccountIds(ctx.db, userIds),
    ]);

    return top.map((t) => {
      const social = presentMemberSocials({
        userId: t.profile.userId,
        identities: identitiesByUser.get(t.profile.userId) ?? [],
        hasGithubAccount: githubAccountIds.has(t.profile.userId),
        pasted: {
          githubUrl: t.profile.githubUrl,
          linkedinUrl: t.profile.linkedinUrl,
          websiteUrl: t.profile.websiteUrl,
        },
        subject: "member",
      });
      return {
        profile: t.profile,
        image: t.image,
        avatarUrl: getAvatarUrl(t.email, t.image),
        badgeCount: badgeCountMap.get(t.profile.userId) ?? 0,
        social: {
          github: social.github?.verified
            ? {
                handle: social.github.handle,
                url: social.github.url,
                verified: true as const,
              }
            : null,
          linkedin: social.linkedin?.verified
            ? {
                handle: social.linkedin.handle,
                url: social.linkedin.url,
                verified: true as const,
              }
            : null,
        },
      };
    });
  }),
});
