import { describe, expect, it } from "vitest";

import { buildStartupJobsPath } from "./startups";
import {
  STARTUP_JOBS_DEFAULT_SORT,
  STARTUP_JOBS_REMOTE,
  applyStartupJobsQuery,
  startupJobsFacets,
  startupWorkTypeOf,
  parseStartupJobsQuery,
  parseStartupRoleTitle,
  rolesListedSince,
  sanitizeStartupRoleDescription,
  startupJobsFollowFromQuery,
  startupRoleJsonLd,
  startupJobsSortForSearch,
  type StartupRolePublic,
} from "./startup-roles";
import {
  defaultStartupJobsSort,
  startupRoleSearchPlan,
  startupRoleSearchTerms,
} from "./startup-jobs-search";

function sampleRole(
  overrides: Partial<StartupRolePublic> = {},
): StartupRolePublic {
  return {
    id: "1",
    startupId: "a",
    startupSlug: "cursor-anysphere",
    startupName: "Cursor",
    startupLogoUrl: null,
    slug: "cursor-anysphere-staff",
    title: "Staff Engineer",
    location: null,
    workType: null,
    sourceUrl: "https://cursor.com/careers/staff",
    applyUrl: null,
    descriptionText: null,
    fetchedAt: "2026-09-20T00:00:00.000Z",
    board: "html",
    status: "open",
    ...overrides,
  };
}

describe("parseStartupRoleTitle", () => {
  it("keeps the role name when work type, location, and CTA sit on nearby lines", () => {
    expect(
      parseStartupRoleTitle(
        "*Construction Account Executive / Senior Account Executive – Canada\nFull-time\nCanada\nRead more",
      ),
    ).toBe(
      "Construction Account Executive / Senior Account Executive – Canada",
    );
    expect(
      parseStartupRoleTitle(
        "BIM Specialist – Major Projects\nFull-time\nTel-Aviv\nRead more",
      ),
    ).toBe("BIM Specialist – Major Projects");
    expect(
      parseStartupRoleTitle("Enterprise BDR – Chicago Full-time Read more"),
    ).toBe("Enterprise BDR – Chicago");
  });

  it("prefers the role line over a short department label when location trails", () => {
    expect(
      parseStartupRoleTitle(
        "Customer Success\nReliability Success Manager\nUnited States (Remote)",
      ),
    ).toBe("Reliability Success Manager");
  });
});

describe("sanitizeStartupRoleDescription", () => {
  it("drops OCR and CTA junk from the start of a posting body", () => {
    expect(
      sanitizeStartupRoleDescription(
        "kevAbout Buildots\nBuildots is the world’s most advanced construction intelligence platform.",
      ),
    ).toBe(
      "About Buildots\nBuildots is the world’s most advanced construction intelligence platform.",
    );
    expect(
      sanitizeStartupRoleDescription(
        "Read more\nAbout the role\nShip the product.",
      ),
    ).toBe("About the role\nShip the product.");
  });
});

