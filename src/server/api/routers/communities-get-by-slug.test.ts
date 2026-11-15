// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { JoinPolicy } from "@/server/communities/invite-policy";
import type * as PaymentsAccess from "@/server/payments/access";

const fake = vi.hoisted(() => ({
  community: vi.fn(),
  membership: vi.fn(),
  counts: vi.fn(),
  liveness: vi.fn(),
}));
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/env", () => ({
  env: { NODE_ENV: "test", NEXT_PUBLIC_APP_URL: "https://app.test" },
}));
vi.mock("@/server/better-auth", () => ({
  auth: { api: { getSession: async () => null } },
}));
vi.mock("@/server/payload", () => ({ getPayloadClient: async () => ({}) }));
vi.mock("@/server/agent/activity", () => ({ logActivity: vi.fn() }));
vi.mock("@/server/payments/access", async (importOriginal) => ({
  ...(await importOriginal<typeof PaymentsAccess>()),
  canReadPaidCommunity: async () => true,
  membershipPaymentAllowed: async () => true,
}));
vi.mock("@/server/communities/discovery-queries", () => ({
  loadPublicLiveness: fake.liveness,
}));
vi.mock("@/server/news/sectors", () => ({
  isMissingNewsSectorSchema: () => false,
  readCommunityNewsSector: async () => "ai",
  writeCommunityNewsSector: vi.fn(),
}));

import { communitiesRouter } from "./communities";

function row(joinPolicy: JoinPolicy, isListedInDirectory = true) {
  return {
    id: "c1",
    name: "Connect & Inspire",
    slug: "connect-inspire",
    description: "Networking and more",
    logoUrl: "https://cdn.test/logo.png",
    bannerUrl: "https://cdn.test/banner.png",
    bannerAlt: "",
    bannerMediaId: null,
    joinPolicy,
    isListedInDirectory,
    feedPostPolicy: "all_members",
    deletedAt: null,
  };
}

function caller(userId: string | null) {
  const db = {
    query: {
      communities: { findFirst: fake.community },
      communityMemberships: { findFirst: fake.membership },
    },
    select: () => ({
      from: () => ({ where: fake.counts }),
    }),
  };
  return communitiesRouter.createCaller({
    db: db as never,
    session: userId ? ({ user: { id: userId }, session: {} } as never) : null,
    headers: new Headers(),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fake.membership.mockResolvedValue(undefined);
  fake.counts.mockResolvedValue([{ memberCount: 40, adminCount: 2 }]);
  fake.liveness.mockResolvedValue({ activeContributors: 6, recentThreads: 3 });
});

describe("communities.getBySlug", () => {
  it("answers NOT_FOUND for a missing community", async () => {
    fake.community.mockResolvedValue(undefined);
    await expect(
      caller(null).getBySlug({ slug: "nope" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it.each<JoinPolicy>(["invite_only", "approval_required"])(
    "gives an outsider of a listed %s community only who it is and how to join",
    async (joinPolicy) => {
      fake.community.mockResolvedValue(row(joinPolicy));
      for (const viewer of [null, "outsider"]) {
        const community = await caller(viewer).getBySlug({
          slug: "connect-inspire",
        });
        expect(community).toMatchObject({
          name: "Connect & Inspire",
          slug: "connect-inspire",
          description: "Networking and more",
          logoUrl: "https://cdn.test/logo.png",
          bannerUrl: "https://cdn.test/banner.png",
          joinPolicy,
          viewerCanReadContent: false,
          memberCount: null,
          adminCount: null,
          liveness: { activeContributors: 0, recentThreads: 0 },
        });
      }
      expect(fake.community).toHaveBeenCalledWith(
        expect.objectContaining({ columns: { createdBy: false } }),
      );
      expect(fake.liveness).not.toHaveBeenCalled();
      expect(fake.counts).not.toHaveBeenCalled();
    },
  );

  it("asks a signed-in outsider only for an active membership", async () => {
    fake.community.mockResolvedValue(row("approval_required"));
    // A pending or invited row is not active, so the lookup finds nothing
    // (pinned against a real database in forum-visibility.integration).
    fake.membership.mockResolvedValue(undefined);
    const community = await caller("pending-user").getBySlug({
      slug: "connect-inspire",
    });
    expect(community.viewerCanReadContent).toBe(false);
    expect(fake.membership).toHaveBeenCalledWith(
      expect.objectContaining({ columns: { role: true } }),
    );
  });

  it("gives an active member of a private community everything", async () => {
    fake.community.mockResolvedValue(row("invite_only"));
    fake.membership.mockResolvedValue({ role: "member" });
    const community = await caller("member").getBySlug({
      slug: "connect-inspire",
    });
    expect(community).toMatchObject({
      viewerCanReadContent: true,
      memberCount: 40,
      adminCount: 2,
      liveness: { activeContributors: 6, recentThreads: 3 },
    });
  });

  it("gives anyone a public community's content and counts, without a membership lookup", async () => {
    fake.community.mockResolvedValue(row("open"));
    const community = await caller(null).getBySlug({
      slug: "connect-inspire",
    });
    expect(community).toMatchObject({
      viewerCanReadContent: true,
      memberCount: 40,
      adminCount: 2,
      liveness: { activeContributors: 6, recentThreads: 3 },
    });
    expect(fake.membership).not.toHaveBeenCalled();
  });

  it("keeps an unlisted open community members-only", async () => {
    fake.community.mockResolvedValue(row("open", false));
    const community = await caller("outsider").getBySlug({
      slug: "connect-inspire",
    });
    expect(community).toMatchObject({
      viewerCanReadContent: false,
      memberCount: null,
    });
  });
});
