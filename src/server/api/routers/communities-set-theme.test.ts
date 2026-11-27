// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as PaymentsAccess from "@/server/payments/access";
import type * as ThemeStore from "@/server/communities/theme-store";

const fake = vi.hoisted(() => ({
  community: vi.fn(),
  membership: vi.fn(),
  writeTheme: vi.fn(),
  logActivity: vi.fn(),
}));
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/env", () => ({
  env: { NODE_ENV: "test", NEXT_PUBLIC_APP_URL: "https://app.test" },
}));
vi.mock("@/server/better-auth", () => ({
  auth: { api: { getSession: async () => null } },
}));
vi.mock("@/server/payload", () => ({ getPayloadClient: async () => ({}) }));
vi.mock("@/server/agent/activity", () => ({ logActivity: fake.logActivity }));
vi.mock("@/server/payments/access", async (importOriginal) => ({
  ...(await importOriginal<typeof PaymentsAccess>()),
  canReadPaidCommunity: async () => true,
  membershipPaymentAllowed: async () => true,
}));
// The real missing-table check stays, so the test pins which errors map
// to PRECONDITION_FAILED; only the database write is faked.
vi.mock("@/server/communities/theme-store", async (importOriginal) => ({
  ...(await importOriginal<typeof ThemeStore>()),
  writeCommunityThemeId: fake.writeTheme,
}));

import { communitiesRouter } from "./communities";

const db = {
  query: {
    communities: { findFirst: fake.community },
    communityMemberships: { findFirst: fake.membership },
  },
};

function callerWithRole(role: "owner" | "admin" | "moderator" | "member") {
  fake.membership.mockResolvedValue({ status: "active", role });
  return communitiesRouter.createCaller({
    db: db as never,
    session: { user: { id: "u1" }, session: {} } as never,
    headers: new Headers(),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fake.community.mockResolvedValue({
    id: "c1",
    slug: "connect-inspire",
    deletedAt: null,
  });
  fake.writeTheme.mockResolvedValue(undefined);
});

describe("communities.setTheme", () => {
  it.each(["owner", "admin"] as const)(
    "lets an %s store the look and logs it",
    async (role) => {
      const result = await callerWithRole(role).setTheme({
        slug: "connect-inspire",
        themeId: "canal",
      });

      expect(result).toEqual({ themeId: "canal" });
      expect(fake.writeTheme).toHaveBeenCalledTimes(1);
      expect(fake.writeTheme).toHaveBeenCalledWith(db, "c1", "canal", "u1");
      expect(fake.logActivity).toHaveBeenCalledWith(db, {
        actorId: "u1",
        actorType: "member",
        action: "community.theme_updated",
        targetType: "community",
        targetId: "c1",
        metadata: { themeId: "canal" },
      });
    },
  );

  it.each(["moderator", "member"] as const)(
    "refuses a %s without touching the store",
    async (role) => {
      await expect(
        callerWithRole(role).setTheme({
          slug: "connect-inspire",
          themeId: "canal",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(fake.writeTheme).not.toHaveBeenCalled();
      expect(fake.logActivity).not.toHaveBeenCalled();
    },
  );

  it("rejects a look that is not in the catalog", async () => {
    await expect(
      callerWithRole("owner").setTheme({
        slug: "connect-inspire",
        themeId: "gone" as never,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(fake.writeTheme).not.toHaveBeenCalled();
  });

  it("says themes wait for the migration when the table is missing", async () => {
    fake.writeTheme.mockRejectedValue(
      Object.assign(
        new Error('relation "app.community_theme" does not exist'),
        { code: "42P01" },
      ),
    );
    await expect(
      callerWithRole("owner").setTheme({
        slug: "connect-inspire",
        themeId: "night",
      }),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "Themes are not available until the database migration runs.",
    });
    expect(fake.logActivity).not.toHaveBeenCalled();
  });

  it("lets any other database failure through as itself", async () => {
    fake.writeTheme.mockRejectedValue(
      Object.assign(new Error("permission denied for table community_theme"), {
        code: "42501",
      }),
    );
    await expect(
      callerWithRole("owner").setTheme({
        slug: "connect-inspire",
        themeId: "night",
      }),
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "permission denied for table community_theme",
    });
    expect(fake.logActivity).not.toHaveBeenCalled();
  });
});
