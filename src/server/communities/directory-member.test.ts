// @vitest-environment node
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  directoryProfileColumns,
  toDirectoryMember,
  type DirectoryMemberRow,
} from "./directory-member";
import { MEMBER_CARD_SKILL_LIMIT } from "@/server/members/member-card";
import { profileReadableBy } from "@/server/members/profile-access";

function row(overrides: Partial<DirectoryMemberRow> = {}): DirectoryMemberRow {
  return {
    userId: "u1",
    role: "member",
    joinedAt: new Date("2026-11-01T00:00:00Z"),
    displayName: "Naomi",
    bio: "Builds things",
    image: null,
    profilePublic: true,
    company: "Acme",
    skills: ["TypeScript", "Postgres"],
    xp: 450,
    ...overrides,
  };
}

describe("toDirectoryMember", () => {
  it("links and previews a public profile for any viewer", () => {
    const member = toDirectoryMember(row(), null);
    expect(member.canOpenProfile).toBe(true);
    expect(member.profile).toEqual({
      company: "Acme",
      skills: ["TypeScript", "Postgres"],
      level: 3,
      tier: "beginner",
    });
  });

  it("neither links nor sends details of a private profile to another viewer", () => {
    const member = toDirectoryMember(
      row({ profilePublic: false }),
      "someone-else",
    );
    expect(member.canOpenProfile).toBe(false);
    expect(member.profile).toBeNull();
    expect(member).not.toHaveProperty("company");
    expect(member).not.toHaveProperty("skills");
    expect(member).not.toHaveProperty("xp");
    expect(member).not.toHaveProperty("profilePublic");
  });

  it("lets owners open and preview their own private profile", () => {
    const member = toDirectoryMember(row({ profilePublic: false }), "u1");
    expect(member.canOpenProfile).toBe(true);
    expect(member.profile?.company).toBe("Acme");
  });

  it("lets an owner without a profile row open the setup page with no preview", () => {
    const member = toDirectoryMember(
      row({ profilePublic: false, company: null, skills: null, xp: null }),
      "u1",
    );
    expect(member.canOpenProfile).toBe(true);
    expect(member.profile).toBeNull();
  });

  it("keeps the roster fields the directory already shows", () => {
    const member = toDirectoryMember(row({ profilePublic: false }), null);
    expect(member).toMatchObject({
      userId: "u1",
      role: "member",
      displayName: "Naomi",
      bio: "Builds things",
      image: null,
    });
  });

  it("caps the skills carried for the preview", () => {
    const skills = Array.from({ length: 9 }, (_, i) => `skill-${i}`);
    const member = toDirectoryMember(row({ skills }), null);
    expect(member.profile?.skills).toEqual(
      skills.slice(0, MEMBER_CARD_SKILL_LIMIT),
    );
  });
});

describe("directoryProfileColumns", () => {
  it("decides public profiles with the profile page's visitor rule, defaulting to false", () => {
    const dialect = new PgDialect();
    const column = dialect.sqlToQuery(
      directoryProfileColumns().profilePublic.getSQL(),
    );
    const rule = dialect.sqlToQuery(profileReadableBy("visitor")!);
    expect(column.sql).toBe(`coalesce(${rule.sql}, false)`);
    expect(column.params).toEqual(rule.params);
  });
});
