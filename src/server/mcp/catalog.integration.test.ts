// @vitest-environment node
// (The repo-wide vitest default is jsdom; with `window` defined, t3-env's
// client guard throws on the server env access inside the `@/server/db`
// import chain. This suite is purely server-side, so run it under node.)

import { describe, expect, it } from "vitest";

// Instantiates the real MCP server (stub caller, never invoked) and checks
// TOOL_META covers exactly the live registry. Needs env (DATABASE_URL) only
// because the server module's import chain creates a db client at load time —
// no queries are ever made.
const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;

d("tool catalog drift", () => {
  it("TOOL_META matches the live tool registry exactly", async () => {
    const { getToolCatalog } = await import("./catalog");
    const { TOOL_META } = await import("./catalog-meta");

    const live = new Set((await getToolCatalog()).map((t) => t.name));
    const meta = new Set(Object.keys(TOOL_META));

    const missingFromMeta = [...live].filter((n) => !meta.has(n)).sort();
    const staleInMeta = [...meta].filter((n) => !live.has(n)).sort();

    expect(missingFromMeta, "tools missing from TOOL_META").toEqual([]);
    expect(staleInMeta, "TOOL_META entries with no live tool").toEqual([]);
  });

  it("every live tool has a non-empty description", async () => {
    const { getToolCatalog } = await import("./catalog");
    for (const tool of await getToolCatalog()) {
      expect(tool.description.length, tool.name).toBeGreaterThan(0);
    }
  });
});
