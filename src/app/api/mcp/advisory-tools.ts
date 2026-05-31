// src/app/api/mcp/advisory-tools.ts
//
// Advisory MCP tool registrations (ADR-0015 — agent advises, human acts).
// Registers 4 tools: 2 read + 2 write (suggest).

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v3";
import type { createCaller } from "@/server/api/root";

type Caller = ReturnType<typeof createCaller>;

export function registerAdvisoryTools(
  server: McpServer,
  caller: Caller,
  _keyData: { ownerId: string | null; agentId: string },
): void {
  // ── Read tools ──────────────────────────────────────────────────────────────

  server.registerTool(
    "get-at-risk-members",
    {
      description:
        "List members of a community you organize who were active before but have recently gone quiet (at-risk), so you can draft a re-engagement nudge for the organizer to send. Requires agent advisory to be enabled for that community.",
      inputSchema: {
        slug: z.string().describe("Slug of a community you organize."),
      },
    },
    async ({ slug }) => {
      const result = await caller.advisory.atRiskMembers({ slug });
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  server.registerTool(
    "get-intro-candidates",
    {
      description:
        "Get ranked pairs of members in a community you organize who share interests/skills — candidates to introduce. Returns member ids and the shared tags; pick a good pair, then call suggest-introduction.",
      inputSchema: {
        slug: z.string().describe("Slug of a community you organize."),
      },
    },
    async ({ slug }) => {
      const result = await caller.advisory.introCandidates({ slug });
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  // ── Write (suggest) tools ────────────────────────────────────────────────────

  server.registerTool(
    "suggest-introduction",
    {
      description:
        "Suggest introducing two members to the community organizer for approval. You never connect people yourself — the organizer approves, then BOTH members must consent before any connection is made (ADR-0015).",
      inputSchema: {
        slug: z.string().describe("Slug of a community you organize."),
        userIdA: z.string().describe("First member's user id."),
        userIdB: z.string().describe("Second member's user id."),
        reason: z
          .string()
          .min(1)
          .max(1000)
          .describe("Why these two should connect."),
      },
    },
    async ({ slug, userIdA, userIdB, reason }) => {
      const result = await caller.advisory.suggestIntroduction({
        slug,
        userIdA,
        userIdB,
        reason,
      });
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  server.registerTool(
    "suggest-revival",
    {
      description:
        "Draft a re-engagement (revival) message for an at-risk member, saved for the organizer to review and send in their own name. You never send it yourself.",
      inputSchema: {
        slug: z.string().describe("Slug of a community you organize."),
        memberUserId: z.string().describe("The at-risk member's user id."),
        message: z
          .string()
          .min(1)
          .max(2000)
          .describe("A personalized re-engagement message draft."),
      },
    },
    async ({ slug, memberUserId, message }) => {
      const result = await caller.advisory.suggestRevival({
        slug,
        memberUserId,
        message,
      });
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );
}
