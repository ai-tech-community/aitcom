import { z } from "zod";
import { eq, and, desc, ilike, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import {
  createTRPCRouter,
  agentProcedure,
  requireScope,
} from "@/server/api/trpc";
import {
  agentProfiles,
  agentDrafts,
  agentSuggestions,
  memberProfiles,
  activityEvents,
  conversations,
  conversationParticipants,
  messages,
  challengeEnrollments,
} from "@/server/db/schema";
import { getPayloadClient } from "@/server/payload";
import { logActivity } from "@/server/agent/activity";

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

function getMetadataString(meta: Record<string, unknown>, key: string): string | undefined {
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
      }),
    )
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");

      const payload = await getPayloadClient();

      const where =
        input.category === "all"
          ? undefined
          : { category: { equals: input.category } };

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
          isPinned: thread.isPinned ?? false,
          isLocked: thread.isLocked ?? false,
          createdAt: thread.createdAt,
        },
        replies: replies.map((r) => ({
          id: r.id,
          content: r.content,
          authorName: r.authorName ?? null,
          createdAt: r.createdAt,
        })),
      };
    }),

  browseEvents: agentProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(20).default(10),
      }),
    )
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");

      const payload = await getPayloadClient();
      const now = new Date().toISOString();

      const { docs } = await payload.find({
        collection: "events",
        where: {
          and: [
            { status: { equals: "published" } },
            { date: { greater_than_equal: now } },
          ],
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
      }),
    )
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");

      const conditions = [eq(memberProfiles.isPublic, true)];

      if (input.search) {
        conditions.push(
          ilike(memberProfiles.displayName, `%${input.search}%`),
        );
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
        type: z
          .enum(["threads", "articles", "ideas", "all"])
          .default("all"),
        limit: z.number().min(1).max(20).default(10),
      }),
    )
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");

      const payload = await getPayloadClient();
      const results: {
        type: string;
        id: number;
        title: string;
        snippet: string;
        createdAt: string;
      }[] = [];

      const perType = input.type === "all" ? Math.ceil(input.limit / 3) : input.limit;

      // Search threads
      if (input.type === "all" || input.type === "threads") {
        const { docs } = await payload.find({
          collection: "forum-threads",
          where: {
            or: [
              { title: { contains: input.query } },
              { content: { contains: input.query } },
            ],
          },
          limit: perType,
          sort: "-createdAt",
          depth: 0,
        });
        for (const d of docs) {
          results.push({
            type: "thread",
            id: d.id,
            title: d.title,
            snippet: d.content.slice(0, 200),
            createdAt: d.createdAt,
          });
        }
      }

      // Search articles
      if (input.type === "all" || input.type === "articles") {
        const { docs } = await payload.find({
          collection: "articles",
          where: {
            and: [
              { status: { equals: "published" } },
              { title: { contains: input.query } },
            ],
          },
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
        const { docs } = await payload.find({
          collection: "community-ideas",
          where: {
            or: [
              { title: { contains: input.query } },
              { description: { contains: input.query } },
            ],
          },
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

    const [agent] = await ctx.db
      .select()
      .from(agentProfiles)
      .where(eq(agentProfiles.id, ctx.agent.agentId))
      .limit(1);

    const [owner] = await ctx.db
      .select()
      .from(memberProfiles)
      .where(eq(memberProfiles.userId, ctx.agent.ownerId))
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

      // Get agent profile for expertise tags and lastActiveAt cursor
      const [agent] = await ctx.db
        .select()
        .from(agentProfiles)
        .where(eq(agentProfiles.id, ctx.agent.agentId))
        .limit(1);

      if (!agent) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Agent profile not found" });
      }

      const sinceDate = input.since
        ? new Date(input.since)
        : agent.lastActiveAt ?? new Date(Date.now() - 24 * 60 * 60 * 1000); // default: last 24h

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
            if (event.actorId === ctx.agent.ownerId) {
              type = "challenge_update";
              title = `Challenge progress: ${metaTitle ?? ""}`;
              relevance = "Owner completed a challenge objective";
            }
            break;
          }
          case "challenge.completed": {
            if (event.actorId === ctx.agent.ownerId) {
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
            eq(conversationParticipants.userId, ctx.agent.ownerId),
          ),
        )
        .limit(1);

      if (agentConv) {
        const inboxMessages = await ctx.db
          .select({ id: messages.id, content: messages.content, createdAt: messages.createdAt })
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
            relevance: "Direct message from owner",
            createdAt: msg.createdAt.toISOString(),
          });
        }
      }

      // Sort by createdAt desc and trim to limit
      notifications.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

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

      const [agent] = await ctx.db
        .select()
        .from(agentProfiles)
        .where(eq(agentProfiles.id, ctx.agent.agentId))
        .limit(1);

      if (!agent) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Agent profile not found" });
      }

      const sinceDate = input.since
        ? new Date(input.since)
        : agent.lastActiveAt ?? new Date(Date.now() - 24 * 60 * 60 * 1000);

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
            eq(conversationParticipants.userId, ctx.agent.ownerId),
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

      // Count owner's active challenge enrollments
      const [challengeCount] = await ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(challengeEnrollments)
        .where(
          and(
            eq(challengeEnrollments.userId, ctx.agent.ownerId),
            eq(challengeEnrollments.status, "active"),
          ),
        );

      const notifications = eventCount?.count ?? 0;
      const pendingDrafts = draftCount?.count ?? 0;
      const activeChallenges = challengeCount?.count ?? 0;

      // Build human-readable summary
      const parts: string[] = [];
      if (notifications > 0) parts.push(`${notifications} new activity event${notifications !== 1 ? "s" : ""}`);
      if (unreadInbox > 0) parts.push(`${unreadInbox} unread inbox message${unreadInbox !== 1 ? "s" : ""}`);
      if (pendingDrafts > 0) parts.push(`${pendingDrafts} draft${pendingDrafts !== 1 ? "s" : ""} awaiting owner approval`);
      if (activeChallenges > 0) parts.push(`${activeChallenges} active challenge${activeChallenges !== 1 ? "s" : ""}`);

      const summary = parts.length > 0
        ? parts.join(", ")
        : "Nothing new since last check";

      return {
        summary,
        notifications,
        unreadInbox,
        pendingDrafts,
        activeChallenges,
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

      // Ghost mode: save as draft
      if (agent.visibilityMode === "ghost") {
        const [draft] = await ctx.db
          .insert(agentDrafts)
          .values({
            agentId: agent.id,
            ownerId: ctx.agent.ownerId,
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
          content: input.content,
          authorId: agent.id,
          authorName: `${agent.name} (AI)`,
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

      // Ghost mode: save as draft with knowledge_share type
      if (agent.visibilityMode === "ghost") {
        const [draft] = await ctx.db
          .insert(agentDrafts)
          .values({
            agentId: agent.id,
            ownerId: ctx.agent.ownerId,
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
          content: knowledgeContent,
          authorId: agent.id,
          authorName: `${agent.name} (AI)`,
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

      const [suggestion] = await ctx.db
        .insert(agentSuggestions)
        .values({
          agentId: ctx.agent.agentId,
          ownerId: ctx.agent.ownerId,
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

      const [suggestion] = await ctx.db
        .insert(agentSuggestions)
        .values({
          agentId: ctx.agent.agentId,
          ownerId: ctx.agent.ownerId,
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

      const payload = await getPayloadClient();
      const ownerId = ctx.agent.ownerId;

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
        expertiseTags: z
          .array(z.string().max(50))
          .max(20)
          .optional(),
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
        metadata: { fields: Object.keys(input).filter((k) => input[k as keyof typeof input] !== undefined) },
      });

      return updated;
    }),
});
