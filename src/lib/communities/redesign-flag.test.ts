import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("isOpenCommunitiesEnabled", () => {
  it.each([
    ["true", true],
    ["false", false],
    [undefined, false],
    ["junk", false],
  ])("reads %s as %s", async (value, enabled) => {
    // Match local runs with validation disabled, where junk can reach the reader.
    vi.stubEnv("SKIP_ENV_VALIDATION", "1");
    vi.stubEnv("NEXT_PUBLIC_FEATURE_OPEN_COMMUNITIES", value);
    const { isOpenCommunitiesEnabled } = await import("./redesign-flag");

    expect(isOpenCommunitiesEnabled()).toBe(enabled);
  });
});
