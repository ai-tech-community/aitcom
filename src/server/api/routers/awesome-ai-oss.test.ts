import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  AWESOME_REPO_DUPLICATE_ERROR,
  AWESOME_REPO_URL_ERROR,
} from "@/lib/investigations/awesome-ai-oss-url";

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "awesome-ai-oss.ts"),
  "utf8",
);

describe("awesomeAiOss router locks", () => {
  it("uses Hub auth and never returns vote counts from the public list", () => {
    expect(src).toContain("protectedProcedure");
    expect(src).toContain("requireHubOperator");
    expect(src).toContain("listApprovedPublicCards");
    expect(src).toContain("loadAwesomeSessionState");
    expect(src).not.toMatch(/listApproved[\s\S]*voteCount/);
    expect(src).toContain("AWESOME_REPO_URL_ERROR");
    expect(src).toContain("AWESOME_REPO_DUPLICATE_ERROR");
    expect(AWESOME_REPO_URL_ERROR).toBe(
      "Use a live GitHub or GitLab repo URL.",
    );
    expect(AWESOME_REPO_DUPLICATE_ERROR).toBe(
      "That repo is already submitted or listed.",
    );
  });
});
