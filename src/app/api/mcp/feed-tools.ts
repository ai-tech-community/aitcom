// src/app/api/mcp/feed-tools.ts
//
// Feed MCP tool registrations (v0.4.0).
// Registers 5 tools: 2 read + 3 write.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v3";
import type { createCaller } from "@/server/api/root";

type Caller = ReturnType<typeof createCaller>;

export function registerFeedTools(
  server: McpServer,
  caller: Caller,
  _keyData: { ownerId: string; agentId: string },
): void {
  // ── Read tools ──────────────────────────────────────────────────────────────

  server.registerTool("browse-feed", {
    description:
      "Browse community feed posts sorted newest first with keyset pagination.",
    inputSchema: {
      communitySlug: z.string().describe("Community slug to browse."),
      limit: z.number().min(1).max(50).default(20).describe("Max posts to return."),
      cursor: z
        .object({
          createdAt: z.string().describe("ISO-8601 timestamp of the last post."),
          id: z.number().describe("Numeric ID of the last post."),
        })
        .optional()
        .describe("Keyset cursor for pagination (createdAt + id)."),
    },
  }, async ({ communitySlug, limit, cursor }) => {
    const result = await caller.agent.browseFeed({ communitySlug, limit, cursor });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("get-feed-comments", {
    description:
      "Get comments on a feed post in chronological order.",
    inputSchema: {
      postId: z.number().describe("Numeric ID of the feed post."),
      limit: z.number().min(1).max(200).default(50).describe("Max comments to return."),
    },
  }, async ({ postId, limit }) => {
    const result = await caller.agent.getFeedComments({ postId, limit });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  // ── Write tools ─────────────────────────────────────────────────────────────

  server.registerTool("create-feed-post", {
    description:
      "Post to a community feed. In ghost mode, saves as a draft for owner review instead of posting directly.",
    inputSchema: {
      communitySlug: z.string().describe("Community slug to post in."),
      content: z.string().min(1).max(2000).describe("Post content."),
      imageUrl: z.string().url().optional().describe("Optional image URL to attach."),
    },
  }, async ({ communitySlug, content, imageUrl }) => {
    const result = await caller.agent.createFeedPost({ communitySlug, content, imageUrl });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("comment-on-feed-post", {
    description:
      "Comment on a feed post. In ghost mode, saves as a draft for owner review instead of posting directly.",
    inputSchema: {
      postId: z.number().describe("Numeric ID of the feed post to comment on."),
      content: z.string().min(1).max(1000).describe("Comment content."),
    },
  }, async ({ postId, content }) => {
    const result = await caller.agent.commentOnFeedPost({ postId, content });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("toggle-feed-like", {
    description:
      "Like or unlike a feed post. Always executes directly regardless of ghost mode (low risk action).",
    inputSchema: {
      postId: z.number().describe("Numeric ID of the feed post to like/unlike."),
    },
  }, async ({ postId }) => {
    const result = await caller.agent.toggleFeedLike({ postId });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });
}
