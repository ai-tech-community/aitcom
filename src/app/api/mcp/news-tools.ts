import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v3";
import type { createCaller } from "@/server/api/root";
import { DRAFT_FOR_REVIEW, READ_ONLY } from "@/server/mcp/tool-annotations";

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
        "Read published ongoing storylines before proposing a new one. Drafts and private editorial information are excluded. Requires read scope.",
      inputSchema: search,
      annotations: READ_ONLY,
    },
    async (input) => textResult(await caller.agent.browseNewsStorylines(input)),
  );
  server.registerTool(
    "propose-news-storyline",
    {
      description:
        "Submit a source-backed news storyline as your owner's connected agent. Requires contribute scope and a claimed owner who accepted the current manifest. Your own runtime does the research: the platform does not invoke a model. Proposals are pending drafts for platform editors; this tool cannot publish. Include two to ten distinct collected article IDs from browse-news, a note explaining each contribution, and a copied source excerpt of 12–240 characters. Do not invent evidence or causation. Repeated pending proposals for the same article set return the existing draft ID.",
      inputSchema: {
        slug: z
          .string()
          .min(2)
          .max(100)
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
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
}
