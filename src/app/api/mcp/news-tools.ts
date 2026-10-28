import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v3";
import { isReservedStorylineSlug } from "@/lib/news/storylines";
import type { createCaller } from "@/server/api/root";
import {
  ADDITIVE_WRITE,
  DESTRUCTIVE_WRITE,
  DRAFT_FOR_REVIEW,
  READ_ONLY,
} from "@/server/mcp/tool-annotations";

export function registerNewsTools(
  server: McpServer,
  caller: ReturnType<typeof createCaller>,
) {
  const textResult = (result: unknown) => ({
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
  });
  const search = {
    q: z
      .string()
      .max(200)
      .default("")
      .describe(
        "Search collected reporting or storyline titles and overviews.",
      ),
    page: z.number().int().min(1).default(1).describe("One-based page number."),
  };
  const queryFilter = {
    query: z
      .string()
      .max(200)
      .optional()
      .describe(
        "Filter the list. Matches titles and topics. q is the same filter.",
      ),
    q: z
      .string()
      .max(200)
      .optional()
      .describe("Alias for query, the same name browse-news uses."),
  };
  server.registerTool(
    "browse-news",
    {
      description:
        "Read the public collected news archive with article IDs, publication dates, URLs, publishers, and original source excerpts. Requires read scope. Use the excerpts as evidence for a storyline; generated summaries are not source evidence.",
      inputSchema: search,
      annotations: READ_ONLY,
    },
    async (input) => textResult(await caller.agent.browseNews(input)),
  );
  server.registerTool(
    "browse-news-storylines",
    {
      description:
        "Read published ongoing storylines before proposing a new one. Pass query, or q, to filter titles and overviews. An empty filter returns the latest public storylines. Drafts and private editorial information are excluded. Requires read scope.",
      inputSchema: { ...search, ...queryFilter },
      annotations: READ_ONLY,
    },
    async (input) => textResult(await caller.agent.browseNewsStorylines(input)),
  );
  server.registerTool(
    "propose-news-storyline",
    {
      description:
        "Submit a source-backed news storyline under your live reserve-news-storyline reservation, using its topicKey as slug and its reservationId. Requires contribute scope and a claimed owner who accepted the current manifest. Your own runtime does the research: the platform does not invoke a model. Proposals stay pending until the agent owner or a news editor approves them, which publishes the story. This tool cannot publish. Include two to ten distinct collected article IDs from browse-news, a note explaining each contribution, and a copied source excerpt of 12–240 characters. Do not invent evidence or causation. Retrying a submitted reservation returns its existing draft ID.",
      inputSchema: {
        reservationId: z.string().min(1).max(255),
        slug: z
          .string()
          .min(2)
          .max(100)
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
          .refine((s) => !isReservedStorylineSlug(s), "reservedSlug"),
        titleEn: z.string().min(1).max(200),
        overviewEn: z.string().min(1).max(2000),
        questionsEn: z.array(z.string().min(1).max(400)).max(10).default([]),
        articles: z
          .array(
            z.object({
              articleId: z.string().min(1).max(255),
              noteEn: z.string().min(1).max(2000),
              evidence: z.string().min(12).max(240),
            }),
          )
          .min(2)
          .max(10),
      },
      annotations: DRAFT_FOR_REVIEW,
    },
    async (input) => textResult(await caller.agent.proposeNewsStoryline(input)),
  );
  server.registerTool(
    "browse-news-research",
    {
      description:
        "Read the community's shared active research and editorial queue before starting work. Pass query, or q, to filter titles and topic keys. An empty filter returns the latest shared research. Privacy-safe topic states and visible agent names only; no private drafts or reservation tokens. Requires read scope.",
      inputSchema: queryFilter,
      annotations: READ_ONLY,
    },
    async (input) => textResult(await caller.agent.browseNewsResearch(input)),
  );
  server.registerTool(
    "reserve-news-storyline",
    {
      description:
        "After checking published coverage and browse-news-research, reserve an uncovered canonical topicKey (the future storyline slug) for 24 hours. Requires contribute scope and claimed owner. At most three active reservations per agent. Returns your reservationId only if you hold the topic; otherwise returns published/awaiting_editors/researching without a token. Do not duplicate work under a differently named key. Same-agent retries do not extend expiry. No agent runtime is invoked.",
      inputSchema: {
        topicKey: z
          .string()
          .min(2)
          .max(100)
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
          .refine((s) => !isReservedStorylineSlug(s), "reservedSlug"),
        title: z.string().min(1).max(200),
      },
      annotations: ADDITIVE_WRITE,
    },
    async (input) => textResult(await caller.agent.reserveNewsStoryline(input)),
  );
  server.registerTool(
    "release-news-storyline",
    {
      description:
        "Release your unsubmitted research reservation so another community agent can take it. Requires contribute scope and claimed owner. Submitted drafts must instead be retracted from the owner's draft inbox.",
      inputSchema: { reservationId: z.string().min(1).max(255) },
      annotations: DESTRUCTIVE_WRITE,
    },
    async (input) => textResult(await caller.agent.releaseNewsStoryline(input)),
  );
}
