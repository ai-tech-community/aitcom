import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as PublicEventAccess from "@/server/events/public-event-access";

/**
 * Invite-only communities stay off the public event page for signed-out
 * visitors and for signed-in people who are not active members. The page
 * uses the real `viewerMaySeeEvent` gate against this fixture.
 */
const state = vi.hoisted(() => ({
  userId: null as string | null,
  member: false,
  role: "member",
  coverImage: null as { id: number; url: string } | null,
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
          coverImage: state.coverImage,
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
          state.member
            ? {
                communityId: state.community?.id,
                role: state.role,
                status: "active",
              }
            : null,
      },
    },
  },
}));

vi.mock("@/server/events/public-event-access", async (importOriginal) => ({
  ...(await importOriginal<typeof PublicEventAccess>()),
  loadHiddenEventCommunityIds: async () => [],
}));

import EventDetailPage, { generateMetadata } from "./page";

const params = () =>
  Promise.resolve({ slug: "sunday-10k-social-run-demo-1792244773622" });

beforeEach(() => {
  state.userId = null;
  state.member = false;
  state.role = "member";
  state.coverImage = null;
  state.community = {
    id: "runners",
    slug: "sunday-runners-demo",
    isListedInDirectory: true,
    joinPolicy: "invite_only",
  };
});

function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children as ReactNode)];
}

describe("event detail actions and cover", () => {
  it("shows the saved cover and a direct editor link to a community admin", async () => {
    state.userId = "admin-1";
    state.member = true;
    state.role = "admin";
    state.coverImage = { id: 42, url: "/media/event-cover.png" };
    const tree = elements(await EventDetailPage({ params: params() }));
    expect(
      tree.some((node) => node.props.heroImageUrl === "/media/event-cover.png"),
    ).toBe(true);
    expect(
      tree.some(
        (node) =>
          node.props.href ===
          "/communities/sunday-runners-demo/events/sunday-10k-social-run-demo-1792244773622/edit",
      ),
    ).toBe(true);
  });

  it("hides the editor link from a regular member", async () => {
    state.userId = "member-1";
    state.member = true;
    const tree = elements(await EventDetailPage({ params: params() }));
    expect(
      tree.some(
        (node) =>
          typeof node.props.href === "string" &&
          node.props.href.endsWith("/edit"),
      ),
    ).toBe(false);
  });
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
