import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v3";
import type { createCaller } from "@/server/api/root";
import { BENCHMARK_MODEL_PROVIDERS } from "@/lib/benchmark-constants";

type Caller = ReturnType<typeof createCaller>;

export function registerBenchmarkTools(
  server: McpServer,
  caller: Caller,
  _keyData: { ownerId: string | null; agentId: string },
): void {
  server.registerTool(
    "list-benchmark-prompts",
    {
      description:
        "List approved AI Brand Bias Benchmark prompts the agent can run against its model. Returns id, text, category and intent for each prompt. Optionally filter by category or intent slug.",
      inputSchema: {
        categorySlug: z
          .string()
          .optional()
          .describe("Optional category slug (e.g. ai-tools, saas, devtools)."),
        intentSlug: z
          .string()
          .optional()
          .describe(
            "Optional intent slug (recommendation, comparison, best-for-persona, brand-recall, ranked-list, pros-cons).",
          ),
        limit: z
          .number()
          .min(1)
          .max(100)
          .default(20)
          .describe("Max prompts to return."),
      },
    },
    async ({ categorySlug, intentSlug, limit }) => {
      const result = await caller.benchmark.agentListApprovedPrompts({
        categorySlug,
        intentSlug,
        limit,
      });
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  server.registerTool(
    "submit-benchmark-run",
    {
      description:
        "Submit the raw text answer the agent's model produced for an approved benchmark prompt. The server extracts brand mentions asynchronously. One submission per prompt/model/day.",
      inputSchema: {
        promptId: z
          .string()
          .uuid()
          .describe(
            "UUID of the approved prompt (see list-benchmark-prompts).",
          ),
        modelProvider: z
          .enum(BENCHMARK_MODEL_PROVIDERS)
          .describe("Provider of the model the answer came from."),
        modelId: z
          .string()
          .min(1)
          .max(120)
          .describe("Specific model id, e.g. gpt-5-pro, claude-opus-4-7."),
        modelVersion: z
          .string()
          .max(120)
          .optional()
          .describe("Optional API-reported model version or snapshot."),
        temperature: z
          .number()
          .min(0)
          .max(2)
          .optional()
          .describe("Temperature used for the completion, if known."),
        rawAnswer: z
          .string()
          .min(1)
          .max(50_000)
          .describe("The model's raw text answer to the prompt."),
        locale: z
          .string()
          .max(16)
          .default("en-US")
          .describe("Locale the answer was produced in."),
        capturedAt: z
          .string()
          .datetime()
          .optional()
          .describe(
            "ISO-8601 timestamp when the answer was captured. Defaults to server time.",
          ),
      },
    },
    async (input) => {
      const result = await caller.benchmark.agentSubmitRun(input);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );
}
