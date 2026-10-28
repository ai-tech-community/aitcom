import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v3";

import { MAGAZINE_ROLES } from "@/lib/magazines/roles";
import {
  ISSUE_VISIBILITIES,
  MAGAZINE_SLUG_PATTERN,
  MAX_MAGAZINE_TOPICS,
} from "@/lib/magazines/values";
import type { createCaller } from "@/server/api/root";
import {
  ADDITIVE_WRITE,
  DESTRUCTIVE_WRITE,
  DRAFT_FOR_REVIEW,
  READ_ONLY,
} from "@/server/mcp/tool-annotations";

const itemBase = {
  id: z.string().optional(),
  intro: z.string().max(280).optional(),
};

/** The same item kinds the issue editor saves, as the MCP SDK's zod. */
const issueItem = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("article"),
    articleId: z.number().int().positive(),
    ...itemBase,
  }),
  z.object({
    kind: z.literal("editorial"),
    heading: z.string().max(160).optional(),
    body: z.unknown(),
    ...itemBase,
  }),
  z.object({
    kind: z.literal("storyline"),
    storylineId: z.string().min(1).max(255),
    ...itemBase,
  }),
  z.object({
    kind: z.literal("newsItem"),
    newsItemId: z.string().min(1).max(255),
    ...itemBase,
  }),
  z.object({
    kind: z.literal("event"),
    eventId: z.number().int().positive(),
    ...itemBase,
  }),
  z.object({
    kind: z.literal("forumThread"),
    threadId: z.number().int().positive(),
    ...itemBase,
  }),
  z.object({
    kind: z.literal("launchpadProject"),
    projectId: z.number().int().positive(),
    ...itemBase,
  }),
]);

const httpUrl = z
  .string()
  .url()
  .max(2000)
  .refine(
    (value) => value.startsWith("https://") || value.startsWith("http://"),
    "Use an http(s) image URL",
  );

