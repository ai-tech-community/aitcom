import { describe, expect, it, vi } from "vitest";

const { getBySlug, loadCommunityRoster, loadCommunityRosterSkills } =
  vi.hoisted(() => ({
    getBySlug: vi.fn(),
    loadCommunityRoster: vi.fn(),
    loadCommunityRosterSkills: vi.fn().mockResolvedValue([]),
  }));

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock("@/i18n/navigation", () => ({ Link: () => null }));
vi.mock("@/server/better-auth/server", () => ({
  getSession: async () => ({ user: { id: "outsider" } }),
}));
vi.mock("@/server/db", () => ({
  db: {
    query: {
      communityMemberships: { findFirst: async () => undefined },
    },
  },
}));
vi.mock("@/server/payments/access", () => ({
  canReadPaidCommunity: async () => true,
}));
vi.mock("@/server/communities/roster-read", () => ({
  loadCommunityRoster,
  loadCommunityRosterSkills,
}));
vi.mock("@/trpc/server", () => ({ api: { communities: { getBySlug } } }));

import { MemberLoadError } from "@/components/members/member-load-error";
import { CommunityPeopleDirectory } from "./community-people-directory";

describe("CommunityPeopleDirectory", () => {
  it("withholds the roster and skill suggestions from a non-reader even when metadata includes a count", async () => {
    getBySlug.mockResolvedValue({
      id: "community-id",
      slug: "private-community",
      joinPolicy: "invite_only",
      isListedInDirectory: true,
      memberCount: 12,
      createdAt: new Date("2026-09-01T00:00:00Z"),
    });

    const page = await CommunityPeopleDirectory({
      slug: "private-community",
      search: { q: "Ada", skill: "Go" },
    });

    expect(page.type).toBe(MemberLoadError);
    expect(loadCommunityRoster).not.toHaveBeenCalled();
    expect(loadCommunityRosterSkills).not.toHaveBeenCalled();
  });
});
