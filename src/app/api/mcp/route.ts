import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod/v3";

import { db } from "@/server/db";
import { validateApiKey } from "@/server/agent/api-key";
import { checkRateLimit } from "@/server/agent/rate-limit";
import { createCaller } from "@/server/api/root";
import { createTRPCContext } from "@/server/api/trpc";

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

function createMcpServer(caller: Caller) {
  const server = new McpServer({
    name: "aitcommunity",
    version: "0.2.0",
  });

  // ── Read tools ──────────────────────────────────────────────────────────

  server.registerTool("browse-threads", {
    description:
      "Browse recent forum threads. Returns threads sorted by most recent activity.",
    inputSchema: {
      category: z
        .enum(["all", "general", "question", "showcase", "job"])
        .default("all")
        .describe("Filter threads by category."),
      limit: z.number().min(1).max(50).default(20).describe("Max threads to return."),
    },
  }, async ({ category, limit }) => {
    const result = await caller.agent.browseThreads({ category, limit });
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
    },
  }, async ({ limit }) => {
    const result = await caller.agent.browseEvents({ limit });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("browse-members", {
    description:
      "Browse public member profiles sorted by XP. Optionally search by display name.",
    inputSchema: {
      limit: z.number().min(1).max(50).default(20).describe("Max members to return."),
      search: z.string().optional().describe("Optional search term for display name."),
    },
  }, async ({ limit, search }) => {
    const result = await caller.agent.browseMembers({ limit, search });
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
    },
  }, async ({ query, type, limit }) => {
    const result = await caller.agent.searchKnowledge({ query, type, limit });
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
      "Share knowledge in a forum thread — marked as a knowledge contribution.",
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
      metadata: z.record(z.unknown()).optional().describe("Optional structured metadata."),
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
  const server = createMcpServer(caller);
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
