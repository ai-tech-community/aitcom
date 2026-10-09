import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as Drizzle from "drizzle-orm";
import type * as PinnedTransport from "@/server/net/pinned-transport";

const scanDb = vi.hoisted(() => {
  type Write = { set: Record<string, unknown>; where: unknown };
  const state: {
    roles: unknown[];
    updates: Write[];
    inserts: Array<Record<string, unknown>>;
  } = { roles: [], updates: [], inserts: [] };
  const db = {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(state.roles),
        orderBy: () => Promise.resolve([]),
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: (clause: unknown) => {
          state.updates.push({ set: values, where: clause });
          return Promise.resolve();
        },
      }),
    }),
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        state.inserts.push(values);
        return Promise.resolve();
      },
    }),
  };
  return { state, db };
});

vi.mock("@/server/db", () => ({ db: scanDb.db }));
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof Drizzle>();
  return {
    ...actual,
    inArray: (...args: Parameters<typeof actual.inArray>) => {
      const sql = actual.inArray(...args);
      Object.assign(sql, { __values: args[1] });
      return sql;
    },
    eq: (...args: Parameters<typeof actual.eq>) => {
      const sql = actual.eq(...args);
      Object.assign(sql, { __eq: args[1] });
      return sql;
    },
  };
});
// The default fetch goes through safeFetch; only the network call is stubbed,
// so the address checks (and BlockedAddressError) stay real.
vi.mock("@/server/agent/validate-webhook-url", () => ({
  validateWebhookUrl: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/server/net/pinned-transport", async (importOriginal) => ({
  ...(await importOriginal<typeof PinnedTransport>()),
  pinnedFetch: vi.fn(),
}));

import { pinnedFetch } from "@/server/net/pinned-transport";
import {
  defaultJobFetch,
  listingsFromJobsUrl,
  readJobsUrlListings,
  STARTUP_JOBS_HOLD_CLOSE_RATIO,
  STARTUP_JOBS_HOLD_MIN_CLOSES,
  scanStartupJobs,
  startupJobsScanTablePatch,
} from "@/server/startups/scan-jobs";
import { createStartupJobsFetchGate } from "@/server/startups/scan-jobs-schedule";
import type { startups } from "@/server/db/schema";
import {
  STARTUP_ROLE_ENRICH_CAP,
  STARTUP_ROLE_USER_AGENT,
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

  it("reads Ginmon cards from the jobs index and ignores the Offene Stellen CTA", async () => {
    const fixture = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "../../lib/investigations/fixtures/ginmon-careers-jobs.html",
      ),
      "utf8",
    );
    const fromIndex = await listingsFromJobsUrl(
      "https://www.ginmon.de/careers/jobs",
      async (url) => {
        if (url === "https://www.ginmon.de/careers/jobs") {
          return {
            ok: true,
            status: 200,
            contentType: "text/html",
            text: fixture,
          };
        }
        if (url.includes("initiativbewerbung-finanzen")) {
          return {
            ok: true,
            status: 200,
            contentType: "text/html",
            text: "<h1>Initiativbewerbung (m/w/d)</h1><article><p>Bewirb dich initiativ in Finanzen, IT, Fintech oder Asset Management und erzähl uns, wo du einsteigen willst.</p></article>",
          };
        }
        return { ok: false, status: 404, contentType: "text/html", text: "" };
      },
    );
    expect(fromIndex.map((row) => row.title)).toEqual([
      "Product Manager (m/w/d) – Wealth Management Platform Ginmon",
      "Product Manager (m/w/d) – Digital Wealth Management (apeiron)",
      "Business Development Representative (m/w/d)",
      "Werkstudent Finance & Controlling (m/w/d)",
      "Initiativbewerbung – Finanzen | IT | Fintech | Asset Management (m/w/d)",
      "Working Student Software Engineering (m/f/d)",
    ]);
    expect(fromIndex.map((row) => row.title)).not.toContain("Offene Stellen");

    const fromLanding = await listingsFromJobsUrl(
      "https://www.ginmon.de/careers",
      async (url) => {
        if (url === "https://www.ginmon.de/careers") {
          return {
            ok: true,
            status: 200,
            contentType: "text/html",
            text: `<h1>Werde Teil unseres Teams</h1><a href="./careers/jobs">Offene Stellen</a>`,
          };
        }
        if (url === "https://www.ginmon.de/careers/jobs") {
          return {
            ok: true,
            status: 200,
            contentType: "text/html",
            text: fixture,
          };
        }
        return { ok: false, status: 404, contentType: "text/html", text: "" };
      },
    );
    expect(fromLanding.map((row) => row.title)).toEqual(
      fromIndex.map((row) => row.title),
    );
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

  it("replaces a MORE button with the posting title when the h1 is the board name", async () => {
    const listings = await listingsFromJobsUrl(
      "https://corephotonics.com/careers",
      async (url) => {
        if (url === "https://corephotonics.com/careers") {
          return {
            ok: true,
            status: 200,
            contentType: "text/html",
            text: `<a href="/careers/camera-solution-software-and-algorithms-engineer/">MORE</a>`,
          };
        }
        return {
          ok: true,
          status: 200,
          contentType: "text/html",
          text: `<h1>CAREERS</h1><meta property="og:title" content="Camera Solution Engineer" /><article><p>Take part in the development of computer vision algorithms on mobile platforms for the camera team.</p></article>`,
        };
      },
    );
    expect(listings.map((row) => row.title)).toEqual([
      "Camera Solution Engineer",
    ]);
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
    expect(src).toContain("orderStartupJobsScanTargets");
    expect(src).toContain("createStartupJobsFetchGate");
    expect(src).toContain("mapUntilDeadline");
    expect(src).toContain("[startup-jobs-scan] summary");
    expect(src).toContain('status === "open"');
    expect(src).not.toMatch(/openrouter/i);
    expect(src).toContain("startupJobsScanTablePatch");
    expect(src).toContain("openRoleCount");
    expect(src).toContain("reconcileStartupOpenRoleCounts");
    expect(src).toContain("IS DISTINCT FROM");
    expect(src).toContain("readJobsUrlListings");
    expect(src).toContain(
      'accept: "text/html, application/json;q=0.9, */*;q=0.8"',
    );
    expect(src).toContain("extractInertiaJobBoard");
    expect(src).toContain("ripplingJobsIndexUrl");
    expect(src).toContain("ocrPostingPage");
    expect(src).toContain("STARTUP_ROLE_VISUAL_BACKUP");
    expect(src).toMatch(/if \(fetched\)/);
  });
});

