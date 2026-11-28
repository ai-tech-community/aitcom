import { beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement } from "react";

const redirect = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
);
const state = vi.hoisted(() => ({
  redesigned: false,
}));
vi.mock("@/i18n/navigation", () => ({ redirect }));
vi.mock("@/lib/communities/redesign-flag", () => ({
  isOpenCommunitiesEnabled: () => state.redesigned,
}));
vi.mock("@/components/communities/matching/community-people-directory", () => ({
  CommunityPeopleDirectory: () => null,
}));
vi.mock("@/components/communities/matching/members-hub", () => ({
  CommunityMembersHub: () => null,
}));

import { CommunityMembersHub } from "@/components/communities/matching/members-hub";
import { CommunityPeopleDirectory } from "@/components/communities/matching/community-people-directory";
import CommunityMembersPage from "./page";

const open = (search: Record<string, string | string[] | undefined>) =>
  CommunityMembersPage({
    params: Promise.resolve({ locale: "nl", slug: "alpha" }),
    searchParams: Promise.resolve(search),
  });

describe("CommunityMembersPage", () => {
  beforeEach(() => {
    redirect.mockClear();
    state.redesigned = false;
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

  it("passes shared search parameters to the redesigned directory", async () => {
    state.redesigned = true;
    const search = { q: "Ada", skill: "TypeScript", role: "member" };
    const page = await open(search);
    expect(page.type).toBe(CommunityPeopleDirectory);
    expect(page.props).toEqual({ slug: "alpha", search });
  });

  it("sends an old matching tab link to Find a match, keeping its other params", async () => {
    state.redesigned = true;
    await expect(
      open({ tab: "profile", ref: ["mail", "digest"] }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith({
      href: "/communities/alpha/match?tab=profile&ref=mail&ref=digest",
      locale: "nl",
    });
  });
});
