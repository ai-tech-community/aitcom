import { describe, expect, it, vi } from "vitest";
import { getAvatarUrl } from "@/lib/avatar";
import { summarizeConversations, type ConvRow } from "./conversation-summaries";

const feature = vi.hoisted(() => ({ enabled: false }));
vi.mock("@/lib/communities/redesign-flag", () => ({
  isOpenCommunitiesEnabled: () => feature.enabled,
}));
vi.mock("./message-attachments", () => ({
  loadAttachments: async () => new Map(),
}));

const conversation: ConvRow = {
  conversationId: "dm",
  convType: "dm",
  convUpdatedAt: new Date("2026-11-26"),
  lastReadAt: null,
  isPinned: false,
  spaceId: null,
  roomName: null,
  roomSlug: null,
  roomVisibility: null,
  communitySlug: null,
  communityName: null,
  communityLogoUrl: null,
  memberCount: 0,
};

function databaseReturningParticipant(
  image: string | null,
  email: string | null,
) {
  const participant = {
    userId: "peer",
    displayName: "Paper Kite",
    name: null,
    image,
    email,
  };
  const lastMessage = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
  };
  const participantQuery = {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([participant]),
  };
  const countQuery = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([{ count: 0 }]),
  };
  const select = vi
    .fn()
    .mockReturnValueOnce(lastMessage)
    .mockReturnValueOnce(participantQuery)
    .mockReturnValueOnce(countQuery);
  return { select } as unknown as Parameters<typeof summarizeConversations>[0];
}

describe("chat avatar projection", () => {
  it.each([
    [null, "paper-kite@example.test"],
    ["https://example.test/picture.jpg", "paper-kite@example.test"],
    [null, null],
  ])(
    "returns the room and profile avatar source for image %s and email %s",
    async (image, email) => {
      feature.enabled = true;
      const [result] = await summarizeConversations(
        databaseReturningParticipant(image, email),
        "viewer",
        [conversation],
      );
      expect(result?.participants).toEqual([
        {
          userId: "peer",
          displayName: "Paper Kite",
          image,
          avatarUrl: getAvatarUrl(email, image),
        },
      ]);
    },
  );

  it("preserves the legacy participant projection with the flag off", async () => {
    feature.enabled = false;
    const [result] = await summarizeConversations(
      databaseReturningParticipant(null, "paper-kite@example.test"),
      "viewer",
      [conversation],
    );
    expect(result?.participants).toEqual([
      { userId: "peer", displayName: "Paper Kite", image: null },
    ]);
  });
});
