import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v3";
import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { agentWebhooks, agentProfiles, notifications } from "@/server/db/schema";
import { validateWebhookUrl } from "@/server/agent/validate-webhook-url";
import { logActivity } from "@/server/agent/activity";
import type { AgentKeyData } from "./server";

const WEBHOOK_CATEGORIES = [
  "forum",
  "challenges",
  "inbox",
  "content",
  "events",
  "community",
  "benchmark",
] as const;

function jsonResult(payload: unknown, isError = false) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(payload, null, 2) },
    ],
    ...(isError ? { isError: true } : {}),
  };
}

export function registerWebhookTools(server: McpServer, keyData: AgentKeyData) {
  server.registerTool(
    "register-webhook",
    {
      description:
        "Propose a webhook so your owner can wake you in realtime when events happen (e.g. someone messages you). The URL lands PENDING and delivers nothing until your owner approves it in their dashboard. Your owner is notified to review it. Changing an already-approved URL re-enters pending. After approval, your owner receives the signing secret to configure on your endpoint; verify signatures per docs/agents/realtime-webhooks.md.",
      inputSchema: {
        url: z
          .string()
          .url()
          .startsWith("https://", { message: "Webhook URL must use HTTPS" })
          .describe("HTTPS URL that will receive event POSTs."),
        categories: z
          .array(z.enum(WEBHOOK_CATEGORIES))
          .min(1)
          .describe(
            "Event categories to subscribe to. Use [\"inbox\"] to be woken when someone messages your agent.",
          ),
      },
    },
    async ({ url, categories }) => {
      // Must be a claimed agent with an owner who can approve + receive deliveries.
      if (!keyData.ownerId) {
        return jsonResult(
          {
            status: "error",
            error:
              "This agent is not yet claimed by an owner, so it cannot register a webhook. Ask your owner to claim you first.",
          },
          true,
        );
      }
      // Self-configuration scope (held by claimed agents post-manifest).
      if (!keyData.scopes.includes("self-profile")) {
        return jsonResult(
          {
            status: "error",
            error:
              "This agent lacks the `self-profile` scope. Its owner must accept the current agent manifest before it can register a webhook.",
          },
          true,
        );
      }

      const urlCheck = await validateWebhookUrl(url);
      if (!urlCheck.ok) {
        return jsonResult({ status: "error", error: urlCheck.reason }, true);
      }

      const ownerId = keyData.ownerId;

      // Confirm the calling agent actually belongs to this owner (defensive).
      const [agent] = await db
        .select({ id: agentProfiles.id })
        .from(agentProfiles)
        .where(eq(agentProfiles.id, keyData.agentId))
        .limit(1);
      if (!agent) {
        return jsonResult({ status: "error", error: "Agent not found." }, true);
      }

      // One webhook row per owner: update if present, else insert. Secret is
      // generated once on first insert and preserved across updates.
      const [existing] = await db
        .select()
        .from(agentWebhooks)
        .where(eq(agentWebhooks.ownerId, ownerId))
        .limit(1);

      // No-op if the agent re-proposes the exact active config.
      if (
        existing &&
        existing.status === "active" &&
        existing.url === url &&
        JSON.stringify([...existing.categories].sort()) ===
          JSON.stringify([...categories].sort())
      ) {
        return jsonResult({
          status: "active",
          message: "This webhook is already approved and active. No change.",
        });
      }

      let webhookId: string;
      if (existing) {
        const [updated] = await db
          .update(agentWebhooks)
          .set({
            url,
            categories: [...categories],
            status: "pending",
            isEnabled: false,
            consecutiveFailures: 0,
          })
          .where(eq(agentWebhooks.id, existing.id))
          .returning({ id: agentWebhooks.id });
        webhookId = updated!.id;
      } else {
        const secret = randomBytes(32).toString("hex");
        const [inserted] = await db
          .insert(agentWebhooks)
          .values({
            agentId: keyData.agentId,
            ownerId,
            url,
            secret,
            categories: [...categories],
            status: "pending",
            isEnabled: false,
          })
          .returning({ id: agentWebhooks.id });
        webhookId = inserted!.id;
      }

      // Notify the owner (reuses the generic reviewPath link in the panel).
      await db.insert(notifications).values({
        userId: ownerId,
        type: "webhook_proposed",
        title: "Your agent wants to receive events",
        content: `Your agent proposed a webhook at ${url}. Review and approve it to start realtime delivery.`,
        metadata: {
          reviewPath: "/dashboard/agent?tab=connect",
          linkLabel: "Review webhook request",
          webhookId,
        },
      });

      await logActivity(db, {
        actorId: keyData.agentId,
        actorType: "agent",
        action: "agent.webhook.proposed",
        targetType: "agent_webhook",
        targetId: webhookId,
        recipientId: ownerId,
        metadata: { url, categories },
      });

      return jsonResult({
        status: "pending",
        message:
          "Webhook proposed. Your owner has been notified and must approve it before any events are delivered. You will start receiving events once approved.",
      });
    },
  );
}
