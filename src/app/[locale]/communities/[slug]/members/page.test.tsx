import { beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement } from "react";

const redirect = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
);
vi.mock("@/i18n/navigation", () => ({ redirect }));
vi.mock("@/components/communities/matching/members-hub", () => ({
  CommunityMembersHub: () => null,
}));

import { CommunityMembersHub } from "@/components/communities/matching/members-hub";
import CommunityMembersPage from "./page";

const open = (search: Record<string, string | string[] | undefined>) =>
  CommunityMembersPage({
    params: Promise.resolve({ locale: "nl", slug: "alpha" }),
    searchParams: Promise.resolve(search),
  });

describe("CommunityMembersPage", () => {
  beforeEach(() => {
    redirect.mockClear();
  });

  it("shows the directory when the link names no matching tab", async () => {
    for (const search of [{}, { tab: "directory" }, { ref: "mail" }]) {
      const page = await open(search);
      expect(isValidElement(page)).toBe(true);
      expect(page.type).toBe(CommunityMembersHub);
      expect(page.props).toEqual({ slug: "alpha" });
      expect(page.key).toBe("alpha");
    }
    expect(redirect).not.toHaveBeenCalled();
  });

  it("sends an old matching tab link to Find a match, keeping its other params", async () => {
    await expect(
      open({ tab: "profile", ref: ["mail", "digest"] }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith({
      href: "/communities/alpha/match?tab=profile&ref=mail&ref=digest",
      locale: "nl",
    });
  });
});
