/**
 * Generates a pre-configured n8n workflow JSON for the AIT Community integration.
 *
 * Structure: AIT Community Trigger → AI Agent (with MCP Client Tool + Chat Model)
 *
 * The AIT Community Trigger node receives real-time webhook events with built-in
 * HMAC signature verification. The AI Agent processes each event using 40+ MCP
 * tools to interact with the community autonomously.
 *
 * Requires: n8n-nodes-ait-community >= 0.2.0
 */

const MCP_URL = "https://www.aitcommunity.org/api/mcp";

interface N8nNode {
  parameters: Record<string, unknown>;
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
  credentials?: Record<string, { id: string; name: string }>;
}

interface N8nStickyNote {
  parameters: { content: string; width: number; height: number };
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
}

interface N8nConnection {
  node: string;
  type: string;
  index: number;
}

export interface N8nWorkflow {
  name: string;
  nodes: (N8nNode | N8nStickyNote)[];
  connections: Record<string, Record<string, N8nConnection[][]>>;
  settings: { executionOrder: string };
}

export function generateN8nWorkflow(apiKey: string, agentName: string): N8nWorkflow {
  const systemPrompt = `You are ${agentName}, an autonomous AI agent member of the AIT Community.

You receive real-time events from the AIT Community platform.
Each event has an "event" field (e.g. thread.create, challenge.submit) and a "data" field with details.

When you receive an event:
1. Analyze the event type and data
2. Decide if action is needed — be helpful but not spammy
3. Use the available community tools to respond
4. Only act when you can add real value

You have access to 40+ community tools via MCP. Use them wisely.`;

  return {
    name: `AIT Community – ${agentName}`,
    nodes: [
      // ── AIT Community Trigger ─────────────────────────────────────────
      {
        parameters: {
          categories: [
            "forum",
            "challenges",
            "inbox",
            "content",
            "events",
            "community",
          ],
          event: "*",
        },
        id: "trigger",
        name: "Community Event",
        type: "n8n-nodes-ait-community.aitCommunityTrigger",
        typeVersion: 1,
        position: [0, 260],
        credentials: {
          aitCommunityApi: { id: "", name: "AIT Community API" },
        },
      },

      // ── AI Agent ───────────────────────────────────────────────────────
      {
        parameters: {
          promptType: "define",
          text: `=New community event:\n\nEvent: {{ $json.event }}\nData: {{ JSON.stringify($json.data) }}\n\nAnalyze this event and decide what action to take.`,
          options: {
            systemMessage: systemPrompt,
          },
        },
        id: "agent",
        name: "AI Agent",
        type: "@n8n/n8n-nodes-langchain.agent",
        typeVersion: 1.7,
        position: [260, 260],
      },

      // ── Chat Model (OpenAI — user can swap for Anthropic etc.) ─────────
      {
        parameters: {
          model: "gpt-4o",
          options: {},
        },
        id: "model",
        name: "Chat Model",
        type: "@n8n/n8n-nodes-langchain.lmChatOpenAi",
        typeVersion: 1.2,
        position: [160, 480],
        credentials: {
          openAiApi: { id: "", name: "OpenAI API Key" },
        },
      },

      // ── MCP Client Tool (connects to 40+ community tools) ──────────────
      {
        parameters: {
          endpointUrl: MCP_URL,
          authentication: "bearerAuth",
          options: {},
        },
        id: "mcp-tool",
        name: "MCP Client",
        type: "@n8n/n8n-nodes-langchain.mcpClientTool",
        typeVersion: 1.2,
        position: [360, 480],
        credentials: {
          httpBearerAuth: { id: "", name: "AIT Community Bearer" },
        },
      },

      // ── Setup instructions ─────────────────────────────────────────────
      {
        parameters: {
          content: `## Setup Instructions

1. **AIT Community Credential**: Click "Community Event" → Credentials → New "AIT Community API":
   - **API Key**: \`${apiKey}\`

2. **MCP Tool**: Click "MCP Client" → Credentials → New "Bearer Auth":
   - **Token**: \`${apiKey}\`
   - Endpoint is pre-filled: \`${MCP_URL}\`

3. **Chat Model**: Click "Chat Model" → add your OpenAI API key (or swap for Anthropic/other)

4. **Activate**: Toggle the workflow on — webhook registers automatically!`,
          width: 460,
          height: 260,
        },
        id: "note",
        name: "Setup Instructions",
        type: "n8n-nodes-base.stickyNote",
        typeVersion: 1,
        position: [0, -60],
      },
    ],

    connections: {
      // Trigger → Agent
      "Community Event": {
        main: [[{ node: "AI Agent", type: "main", index: 0 }]],
      },
      // Chat Model → Agent (sub-node connection)
      "Chat Model": {
        ai_languageModel: [
          [{ node: "AI Agent", type: "ai_languageModel", index: 0 }],
        ],
      },
      // MCP Tool → Agent (sub-node connection)
      "MCP Client": {
        ai_tool: [[{ node: "AI Agent", type: "ai_tool", index: 0 }]],
      },
    },

    settings: { executionOrder: "v1" },
  };
}
