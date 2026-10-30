// src/app/api/mcp/feed-tools.ts
//
// Feed MCP tool registrations (v0.4.0).
// Registers 5 tools: 2 read + 3 write.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v3";
import type { createCaller } from "@/server/api/root";
import {
  DESTRUCTIVE_WRITE,
  DRAFT_FOR_REVIEW,
  READ_ONLY,
} from "@/server/mcp/tool-annotations";

type Caller = ReturnType<typeof createCaller>;

export function registerFeedTools(
  server: McpServer,
  caller: Caller,
  _keyData: { ownerId: string | null; agentId: string },
): void {
  // ── Read tools ──────────────────────────────────────────────────────────────

  server.registerTool(
    "browse-feed",
    {
      description:
        "Browse community feed posts sorted newest first with keyset pagination.",
      inputSchema: {
        communitySlug: z.string().describe("Community slug to browse."),
        limit: z
          .number()
          .min(1)
          .max(50)
          .default(20)
          .describe("Max posts to return."),
        cursor: z
          .object({
            createdAt: z
              .string()
              .describe("ISO-8601 timestamp of the last post."),
            id: z.number().describe("Numeric ID of the last post."),
          })
          .optional()
          .describe("Keyset cursor for pagination (createdAt + id)."),
      },
      annotations: READ_ONLY,
    },
    async ({ communitySlug, limit, cursor }) => {
      const result = await caller.agent.browseFeed({
        communitySlug,
        limit,
        cursor,
      });
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  server.registerTool(
    "get-feed-comments",
    {
      description: "Get comments on a feed post in chronological order.",
      inputSchema: {
        postId: z.number().describe("Numeric ID of the feed post."),
        limit: z
          .number()
          .min(1)
          .max(200)
          .default(50)
          .describe("Max comments to return."),
      },
      annotations: READ_ONLY,
    },
    async ({ postId, limit }) => {
      const result = await caller.agent.getFeedComments({ postId, limit });
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  // ── Write tools ─────────────────────────────────────────────────────────────

  server.registerTool(
    "create-feed-post",
    {
      description:
        "Post to a community feed. Always saved as a draft for the owner to review and publish in their own name — agents never post directly to human community surfaces (ADR-0015). An optional image is a media id from upload-image or an http(s) URL, with alt text. Send one of those, not both.",
      inputSchema: {
        communitySlug: z.string().describe("Community slug to post in."),
        content: z.string().min(1).max(2000).describe("Post content."),
        imageUrl: z
          .string()
          .url()
          .optional()
          .describe(
            "Optional http(s) image. It is copied into the community when the owner publishes the draft. Send imageUrl or imageMediaId, not both.",
          ),
        imageMediaId: z
          .number()
          .int()
          .positive()
          .optional()
          .describe(
            "Media id from upload-image. Send imageUrl or imageMediaId, not both.",
          ),
        imageAlt: z
          .string()
          .max(200)
          .optional()
          .describe("Alt text for the image."),
      },
      annotations: DRAFT_FOR_REVIEW,
    },
    async ({ communitySlug, content, imageUrl, imageMediaId, imageAlt }) => {
      const result = await caller.agent.createFeedPost({
        communitySlug,
        content,
        ...(imageUrl !== undefined ? { imageUrl } : {}),
        ...(imageMediaId !== undefined ? { imageMediaId } : {}),
        ...(imageAlt !== undefined ? { imageAlt } : {}),
      });
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  server.registerTool(
    "comment-on-feed-post",
    {
      description:
        "Comment on a feed post. Always saved as a draft for the owner to review and publish in their own name — agents never post directly to human community surfaces (ADR-0015).",
      inputSchema: {
        postId: z
          .number()
          .describe("Numeric ID of the feed post to comment on."),
        content: z.string().min(1).max(1000).describe("Comment content."),
      },
      annotations: DRAFT_FOR_REVIEW,
    },
    async ({ postId, content }) => {
      const result = await caller.agent.commentOnFeedPost({ postId, content });
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  server.registerTool(
    "toggle-feed-like",
    {
      description:
        "Like or unlike a feed post. Executes directly — a reaction, not authored content.",
      inputSchema: {
        postId: z
          .number()
          .describe("Numeric ID of the feed post to like/unlike."),
      },
      annotations: DESTRUCTIVE_WRITE,
    },
    async ({ postId }) => {
      const result = await caller.agent.toggleFeedLike({ postId });
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );
}
