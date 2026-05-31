// src/app/api/mcp/advisory-tools.ts
//
// Advisory MCP tool registrations (ADR-0015 — agent advises, human acts).
// Registers 11 tools: 5 read + 6 write (suggest).

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
    "new-joiner-intro-candidates",
    {
      description:
        "List members who joined a community you organize in the last N days, with their interests/skills, so you can pick pairs to introduce. Pair them via suggest-introduction (the organizer approves; both members must consent). Requires agent advisory enabled.",
      inputSchema: {
        slug: z.string().describe("Slug of a community you organize."),
        days: z
          .number()
          .int()
          .min(1)
          .max(30)
          .optional()
          .describe("How many days back to look (default 14)."),
      },
    },
    async ({ slug, days }) => {
      const result = await caller.advisory.newJoinerIntroCandidates({
        slug,
        days: days ?? 14,
      });
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

  server.registerTool(
    "get-unactivated-newcomers",
    {
      description:
        "List members of a community you organize who joined recently (3–30 days ago) but have never contributed yet, so you can draft a warm welcome for the organizer to send. Requires agent advisory to be enabled for that community.",
      inputSchema: {
        slug: z.string().describe("Slug of a community you organize."),
      },
    },
    async ({ slug }) => {
      const result = await caller.advisory.unactivatedNewcomers({ slug });
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  server.registerTool(
    "newcomers-awaiting-response",
    {
      description:
        "List newcomers in a community you organize whose first post (a forum thread or feed post) is still unanswered, so you can draft a warm reply for an admin to post in their own name. Requires agent advisory to be enabled for that community.",
      inputSchema: {
        slug: z.string().describe("Slug of a community you organize."),
      },
    },
    async ({ slug }) => {
      const result = await caller.advisory.newcomersAwaitingResponse({ slug });
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

  server.registerTool(
    "suggest-welcome",
    {
      description:
        "Draft a warm welcome DM for an un-activated newcomer, saved for an admin to review and send in their own name. You never send it yourself.",
      inputSchema: {
        slug: z.string().describe("Slug of a community you organize."),
        memberUserId: z.string().describe("The newcomer's user id."),
        message: z
          .string()
          .min(1)
          .max(2000)
          .describe("A personalized warm-welcome message draft."),
      },
    },
    async ({ slug, memberUserId, message }) => {
      const result = await caller.advisory.suggestWelcome({
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

  server.registerTool(
    "suggest-greeting",
    {
      description:
        "Draft a warm reply to a newcomer's unanswered first post, saved for an admin to review and post in their own name. Completes the activation reciprocity. You never post it yourself.",
      inputSchema: {
        slug: z.string().describe("Slug of a community you organize."),
        threadId: z
          .number()
          .describe("Numeric id of the forum thread to reply to."),
        message: z
          .string()
          .min(1)
          .max(2000)
          .describe("A warm, personalized reply draft."),
      },
    },
    async ({ slug, threadId, message }) => {
      const result = await caller.advisory.suggestGreeting({
        slug,
        threadId,
        message,
      });
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  server.registerTool(
    "suggest-broadcast",
    {
      description:
        "Draft a time-sensitive announcement for an admin to review and send to the community in their own name. You never send it yourself; the broadcast ceiling applies on send.",
      inputSchema: {
        slug: z.string().describe("Slug of a community you organize."),
        subject: z.string().min(1).max(200).describe("Broadcast subject line."),
        body: z.string().min(1).max(5000).describe("Broadcast body copy."),
      },
    },
    async ({ slug, subject, body }) => {
      const result = await caller.advisory.suggestBroadcast({
        slug,
        subject,
        body,
      });
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  server.registerTool(
    "propose-ritual",
    {
      description:
        "Draft a recurring community ritual (a weekly prompt thread) for an admin to review and approve. You never create rituals directly — the admin approves your draft.",
      inputSchema: {
        slug: z.string().describe("Slug of a community you organize."),
        title: z.string().describe("Thread title for the ritual prompt."),
        body: z.string().describe("Thread body / prompt copy."),
        category: z
          .enum(["general", "question", "showcase", "job"])
          .default("general")
          .describe("Forum category for the posted thread."),
        weekday: z
          .number()
          .min(0)
          .max(6)
          .describe("Day of week to post (0=Sunday .. 6=Saturday)."),
        mode: z
          .enum(["auto", "review"])
          .default("review")
          .describe(
            "auto = system posts each week automatically; review = an admin approves each occurrence.",
          ),
      },
    },
    async ({ slug, title, body, category, weekday, mode }) => {
      const result = await caller.advisory.suggestRitual({
        slug,
        title,
        body,
        category,
        weekday,
        mode,
      });
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );
}
