import { describe, expect, it } from "vitest";

import { viewerMaySeeEvent } from "./public-event-access";

function fakeDb(options: {
  community?: {
    id: string;
    slug: string;
    isListedInDirectory: boolean;
    joinPolicy: "open" | "invite_only" | "approval_required";
  } | null;
  member?: boolean;
}) {
  return {
    query: {
      communities: {
        findFirst: async () => options.community ?? null,
      },
      communityMemberships: {
        findFirst: async () => (options.member ? { communityId: "c" } : null),
      },
    },
  } as never;
}

describe("viewerMaySeeEvent", () => {
  const studio = {
    id: "studio",
    slug: "ait-demo-studio",
    isListedInDirectory: false,
    joinPolicy: "invite_only" as const,
  };

  it("hides a private invite-only community from a guest", async () => {
    await expect(
      viewerMaySeeEvent(fakeDb({ community: studio }), "studio", null),
    ).resolves.toBe(false);
  });

  it("shows that community to an active member", async () => {
    await expect(
      viewerMaySeeEvent(
        fakeDb({ community: studio, member: true }),
        "studio",
        "member-1",
      ),
    ).resolves.toBe(true);
  });

  it("keeps an event with no community public", async () => {
    await expect(viewerMaySeeEvent(fakeDb({}), null, null)).resolves.toBe(true);
  });

  it("fails closed when the community row is missing", async () => {
    await expect(
      viewerMaySeeEvent(fakeDb({ community: null }), "gone", null),
    ).resolves.toBe(false);
  });
});
