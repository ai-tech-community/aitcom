// @vitest-environment node
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  profileAudience,
  profileReach,
  profileReachColumns,
  profileReadableBy,
} from "@/server/members/profile-access";

// Same casing as the app database client.
const dialect = new PgDialect({ casing: "snake_case" });
const render = (condition: SQL) => dialect.sqlToQuery(condition);

describe("profileAudience", () => {
  it("is owner only when the signed-in viewer is the profile owner", () => {
    expect(profileAudience("u1", "u1")).toBe("owner");
  });

  it("is visitor for another member or a signed-out viewer", () => {
    expect(profileAudience("u2", "u1")).toBe("visitor");
    expect(profileAudience(null, "u1")).toBe("visitor");
    expect(profileAudience(undefined, "u1")).toBe("visitor");
  });
});

describe("profileReadableBy", () => {
  it("adds no row condition for the owner", () => {
    expect(profileReadableBy("owner")).toBeUndefined();
  });

  it("requires is_public, no staff flag, and no denylist match for visitors", () => {
    const condition = profileReadableBy("visitor");
    expect(condition).toBeDefined();
    const { sql, params } = render(condition!);
    expect(sql).toMatch(/"member_profile"\."is_public" = \$\d+/);
    expect(sql).toMatch(/"member_profile"\."hidden_from_public" = \$\d+/);
    expect(sql).toMatch(/"member_profile"\."user_id" not in \(/);
    expect(sql).toMatch(
      /lower\(btrim\("app"\."member_profile"\."display_name"\)\) not in \(/,
    );
    // is_public = true, hidden_from_public = false, in that order.
    expect(params.slice(0, 2)).toEqual([true, false]);
  });
});

describe("profileReachColumns", () => {
  it("reports staff hiding without the member's own is_public choice", () => {
    const { sql } = render(profileReachColumns().hiddenByStaff);
    expect(sql).toMatch(/^not \(/);
    expect(sql).toContain('"hidden_from_public"');
    expect(sql).not.toContain('"is_public"');
  });
});

describe("profileReach", () => {
  it("is public when the member chose public and staff do not hide it", () => {
    expect(profileReach({ isPublic: true, hiddenByStaff: false })).toEqual({
      kind: "public",
    });
  });

  it("points a private profile at Settings", () => {
    expect(profileReach({ isPublic: false, hiddenByStaff: false })).toEqual({
      kind: "ownerOnly",
      reason: "private",
    });
  });

  it("reports staff hiding first, since Settings cannot fix it", () => {
    expect(profileReach({ isPublic: true, hiddenByStaff: true })).toEqual({
      kind: "ownerOnly",
      reason: "hiddenByStaff",
    });
    expect(profileReach({ isPublic: false, hiddenByStaff: true })).toEqual({
      kind: "ownerOnly",
      reason: "hiddenByStaff",
    });
  });
});
