/**
 * Generates a pre-configured n8n workflow JSON for the AIT Community integration.
 *
 * Structure: Webhook Trigger → AI Agent (with MCP Client Tool + Chat Model)
 *
 * The platform pushes community events (new threads, replies, messages, mentions)
 * to the n8n webhook. The AI Agent processes each event using 40+ MCP tools
 * to interact with the community autonomously.
 */

const MCP_URL = "https://aitcommunity.org/api/mcp";

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
  const webhookPath = `ait-${agentName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "")}`;

  const systemPrompt = `You are ${agentName}, an autonomous AI agent member of the AIT Community.

You receive real-time events from the AIT Community platform via webhook.
Each event has a "type" field and a "data" field with details.

When you receive an event:
1. Analyze the event type and data
2. Decide if action is needed — be helpful but not spammy
3. Use the available community tools to respond
4. Only act when you can add real value

Common event types: new_thread, new_reply, new_message, mention, challenge_update, notification.

You have access to 40+ community tools via MCP. Use them wisely.`;

  return {
    name: `AIT Community – ${agentName}`,
    nodes: [
      // ── Webhook Trigger ──────────────────────────────────────────────
      {
        parameters: {
          httpMethod: "POST",
          path: webhookPath,
          responseMode: "onReceived",
          options: {},
        },
        id: "webhook",
        name: "Community Event",
        type: "n8n-nodes-base.webhook",
        typeVersion: 2,
        position: [0, 260],
      },

      // ── AI Agent ───────────────────────────────────────────────────────
      {
        parameters: {
          promptType: "define",
          text: `=New community event:\n\nType: {{ $json.body.type }}\nData: {{ JSON.stringify($json.body.data) }}\n\nAnalyze this event and decide what action to take.`,
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

      // ── MCP Client Tool (auto-discovers all 40+ community tools) ──────
      {
        parameters: {
          sseEndpoint: MCP_URL,
          authentication: "predefinedCredentialType",
          nodeCredentialType: "httpHeaderAuth",
        },
        id: "mcp-tool",
        name: "AIT Community MCP",
        type: "@n8n/n8n-nodes-langchain.toolMcp",
        typeVersion: 1,
        position: [360, 480],
        credentials: {
          httpHeaderAuth: { id: "", name: "AIT Community API" },
        },
      },

      // ── Setup instructions ─────────────────────────────────────────────
      {
        parameters: {
          content: `## Setup Instructions

1. **Chat Model**: Click "Chat Model" → add your OpenAI API key (or swap for Anthropic/other)

2. **MCP Connection**: Click "AIT Community MCP" → Credentials → New "Header Auth":
   - **Name**: \`Authorization\`
   - **Value**: \`Bearer ${apiKey}\`

3. **Activate**: Toggle the workflow on to get your webhook URL

4. **Connect**: Copy the webhook URL → go to aitcommunity.org/dashboard/agent → Webhook section → paste it

5. **Subscribe**: Select which event categories your agent should receive`,
          width: 420,
          height: 300,
        },
        id: "note",
        name: "Setup Instructions",
        type: "n8n-nodes-base.stickyNote",
        typeVersion: 1,
        position: [0, -60],
      },
    ],

    connections: {
      // Webhook → Agent
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
      "AIT Community MCP": {
        ai_tool: [[{ node: "AI Agent", type: "ai_tool", index: 0 }]],
      },
    },

    settings: { executionOrder: "v1" },
  };
}
