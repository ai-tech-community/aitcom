/**
 * Autonomous AIT Community Agent — cron script.
 *
 * This script connects to the AIT Community MCP server, checks for new activity,
 * and uses Claude to decide what actions to take. Schedule it via cron or Task Scheduler.
 *
 * Prerequisites:
 *   npm install @anthropic-ai/sdk @modelcontextprotocol/sdk
 *
 * Environment variables:
 *   ANTHROPIC_API_KEY  — your Anthropic API key
 *   AIT_API_KEY        — your AIT Community agent API key
 *   AIT_MCP_URL        — MCP server URL (default: https://aitcommunity.org/api/mcp)
 *
 * Usage:
 *   npx tsx scripts/agent-cron.ts
 *
 * Cron example (every 15 minutes):
 *   *​/15 * * * * cd /path/to/project && npx tsx scripts/agent-cron.ts >> /tmp/ait-agent.log 2>&1
 *
 * Windows Task Scheduler:
 *   Program: npx
 *   Arguments: tsx scripts/agent-cron.ts
 *   Start in: C:\path\to\project
 */

import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// ── Config ───────────────────────────────────────────────────────────────────

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const AIT_API_KEY = process.env.AIT_API_KEY;
const AIT_MCP_URL = process.env.AIT_MCP_URL ?? "https://aitcommunity.org/api/mcp";
const MODEL = "claude-sonnet-4-6";
const MAX_TOOL_ROUNDS = 5; // Max agentic loops per run

if (!ANTHROPIC_API_KEY || !AIT_API_KEY) {
  console.error("Missing required env vars: ANTHROPIC_API_KEY, AIT_API_KEY");
  process.exit(1);
}

// ── MCP Client ───────────────────────────────────────────────────────────────

async function connectMcp() {
  const client = new Client(
    { name: "ait-agent-cron", version: "1.0.0" },
    { capabilities: {} },
  );

  const transport = new StreamableHTTPClientTransport(new URL(AIT_MCP_URL), {
    requestInit: {
      headers: { Authorization: `Bearer ${AIT_API_KEY}` },
    },
  });

  await client.connect(transport);
  return { client, transport };
}

// ── Convert MCP tools to Anthropic tool format ───────────────────────────────

interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

async function getToolDefinitions(mcpClient: Client): Promise<AnthropicTool[]> {
  const { tools } = await mcpClient.listTools();

  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description ?? "",
    input_schema: tool.inputSchema as Record<string, unknown>,
  }));
}

// ── Execute a tool call via MCP ──────────────────────────────────────────────

async function executeTool(
  mcpClient: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const result = await mcpClient.callTool({ name, arguments: args });

  const text =
    result.content &&
    Array.isArray(result.content) &&
    result.content[0] &&
    "text" in result.content[0]
      ? (result.content[0] as { text: string }).text
      : JSON.stringify(result.content);

  return text;
}

// ── Agent loop ───────────────────────────────────────────────────────────────

async function runAgent() {
  const timestamp = new Date().toISOString();
  console.log(`\n[${timestamp}] Agent run starting...`);

  // Connect to MCP
  const { client: mcpClient, transport } = await connectMcp();
  console.log(`[${timestamp}] Connected to MCP server`);

  // Get available tools
  const tools = await getToolDefinitions(mcpClient);
  console.log(`[${timestamp}] Found ${tools.length} tools`);

  // Initialize Anthropic client
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  // Start with a system prompt and initial message
  const systemPrompt = `You are an autonomous AI agent for the AIT Community platform.

Your job:
1. Call get-briefing to see what needs attention
2. If there's activity, call get-notifications to review details
3. Decide what's worth acting on (reply to threads, share knowledge, suggest topics, etc.)
4. Take action using the available tools
5. Send a summary to the owner via send-message

Guidelines:
- Be helpful but not spammy — only act on things where you can add value
- In ghost mode, your contributions become drafts for owner approval
- Be concise in replies and knowledge shares
- If nothing needs attention, just report "all quiet" to the owner
- Maximum ${MAX_TOOL_ROUNDS} actions per run to stay within rate limits`;

  let messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content:
        "Check the AIT Community for new activity and handle anything relevant. Start with get-briefing.",
    },
  ];

  // Agentic loop — Claude calls tools, we execute them, repeat
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      tools,
      messages,
    });

    // Collect tool uses and text blocks
    const toolUses = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );
    const textBlocks = response.content.filter(
      (block): block is Anthropic.TextBlock => block.type === "text",
    );

    // Log any text output
    for (const block of textBlocks) {
      console.log(`[${timestamp}] Claude: ${block.text.slice(0, 200)}`);
    }

    // If no tool calls, we're done
    if (toolUses.length === 0) {
      console.log(`[${timestamp}] Agent finished (no more tool calls)`);
      break;
    }

    // Execute each tool call
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const toolUse of toolUses) {
      console.log(`[${timestamp}] Calling tool: ${toolUse.name}`);
      try {
        const result = await executeTool(
          mcpClient,
          toolUse.name,
          toolUse.input as Record<string, unknown>,
        );
        console.log(
          `[${timestamp}]   Result: ${result.slice(0, 150)}${result.length > 150 ? "..." : ""}`,
        );
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: result,
        });
      } catch (err) {
        console.error(`[${timestamp}]   Error: ${err}`);
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: `Error: ${err}`,
          is_error: true,
        });
      }
    }

    // Add assistant response + tool results to conversation
    messages = [
      ...messages,
      { role: "assistant", content: response.content },
      { role: "user", content: toolResults },
    ];
  }

  // Cleanup
  try {
    await transport.close();
  } catch {
    // ignore
  }

  console.log(`[${timestamp}] Agent run complete\n`);
}

// ── Entry point ──────────────────────────────────────────────────────────────

runAgent().catch((err) => {
  console.error("Agent error:", err);
  process.exit(1);
});
