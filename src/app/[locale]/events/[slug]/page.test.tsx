import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Invite-only communities stay off the public event page for signed-out
 * visitors and for signed-in people who are not active members. The page
 * uses the real `viewerMaySeeEvent` gate against this fixture.
 */
const state = vi.hoisted(() => ({
  userId: null as string | null,
  member: false,
  community: {
    id: "runners",
    slug: "sunday-runners-demo",
    isListedInDirectory: true,
    joinPolicy: "invite_only",
  } as {
    id: string;
    slug: string;
    isListedInDirectory: boolean;
    joinPolicy: string;
  } | null,
}));

vi.mock("server-only", () => ({}));

vi.mock("react", async () => {
  const actual = await vi.importActual("react");
  return {
    ...(actual as object),
    cache: (fn: unknown) => fn,
  };
});

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("next/image", () => ({
  default: () => null,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("next-intl/server", () => ({
  getLocale: async () => "en",
  getTranslations: async () => (key: string) => key,
}));

vi.mock("@/server/better-auth/server", () => ({
  getSession: async () =>
    state.userId ? { user: { id: state.userId } } : null,
}));

vi.mock("@/server/payload", () => ({
  getPayloadClient: async () => ({
    find: async () => ({
      docs: [
        {
          id: 85,
          slug: "sunday-10k-social-run-demo-1792244773622",
          title: "Sunday 10K Social Run (demo)",
          status: "published",
          communityId: "runners",
          date: "2026-10-18T09:00:00.000Z",
          location: "Amsterdam",
          type: "meetup",
          description: null,
          summary: null,
        },
      ],
    }),
  }),
}));

vi.mock("@/server/db", () => ({
  db: {
    query: {
      communities: {
        findFirst: async () => state.community,
      },
      communityMemberships: {
        findFirst: async () =>
          state.member ? { communityId: state.community?.id } : null,
      },
    },
  },
}));

import EventDetailPage, { generateMetadata } from "./page";

const params = () =>
  Promise.resolve({ slug: "sunday-10k-social-run-demo-1792244773622" });

beforeEach(() => {
  state.userId = null;
  state.member = false;
  state.community = {
    id: "runners",
    slug: "sunday-runners-demo",
    isListedInDirectory: true,
    joinPolicy: "invite_only",
  };
});

describe("invite-only community event page", () => {
  it("is not found for a signed-out visitor, including metadata", async () => {
    await expect(EventDetailPage({ params: params() })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    await expect(generateMetadata({ params: params() })).resolves.toEqual({});
  });

  it("is not found for a signed-in person who was not invited", async () => {
    state.userId = "signed-in-non-member";
    state.member = false;
    await expect(EventDetailPage({ params: params() })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    await expect(generateMetadata({ params: params() })).resolves.toEqual({});
  });

  it("keeps metadata for an active member of that community", async () => {
    state.userId = "member-1";
    state.member = true;
    const meta = await generateMetadata({ params: params() });
    expect(meta).not.toEqual({});
    expect(meta.title).toBe("Sunday 10K Social Run (demo)");
  });
});
