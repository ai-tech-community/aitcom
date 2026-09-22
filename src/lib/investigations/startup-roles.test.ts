import { describe, expect, it } from "vitest";

import {
  parseStartupJobsQuery,
  rolesListedSince,
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
