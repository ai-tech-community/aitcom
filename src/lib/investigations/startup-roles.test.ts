import { describe, expect, it } from "vitest";

import { startupRoleJsonLd, type StartupRolePublic } from "./startup-roles";

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
