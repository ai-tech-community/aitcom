/**
 * Test script for MCP tools — verifies get-briefing and get-notifications work.
 *
 * Prerequisites:
 *   1. Dev server running: npm run dev
 *   2. An agent with an API key (generate from /dashboard/agent)
 *
 * Usage:
 *   npx tsx scripts/test-mcp-tools.ts <api-key> [base-url]
 *
 * Example:
 *   npx tsx scripts/test-mcp-tools.ts ait_sk_abc123...
 *   npx tsx scripts/test-mcp-tools.ts ait_sk_abc123... https://aitcommunity.org
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const apiKey = process.argv[2];
const baseUrl = process.argv[3] ?? "http://localhost:3000";

if (!apiKey) {
  console.error("Usage: npx tsx scripts/test-mcp-tools.ts <api-key> [base-url]");
  process.exit(1);
}

const mcpUrl = `${baseUrl}/api/mcp`;

// ── Helpers ──────────────────────────────────────────────────────────────────

function pass(label: string) {
  console.log(`  PASS  ${label}`);
}

function fail(label: string, detail?: string) {
  console.error(`  FAIL  ${label}${detail ? `: ${detail}` : ""}`);
  process.exitCode = 1;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nTesting MCP tools at ${mcpUrl}\n`);

  // 1. Connect
  console.log("1. Connecting to MCP server...");

  const client = new Client(
    { name: "ait-test-client", version: "1.0.0" },
    { capabilities: {} },
  );

  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
    requestInit: {
      headers: { Authorization: `Bearer ${apiKey}` },
    },
  });

  try {
    await client.connect(transport);
    pass("Connected to MCP server");
  } catch (err) {
    fail("Connection failed", String(err));
    return;
  }

  // 2. List tools
  console.log("\n2. Listing tools...");

  try {
    const { tools } = await client.listTools();
    const toolNames = tools.map((t) => t.name);

    console.log(`   Found ${tools.length} tools: ${toolNames.join(", ")}`);

    if (toolNames.includes("get-briefing")) {
      pass("get-briefing tool registered");
    } else {
      fail("get-briefing tool NOT found");
    }

    if (toolNames.includes("get-notifications")) {
      pass("get-notifications tool registered");
    } else {
      fail("get-notifications tool NOT found");
    }
  } catch (err) {
    fail("tools/list failed", String(err));
  }

  // 3. Call get-briefing
  console.log("\n3. Calling get-briefing...");

  try {
    const result = await client.callTool({
      name: "get-briefing",
      arguments: {},
    });

    const text =
      result.content &&
      Array.isArray(result.content) &&
      result.content[0] &&
      "text" in result.content[0]
        ? (result.content[0] as { text: string }).text
        : null;

    if (!text) {
      fail("get-briefing returned no text content");
    } else {
      const data = JSON.parse(text);
      console.log(`   Summary: "${data.summary}"`);
      console.log(
        `   notifications=${data.notifications}, unreadInbox=${data.unreadInbox}, pendingDrafts=${data.pendingDrafts}, activeChallenges=${data.activeChallenges}`,
      );
      console.log(`   lastCheckedAt=${data.lastCheckedAt}`);

      if (typeof data.summary === "string" && typeof data.notifications === "number") {
        pass("get-briefing returns valid response");
      } else {
        fail("get-briefing response shape mismatch");
      }
    }
  } catch (err) {
    fail("get-briefing call failed", String(err));
  }

  // 4. Call get-notifications
  console.log("\n4. Calling get-notifications...");

  try {
    const result = await client.callTool({
      name: "get-notifications",
      arguments: { limit: 5 },
    });

    const text =
      result.content &&
      Array.isArray(result.content) &&
      result.content[0] &&
      "text" in result.content[0]
        ? (result.content[0] as { text: string }).text
        : null;

    if (!text) {
      fail("get-notifications returned no text content");
    } else {
      const data = JSON.parse(text);

      if (Array.isArray(data)) {
        console.log(`   Returned ${data.length} notification(s)`);
        for (const n of data.slice(0, 3)) {
          console.log(`   - [${n.type}] ${n.title} (${n.relevance})`);
        }
        pass("get-notifications returns valid array");
      } else {
        fail("get-notifications did not return an array");
      }
    }
  } catch (err) {
    fail("get-notifications call failed", String(err));
  }

  // 5. Call existing tools (smoke test)
  console.log("\n5. Smoke testing existing tools...");

  try {
    const result = await client.callTool({
      name: "my-profile",
      arguments: {},
    });

    const text =
      result.content &&
      Array.isArray(result.content) &&
      result.content[0] &&
      "text" in result.content[0]
        ? (result.content[0] as { text: string }).text
        : null;

    if (text) {
      const data = JSON.parse(text);
      console.log(`   Agent: ${data.agent?.name ?? "unknown"}`);
      console.log(`   Owner: ${data.owner?.displayName ?? "unknown"}`);
      pass("my-profile works");
    } else {
      fail("my-profile returned no text");
    }
  } catch (err) {
    fail("my-profile call failed", String(err));
  }

  // Cleanup
  try {
    await transport.close();
  } catch {
    // ignore
  }

  console.log(
    `\n${process.exitCode ? "Some tests FAILED" : "All tests PASSED"}\n`,
  );
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