describe("startupRoleJsonLd", () => {
  it("emits an ISO datePosted from a real ATS post date", () => {
    const data = startupRoleJsonLd(
      sampleRole({ postedAt: "2026-03-01T12:00:00.000Z" }),
    );
    expect(data?.["@type"]).toBe("JobPosting");
    expect(data?.datePosted).toBe("2026-03-01");
    expect(data?.datePosted).not.toBe("2026-09-20");
    expect(
      startupRoleJsonLd(sampleRole({ postedAt: "2026-03-01" }))?.datePosted,
    ).toBe("2026-03-01");
  });

  it("soft-omits the JobPosting block when no real post date exists", () => {
    expect(startupRoleJsonLd(sampleRole())).toBeNull();
    expect(
      startupRoleJsonLd(
        sampleRole({
          postedAt: "not-a-date",
          listedAt: "2026-03-01T00:00:00.000Z",
          location: "Toronto, Canada",
        }),
      ),
    ).toBeNull();
    expect(
      JSON.stringify(
        startupRoleJsonLd(sampleRole({ listedAt: "2026-09-21T00:00:00.000Z" })),
      ),
    ).not.toContain("2026-09-20");
  });

  it("emits PostalAddress parts from a sourced place string and invents nothing else", () => {
    const data = startupRoleJsonLd(
      sampleRole({
        postedAt: "2026-03-01T15:00:00.000Z",
        location: "San Francisco, CA | Seattle, WA",
        workType: "Full-time",
        listedAt: "2026-09-21T00:00:00.000Z",
      }),
    );
    expect(data?.jobLocation).toEqual([
      {
        "@type": "Place",
        address: {
          "@type": "PostalAddress",
          addressLocality: "San Francisco",
          addressRegion: "CA",
        },
      },
      {
        "@type": "Place",
        address: {
          "@type": "PostalAddress",
          addressLocality: "Seattle",
          addressRegion: "WA",
        },
      },
    ]);
    const toronto = startupRoleJsonLd(
      sampleRole({
        postedAt: "2026-03-01",
        location: "Toronto, Canada",
      }),
    );
    expect(toronto?.jobLocation).toEqual({
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Toronto",
        addressCountry: "Canada",
      },
    });
    const sourced = startupRoleJsonLd(
      sampleRole({
        postedAt: "2026-04-02",
        location: "San Francisco, CA, USA",
      }),
    );
    expect(sourced?.jobLocation).toEqual({
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality: "San Francisco",
        addressRegion: "CA",
        addressCountry: "USA",
      },
    });
    const street = startupRoleJsonLd(
      sampleRole({
        postedAt: "2026-04-02",
        location: "500 Howard St, San Francisco, CA",
      }),
    );
    expect(street?.jobLocation).toEqual({
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality: "San Francisco",
        addressRegion: "CA",
      },
    });
    expect(
      startupRoleJsonLd(
        sampleRole({ postedAt: "2026-04-02", location: "Remote" }),
      ),
    ).not.toHaveProperty("jobLocation");
    const json = JSON.stringify([data, toronto, sourced, street]);
    expect(json).not.toMatch(
      /streetAddress|postalCode|baseSalary|validThrough|employmentType|"salary"/,
    );
    expect(json).not.toContain("2026-09-20");
    expect(json).not.toContain("2026-09-21");
    expect(json).not.toContain("Full-time");
    expect(json).not.toContain("500 Howard");
  });

  it("emits a role-only title when a real post date is present", () => {
    const data = startupRoleJsonLd(
      sampleRole({
        postedAt: "2026-03-01",
        title:
          "*Enterprise Account Executive – Data Centers\nFull-time\nUSA\nRead more",
        location: "Arizona",
        workType: "Full-time",
        descriptionText: "kevAbout Buildots\nBuild the product.",
      }),
    );
    expect(data?.title).toBe("Enterprise Account Executive – Data Centers");
    expect(data?.description).toBe("About Buildots\nBuild the product.");
    expect(data?.datePosted).toBe("2026-03-01");
    expect(data?.jobLocation).toEqual({
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressRegion: "Arizona",
      },
    });
    expect(data).not.toHaveProperty("baseSalary");
    expect(data).not.toHaveProperty("salary");
    expect(data).not.toHaveProperty("employmentType");
    expect(data).not.toHaveProperty("validThrough");
    expect(JSON.stringify(data)).not.toMatch(
      /Full-time|Read more|\bUSA\b|kevAbout|streetAddress|postalCode/,
    );
  });
});

