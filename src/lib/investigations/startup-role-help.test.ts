import { describe, expect, it } from "vitest";

import {
  buildRoleHelpPost,
  matchCommunityClassroom,
} from "./startup-role-help";

describe("matchCommunityClassroom", () => {
  const courses = [{ title: "System design", slug: "system-design" }];

  it("matches an existing classroom by title or slug", () => {
    expect(matchCommunityClassroom(courses, "system design")?.slug).toBe(
      "system-design",
    );
    expect(matchCommunityClassroom(courses, "system-design")?.title).toBe(
      "System design",
    );
  });

  it("returns null for a blank name and for a classroom that is not listed", () => {
    expect(matchCommunityClassroom(courses, "  ")).toBeNull();
    expect(matchCommunityClassroom(courses, "Invented course")).toBeNull();
  });
});

describe("buildRoleHelpPost", () => {
  it("keeps the member note and the sourced posting, without a score", () => {
    const post = buildRoleHelpPost({
      locale: "en",
      roleTitle: "Staff Engineer",
      startupName: "Fixture Co",
      rolePath: "/en/jobs/fixture-co-staff-engineer",
      sourceUrl: "https://fixture.example/careers/staff",
      note: "A walkthrough of the system design section.",
      classroomTitle: "System design",
      classroomPath: "/en/communities/ait/classroom/system-design",
    });

    expect(post.title).toBe("Help with Staff Engineer");
    expect(post.content).toContain(
      "A walkthrough of the system design section.",
    );
    expect(post.content).toContain("https://fixture.example/careers/staff");
    expect(post.content).toContain("System design");
    expect(post.content).not.toMatch(/fit score|salary/i);
  });
});