describe("defaultJobFetch", () => {
  const pinned = vi.mocked(pinnedFetch);
  const globalFetch = vi.spyOn(globalThis, "fetch");

  beforeEach(() => {
    pinned.mockReset();
    globalFetch.mockReset();
    globalFetch.mockRejectedValue(new Error("global fetch must not be used"));
  });

  it("fetches through the pinned transport with its own identity", async () => {
    pinned.mockResolvedValue(
      new Response("<h1>Jobs</h1>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }) as never,
    );
    await expect(
      defaultJobFetch("https://careers.example/jobs"),
    ).resolves.toEqual({
      ok: true,
      status: 200,
      text: "<h1>Jobs</h1>",
      contentType: "text/html",
    });
    const [url, init] = pinned.mock.calls[0]!;
    expect(String(url)).toBe("https://careers.example/jobs");
    const headers = init!.headers as Record<string, string>;
    expect(headers["user-agent"]).toBe(STARTUP_ROLE_USER_AGENT);
    expect(headers.accept).toBe("text/html, application/json;q=0.9, */*;q=0.8");
    expect(init!.signal).toBeInstanceOf(AbortSignal);
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it("hands an error status back instead of failing the fetch", async () => {
    pinned.mockResolvedValue(new Response("gone", { status: 404 }) as never);
    await expect(
      defaultJobFetch("https://careers.example/old"),
    ).resolves.toMatchObject({ ok: false, status: 404, text: "gone" });
  });

  it("refuses a follow-up URL on an internal address without requesting it", async () => {
    pinned.mockImplementation(async (url) => {
      if (String(url).startsWith("https://boards-api.greenhouse.io/")) {
        return new Response(
          JSON.stringify({
            jobs: [
              {
                id: 1,
                title: "Platform Engineer",
                absolute_url: "https://10.0.0.1/jobs",
                location: { name: "Remote" },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ) as never;
      }
      throw new Error(`unexpected request to ${String(url)}`);
    });

    const listings = await listingsFromJobsUrl(
      "https://boards.greenhouse.io/acme",
    );

    // The board answered; its posting link points inside the network, so
    // the enrichment fetch is refused and the listing keeps its board data.
    expect(listings.map((l) => l.title)).toEqual(["Platform Engineer"]);
    const requested = pinned.mock.calls.map((c) => String(c[0]));
    expect(requested).toHaveLength(1);
    expect(requested[0]).toMatch(/^https:\/\/boards-api\.greenhouse\.io\//);
    expect(requested.some((u) => u.includes("10.0.0.1"))).toBe(false);
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it("refuses an internal literal directly", async () => {
    await expect(defaultJobFetch("https://10.0.0.1/jobs")).resolves.toEqual({
      ok: false,
      status: 0,
      text: "",
      contentType: "",
    });
    expect(pinned).not.toHaveBeenCalled();
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it("gives up on a body over the size cap", async () => {
    pinned.mockResolvedValue(
      new Response("x".repeat(5 * 1024 * 1024 + 1)) as never,
    );
    await expect(
      defaultJobFetch("https://careers.example/huge"),
    ).resolves.toMatchObject({ ok: false, status: 0 });
  });
});

const CAREERS_URL = "https://acme.example/careers";

function roleUrl(slug: string): string {
  return `${CAREERS_URL}/${slug}`;
}

function openRole(slug: string) {
  return {
    id: `role-${slug}`,
    startupId: "co-1",
    slug: `acme-${slug}`,
    title: slug,
    location: null,
    workType: null,
    sourceUrl: roleUrl(slug),
    applyUrl: roleUrl(slug),
    descriptionText: "Existing description for this role.",
    fetchedAt: new Date("2026-01-01T00:00:00.000Z"),
    postedAt: null,
    board: "html" as const,
    externalId: null,
    status: "open" as const,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: null,
  };
}

function careersHtml(slugs: readonly string[]): string {
  return slugs
    .map((slug) => `<a href="/careers/${slug}">${slug} engineer</a>`)
    .join("\n");
}

function page(text: string, ok = true) {
  return {
    ok,
    status: ok ? 200 : 503,
    contentType: "text/html",
    text,
  };
}

const startup = {
  id: "co-1",
  slug: "acme",
  jobsUrl: CAREERS_URL,
} as typeof startups.$inferSelect;

function closedIds(): string[] {
  const closed = scanDb.state.updates.filter(
    (update) => update.set.status === "closed",
  );
  return closed.flatMap((update) => {
    const values = (update.where as { __values?: string[] } | undefined)
      ?.__values;
    return values ?? [];
  });
}

function roleWriteId(
  update: { where: unknown } | undefined,
): string | undefined {
  const id = (update?.where as { __eq?: unknown } | undefined)?.__eq;
  return typeof id === "string" && id.startsWith("role-") ? id : undefined;
}

describe("startup jobs scan hold", () => {
  beforeEach(() => {
    scanDb.state.roles = [];
    scanDb.state.updates = [];
    scanDb.state.inserts = [];
  });

  async function scanHtml(slugs: readonly string[]) {
    return scanStartupJobs(startup, async (url) => {
      if (url === CAREERS_URL) return page(careersHtml(slugs));
      return page(
        "<h1>Role</h1><article><p>Ship the product with the team.</p></article>",
      );
    });
  }

  it("holds a non-ATS page that parses to nothing while roles are open", async () => {
    scanDb.state.roles = [openRole("staff-engineer")];
    const result = await scanHtml([]);
    expect(result.outcome).toBe("held");
    expect(result.closed).toBe(0);
    expect(scanDb.state.updates).toEqual([]);
    expect(scanDb.state.inserts).toEqual([]);
  });

  it("holds a non-ATS page that would close at least 80% of open roles", async () => {
    const kept = ["staff-engineer", "product-designer"];
    const removed = Array.from({ length: 8 }, (_, index) => `role-${index}`);
    scanDb.state.roles = [...kept, ...removed].map((slug) => openRole(slug));
    const result = await scanHtml(kept);
    expect(result.outcome).toBe("held");
    expect(result.closed).toBe(0);
    expect(scanDb.state.updates).toEqual([]);
    expect(scanDb.state.inserts).toEqual([]);
  });

  it("names the hold threshold and still closes a diff under it", async () => {
    expect(STARTUP_JOBS_HOLD_CLOSE_RATIO).toBe(0.8);
    expect(STARTUP_JOBS_HOLD_MIN_CLOSES).toBe(5);
    const kept = ["staff-engineer", "product-designer", "data-scientist"];
    const removed = Array.from({ length: 7 }, (_, index) => `extra-${index}`);
    scanDb.state.roles = [...kept, ...removed].map((slug) => openRole(slug));
    const result = await scanHtml(kept);
    expect(result.outcome).toBe("applied");
    expect(result.closed).toBe(7);
    expect(closedIds()).toHaveLength(7);
  });

  it("still closes one removed role on a normal diff", async () => {
    const kept = ["staff-engineer", "product-designer", "data-scientist"];
    scanDb.state.roles = [...kept, "office-manager"].map((slug) =>
      openRole(slug),
    );
    const result = await scanHtml(kept);
    expect(result.outcome).toBe("applied");
    expect(result.closed).toBe(1);
    expect(result.opened).toBe(0);
    expect(closedIds()).toEqual(["role-office-manager"]);
    const startupUpdate = scanDb.state.updates.find(
      (update) => "jobsScannedAt" in update.set,
    );
    expect(startupUpdate?.set.jobsEmptyStreak).toBe(0);
    expect(startupUpdate?.set.jobsFailStreak).toBe(0);
  });

  it("still closes a smaller genuine ATS board", async () => {
    scanDb.state.roles = ["one", "two", "three"].map((slug) => openRole(slug));
    const result = await scanStartupJobs(
      { ...startup, jobsUrl: "https://boards.greenhouse.io/acme" },
      async () => ({
        ok: true,
        status: 200,
        contentType: "application/json",
        text: JSON.stringify({ jobs: [] }),
      }),
    );
    expect(result.outcome).toBe("applied");
    expect(result.closed).toBe(3);
    expect(closedIds().sort()).toEqual(["role-one", "role-three", "role-two"]);
  });

  it("follows Landeed's careers page into the YC company board", async () => {
    const fixture = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "../../lib/investigations/fixtures/landeed-yc-jobs.html",
      ),
      "utf8",
    );
    const ycBoard = "https://www.ycombinator.com/companies/landeed/jobs";
    const listings = await listingsFromJobsUrl(
      "https://www.landeed.com/careers",
      async (url) => {
        if (url === "https://www.landeed.com/careers") {
          return page(
            `<a href="${ycBoard}" target="_blank">See open roles</a>`,
          );
        }
        if (url === ycBoard) return page(fixture);
        return page("", false);
      },
    );
    expect(listings.map((row) => row.title)).toEqual([
      "People & Operations Associate (HR & Admin)",
      "Accountant",
      "Senior/Staff Engineer: Backend (India)",
    ]);
  });

  it("treats both Workable URL shapes as the same role", async () => {
    const legacy = "https://apply.workable.com/j/2E88E60742";
    const account = "https://apply.workable.com/writesonic/j/F057CDC530/";
    scanDb.state.roles = [
      {
        ...openRole("support"),
        id: "role-support",
        title: "Product Support Specialist",
        sourceUrl: legacy,
        applyUrl: legacy,
      },
      {
        ...openRole("frontend"),
        id: "role-frontend",
        title: "Frontend Engineer",
        sourceUrl: account,
        applyUrl: account,
      },
    ];
    const result = await scanStartupJobs(
      { ...startup, jobsUrl: "https://writesonic.com/careers" },
      async (url) => {
        if (url === "https://writesonic.com/careers") {
          return page(
            `<a href="https://apply.workable.com/writesonic/j/2E88E60742/">Product Support Specialist</a>
             <a href="https://apply.workable.com/j/F057CDC530">Frontend Engineer</a>`,
          );
        }
        return page("", false);
      },
    );
    expect(result.outcome).toBe("applied");
    expect(result.closed).toBe(0);
    expect(scanDb.state.inserts).toEqual([]);
    expect(closedIds()).toEqual([]);
    const roleUpdates = scanDb.state.updates.filter(
      (update) => update.set.title,
    );
    expect(roleUpdates.map((update) => update.set.sourceUrl).sort()).toEqual([
      "https://apply.workable.com/j/F057CDC530",
      "https://apply.workable.com/writesonic/j/2E88E60742/",
    ]);
  });

  it("does not close roles when the careers page fails to load", async () => {
    scanDb.state.roles = [openRole("staff-engineer")];
    const result = await scanStartupJobs(startup, async () => page("", false));
    expect(result.outcome).toBe("unfetched");
    expect(result.closed).toBe(0);
    expect(result.error).toBeTruthy();
    expect(closedIds()).toEqual([]);
    expect(
      scanDb.state.updates.some((update) => "openRoleCount" in update.set),
    ).toBe(false);
    const startupUpdate = scanDb.state.updates.find(
      (update) => "jobsScannedAt" in update.set,
    );
    expect(startupUpdate?.set.jobsFailStreak).toBe(1);
    expect(startupUpdate?.set.jobsEmptyStreak).toBe(0);
  });

  it("does not close roles or record a scan when a follow-up fetch hits the deadline", async () => {
    scanDb.state.roles = [openRole("staff-engineer"), openRole("designer")];
    let now = 0;
    const gate = createStartupJobsFetchGate({
      concurrency: 4,
      hostLimit: 2,
      deadlineAt: 1_000,
      marginMs: 200,
      now: () => now,
      fetchPage: async (url) => {
        if (url === CAREERS_URL) {
          now = 800;
          return page(
            `<a href="https://boards.greenhouse.io/acme">Staff engineer</a>`,
          );
        }
        throw new Error(`follow-up fetch should not run: ${url}`);
      },
    });
    const result = await scanStartupJobs(startup, gate);
    expect(result.outcome).toBe("deferred");
    expect(result.closed).toBe(0);
    expect(result.opened).toBe(0);
    expect(scanDb.state.updates).toEqual([]);
    expect(scanDb.state.inserts).toEqual([]);
  });

  it("does not record a scan when the first fetch is already past the deadline", async () => {
    scanDb.state.roles = [openRole("staff-engineer")];
    const gate = createStartupJobsFetchGate({
      concurrency: 2,
      hostLimit: 2,
      deadlineAt: 1_000,
      marginMs: 200,
      now: () => 800,
      fetchPage: async () => {
        throw new Error("no request should start");
      },
    });
    const result = await scanStartupJobs(startup, gate);
    expect(result.outcome).toBe("deferred");
    expect(result.closed).toBe(0);
    expect(scanDb.state.updates).toEqual([]);
    expect(scanDb.state.inserts).toEqual([]);
  });

  function startupOpenCount(): number | undefined {
    const update = [...scanDb.state.updates]
      .reverse()
      .find((entry) => "openRoleCount" in entry.set);
    return update?.set.openRoleCount as number | undefined;
  }

  it("closes filter-rejected titles when the page parses to nothing", async () => {
    scanDb.state.roles = ["a", "b", "c", "d", "e", "f"].map((slug) => ({
      ...openRole(slug),
      title: "View Job",
    }));
    const result = await scanStartupJobs(startup, async () =>
      page("<p>Careers</p>"),
    );
    expect(result.outcome).toBe("applied");
    expect(result.closed).toBe(6);
    expect(closedIds()).toHaveLength(6);
    expect(startupOpenCount()).toBe(0);
  });

  it("closes filter-rejected titles during a hold and keeps live roles", async () => {
    const live = [
      "staff-engineer",
      "product-designer",
      "data-scientist",
      "account-executive",
      "recruiter",
      "analyst",
    ];
    scanDb.state.roles = [
      ...live.map((slug) => openRole(slug)),
      { ...openRole("junk-a"), title: "View Job" },
      { ...openRole("junk-b"), title: "Details" },
    ];
    const result = await scanHtml(["staff-engineer"]);
    expect(result.outcome).toBe("held");
    expect(result.closed).toBe(2);
    expect(closedIds().sort()).toEqual(["role-junk-a", "role-junk-b"]);
    expect(startupOpenCount()).toBe(6);
    expect(
      scanDb.state.updates.some((update) => "jobsScannedAt" in update.set),
    ).toBe(false);
  });

  it("replaces a View Job row with the posting title instead of holding it", async () => {
    const source = "https://www.avayl.tech/jobs/commercial-growth-manager";
    scanDb.state.roles = [
      {
        ...openRole("commercial"),
        title: "View Job",
        sourceUrl: source,
        applyUrl: source,
      },
    ];
    const result = await scanStartupJobs(
      { ...startup, jobsUrl: "https://www.avayl.tech/career" },
      async (url) => {
        if (url === "https://www.avayl.tech/career") {
          return page(`<a href="/jobs/commercial-growth-manager">View Job</a>`);
        }
        return page(
          `<h1>Commercial Growth Manager</h1><article><p>Ship the commercial growth plan with the field team across Berlin and the EU partners every quarter.</p></article>`,
        );
      },
    );
    expect(result.outcome).toBe("applied");
    expect(result.closed).toBe(0);
    expect(scanDb.state.inserts).toEqual([]);
    const roleUpdate = scanDb.state.updates.find((update) => update.set.title);
    expect(roleUpdate?.set.title).toBe("Commercial Growth Manager");
    expect(roleUpdate?.set.sourceUrl).toBe(source);
    expect(startupOpenCount()).toBe(1);
  });

  it("merges a legacy Workable URL and closes the duplicate row", async () => {
    const current = "https://apply.workable.com/j/F7E014216A";
    const legacy = "https://apply.workable.com/writesonic/j/F7E014216A/";
    const junk = "https://apply.workable.com/writesonic/j/92488277FE/";
    const lead = "https://apply.workable.com/j/92488277FE";
    scanDb.state.roles = [
      {
        ...openRole("pm"),
        id: "role-pm",
        title: "AI Product Manager",
        sourceUrl: current,
        applyUrl: current,
        board: "workable",
        externalId: "F7E014216A",
      },
      {
        ...openRole("pm-old"),
        id: "role-pm-old",
        title: "AI Product Manager",
        sourceUrl: legacy,
        applyUrl: legacy,
        board: "html",
        externalId: null,
      },
      {
        ...openRole("junk"),
        id: "role-junk",
        title: "United States · India ·",
        sourceUrl: junk,
        applyUrl: junk,
        board: "html",
        externalId: null,
      },
    ];
    const result = await scanStartupJobs(
      { ...startup, jobsUrl: "https://writesonic.com/careers" },
      async (url) => {
        if (url === "https://writesonic.com/careers") {
          return page(
            `<a href="${current}">AI Product Manager</a>
             <a href="${lead}">Agency Partnerships Lead</a>`,
          );
        }
        return page("", false);
      },
    );
    expect(result.outcome).toBe("applied");
    expect(result.closed).toBe(1);
    expect(closedIds()).toEqual(["role-pm-old"]);
    expect(scanDb.state.inserts).toEqual([]);
    const titles = scanDb.state.updates
      .filter((update) => update.set.title)
      .map((update) => update.set.title);
    expect(titles).toContain("Agency Partnerships Lead");
    expect(startupOpenCount()).toBe(2);
  });

  it("counts one open role when the Workable widget repeats a shortcode", async () => {
    const source = "https://apply.workable.com/j/0FD18F627F";
    scanDb.state.roles = [
      {
        ...openRole("install"),
        id: "role-install",
        title: "Installation Technician",
        sourceUrl: source,
        applyUrl: source,
        board: "workable",
        externalId: "0FD18F627F",
      },
      openRole("office-manager"),
    ];
    const result = await scanStartupJobs(
      {
        ...startup,
        jobsUrl: "https://apply.workable.com/sorting-robotics",
      },
      async () => ({
        ok: true,
        status: 200,
        contentType: "application/json",
        text: JSON.stringify({
          jobs: [
            {
              title: "Installation Technician",
              shortcode: "0FD18F627F",
              url: source,
            },
            {
              title: "Installation Technician",
              shortcode: "0FD18F627F",
              url: source,
            },
          ],
        }),
      }),
    );
    expect(result.outcome).toBe("applied");
    expect(result.closed).toBe(1);
    expect(closedIds()).toEqual(["role-office-manager"]);
    expect(scanDb.state.inserts).toEqual([]);
    expect(startupOpenCount()).toBe(1);
  });

  it("updates a row whose URL differs by www, a slash, or tracking params", async () => {
    const stored =
      "https://www.comeet.com/jobs/lumus/62.00F/quality-engineer/7B.D67/?coref=1&amp;1788436470111";
    scanDb.state.roles = [
      {
        ...openRole("quality"),
        id: "role-quality",
        title: "View Job",
        sourceUrl: stored,
        applyUrl: stored,
      },
    ];
    const result = await scanStartupJobs(
      { ...startup, jobsUrl: "https://lumus.com/careers" },
      async (url) => {
        if (url === "https://lumus.com/careers") {
          return page(
            `<a href="https://comeet.com/jobs/lumus/62.00F/quality-engineer/7B.D67">Quality Engineer</a>`,
          );
        }
        return page("", false);
      },
    );
    expect(result.outcome).toBe("applied");
    expect(result.closed).toBe(0);
    expect(scanDb.state.inserts).toEqual([]);
    const roleUpdate = scanDb.state.updates.find((update) => update.set.title);
    expect(roleUpdate?.set.title).toBe("Quality Engineer");
    expect(startupOpenCount()).toBe(1);
  });

  it("updates the row that already owns the listing URL", async () => {
    const listingUrl = "https://acme.example/careers/quality-engineer";
    const variant = "https://www.acme.example/careers/quality-engineer/";
    scanDb.state.roles = [
      {
        ...openRole("quality-owner"),
        id: "role-owner",
        status: "closed",
        title: "Old title",
        sourceUrl: listingUrl,
        applyUrl: listingUrl,
      },
      {
        ...openRole("quality-variant"),
        id: "role-variant",
        title: "View Job",
        sourceUrl: variant,
        applyUrl: variant,
      },
    ];
    const result = await scanStartupJobs(startup, async (url) => {
      if (url === CAREERS_URL) {
        return page(`<a href="${listingUrl}">Quality Engineer</a>`);
      }
      return page("", false);
    });
    expect(result.outcome).toBe("applied");
    expect(result.closed).toBe(1);
    expect(closedIds()).toEqual(["role-variant"]);
    expect(scanDb.state.inserts).toEqual([]);
    const titleUpdate = scanDb.state.updates.find((update) => update.set.title);
    expect(roleWriteId(titleUpdate)).toBe("role-owner");
    expect(titleUpdate?.set.sourceUrl).toBe(listingUrl);
    expect(
      scanDb.state.updates.some((update) => update.set.sourceUrl === variant),
    ).toBe(false);
    expect(startupOpenCount()).toBe(1);
  });

  it("closes a junk duplicate during a hold and keeps the other live roles", async () => {
    const current = "https://apply.workable.com/j/F7E014216A";
    const legacy = "https://apply.workable.com/writesonic/j/F7E014216A/";
    const live = [
      "product-designer",
      "data-scientist",
      "account-executive",
      "recruiter",
      "analyst",
    ];
    scanDb.state.roles = [
      {
        ...openRole("pm"),
        id: "role-pm",
        title: "AI Product Manager",
        sourceUrl: current,
        applyUrl: current,
        board: "workable" as const,
        externalId: "F7E014216A",
      },
      {
        ...openRole("pm-old"),
        id: "role-pm-old",
        title: "View Job",
        sourceUrl: legacy,
        applyUrl: legacy,
        board: "html" as const,
        externalId: null,
      },
      ...live.map((slug) => openRole(slug)),
    ];
    const result = await scanStartupJobs(startup, async (url) => {
      if (url === CAREERS_URL) {
        return page(`<a href="${current}">AI Product Manager</a>`);
      }
      return page("", false);
    });
    expect(result.outcome).toBe("held");
    expect(result.closed).toBe(1);
    expect(closedIds()).toEqual(["role-pm-old"]);
    expect(startupOpenCount()).toBe(6);
    expect(
      scanDb.state.updates.some((update) => "jobsScannedAt" in update.set),
    ).toBe(false);
    expect(scanDb.state.inserts).toEqual([]);
  });

  it("does not close a live duplicate when the canonical row stays closed", async () => {
    const current = "https://apply.workable.com/j/F7E014216A";
    const legacy = "https://apply.workable.com/writesonic/j/F7E014216A/";
    const live = [
      "product-designer",
      "data-scientist",
      "account-executive",
      "recruiter",
      "analyst",
    ];
    scanDb.state.roles = [
      {
        ...openRole("pm-canonical"),
        id: "role-canonical",
        status: "closed",
        title: "AI Product Manager",
        sourceUrl: current,
        applyUrl: current,
        board: "workable" as const,
        externalId: "F7E014216A",
      },
      {
        ...openRole("pm-live"),
        id: "role-live",
        title: "AI Product Manager",
        sourceUrl: legacy,
        applyUrl: legacy,
        board: "html" as const,
        externalId: null,
      },
      ...live.map((slug) => openRole(slug)),
    ];
    const result = await scanStartupJobs(startup, async (url) => {
      if (url === CAREERS_URL) {
        return page(`<a href="${current}">AI Product Manager</a>`);
      }
      return page("", false);
    });
    expect(result.outcome).toBe("held");
    expect(result.closed).toBe(0);
    expect(closedIds()).toEqual([]);
    expect(scanDb.state.updates).toEqual([]);
    expect(scanDb.state.inserts).toEqual([]);
  });
});
