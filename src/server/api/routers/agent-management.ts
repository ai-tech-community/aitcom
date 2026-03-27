import { z } from "zod";
import { randomBytes, createHmac } from "crypto";
import { eq, and, desc, gt, lt } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
  agentProfiles,
  agentApiKeys,
  agentWebhooks,
  agentDrafts,
  agentSuggestions,
  agentInviteCodes,
  conversations,
  conversationParticipants,
} from "@/server/db/schema";
import { generateApiKey } from "@/server/agent/api-key";
import { logActivity } from "@/server/agent/activity";
import { generateInviteCode } from "@/app/api/mcp/registration-tools";
import { getPayloadClient } from "@/server/payload";
import { plainTextToLexical } from "@/server/challenge-engine/lexical";

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

  /** Quick-setup: create agent with smart defaults + generate API key in one call. */
  quickSetup: protectedProcedure
    .input(
      z.object({
        tool: z.enum(["n8n", "claude-cli", "openclaw", "webhook", "custom"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const userName = ctx.session.user.name ?? "member";

      // Check if user already has an agent
      const [existing] = await ctx.db
        .select()
        .from(agentProfiles)
        .where(eq(agentProfiles.ownerId, userId))
        .limit(1);

      let agent = existing;

      if (!agent) {
        // Auto-create agent with smart defaults
        const [created] = await ctx.db
          .insert(agentProfiles)
          .values({
            ownerId: userId,
            name: `${userName}'s AI Agent`,
            visibilityMode: "visible",
          })
          .returning();

        agent = created!;

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

        await logActivity(ctx.db, {
          actorId: userId,
          actorType: "member",
          action: "agent.created",
          targetType: "agent_profile",
          targetId: agent.id,
          metadata: { agentName: agent.name, setupTool: input.tool },
        });
      }

      // Revoke any existing active keys
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

      return {
        agent: {
          id: agent.id,
          name: agent.name,
          avatar: agent.avatar,
          bio: agent.bio,
          visibilityMode: agent.visibilityMode,
          status: agent.status,
        },
        apiKey: raw,
        keyPrefix: prefix,
      };
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

  /** Get active key metadata (prefix, scopes, lastUsedAt, createdAt) - NOT the key itself. */
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

  /** Test the agent setup: verify agent, API key, scopes, and check if an external tool has connected. */
  testConnection: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    // 1. Check agent exists and is active
    const [agent] = await ctx.db
      .select({
        id: agentProfiles.id,
        name: agentProfiles.name,
        lastActiveAt: agentProfiles.lastActiveAt,
      })
      .from(agentProfiles)
      .where(
        and(
          eq(agentProfiles.ownerId, userId),
          eq(agentProfiles.status, "active"),
        ),
      )
      .limit(1);

    if (!agent) {
      return { ok: false, reason: "no-agent" as const };
    }

    // 2. Check active API key exists with valid scopes
    const [key] = await ctx.db
      .select({
        prefix: agentApiKeys.keyPrefix,
        scopes: agentApiKeys.scopes,
        lastUsedAt: agentApiKeys.lastUsedAt,
      })
      .from(agentApiKeys)
      .where(
        and(
          eq(agentApiKeys.agentId, agent.id),
          eq(agentApiKeys.isActive, true),
        ),
      )
      .limit(1);

    if (!key) {
      return { ok: false, reason: "no-key" as const };
    }

    // 3. Check if an external tool has actually connected (webhook registered or key used)
    const [webhook] = await ctx.db
      .select({ isEnabled: agentWebhooks.isEnabled })
      .from(agentWebhooks)
      .where(eq(agentWebhooks.agentId, agent.id))
      .limit(1);

    const hasWebhook = !!webhook?.isEnabled;
    const keyEverUsed = !!key.lastUsedAt;
    const recentlyActive = agent.lastActiveAt
      ? Date.now() - agent.lastActiveAt.getTime() < 24 * 60 * 60 * 1000
      : false;

    if (!hasWebhook && !keyEverUsed) {
      return {
        ok: false,
        reason: "not-connected" as const,
        details: "API key is ready but no external tool has connected yet. Configure your n8n workflow or Claude CLI, then try again.",
      };
    }

    return {
      ok: true,
      reason: "connected" as const,
      details: {
        agentName: agent.name,
        keyPrefix: key.prefix,
        hasWebhook,
        recentlyActive,
        lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
      },
    };
  }),

  // ── Webhooks ─────────────────────────────────────────────────────────────

  /** Get the current user's webhook configuration, or null if none exists. */
  getWebhook: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const [webhook] = await ctx.db
      .select()
      .from(agentWebhooks)
      .where(eq(agentWebhooks.ownerId, userId))
      .limit(1);
    return webhook ?? null;
  }),

  /** Create or update the current user's webhook configuration. */
  upsertWebhook: protectedProcedure
    .input(
      z.object({
        url: z
          .string()
          .url()
          .startsWith("https://", {
            message: "Webhook URL must use HTTPS",
          }),
        categories: z
          .array(
            z.enum([
              "forum",
              "challenges",
              "inbox",
              "content",
              "events",
              "community",
            ]),
          )
          .min(1, "Select at least one event category"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const [agent] = await ctx.db
        .select({ id: agentProfiles.id })
        .from(agentProfiles)
        .where(eq(agentProfiles.ownerId, userId))
        .limit(1);

      if (!agent) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No agent found",
        });
      }

      const [existing] = await ctx.db
        .select({ id: agentWebhooks.id })
        .from(agentWebhooks)
        .where(eq(agentWebhooks.ownerId, userId))
        .limit(1);

      if (existing) {
        const [updated] = await ctx.db
          .update(agentWebhooks)
          .set({
            url: input.url,
            categories: input.categories,
            consecutiveFailures: 0,
            isEnabled: true,
          })
          .where(eq(agentWebhooks.id, existing.id))
          .returning();
        return { webhook: updated!, secretGenerated: false };
      }

      const secret = randomBytes(32).toString("hex");
      const [webhook] = await ctx.db
        .insert(agentWebhooks)
        .values({
          agentId: agent.id,
          ownerId: userId,
          url: input.url,
          secret,
          categories: input.categories,
        })
        .returning();
      return { webhook: webhook!, secretGenerated: true, secret };
    }),

  /** Delete the current user's webhook configuration. */
  deleteWebhook: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    await ctx.db
      .delete(agentWebhooks)
      .where(eq(agentWebhooks.ownerId, userId));
    return { success: true };
  }),

  /** Re-enable a disabled webhook and reset failure counter. */
  reenableWebhook: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    await ctx.db
      .update(agentWebhooks)
      .set({ isEnabled: true, consecutiveFailures: 0 })
      .where(eq(agentWebhooks.ownerId, userId));
    return { success: true };
  }),

  /** Send a test event to the current user's webhook endpoint. */
  testWebhook: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const [webhook] = await ctx.db
      .select()
      .from(agentWebhooks)
      .where(eq(agentWebhooks.ownerId, userId))
      .limit(1);

    if (!webhook) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No webhook configured",
      });
    }

    const payload = JSON.stringify({
      type: "test",
      data: { message: "Webhook connected successfully!" },
      eventId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    });

    const signature = createHmac("sha256", webhook.secret)
      .update(payload)
      .digest("hex");

    const res = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-AIT-Signature": `sha256=${signature}`,
        "X-AIT-Event": "test",
      },
      body: payload,
      signal: AbortSignal.timeout(5000),
    }).catch((err: Error) => ({
      ok: false as const,
      status: 0,
      statusText: String(err),
    }));

    if (!("ok" in res) || !res.ok) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Webhook test failed: ${"statusText" in res ? res.statusText : "Connection failed"}`,
      });
    }

    await ctx.db
      .update(agentWebhooks)
      .set({ consecutiveFailures: 0, isEnabled: true })
      .where(eq(agentWebhooks.id, webhook.id));

    return { success: true };
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

  /** Review a draft - approve or reject. If approved thread_reply, publish via Payload CMS. */
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
              content: plainTextToLexical(draft.content ?? ""),
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

  // ── Invite Codes ─────────────────────────────────────────────────────────

  generateInviteCode: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const code = generateInviteCode();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const [inviteCode] = await ctx.db
      .insert(agentInviteCodes)
      .values({
        code,
        createdBy: userId,
        expiresAt,
      })
      .returning();

    return inviteCode!;
  }),

  listInviteCodes: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const codes = await ctx.db
      .select()
      .from(agentInviteCodes)
      .where(eq(agentInviteCodes.createdBy, userId))
      .orderBy(desc(agentInviteCodes.createdAt))
      .limit(20);

    return codes.map((c) => ({
      ...c,
      status: c.usedByAgentId
        ? ("used" as const)
        : new Date() > c.expiresAt
          ? ("expired" as const)
          : ("active" as const),
    }));
  }),

  // ── Claiming ─────────────────────────────────────────────────────────────

  listUnclaimedAgents: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    // Lazy cleanup: mark expired unclaimed agents
    void ctx.db
      .update(agentProfiles)
      .set({ status: "expired" })
      .where(
        and(
          eq(agentProfiles.status, "unclaimed"),
          lt(agentProfiles.claimTokenExpiresAt, new Date()),
        ),
      );

    const [existing] = await ctx.db
      .select({ id: agentProfiles.id })
      .from(agentProfiles)
      .where(eq(agentProfiles.ownerId, userId))
      .limit(1);

    const agents = await ctx.db
      .select({
        id: agentProfiles.id,
        name: agentProfiles.name,
        bio: agentProfiles.bio,
        createdAt: agentProfiles.createdAt,
        claimTokenExpiresAt: agentProfiles.claimTokenExpiresAt,
      })
      .from(agentProfiles)
      .where(
        and(
          eq(agentProfiles.status, "unclaimed"),
          gt(agentProfiles.claimTokenExpiresAt, new Date()),
        ),
      )
      .orderBy(desc(agentProfiles.createdAt))
      .limit(50);

    return { agents, userAlreadyOwnsAgent: !!existing };
  }),

  getAgentByClaimToken: protectedProcedure
    .input(z.object({ token: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const [agent] = await ctx.db
        .select({
          id: agentProfiles.id,
          name: agentProfiles.name,
          bio: agentProfiles.bio,
          createdAt: agentProfiles.createdAt,
          status: agentProfiles.status,
          claimTokenExpiresAt: agentProfiles.claimTokenExpiresAt,
        })
        .from(agentProfiles)
        .where(eq(agentProfiles.claimToken, input.token))
        .limit(1);

      if (!agent) return null;
      if (agent.status !== "unclaimed") return null;
      if (agent.claimTokenExpiresAt && new Date() > agent.claimTokenExpiresAt) return null;

      return agent;
    }),

  claimAgent: protectedProcedure
    .input(
      z.object({
        token: z.string().optional(),
        agentId: z.string().optional(),
      }).refine((d) => d.token || d.agentId, "Provide either token or agentId"),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Check user doesn't already own an agent
      const [existing] = await ctx.db
        .select({ id: agentProfiles.id })
        .from(agentProfiles)
        .where(eq(agentProfiles.ownerId, userId))
        .limit(1);

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "You already own an agent. Each user can own one agent.",
        });
      }

      // Find the agent
      let agentQuery;
      if (input.token) {
        [agentQuery] = await ctx.db
          .select()
          .from(agentProfiles)
          .where(
            and(
              eq(agentProfiles.claimToken, input.token),
              eq(agentProfiles.status, "unclaimed"),
            ),
          )
          .limit(1);
      } else {
        [agentQuery] = await ctx.db
          .select()
          .from(agentProfiles)
          .where(
            and(
              eq(agentProfiles.id, input.agentId!),
              eq(agentProfiles.status, "unclaimed"),
            ),
          )
          .limit(1);
      }

      if (!agentQuery) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Agent not found or already claimed.",
        });
      }

      if (agentQuery.claimTokenExpiresAt && new Date() > agentQuery.claimTokenExpiresAt) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "This claim link has expired.",
        });
      }

      // Claim: set owner, clear claim token, upgrade status
      await ctx.db
        .update(agentProfiles)
        .set({
          ownerId: userId,
          status: "active",
          claimToken: null,
          claimTokenExpiresAt: null,
        })
        .where(eq(agentProfiles.id, agentQuery.id));

      // Upgrade API key scopes and set ownerId
      await ctx.db
        .update(agentApiKeys)
        .set({
          ownerId: userId,
          scopes: ["read", "contribute", "self-profile"],
        })
        .where(
          and(
            eq(agentApiKeys.agentId, agentQuery.id),
            eq(agentApiKeys.isActive, true),
          ),
        );

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

      await logActivity(ctx.db, {
        actorId: userId,
        actorType: "member",
        action: "agent.claimed",
        targetType: "agent_profile",
        targetId: agentQuery.id,
        metadata: { agentName: agentQuery.name, method: input.token ? "magic-link" : "dashboard" },
      });

      return { success: true, agentId: agentQuery.id, agentName: agentQuery.name };
    }),

  // ── Verification ───────────────────────────────────────────────────────

  startVerification: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const [agent] = await ctx.db
      .select({ id: agentProfiles.id, name: agentProfiles.name, isVerified: agentProfiles.isVerified })
      .from(agentProfiles)
      .where(eq(agentProfiles.ownerId, userId))
      .limit(1);

    if (!agent) {
      throw new TRPCError({ code: "NOT_FOUND", message: "No agent profile found" });
    }

    if (agent.isVerified) {
      throw new TRPCError({ code: "CONFLICT", message: "Agent is already verified" });
    }

    const code = "ait-verify-" + randomBytes(6).toString("hex");

    await ctx.db
      .update(agentProfiles)
      .set({ verificationCode: code })
      .where(eq(agentProfiles.id, agent.id));

    const tweetTemplate = `I'm verifying my AI agent ${agent.name} on @AITCommunity ${code}`;

    return { code, tweetTemplate, agentName: agent.name };
  }),

  submitVerification: protectedProcedure
    .input(z.object({ tweetUrl: z.string().url() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const [agent] = await ctx.db
        .select({
          id: agentProfiles.id,
          name: agentProfiles.name,
          verificationCode: agentProfiles.verificationCode,
          isVerified: agentProfiles.isVerified,
        })
        .from(agentProfiles)
        .where(eq(agentProfiles.ownerId, userId))
        .limit(1);

      if (!agent) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No agent profile found" });
      }

      if (agent.isVerified) {
        throw new TRPCError({ code: "CONFLICT", message: "Agent is already verified" });
      }

      if (!agent.verificationCode) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Start verification first" });
      }

      const tweetUrlRegex = /^https?:\/\/(twitter\.com|x\.com)\/(\w+)\/status\/(\d+)/;
      const match = input.tweetUrl.match(tweetUrlRegex);
      if (!match) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid tweet URL. Must be a twitter.com or x.com status URL." });
      }

      const xHandle = match[2]!;

      const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(input.tweetUrl)}&omit_script=true`;
      let oembedData: { html?: string } | null = null;

      try {
        const response = await fetch(oembedUrl);
        if (!response.ok) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Could not fetch tweet. Make sure it exists and is public." });
        }
        oembedData = (await response.json()) as { html?: string };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({ code: "BAD_REQUEST", message: "Could not fetch tweet. Make sure it exists and is public." });
      }

      if (!oembedData?.html || !oembedData.html.includes(agent.verificationCode)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Verification code not found in tweet. Make sure your tweet contains: ${agent.verificationCode}`,
        });
      }

      await ctx.db
        .update(agentProfiles)
        .set({
          isVerified: true,
          xHandle,
          verifiedAt: new Date(),
          verificationCode: null,
        })
        .where(eq(agentProfiles.id, agent.id));

      await logActivity(ctx.db, {
        actorId: userId,
        actorType: "member",
        action: "agent.verified",
        targetType: "agent_profile",
        targetId: agent.id,
        metadata: { agentName: agent.name, xHandle },
      });

      return { success: true, xHandle };
    }),
});
