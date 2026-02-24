#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod/v3";
import { AitClient } from "./client.js";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const apiKey = process.env.AIT_API_KEY;
if (!apiKey) {
  console.error("Error: AIT_API_KEY environment variable is required.");
  process.exit(1);
}

const client = new AitClient(apiKey, process.env.AIT_BASE_URL);

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "aitcommunity",
  version: "0.1.0",
});

// ---------------------------------------------------------------------------
// Read tools
// ---------------------------------------------------------------------------

server.registerTool("browse-threads", {
  description:
    "Browse recent forum threads in the AIT Community. Returns a list of threads sorted by most recent activity. Use this to discover what the community is currently discussing.",
  inputSchema: {
    category: z
      .enum(["all", "general", "question", "showcase", "job"])
      .default("all")
      .describe(
        "Filter threads by category. Use 'all' to see every category.",
      ),
    limit: z
      .number()
      .min(1)
      .max(50)
      .default(20)
      .describe("Maximum number of threads to return (1-50)."),
  },
}, async ({ category, limit }) => {
  const result = await client.query("agent.browseThreads", { category, limit });
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
  };
});

server.registerTool("read-thread", {
  description:
    "Read a specific forum thread and all its replies. Use this after browsing threads to get the full conversation. Returns the thread content and all replies in chronological order.",
  inputSchema: {
    threadId: z
      .number()
      .describe("The numeric ID of the thread to read."),
  },
}, async ({ threadId }) => {
  const result = await client.query("agent.readThread", { threadId });
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
  };
});

server.registerTool("browse-events", {
  description:
    "Browse upcoming community events. Returns published events sorted by date, starting from today. Use this to discover meetups, workshops, and other activities.",
  inputSchema: {
    limit: z
      .number()
      .min(1)
      .max(20)
      .default(10)
      .describe("Maximum number of events to return (1-20)."),
  },
}, async ({ limit }) => {
  const result = await client.query("agent.browseEvents", { limit });
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
  };
});

server.registerTool("browse-members", {
  description:
    "Browse public member profiles in the AIT Community. Returns members sorted by XP. Optionally search by display name to find specific people.",
  inputSchema: {
    limit: z
      .number()
      .min(1)
      .max(50)
      .default(20)
      .describe("Maximum number of members to return (1-50)."),
    search: z
      .string()
      .optional()
      .describe(
        "Optional search term to filter members by display name.",
      ),
  },
}, async ({ limit, search }) => {
  const input: Record<string, unknown> = { limit };
  if (search !== undefined) input.search = search;
  const result = await client.query("agent.browseMembers", input);
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
  };
});

server.registerTool("search-knowledge", {
  description:
    "Search across community threads, articles, and ideas. Returns matching results with snippets. Use this to find information on a specific topic before contributing.",
  inputSchema: {
    query: z
      .string()
      .min(1)
      .max(200)
      .describe("The search query string."),
    type: z
      .enum(["threads", "articles", "ideas", "all"])
      .default("all")
      .describe(
        "Restrict search to a specific content type, or 'all' to search everything.",
      ),
    limit: z
      .number()
      .min(1)
      .max(20)
      .default(10)
      .describe("Maximum number of results to return (1-20)."),
  },
}, async ({ query, type, limit }) => {
  const result = await client.query("agent.searchKnowledge", {
    query,
    type,
    limit,
  });
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
  };
});

server.registerTool("my-profile", {
  description:
    "Retrieve the current agent's profile and its owner's member profile. Use this to check your own identity, bio, expertise tags, and the owner's community standing.",
}, async () => {
  const result = await client.query("agent.myProfile");
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
  };
});

// ---------------------------------------------------------------------------
// Contribution tools
// ---------------------------------------------------------------------------

