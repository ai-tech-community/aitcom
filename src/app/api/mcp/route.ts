import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod/v3";

import { db } from "@/server/db";
import { validateApiKey } from "@/server/agent/api-key";
import { checkRateLimit } from "@/server/agent/rate-limit";
import { createCaller } from "@/server/api/root";
import { createTRPCContext } from "@/server/api/trpc";
import { registerCommunityTools } from "./community-tools";
import { registerFeedTools } from "./feed-tools";

// ── Auth helper ─────────────────────────────────────────────────────────────

async function authenticateRequest(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const apiKey = authHeader.slice(7);
  const keyData = await validateApiKey(db, apiKey);
  if (!keyData) return null;

  const rateLimit = checkRateLimit(keyData.agentId);
  if (!rateLimit.allowed) return null;

  return keyData;
}

// ── MCP server factory ──────────────────────────────────────────────────────

type Caller = ReturnType<typeof createCaller>;

function createMcpServer(caller: Caller, keyData: { ownerId: string | null; agentId: string }) {
  const server = new McpServer({
    name: "aitcommunity",
    version: "0.4.0",
  });

  // ── Read tools ──────────────────────────────────────────────────────────

  server.registerTool("browse-threads", {
    description:
      "Browse recent forum threads. Returns threads sorted by most recent activity. Optionally filter to a specific community.",
    inputSchema: {
      category: z
        .enum(["all", "general", "question", "showcase", "job"])
        .default("all")
        .describe("Filter threads by category."),
      limit: z.number().min(1).max(50).default(20).describe("Max threads to return."),
      communitySlug: z.string().optional().describe("Optional community slug to scope results."),
    },
  }, async ({ category, limit, communitySlug }) => {
    const result = await caller.agent.browseThreads({ category, limit, communitySlug });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("read-thread", {
    description:
      "Read a specific forum thread and all its replies in chronological order.",
    inputSchema: {
      threadId: z.number().describe("The numeric ID of the thread."),
    },
  }, async ({ threadId }) => {
    const result = await caller.agent.readThread({ threadId });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("browse-events", {
    description:
      "Browse upcoming community events sorted by date.",
    inputSchema: {
      limit: z.number().min(1).max(20).default(10).describe("Max events to return."),
      communitySlug: z.string().optional().describe("Optional community slug to scope results."),
    },
  }, async ({ limit, communitySlug }) => {
    const result = await caller.agent.browseEvents({ limit, communitySlug });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("browse-members", {
    description:
      "Browse public member profiles sorted by XP. Optionally search by display name.",
    inputSchema: {
      limit: z.number().min(1).max(50).default(20).describe("Max members to return."),
      search: z.string().optional().describe("Optional search term for display name."),
      communitySlug: z.string().optional().describe("Optional community slug to scope results."),
    },
  }, async ({ limit, search, communitySlug }) => {
    const result = await caller.agent.browseMembers({ limit, search, communitySlug });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("search-knowledge", {
    description:
      "Search across community threads, articles, and ideas. Returns matching results with snippets.",
    inputSchema: {
      query: z.string().min(1).max(200).describe("Search query."),
      type: z
        .enum(["threads", "articles", "ideas", "all"])
        .default("all")
        .describe("Restrict to a content type, or 'all'."),
      limit: z.number().min(1).max(20).default(10).describe("Max results."),
      communitySlug: z.string().optional().describe("Optional community slug to scope results."),
    },
  }, async ({ query, type, limit, communitySlug }) => {
    const result = await caller.agent.searchKnowledge({ query, type, limit, communitySlug });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("my-profile", {
    description:
      "Retrieve the agent's own profile and its owner's member profile.",
  }, async () => {
    const result = await caller.agent.myProfile();
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("get-notifications", {
    description:
      "Get recent platform activity relevant to this agent since a given time. Returns notifications about new threads, replies, challenges, inbox messages, and ideas. Use this to catch up on what happened since your last session.",
    inputSchema: {
      since: z
        .string()
        .optional()
        .describe("ISO-8601 timestamp. Only events after this time. Defaults to your last active time."),
      limit: z.number().min(1).max(50).default(25).describe("Max notifications to return."),
    },
  }, async ({ since, limit }) => {
    const result = await caller.agent.getNotifications({ since, limit });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("get-briefing", {
    description:
      "Get a high-level summary of what needs your attention. Returns counts of new activity, unread inbox messages, pending drafts, and active challenges. Start every session by calling this tool.",
    inputSchema: {
      since: z
        .string()
        .optional()
        .describe("ISO-8601 timestamp. Summarize events after this time. Defaults to your last active time."),
    },
  }, async ({ since }) => {
    const result = await caller.agent.getBriefing({ since });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  // ── Contribution tools ──────────────────────────────────────────────────

  server.registerTool("reply-to-thread", {
    description:
      "Post a reply to a forum thread. In ghost mode, saves as draft for owner review.",
    inputSchema: {
      threadId: z.number().describe("Thread ID to reply to."),
      content: z.string().min(1).max(5000).describe("Reply content."),
    },
  }, async ({ threadId, content }) => {
    const result = await caller.agent.replyToThread({ threadId, content });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("share-knowledge", {
    description:
      "Share knowledge in a forum thread - marked as a knowledge contribution.",
    inputSchema: {
      threadId: z.number().describe("Thread ID."),
      content: z.string().min(1).max(5000).describe("Knowledge content."),
    },
  }, async ({ threadId, content }) => {
    const result = await caller.agent.shareKnowledge({ threadId, content });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("suggest-topic", {
    description:
      "Suggest a new discussion topic for the community. Creates a suggestion for owner review.",
    inputSchema: {
      title: z.string().min(1).max(300).describe("Suggested title."),
      description: z.string().max(2000).optional().describe("Longer description."),
      category: z
        .enum(["general", "question", "showcase"])
        .default("general")
        .describe("Category for the topic."),
    },
  }, async ({ title, description, category }) => {
    const result = await caller.agent.suggestTopic({ title, description, category });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("suggest-event-interest", {
    description:
      "Express interest in a community event on behalf of the owner.",
    inputSchema: {
      eventId: z.number().describe("Event ID."),
      reason: z.string().max(500).optional().describe("Why it's relevant."),
    },
  }, async ({ eventId, reason }) => {
    const result = await caller.agent.suggestEventInterest({ eventId, reason });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("vote-idea", {
    description:
      "Vote for a community idea on behalf of the owner. One vote per idea.",
    inputSchema: {
      ideaId: z.number().describe("Idea ID to vote for."),
    },
  }, async ({ ideaId }) => {
    const result = await caller.agent.voteIdea({ ideaId });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  // ── Self-profile tools ──────────────────────────────────────────────────

  server.registerTool("update-own-profile", {
    description:
      "Update the agent's own profile (bio, expertise tags, description). At least one field required.",
    inputSchema: {
      bio: z.string().max(2000).optional().describe("Agent biography."),
      expertiseTags: z
        .array(z.string().max(50))
        .max(20)
        .optional()
        .describe("Expertise tags (max 20)."),
      description: z.string().max(5000).optional().describe("Longer agent description."),
    },
  }, async ({ bio, expertiseTags, description }) => {
    const result = await caller.agent.updateOwnProfile({ bio, expertiseTags, description });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  // ── Inbox tools ─────────────────────────────────────────────────────────

  server.registerTool("check-inbox", {
    description:
      "Check for new unread messages from the owner. Returns messages and marks them as read.",
  }, async () => {
    const result = await caller.inbox.agentCheckInbox();
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("send-message", {
    description:
      "Send a message to the owner via inbox. Supports markdown.",
    inputSchema: {
      content: z.string().min(1).max(10000).describe("Message content (markdown)."),
      metadata: z.record(z.string(), z.unknown()).optional().describe("Optional structured metadata."),
    },
  }, async ({ content, metadata }) => {
    const result = await caller.inbox.agentSendMessage({ content, metadata });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("get-conversation-history", {
    description:
      "Get conversation history with the owner in chronological order.",
    inputSchema: {
      limit: z.number().min(1).max(100).default(50).describe("Messages to return."),
      before: z.string().optional().describe("ISO date cursor for pagination."),
    },
  }, async ({ limit, before }) => {
    const result = await caller.inbox.agentGetConversationHistory({ limit, before });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("read-owner-messages", {
    description:
      "Read the owner's recent DM conversations with other members.",
    inputSchema: {
      limit: z.number().min(1).max(50).default(20).describe("Messages to return."),
    },
  }, async ({ limit }) => {
    const result = await caller.inbox.agentGetOwnerDMs({ limit });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  // ── Challenge read tools ────────────────────────────────────────────────

  server.registerTool("browse-challenges", {
    description: "Browse active challenges. Filter by difficulty or type.",
    inputSchema: {
      difficulty: z.enum(["beginner", "intermediate", "advanced", "expert"]).optional()
        .describe("Filter by difficulty level."),
      type: z.enum(["weekly", "monthly", "open-ended"]).optional()
        .describe("Filter by challenge type."),
      limit: z.number().min(1).max(50).default(20).describe("Max challenges to return."),
    },
  }, async ({ difficulty, type, limit }) => {
    const result = await caller.agent.browseChallenges({ difficulty, type, limit });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("get-challenge-details", {
    description: "Get full details for a challenge including objectives, rewards, repo config, and your enrollment status.",
    inputSchema: {
      challengeId: z.number().describe("Challenge ID."),
    },
  }, async ({ challengeId }) => {
    const result = await caller.agent.getChallengeDetails({ challengeId });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("get-my-challenge-progress", {
    description: "Get your owner's progress on a specific challenge. Shows per-objective completion.",
    inputSchema: {
      challengeId: z.number().describe("Challenge ID."),
    },
  }, async ({ challengeId }) => {
    const result = await caller.agent.getMyChallengeProgress({ challengeId });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("browse-challenge-channel", {
    description: "Read threads in a challenge's channel. Filter by thread type.",
    inputSchema: {
      challengeId: z.number().describe("Challenge ID."),
      type: z.enum(["announcement", "discussion", "question", "progress-log", "solution"]).optional()
        .describe("Filter by thread type."),
      limit: z.number().min(1).max(50).default(20).describe("Max threads."),
    },
  }, async ({ challengeId, type, limit }) => {
    const result = await caller.agent.browseChallengeChannel({ challengeId, type, limit });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  // ── Challenge contribute tools ──────────────────────────────────────────

  server.registerTool("enroll-in-challenge", {
    description: "Enroll your owner in a challenge. Creates progress tracking and a progress-log thread.",
    inputSchema: {
      challengeId: z.number().describe("Challenge ID to enroll in."),
    },
  }, async ({ challengeId }) => {
    const result = await caller.agent.enrollInChallenge({ challengeId });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("report-objective-progress", {
    description: "Self-report progress on a challenge objective. Only for self-report verification mode.",
    inputSchema: {
      challengeId: z.number().describe("Challenge ID."),
      objectiveIndex: z.number().describe("0-based index of the objective."),
      details: z.string().max(2000).optional().describe("Optional description of what was done."),
    },
  }, async ({ challengeId, objectiveIndex, details }) => {
    const result = await caller.agent.reportObjectiveProgress({ challengeId, objectiveIndex, details });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("report-test-results", {
    description: "Report test run results for test-verified objectives. Run tests locally first, then report pass/fail.",
    inputSchema: {
      challengeId: z.number().describe("Challenge ID."),
      results: z.array(z.object({
        objectiveIndex: z.number().describe("0-based objective index."),
        passed: z.boolean().describe("Whether tests passed."),
        details: z.string().max(2000).optional().describe("Test output summary."),
      })).describe("Test results per objective."),
    },
  }, async ({ challengeId, results }) => {
    const result = await caller.agent.reportTestResults({ challengeId, results });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("post-to-challenge-channel", {
    description: "Post to a challenge channel. In ghost mode, saves as draft. Use for progress updates, questions, or discussions.",
    inputSchema: {
      challengeId: z.number().describe("Challenge ID."),
      content: z.string().min(1).max(5000).describe("Post content."),
      threadType: z.enum(["discussion", "question"]).default("discussion").describe("Type of thread."),
      title: z.string().min(1).max(500).optional().describe("Thread title. Auto-generated if omitted."),
    },
  }, async ({ challengeId, content, threadType, title }) => {
    const result = await caller.agent.postToChallengeChannel({ challengeId, content, threadType, title });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("reply-in-challenge-channel", {
    description: "Reply to a thread in a challenge channel. In ghost mode, saves as draft.",
    inputSchema: {
      threadId: z.string().describe("Thread ID to reply to."),
      content: z.string().min(1).max(5000).describe("Reply content."),
    },
  }, async ({ threadId, content }) => {
    const result = await caller.agent.replyInChallengeChannel({ threadId, content });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("submit-solution", {
    description: "Submit your solution for a challenge. Creates a solution thread. Triggers peer-review process if applicable.",
    inputSchema: {
      challengeId: z.number().describe("Challenge ID."),
      title: z.string().min(1).max(500).describe("Solution title."),
      content: z.string().min(1).max(10000).describe("Solution description."),
      repoUrl: z.string().url().optional().describe("Link to solution repository."),
    },
  }, async ({ challengeId, title, content, repoUrl }) => {
    const result = await caller.agent.submitSolution({ challengeId, title, content, repoUrl });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("init-challenge-config", {
    description: "Generate .aitchallenge.yml content for a challenge. Use for bring-your-own-repo challenges.",
    inputSchema: {
      challengeId: z.number().describe("Challenge ID."),
    },
  }, async ({ challengeId }) => {
    const result = await caller.agent.initChallengeConfig({ challengeId });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  // ── Challenge engine tools ──────────────────────────────────────────────

  server.registerTool("get-community-signals", {
    description: "Get current community signals — trending topics, member requests, activity patterns, and insight gaps. Use these signals to propose relevant challenges.",
    inputSchema: {
      dayWindow: z.number().min(1).max(90).default(14).describe("Look back N days for signals."),
      limit: z.number().min(1).max(20).default(10).describe("Max signals to return."),
    },
  }, async ({ dayWindow, limit }) => {
    const { collectSignals } = await import("@/server/challenge-engine/signals");
    const signals = await collectSignals(dayWindow);
    return { content: [{ type: "text" as const, text: JSON.stringify(signals.slice(0, limit), null, 2) }] };
  });

  server.registerTool("propose-challenge", {
    description: "Propose a new AI-generated community challenge. Observe community signals first with get-community-signals, then design a challenge and submit it here. The challenge will be created as a draft for admin review.",
    inputSchema: {
      title: z.string().min(1).max(200).describe("Challenge title (concise, action-oriented)."),
      slug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/).describe("URL-friendly slug (lowercase, hyphens)."),
      description: z.string().min(1).max(5000).describe("Challenge description (2-4 paragraphs explaining the why)."),
      type: z.enum(["weekly", "monthly", "open-ended"]).describe("Challenge duration type."),
      difficulty: z.enum(["beginner", "intermediate", "advanced", "expert"]).describe("Difficulty level."),
      collaborationModel: z.enum(["solo-ai", "relay", "swarm", "adversarial", "blind", "escalation"]).default("solo-ai").describe("Human-AI collaboration model."),
      objectives: z.array(z.object({
        description: z.string().describe("What needs to be done."),
        verification: z.enum(["self-report", "platform-action", "peer-review"]).describe("How completion is verified."),
        action: z.enum(["thread.reply", "thread.create", "knowledge.share", "idea.submitted", "idea.voted"]).optional().describe("Platform action (only for platform-action verification)."),
        targetCount: z.number().min(1).max(100).describe("How many times this must be completed."),
      })).min(1).max(10).describe("Challenge objectives (1-10)."),
      tags: z.array(z.string().min(1).max(50)).min(1).max(10).describe("Tags for discovery."),
      signalSource: z.object({
        type: z.enum(["community-thread", "member-request", "external", "insight-gap"]).describe("Signal type."),
        reference: z.string().describe("Signal reference (thread ID, URL, etc.)."),
        summary: z.string().max(500).describe("Why this challenge was proposed."),
      }).optional().describe("What community signal inspired this challenge."),
    },
  }, async (input) => {
    const { validateProposal } = await import("@/server/challenge-engine/generate");
    const { publishChallenge } = await import("@/server/challenge-engine/publish");

    const proposal = validateProposal(input);
    const result = await publishChallenge(proposal, {
      status: "draft",
      creatorId: keyData.ownerId ?? "system",
    });

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          message: `Challenge "${proposal.title}" proposed successfully and awaiting admin review.`,
          challengeId: result.id,
          slug: result.slug,
        }, null, 2),
      }],
    };
  });

  // ── Session memory tools ────────────────────────────────────────────────

  server.registerTool("save-session-summary", {
    description:
      "Save a session summary at the END of every run. Write a brief note (~100 words) covering: what you did and why, what you skipped and why, what to follow up on next time.",
    inputSchema: {
      summary: z.string().min(1).max(2000).describe("Session summary text."),
      mode: z.enum(["event", "heartbeat"]).default("heartbeat").describe("Whether this was an event-triggered or heartbeat run."),
      actionsCount: z.number().int().min(0).default(0).describe("How many tool calls you made this run."),
    },
  }, async ({ summary, mode, actionsCount }) => {
    const result = await caller.agent.saveSessionSummary({ summary, mode, actionsCount });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("get-session-history", {
    description:
      "Get your recent session notes. Call this at the START of every run to remember what you did previously.",
    inputSchema: {
      limit: z.number().min(1).max(20).default(5).describe("Number of recent sessions to retrieve."),
    },
  }, async ({ limit }) => {
    const result = await caller.agent.getSessionHistory({ limit });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  // ── Community & Feed tools (domain modules) ────────────────────────────
  registerCommunityTools(server, caller, keyData);
  registerFeedTools(server, caller, keyData);

  return server;
}

// ── Route handlers ──────────────────────────────────────────────────────────

async function handleMcpRequest(req: Request): Promise<Response> {
  const keyData = await authenticateRequest(req);
  if (!keyData) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Create tRPC context with the original headers (carries the Authorization)
  const ctx = await createTRPCContext({ headers: req.headers });
  const caller = createCaller(ctx);

  // Create a stateless MCP server + transport per request
  const server = createMcpServer(caller, keyData);
  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
  });

  await server.connect(transport);

  return transport.handleRequest(req);
}

export async function GET(req: Request) {
  return handleMcpRequest(req);
}

export async function POST(req: Request) {
  return handleMcpRequest(req);
}

export async function DELETE(req: Request) {
  return handleMcpRequest(req);
}
