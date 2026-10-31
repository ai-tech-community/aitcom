import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { allCollectors, getCollector } from "../catalog";
import { createCollectorRuns } from "../runs";
import { collectAll, fakeContext } from "../testing/fake-context";
import { allPresets, getPreset } from "./catalog";
const facade = createCollectorRuns({
  db: {} as never,

  catalog: { all: allCollectors, get: getCollector, everything: allCollectors },
  presets: { all: allPresets, get: getPreset },
  now: () => new Date(),
  kick: () => undefined,
});
describe("ready-made public sources", () => {
  it.each([
    [
      "https://news.ycombinator.com/ask",
      "hacker-news-stories",
      { list: "ask" },
    ],
    [
      "https://github.com/octokit",
      "github-org-repositories",
      { organization: "octokit" },
    ],
    ["https://www.python.org/jobs/", "python-jobs", {}],
  ])("opens %s with its saved input", (address, presetId, prefill) => {
    expect(facade.recognize(address)).toEqual({
      ok: true,
      matched: true,
      presetId,
      prefill,
    });
  });
  it("reads verified Python list markup without member selectors", async () => {
    const preset = getPreset("python-jobs")!;
    const collector = getCollector(preset.collectorId)!;
    const { ctx } = fakeContext({
      "https://www.python.org/jobs/": {
        body: readFileSync(
          "src/server/collectors/testing/fixtures/python-jobs.html",
          "utf8",
        ),
      },
    });
    const rows = await collectAll(
      collector.run(collector.inputSchema.parse(preset.base), ctx),
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      title: "Senior Python Engineer",
      url: "https://www.python.org/jobs/8183/",
      location: "London, UK",
      postedAt: "2026-10-23T22:34:52.166674+00:00",
    });
    expect(rows[1]).toMatchObject({
      title: "Senior Software Engineer — Python, React & AI",
      url: "https://www.python.org/jobs/8181/",
    });
  });
});
