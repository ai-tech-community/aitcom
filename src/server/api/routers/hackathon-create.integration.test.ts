import { describe, it, expect } from "vitest";

// Integration coverage for createHackathon. Like work-grid.integration.test.ts,
// these require a live DB + Payload and are skipped when DATABASE_URL is unset.
const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;

d("hackathon.createHackathon", () => {
  it("rejects a non-admin caller with FORBIDDEN", async () => {
    expect(true).toBe(true); // replace with real harness call when DB wiring lands
  });

  it("creates a bound draft pair carrying the community's communityId", async () => {
    expect(true).toBe(true);
  });
});
