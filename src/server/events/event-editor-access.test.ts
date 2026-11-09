import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/server/payload", () => ({ getPayloadClient: vi.fn() }));

const { editorModeFor, resolveEventEditHref } =
  await import("./event-editor-access");

describe("editorModeFor", () => {
  it.each([
    [
      "an admin",
      {
        isAdmin: true,
        isSubmitter: false,
        status: "published",
        wantsResubmit: false,
      },
      "edit",
    ],
    [
      "an admin asking to resubmit someone else's",
      {
        isAdmin: true,
        isSubmitter: false,
        status: "rejected",
        wantsResubmit: true,
      },
      "edit",
    ],
    [
      "an admin resubmitting their own rejected one",
      {
        isAdmin: true,
        isSubmitter: true,
        status: "rejected",
        wantsResubmit: true,
      },
      "resubmit",
    ],
    [
      "an admin editing their own rejected one",
      {
        isAdmin: true,
        isSubmitter: true,
        status: "rejected",
        wantsResubmit: false,
      },
      "edit",
    ],
    [
      "the submitter of a rejected event",
      {
        isAdmin: false,
        isSubmitter: true,
        status: "rejected",
        wantsResubmit: false,
      },
      "resubmit",
    ],
    [
      "the submitter of a pending event",
      {
        isAdmin: false,
        isSubmitter: true,
        status: "draft",
        wantsResubmit: true,
      },
      null,
    ],
    [
      "the submitter of a published event",
      {
        isAdmin: false,
        isSubmitter: true,
        status: "published",
        wantsResubmit: false,
      },
      null,
    ],
    [
      "another member",
      {
        isAdmin: false,
        isSubmitter: false,
        status: "rejected",
        wantsResubmit: true,
      },
      null,
    ],
  ] as const)("%s → %s", (_who, input, expected) => {
    expect(editorModeFor(input)).toBe(expected);
  });
});

describe("resolveEventEditHref", () => {
  const event = { communityId: "builders-id", slug: "builders-night" };

  function fakeDb(
    membership: { role: string; status: string } | null,
    community: { slug: string } | null = { slug: "builders" },
  ) {
    return {
      query: {
        communityMemberships: { findFirst: vi.fn(async () => membership) },
        communities: { findFirst: vi.fn(async () => community) },
      },
    };
  }

  it.each(["owner", "admin"])(
    "links an active %s to the existing event editor",
    async (role) => {
      const db = fakeDb({ role, status: "active" });
      expect(await resolveEventEditHref(db as never, "viewer", event)).toBe(
        "/communities/builders/events/builders-night/edit",
      );
    },
  );

  it.each([
    null,
    { role: "member", status: "active" },
    { role: "moderator", status: "active" },
    { role: "admin", status: "pending_approval" },
    { role: "owner", status: "banned" },
  ])("hides the link without editing permission: %j", async (membership) => {
    const db = fakeDb(membership);
    expect(await resolveEventEditHref(db as never, "viewer", event)).toBeNull();
    expect(db.query.communities.findFirst).not.toHaveBeenCalled();
  });

  it("does not query for signed-out viewers or unscoped events", async () => {
    const db = fakeDb({ role: "owner", status: "active" });
    expect(await resolveEventEditHref(db as never, null, event)).toBeNull();
    expect(
      await resolveEventEditHref(db as never, "viewer", {
        ...event,
        communityId: null,
      }),
    ).toBeNull();
    expect(db.query.communityMemberships.findFirst).not.toHaveBeenCalled();
  });

  it("hides the link when the community is missing or deleted", async () => {
    const db = fakeDb({ role: "owner", status: "active" }, null);
    expect(await resolveEventEditHref(db as never, "viewer", event)).toBeNull();
  });
});
