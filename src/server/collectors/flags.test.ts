import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ disabled: undefined as string | undefined }));
vi.mock("@/env", () => ({
  env: {
    get COLLECTORS_DISABLED() {
      return h.disabled;
    },
  },
}));
import { disabledCollectorIds } from "./flags";
import { allCollectors, getCollector } from "./catalog";
import { allPresets, getPreset } from "./presets/catalog";
import { createCollectorRuns } from "./runs";
beforeEach(() => {
  h.disabled = undefined;
});
describe("per-collector operational controls", () => {
  it("makes collectors available without deployment opt-in", () => {
    expect(disabledCollectorIds().size).toBe(0);
    expect(getCollector("page-list", disabledCollectorIds())).toBeDefined();
  });
  it("retains comma/space-separated disable controls and hides the affected presets", async () => {
    h.disabled = "page-list, github-repositories\npage-list";
    const disabled = disabledCollectorIds();
    expect([...disabled]).toEqual(["page-list", "github-repositories"]);
    const get = (id: string) => getCollector(id, disabled);
    const runs = createCollectorRuns({
      db: {} as never,
      catalog: {
        all: () => allCollectors().filter((c) => get(c.id)),
        get,
        everything: allCollectors,
      },
      presets: { all: allPresets, get: getPreset },
      kick: vi.fn(),
      now: () => new Date(),
    });
    expect(runs.listPresets("en").map((p) => p.id)).not.toContain(
      "python-jobs",
    );
    expect(runs.listPresets("en").map((p) => p.id)).toContain(
      "hacker-news-stories",
    );
    expect(
      await runs.startRun({
        userId: "owner",
        origin: "web",
        collectorId: "page-list",
        input: {},
      }),
    ).toMatchObject({ ok: false, reason: "unknown_collector" });
  });
});
