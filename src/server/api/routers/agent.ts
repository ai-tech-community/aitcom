import { z } from "zod";
import { eq, and, desc, ilike, sql, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { Where } from "payload";

import {
  createTRPCRouter,
  agentProcedure,
  requireScope,
  requireOwner,
} from "@/server/api/trpc";
import {
  agentProfiles,
  agentDrafts,
  agentSuggestions,
  agentSessionLogs,
  memberProfiles,
  activityEvents,
  conversations,
  conversationParticipants,
  messages,
  challengeEnrollments,
  challengeProgress,
  challengeTestResults,
  challengeChannels,
  challengeThreads,
  challengeReplies,
  communities,
  communityMemberships,
} from "@/server/db/schema";
import { getPayloadClient } from "@/server/payload";
import {
  logActivity,
  checkEnrollmentCompletion,
} from "@/server/agent/activity";
import { plainTextToLexical } from "@/server/challenge-engine/lexical";
import { agentFeedRouter } from "./agent-feed";
import { agentCommunityRouter } from "./agent-communities";

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Extract a plain-text snippet from a Payload rich-text (Lexical) field.
 * Falls back to the raw value if the structure is unexpected.
 */
function richTextSnippet(field: unknown, maxLen = 200): string {
  if (!field || typeof field !== "object") return "";
  const root = (field as Record<string, unknown>).root as
    | { children?: { text?: string; children?: unknown[] }[] }
    | undefined;
  if (!root?.children) return "";

  const texts: string[] = [];
  function walk(nodes: unknown[]) {
    for (const node of nodes) {
      if (typeof node !== "object" || node === null) continue;
      const n = node as Record<string, unknown>;
      if (typeof n.text === "string") texts.push(n.text);
      if (Array.isArray(n.children)) walk(n.children);
    }
  }
  walk(root.children as unknown[]);
  const joined = texts.join(" ").trim();
  return joined.length > maxLen ? joined.slice(0, maxLen) + "..." : joined;
}

function getMetadataString(
  meta: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = meta[key];
  return typeof value === "string" ? value : undefined;
}

// ── Router ─────────────────────────────────────────────────────────────────────

export const agentRouter = createTRPCRouter({
  // ═══════════════════════════════════════════════════════════════════════════
  // READ TOOLS (scope: "read")
  // ═══════════════════════════════════════════════════════════════════════════

  browseThreads: agentProcedure
    .input(
      z.object({
        category: z
          .enum(["all", "general", "question", "showcase", "job"])
          .default("all"),
        limit: z.number().min(1).max(50).default(20),
        communitySlug: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");

      const payload = await getPayloadClient();

      // Resolve community if scoped
      let communityId: string | undefined;
      if (input.communitySlug) {
        const community = await ctx.db.query.communities.findFirst({
          where: and(
            eq(communities.slug, input.communitySlug),
            isNull(communities.deletedAt),
          ),
        });
        if (!community) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Community not found",
          });
        }
        communityId = community.id;
      }

      const conditions: Where[] = [];
      if (input.category !== "all") {
        conditions.push({ category: { equals: input.category } });
      }
      if (communityId) {
        conditions.push({ communityId: { equals: communityId } });
      }

      const where: Where | undefined =
        conditions.length > 0 ? { and: conditions } : undefined;

      const { docs } = await payload.find({
        collection: "forum-threads",
        where,
        sort: "-lastActivityAt",
        limit: input.limit,
        depth: 0,
      });

      return docs.map((t) => ({
        id: t.id,
        title: t.title,
        category: t.category,
        authorName: t.authorName ?? null,
        authorId: t.authorId ?? null,
        replyCount: t.replyCount ?? 0,
        isPinned: t.isPinned ?? false,
        isLocked: t.isLocked ?? false,
        lastActivityAt: t.lastActivityAt ?? null,
        createdAt: t.createdAt,
      }));
    }),

  readThread: agentProcedure
    .input(z.object({ threadId: z.number() }))
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");

      const payload = await getPayloadClient();

      let thread;
      try {
        thread = await payload.findByID({
          collection: "forum-threads",
          id: input.threadId,
          depth: 0,
        });
      } catch {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Thread not found",
        });
      }

      if (!thread) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Thread not found",
        });
      }

      const { docs: replies } = await payload.find({
        collection: "forum-replies",
        where: { thread: { equals: input.threadId } },
        sort: "createdAt",
        limit: 100,
        depth: 0,
      });

      return {
        thread: {
          id: thread.id,
          title: thread.title,
          content: thread.content,
          category: thread.category,
          authorName: thread.authorName ?? null,
          authorId: thread.authorId ?? null,
          authorType: "member" as const,
          isOwnReply: thread.authorId === ctx.agent.agentId,
          isPinned: thread.isPinned ?? false,
          isLocked: thread.isLocked ?? false,
          createdAt: thread.createdAt,
        },
        replies: replies.map((r) => ({
          id: r.id,
          content: r.content,
          authorName: r.authorName ?? null,
          authorId: r.authorId ?? null,
          authorType:
            ((r as unknown as Record<string, unknown>).authorType as string) ??
            "member",
          isOwnReply: r.authorId === ctx.agent.agentId,
          createdAt: r.createdAt,
        })),
      };
    }),

  browseEvents: agentProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(20).default(10),
        communitySlug: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");

      const payload = await getPayloadClient();
      const now = new Date().toISOString();

      // Resolve community if scoped
      let communityId: string | undefined;
      if (input.communitySlug) {
        const community = await ctx.db.query.communities.findFirst({
          where: and(
            eq(communities.slug, input.communitySlug),
            isNull(communities.deletedAt),
          ),
        });
        if (!community) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Community not found",
          });
        }
        communityId = community.id;
      }

      const conditions: Where[] = [
        { status: { equals: "published" } },
        { date: { greater_than_equal: now } },
      ];
      if (communityId) {
        conditions.push({ communityId: { equals: communityId } });
      }

      const { docs } = await payload.find({
        collection: "events",
        where: {
          and: conditions,
        },
        sort: "date",
        limit: input.limit,
        locale: "en",
        draft: false,
        depth: 0,
      });

      return docs.map((e) => ({
        id: e.id,
        title: e.title,
        type: e.type,
        date: e.date,
        startTime: e.startTime ?? null,
        endTime: e.endTime ?? null,
        location: e.location,
        maxAttendees: e.maxAttendees ?? null,
        descriptionEn: richTextSnippet(e.description, 500),
      }));
    }),

  browseMembers: agentProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
        search: z.string().optional(),
        communitySlug: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");

      if (input.communitySlug) {
        const community = await ctx.db.query.communities.findFirst({
          where: and(
            eq(communities.slug, input.communitySlug),
            isNull(communities.deletedAt),
          ),
        });
        if (!community)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Community not found",
          });

        const members = await ctx.db
          .select({
            userId: communityMemberships.userId,
            role: communityMemberships.role,
            joinedAt: communityMemberships.joinedAt,
            displayName: memberProfiles.displayName,
            bio: memberProfiles.bio,
            xp: memberProfiles.xp,
            level: memberProfiles.level,
          })
          .from(communityMemberships)
          .leftJoin(
            memberProfiles,
            eq(communityMemberships.userId, memberProfiles.userId),
          )
          .where(
            and(
              eq(communityMemberships.communityId, community.id),
              eq(communityMemberships.status, "active"),
            ),
          )
          .orderBy(desc(communityMemberships.joinedAt))
          .limit(input.limit);

        return members.map((m) => ({
          userId: m.userId,
          displayName: m.displayName ?? null,
          bio: m.bio ?? null,
          skills: null,
          company: null,
          xp: m.xp ?? 0,
          level: m.level ?? 1,
          role: m.role,
        }));
      }

      // Original global logic unchanged below
      const conditions = [eq(memberProfiles.isPublic, true)];

      if (input.search) {
        conditions.push(ilike(memberProfiles.displayName, `%${input.search}%`));
      }

      const profiles = await ctx.db
        .select()
        .from(memberProfiles)
        .where(and(...conditions))
        .orderBy(sql`${memberProfiles.xp} DESC`)
        .limit(input.limit);

      return profiles.map((p) => ({
        userId: p.userId,
        displayName: p.displayName,
        bio: p.bio ?? null,
        skills: p.skills,
        company: p.company ?? null,
        xp: p.xp,
        level: p.level,
      }));
    }),

  searchKnowledge: agentProcedure
    .input(
      z.object({
        query: z.string().min(1).max(200),
        type: z.enum(["threads", "articles", "ideas", "all"]).default("all"),
        limit: z.number().min(1).max(20).default(10),
        communitySlug: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");

      const payload = await getPayloadClient();

      // Resolve community if scoped
      let communityId: string | undefined;
      if (input.communitySlug) {
        const community = await ctx.db.query.communities.findFirst({
          where: and(
            eq(communities.slug, input.communitySlug),
            isNull(communities.deletedAt),
          ),
        });
        if (!community) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Community not found",
          });
        }
        communityId = community.id;
      }

      const results: {
        type: string;
        id: number;
        title: string;
        snippet: string;
        createdAt: string;
      }[] = [];

      const perType =
        input.type === "all" ? Math.ceil(input.limit / 3) : input.limit;

      // Search threads
      if (input.type === "all" || input.type === "threads") {
        const threadWhere: Where = {
          or: [
            { title: { contains: input.query } },
            { content: { contains: input.query } },
          ],
        };
        const threadConditions: Where[] = [threadWhere];
        if (communityId) {
          threadConditions.push({ communityId: { equals: communityId } });
        }
        const { docs } = await payload.find({
          collection: "forum-threads",
          where: communityId ? { and: threadConditions } : threadWhere,
          limit: perType,
          sort: "-createdAt",
          depth: 0,
        });
        for (const d of docs) {
          results.push({
            type: "thread",
            id: d.id,
            title: d.title,
            snippet:
              typeof d.content === "string"
                ? (d.content as string).slice(0, 200)
                : d.title,
            createdAt: d.createdAt,
          });
        }
      }

      // Search articles
      if (input.type === "all" || input.type === "articles") {
        const articleWhere: Where = {
          and: [
            { status: { equals: "published" } },
            { title: { contains: input.query } },
          ],
        };
        const articleConditions: Where[] = [articleWhere];
        if (communityId) {
          articleConditions.push({ communityId: { equals: communityId } });
        }
        const { docs } = await payload.find({
          collection: "articles",
          where: communityId ? { and: articleConditions } : articleWhere,
          limit: perType,
          sort: "-createdAt",
          locale: "en",
          draft: false,
          depth: 0,
        });
        for (const d of docs) {
          results.push({
            type: "article",
            id: d.id,
            title: d.title,
            snippet: richTextSnippet(d.content, 200),
            createdAt: d.createdAt,
          });
        }
      }

      // Search ideas
      if (input.type === "all" || input.type === "ideas") {
        const ideaWhere: Where = {
          or: [
            { title: { contains: input.query } },
            { description: { contains: input.query } },
          ],
        };
        const ideaConditions: Where[] = [ideaWhere];
        if (communityId) {
          ideaConditions.push({ communityId: { equals: communityId } });
        }
        const { docs } = await payload.find({
          collection: "community-ideas",
          where: communityId ? { and: ideaConditions } : ideaWhere,
          limit: perType,
          sort: "-createdAt",
          depth: 0,
        });
        for (const d of docs) {
          results.push({
            type: "idea",
            id: d.id,
            title: d.title,
            snippet: (d.description ?? "").slice(0, 200),
            createdAt: d.createdAt,
          });
        }
      }

      // Sort combined results by createdAt desc and trim to limit
      results.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

      return results.slice(0, input.limit);
    }),

  myProfile: agentProcedure.query(async ({ ctx }) => {
    requireScope(ctx.agent.scopes, "read");
    const ownerId = requireOwner(ctx.agent.ownerId);

    const [agent] = await ctx.db
      .select()
      .from(agentProfiles)
      .where(eq(agentProfiles.id, ctx.agent.agentId))
      .limit(1);

    const [owner] = await ctx.db
      .select()
      .from(memberProfiles)
      .where(eq(memberProfiles.userId, ownerId))
      .limit(1);

    return {
      agent: agent ?? null,
      owner: owner ?? null,
    };
  }),

  getNotifications: agentProcedure
    .input(
      z.object({
        since: z.string().optional(), // ISO-8601 timestamp
        limit: z.number().min(1).max(50).default(25),
      }),
    )
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");
      const ownerId = requireOwner(ctx.agent.ownerId);

      // Get agent profile for expertise tags and lastActiveAt cursor
      const [agent] = await ctx.db
        .select()
        .from(agentProfiles)
        .where(eq(agentProfiles.id, ctx.agent.agentId))
        .limit(1);

      if (!agent) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Agent profile not found",
        });
      }

      const sinceDate = input.since
        ? new Date(input.since)
        : (agent.lastActiveAt ?? new Date(Date.now() - 24 * 60 * 60 * 1000)); // default: last 24h

      const expertiseTags = agent.expertiseTags ?? [];

      // Query activity events since the cursor
      const events = await ctx.db
        .select()
        .from(activityEvents)
        .where(
          and(
            sql`${activityEvents.createdAt} > ${sinceDate}`,
            // Exclude this agent's own actions
            sql`NOT (${activityEvents.actorId} = ${ctx.agent.agentId} AND ${activityEvents.actorType} = 'agent')`,
            // Exclude private events not meant for this agent's owner
            sql`(${activityEvents.recipientId} IS NULL OR ${activityEvents.recipientId} = ${ownerId})`,
          ),
        )
        .orderBy(desc(activityEvents.createdAt))
        .limit(input.limit * 2); // over-fetch, then filter for relevance

      // Build notifications with relevance filtering
      const notifications: {
        id: string;
        type: string;
        title: string;
        targetType: string | null;
        targetId: string | null;
        actorType: string;
        relevance: string;
        createdAt: string;
      }[] = [];

      for (const event of events) {
        const meta = event.metadata ?? {};
        const metaTitle = getMetadataString(meta, "title");
        const metaCategory = getMetadataString(meta, "category");
        const metaAgentName = getMetadataString(meta, "agentName");
        let type: string | null = null;
        let title = "";
        let relevance = "";

        switch (event.action) {
          case "thread.created": {
            type = "new_thread";
            title = `New thread: ${metaTitle ?? "Untitled"}`;
            if (expertiseTags.length > 0 && metaCategory) {
              const match = expertiseTags.find((t) =>
                metaCategory.toLowerCase().includes(t.toLowerCase()),
              );
              if (match) {
                relevance = `Matches expertise: ${match}`;
              }
            }
            if (!relevance) relevance = "New community thread";
            break;
          }
          case "thread.reply": {
            type = "thread_reply";
            title = `New reply in thread ${event.targetId ?? ""}`;
            relevance = metaAgentName
              ? `Reply by ${metaAgentName}`
              : "New reply in thread";
            break;
          }
          case "challenge.objective_completed": {
            if (event.actorId === ownerId) {
              type = "challenge_update";
              title = `Challenge progress: ${metaTitle ?? ""}`;
              relevance = "Owner completed a challenge objective";
            }
            break;
          }
          case "challenge.completed": {
            if (event.actorId === ownerId) {
              type = "challenge_update";
              title = `Challenge completed: ${metaTitle ?? ""}`;
              relevance = "Owner completed a challenge";
            }
            break;
          }
          case "idea.created": {
            type = "idea_posted";
            title = `New idea: ${metaTitle ?? "Untitled"}`;
            relevance = "New community idea";
            break;
          }
          default:
            continue;
        }

        if (type) {
          notifications.push({
            id: event.id,
            type,
            title,
            targetType: event.targetType,
            targetId: event.targetId,
            actorType: event.actorType,
            relevance,
            createdAt: event.createdAt.toISOString(),
          });
        }

        if (notifications.length >= input.limit) break;
      }

      // Also check for unread inbox messages
      const [agentConv] = await ctx.db
        .select({ id: conversations.id })
        .from(conversations)
        .innerJoin(
          conversationParticipants,
          eq(conversationParticipants.conversationId, conversations.id),
        )
        .where(
          and(
            eq(conversations.type, "agent"),
            eq(conversationParticipants.userId, ownerId),
          ),
        )
        .limit(1);

      if (agentConv) {
        const inboxMessages = await ctx.db
          .select({
            id: messages.id,
            content: messages.content,
            createdAt: messages.createdAt,
          })
          .from(messages)
          .where(
            and(
              eq(messages.conversationId, agentConv.id),
              eq(messages.senderType, "human"),
              sql`${messages.createdAt} > ${sinceDate}`,
            ),
          )
          .orderBy(desc(messages.createdAt))
          .limit(5);

        for (const msg of inboxMessages) {
          notifications.push({
            id: msg.id,
            type: "inbox_message",
            title: `Owner message: ${msg.content.slice(0, 80)}${msg.content.length > 80 ? "..." : ""}`,
            targetType: "inbox",
            targetId: agentConv.id,
            actorType: "member",
            relevance: "Direct message from owner",
            createdAt: msg.createdAt.toISOString(),
          });
        }
      }

      // Sort by createdAt desc and trim to limit
      notifications.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

      return notifications.slice(0, input.limit);
    }),

  getBriefing: agentProcedure
    .input(
      z.object({
        since: z.string().optional(), // ISO-8601 timestamp
      }),
    )
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");
      const ownerId = requireOwner(ctx.agent.ownerId);

      const [agent] = await ctx.db
        .select()
        .from(agentProfiles)
        .where(eq(agentProfiles.id, ctx.agent.agentId))
        .limit(1);

      if (!agent) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Agent profile not found",
        });
      }

      const sinceDate = input.since
        ? new Date(input.since)
        : (agent.lastActiveAt ?? new Date(Date.now() - 24 * 60 * 60 * 1000));

      const now = new Date();

      // Count activity events since cursor
      const [eventCount] = await ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(activityEvents)
        .where(
          and(
            sql`${activityEvents.createdAt} > ${sinceDate}`,
            sql`NOT (${activityEvents.actorId} = ${ctx.agent.agentId} AND ${activityEvents.actorType} = 'agent')`,
          ),
        );

      // Count unread inbox messages
      let unreadInbox = 0;
      const [agentConv] = await ctx.db
        .select({ id: conversations.id })
        .from(conversations)
        .innerJoin(
          conversationParticipants,
          eq(conversationParticipants.conversationId, conversations.id),
        )
        .where(
          and(
            eq(conversations.type, "agent"),
            eq(conversationParticipants.userId, ownerId),
          ),
        )
        .limit(1);

      if (agentConv) {
        const [inboxCount] = await ctx.db
          .select({ count: sql<number>`count(*)::int` })
          .from(messages)
          .where(
            and(
              eq(messages.conversationId, agentConv.id),
              eq(messages.senderType, "human"),
              sql`${messages.createdAt} > ${sinceDate}`,
            ),
          );
        unreadInbox = inboxCount?.count ?? 0;
      }

      // Count pending drafts
      const [draftCount] = await ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(agentDrafts)
        .where(
          and(
            eq(agentDrafts.agentId, ctx.agent.agentId),
            eq(agentDrafts.status, "pending"),
          ),
        );

      // Fetch owner's active challenge enrollments with progress
      const activeEnrollments = await ctx.db
        .select({
          id: challengeEnrollments.id,
          challengeId: challengeEnrollments.challengeId,
          status: challengeEnrollments.status,
        })
        .from(challengeEnrollments)
        .where(
          and(
            eq(challengeEnrollments.userId, ownerId),
            sql`${challengeEnrollments.status} IN ('active', 'submitted')`,
          ),
        );

      const activeChallenges = activeEnrollments.length;

      // Get progress summary per enrollment
      let challengeDetails: {
        challengeId: number;
        title: string;
        status: string;
        completedObjectives: number;
        totalObjectives: number;
      }[] = [];

      if (activeEnrollments.length > 0) {
        const payload = await getPayloadClient();
        challengeDetails = await Promise.all(
          activeEnrollments.map(async (enrollment) => {
            const [progressSummary] = await ctx.db
              .select({
                completed: sql<number>`count(*) filter (where ${challengeProgress.completedAt} is not null)`,
                total: sql<number>`count(*)`,
              })
              .from(challengeProgress)
              .where(eq(challengeProgress.enrollmentId, enrollment.id));

            let title = `Challenge #${enrollment.challengeId}`;
            try {
              const challenge = await payload.findByID({
                collection: "challenges",
                id: enrollment.challengeId,
                depth: 0,
              });
              title = challenge.title;
            } catch {
              // Use fallback title
            }

            return {
              challengeId: enrollment.challengeId,
              title,
              status: enrollment.status,
              completedObjectives: progressSummary?.completed ?? 0,
              totalObjectives: progressSummary?.total ?? 0,
            };
          }),
        );
      }

      // Count pending peer reviews (submissions awaiting review by this user)
      const [pendingReviewCount] = await ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(challengeProgress)
        .innerJoin(
          challengeEnrollments,
          eq(challengeProgress.enrollmentId, challengeEnrollments.id),
        )
        .where(
          and(
            eq(challengeProgress.verificationMode, "peer-review"),
            sql`${challengeProgress.completedAt} IS NULL`,
            sql`${challengeEnrollments.submittedAt} IS NOT NULL`,
          ),
        );

      const pendingReviews = pendingReviewCount?.count ?? 0;

      // Count new channel activity since last check
      let newChannelActivity = 0;
      if (activeEnrollments.length > 0) {
        const enrollmentChallengeIds = activeEnrollments.map(
          (e) => e.challengeId,
        );
        const [channelActivity] = await ctx.db
          .select({ count: sql<number>`count(*)::int` })
          .from(challengeReplies)
          .innerJoin(
            challengeThreads,
            eq(challengeReplies.threadId, challengeThreads.id),
          )
          .innerJoin(
            challengeChannels,
            eq(challengeThreads.channelId, challengeChannels.id),
          )
          .where(
            and(
              sql`${challengeChannels.challengeId} IN (${sql.join(
                enrollmentChallengeIds.map((id) => sql`${id}`),
                sql`, `,
              )})`,
              sql`${challengeReplies.createdAt} > ${sinceDate}`,
            ),
          );
        newChannelActivity = channelActivity?.count ?? 0;
      }

      const notifications = eventCount?.count ?? 0;
      const pendingDrafts = draftCount?.count ?? 0;

      // Build human-readable summary
      const parts: string[] = [];
      if (notifications > 0)
        parts.push(
          `${notifications} new activity event${notifications !== 1 ? "s" : ""}`,
        );
      if (unreadInbox > 0)
        parts.push(
          `${unreadInbox} unread inbox message${unreadInbox !== 1 ? "s" : ""}`,
        );
      if (pendingDrafts > 0)
        parts.push(
          `${pendingDrafts} draft${pendingDrafts !== 1 ? "s" : ""} awaiting owner approval`,
        );
      if (activeChallenges > 0)
        parts.push(
          `${activeChallenges} active challenge${activeChallenges !== 1 ? "s" : ""}`,
        );
      if (pendingReviews > 0)
        parts.push(
          `${pendingReviews} submission${pendingReviews !== 1 ? "s" : ""} awaiting peer review`,
        );
      if (newChannelActivity > 0)
        parts.push(
          `${newChannelActivity} new channel message${newChannelActivity !== 1 ? "s" : ""}`,
        );

      const summary =
        parts.length > 0 ? parts.join(", ") : "Nothing new since last check";

      return {
        summary,
        notifications,
        unreadInbox,
        pendingDrafts,
        activeChallenges,
        challengeDetails,
        pendingReviews,
        newChannelActivity,
        lastCheckedAt: now.toISOString(),
      };
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTRIBUTION TOOLS (scope: "contribute")
  // ═══════════════════════════════════════════════════════════════════════════

  replyToThread: agentProcedure
    .input(
      z.object({
        threadId: z.number(),
        content: z.string().min(1).max(5000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");
      const ownerId = requireOwner(ctx.agent.ownerId);
      const payload = await getPayloadClient();

      // Fetch agent profile
      const [agent] = await ctx.db
        .select()
        .from(agentProfiles)
        .where(eq(agentProfiles.id, ctx.agent.agentId))
        .limit(1);

      if (!agent) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Agent profile not found",
        });
      }

      // Check thread exists and is not locked
      let thread;
      try {
        thread = await payload.findByID({
          collection: "forum-threads",
          id: input.threadId,
          depth: 0,
        });
      } catch {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Thread not found",
        });
      }

      if (!thread) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Thread not found",
        });
      }

      if (thread.isLocked) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Thread is locked",
        });
      }

      // ── Self-loop prevention ──────────────────────────────────────────
      const cooldownMinutes = agent.replyCooldownMinutes ?? 30;

      // Fetch the last reply on this thread
      const { docs: lastReplies } = await payload.find({
        collection: "forum-replies",
        where: { thread: { equals: input.threadId } },
        sort: "-createdAt",
        limit: 1,
        depth: 0,
      });

      const lastReply = lastReplies[0];

      // Block: agent is the last replier (self-reply)
      if (lastReply?.authorId === agent.id) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message:
            "You already posted the most recent reply on this thread. Wait for others to respond.",
        });
      }

      // Block: agent replied to this thread within cooldown window
      const cooldownCutoff = new Date(
        Date.now() - cooldownMinutes * 60 * 1000,
      ).toISOString();
      const { docs: recentOwnReplies } = await payload.find({
        collection: "forum-replies",
        where: {
          and: [
            { thread: { equals: input.threadId } },
            { authorId: { equals: agent.id } },
            { createdAt: { greater_than: cooldownCutoff } },
          ],
        },
        limit: 1,
        depth: 0,
      });

      if (recentOwnReplies.length > 0) {
        const nextAllowed = new Date(
          new Date(recentOwnReplies[0]!.createdAt).getTime() +
            cooldownMinutes * 60 * 1000,
        );
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Cooldown active. You can reply to this thread again after ${nextAllowed.toISOString()}.`,
        });
      }

      // Ghost mode: save as draft
      if (agent.visibilityMode === "ghost") {
        const [draft] = await ctx.db
          .insert(agentDrafts)
          .values({
            agentId: agent.id,
            ownerId,
            type: "thread_reply",
            targetType: "forum-threads",
            targetId: String(input.threadId),
            content: input.content,
          })
          .returning();

        return { mode: "draft" as const, draftId: draft!.id };
      }

      // Visible mode: post directly
      await payload.create({
        collection: "forum-replies",
        data: {
          thread: input.threadId,
          content: plainTextToLexical(input.content),
          authorId: agent.id,
          authorName: `${agent.name} (AI)`,
          authorType: "agent",
        },
      });

      // Update thread replyCount and lastActivityAt
      await payload.update({
        collection: "forum-threads",
        id: input.threadId,
        data: {
          replyCount: (thread.replyCount ?? 0) + 1,
          lastActivityAt: new Date().toISOString(),
        },
      });

      // Increment agent's totalContributions
      await ctx.db
        .update(agentProfiles)
        .set({
          totalContributions: (agent.totalContributions ?? 0) + 1,
        })
        .where(eq(agentProfiles.id, agent.id));

      // Log activity event
      await logActivity(ctx.db, {
        actorId: agent.id,
        actorType: "agent",
        action: "thread.reply",
        targetType: "forum-threads",
        targetId: String(input.threadId),
        metadata: { agentName: agent.name },
        collabSessionId: String(input.threadId),
      });

      return { mode: "visible" as const, posted: true };
    }),

  shareKnowledge: agentProcedure
    .input(
      z.object({
        threadId: z.number(),
        content: z.string().min(1).max(5000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");
      const ownerId = requireOwner(ctx.agent.ownerId);

      const payload = await getPayloadClient();

      // Fetch agent profile
      const [agent] = await ctx.db
        .select()
        .from(agentProfiles)
        .where(eq(agentProfiles.id, ctx.agent.agentId))
        .limit(1);

      if (!agent) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Agent profile not found",
        });
      }

      // Check thread exists and is not locked
      let thread;
      try {
        thread = await payload.findByID({
          collection: "forum-threads",
          id: input.threadId,
          depth: 0,
        });
      } catch {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Thread not found",
        });
      }

      if (!thread) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Thread not found",
        });
      }

      if (thread.isLocked) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Thread is locked",
        });
      }

      // ── Self-loop prevention ──────────────────────────────────────────
      const cooldownMinutes = agent.replyCooldownMinutes ?? 30;

      // Fetch the last reply on this thread
      const { docs: lastReplies } = await payload.find({
        collection: "forum-replies",
        where: { thread: { equals: input.threadId } },
        sort: "-createdAt",
        limit: 1,
        depth: 0,
      });

      const lastReply = lastReplies[0];

      // Block: agent is the last replier (self-reply)
      if (lastReply?.authorId === agent.id) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message:
            "You already posted the most recent reply on this thread. Wait for others to respond.",
        });
      }

      // Block: agent replied to this thread within cooldown window
      const cooldownCutoff = new Date(
        Date.now() - cooldownMinutes * 60 * 1000,
      ).toISOString();
      const { docs: recentOwnReplies } = await payload.find({
        collection: "forum-replies",
        where: {
          and: [
            { thread: { equals: input.threadId } },
            { authorId: { equals: agent.id } },
            { createdAt: { greater_than: cooldownCutoff } },
          ],
        },
        limit: 1,
        depth: 0,
      });

      if (recentOwnReplies.length > 0) {
        const nextAllowed = new Date(
          new Date(recentOwnReplies[0]!.createdAt).getTime() +
            cooldownMinutes * 60 * 1000,
        );
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Cooldown active. You can reply to this thread again after ${nextAllowed.toISOString()}.`,
        });
      }

      // Ghost mode: save as draft with knowledge_share type
      if (agent.visibilityMode === "ghost") {
        const [draft] = await ctx.db
          .insert(agentDrafts)
          .values({
            agentId: agent.id,
            ownerId,
            type: "knowledge_share",
            targetType: "forum-threads",
            targetId: String(input.threadId),
            content: input.content,
          })
          .returning();

        return { mode: "draft" as const, draftId: draft!.id };
      }

      // Visible mode: post with knowledge header
      const knowledgeContent = `**Knowledge Share**\n\n${input.content}`;

      await payload.create({
        collection: "forum-replies",
        data: {
          thread: input.threadId,
          content: plainTextToLexical(knowledgeContent),
          authorId: agent.id,
          authorName: `${agent.name} (AI)`,
          authorType: "agent",
        },
      });

      // Update thread replyCount and lastActivityAt
      await payload.update({
        collection: "forum-threads",
        id: input.threadId,
        data: {
          replyCount: (thread.replyCount ?? 0) + 1,
          lastActivityAt: new Date().toISOString(),
        },
      });

      // Increment agent's totalContributions
      await ctx.db
        .update(agentProfiles)
        .set({
          totalContributions: (agent.totalContributions ?? 0) + 1,
        })
        .where(eq(agentProfiles.id, agent.id));

      // Log activity event
      await logActivity(ctx.db, {
        actorId: agent.id,
        actorType: "agent",
        action: "knowledge.share",
        targetType: "forum-threads",
        targetId: String(input.threadId),
        metadata: { agentName: agent.name },
        collabSessionId: String(input.threadId),
      });

      return { mode: "visible" as const, posted: true };
    }),

  suggestTopic: agentProcedure
    .input(
      z.object({
        title: z.string().min(1).max(300),
        description: z.string().max(2000).optional(),
        category: z
          .enum(["general", "question", "showcase"])
          .default("general"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");
      const ownerId = requireOwner(ctx.agent.ownerId);

      const [suggestion] = await ctx.db
        .insert(agentSuggestions)
        .values({
          agentId: ctx.agent.agentId,
          ownerId,
          type: "topic_suggestion",
          title: input.title,
          content: input.description,
          metadata: { category: input.category },
        })
        .returning();

      await logActivity(ctx.db, {
        actorId: ctx.agent.agentId,
        actorType: "agent",
        action: "agent.suggest_topic",
        targetType: "agent_suggestion",
        targetId: suggestion!.id,
        metadata: { title: input.title },
      });

      return { suggestionId: suggestion!.id };
    }),

  suggestEventInterest: agentProcedure
    .input(
      z.object({
        eventId: z.number(),
        reason: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");
      const ownerId = requireOwner(ctx.agent.ownerId);

      const [suggestion] = await ctx.db
        .insert(agentSuggestions)
        .values({
          agentId: ctx.agent.agentId,
          ownerId,
          type: "event_interest",
          content: input.reason,
          metadata: { eventId: input.eventId },
        })
        .returning();

      return { suggestionId: suggestion!.id };
    }),

  voteIdea: agentProcedure
    .input(z.object({ ideaId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");
      const ownerId = requireOwner(ctx.agent.ownerId);

      const payload = await getPayloadClient();

      // Check if the owner has already voted
      const { docs: existingVotes } = await payload.find({
        collection: "idea-votes",
        where: {
          and: [
            { idea: { equals: input.ideaId } },
            { voterId: { equals: ownerId } },
          ],
        },
        limit: 1,
        depth: 0,
      });

      if (existingVotes.length > 0) {
        return {
          voted: false,
          message: "Owner has already voted on this idea",
        };
      }

      // Fetch the idea to get current vote count
      let idea;
      try {
        idea = await payload.findByID({
          collection: "community-ideas",
          id: input.ideaId,
          depth: 0,
        });
      } catch {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Idea not found",
        });
      }

      // Create vote on behalf of the owner
      await payload.create({
        collection: "idea-votes",
        data: {
          idea: input.ideaId,
          voterId: ownerId,
        },
      });

      // Increment vote count
      await payload.update({
        collection: "community-ideas",
        id: input.ideaId,
        data: { voteCount: (idea.voteCount ?? 0) + 1 },
      });

      return { voted: true };
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // SELF-PROFILE TOOLS (scope: "self-profile")
  // ═══════════════════════════════════════════════════════════════════════════

  updateOwnProfile: agentProcedure
    .input(
      z.object({
        bio: z.string().max(2000).optional(),
        expertiseTags: z.array(z.string().max(50)).max(20).optional(),
        description: z.string().max(5000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "self-profile");

      // Ensure at least one field is provided
      if (
        input.bio === undefined &&
        input.expertiseTags === undefined &&
        input.description === undefined
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "At least one field must be provided",
        });
      }

      const [updated] = await ctx.db
        .update(agentProfiles)
        .set({
          ...(input.bio !== undefined && { bio: input.bio }),
          ...(input.expertiseTags !== undefined && {
            expertiseTags: input.expertiseTags,
          }),
          ...(input.description !== undefined && {
            description: input.description,
          }),
        })
        .where(eq(agentProfiles.id, ctx.agent.agentId))
        .returning();

      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Agent profile not found",
        });
      }

      // Log activity event
      await logActivity(ctx.db, {
        actorId: ctx.agent.agentId,
        actorType: "agent",
        action: "agent.profile_updated",
        targetType: "agent_profile",
        targetId: ctx.agent.agentId,
        metadata: {
          fields: Object.keys(input).filter(
            (k) => input[k as keyof typeof input] !== undefined,
          ),
        },
      });

      return updated;
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // CHALLENGE TOOLS – READ (scope: "read")
  // ═══════════════════════════════════════════════════════════════════════════

  browseChallenges: agentProcedure
    .input(
      z.object({
        difficulty: z
          .enum(["beginner", "intermediate", "advanced", "expert"])
          .optional(),
        type: z.enum(["weekly", "monthly", "open-ended"]).optional(),
        limit: z.number().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");
      const payload = await getPayloadClient();
      const where: Where = {
        status: { equals: "active" },
      };
      if (input.difficulty) where.difficulty = { equals: input.difficulty };
      if (input.type) where.type = { equals: input.type };
      const { docs } = await payload.find({
        collection: "challenges",
        where,
        sort: "-createdAt",
        limit: input.limit,
        depth: 0,
      });
      return docs.map((c) => ({
        id: c.id,
        title: c.title,
        slug: c.slug,
        type: c.type,
        difficulty: c.difficulty,
        tags: c.tags,
        repo: c.repo,
        collaborationModel: c.collaborationModel,
        generatedBy: c.generatedBy,
        startsAt: c.startsAt,
        endsAt: c.endsAt,
      }));
    }),

  getChallengeDetails: agentProcedure
    .input(z.object({ challengeId: z.number() }))
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");
      const ownerId = requireOwner(ctx.agent.ownerId);
      const payload = await getPayloadClient();
      const challenge = await payload.findByID({
        collection: "challenges",
        id: input.challengeId,
        depth: 0,
      });
      const [enrollment] = await ctx.db
        .select()
        .from(challengeEnrollments)
        .where(
          and(
            eq(challengeEnrollments.challengeId, input.challengeId),
            eq(challengeEnrollments.userId, ownerId),
          ),
        )
        .limit(1);
      return { challenge, enrollment: enrollment ?? null };
    }),

  getMyChallengeProgress: agentProcedure
    .input(z.object({ challengeId: z.number() }))
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");
      const ownerId = requireOwner(ctx.agent.ownerId);
      const [enrollment] = await ctx.db
        .select()
        .from(challengeEnrollments)
        .where(
          and(
            eq(challengeEnrollments.challengeId, input.challengeId),
            eq(challengeEnrollments.userId, ownerId),
          ),
        )
        .limit(1);
      if (!enrollment) return null;
      const progress = await ctx.db
        .select()
        .from(challengeProgress)
        .where(eq(challengeProgress.enrollmentId, enrollment.id));
      return { enrollment, progress };
    }),

  browseChallengeChannel: agentProcedure
    .input(
      z.object({
        challengeId: z.number(),
        type: z
          .enum([
            "announcement",
            "discussion",
            "question",
            "progress-log",
            "solution",
          ])
          .optional(),
        limit: z.number().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");
      const [channel] = await ctx.db
        .select()
        .from(challengeChannels)
        .where(eq(challengeChannels.challengeId, input.challengeId))
        .limit(1);
      if (!channel) return { threads: [] };
      const conditions = [eq(challengeThreads.channelId, channel.id)];
      if (input.type) conditions.push(eq(challengeThreads.type, input.type));
      const threads = await ctx.db
        .select({
          id: challengeThreads.id,
          type: challengeThreads.type,
          authorType: challengeThreads.authorType,
          title: challengeThreads.title,
          content: challengeThreads.content,
          isPinned: challengeThreads.isPinned,
          createdAt: challengeThreads.createdAt,
          authorName: memberProfiles.displayName,
        })
        .from(challengeThreads)
        .leftJoin(
          memberProfiles,
          eq(challengeThreads.authorId, memberProfiles.userId),
        )
        .where(and(...conditions))
        .orderBy(
          desc(challengeThreads.isPinned),
          desc(challengeThreads.createdAt),
        )
        .limit(input.limit);
      return { threads };
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // CHALLENGE TOOLS – CONTRIBUTE (scope: "contribute")
  // ═══════════════════════════════════════════════════════════════════════════

  enrollInChallenge: agentProcedure
    .input(z.object({ challengeId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");
      const ownerId = requireOwner(ctx.agent.ownerId);
      const payload = await getPayloadClient();
      const challenge = await payload.findByID({
        collection: "challenges",
        id: input.challengeId,
        depth: 0,
      });
      if (challenge.status !== "active") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Challenge is not active",
        });
      }
      const [enrollment] = await ctx.db
        .insert(challengeEnrollments)
        .values({
          challengeId: input.challengeId,
          userId: ownerId,
          status: "active",
        })
        .onConflictDoNothing()
        .returning();
      if (!enrollment) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Already enrolled",
        });
      }
      const objectives = Array.isArray(challenge.objectives)
        ? challenge.objectives
        : [];
      if (objectives.length > 0) {
        await ctx.db.insert(challengeProgress).values(
          objectives.map((obj: { verification?: string }, i: number) => ({
            enrollmentId: enrollment.id,
            objectiveIndex: i,
            currentCount: 0,
            verificationMode: (obj.verification ?? "self-report") as
              | "platform-action"
              | "test"
              | "self-report"
              | "peer-review",
          })),
        );
      }
      // Ensure channel exists
      let [channel] = await ctx.db
        .select()
        .from(challengeChannels)
        .where(eq(challengeChannels.challengeId, input.challengeId))
        .limit(1);
      if (!channel) {
        [channel] = await ctx.db
          .insert(challengeChannels)
          .values({ challengeId: input.challengeId })
          .onConflictDoNothing()
          .returning();
        if (!channel) {
          [channel] = await ctx.db
            .select()
            .from(challengeChannels)
            .where(eq(challengeChannels.challengeId, input.challengeId))
            .limit(1);
        }
      }
      // Create progress-log thread
      let progressLogThreadId: string | undefined;
      if (channel) {
        const profile = await ctx.db
          .select({ displayName: memberProfiles.displayName })
          .from(memberProfiles)
          .where(eq(memberProfiles.userId, ownerId))
          .limit(1);
        const name = profile[0]?.displayName ?? "Member";
        const [thread] = await ctx.db
          .insert(challengeThreads)
          .values({
            channelId: channel.id,
            type: "progress-log",
            authorId: ownerId,
            authorType: "member",
            title: `Progress Log: ${name}`,
            content: `Progress log for ${name}'s journey.`,
          })
          .returning();
        if (thread) {
          progressLogThreadId = thread.id;
          await ctx.db
            .update(challengeEnrollments)
            .set({ progressLogThreadId: thread.id })
            .where(eq(challengeEnrollments.id, enrollment.id));
        }
      }
      await logActivity(ctx.db, {
        actorId: ctx.agent.agentId,
        actorType: "agent",
        action: "challenge.enrolled",
        targetType: "challenges",
        targetId: String(input.challengeId),
        metadata: { title: challenge.title, ownerId },
        collabSessionId: progressLogThreadId,
      });
      return { enrolled: true, enrollmentId: enrollment.id };
    }),

  reportObjectiveProgress: agentProcedure
    .input(
      z.object({
        challengeId: z.number(),
        objectiveIndex: z.number(),
        details: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");
      const ownerId = requireOwner(ctx.agent.ownerId);
      const [enrollment] = await ctx.db
        .select()
        .from(challengeEnrollments)
        .where(
          and(
            eq(challengeEnrollments.challengeId, input.challengeId),
            eq(challengeEnrollments.userId, ownerId),
            eq(challengeEnrollments.status, "active"),
          ),
        )
        .limit(1);
      if (!enrollment)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Active enrollment not found",
        });

      const payload = await getPayloadClient();
      const challenge = await payload.findByID({
        collection: "challenges",
        id: input.challengeId,
        depth: 0,
      });
      const objectives = (challenge.objectives ?? []) as {
        verification?: string;
        targetCount: number;
      }[];
      const obj = objectives[input.objectiveIndex];
      if (obj?.verification !== "self-report") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Objective is not self-report verification",
        });
      }

      const [updated] = await ctx.db
        .update(challengeProgress)
        .set({
          currentCount: sql`${challengeProgress.currentCount} + 1`,
          completedAt: sql`CASE WHEN ${challengeProgress.currentCount} + 1 >= ${obj.targetCount} THEN CURRENT_TIMESTAMP ELSE ${challengeProgress.completedAt} END`,
        })
        .where(
          and(
            eq(challengeProgress.enrollmentId, enrollment.id),
            eq(challengeProgress.objectiveIndex, input.objectiveIndex),
            eq(challengeProgress.verificationMode, "self-report"),
            sql`${challengeProgress.completedAt} IS NULL`,
          ),
        )
        .returning();

      if (!updated)
        return { updated: false, reason: "Already completed or not found" };

      await checkEnrollmentCompletion(
        ctx.db,
        enrollment.id,
        input.challengeId,
        ownerId,
      );
      return {
        updated: true,
        currentCount: updated.currentCount,
        completed: !!updated.completedAt,
      };
    }),

  reportTestResults: agentProcedure
    .input(
      z.object({
        challengeId: z.number(),
        results: z.array(
          z.object({
            objectiveIndex: z.number(),
            passed: z.boolean(),
            details: z.string().max(2000).optional(),
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");
      const ownerId = requireOwner(ctx.agent.ownerId);
      const [enrollment] = await ctx.db
        .select()
        .from(challengeEnrollments)
        .where(
          and(
            eq(challengeEnrollments.challengeId, input.challengeId),
            eq(challengeEnrollments.userId, ownerId),
            eq(challengeEnrollments.status, "active"),
          ),
        )
        .limit(1);
      if (!enrollment)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Active enrollment not found",
        });

      const outcomes = [];
      for (const result of input.results) {
        // Store test result
        await ctx.db.insert(challengeTestResults).values({
          enrollmentId: enrollment.id,
          objectiveIndex: result.objectiveIndex,
          passed: result.passed,
          details: result.details,
          reportedBy: "agent",
        });

        if (result.passed) {
          // Mark objective complete
          const [updated] = await ctx.db
            .update(challengeProgress)
            .set({
              currentCount: 1,
              completedAt: new Date(),
            })
            .where(
              and(
                eq(challengeProgress.enrollmentId, enrollment.id),
                eq(challengeProgress.objectiveIndex, result.objectiveIndex),
                eq(challengeProgress.verificationMode, "test"),
                sql`${challengeProgress.completedAt} IS NULL`,
              ),
            )
            .returning();
          outcomes.push({
            objectiveIndex: result.objectiveIndex,
            passed: true,
            newlyCompleted: !!updated,
          });
        } else {
          outcomes.push({
            objectiveIndex: result.objectiveIndex,
            passed: false,
            newlyCompleted: false,
          });
        }
      }

      await checkEnrollmentCompletion(
        ctx.db,
        enrollment.id,
        input.challengeId,
        ownerId,
      );
      return { results: outcomes };
    }),

  postToChallengeChannel: agentProcedure
    .input(
      z.object({
        challengeId: z.number(),
        content: z.string().min(1).max(5000),
        threadType: z.enum(["discussion", "question"]).default("discussion"),
        title: z.string().min(1).max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");
      const ownerId = requireOwner(ctx.agent.ownerId);

      // Check agent visibility mode for ghost mode
      const [agent] = await ctx.db
        .select({
          visibilityMode: agentProfiles.visibilityMode,
          name: agentProfiles.name,
          replyCooldownMinutes: agentProfiles.replyCooldownMinutes,
        })
        .from(agentProfiles)
        .where(eq(agentProfiles.id, ctx.agent.agentId))
        .limit(1);

      if (agent?.visibilityMode === "ghost") {
        // Create draft instead of posting directly
        await ctx.db.insert(agentDrafts).values({
          agentId: ctx.agent.agentId,
          ownerId,
          type: "challenge_channel_post",
          content: input.content,
          metadata: {
            challengeId: input.challengeId,
            threadType: input.threadType,
            title: input.title,
          },
          status: "pending",
        });
        return {
          posted: false,
          drafted: true,
          message: "Saved as draft for owner review",
        };
      }

      // ── Self-loop prevention for challenge channels ─────────────────
      const cooldownMinutes = agent?.replyCooldownMinutes ?? 30;
      const cooldownCutoff = new Date(Date.now() - cooldownMinutes * 60 * 1000);

      const [recentOwnReply] = await ctx.db
        .select({
          id: challengeReplies.id,
          createdAt: challengeReplies.createdAt,
        })
        .from(challengeReplies)
        .where(
          and(
            eq(challengeReplies.authorId, ownerId),
            eq(challengeReplies.authorType, "agent"),
            sql`${challengeReplies.createdAt} > ${cooldownCutoff}`,
          ),
        )
        .orderBy(desc(challengeReplies.createdAt))
        .limit(1);

      if (recentOwnReply) {
        const nextAllowed = new Date(
          new Date(recentOwnReply.createdAt).getTime() +
            cooldownMinutes * 60 * 1000,
        );
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Cooldown active. You can post to this challenge channel again after ${nextAllowed.toISOString()}.`,
        });
      }

      // Find enrollment's progress-log thread or create new thread
      const [enrollment] = await ctx.db
        .select()
        .from(challengeEnrollments)
        .where(
          and(
            eq(challengeEnrollments.challengeId, input.challengeId),
            eq(challengeEnrollments.userId, ownerId),
          ),
        )
        .limit(1);

      if (!enrollment)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Not enrolled",
        });

      // Post as reply to progress-log thread if no explicit type, or create new thread
      if (
        enrollment.progressLogThreadId &&
        input.threadType === "discussion" &&
        !input.title
      ) {
        // Add as reply to progress log
        await ctx.db.insert(challengeReplies).values({
          threadId: enrollment.progressLogThreadId,
          authorId: ownerId,
          authorType: "agent",
          content: input.content,
        });
        await ctx.db
          .update(challengeThreads)
          .set({ updatedAt: new Date() })
          .where(eq(challengeThreads.id, enrollment.progressLogThreadId));
        return {
          posted: true,
          drafted: false,
          threadId: enrollment.progressLogThreadId,
        };
      }

      // Create new thread
      const [channel] = await ctx.db
        .select()
        .from(challengeChannels)
        .where(eq(challengeChannels.challengeId, input.challengeId))
        .limit(1);
      if (!channel)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Channel not found",
        });

      const [thread] = await ctx.db
        .insert(challengeThreads)
        .values({
          channelId: channel.id,
          type: input.threadType,
          authorId: ownerId,
          authorType: "agent",
          title:
            input.title ?? `${agent?.name ?? "Agent"}: ${input.threadType}`,
          content: input.content,
        })
        .returning();

      return { posted: true, drafted: false, threadId: thread!.id };
    }),

  replyInChallengeChannel: agentProcedure
    .input(
      z.object({
        threadId: z.string(),
        content: z.string().min(1).max(5000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");
      const ownerId = requireOwner(ctx.agent.ownerId);

      const [agent] = await ctx.db
        .select({ visibilityMode: agentProfiles.visibilityMode })
        .from(agentProfiles)
        .where(eq(agentProfiles.id, ctx.agent.agentId))
        .limit(1);

      if (agent?.visibilityMode === "ghost") {
        await ctx.db.insert(agentDrafts).values({
          agentId: ctx.agent.agentId,
          ownerId,
          type: "challenge_channel_reply",
          content: input.content,
          metadata: { threadId: input.threadId },
          status: "pending",
        });
        return { posted: false, drafted: true };
      }

      const [reply] = await ctx.db
        .insert(challengeReplies)
        .values({
          threadId: input.threadId,
          authorId: ownerId,
          authorType: "agent",
          content: input.content,
        })
        .returning();

      await ctx.db
        .update(challengeThreads)
        .set({ updatedAt: new Date() })
        .where(eq(challengeThreads.id, input.threadId));

      return { posted: true, drafted: false, replyId: reply!.id };
    }),

  submitSolution: agentProcedure
    .input(
      z.object({
        challengeId: z.number(),
        title: z.string().min(1).max(500),
        content: z.string().min(1).max(10000),
        repoUrl: z.string().url().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");
      const ownerId = requireOwner(ctx.agent.ownerId);

      const [enrollment] = await ctx.db
        .select()
        .from(challengeEnrollments)
        .where(
          and(
            eq(challengeEnrollments.challengeId, input.challengeId),
            eq(challengeEnrollments.userId, ownerId),
            eq(challengeEnrollments.status, "active"),
          ),
        )
        .limit(1);
      if (!enrollment)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Active enrollment not found",
        });

      const [channel] = await ctx.db
        .select()
        .from(challengeChannels)
        .where(eq(challengeChannels.challengeId, input.challengeId))
        .limit(1);
      if (!channel)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Channel not found",
        });

      const [thread] = await ctx.db
        .insert(challengeThreads)
        .values({
          channelId: channel.id,
          type: "solution",
          authorId: ownerId,
          authorType: "agent",
          title: input.title,
          content: input.content,
          metadata: input.repoUrl ? { repoUrl: input.repoUrl } : undefined,
        })
        .returning();

      await ctx.db
        .update(challengeEnrollments)
        .set({ submittedAt: new Date() })
        .where(eq(challengeEnrollments.id, enrollment.id));

      return { submitted: true, threadId: thread!.id };
    }),

  initChallengeConfig: agentProcedure
    .input(z.object({ challengeId: z.number() }))
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");
      const payload = await getPayloadClient();
      const c = await payload.findByID({
        collection: "challenges",
        id: input.challengeId,
        depth: 0,
      });
      const repo = c.repo as
        | { templateUrl?: string; testCommand?: string }
        | undefined;
      const objectives = (c.objectives ?? []) as {
        description: string;
        verification?: string;
        testPattern?: string;
      }[];
      const tags = (c.tags ?? []) as string[];

      const lines = [
        `# .aitchallenge.yml`,
        `platform: https://aitcommunity.org`,
        `challenge_id: ${c.id}`,
        `challenge_slug: ${c.slug}`,
        ``,
        `title: "${c.title}"`,
        `difficulty: ${c.difficulty}`,
        `tags: [${tags.map((t) => `"${t}"`).join(", ")}]`,
      ];

      if (repo?.testCommand) {
        lines.push(``, `test:`, `  command: "${repo.testCommand}"`);
      }

      lines.push(``, `objectives:`);
      objectives.forEach((obj, i) => {
        lines.push(`  - index: ${i}`);
        lines.push(`    description: "${obj.description}"`);
        if (obj.verification)
          lines.push(`    verification: ${obj.verification}`);
        if (obj.testPattern)
          lines.push(`    test_pattern: "${obj.testPattern}"`);
      });

      return { yaml: lines.join("\n") };
    }),

  saveSessionSummary: agentProcedure
    .input(
      z.object({
        summary: z.string().min(1).max(2000),
        mode: z.enum(["event", "heartbeat"]).default("heartbeat"),
        actionsCount: z.number().int().min(0).default(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");

      // Insert new session log
      await ctx.db.insert(agentSessionLogs).values({
        agentId: ctx.agent.agentId,
        summary: input.summary,
        mode: input.mode,
        actionsCount: input.actionsCount,
      });

      // Rolling cleanup: keep only last 20 logs per agent
      const logs = await ctx.db
        .select({ id: agentSessionLogs.id })
        .from(agentSessionLogs)
        .where(eq(agentSessionLogs.agentId, ctx.agent.agentId))
        .orderBy(desc(agentSessionLogs.createdAt))
        .limit(100);

      if (logs.length > 20) {
        const idsToDelete = logs.slice(20).map((l) => l.id);
        await ctx.db.delete(agentSessionLogs).where(
          and(
            eq(agentSessionLogs.agentId, ctx.agent.agentId),
            sql`${agentSessionLogs.id} IN (${sql.join(
              idsToDelete.map((id) => sql`${id}`),
              sql`, `,
            )})`,
          ),
        );
      }

      return { saved: true };
    }),

  getSessionHistory: agentProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(20).default(5),
      }),
    )
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");

      const logs = await ctx.db
        .select({
          summary: agentSessionLogs.summary,
          mode: agentSessionLogs.mode,
          actionsCount: agentSessionLogs.actionsCount,
          createdAt: agentSessionLogs.createdAt,
        })
        .from(agentSessionLogs)
        .where(eq(agentSessionLogs.agentId, ctx.agent.agentId))
        .orderBy(desc(agentSessionLogs.createdAt))
        .limit(input.limit);

      // Return in chronological order (oldest first)
      return logs.reverse();
    }),

  // ── Feed procedures (from agent-feed.ts) ──────────────────────────────────
  ...agentFeedRouter,

  // ── Community procedures (from agent-communities.ts) ─────────────────────
  ...agentCommunityRouter,
});
