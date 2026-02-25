import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
  memberProfiles,
  onboardingSteps,
  agentProfiles,
  activityEvents,
  user,
} from "@/server/db/schema";
import { awardXp, awardBadge, XP_AMOUNTS } from "@/lib/gamification";

// ── Checklist Definitions ───────────────────────────────────────────────

interface ChecklistStep {
  slug: string;
  labelKey: string;
  href?: string;
  autoDetect?: boolean;
}

const LEARNING_STEPS: ChecklistStep[] = [
  { slug: "complete_profile", labelKey: "completeProfile", href: "/dashboard", autoDetect: true },
  { slug: "browse_events", labelKey: "browseEvents", href: "/events" },
  { slug: "read_article", labelKey: "readArticle", href: "/blog" },
  { slug: "forum_intro", labelKey: "forumIntro", href: "/community", autoDetect: true },
  { slug: "setup_agent", labelKey: "setupAgent", href: "/dashboard/agent", autoDetect: true },
];

const NETWORKING_STEPS: ChecklistStep[] = [
  { slug: "complete_profile", labelKey: "completeProfile", href: "/dashboard", autoDetect: true },
  { slug: "browse_members", labelKey: "browseMembers", href: "/members" },
  { slug: "follow_members", labelKey: "followMembers" },
  { slug: "forum_intro", labelKey: "forumIntro", href: "/community", autoDetect: true },
  { slug: "setup_agent", labelKey: "setupAgent", href: "/dashboard/agent", autoDetect: true },
];

const EXPERTISE_STEPS: ChecklistStep[] = [
  { slug: "complete_profile", labelKey: "completeProfile", href: "/dashboard", autoDetect: true },
  { slug: "create_thread", labelKey: "createThread", href: "/community", autoDetect: true },
  { slug: "vote_ideas", labelKey: "voteIdeas", href: "/community", autoDetect: true },
  { slug: "express_speaking", labelKey: "expressSpeaking", href: "/community" },
  { slug: "setup_agent", labelKey: "setupAgent", href: "/dashboard/agent", autoDetect: true },
];

const GENERIC_STEPS: ChecklistStep[] = LEARNING_STEPS;

function getStepsForIntent(intent: string | null): ChecklistStep[] {
  switch (intent) {
    case "learning":
      return LEARNING_STEPS;
    case "networking":
      return NETWORKING_STEPS;
    case "expertise":
      return EXPERTISE_STEPS;
    default:
      return GENERIC_STEPS;
  }
}

// ── Router ──────────────────────────────────────────────────────────────

