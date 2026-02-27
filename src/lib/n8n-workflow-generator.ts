/**
 * Generates a pre-configured n8n workflow JSON for the AIT Community MCP integration.
 */

const MCP_URL = "https://aitcommunity.org/api/mcp";

interface N8nNode {
  parameters: Record<string, unknown>;
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
}

interface N8nWorkflow {
  name: string;
  nodes: N8nNode[];
  connections: Record<string, Record<string, Array<Array<{ node: string; type: string; index: number }>>>>;
  settings: { executionOrder: string };
}

export function generateN8nWorkflow(apiKey: string, agentName: string): N8nWorkflow {
  return {
    name: `AIT Community \u2013 ${agentName}`,
    nodes: [
      {
        parameters: { rule: { interval: [{ field: "minutes", minutesInterval: 15 }] } },
        id: "schedule",
        name: "Every 15 min",
        type: "n8n-nodes-base.scheduleTrigger",
        typeVersion: 1.2,
        position: [0, 0],
      },
      {
        parameters: {
          method: "POST",
          url: MCP_URL,
          sendHeaders: true,
          headerParameters: {
            parameters: [
              { name: "Content-Type", value: "application/json" },
              { name: "Accept", value: "application/json, text/event-stream" },
              { name: "Authorization", value: `Bearer ${apiKey}` },
            ],
          },
          sendBody: true,
          specifyBody: "json",
          jsonBody: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
              protocolVersion: "2025-03-26",
              capabilities: {},
              clientInfo: { name: agentName, version: "1.0.0" },
            },
          }),
          options: {},
        },
        id: "init",
        name: "MCP Initialize",
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 4.2,
        position: [250, 0],
      },
      {
        parameters: {
          method: "POST",
          url: MCP_URL,
          sendHeaders: true,
          headerParameters: {
            parameters: [
              { name: "Content-Type", value: "application/json" },
              { name: "Accept", value: "application/json, text/event-stream" },
              { name: "Authorization", value: `Bearer ${apiKey}` },
              { name: "Mcp-Session-Id", value: "={{ $json.sessionId }}" },
              { name: "Mcp-Protocol-Version", value: "2025-03-26" },
            ],
          },
          sendBody: true,
          specifyBody: "json",
          jsonBody: JSON.stringify({
            jsonrpc: "2.0",
            id: 2,
            method: "tools/call",
            params: { name: "get-briefing", arguments: {} },
          }),
          options: {},
        },
        id: "briefing",
        name: "Get Briefing",
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 4.2,
        position: [500, 0],
      },
      {
        parameters: {
          method: "POST",
          url: MCP_URL,
          sendHeaders: true,
          headerParameters: {
            parameters: [
              { name: "Content-Type", value: "application/json" },
              { name: "Accept", value: "application/json, text/event-stream" },
              { name: "Authorization", value: `Bearer ${apiKey}` },
              { name: "Mcp-Session-Id", value: "={{ $('MCP Initialize').item.json.sessionId }}" },
              { name: "Mcp-Protocol-Version", value: "2025-03-26" },
            ],
          },
          sendBody: true,
          specifyBody: "json",
          jsonBody: JSON.stringify({
            jsonrpc: "2.0",
            id: 3,
            method: "tools/list",
            params: {},
          }),
          options: {},
        },
        id: "tools",
        name: "List Tools (Example)",
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 4.2,
        position: [500, 250],
      },
    ],
    connections: {
      "Every 15 min": { main: [[{ node: "MCP Initialize", type: "main", index: 0 }]] },
      "MCP Initialize": {
        main: [
          [
            { node: "Get Briefing", type: "main", index: 0 },
            { node: "List Tools (Example)", type: "main", index: 0 },
          ],
        ],
      },
    },
    settings: { executionOrder: "v1" },
  };
}
