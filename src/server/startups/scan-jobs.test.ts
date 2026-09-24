import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/db", () => ({ db: { __fake: true } }));

import {
  listingsFromJobsUrl,
  readJobsUrlListings,
  startupJobsScanTablePatch,
} from "@/server/startups/scan-jobs";
import {
  STARTUP_ROLE_ENRICH_CAP,
  STARTUP_ROLES_PER_COMPANY_CAP,
} from "@/lib/investigations/startup-roles";

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "scan-jobs.ts"),
  "utf8",
);

describe("listingsFromJobsUrl", () => {
  it("uses Greenhouse JSON when the careers URL is a board", async () => {
    const listings = await listingsFromJobsUrl(
      "https://boards.greenhouse.io/anthropic",
      async (url) => {
        if (url.includes("boards-api.greenhouse.io")) {
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
        }
        return {
          ok: true,
          status: 200,
          contentType: "text/html",
          text: `<h1>Research Engineer</h1><article><p>Ship models in San Francisco.</p></article>`,
        };
      },
    );
    expect(listings).toHaveLength(1);
    expect(listings[0]?.title).toBe("Research Engineer");
    expect(listings[0]?.board).toBe("greenhouse");
    expect(listings[0]?.descriptionText).toContain("Ship models");
  });

  it("fills missing ATS descriptions from the original posting page", async () => {
    const fetched: string[] = [];
    const listings = await listingsFromJobsUrl(
      "https://jobs.lever.co/figure",
      async (url) => {
        fetched.push(url);
        if (url.includes("api.lever.co")) {
          return {
            ok: true,
            status: 200,
            contentType: "application/json",
            text: JSON.stringify([
              {
                id: "z",
                text: "Hardware intern",
                hostedUrl: "https://jobs.lever.co/figure/z",
                categories: { location: "Sunnyvale" },
              },
            ]),
          };
        }
        return {
          ok: true,
          status: 200,
          contentType: "text/html",
          text: `<h1>Hardware intern</h1><article><p>Build the robot arms.</p></article>`,
        };
      },
    );
    expect(fetched.some((url) => url.includes("api.lever.co"))).toBe(true);
    expect(fetched).toContain("https://jobs.lever.co/figure/z");
    expect(listings[0]?.descriptionText).toContain("Build the robot arms");
    expect(listings[0]?.descriptionText).not.toMatch(/salary|fit score/i);
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
    expect(listings[0]?.sourceUrl).toBe(
      "https://cursor.com/careers/staff-engineer",
    );
    expect(listings[0]?.descriptionText).toContain("Build the editor");
  });

  it("reads every HTML listing posting, not only the first eight", async () => {
    const listings = await listingsFromJobsUrl(
      "https://example.com/careers",
      async (url) => {
        if (url === "https://example.com/careers") {
          const anchors = Array.from(
            { length: 10 },
            (_, index) =>
              `<a href="/jobs/role-${index + 1}">Role ${index + 1}</a>`,
          ).join("");
          return {
            ok: true,
            status: 200,
            contentType: "text/html",
            text: anchors,
          };
        }
        const n = url.split("role-")[1];
        return {
          ok: true,
          status: 200,
          contentType: "text/html",
          text: `<h1>Role ${n}</h1><article><p>Sourced JD for role ${n}.</p></article>`,
        };
      },
    );
    expect(listings).toHaveLength(10);
    expect(
      listings.every((row) => row.descriptionText?.includes("Sourced JD")),
    ).toBe(true);
    expect(listings.at(-1)?.title).toBe("Role 10");
  });

  it("follows a careers-index CTA into the ATS board", async () => {
    const fetched: string[] = [];
    const listings = await listingsFromJobsUrl(
      "https://www.anthropic.com/careers",
      async (url) => {
        fetched.push(url);
        if (url.includes("boards-api.greenhouse.io")) {
          return {
            ok: true,
            status: 200,
            contentType: "application/json",
            text: JSON.stringify({
              jobs: [
                {
                  id: 9,
                  title: "Research Engineer",
                  absolute_url:
                    "https://job-boards.greenhouse.io/anthropic/jobs/9",
                  location: { name: "San Francisco" },
                  content: "&lt;p&gt;Ship models.&lt;/p&gt;",
                },
              ],
            }),
          };
        }
        if (url.includes("/careers/jobs")) {
          return {
            ok: true,
            status: 200,
            contentType: "text/html",
            text: `<a href="https://job-boards.greenhouse.io/anthropic/jobs/9">Research Engineer</a>`,
          };
        }
        return {
          ok: true,
          status: 200,
          contentType: "text/html",
          text: `<a href="/careers/jobs">Explore open roles</a>`,
        };
      },
    );
    expect(fetched.some((url) => url.endsWith("/careers/jobs"))).toBe(true);
    expect(
      fetched.some((url) => url.includes("boards-api.greenhouse.io")),
    ).toBe(true);
    expect(listings).toHaveLength(1);
    expect(listings[0]?.title).toBe("Research Engineer");
    expect(listings[0]?.board).toBe("greenhouse");
    expect(listings[0]?.descriptionText).toContain("Ship models");
    expect(listings[0]?.descriptionText).not.toMatch(/<p>/i);
  });

  it("does not invent a JD when the posting page has no sourced text", async () => {
    const listings = await listingsFromJobsUrl(
      "https://example.com/careers",
      async (url) => {
        if (url.endsWith("/careers")) {
          return {
            ok: true,
            status: 200,
            contentType: "text/html",
            text: `<a href="/jobs/empty-role">Empty Role</a>`,
          };
        }
        return {
          ok: true,
          status: 200,
          contentType: "text/html",
          text: `<h1>Empty Role</h1>`,
        };
      },
    );
    expect(listings[0]?.title).toBe("Empty Role");
    expect(listings[0]?.descriptionText).toBeNull();
  });

  it("replaces an apply-button title with the posting page title and JD", async () => {
    const listings = await listingsFromJobsUrl(
      "https://example.com/careers",
      async (url) => {
        if (url.endsWith("/careers")) {
          return {
            ok: true,
            status: 200,
            contentType: "text/html",
            text: `<a href="/jobs/HIfysXu-clinical-data-lead">[View Position &amp; Apply →]</a>`,
          };
        }
        return {
          ok: true,
          status: 200,
          contentType: "text/html",
          text: `<h1>Clinical Data Lead</h1><article><p>Source clinical datasets.</p></article>`,
        };
      },
    );
    expect(listings).toHaveLength(1);
    expect(listings[0]?.title).toBe("Clinical Data Lead");
    expect(listings[0]?.descriptionText).toContain("Source clinical datasets");
    expect(listings[0]?.title).not.toMatch(/view position/i);
  });

  it("reads YC embedded roles and fills the JD from the posting page", async () => {
    const listings = await listingsFromJobsUrl(
      "https://www.ycombinator.com/companies/biostack-platforms/jobs",
      async (url) => {
        if (url.endsWith("/jobs")) {
          return {
            ok: true,
            status: 200,
            contentType: "text/html",
            text: `<a href="/companies/biostack-platforms/jobs/HIfysXu-clinical-data-lead">[View Position &amp; Apply →]</a>
&quot;title&quot;:&quot;Clinical Data Lead&quot;,&quot;url&quot;:&quot;/companies/biostack-platforms/jobs/HIfysXu-clinical-data-lead&quot;,&quot;location&quot;:&quot;San Francisco, CA, US&quot;,&quot;type&quot;:&quot;Full-time&quot;`,
          };
        }
        return {
          ok: true,
          status: 200,
          contentType: "text/html",
          text: `<script type="application/ld+json">{"@type":"JobPosting","title":"Clinical Data Lead","description":"<h2>About BioStack</h2><p>Source clinical datasets.</p>","url":"${url}"}</script>`,
        };
      },
    );
    expect(listings.map((row) => row.title)).toEqual(["Clinical Data Lead"]);
    expect(listings[0]?.location).toBe("San Francisco, CA, US");
    expect(listings[0]?.descriptionText).toContain("Source clinical datasets");
    expect(listings[0]?.descriptionText).toContain("About BioStack");
  });

  it("treats an empty ATS board as no jobs without scraping listing HTML", async () => {
    const fetched: string[] = [];
    const listings = await listingsFromJobsUrl(
      "https://boards.greenhouse.io/quietco",
      async (url) => {
        fetched.push(url);
        if (url.includes("boards-api.greenhouse.io")) {
          return {
            ok: true,
            status: 200,
            contentType: "application/json",
            text: JSON.stringify({ jobs: [] }),
          };
        }
        return {
          ok: true,
          status: 200,
          contentType: "text/html",
          text: `<a href="/jobs/ghost">Ghost Role</a>`,
        };
      },
    );
    expect(listings).toEqual([]);
    expect(fetched.some((url) => url.includes("/jobs/ghost"))).toBe(false);
  });

  it("returns nothing when the careers page is down", async () => {
    const listings = await listingsFromJobsUrl(
      "https://example.com/careers",
      async () => ({ ok: false, status: 403, text: "", contentType: "" }),
    );
    expect(listings).toEqual([]);
  });
});