describe("startup jobs facets", () => {
  it("folds careers-board spellings into one work type and never guesses", () => {
    expect(startupWorkTypeOf("FullTime")).toBe("full-time");
    expect(startupWorkTypeOf("Salaried, full-time")).toBe("full-time");
    expect(startupWorkTypeOf("Full Time / Remote")).toBe("full-time");
    expect(startupWorkTypeOf("PartTime")).toBe("part-time");
    expect(startupWorkTypeOf("Contractor")).toBe("contract");
    expect(startupWorkTypeOf("Intern")).toBe("internship");
    expect(startupWorkTypeOf("Graduate")).toBe("internship");
    expect(startupWorkTypeOf("Temporary")).toBe("temporary");
    expect(startupWorkTypeOf("Hybrid")).toBeNull();
    expect(startupWorkTypeOf(null)).toBeNull();
  });

  it("filters by canonical work type, and old raw links still match", () => {
    const roles = [
      sampleRole({ id: "a", slug: "a", workType: "FullTime" }),
      sampleRole({ id: "b", slug: "b", workType: "Contractor" }),
    ];
    const ids = (workType: string) =>
      applyStartupJobsQuery(
        roles,
        parseStartupJobsQuery({ workType }),
        null,
      ).map((role) => role.id);
    expect(ids("full-time")).toEqual(["a"]);
    expect(ids("Full-time")).toEqual(["a"]);
    expect(ids("contract")).toEqual(["b"]);
    expect(parseStartupJobsQuery({ workType: "Volunteer" }).workType).toBe("");
  });

  it("treats the remote location as remote-friendly roles", () => {
    const roles = [
      sampleRole({ id: "a", slug: "a", location: "Santa Clara, CA or Remote" }),
      sampleRole({ id: "b", slug: "b", location: "Paris" }),
      sampleRole({
        id: "c",
        slug: "c",
        location: null,
        workType: "Full Time / Remote",
      }),
      sampleRole({ id: "d", slug: "d", location: "Remoteville" }),
    ];
    expect(
      applyStartupJobsQuery(
        roles,
        parseStartupJobsQuery({ location: STARTUP_JOBS_REMOTE }),
        null,
      )
        .map((role) => role.id)
        .sort(),
    ).toEqual(["a", "c"]);
    expect(startupJobsFacets(roles).remote).toBe(2);
  });

  it("offers only values the roles have, deduped by case and spacing", () => {
    const facets = startupJobsFacets([
      sampleRole({
        id: "a",
        slug: "a",
        location: "New York",
        workType: "FullTime",
      }),
      sampleRole({
        id: "b",
        slug: "b",
        location: "new  york",
        workType: "Intern",
      }),
      sampleRole({ id: "c", slug: "c", location: "Remote", workType: null }),
    ]);
    expect(facets.locations).toEqual(["New York"]);
    expect(facets.workTypes).toEqual(["full-time", "internship"]);
  });

  it("sorts by company by default and keeps that default out of the URL", () => {
    expect(parseStartupJobsQuery({}).sort).toBe(STARTUP_JOBS_DEFAULT_SORT);
    expect(STARTUP_JOBS_DEFAULT_SORT).toBe("company");
    expect(buildStartupJobsPath({ sort: "company" })).toBe("/jobs");
    expect(buildStartupJobsPath({ sort: "role" })).toBe("/jobs?sort=role");
  });
});

describe("startup jobs follow", () => {
  it("refuses an empty catalog follow and keeps roles added after the last look", () => {
    expect(
      startupJobsFollowFromQuery(
        parseStartupJobsQuery({ sort: "company", page: "3" }),
      ),
    ).toBeNull();
    const follow = startupJobsFollowFromQuery(
      parseStartupJobsQuery({
        company: "Cursor-Anysphere",
        q: "  Staff  ",
        workType: "Full-time",
      }),
    );
    expect(follow).toEqual({
      company: "cursor-anysphere",
      q: "staff",
      location: "",
      workType: "full-time",
    });
    const older = sampleRole({
      id: "old",
      title: "Staff Engineer",
      workType: "Full-time",
      listedAt: "2026-09-01T00:00:00.000Z",
    });
    const newer = sampleRole({
      id: "new",
      slug: "cursor-anysphere-staff-2",
      title: "Staff Designer",
      workType: "Full-time",
      listedAt: "2026-09-22T00:00:00.000Z",
    });
    const contract = sampleRole({
      id: "contract",
      slug: "cursor-anysphere-contract",
      title: "Contract Editor",
      workType: "Contract",
      listedAt: "2026-09-22T00:00:00.000Z",
    });
    const added = rolesListedSince(
      [older, newer, contract],
      parseStartupJobsQuery({
        company: "cursor-anysphere",
        workType: "Full-time",
      }),
      null,
      "2026-09-10T00:00:00.000Z",
    );
    expect(added.map((role) => role.id)).toEqual(["new"]);
  });
});

