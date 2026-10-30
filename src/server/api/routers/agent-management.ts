import { z } from "zod";
import { randomBytes, createHmac } from "crypto";
import { eq, and, or, ne, desc, gt, lt, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
  agentProfiles,
  agentApiKeys,
  agentWebhooks,
  agentDrafts,
  agentSuggestions,
  agentInviteCodes,
  agentManifestAcceptances,
  activityEvents,
  conversations,
  conversationParticipants,
  introductions,
  notifications,
  communityMemberships,
} from "@/server/db/schema";
import { pairKey } from "@/server/agents/matching";
import { generateApiKey } from "@/server/agent/api-key";
import { logActivity } from "@/server/agent/activity";
import { generateInviteCode } from "@/app/api/mcp/registration-tools";
import { getPayloadClient } from "@/server/payload";
import {
  applyMagazineTheme,
  assertMagazineThemeManageable,
  magazineThemeFromDraft,
} from "@/server/magazines/magazine-theme-draft";
import { syncForumThreadCounters } from "@/server/communities/forum-thread-counters";
import { importFeedImage } from "@/server/communities/feed-images";
import { sharedMediaUrl } from "@/server/communities/shared-media-url";
import {
  applyApprovedMagazineDelete,
  MAGAZINE_DELETE_DRAFT_TYPE,
  magazineDeleteFromDraft,
} from "@/server/magazines/magazine-delete";
import {
  applyMagazineIssueUpdate,
  MAGAZINE_ISSUE_UPDATE_DRAFT_TYPE,
  magazineIssueUpdateFromDraft,
} from "@/server/magazines/magazine-issue-update";
import { assertArticleNotPlaced } from "@/server/magazines/article-placement";
import { syncFeedPostCounters } from "@/server/communities/feed-post-counters";
import { plainTextToLexical } from "@/server/challenge-engine/lexical";
import { createForumThread } from "@/server/communities/create-forum-thread";
import { memberDisplayName } from "@/server/members/display-name";
import {
  CLASSROOM_COURSE_DRAFT_TYPE,
  CLASSROOM_COURSE_UPDATE_DRAFT_TYPE,
  CLASSROOM_LESSON_DRAFT_TYPE,
  CLASSROOM_MODULE_DRAFT_TYPE,
  assertClassroomDraftPublishable,
  classroomCourseUpdateFromDraft,
  classroomLessonFromDraft,
  classroomModuleFromDraft,
  publishClassroomCourseDraft,
  publishClassroomCourseUpdate,
  publishClassroomLesson,
  publishClassroomModule,
} from "./agent-classrooms";
import {
  FORUM_THREAD_DRAFT_TYPE,
  forumThreadFromDraft,
} from "@/server/communities/forum-thread-draft";
import {
  applyMagazineArticleUpdate,
  MAGAZINE_ARTICLE_UPDATE_DRAFT_TYPE,
  magazineArticleUpdateFromDraft,
} from "@/server/magazines/magazine-article-update";
import { validateWebhookUrl } from "@/server/agent/validate-webhook-url";
import {
  communityOwnerMayReview,
  listApprovalQueue,
} from "@/server/agent/approval-queue";
import { isNewsStaff } from "@/server/news/staff";
import {
  isBlockedAddress,
  pinnedFetch,
  releaseBody,
} from "@/server/net/pinned-transport";
import {
  TWEET_URL_REGEX,
  verifyOembed,
  type TweetOembed,
} from "@/server/agent/verify-x-tweet";
import { sendDirectMessage } from "@/server/inbox/dm";
import { sendCommunityBroadcast } from "@/server/notifications/broadcast-send";
import {
  AGENT_MANIFEST_INVARIANTS,
  MANIFEST_VERSION,
  renderManifestText,
} from "@/server/agent/manifest";
import { hasAcceptedCurrentManifest } from "@/server/agent/manifest-acceptance";

/** An owned profile that is not a soft-deleted agent. Inactive rows keep
 * their id, but they must not occupy the one-agent slot. */
function ownedLiveAgentWhere(userId: string) {
  return and(
    eq(agentProfiles.ownerId, userId),
    ne(agentProfiles.status, "inactive"),
  )!;
}

/** Keys for this profile, plus keys recorded under the caller's user id.
 * A regenerate that only matches `agentId` leaves a credential active when
 * that credential was stored against a different id. */
function callerKeyWhere(agentId: string, userId: string) {
  return or(
    eq(agentApiKeys.agentId, agentId),
    eq(agentApiKeys.ownerId, userId),
  )!;
}

function callerActiveKeyWhere(agentId: string, userId: string) {
  return and(eq(agentApiKeys.isActive, true), callerKeyWhere(agentId, userId))!;
}

