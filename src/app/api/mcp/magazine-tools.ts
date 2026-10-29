import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v3";

import { MAGAZINE_ROLES } from "@/lib/magazines/roles";
import { MAGAZINE_FONT_PAIR_IDS } from "@/lib/magazines/theme";
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

const editorialImage = z.object({
  src: httpUrl,
  alt: z.string().trim().min(1).max(200),
  caption: z.string().trim().max(300).optional(),
});

/** Same editorial blocks the article editor stores. Alt text is required. */
const editorialBlock = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("pullQuote"),
    quote: z.string().trim().min(1).max(600),
    attribution: z.string().trim().max(160).optional(),
  }),
  z.object({
    type: z.literal("captionedImage"),
    image: editorialImage,
  }),
  z.object({
    type: z.literal("gallery"),
    images: z.array(editorialImage).min(2).max(8),
  }),
  z.object({
    type: z.literal("spread"),
    left: editorialImage,
    right: editorialImage,
  }),
]);

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
        "List magazines, their issues and articles, and member submissions the caller may see. Requires read scope. Pass communitySlug alone to list that community's magazines and their issues, articles and submissions. Each magazine includes its logo and cover: media id, http(s) URL, and alt text. Each issue includes its cover the same way, and updatedAt. Each article includes its read-time byline, a plain body preview, and its videos. save-magazine-issue requires updatedAt as expectedUpdatedAt when you edit. Article id is the stable document id, an integer. Pass that value back as articleId. It is not a draft version id and does not change between reads. Use read-magazine-article for the full stored body, including video blocks. submissionsVisible is true when this response includes a submission list: you edit the magazine, or you are a claimed owner seeing your own pending submissions. The flag follows that standing, so identical calls return the same value. Drafts and the submission queue of a magazine you do not edit are omitted. Pending member submissions are included for a magazine editor, otherwise only the owner's own submissions.",
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
    "read-magazine-article",
    {
      description:
        "Read one magazine article the key's owner can already see: their own draft, or a published article in an issue they may read. Requires read scope. Returns the stored blocks, including video blocks, the plain body, the read-time byline, and the article status. This tool cannot publish or edit the article. articleId is the stable document id from browse-magazines or save-magazine-article.",
      inputSchema: {
        articleId: z.number().int().positive(),
      },
      annotations: READ_ONLY,
    },
    async (input) => textResult(await caller.agent.readMagazineArticle(input)),
  );

  server.registerTool(
    "save-magazine-article",
    {
      description:
        'Create or edit your magazine article draft: title, markdown body and an optional cover image URL from upload-image. Optional videoUrl is stored as a video block: YouTube and Vimeo play inline, and Schooltv or any other page becomes a link card. Markdown links [text](https://...) and emphasis (*italic*, **bold**) are stored as real links and marks. A heading line (# or ##) is stored as an H2, and ### as an H3, so the article dialog can see the outline. A :::pullquote fence, a :::gallery fence, a :::spread fence, or a line that is only ![alt](https://… "caption") becomes an editorial block. blocks appends the same pull quote, gallery, spread, and captioned image shapes. Every photo needs alt text. Requires contribute scope and a claimed owner. The article stays a draft. This tool cannot publish it or approve it. Omit articleId to create; send articleId to edit your own open draft. A published article of yours is saved as a draft until you or the community owner approves it. An article in an issue that is still waiting for review cannot change until that review is approved or rejected. The response includes the read-time byline, a plain body preview, and the article\'s videos. articleId is the stable document id returned by this tool and by browse-magazines, not a draft version id. Do not invent facts the owner did not supply.',
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
        videoUrl: z
          .string()
          .url()
          .max(2000)
          .refine(
            (value) =>
              value.startsWith("https://") || value.startsWith("http://"),
            "Use an http(s) video URL",
          )
          .optional()
          .describe(
            "Page URL stored as a video block. YouTube and Vimeo play inline. Schooltv and other pages become a link card.",
          ),
        blocks: z
          .array(editorialBlock)
          .max(30)
          .optional()
          .describe(
            "Pull quotes, captioned images, galleries, and spreads appended after the body. Alt text is required on every photo.",
          ),
      },
      annotations: DRAFT_FOR_REVIEW,
    },
    async (input) => textResult(await caller.agent.saveMagazineArticle(input)),
  );

  server.registerTool(
    "mark-article-ready",
    {
      description:
        "Run the same readiness checks as the article dialog and, when they pass, hand the article in. Requires contribute scope and a claimed owner. Failures such as a missing H2 or a missing intro are returned and nothing is saved. A writer who can edit the magazine is marked ready, the same as Mark ready for an issue. A contributor is sent to an editor for approval and is not marked ready. An article already waiting on an editor stays there. This tool cannot publish the article or place it in an issue.",
      inputSchema: {
        articleId: z.number().int().positive(),
      },
      annotations: DRAFT_FOR_REVIEW,
    },
    async (input) => textResult(await caller.agent.markArticleReady(input)),
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
        "Create or edit your issue draft. Set the title, cover (a media id from upload-image or an http(s) URL, plus alt text), editor's note, and ordered sections: articles, text sections, events, projects, storylines, news and forum threads — the same shapes the issue editor saves. articleIds is the short form for article sections only. Requires contribute scope and a claimed owner. The issue stays a draft. This tool cannot publish, schedule or email subscribers. Omit issueId to create. The response includes updatedAt, and browse-magazines returns updatedAt on each issue. When editing, send that value as expectedUpdatedAt. A published issue's cover and details are saved as a draft the owner approves; this tool cannot publish that change. Sections of a published issue stay on an open draft.",
      inputSchema: {
        magazineSlug: z.string().min(1).max(80),
        issueId: z.number().int().positive().optional(),
        title: z.string().trim().min(1).max(200).optional(),
        coverImageUrl: httpUrl.nullable().optional(),
        coverMediaId: z
          .number()
          .int()
          .positive()
          .nullable()
          .optional()
          .describe(
            "Media id from upload-image. Send this or coverImageUrl, not both. Null clears the cover.",
          ),
        coverAlt: z
          .string()
          .max(200)
          .nullable()
          .optional()
          .describe("Alt text for the cover."),
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
        expectedUpdatedAt: z
          .string()
          .min(1)
          .optional()
          .describe(
            "Required when you edit an existing issue. This is the optimistic concurrency check: send the issue's last updatedAt so a newer save is not overwritten. Read updatedAt from that issue in browse-magazines, or from the updatedAt in the last save-magazine-issue response. Omit it when creating an issue.",
          ),
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
        "Create the community magazine. Requires contribute scope and a claimed owner with the same manage permission as the magazine settings page (a community owner or admin, or an editor-in-chief). Same fields and validation as that form: name, slug, optional description, logo (media id or http(s) URL, plus alt text), cover (media id or http(s) URL, plus alt text), topics, and default visibility. Send a media id or a URL for each picture, not both. Public visibility in an unlisted community needs confirmUnlistedPublic. Refuses when the community already has a magazine. This cannot publish an issue.",
      inputSchema: {
        communitySlug: z.string().min(1).max(80),
        name: z.string().trim().min(1).max(120),
        magazineSlug: z.string().min(3).max(60).regex(MAGAZINE_SLUG_PATTERN),
        description: z.string().max(500).optional(),
        logoUrl: httpUrl.nullable().optional(),
        logoMediaId: z.number().int().positive().nullable().optional(),
        logoAlt: z.string().max(200).nullable().optional(),
        coverImageUrl: httpUrl.nullable().optional(),
        coverMediaId: z.number().int().positive().nullable().optional(),
        coverAlt: z.string().max(200).nullable().optional(),
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
    "update-magazine",
    {
      description:
        "Set the magazine logo and cover. Requires contribute scope and the same manage permission as the magazine settings page. Each picture is a media id from upload-image or an http(s) URL, plus alt text. Send a media id or a URL, not both. Null clears that picture. browse-magazines and get-community-info read the saved logo and cover back. This cannot publish an issue.",
      inputSchema: {
        magazineSlug: z.string().min(1).max(80),
        logoUrl: httpUrl.nullable().optional(),
        logoMediaId: z.number().int().positive().nullable().optional(),
        logoAlt: z.string().max(200).nullable().optional(),
        coverImageUrl: httpUrl.nullable().optional(),
        coverMediaId: z.number().int().positive().nullable().optional(),
        coverAlt: z.string().max(200).nullable().optional(),
      },
      annotations: DESTRUCTIVE_WRITE,
    },
    async (input) => textResult(await caller.agent.updateMagazine(input)),
  );

  server.registerTool(
    "delete-magazine-issue",
    {
      description:
        "Ask the community owner to delete a magazine issue. Requires contribute scope and a magazine editor. This creates a delete draft in the owner's drafts queue and does not delete anything until that owner approves it. This cannot publish an issue.",
      inputSchema: {
        magazineSlug: z.string().min(1).max(80),
        issueId: z.number().int().positive(),
      },
      annotations: DRAFT_FOR_REVIEW,
    },
    async (input) => textResult(await caller.agent.deleteMagazineIssue(input)),
  );

  server.registerTool(
    "delete-magazine-article",
    {
      description:
        "Ask the community owner to delete a magazine article. Requires contribute scope and a magazine editor. This creates a delete draft in the owner's drafts queue and does not delete anything until that owner approves it. An article that is still in an issue is refused. This cannot publish an issue.",
      inputSchema: {
        magazineSlug: z.string().min(1).max(80),
        articleId: z.number().int().positive(),
      },
      annotations: DRAFT_FOR_REVIEW,
    },
    async (input) =>
      textResult(await caller.agent.deleteMagazineArticle(input)),
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

  server.registerTool(
    "propose-magazine-theme",
    {
      description:
        "Propose the magazine's type pair and accent color. Requires contribute scope, a claimed owner, and the edit capability (an editor, an editor-in-chief, or a community owner or admin). fontPair is journal, broadsheet, fashion, or literary. accent is a hex color that meets WCAG AA contrast on white or on the dark page. The change is stored as a pending agent draft. It does not change the live magazine until that draft is approved. This cannot publish an issue.",
      inputSchema: {
        magazineSlug: z.string().min(1).max(80),
        fontPair: z.enum(MAGAZINE_FONT_PAIR_IDS),
        accent: z.string().trim().max(7),
      },
      annotations: DRAFT_FOR_REVIEW,
    },
    async (input) => textResult(await caller.agent.proposeMagazineTheme(input)),
  );
}
