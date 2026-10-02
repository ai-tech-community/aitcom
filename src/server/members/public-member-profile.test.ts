// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  publicMemberProfileColumns,
  toPublicMemberProfile,
} from "@/server/members/public-member-profile";

const PUBLIC_PROFILE_KEYS = [
  "bio",
  "company",
  "createdAt",
  "displayName",
  "level",
  "skills",
  "userId",
  "websiteUrl",
  "xp",
];

describe("toPublicMemberProfile", () => {
  it("returns only the fields public surfaces render", () => {
    const row = {
      userId: "u1",
      displayName: "Ada",
      bio: null,
      skills: ["ts"],
      company: null,
      websiteUrl: null,
      githubUrl: "https://github.com/ada",
      linkedinUrl: null,
      xp: 10,
      level: 1,
      createdAt: new Date(),
      // Extra fields on the input must not pass through.
      isPublic: false,
      interests: ["x"],
    };
    expect(Object.keys(toPublicMemberProfile(row)).sort()).toEqual(
      PUBLIC_PROFILE_KEYS,
    );
  });

  it("selects only the public columns plus the pasted social URLs", () => {
    expect(Object.keys(publicMemberProfileColumns).sort()).toEqual(
      [...PUBLIC_PROFILE_KEYS, "githubUrl", "linkedinUrl"].sort(),
    );
  });
});