export function registerMagazineTools(
  server: McpServer,
  caller: ReturnType<typeof createCaller>,
) {
  const textResult = (result: unknown) => ({
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
  });

  server.registerTool(
    "browse-magazines",
    {
      description:
        "List magazines, their issues and articles, and member submissions the caller may see. Requires read scope. Pass communitySlug alone to list that community's magazines and their issues, articles and submissions. Each issue includes updatedAt. save-magazine-issue requires that value as expectedUpdatedAt when you edit. Article id is the stable document id, an integer. Pass that value back as articleId. It is not a draft version id and does not change between reads. submissionsVisible is true when this response includes a submission list: you edit the magazine, or you are a claimed owner seeing your own pending submissions. The flag follows that standing, so identical calls return the same value. Drafts and the submission queue of a magazine you do not edit are omitted. Pending member submissions are included for a magazine editor, otherwise only the owner's own submissions.",
      inputSchema: {
        magazineSlug: z
          .string()
          .min(1)
          .max(80)
          .optional()
          .describe(
            "When set, also return that magazine's issues, articles and submissions.",
          ),
        communitySlug: z
          .string()
          .min(1)
          .max(80)
          .optional()
          .describe("Limit the magazine list to one community."),
        page: z
          .number()
          .int()
          .min(1)
          .default(1)
          .describe("One-based page number."),
      },
      annotations: READ_ONLY,
    },
    async (input) => textResult(await caller.agent.browseMagazines(input)),
  );

  server.registerTool(
    "save-magazine-article",
    {
      description:
        "Create or edit your magazine article draft: title, body and an optional cover image URL from upload-image. Requires contribute scope and a claimed owner. The article stays a draft. This tool cannot publish it or approve it. Omit articleId to create; send articleId to edit your own open draft. articleId is the stable document id returned by this tool and by browse-magazines, not a draft version id. Do not invent facts the owner did not supply.",
      inputSchema: {
        magazineSlug: z.string().min(1).max(80),
        articleId: z.number().int().positive().optional(),
        title: z.string().trim().min(1).max(200).optional(),
        body: z.string().min(1).max(50_000).optional(),
        coverImageUrl: httpUrl
          .nullable()
          .optional()
          .describe(
            "Stored image URL from upload-image. Null clears the cover.",
          ),
      },
      annotations: DRAFT_FOR_REVIEW,
    },
    async (input) => textResult(await caller.agent.saveMagazineArticle(input)),
  );

  server.registerTool(
    "upload-image",
    {
      description:
        "Upload an image into the magazine's media storage and return a URL you can set as an article or issue cover. Requires contribute scope and a claimed owner. The file is stored at magazines/<magazineId>/<uuid>-<name>.ext and is never overwritten. Same rule as the magazine uploader: an image file, at most 2MB. Send either a public http(s) URL or base64 bytes with a content type. This does not publish anything.",
      inputSchema: {
        magazineSlug: z.string().min(1).max(80),
        alt: z.string().max(200).optional(),
        url: httpUrl.optional(),
        dataBase64: z.string().min(1).max(4_000_000).optional(),
        contentType: z.string().max(100).optional(),
      },
      annotations: ADDITIVE_WRITE,
    },
    async (input) => textResult(await caller.agent.uploadImage(input)),
  );

  server.registerTool(
    "save-magazine-issue",
    {
      description:
        "Create or edit your issue draft. Set the title, cover image URL, editor's note, and ordered sections: articles, text sections, events, projects, storylines, news and forum threads — the same shapes the issue editor saves. articleIds is the short form for article sections only. Requires contribute scope and a claimed owner. The issue stays a draft. This tool cannot publish, schedule or email subscribers. Omit issueId to create. The response includes updatedAt, and browse-magazines returns updatedAt on each issue. When editing, send that value as expectedUpdatedAt.",
      inputSchema: {
        magazineSlug: z.string().min(1).max(80),
        issueId: z.number().int().positive().optional(),
        title: z.string().trim().min(1).max(200).optional(),
        coverImageUrl: httpUrl.nullable().optional(),
        editorNote: z
          .string()
          .max(20_000)
          .nullable()
          .optional()
          .describe(
            "Editor's note. Plain text is stored as paragraphs. Null clears it.",
          ),
        articleIds: z
          .array(z.number().int().positive())
          .max(50)
          .optional()
          .describe("Article ids in reading order. Omit when sending items."),
        items: z
          .array(issueItem)
          .max(50)
          .optional()
          .describe(
            "Sections in reading order, same kinds as the issue editor.",
          ),
        expectedUpdatedAt: z.string().min(1).optional(),
      },
      annotations: DRAFT_FOR_REVIEW,
    },
    async (input) => textResult(await caller.agent.saveMagazineIssue(input)),
  );

  server.registerTool(
    "submit-issue-for-review",
    {
      description:
        "Move your issue draft to review. Requires contribute scope and a claimed owner. The issue stays unpublished. The agent owner or a magazine editor must approve it, and that approval is what publishes the issue. Subscriber email is sent only after that publish. This tool cannot publish or send email. Retrying a submitted issue returns the same review.",
      inputSchema: {
        issueId: z.number().int().positive(),
      },
      annotations: DRAFT_FOR_REVIEW,
    },
    async (input) => textResult(await caller.agent.submitIssueForReview(input)),
  );

  server.registerTool(
    "create-magazine",
    {
      description:
        "Create the community magazine. Requires contribute scope and a claimed owner with the same manage permission as the magazine settings page (a community owner or admin, or an editor-in-chief). Same fields and validation as that form: name, slug, optional description, logo URL, topics, and default visibility. Public visibility in an unlisted community needs confirmUnlistedPublic. Refuses when the community already has a magazine. This cannot publish an issue.",
      inputSchema: {
        communitySlug: z.string().min(1).max(80),
        name: z.string().trim().min(1).max(120),
        magazineSlug: z.string().min(3).max(60).regex(MAGAZINE_SLUG_PATTERN),
        description: z.string().max(500).optional(),
        logoUrl: httpUrl.nullable().optional(),
        topics: z
          .array(z.string().max(40))
          .max(MAX_MAGAZINE_TOPICS * 4)
          .default([]),
        defaultVisibility: z.enum(ISSUE_VISIBILITIES).default("members"),
        confirmUnlistedPublic: z.boolean().optional(),
      },
      annotations: ADDITIVE_WRITE,
    },
    async (input) => textResult(await caller.agent.createMagazine(input)),
  );

  server.registerTool(
    "assign-magazine-agent",
    {
      description:
        "Add a member's agent to the magazine team, or change that agent's role. Requires contribute scope and the same manage permission as the team page. The agent must be active and belong to userId, and that person must be an active community member who is not already a community owner or admin. This cannot publish an issue.",
      inputSchema: {
        communitySlug: z.string().min(1).max(80),
        userId: z
          .string()
          .min(1)
          .max(255)
          .describe("The human who owns the agent."),
        agentId: z.string().min(1).max(255),
        role: z.enum(MAGAZINE_ROLES),
      },
      annotations: DESTRUCTIVE_WRITE,
    },
    async (input) => textResult(await caller.agent.assignMagazineAgent(input)),
  );
}
