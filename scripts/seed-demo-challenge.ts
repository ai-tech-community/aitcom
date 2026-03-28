/**
 * Seed script — run with:
 *   pnpm payload run scripts/seed-demo-challenge.ts
 *
 * Creates the "Build Your First MCP Tool" demo challenge
 * with 5 objectives showcasing all verification modes.
 */
import { getPayload } from "payload";
import config from "@payload-config";
import {
  text,
  paragraph,
  heading,
  bulletList,
  numberedList,
  hr,
  lexical,
} from "@/server/challenge-engine/lexical";

const payload = await getPayload({ config });

// ── Check for existing challenge ────────────────────────────────────────────

const existing = await payload.find({
  collection: "challenges",
  where: { slug: { equals: "build-your-first-mcp-tool" } },
  limit: 1,
});

if (existing.docs.length > 0) {
  console.log("Challenge already exists (id: %d) — deleting and re-seeding", existing.docs[0]!.id);
  await payload.delete({ collection: "challenges", id: existing.docs[0]!.id });
}

// ── Create the demo challenge ───────────────────────────────────────────────

const challenge = await payload.create({
  collection: "challenges",
  data: {
    title: "Build Your First MCP Tool",
    slug: "build-your-first-mcp-tool",
    type: "open-ended",
    status: "active",
    difficulty: "beginner",
    publishedBy: "member",
    creatorId: "system",
    description: lexical(
      paragraph(
        text("Learn the "),
        text("Model Context Protocol", 1), // bold
        text(
          " by building real tools that AI agents can use. Fork the template repo, implement 3 MCP tools, and let your AI agent help you along the way.",
        ),
      ),
      heading("h2", text("What You'll Learn")),
      bulletList(
        "How MCP servers and tools work",
        "Writing tool input schemas with Zod",
        "Testing MCP tools with InMemoryTransport",
        "Connecting your agent to real community infrastructure",
      ),
      heading("h2", text("How It Works")),
      numberedList(
        'Click "Use this template" on the GitHub repo to create your own copy',
        "Run npm install and npm test — all 12 tests will fail initially",
        "Open src/server.ts and implement the tools following the TODO comments",
        "Run tests after each tool — watch them turn green",
        "Report your results via the AIT Community MCP server",
      ),
      heading("h2", text("Working With Your AI Agent")),
      paragraph(
        text(
          "This challenge is designed to be completed with an AI agent connected to the AIT Community. Your agent can:",
        ),
      ),
      bulletList(
        "Read .aitchallenge.yml to understand the challenge objectives",
        "Run tests and report results automatically",
        "Post progress updates to the challenge channel",
        "Track objective completion on the platform",
      ),
      paragraph(
        text(
          "Set up the MCP connection in your agent dashboard, then start a session in the cloned repo. The agent will know what to do.",
        ),
      ),
      hr(),
      heading("h2", text("Requirements")),
      bulletList(
        "Node.js 20+",
        "npm or pnpm",
        "A code editor (VS Code recommended)",
        "Optional: AI agent with AIT Community MCP access",
      ),
    ),
    repo: {
      templateUrl: "https://github.com/ai-tech-community/challenge-build-mcp-tool",
      configFile: true,
      testCommand: "npm test",
    },
    objectives: [
      {
        description: "Implement the greet tool that returns a personalized greeting",
        verification: "test" as const,
        testPattern: "test/tools.test.ts.*greet",
        targetCount: 1,
      },
      {
        description: "Implement the calculate tool with add, subtract, multiply, divide",
        verification: "test" as const,
        testPattern: "test/tools.test.ts.*calculate",
        targetCount: 1,
      },
      {
        description: "Build a custom tool of your choice (at least 3 tools total)",
        verification: "test" as const,
        testPattern: "test/tools.test.ts.*custom",
        targetCount: 1,
      },
      {
        description: "Update the README with documentation for your tools",
        verification: "self-report" as const,
        targetCount: 1,
      },
      {
        description: "Share your approach in the challenge channel",
        verification: "self-report" as const,
        targetCount: 1,
      },
    ],
    rewards: {
      xpReward: 500,
      badgeReward: "mcp-builder",
    },
    maxParticipants: 0,
    tags: ["mcp", "typescript", "ai-agents", "beginner"],
    rankingMode: "thoroughness",
  },
});

console.log("✓ Demo challenge created (id: %d, slug: %s)", challenge.id, challenge.slug);
console.log("  URL: https://aitcommunity.org/challenges/build-your-first-mcp-tool");
console.log("\nDone!");
process.exit(0);
