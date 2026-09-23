import { describe, expect, it } from "vitest";

import {
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
  it("omits datePosted when only scan fetchedAt is present", () => {
    const data = startupRoleJsonLd(sampleRole());
    expect(data).not.toHaveProperty("datePosted");
    expect(JSON.stringify(data)).not.toContain("2026-09-20");
  });

  it("emits datePosted from a board-sourced post date", () => {
    const data = startupRoleJsonLd(
      sampleRole({ postedAt: "2026-03-01T12:00:00.000Z" }),
    );
    expect(data.datePosted).toBe("2026-03-01");
    expect(data.datePosted).not.toBe("2026-09-20");
  });

  it("emits a role-only title and never invents salary or datePosted", () => {
    const data = startupRoleJsonLd(
      sampleRole({
        title:
          "*Enterprise Account Executive – Data Centers\nFull-time\nUSA\nRead more",
        location: "Arizona",
        workType: "Full-time",
        descriptionText: "kevAbout Buildots\nBuild the product.",
      }),
    );
    expect(data.title).toBe("Enterprise Account Executive – Data Centers");
    expect(data.description).toBe("About Buildots\nBuild the product.");
    expect(data).not.toHaveProperty("datePosted");
    expect(data).not.toHaveProperty("baseSalary");
    expect(data).not.toHaveProperty("salary");
    expect(JSON.stringify(data)).not.toMatch(
      /Full-time|Read more|\bUSA\b|kevAbout/,
    );
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
      workType: "Full-time",
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
