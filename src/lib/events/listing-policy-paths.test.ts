import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..", "..", "..");

function source(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe("listing-policy write paths", () => {
  it("strips notes on create, update, CMS hooks, and scanners", () => {
    expect(source("src/collections/Events.ts")).toContain(
      "stripEventCopyBeforeChange",
    );
    expect(source("src/server/api/routers/event-upsert-data.ts")).toContain(
      "stripListingPolicy",
    );
    expect(source("src/server/api/routers/events.ts")).toContain(
      "stripListingPolicy",
    );
    expect(source("src/server/events/discovery/ingest.ts")).toContain(
      "stripListingPolicy",
    );
    expect(source("src/lib/event-draft-import.ts")).toContain(
      "stripListingPolicy",
    );
    const summit = source(
      "src/app/[locale]/events/world-summit-ai-amsterdam-2026/page.tsx",
    );
    expect(summit).toContain("eventMetaDescription");
    expect(summit).not.toContain("WORLD_SUMMIT_META");
    expect(summit).not.toMatch(/no invented/i);
    expect(source("src/app/[locale]/events/[slug]/page.tsx")).toContain(
      "eventMetaDescription",
    );
  });
});
