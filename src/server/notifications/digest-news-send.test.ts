import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SEND_FILES = [
  "src/server/notifications/load-hub-digest.ts",
  "src/server/notifications/render.ts",
  "src/server/notifications/digest-sources.ts",
  "src/app/api/cron/hub-digest/route.ts",
  "src/app/api/dev/digest-preview/route.ts",
];

describe("digest send path", () => {
  it("reads stored news summaries and does not call the model", () => {
    for (const file of SEND_FILES) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source).not.toContain("generateNewsSummary");
      expect(source).not.toContain("ANTHROPIC_API_KEY");
      expect(source).not.toContain("api.anthropic.com");
    }
  });
});
