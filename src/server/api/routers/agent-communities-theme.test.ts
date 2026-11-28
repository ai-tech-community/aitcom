// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as ContentVisibilityQueries from "@/server/communities/content-visibility-queries";
import type * as SharedMediaUrl from "@/server/communities/shared-media-url";

const fake = vi.hoisted(() => ({
  agent: {
    agentId: "agent-a",
    ownerId: "owner-a" as string | null,
    scopes: ["read"],
  },
  community: vi.fn(),
  membership: vi.fn(),
  access: vi.fn(),
  themeId: vi.fn(),
}));
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/env", () => ({
  env: {
    NODE_ENV: "test",
    NEXT_PUBLIC_APP_URL: "https://app.test",
    DATABASE_URL: "postgres://localhost:1/none",
  },
}));
vi.mock("@/server/better-auth", () => ({
  auth: { api: { getSession: async () => null } },
}));
vi.mock("@/server/agent/api-key", () => ({
  validateApiKey: async () => fake.agent,
}));
vi.mock("@/server/payload", () => ({ getPayloadClient: async () => ({}) }));
vi.mock(
  "@/server/communities/content-visibility-queries",
  async (importOriginal) => ({
    ...(await importOriginal<typeof ContentVisibilityQueries>()),
    viewerCommunityAccess: fake.access,
  }),
);
vi.mock("@/server/communities/shared-media-url", async (importOriginal) => ({
  ...(await importOriginal<typeof SharedMediaUrl>()),
  findMediaIdsByUrl: async () => new Map(),
}));
vi.mock("@/server/communities/theme-store", () => ({
  isMissingCommunityThemeSchema: () => false,
  readCommunityThemeId: fake.themeId,
  writeCommunityThemeId: vi.fn(),
}));

import { createTRPCRouter } from "@/server/api/trpc";
import { agentCommunityRouter } from "./agent-communities";

const db = {
  // The agent auth stamps the key's last use.
  update: () => ({ set: () => ({ where: async () => undefined }) }),
  query: {
    communities: { findFirst: fake.community },
    communityMemberships: { findFirst: fake.membership },
  },
};

const caller = () =>
  createTRPCRouter(agentCommunityRouter).createCaller({
    db: db as never,
    session: null,
    headers: new Headers({ authorization: "Bearer test-agent-key" }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  fake.community.mockResolvedValue({
    id: "c1",
    name: "Connect & Inspire",
    slug: "connect-inspire",
    description: "Networking and more",
    logoUrl: null,
    bannerUrl: null,
    bannerAlt: null,
    bannerMediaId: null,
    joinPolicy: "invite_only",
    isListedInDirectory: true,
    deletedAt: null,
  });
  fake.membership.mockResolvedValue(undefined);
  // An outsider of a private community: no roster, no content.
  fake.access.mockResolvedValue({ content: false, roster: false });
  fake.themeId.mockResolvedValue("night");
});

describe("agent getCommunityInfo", () => {
  it("names the community's look, as communities.getBySlug does", async () => {
    const info = await caller().getCommunityInfo({ slug: "connect-inspire" });

    expect(info.themeId).toBe("night");
    expect(fake.themeId).toHaveBeenCalledWith(db, "c1");
    expect(info.viewerCanReadContent).toBe(false);
  });
});
