import { describe, expect, it } from "vitest";

import { listingsFromJobsUrl } from "@/server/startups/scan-jobs";

describe("listingsFromJobsUrl", () => {
  it("uses Greenhouse JSON when the careers URL is a board", async () => {
    const listings = await listingsFromJobsUrl(
      "https://boards.greenhouse.io/anthropic",
      async (url) => {
        expect(url).toContain("boards-api.greenhouse.io");
        return {
          ok: true,
          status: 200,
          contentType: "application/json",
          text: JSON.stringify({
            jobs: [
              {
                id: 9,
                title: "Research Engineer",
                absolute_url: "https://boards.greenhouse.io/anthropic/jobs/9",
                location: { name: "San Francisco" },
              },
            ],
          }),
        };
      },
    );
    expect(listings).toHaveLength(1);
    expect(listings[0]?.title).toBe("Research Engineer");
    expect(listings[0]?.board).toBe("greenhouse");
  });

  it("falls back to HTML job anchors on a custom careers page", async () => {
    const listings = await listingsFromJobsUrl(
      "https://cursor.com/careers",
      async (url) => {
        if (url === "https://cursor.com/careers") {
          return {
            ok: true,
            status: 200,
            contentType: "text/html",
            text: `<a href="/careers/staff-engineer">Staff Engineer</a>`,
          };
        }
        return {
          ok: true,
          status: 200,
          contentType: "text/html",
          text: `<h1>Staff Engineer</h1><article><p>Build the editor.</p></article>`,
        };
      },
    );
    expect(listings[0]?.title).toBe("Staff Engineer");
    expect(listings[0]?.sourceUrl).toBe("https://cursor.com/careers/staff-engineer");
    expect(listings[0]?.descriptionText).toContain("Build the editor");
  });

  it("returns nothing when the careers page is down", async () => {
    const listings = await listingsFromJobsUrl(
      "https://example.com/careers",
      async () => ({ ok: false, status: 403, text: "", contentType: "" }),
    );
    expect(listings).toEqual([]);
  });
});
