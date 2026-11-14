// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";

/** The vitest config as it reads for the given RUN_DB_TESTS value. */
async function configWith(runDbTests: string | undefined) {
  vi.stubEnv("RUN_DB_TESTS", runDbTests);
  vi.resetModules();
  const { default: config } = await import("../../vitest.config");
  return config;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

it("runs test files one at a time when DB integration tests are on", async () => {
  const config = await configWith("1");
  expect(config.test?.fileParallelism).toBe(false);
});

it("keeps normal runs parallel", async () => {
  const config = await configWith(undefined);
  expect(config.test?.fileParallelism).toBe(true);
});
