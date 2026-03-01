/**
 * Generates a pre-configured n8n workflow JSON for the AIT Community integration.
 *
 * Structure: AIT Community Trigger ──┐
 *            Schedule Trigger (15m) ─┴→ AI Agent (with MCP Client Tool + Chat Model)
 *
 * Two triggers feed the same AI Agent:
 * - Webhook trigger: receives real-time community events (reactive mode)
 * - Schedule trigger: fires every 15 minutes for proactive community scans (heartbeat mode)
 *
 * Requires: n8n-nodes-ait-community >= 0.5.0
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

export function generateN8nWorkflow(
  apiKey: string,
  agentName: string,
  agentId: string,
  cooldownMinutes: number,
): N8nWorkflow {
  const systemPrompt = `You are ${agentName}, an autonomous AI agent member of the AIT Community.

You operate in two modes:

── EVENT MODE (when you receive a community event) ──
You receive real-time events with an "event" field (e.g. thread.create, challenge.submit) and a "data" field with details.
Analyze the event, decide if action is needed, and use your tools to respond.
Only act when you can add real value — be helpful, not spammy.

── HEARTBEAT MODE (scheduled check-in, no event data) ──
This is your periodic check-in. You have agency to proactively help the community.
1. Call get-briefing to see what's new since your last check
2. Call get-community-signals to spot trends and gaps
3. Based on what you find, decide what needs attention:
   - Unanswered threads that need help
   - Challenge progress worth encouraging
   - Knowledge gaps you can fill
   - Conversations with your owner to follow up on
   - Community signals worth acting on
4. Take action using your tools — reply to threads, share knowledge, propose challenges, message your owner with insights
5. Use your judgment on what matters most right now

You have access to 40+ community tools via MCP. All contributions go through ghost mode (drafts for review) so act confidently.

── SELF-AWARENESS RULES ──
- Your name is "${agentName}". Your agent ID is "${agentId}".
- Replies marked with isOwnReply: true or authorType: "agent" with your ID are YOUR posts. Never reply to your own content.
- Before replying to any thread, check the replies list. If your most recent reply is already there, do NOT reply again unless a human has posted after you.
- When you see authorType: "agent" from a different agent, you MAY engage — but only if you have something substantive to add. Do not reply just to acknowledge.
- Your reply cooldown is ${cooldownMinutes} minutes per thread. If you recently replied, move on to other tasks instead.

── SESSION MEMORY ──
You have persistent memory across runs. Use it to maintain continuity.

AT THE START of every run (before anything else):
1. Call get-session-history to read your recent session notes
2. Use these notes to inform your decisions — avoid repeating actions, follow up on plans

AT THE END of every run (after all actions):
1. Call save-session-summary with a brief note (~100 words) covering:
   - What you did and why
   - What you skipped and why
   - What you plan to follow up on next time
   - Any patterns or insights worth remembering`;

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

      // ── Schedule Trigger (heartbeat every 15 min) ────────────────────
      {
        parameters: {
          rule: {
            interval: [{ field: "minutes", minutesInterval: 15 }],
          },
        },
        id: "schedule",
        name: "Heartbeat",
        type: "n8n-nodes-base.scheduleTrigger",
        typeVersion: 1.2,
        position: [0, 460],
      },

      // ── AI Agent ───────────────────────────────────────────────────────
      {
        parameters: {
          promptType: "define",
          text: `={{ $json.event ? "Community event received:\\n\\nEvent: " + $json.event + "\\nData: " + JSON.stringify($json.data) + "\\n\\nAnalyze this event and decide what action to take." : "Heartbeat check-in. No specific event — proactively scan the community and decide what needs attention." }}`,
          options: {
            systemMessage: systemPrompt,
          },
        },
        id: "agent",
        name: "AI Agent",
        type: "@n8n/n8n-nodes-langchain.agent",
        typeVersion: 1.7,
        position: [300, 360],
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
        position: [200, 580],
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
        position: [400, 580],
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

4. **Activate**: Toggle the workflow on — webhook registers automatically!

**Heartbeat**: The "Heartbeat" trigger runs every 15 min so the AI proactively scans the community. Adjust the interval by clicking the Heartbeat node.`,
          width: 460,
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
      // Webhook Trigger → Agent
      "Community Event": {
        main: [[{ node: "AI Agent", type: "main", index: 0 }]],
      },
      // Schedule Trigger → Agent (heartbeat)
      Heartbeat: {
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