describe("readJobsUrlListings", () => {
  it("marks a live empty board as fetched with no listings", async () => {
    const result = await readJobsUrlListings(
      "https://boards.greenhouse.io/quietco",
      async () => ({
        ok: true,
        status: 200,
        contentType: "application/json",
        text: JSON.stringify({ jobs: [] }),
      }),
    );
    expect(result.fetched).toBe(true);
    expect(result.listings).toEqual([]);
  });

  it("does not treat a down careers page as an empty board", async () => {
    const result = await readJobsUrlListings(
      "https://example.com/careers",
      async () => ({ ok: false, status: 403, text: "", contentType: "" }),
    );
    expect(result.fetched).toBe(false);
    expect(result.listings).toEqual([]);
  });

  it("treats an empty YC company board as empty and does not open the site directory", async () => {
    const calls: string[] = [];
    const result = await readJobsUrlListings(
      "https://www.ycombinator.com/companies/bite-ninja/jobs",
      async (url) => {
        calls.push(url);
        return {
          ok: true,
          status: 200,
          contentType: "text/html",
          text: `<div data-page="{&quot;props&quot;:{&quot;jobPostings&quot;:[]}}"></div><a href="/jobs">Jobs</a><a href="/jobs/location/india">Jobs in India</a>`,
        };
      },
    );
    expect(result.fetched).toBe(true);
    expect(result.listings).toEqual([]);
    expect(calls).toEqual([
      "https://www.ycombinator.com/companies/bite-ninja/jobs",
    ]);
  });

  it("follows a Rippling board linked from the company careers page", async () => {
    const result = await readJobsUrlListings(
      "https://www.aalo.com/careers",
      async (url) => {
        if (url === "https://www.aalo.com/careers") {
          return {
            ok: true,
            status: 200,
            contentType: "text/html",
            text: `<a href="https://ats.rippling.com/aalo-atomics/jobs">Careers</a>
              <a href="https://www.aalo.com/aalo-atomics/jobs/dead">AI Platform Architect</a>`,
          };
        }
        return {
          ok: true,
          status: 200,
          contentType: "text/html",
          text: `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(
            {
              props: {
                pageProps: {
                  dehydratedState: {
                    queries: [
                      {
                        queryKey: ["board", "aalo-atomics", "job-posts"],
                        state: {
                          data: {
                            items: [
                              {
                                id: "8d4783fb",
                                name: "AI Platform Architect",
                                url: "https://ats.rippling.com/aalo-atomics/jobs/8d4783fb",
                                locations: [{ name: "Austin, TX" }],
                              },
                            ],
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
          )}</script>`,
        };
      },
    );
    expect(result.fetched).toBe(true);
    expect(result.listings.map((row) => row.title)).toEqual([
      "AI Platform Architect",
    ]);
    expect(result.listings[0]?.sourceUrl).toBe(
      "https://ats.rippling.com/aalo-atomics/jobs/8d4783fb",
    );
  });
});