describe("jobs full-text search", () => {
  it("splits a search into lowercase words and drops tsquery syntax", () => {
    expect(startupRoleSearchTerms("  ML   Engineer ")).toEqual([
      "ml",
      "engineer",
    ]);
    expect(startupRoleSearchTerms("c++ & (rust | go):* !java")).toEqual([
      "c",
      "rust",
      "go",
      "java",
    ]);
    expect(startupRoleSearchTerms("Zürich Straße")).toEqual([
      "zürich",
      "straße",
    ]);
    expect(startupRoleSearchTerms("engineer Engineer")).toEqual(["engineer"]);
    expect(startupRoleSearchTerms("!!! ---")).toEqual([]);
  });

  it("caps the number and length of terms", () => {
    const many = Array.from({ length: 20 }, (_, i) => `w${i}`).join(" ");
    expect(startupRoleSearchTerms(many)).toHaveLength(8);
    expect(startupRoleSearchTerms("a".repeat(500))[0]).toHaveLength(64);
  });

  it("matches short words whole and longer words also as prefixes", () => {
    expect(startupRoleSearchPlan("Senior engin ml c++")).toEqual([
      { term: "senior", prefix: true },
      { term: "engin", prefix: true },
      { term: "ml", prefix: false },
      { term: "c", prefix: false },
    ]);
    expect(startupRoleSearchPlan("   ")).toEqual([]);
    expect(startupRoleSearchPlan("&|!")).toEqual([]);
  });

  it("keeps only roles the index matched, with the other filters applied", () => {
    const roles = [
      sampleRole({ id: "a", slug: "a", title: "Staff Engineer" }),
      sampleRole({ id: "b", slug: "b", title: "Designer" }),
      sampleRole({
        id: "c",
        slug: "c",
        title: "Researcher",
        workType: "Contract",
      }),
    ];
    // "b" matched on its description, which the listing never carries.
    const matches = new Map([
      ["b", 0],
      ["c", 1],
    ]);
    const ids = (raw: Record<string, string>) =>
      applyStartupJobsQuery(roles, parseStartupJobsQuery(raw), matches)
        .map((role) => role.id)
        .sort();
    expect(ids({ q: "pytorch" })).toEqual(["b", "c"]);
    expect(ids({ q: "pytorch", workType: "contract" })).toEqual(["c"]);
  });

  it("ignores index matches when the search has no words", () => {
    const roles = [sampleRole({ id: "a", slug: "a" })];
    expect(
      applyStartupJobsQuery(roles, parseStartupJobsQuery({ q: "!!!" }), null),
    ).toHaveLength(1);
    expect(
      applyStartupJobsQuery(roles, parseStartupJobsQuery({}), new Map()),
    ).toHaveLength(1);
  });

  it("refuses a search without index matches instead of guessing", () => {
    expect(() =>
      applyStartupJobsQuery(
        [sampleRole()],
        parseStartupJobsQuery({ q: "engineer" }),
        null,
      ),
    ).toThrow();
  });

  it("orders a search by best match, as the index ranked it", () => {
    const roles = [
      sampleRole({ id: "a", slug: "a", startupName: "Alpha", title: "A" }),
      sampleRole({ id: "b", slug: "b", startupName: "Beta", title: "B" }),
      sampleRole({ id: "c", slug: "c", startupName: "Gamma", title: "C" }),
    ];
    const matches = new Map([
      ["c", 0],
      ["a", 1],
      ["b", 2],
    ]);
    const ids = (raw: Record<string, string>) =>
      applyStartupJobsQuery(roles, parseStartupJobsQuery(raw), matches).map(
        (role) => role.id,
      );
    expect(ids({ q: "engineer" })).toEqual(["c", "a", "b"]);
    // A picked order still wins over the ranking.
    expect(ids({ q: "engineer", sort: "company" })).toEqual(["a", "b", "c"]);
  });
});

describe("jobs best-match sort", () => {
  it("defaults to best match while searching, company A–Z otherwise", () => {
    expect(defaultStartupJobsSort("engineer")).toBe("match");
    expect(defaultStartupJobsSort("  ")).toBe("company");
    expect(defaultStartupJobsSort("!!!")).toBe("company");
    expect(parseStartupJobsQuery({ q: "engineer" }).sort).toBe("match");
    expect(parseStartupJobsQuery({}).sort).toBe("company");
    expect(parseStartupJobsQuery({ q: "engineer", sort: "role" }).sort).toBe(
      "role",
    );
  });

  it("falls back to company A–Z when best match has no search", () => {
    expect(parseStartupJobsQuery({ sort: "match" }).sort).toBe("company");
    expect(parseStartupJobsQuery({ sort: "match", q: "!!!" }).sort).toBe(
      "company",
    );
  });

  it("keeps the default order for the search out of the URL", () => {
    expect(buildStartupJobsPath({ q: "engineer", sort: "match" })).toBe(
      "/jobs?q=engineer",
    );
    expect(buildStartupJobsPath({ q: "engineer", sort: "company" })).toBe(
      "/jobs?q=engineer&sort=company",
    );
    expect(buildStartupJobsPath({ sort: "company" })).toBe("/jobs");
    // Round trip: the URL without a sort reads back as best match.
    expect(parseStartupJobsQuery({ q: "engineer" }).sort).toBe("match");
  });

  it("lets the default order follow the search and keeps a picked one", () => {
    expect(startupJobsSortForSearch({ q: "", sort: "company" }, "eng")).toBe(
      "match",
    );
    expect(startupJobsSortForSearch({ q: "eng", sort: "match" }, "")).toBe(
      "company",
    );
    expect(startupJobsSortForSearch({ q: "", sort: "role" }, "eng")).toBe(
      "role",
    );
    expect(startupJobsSortForSearch({ q: "eng", sort: "company" }, "")).toBe(
      "company",
    );
  });
});
