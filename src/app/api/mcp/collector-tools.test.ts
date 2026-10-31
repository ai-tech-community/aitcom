import { describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { createCaller } from "@/server/api/root";
import { registerCollectorTools } from "./collector-tools";
function fixture(scopes = ["collect"], ownerId: string | null = "owner") {
  const tools = new Map<
    string,
    {
      options: { annotations: Record<string, boolean> };
      handler: (input: never) => Promise<unknown>;
    }
  >();
  const server = {
    registerTool: (name: string, options: never, handler: never) =>
      tools.set(name, { options, handler }),
  };
  const collectors = {
    agentList: vi.fn().mockResolvedValue([]),
    agentStart: vi.fn().mockResolvedValue({ ok: true, runId: "r" }),
    agentRun: vi.fn().mockResolvedValue({ id: "r" }),
    agentItems: vi.fn().mockResolvedValue({ items: [] }),
  };
  registerCollectorTools(
    server as unknown as McpServer,
    { collectors } as unknown as ReturnType<typeof createCaller>,
    { scopes, ownerId },
  );
  return { tools, collectors };
}
describe("collector MCP tools", () => {
  it("lists tools only for a claimed collect-scoped agent", () => {
    expect(fixture(["read"]).tools.size).toBe(0);
    expect(fixture(["collect"], null).tools.size).toBe(0);
    expect([...fixture().tools.keys()]).toEqual([
      "list-collectors",
      "start-collector-run",
      "get-collector-run",
      "get-collector-items",
    ]);
  });
  it("delegates to the authenticated adapter and accurately marks the internet collection write", async () => {
    const { tools, collectors } = fixture();
    const input = { collectorId: "hacker-news", input: { list: "ask" } };
    expect(
      await tools.get("start-collector-run")!.handler(input as never),
    ).toMatchObject({
      content: [
        {
          type: "text",
          text: JSON.stringify({ ok: true, runId: "r" }, null, 2),
        },
      ],
    });
    expect(collectors.agentStart).toHaveBeenCalledWith(input);
    expect(tools.get("start-collector-run")!.options.annotations).toMatchObject(
      { readOnlyHint: false, openWorldHint: true, destructiveHint: false },
    );
    for (const name of [
      "list-collectors",
      "get-collector-run",
      "get-collector-items",
    ])
      expect(tools.get(name)!.options.annotations.readOnlyHint).toBe(true);
  });
});