export const onboardingRouter = createTRPCRouter({
  /** Save onboarding intent answers (Step 1 of onboarding flow). */
  saveIntent: protectedProcedure
    .input(
      z.object({
        intent: z.enum(["learning", "networking", "expertise", "hiring", "all"]),
        interests: z.array(z.string().max(50)).max(10),
        experienceLevel: z.enum(["junior", "mid", "senior", "lead"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Map "hiring" and "all" to a path
      const intentToPath =
        input.intent === "hiring" ? "networking" : input.intent === "all" ? "learning" : input.intent;

      // Check if profile exists
      const [existing] = await ctx.db
        .select({ userId: memberProfiles.userId })
        .from(memberProfiles)
        .where(eq(memberProfiles.userId, userId))
        .limit(1);

      if (existing) {
        await ctx.db
          .update(memberProfiles)
          .set({
            onboardingIntent: intentToPath,
            interests: input.interests,
            experienceLevel: input.experienceLevel,
          })
          .where(eq(memberProfiles.userId, userId));
      } else {
        // Create a minimal profile with onboarding data
        const userName = ctx.session.user.name ?? ctx.session.user.email.split("@")[0]!;
        await ctx.db.insert(memberProfiles).values({
          userId,
          displayName: userName,
          onboardingIntent: intentToPath,
          interests: input.interests,
          experienceLevel: input.experienceLevel,
        });
      }

      return { success: true };
    }),

  /** Skip onboarding (use generic checklist). */
  skipIntent: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const [existing] = await ctx.db
      .select({ userId: memberProfiles.userId })
      .from(memberProfiles)
      .where(eq(memberProfiles.userId, userId))
      .limit(1);

    if (!existing) {
      const userName = ctx.session.user.name ?? ctx.session.user.email.split("@")[0]!;
      await ctx.db.insert(memberProfiles).values({
        userId,
        displayName: userName,
      });
    }

    return { success: true };
  }),

  /** Get onboarding status: has profile, has intent, checklist with completion status. */
  getStatus: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const [profile] = await ctx.db
      .select({
        userId: memberProfiles.userId,
        onboardingIntent: memberProfiles.onboardingIntent,
        onboardingCompleted: memberProfiles.onboardingCompleted,
        displayName: memberProfiles.displayName,
        bio: memberProfiles.bio,
        skills: memberProfiles.skills,
        company: memberProfiles.company,
      })
      .from(memberProfiles)
      .where(eq(memberProfiles.userId, userId))
      .limit(1);

    if (!profile) {
      return { hasProfile: false, hasIntent: false, onboardingCompleted: false, checklist: [] };
    }

    if (profile.onboardingCompleted) {
      return { hasProfile: true, hasIntent: true, onboardingCompleted: true, checklist: [] };
    }

    const steps = getStepsForIntent(profile.onboardingIntent);

    // Fetch completed steps
    const completedRows = await ctx.db
      .select({ stepSlug: onboardingSteps.stepSlug })
      .from(onboardingSteps)
      .where(eq(onboardingSteps.userId, userId));

    const completedSlugs = new Set(completedRows.map((r) => r.stepSlug));

    // Auto-detect completions
    const autoDetected = new Set<string>();

    // Check profile complete
    const isProfileFilled =
      profile.displayName.length > 0 &&
      !!profile.bio &&
      profile.bio.length > 0 &&
      profile.skills.length > 0 &&
      !!profile.company &&
      profile.company.length > 0;
    if (isProfileFilled) autoDetected.add("complete_profile");

    // Check agent setup
    const [agent] = await ctx.db
      .select({ id: agentProfiles.id })
      .from(agentProfiles)
      .where(and(eq(agentProfiles.ownerId, userId), eq(agentProfiles.status, "active")))
      .limit(1);
    if (agent) autoDetected.add("setup_agent");

    // Check forum activity (thread.create = forum_intro or create_thread)
    const [threadActivity] = await ctx.db
      .select({ id: activityEvents.id })
      .from(activityEvents)
      .where(
        and(
          eq(activityEvents.actorId, userId),
          eq(activityEvents.action, "thread.create"),
        ),
      )
      .limit(1);
    if (threadActivity) {
      autoDetected.add("forum_intro");
      autoDetected.add("create_thread");
    }

    // Check idea voting
    const [voteActivity] = await ctx.db
      .select({ id: activityEvents.id })
      .from(activityEvents)
      .where(
        and(
          eq(activityEvents.actorId, userId),
          eq(activityEvents.action, "idea.voted"),
        ),
      )
      .limit(1);
    if (voteActivity) autoDetected.add("vote_ideas");

    // Build checklist
    const checklist = steps.map((step) => ({
      slug: step.slug,
      labelKey: step.labelKey,
      href: step.href ?? null,
      completed: completedSlugs.has(step.slug) || autoDetected.has(step.slug),
    }));

    return {
      hasProfile: true,
      hasIntent: !!profile.onboardingIntent,
      onboardingCompleted: profile.onboardingCompleted,
      checklist,
    };
  }),

  /** Complete an onboarding step (for steps that aren't auto-detected). */
  completeStep: protectedProcedure
    .input(z.object({ stepSlug: z.string().max(100) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Insert step (ignore if already completed)
      await ctx.db
        .insert(onboardingSteps)
        .values({ userId, stepSlug: input.stepSlug })
        .onConflictDoNothing();

      // Award XP for the step
      await awardXp(ctx.db, userId, XP_AMOUNTS.ONBOARDING_STEP);

      // Check if all steps are now complete
      const [profile] = await ctx.db
        .select({
          onboardingIntent: memberProfiles.onboardingIntent,
          onboardingCompleted: memberProfiles.onboardingCompleted,
        })
        .from(memberProfiles)
        .where(eq(memberProfiles.userId, userId))
        .limit(1);

      if (profile && !profile.onboardingCompleted) {
        const steps = getStepsForIntent(profile.onboardingIntent);
        const completedRows = await ctx.db
          .select({ stepSlug: onboardingSteps.stepSlug })
          .from(onboardingSteps)
          .where(eq(onboardingSteps.userId, userId));

        const completedSlugs = new Set(completedRows.map((r) => r.stepSlug));
        const allComplete = steps.every((s) => completedSlugs.has(s.slug));

        if (allComplete) {
          await ctx.db
            .update(memberProfiles)
            .set({ onboardingCompleted: true })
            .where(eq(memberProfiles.userId, userId));

          await awardBadge(ctx.db, userId, "onboarding_complete");
          await awardXp(ctx.db, userId, XP_AMOUNTS.ONBOARDING_COMPLETE);
        }
      }

      return { success: true };
    }),

  /** Sync auto-detected steps and check for completion. Called from dashboard. */
  syncAutoDetected: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const [profile] = await ctx.db
      .select({
        onboardingIntent: memberProfiles.onboardingIntent,
        onboardingCompleted: memberProfiles.onboardingCompleted,
        displayName: memberProfiles.displayName,
        bio: memberProfiles.bio,
        skills: memberProfiles.skills,
        company: memberProfiles.company,
      })
      .from(memberProfiles)
      .where(eq(memberProfiles.userId, userId))
      .limit(1);

    if (!profile || profile.onboardingCompleted) return { synced: 0 };

    const steps = getStepsForIntent(profile.onboardingIntent);
    const autoDetectSlugs = steps.filter((s) => s.autoDetect).map((s) => s.slug);

    // Check what's auto-completed
    const autoCompleted: string[] = [];

    const isProfileFilled =
      profile.displayName.length > 0 &&
      !!profile.bio && profile.bio.length > 0 &&
      profile.skills.length > 0 &&
      !!profile.company && profile.company.length > 0;
    if (isProfileFilled && autoDetectSlugs.includes("complete_profile")) {
      autoCompleted.push("complete_profile");
    }

    const [agent] = await ctx.db
      .select({ id: agentProfiles.id })
      .from(agentProfiles)
      .where(and(eq(agentProfiles.ownerId, userId), eq(agentProfiles.status, "active")))
      .limit(1);
    if (agent && autoDetectSlugs.includes("setup_agent")) {
      autoCompleted.push("setup_agent");
    }

    const [threadAct] = await ctx.db
      .select({ id: activityEvents.id })
      .from(activityEvents)
      .where(and(eq(activityEvents.actorId, userId), eq(activityEvents.action, "thread.create")))
      .limit(1);
    if (threadAct) {
      if (autoDetectSlugs.includes("forum_intro")) autoCompleted.push("forum_intro");
      if (autoDetectSlugs.includes("create_thread")) autoCompleted.push("create_thread");
    }

    const [voteAct] = await ctx.db
      .select({ id: activityEvents.id })
      .from(activityEvents)
      .where(and(eq(activityEvents.actorId, userId), eq(activityEvents.action, "idea.voted")))
      .limit(1);
    if (voteAct && autoDetectSlugs.includes("vote_ideas")) {
      autoCompleted.push("vote_ideas");
    }

    // Insert auto-completed steps
    let synced = 0;
    for (const slug of autoCompleted) {
      const [inserted] = await ctx.db
        .insert(onboardingSteps)
        .values({ userId, stepSlug: slug })
        .onConflictDoNothing()
        .returning();
      if (inserted) {
        synced++;
        await awardXp(ctx.db, userId, XP_AMOUNTS.ONBOARDING_STEP);
      }
    }

    // Check if all steps are now complete
    if (synced > 0) {
      const completedRows = await ctx.db
        .select({ stepSlug: onboardingSteps.stepSlug })
        .from(onboardingSteps)
        .where(eq(onboardingSteps.userId, userId));

      const completedSlugs = new Set(completedRows.map((r) => r.stepSlug));
      const allComplete = steps.every((s) => completedSlugs.has(s.slug));

      if (allComplete) {
        await ctx.db
          .update(memberProfiles)
          .set({ onboardingCompleted: true })
          .where(eq(memberProfiles.userId, userId));

        await awardBadge(ctx.db, userId, "onboarding_complete");
        await awardXp(ctx.db, userId, XP_AMOUNTS.ONBOARDING_COMPLETE);
      }
    }

    return { synced };
  }),

  /** Get social suggestions: members with overlapping skills, sorted by XP. */
  getSuggestions: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const [profile] = await ctx.db
      .select({
        interests: memberProfiles.interests,
        skills: memberProfiles.skills,
      })
      .from(memberProfiles)
      .where(eq(memberProfiles.userId, userId))
      .limit(1);

    if (!profile) return { members: [], agents: [] };

    // Combine interests and skills for matching
    const tags = [...(profile.interests ?? []), ...profile.skills];

    // Get top members by XP who share at least one skill/interest
    const allMembers = await ctx.db
      .select({
        userId: memberProfiles.userId,
        displayName: memberProfiles.displayName,
        skills: memberProfiles.skills,
        company: memberProfiles.company,
        xp: memberProfiles.xp,
        image: user.image,
      })
      .from(memberProfiles)
      .innerJoin(user, eq(memberProfiles.userId, user.id))
      .where(
        and(
          eq(memberProfiles.isPublic, true),
          sql`${memberProfiles.userId} != ${userId}`,
        ),
      )
      .orderBy(desc(memberProfiles.xp))
      .limit(50);

    // Filter by overlapping tags in application layer (JSON columns)
    const tagSet = new Set(tags.map((t) => t.toLowerCase()));
    const matched = allMembers
      .filter((m) =>
        m.skills.some((s) => tagSet.has(s.toLowerCase())),
      )
      .slice(0, 5);

    // If not enough matches, fill with top XP members
    const suggested =
      matched.length >= 5
        ? matched
        : [
            ...matched,
            ...allMembers
              .filter((m) => !matched.some((mm) => mm.userId === m.userId))
              .slice(0, 5 - matched.length),
          ];

    // Get active agents in member's interest areas
    const agents = await ctx.db
      .select({
        id: agentProfiles.id,
        name: agentProfiles.name,
        avatar: agentProfiles.avatar,
        bio: agentProfiles.bio,
        expertiseTags: agentProfiles.expertiseTags,
        totalContributions: agentProfiles.totalContributions,
        ownerId: agentProfiles.ownerId,
      })
      .from(agentProfiles)
      .where(
        and(
          eq(agentProfiles.status, "active"),
          sql`${agentProfiles.ownerId} != ${userId}`,
        ),
      )
      .orderBy(desc(agentProfiles.totalContributions))
      .limit(10);

    // Filter by overlapping expertise tags
    const matchedAgents = agents
      .filter((a) =>
        (a.expertiseTags ?? []).some((t: string) => tagSet.has(t.toLowerCase())),
      )
      .slice(0, 3);

    const suggestedAgents =
      matchedAgents.length >= 3
        ? matchedAgents
        : [
            ...matchedAgents,
            ...agents
              .filter((a) => !matchedAgents.some((ma) => ma.id === a.id))
              .slice(0, 3 - matchedAgents.length),
          ];

    return {
      members: suggested.map((m) => ({
        userId: m.userId,
        displayName: m.displayName,
        skills: m.skills,
        company: m.company,
        xp: m.xp,
        image: m.image,
      })),
      agents: suggestedAgents.map((a) => ({
        id: a.id,
        name: a.name,
        avatar: a.avatar,
        bio: a.bio,
        totalContributions: a.totalContributions,
        ownerId: a.ownerId,
      })),
    };
  }),
});