describe("startupJobsScanTablePatch", () => {
  const scannedAt = new Date("2026-09-21T12:00:00.000Z");

  it("writes zero open roles onto the startup row when a live board has no jobs", () => {
    expect(
      startupJobsScanTablePatch({
        fetched: true,
        published: 0,
        scannedAt,
      }),
    ).toEqual({ jobsScannedAt: scannedAt, openRoleCount: 0 });
  });

  it("stores the sourced open count after a successful scan", () => {
    expect(
      startupJobsScanTablePatch({
        fetched: true,
        published: 3,
        scannedAt,
      }).openRoleCount,
    ).toBe(3);
  });

  it("does not clear open roles on the startup row when the careers page failed", () => {
    const patch = startupJobsScanTablePatch({
      fetched: false,
      published: 0,
      scannedAt,
    });
    expect(patch).toEqual({ jobsScannedAt: scannedAt });
    expect(patch).not.toHaveProperty("openRoleCount");
  });
});

describe("startup jobs scan locks", () => {
  it("enriches every capped listing and scans all jobsUrl companies in the cron budget", () => {
    expect(STARTUP_ROLE_ENRICH_CAP).toBe(STARTUP_ROLES_PER_COMPANY_CAP);
    expect(src).not.toMatch(/index < STARTUP_ROLE_ENRICH_CAP/);
    expect(src).toContain("enrichListing");
    expect(src).toContain("STARTUP_JOBS_SCAN_BUDGET_MS");
    expect(src).not.toMatch(/const SCAN_BATCH = 25/);
    expect(src).not.toMatch(/\.slice\(0, limit\)/);
    expect(src).toContain("presentText(row.jobsUrl)");
    expect(src).toContain("${startups.jobsScannedAt} ASC NULLS FIRST");
    expect(src).toContain('status === "open"');
    expect(src).not.toMatch(/openrouter/i);
    expect(src).toContain("startupJobsScanTablePatch");
    expect(src).toContain("openRoleCount");
    expect(src).toContain("readJobsUrlListings");
    expect(src).toContain(
      'Accept: "text/html, application/json;q=0.9, */*;q=0.8"',
    );
    expect(src).toContain("extractInertiaJobBoard");
    expect(src).toContain("ripplingJobsIndexUrl");
    expect(src).toContain("ocrPostingPage");
    expect(src).toContain("STARTUP_ROLE_VISUAL_BACKUP");
    expect(src).toMatch(/if \(fetched\)/);
  });
});
