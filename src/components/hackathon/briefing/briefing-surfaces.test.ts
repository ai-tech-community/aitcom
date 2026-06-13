import { describe, it, expect } from "vitest";

import { TOOL_META, groupBySurface } from "@/server/mcp/catalog-meta";
import { BRIEFING_SURFACES, filterBriefingGroups } from "./briefing-surfaces";

describe("filterBriefingGroups", () => {
  it("keeps exactly the briefing surfaces, in catalog order", () => {
    const allTools = Object.keys(TOOL_META).map((name) => ({
      name,
      description: "x",
    }));
    const filtered = filterBriefingGroups(groupBySurface(allTools));
    // groupBySurface preserves SURFACE_ORDER: inbox < challenges < commissions.
    // BRIEFING_SURFACES const reflects declaration order; sort both sides to
    // assert membership, then separately verify SURFACE_ORDER is honoured.
    expect(new Set(filtered.map((g) => g.surface))).toEqual(
      new Set(BRIEFING_SURFACES),
    );
    // Verify that the relative ordering matches SURFACE_ORDER
    // (inbox → challenges → commissions, not BRIEFING_SURFACES declaration order).
    expect(filtered.map((g) => g.surface)).toEqual([
      "inbox",
      "challenges",
      "commissions",
    ]);
  });

  it("every briefing surface has at least one registered tool", () => {
    const surfaces = new Set(Object.values(TOOL_META).map((m) => m.surface));
    for (const s of BRIEFING_SURFACES) expect(surfaces.has(s)).toBe(true);
  });
});