type OwnerSlotDb = {
  update: (table: typeof agentProfiles) => {
    set: (values: { ownerId: null }) => {
      where: (
        condition: NonNullable<ReturnType<typeof and>>,
      ) => Promise<unknown>;
    };
  };
};

/** `owner_id` is UNIQUE. A soft-deleted profile has to drop it or the next
 * claim/create collides even after the inactive row is ignored in SELECTs. */
async function releaseInactiveOwnerSlot(database: OwnerSlotDb, userId: string) {
  await database
    .update(agentProfiles)
    .set({ ownerId: null })
    .where(
      and(
        eq(agentProfiles.ownerId, userId),
        eq(agentProfiles.status, "inactive"),
      )!,
    );
}

export const agentManagementRouter = createTRPCRouter({
  // ── Agent Profile ─────────────────────────────────────────────────────────

  /** Get the current user's agent profile, or null if none exists. */
  getMyAgent: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const [agent] = await ctx.db
      .select()
      .from(agentProfiles)
      .where(ownedLiveAgentWhere(userId))
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

      await releaseInactiveOwnerSlot(ctx.db, userId);

      // Check if user already has a live agent. A soft-deleted profile does
      // not count: its owner slot was released above.
      const [existing] = await ctx.db
        .select()
        .from(agentProfiles)
        .where(ownedLiveAgentWhere(userId))
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

      // Auto-accept the agent manifest on the owner's behalf (ADR-0017):
      // creating the agent forms the owner↔agent binding.
      await ctx.db
        .insert(agentManifestAcceptances)
        .values({
          ownerId: userId,
          agentId: agent!.id,
          manifestVersion: MANIFEST_VERSION,
        })
        .onConflictDoNothing();

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

      await releaseInactiveOwnerSlot(ctx.db, userId);

      // Check if user already has a live agent.
      const [existing] = await ctx.db
        .select()
        .from(agentProfiles)
        .where(ownedLiveAgentWhere(userId))
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

      // Auto-accept the agent manifest on the owner's behalf (ADR-0017):
      // quick-setup binds an owned agent + issues a contribute-capable key.
      await ctx.db
        .insert(agentManifestAcceptances)
        .values({
          ownerId: userId,
          agentId: agent.id,
          manifestVersion: MANIFEST_VERSION,
        })
        .onConflictDoNothing();

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

  /** Soft-delete (deactivate) the current user's agent and revoke all API keys.
   * `owner_id` is released in the same write: it is UNIQUE, so leaving it set
   * blocks the next claim even after status is inactive. */
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

    await ctx.db.transaction(async (tx) => {
      const updated = await tx
        .update(agentProfiles)
        .set({ status: "inactive", ownerId: null })
        .where(
          and(
            eq(agentProfiles.id, agent.id),
            eq(agentProfiles.ownerId, userId),
          ),
        )
        .returning();

      if (updated.length === 0) {
        const [row] = await tx
          .select()
          .from(agentProfiles)
          .where(eq(agentProfiles.id, agent.id))
          .limit(1);
        if (row?.ownerId && row.ownerId !== userId) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You cannot delete this agent",
          });
        }
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No agent profile found",
        });
      }

      const profile = updated[0]!;
      const keys = await tx
        .select({ id: agentApiKeys.id })
        .from(agentApiKeys)
        .where(callerKeyWhere(profile.id, userId));

      if (keys.length === 0) return;

      const revoked = await tx
        .update(agentApiKeys)
        .set({ isActive: false })
        .where(callerKeyWhere(profile.id, userId))
        .returning();

      if (revoked.length > 0) return;

      const [foreign] = await tx
        .select({ id: agentApiKeys.id })
        .from(agentApiKeys)
        .where(
          and(
            eq(agentApiKeys.agentId, profile.id),
            eq(agentApiKeys.isActive, true),
            ne(agentApiKeys.ownerId, userId),
          ),
        )
        .limit(1);

      if (foreign) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You cannot delete this agent",
        });
      }
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Agent API keys could not be revoked",
      });
    });

    return { success: true };
  }),

  // ── API Keys ──────────────────────────────────────────────────────────────

  /** Generate a new API key for the current user's live agent (revokes existing keys).
   * An inactive profile must not receive a credential: auth rejects it, and
   * returning a new key would look like a successful rotate. */
  generateKey: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const [agent] = await ctx.db
      .select()
      .from(agentProfiles)
      .where(ownedLiveAgentWhere(userId))
      .limit(1);

    if (!agent) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No active agent profile found",
      });
    }

    const activeKeys = await ctx.db
      .select({ id: agentApiKeys.id })
      .from(agentApiKeys)
      .where(callerActiveKeyWhere(agent.id, userId));

    if (activeKeys.length > 0) {
      const revoked = await ctx.db
        .update(agentApiKeys)
        .set({ isActive: false })
        .where(callerActiveKeyWhere(agent.id, userId))
        .returning();

      if (revoked.length === 0) {
        const [foreign] = await ctx.db
          .select({ id: agentApiKeys.id })
          .from(agentApiKeys)
          .where(
            and(
              eq(agentApiKeys.agentId, agent.id),
              eq(agentApiKeys.isActive, true),
              ne(agentApiKeys.ownerId, userId),
            ),
          )
          .limit(1);
        if (foreign) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You cannot rotate this agent's API key",
          });
        }
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "API key could not be rotated",
        });
      }
    }

    const { raw, hash, prefix } = generateApiKey();

    await ctx.db.insert(agentApiKeys).values({
      agentId: agent.id,
      ownerId: userId,
      keyHash: hash,
      keyPrefix: prefix,
      isActive: true,
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
      .where(ownedLiveAgentWhere(userId))
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
        details:
          "API key is ready but no external tool has connected yet. Configure your n8n workflow or Claude CLI, then try again.",
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
        url: z.string().url().startsWith("https://", {
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
              "benchmark",
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

      // SSRF protection: block private/internal URLs
      const urlCheck = await validateWebhookUrl(input.url);
      if (!urlCheck.ok) {
        throw new TRPCError({ code: "BAD_REQUEST", message: urlCheck.reason });
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
    await ctx.db.delete(agentWebhooks).where(eq(agentWebhooks.ownerId, userId));
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

    // SSRF protection: re-validate stored URL before making outbound request
    const urlCheck = await validateWebhookUrl(webhook.url);
    if (!urlCheck.ok) {
      throw new TRPCError({ code: "BAD_REQUEST", message: urlCheck.reason });
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

    // The pinned transport checks every address it connects to and never
    // follows a redirect, so a 3xx fails the test instead of being chased.
    const res = await pinnedFetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-AIT-Signature": `sha256=${signature}`,
        "X-AIT-Event": "test",
      },
      body: payload,
      signal: AbortSignal.timeout(5000),
    }).catch((err: Error) => {
      // The address check at connect time refused what DNS answered.
      if (isBlockedAddress(err)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Webhook URL resolves to a private/internal address",
        });
      }
      return { ok: false as const, status: 0, statusText: String(err) };
    });

    if (res.status >= 300 && res.status < 400) {
      if ("body" in res) await releaseBody(res);
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Webhook test failed: redirects are not followed",
      });
    }
    if (!res.ok) {
      if ("body" in res) await releaseBody(res);
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Webhook test failed: ${res.statusText}`,
      });
    }

    await ctx.db
      .update(agentWebhooks)
      .set({ consecutiveFailures: 0, isEnabled: true })
      .where(eq(agentWebhooks.id, webhook.id));

    return { success: true };
  }),

  /** Approve an agent-proposed (pending) webhook: activate it and reveal the secret once. */
  approveWebhook: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const [webhook] = await ctx.db
      .select()
      .from(agentWebhooks)
      .where(
        and(
          eq(agentWebhooks.ownerId, userId),
          eq(agentWebhooks.status, "pending"),
        ),
      )
      .limit(1);

    if (!webhook) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No pending webhook proposal to approve",
      });
    }

    // SSRF protection: re-validate the proposed URL at approval time.
    const urlCheck = await validateWebhookUrl(webhook.url);
    if (!urlCheck.ok) {
      throw new TRPCError({ code: "BAD_REQUEST", message: urlCheck.reason });
    }

    await ctx.db
      .update(agentWebhooks)
      .set({ status: "active", isEnabled: true, consecutiveFailures: 0 })
      .where(eq(agentWebhooks.id, webhook.id));

    return { secret: webhook.secret };
  }),

  /** Reject (discard) an agent-proposed (pending) webhook. */
  rejectWebhook: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    await ctx.db
      .delete(agentWebhooks)
      .where(
        and(
          eq(agentWebhooks.ownerId, userId),
          eq(agentWebhooks.status, "pending"),
        ),
      );
    return { success: true };
  }),

  // ── Drafts ────────────────────────────────────────────────────────────────

  /** Get drafts for the current user, filtered by status. */
  listApprovalQueue: protectedProcedure.query(async ({ ctx }) => {
    return listApprovalQueue(ctx.db, {
      id: ctx.session.user.id,
      newsStaff: await isNewsStaff(ctx.session.user.email),
    });
  }),

  getDrafts: protectedProcedure
    .input(
      z.object({
        status: z.enum(["pending", "approved", "rejected"]).default("pending"),
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
            // ritual_suggestion drafts are reviewed on the Rituals page, not here.
            ne(agentDrafts.type, "ritual_suggestion"),
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

      // 1. Read the draft and authorize BEFORE the CAS status flip, branched
      //    by draft type. Owner-scoped legacy types check ownerId; community-
      //    scoped types check the caller's active role in the draft's community.
      const [existing] = await ctx.db
        .select()
        .from(agentDrafts)
        .where(eq(agentDrafts.id, input.draftId))
        .limit(1);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Draft not found" });
      }

      // Ritual suggestions are reviewed via rituals.reviewSuggestion (which
      // CREATES a ritual on approve). Reviewing them here would CAS-flip their
      // status without creating a ritual, permanently consuming them.
      if (existing.type === "ritual_suggestion") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Review ritual suggestions from the community's Rituals page.",
        });
      }

      if (existing.type === "news_storyline" && input.action === "approved") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Approve this news storyline from its review page. Approval publishes the story.",
        });
      }

      if (existing.type === "magazine_issue" && input.action === "approved") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Approve this magazine issue from its review page. Approval publishes the issue. Subscriber email goes out only after that publish.",
        });
      }

      const themeToApply =
        existing.type === "magazine_theme" && input.action === "approved"
          ? magazineThemeFromDraft(existing)
          : null;
      if (
        existing.type === "magazine_theme" &&
        input.action === "approved" &&
        !themeToApply
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This theme draft is not a valid type pair and accent.",
        });
      }

      // Community-scoped draft types: any qualifying admin of the draft's
      // community may act (ADR-0016). Everything else is owner-scoped.
      const COMMUNITY_SCOPED_ROLES: Record<string, string[]> = {
        welcome_nudge: ["owner", "admin", "moderator"],
        broadcast: ["owner", "admin"],
      };
      const allowedRoles = COMMUNITY_SCOPED_ROLES[existing.type];
      if (allowedRoles) {
        const communityId = (existing.metadata as { communityId?: string })
          ?.communityId;
        if (!communityId) throw new TRPCError({ code: "FORBIDDEN" });
        const [m] = await ctx.db
          .select({ role: communityMemberships.role })
          .from(communityMemberships)
          .where(
            and(
              eq(communityMemberships.communityId, communityId),
              eq(communityMemberships.userId, userId),
              eq(communityMemberships.status, "active"),
            ),
          )
          .limit(1);
        if (!m || !allowedRoles.includes(m.role)) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
      } else {
        // Owner-scoped (thread_reply, revival_nudge, feed_post, feed_comment,
        // knowledge_share, challenge_channel_*, and any future owner draft).
        if (existing.ownerId !== userId) {
          const allowed = await communityOwnerMayReview(
            ctx.db,
            userId,
            existing,
          );
          if (!allowed) throw new TRPCError({ code: "FORBIDDEN" });
        }
      }

      if (themeToApply) {
        await assertMagazineThemeManageable(
          { db: ctx.db, payload: await getPayloadClient() },
          userId,
          themeToApply,
        );
      }

      // Parse before the status flip so a damaged draft stays pending.
      const threadToPublish =
        existing.type === FORUM_THREAD_DRAFT_TYPE && input.action === "approved"
          ? forumThreadFromDraft(existing)
          : undefined;
      const classroomToPublish =
        existing.type === CLASSROOM_COURSE_DRAFT_TYPE &&
        input.action === "approved"
          ? await assertClassroomDraftPublishable(
              await getPayloadClient(),
              existing,
            )
          : undefined;
      const classroomUpdate =
        existing.type === CLASSROOM_COURSE_UPDATE_DRAFT_TYPE &&
        input.action === "approved"
          ? classroomCourseUpdateFromDraft(existing)
          : undefined;
      const classroomModule =
        existing.type === CLASSROOM_MODULE_DRAFT_TYPE &&
        input.action === "approved"
          ? classroomModuleFromDraft(existing)
          : undefined;
      const classroomLesson =
        existing.type === CLASSROOM_LESSON_DRAFT_TYPE &&
        input.action === "approved"
          ? classroomLessonFromDraft(existing)
          : undefined;
      const articleUpdate =
        existing.type === MAGAZINE_ARTICLE_UPDATE_DRAFT_TYPE &&
        input.action === "approved"
          ? magazineArticleUpdateFromDraft(existing)
          : undefined;
      const authorName =
        (await memberDisplayName(ctx.db, userId)) ?? "Community member";

      // A feed post draft's picture is fetched before the draft is claimed,
      // so a picture that cannot be loaded leaves the draft pending instead
      // of approved-but-unpublished. Agents attach pictures by address; it is
      // copied into our storage as the owner's feed post image, so readers
      // never load an outside address. If the claim then fails, the unused
      // image is removed by the daily sweep.
      const feedMeta =
        existing.type === "feed_post"
          ? (existing.metadata as {
              imageUrl?: string | null;
              imageMediaId?: number | null;
              imageAlt?: string | null;
            } | null)
          : null;
      const draftImageUrl =
        input.action === "approved"
          ? (feedMeta?.imageUrl ?? undefined)
          : undefined;
      const draftImageMediaId =
        input.action === "approved" &&
        typeof feedMeta?.imageMediaId === "number"
          ? feedMeta.imageMediaId
          : undefined;
      // A media id is stored with the URL it resolved to. That pair is one
      // picture, not two sources. A URL without a media id is copied in.
      const image = draftImageMediaId
        ? {
            id: draftImageMediaId,
            url: await sharedMediaUrl(
              await getPayloadClient(),
              draftImageMediaId,
              userId,
            ),
          }
        : draftImageUrl
          ? await importFeedImage(await getPayloadClient(), {
              url: draftImageUrl,
              userId,
              alt: feedMeta?.imageAlt,
            })
          : null;
      const issueUpdate =
        existing.type === MAGAZINE_ISSUE_UPDATE_DRAFT_TYPE &&
        input.action === "approved"
          ? magazineIssueUpdateFromDraft(existing)
          : undefined;
      const deletion =
        existing.type === MAGAZINE_DELETE_DRAFT_TYPE &&
        input.action === "approved"
          ? magazineDeleteFromDraft(existing)
          : undefined;
      if (deletion?.collection === "articles") {
        await assertArticleNotPlaced(await getPayloadClient(), deletion.id);
      }

      // 2. CAS claim: only the caller who flips pending→action proceeds.
      const [draft] = await ctx.db
        .update(agentDrafts)
        .set({ status: input.action })
        .where(
          and(
            eq(agentDrafts.id, input.draftId),
            eq(agentDrafts.status, "pending"),
          ),
        )
        .returning();

      if (!draft) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Already reviewed",
        });
      }

      // Approving a thread draft publishes it in the reviewer's name, the
      // same path as the forum form. The agent never writes the live row.
      if (
        input.action === "approved" &&
        draft.type === FORUM_THREAD_DRAFT_TYPE &&
        threadToPublish
      ) {
        await createForumThread(
          ctx.db,
          { id: userId, type: "member" },
          { id: userId, name: authorName },
          threadToPublish,
        );
      }

      // If approved and it's a thread reply, publish it via Payload.
      if (input.action === "approved" && draft.type === "thread_reply") {
        const payload = await getPayloadClient();
        const [agent] = await ctx.db
          .select()
          .from(agentProfiles)
          .where(eq(agentProfiles.id, draft.agentId))
          .limit(1);

        if (agent && draft.targetId) {
          // Defense-in-depth: re-validate that the draft's target thread
          // actually belongs to the draft's community before publishing. The
          // draft carries the community it was authored against; never trust
          // that targetId points at a thread in that community.
          const thread = await payload.findByID({
            collection: "forum-threads",
            id: Number(draft.targetId),
          });
          const draftCommunityId = (draft.metadata as { communityId?: string })
            ?.communityId;
          if (
            draftCommunityId &&
            thread.communityId &&
            thread.communityId !== draftCommunityId
          ) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Target thread does not belong to this community",
            });
          }

          await payload.create({
            collection: "forum-replies",
            data: {
              thread: Number(draft.targetId),
              content: plainTextToLexical(draft.content ?? ""),
              authorId: agent.id,
              authorName: `${agent.name} (AI)`,
            },
          });
          await syncForumThreadCounters(payload, Number(draft.targetId), {
            touch: true,
          });
        }
      }

      // Feed drafts are reviewed in the agent draft queue. Publishing must create
      // the actual Payload feed records; otherwise approval only flips status and
      // the post never appears on the community feed.
      if (input.action === "approved" && draft.type === "feed_post") {
        if (!draft.targetId) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Feed post draft is missing a target community.",
          });
        }
        const payload = await getPayloadClient();
        await payload.create({
          collection: "feed-posts",
          data: {
            content: draft.content ?? "",
            images: image ? [image.id] : [],
            ...(draftImageMediaId !== undefined
              ? { imageMediaId: draftImageMediaId }
              : {}),
            ...(feedMeta?.imageAlt !== undefined
              ? { imageAlt: feedMeta.imageAlt }
              : {}),
            authorId: userId,
            authorName,
            communityId: draft.targetId,
            topicSlug: "general",
            visibility: "community",
          },
        });
      }

      if (input.action === "approved" && draft.type === "feed_comment") {
        if (!draft.targetId) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Feed comment draft is missing a target post.",
          });
        }
        const payload = await getPayloadClient();
        const post = await payload.findByID({
          collection: "feed-posts",
          id: Number(draft.targetId),
        });
        await payload.create({
          collection: "feed-comments",
          data: {
            post: Number(draft.targetId),
            content: draft.content ?? "",
            authorId: userId,
            authorName,
            communityId: post.communityId ?? null,
          },
        });
        await syncFeedPostCounters(payload, post.id);
      }

      if (
        input.action === "approved" &&
        draft.type === CLASSROOM_COURSE_DRAFT_TYPE &&
        classroomToPublish
      ) {
        await publishClassroomCourseDraft(
          ctx.db,
          await getPayloadClient(),
          userId,
          authorName,
          classroomToPublish,
        );
      }

      if (
        input.action === "approved" &&
        draft.type === CLASSROOM_COURSE_UPDATE_DRAFT_TYPE &&
        classroomUpdate
      ) {
        await publishClassroomCourseUpdate(
          ctx.db,
          await getPayloadClient(),
          userId,
          classroomUpdate,
        );
      }

      if (
        input.action === "approved" &&
        draft.type === CLASSROOM_MODULE_DRAFT_TYPE &&
        classroomModule
      ) {
        await publishClassroomModule(await getPayloadClient(), classroomModule);
      }

      if (
        input.action === "approved" &&
        draft.type === CLASSROOM_LESSON_DRAFT_TYPE &&
        classroomLesson
      ) {
        await publishClassroomLesson(await getPayloadClient(), classroomLesson);
      }

      const revertDraft = async () => {
        await ctx.db
          .update(agentDrafts)
          .set({ status: "pending" })
          .where(eq(agentDrafts.id, draft.id));
      };
      if (input.action === "approved" && issueUpdate) {
        try {
          await applyMagazineIssueUpdate(await getPayloadClient(), issueUpdate);
        } catch (error) {
          await revertDraft();
          throw error;
        }
      }
      if (input.action === "approved" && deletion) {
        try {
          await applyApprovedMagazineDelete(await getPayloadClient(), deletion);
        } catch (error) {
          await revertDraft();
          throw error;
        }
      }
      if (
        input.action === "approved" &&
        draft.type === MAGAZINE_ARTICLE_UPDATE_DRAFT_TYPE &&
        articleUpdate
      ) {
        try {
          await applyMagazineArticleUpdate(
            await getPayloadClient(),
            articleUpdate,
          );
        } catch (error) {
          await revertDraft();
          throw error;
        }
      }
      if (input.action === "approved" && themeToApply) {
        try {
          await applyMagazineTheme(await getPayloadClient(), themeToApply);
        } catch (error) {
          await revertDraft();
          throw error;
        }
      }

      // Revival/welcome nudge: approving opens/sends a DM from the organizer to the member.
      if (
        input.action === "approved" &&
        (draft.type === "revival_nudge" || draft.type === "welcome_nudge") &&
        draft.targetId
      ) {
        const communityId = (draft.metadata as { communityId?: string })
          ?.communityId;
        if (communityId) {
          const [stillMember] = await ctx.db
            .select({ userId: communityMemberships.userId })
            .from(communityMemberships)
            .where(
              and(
                eq(communityMemberships.communityId, communityId),
                eq(communityMemberships.userId, draft.targetId),
                eq(communityMemberships.status, "active"),
              ),
            )
            .limit(1);
          if (!stillMember) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Target is no longer an active member of this community.",
            });
          }
        }
        await sendDirectMessage(
          ctx.db,
          userId,
          draft.targetId,
          draft.content ?? "",
        );
      }

      // Broadcast: approving composes & sends the broadcast in the reviewer's name.
      if (input.action === "approved" && draft.type === "broadcast") {
        const meta = (draft.metadata ?? {}) as {
          communityId?: string;
          subject?: string;
        };
        if (!meta.communityId || !meta.subject) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Broadcast draft metadata is malformed — cannot send.",
          });
        }
        await sendCommunityBroadcast(ctx.db, {
          communityId: meta.communityId,
          authorId: userId,
          subject: meta.subject,
          body: draft.content ?? "",
        });
      }

      return draft;
    }),

  // ── Suggestions ───────────────────────────────────────────────────────────

  /** Get suggestions for the current user, filtered by status. */
  getSuggestions: protectedProcedure
    .input(
      z.object({
        status: z.enum(["pending", "approved", "rejected"]).default("pending"),
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

  /** Approve an introduction suggestion → create the introduction (pending
   *  consent) and notify both members to consent. */
  approveIntroduction: protectedProcedure
    .input(z.object({ suggestionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const [sug] = await ctx.db
        .select()
        .from(agentSuggestions)
        .where(
          and(
            eq(agentSuggestions.id, input.suggestionId),
            eq(agentSuggestions.ownerId, userId),
            eq(agentSuggestions.status, "pending"),
          ),
        )
        .limit(1);
      if (sug?.type !== "introduction") {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Introduction suggestion not found",
        });
      }
      const meta = (sug.metadata ?? {}) as {
        communityId?: string;
        userIdA?: string;
        userIdB?: string;
        pairKey?: string;
        sharedInterests?: string[];
      };
      if (!meta.communityId || !meta.userIdA || !meta.userIdB) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Malformed suggestion metadata",
        });
      }
      const communityId = meta.communityId;
      const userIdA = meta.userIdA;
      const userIdB = meta.userIdB;
      const key = meta.pairKey ?? pairKey(userIdA, userIdB);

      // Defense-in-depth: verify the caller is still an active owner/admin of
      // this community at the time of approval (role may have changed since the
      // agent filed the suggestion).
      const membership = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, communityId),
          eq(communityMemberships.userId, userId),
          eq(communityMemberships.status, "active"),
        ),
      });
      if (
        !membership ||
        (membership.role !== "owner" && membership.role !== "admin")
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Requires admin/owner of this community",
        });
      }

      // Pre-check for an existing non-declined intro for this pair before inserting.
      const existingIntro = await ctx.db
        .select({ id: introductions.id })
        .from(introductions)
        .where(
          and(
            eq(introductions.communityId, communityId),
            eq(introductions.pairKey, key),
            ne(introductions.status, "declined"),
          ),
        )
        .limit(1);
      if (existingIntro.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "An introduction for this pair already exists",
        });
      }

      let introId: string;
      try {
        const [intro] = await ctx.db
          .insert(introductions)
          .values({
            communityId,
            suggestedByAgentId: sug.agentId,
            organizerId: userId,
            userIdA,
            userIdB,
            pairKey: key,
            sharedInterests: meta.sharedInterests ?? [],
          })
          .returning({ id: introductions.id });
        introId = intro!.id;
      } catch (err) {
        // Partial unique index (introduction_open_pair_uidx) → race backstop.
        console.error("approveIntroduction failed", {
          suggestionId: input.suggestionId,
          code: (err as { code?: string })?.code,
        });
        throw new TRPCError({
          code: "CONFLICT",
          message: "An open introduction for this pair already exists",
        });
      }

      await ctx.db.insert(notifications).values([
        {
          userId: userIdA,
          type: "introduction_request",
          title: "Someone would like to connect",
          content:
            "A community organizer thinks you'd hit it off with another member. Want to connect?",
          communityId,
          metadata: { introId },
        },
        {
          userId: userIdB,
          type: "introduction_request",
          title: "Someone would like to connect",
          content:
            "A community organizer thinks you'd hit it off with another member. Want to connect?",
          communityId,
          metadata: { introId },
        },
      ]);

      await ctx.db
        .update(agentSuggestions)
        .set({ status: "approved" })
        .where(eq(agentSuggestions.id, sug.id));
      return { introId };
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
      .where(ownedLiveAgentWhere(userId))
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
      if (agent.claimTokenExpiresAt && new Date() > agent.claimTokenExpiresAt)
        return null;

      return agent;
    }),

  claimAgent: protectedProcedure
    .input(
      z
        .object({
          token: z.string().optional(),
          agentId: z.string().optional(),
        })
        .refine((d) => d.token ?? d.agentId, "Provide either token or agentId"),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // A soft-deleted profile must not occupy the one-agent slot.
      const [existing] = await ctx.db
        .select({ id: agentProfiles.id })
        .from(agentProfiles)
        .where(ownedLiveAgentWhere(userId))
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

      if (
        agentQuery.claimTokenExpiresAt &&
        new Date() > agentQuery.claimTokenExpiresAt
      ) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "This claim link has expired.",
        });
      }

      // Drop owner_id on inactive rows first. The column is UNIQUE, so the
      // claim update below cannot assign it while a soft-deleted profile holds it.
      await releaseInactiveOwnerSlot(ctx.db, userId);

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

      // Auto-accept the agent manifest on the owner's behalf (ADR-0017):
      // claiming forms the owner↔agent binding, which is the acceptance moment.
      await ctx.db
        .insert(agentManifestAcceptances)
        .values({
          ownerId: userId,
          agentId: agentQuery.id,
          manifestVersion: MANIFEST_VERSION,
        })
        .onConflictDoNothing();

      await logActivity(ctx.db, {
        actorId: userId,
        actorType: "member",
        action: "agent.claimed",
        targetType: "agent_profile",
        targetId: agentQuery.id,
        metadata: {
          agentName: agentQuery.name,
          method: input.token ? "magic-link" : "dashboard",
        },
      });

      return {
        success: true,
        agentId: agentQuery.id,
        agentName: agentQuery.name,
      };
    }),

  // ── Verification ───────────────────────────────────────────────────────

  startVerification: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const [agent] = await ctx.db
      .select({
        id: agentProfiles.id,
        name: agentProfiles.name,
        isVerified: agentProfiles.isVerified,
      })
      .from(agentProfiles)
      .where(eq(agentProfiles.ownerId, userId))
      .limit(1);

    if (!agent) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No agent profile found",
      });
    }

    if (agent.isVerified) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Agent is already verified",
      });
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
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No agent profile found",
        });
      }

      if (agent.isVerified) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Agent is already verified",
        });
      }

      if (!agent.verificationCode) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Start verification first",
        });
      }

      if (!TWEET_URL_REGEX.test(input.tweetUrl)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Invalid tweet URL. Must be a twitter.com or x.com status URL.",
        });
      }

      const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(input.tweetUrl)}&omit_script=true`;
      let oembedData: TweetOembed | null = null;

      try {
        const response = await fetch(oembedUrl);
        if (!response.ok) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Could not fetch tweet. Make sure it exists and is public.",
          });
        }
        oembedData = (await response.json()) as TweetOembed;
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Could not fetch tweet. Make sure it exists and is public.",
        });
      }

      const result = verifyOembed(oembedData, agent.verificationCode);
      if (!result.ok) {
        throw new TRPCError({ code: "BAD_REQUEST", message: result.reason });
      }
      const xHandle = result.xHandle;

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

  // ── Manifest ─────────────────────────────────────────────────────────────

  /** Get the current agent manifest + whether the caller has accepted it. */
  getManifest: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const accepted = await hasAcceptedCurrentManifest(ctx.db, userId);
    return {
      version: MANIFEST_VERSION,
      text: renderManifestText(),
      invariants: AGENT_MANIFEST_INVARIANTS,
      accepted,
    };
  }),

  /** Accept the current manifest version — unlocks the agent's contribute scope. */
  acceptManifest: protectedProcedure
    .input(z.object({ version: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      if (input.version !== MANIFEST_VERSION) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "This manifest version is out of date. Refresh and accept the current version.",
        });
      }
      const userId = ctx.session.user.id;

      // One owner has at most one agent; acceptance may be recorded before the
      // owner has an agent row, so agentId is nullable.
      const [agent] = await ctx.db
        .select({ id: agentProfiles.id })
        .from(agentProfiles)
        .where(eq(agentProfiles.ownerId, userId))
        .limit(1);

      // Idempotent at the DB level: the (ownerId, manifestVersion) unique index
      // dedupes concurrent first-time accepts, avoiding duplicate audit rows.
      await ctx.db
        .insert(agentManifestAcceptances)
        .values({
          ownerId: userId,
          agentId: agent?.id ?? null,
          manifestVersion: MANIFEST_VERSION,
        })
        .onConflictDoNothing();

      return { accepted: true, version: MANIFEST_VERSION };
    }),

  // ── Dashboard ────────────────────────────────────────────────────────────

  getClaimHistory: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const [agent] = await ctx.db
      .select({ id: agentProfiles.id })
      .from(agentProfiles)
      .where(eq(agentProfiles.ownerId, userId))
      .limit(1);

    if (!agent) return [];

    const lifecycleActions = [
      "agent.created",
      "agent.self-registered",
      "agent.claimed",
      "agent.verified",
    ];

    const events = await ctx.db
      .select({
        id: activityEvents.id,
        action: activityEvents.action,
        metadata: activityEvents.metadata,
        createdAt: activityEvents.createdAt,
      })
      .from(activityEvents)
      .where(
        and(
          sql`${activityEvents.action} = ANY(ARRAY[${sql.join(
            lifecycleActions.map((a) => sql`${a}`),
            sql`, `,
          )}])`,
          sql`(${activityEvents.actorId} = ${userId} OR ${activityEvents.actorId} = ${agent.id})`,
        ),
      )
      .orderBy(desc(activityEvents.createdAt))
      .limit(20);

    return events;
  }),

  getAgentActivity: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
        cursor: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const [agent] = await ctx.db
        .select({ id: agentProfiles.id })
        .from(agentProfiles)
        .where(eq(agentProfiles.ownerId, userId))
        .limit(1);

      if (!agent) return { events: [], nextCursor: null };

      const conditions = [
        eq(activityEvents.actorId, agent.id),
        eq(activityEvents.actorType, "agent"),
      ];

      if (input.cursor) {
        conditions.push(lt(activityEvents.createdAt, new Date(input.cursor)));
      }

      const events = await ctx.db
        .select({
          id: activityEvents.id,
          action: activityEvents.action,
          targetType: activityEvents.targetType,
          targetId: activityEvents.targetId,
          metadata: activityEvents.metadata,
          createdAt: activityEvents.createdAt,
        })
        .from(activityEvents)
        .where(and(...conditions))
        .orderBy(desc(activityEvents.createdAt))
        .limit(input.limit + 1);

      const hasMore = events.length > input.limit;
      const items = hasMore ? events.slice(0, input.limit) : events;
      const nextCursor = hasMore
        ? items[items.length - 1]!.createdAt.toISOString()
        : null;

      return { events: items, nextCursor };
    }),
});
