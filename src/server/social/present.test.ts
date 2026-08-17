import { describe, expect, it, vi } from "vitest";

import {
  isMissingSocialIdentityRelation,
  ignoreMissingSocialIdentityTable,
} from "./errors";
import {
  leaderboardSkills,
  loadSocialIdentitiesForUsers,
  presentMemberSocials,
  toLeaderboardSocial,
} from "./present";

describe("isMissingSocialIdentityRelation", () => {
  it("matches the production Postgres / Neon message", () => {
    expect(
      isMissingSocialIdentityRelation(
        new Error('relation "app.social_identity" does not exist'),
      ),
    ).toBe(true);
  });

  it("matches a wrapped 42P01 cause", () => {
    const cause = Object.assign(new Error("social_identity"), {
      code: "42P01",
    });
    expect(
      isMissingSocialIdentityRelation(
        Object.assign(new Error("Failed query"), { cause }),
      ),
    ).toBe(true);
  });

  it("does not swallow unrelated failures", () => {
    expect(isMissingSocialIdentityRelation(new Error("connection reset"))).toBe(
      false,
    );
    expect(
      isMissingSocialIdentityRelation(
        Object.assign(
          new Error('relation "app.member_profile" does not exist'),
          {
            code: "42P01",
          },
        ),
      ),
    ).toBe(false);
  });
});

describe("ignoreMissingSocialIdentityTable", () => {
  it("returns the fallback when the table is missing", async () => {
    const result = await ignoreMissingSocialIdentityTable(async () => {
      throw new Error('relation "app.social_identity" does not exist');
    }, []);
    expect(result).toEqual([]);
  });

  it("rethrows other errors", async () => {
    await expect(
      ignoreMissingSocialIdentityTable(async () => {
        throw new Error("deadlock detected");
      }, []),
    ).rejects.toThrow("deadlock detected");
  });
});

describe("loadSocialIdentitiesForUsers", () => {
  it("returns an empty map when social_identity has not been migrated", async () => {
    const database = {
      select: () => {
        throw new Error('relation "app.social_identity" does not exist');
      },
    };

    const map = await loadSocialIdentitiesForUsers(database as never, [
      "user-without-socials",
    ]);

    expect(map.size).toBe(0);
    expect(map.get("user-without-socials") ?? []).toEqual([]);
  });

  it("does not query when there are no member ids", async () => {
    const select = vi.fn();
    const map = await loadSocialIdentitiesForUsers({ select } as never, []);
    expect(map.size).toBe(0);
    expect(select).not.toHaveBeenCalled();
  });
});

describe("leaderboard presentation for members without verified socials", () => {
  it("renders a member with no social_identity row, no company, and no skills", () => {
    const social = presentMemberSocials({
      userId: "wren",
      identities: [],
      hasGithubAccount: false,
      pasted: {
        githubUrl: null,
        linkedinUrl: null,
        websiteUrl: null,
      },
      subject: "member",
    });

    expect(toLeaderboardSocial(social)).toEqual({
      github: null,
      linkedin: null,
    });
    expect(leaderboardSkills(null)).toEqual([]);
    expect(leaderboardSkills(undefined)).toEqual([]);
    expect(leaderboardSkills([])).toEqual([]);
  });

  it("keeps verified GitHub on the leaderboard and ignores unverified pasted URLs", () => {
    const social = presentMemberSocials({
      userId: "greg",
      identities: [
        {
          userId: "greg",
          provider: "github",
          providerAccountId: "1",
          handle: "UretzkyZvi",
          profileUrl: "https://github.com/UretzkyZvi",
        },
      ],
      hasGithubAccount: true,
      pasted: { linkedinUrl: "https://www.linkedin.com/in/uretzkyzvi" },
      subject: "member",
    });

    expect(toLeaderboardSocial(social)).toEqual({
      github: {
        handle: "UretzkyZvi",
        url: "https://github.com/UretzkyZvi",
        verified: true,
      },
      linkedin: null,
    });
  });
});