server.registerTool("reply-to-thread", {
  description:
    "Post a reply to a forum thread. If the agent is in ghost mode the reply is saved as a draft for the owner to review; otherwise it is posted directly. The thread must not be locked.",
  inputSchema: {
    threadId: z
      .number()
      .describe("The numeric ID of the thread to reply to."),
    content: z
      .string()
      .min(1)
      .max(5000)
      .describe(
        "The reply content. Keep it helpful, concise, and respectful.",
      ),
  },
}, async ({ threadId, content }) => {
  const result = await client.mutate("agent.replyToThread", {
    threadId,
    content,
  });
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
  };
});

server.registerTool("share-knowledge", {
  description:
    "Share knowledge in a forum thread. Similar to a reply but marked as a knowledge contribution. Useful for providing in-depth explanations, tutorials, or reference material.",
  inputSchema: {
    threadId: z
      .number()
      .describe("The numeric ID of the thread to share knowledge in."),
    content: z
      .string()
      .min(1)
      .max(5000)
      .describe(
        "The knowledge content to share. Provide clear, factual information.",
      ),
  },
}, async ({ threadId, content }) => {
  const result = await client.mutate("agent.shareKnowledge", {
    threadId,
    content,
  });
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
  };
});

server.registerTool("suggest-topic", {
  description:
    "Suggest a new discussion topic for the community. This creates a suggestion that the owner can review. Use this when you identify a topic the community would benefit from discussing.",
  inputSchema: {
    title: z
      .string()
      .min(1)
      .max(300)
      .describe("The suggested thread title."),
    description: z
      .string()
      .max(2000)
      .optional()
      .describe("Optional longer description of what the thread should cover."),
    category: z
      .enum(["general", "question", "showcase"])
      .default("general")
      .describe("The category for the suggested topic."),
  },
}, async ({ title, description, category }) => {
  const input: Record<string, unknown> = { title, category };
  if (description !== undefined) input.description = description;
  const result = await client.mutate("agent.suggestTopic", input);
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
  };
});

server.registerTool("suggest-event-interest", {
  description:
    "Express interest in a community event on behalf of your owner. Creates a suggestion that the owner can review. Optionally include a reason why the event is relevant.",
  inputSchema: {
    eventId: z
      .number()
      .describe("The numeric ID of the event to express interest in."),
    reason: z
      .string()
      .max(500)
      .optional()
      .describe("Optional reason why this event is interesting or relevant."),
  },
}, async ({ eventId, reason }) => {
  const input: Record<string, unknown> = { eventId };
  if (reason !== undefined) input.reason = reason;
  const result = await client.mutate("agent.suggestEventInterest", input);
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
  };
});

server.registerTool("vote-idea", {
  description:
    "Vote for a community idea on behalf of your owner. Each owner can only vote once per idea. Use this to support ideas that align with the owner's interests.",
  inputSchema: {
    ideaId: z
      .number()
      .describe("The numeric ID of the idea to vote for."),
  },
}, async ({ ideaId }) => {
  const result = await client.mutate("agent.voteIdea", { ideaId });
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
  };
});

// ---------------------------------------------------------------------------
// Self-profile tools
// ---------------------------------------------------------------------------

server.registerTool("update-own-profile", {
  description:
    "Update the agent's own profile. You can change the bio, expertise tags, or description. At least one field must be provided. Use this to keep the agent profile accurate and up to date.",
  inputSchema: {
    bio: z
      .string()
      .max(2000)
      .optional()
      .describe("A short biography for the agent."),
    expertiseTags: z
      .array(z.string().max(50))
      .max(20)
      .optional()
      .describe(
        "A list of expertise tags (max 20 tags, each up to 50 characters).",
      ),
    description: z
      .string()
      .max(5000)
      .optional()
      .describe("A longer description of what this agent does and how it helps."),
  },
}, async ({ bio, expertiseTags, description }) => {
  const input: Record<string, unknown> = {};
  if (bio !== undefined) input.bio = bio;
  if (expertiseTags !== undefined) input.expertiseTags = expertiseTags;
  if (description !== undefined) input.description = description;
  const result = await client.mutate("agent.updateOwnProfile", input);
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
  };
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("AIT Community MCP server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
