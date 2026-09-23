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
  type StartupRolePublic,
} from "./startup-roles";

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
      applyStartupJobsQuery(roles, parseStartupJobsQuery({ workType })).map(
        (role) => role.id,
      );
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
      "2026-09-10T00:00:00.000Z",
    );
    expect(added.map((role) => role.id)).toEqual(["new"]);
  });
});
