// @vitest-environment node
// (The repo-wide vitest default is jsdom; with `window` defined, t3-env's
// client guard throws on the server env access inside the `@/server/db`
// import chain. This suite is purely server-side, so run it under node.)

import { describe, expect, it } from "vitest";

// Instantiates the real MCP server (stub caller, never invoked) and checks
// TOOL_META covers exactly the live registry. The server module's import chain
// creates a db client at load time, so it needs a DATABASE_URL to parse — but
// no connection or query is ever made. A placeholder lets this run in CI,
// where unit tests have no database.
process.env.DATABASE_URL ??=
  "postgresql://placeholder:placeholder@127.0.0.1:1/placeholder";

describe("tool catalog drift", () => {
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

  it("every live tool declares all four behaviour hints", async () => {
    const { getToolCatalog } = await import("./catalog");
    const missing = (await getToolCatalog())
      .filter(
        ({ annotations: a }) =>
          typeof a?.readOnlyHint !== "boolean" ||
          typeof a.destructiveHint !== "boolean" ||
          typeof a.idempotentHint !== "boolean" ||
          typeof a.openWorldHint !== "boolean",
      )
      .map((t) => t.name);
    expect(missing, "tools without a tool-annotations profile").toEqual([]);
  });

  it("no tool claims to be both read-only and destructive", async () => {
    const { getToolCatalog } = await import("./catalog");
    const contradictory = (await getToolCatalog())
      .filter(
        (t) => t.annotations?.readOnlyHint && t.annotations.destructiveHint,
      )
      .map((t) => t.name);
    expect(contradictory).toEqual([]);
  });

  it("every live tool has a non-empty description", async () => {
    const { getToolCatalog } = await import("./catalog");
    for (const tool of await getToolCatalog()) {
      expect(tool.description.length, tool.name).toBeGreaterThan(0);
    }
  });
});
