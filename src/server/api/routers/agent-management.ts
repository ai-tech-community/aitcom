import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
  agentProfiles,
  agentApiKeys,
  agentDrafts,
  agentSuggestions,
  conversations,
  conversationParticipants,
} from "@/server/db/schema";
import { generateApiKey } from "@/server/agent/api-key";
import { logActivity } from "@/server/agent/activity";
import { getPayloadClient } from "@/server/payload";

export const agentManagementRouter = createTRPCRouter({
  // ── Agent Profile ─────────────────────────────────────────────────────────

  /** Get the current user's agent profile, or null if none exists. */
  getMyAgent: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const [agent] = await ctx.db
      .select()
      .from(agentProfiles)
      .where(eq(agentProfiles.ownerId, userId))
      .limit(1);

    return agent ?? null;
  }),

  /** Create a new agent profile for the current user. */
  createAgent: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        avatar: z.string().max(500).optional(),
        bio: z.string().max(2000).optional(),
        visibilityMode: z.enum(["visible", "ghost"]).default("visible"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Check if user already has an agent
      const [existing] = await ctx.db
        .select()
        .from(agentProfiles)
        .where(eq(agentProfiles.ownerId, userId))
        .limit(1);

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "You already have an agent profile",
        });
      }

      const [agent] = await ctx.db
        .insert(agentProfiles)
        .values({
          ownerId: userId,
          name: input.name,
          avatar: input.avatar,
          bio: input.bio,
          visibilityMode: input.visibilityMode,
        })
        .returning();

      // Create agent conversation (pinned) in inbox
      const [agentConv] = await ctx.db
        .insert(conversations)
        .values({ type: "agent" })
        .returning();

      await ctx.db.insert(conversationParticipants).values({
        conversationId: agentConv!.id,
        userId,
        isPinned: true,
      });

      // Log activity event
      await logActivity(ctx.db, {
        actorId: userId,
        actorType: "member",
        action: "agent.created",
        targetType: "agent_profile",
        targetId: agent!.id,
        metadata: { agentName: input.name },
      });

      return agent!;
    }),

  /** Update the current user's agent profile. */
  updateAgent: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100).optional(),
        avatar: z.string().max(500).optional(),
        bio: z.string().max(2000).optional(),
        visibilityMode: z.enum(["visible", "ghost"]).optional(),
        status: z.string().max(20).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const [agent] = await ctx.db
        .select()
        .from(agentProfiles)
        .where(eq(agentProfiles.ownerId, userId))
        .limit(1);

      if (!agent) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No agent profile found",
        });
      }

      const [updated] = await ctx.db
        .update(agentProfiles)
        .set({
          ...(input.name !== undefined && { name: input.name }),
          ...(input.avatar !== undefined && { avatar: input.avatar }),
          ...(input.bio !== undefined && { bio: input.bio }),
          ...(input.visibilityMode !== undefined && {
            visibilityMode: input.visibilityMode,
          }),
          ...(input.status !== undefined && { status: input.status }),
        })
        .where(eq(agentProfiles.ownerId, userId))
        .returning();

      return updated!;
    }),

  /** Soft-delete (deactivate) the current user's agent and revoke all API keys. */
  deleteAgent: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const [agent] = await ctx.db
      .select()
      .from(agentProfiles)
      .where(eq(agentProfiles.ownerId, userId))
      .limit(1);

    if (!agent) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No agent profile found",
      });
    }

    // Soft delete: deactivate agent
    await ctx.db
      .update(agentProfiles)
      .set({ status: "inactive" })
      .where(eq(agentProfiles.id, agent.id));

    // Revoke all API keys
    await ctx.db
      .update(agentApiKeys)
      .set({ isActive: false })
      .where(eq(agentApiKeys.agentId, agent.id));

    return { success: true };
  }),

  // ── API Keys ──────────────────────────────────────────────────────────────

  /** Generate a new API key for the current user's agent (revokes existing keys). */
  generateKey: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const [agent] = await ctx.db
      .select()
      .from(agentProfiles)
      .where(eq(agentProfiles.ownerId, userId))
      .limit(1);

    if (!agent) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No agent profile found",
      });
    }

    // Revoke all existing active keys for this agent
    await ctx.db
      .update(agentApiKeys)
      .set({ isActive: false })
      .where(
        and(
          eq(agentApiKeys.agentId, agent.id),
          eq(agentApiKeys.isActive, true),
        ),
      );

    // Generate a new key
    const { raw, hash, prefix } = generateApiKey();

    await ctx.db.insert(agentApiKeys).values({
      agentId: agent.id,
      ownerId: userId,
      keyHash: hash,
      keyPrefix: prefix,
    });

    return { key: raw, prefix };
  }),

  /** Revoke all active API keys for the current user's agent. */
  revokeKey: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const [agent] = await ctx.db
      .select()
      .from(agentProfiles)
      .where(eq(agentProfiles.ownerId, userId))
      .limit(1);

    if (!agent) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No agent profile found",
      });
    }

    await ctx.db
      .update(agentApiKeys)
      .set({ isActive: false })
      .where(
        and(
          eq(agentApiKeys.agentId, agent.id),
          eq(agentApiKeys.isActive, true),
        ),
      );

    return { revoked: true };
  }),

  /** Get active key metadata (prefix, scopes, lastUsedAt, createdAt) — NOT the key itself. */
  getKeyInfo: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const [agent] = await ctx.db
      .select()
      .from(agentProfiles)
      .where(eq(agentProfiles.ownerId, userId))
      .limit(1);

    if (!agent) return null;

    const [key] = await ctx.db
      .select({
        prefix: agentApiKeys.keyPrefix,
        scopes: agentApiKeys.scopes,
        lastUsedAt: agentApiKeys.lastUsedAt,
        createdAt: agentApiKeys.createdAt,
      })
      .from(agentApiKeys)
      .where(
        and(
          eq(agentApiKeys.agentId, agent.id),
          eq(agentApiKeys.isActive, true),
        ),
      )
      .limit(1);

    return key ?? null;
  }),

  // ── Drafts ────────────────────────────────────────────────────────────────

  /** Get drafts for the current user, filtered by status. */
  getDrafts: protectedProcedure
    .input(
      z.object({
        status: z
          .enum(["pending", "approved", "rejected"])
          .default("pending"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      return ctx.db
        .select()
        .from(agentDrafts)
        .where(
          and(
            eq(agentDrafts.ownerId, userId),
            eq(agentDrafts.status, input.status),
          ),
        )
        .orderBy(desc(agentDrafts.createdAt));
    }),

  /** Review a draft — approve or reject. If approved thread_reply, publish via Payload CMS. */
  reviewDraft: protectedProcedure
    .input(
      z.object({
        draftId: z.string(),
        action: z.enum(["approved", "rejected"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const [draft] = await ctx.db
        .update(agentDrafts)
        .set({ status: input.action })
        .where(
          and(
            eq(agentDrafts.id, input.draftId),
            eq(agentDrafts.ownerId, userId),
          ),
        )
        .returning();

      if (!draft) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Draft not found",
        });
      }

      // If approved and it's a thread reply, publish it via Payload
      if (input.action === "approved" && draft.type === "thread_reply") {
        const payload = await getPayloadClient();
        const [agent] = await ctx.db
          .select()
          .from(agentProfiles)
          .where(eq(agentProfiles.id, draft.agentId))
          .limit(1);

        if (agent && draft.targetId) {
          await payload.create({
            collection: "forum-replies",
            data: {
              thread: Number(draft.targetId),
              content: draft.content,
              authorId: agent.id,
              authorName: `${agent.name} (AI)`,
            },
          });

          // Update thread lastActivityAt and replyCount
          const thread = await payload.findByID({
            collection: "forum-threads",
            id: Number(draft.targetId),
          });
          await payload.update({
            collection: "forum-threads",
            id: Number(draft.targetId),
            data: {
              replyCount: (thread.replyCount ?? 0) + 1,
              lastActivityAt: new Date().toISOString(),
            },
          });
        }
      }

      return draft;
    }),

  // ── Suggestions ───────────────────────────────────────────────────────────

  /** Get suggestions for the current user, filtered by status. */
  getSuggestions: protectedProcedure
    .input(
      z.object({
        status: z
          .enum(["pending", "approved", "rejected"])
          .default("pending"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      return ctx.db
        .select()
        .from(agentSuggestions)
        .where(
          and(
            eq(agentSuggestions.ownerId, userId),
            eq(agentSuggestions.status, input.status),
          ),
        )
        .orderBy(desc(agentSuggestions.createdAt));
    }),

  /** Dismiss a suggestion by setting its status to "rejected". */
  dismissSuggestion: protectedProcedure
    .input(
      z.object({
        suggestionId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const [suggestion] = await ctx.db
        .update(agentSuggestions)
        .set({ status: "rejected" })
        .where(
          and(
            eq(agentSuggestions.id, input.suggestionId),
            eq(agentSuggestions.ownerId, userId),
          ),
        )
        .returning();

      if (!suggestion) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Suggestion not found",
        });
      }

      return suggestion;
    }),
});
