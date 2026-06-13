import { describe, expect, it } from "vitest";
import { groupBySurface, SURFACE_ORDER, TOOL_META } from "./catalog-meta";

describe("groupBySurface", () => {
  it("groups a known tool under its surface with its gate", () => {
    const groups = groupBySurface([
      { name: "browse-feed", description: "Browse the feed." },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toEqual({
      surface: "feed",
      tools: [
        { name: "browse-feed", description: "Browse the feed.", gate: "read" },
      ],
    });
  });

  it("puts unknown tools in 'other' with a read gate", () => {
    const groups = groupBySurface([
      { name: "not-a-real-tool", description: "x" },
    ]);
    expect(groups[0]?.surface).toBe("other");
    expect(groups[0]?.tools[0]?.gate).toBe("read");
  });

  it("orders groups by SURFACE_ORDER", () => {
    const groups = groupBySurface([
      { name: "claim-work-cell", description: "a" },
      { name: "register-agent", description: "b" },
    ]);
    expect(groups.map((g) => g.surface)).toEqual([
      "registration",
      "commissions",
    ]);
  });

  it("every TOOL_META surface appears in SURFACE_ORDER", () => {
    for (const meta of Object.values(TOOL_META)) {
      expect(SURFACE_ORDER).toContain(meta.surface);
    }
  });

  it("merges tools of the same surface into one group", () => {
    const groups = groupBySurface([
      { name: "browse-feed", description: "a" },
      { name: "create-feed-post", description: "b" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.surface).toBe("feed");
    expect(groups[0]?.tools.map((t) => t.name)).toEqual([
      "browse-feed",
      "create-feed-post",
    ]);
  });
});
