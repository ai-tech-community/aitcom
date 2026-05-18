import { describe, expect, it } from "vitest";

import { decideSurfacesToSeed } from "./seed-queued-runs";

describe("decideSurfacesToSeed", () => {
  it("seeds locale-eligible surfaces with no existing queue entry", () => {
    const result = decideSurfacesToSeed(
      ["chatgpt_grounded", "kimi_grounded"],
      "en-US",
      [],
    );
    expect(result.seeded).toEqual(["chatgpt_grounded"]);
    expect(result.skippedLocale).toEqual(["kimi_grounded"]);
    expect(result.skippedExisting).toEqual([]);
  });

  it("skips surfaces that already have a queued or running row for this prompt", () => {
    const result = decideSurfacesToSeed(
      ["chatgpt_grounded"],
      "en-US",
      ["chatgpt_grounded"],
    );
    expect(result.seeded).toEqual([]);
    expect(result.skippedExisting).toEqual(["chatgpt_grounded"]);
  });

  it("returns no seeds when the locale is unsupported by every surface", () => {
    const result = decideSurfacesToSeed(["chatgpt_grounded"], "zh-CN", []);
    expect(result.seeded).toEqual([]);
    expect(result.skippedLocale).toEqual(["chatgpt_grounded"]);
  });

  it("handles a mix of locale-skipped and already-queued surfaces", () => {
    const result = decideSurfacesToSeed(
      ["chatgpt_grounded", "kimi_grounded"],
      "en-US",
      ["chatgpt_grounded"],
    );
    expect(result.seeded).toEqual([]);
    expect(result.skippedExisting).toEqual(["chatgpt_grounded"]);
    expect(result.skippedLocale).toEqual(["kimi_grounded"]);
  });
});
