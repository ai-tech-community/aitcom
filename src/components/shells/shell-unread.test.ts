import { describe, expect, it } from "vitest";
import { resolveMessageBadge, summarizeShellUnread } from "./shell-unread";

const firstMessage = new Date("2026-11-25T12:00:00Z");
const room = {
  id: "room",
  isRoom: true,
  communitySlug: "workbench",
  spaceId: "workshop",
  unreadCount: 14,
  lastMessage: {
    createdAt: firstMessage,
    content: "A new conversation",
    senderId: "member",
    senderType: "human",
    attachmentKind: null,
  },
};
const inbox = {
  ...room,
  id: "dm",
  isRoom: false,
  communitySlug: null,
  spaceId: null,
  unreadCount: 2,
};

describe("shell unread counts", () => {
  it("counts the direct inbox once, separately from rooms and their community flags", () => {
    const unread = summarizeShellUnread([inbox, room, room], new Map());
    expect(unread.messages).toBe(2);
    expect(unread.rooms.get("workshop")).toBe(14);
    expect([...unread.communities]).toEqual(["workbench"]);
  });

  it("keeps stale reads clear while showing later messages", () => {
    const markers = new Map([["room", firstMessage.getTime()]]);
    const unread = summarizeShellUnread([inbox, room], markers);
    expect(unread.messages).toBe(2);
    expect(unread.rooms.size).toBe(0);
    expect(unread.communities.size).toBe(0);

    const newRoomMessage = {
      ...room,
      unreadCount: 1,
      lastMessage: {
        ...room.lastMessage,
        createdAt: new Date(firstMessage.getTime() + 1000),
      },
    };
    const updated = summarizeShellUnread([inbox, newRoomMessage], markers);
    expect(updated.messages).toBe(2);
    expect(updated.rooms.get("workshop")).toBe(1);
    expect(updated.communities.has("workbench")).toBe(true);
  });
});

it("preserves the aggregate badge if existing conversation pages omit unread rows", () => {
  const partial = summarizeShellUnread([inbox, room], new Map());
  expect(resolveMessageBadge(partial, 16, true)).toEqual({
    count: 2,
    includesRooms: false,
  });
  expect(resolveMessageBadge(partial, 20, true).count).toBe(0);
  expect(resolveMessageBadge(partial, 20, false)).toEqual({
    count: 20,
    includesRooms: true,
  });
});

it("uses a complete first page even when the independent total still has an old room count", () => {
  const counts = summarizeShellUnread(
    [inbox, { ...room, unreadCount: 0 }],
    new Map(),
  );
  expect(resolveMessageBadge(counts, 16, false, true)).toEqual({
    count: 2,
    includesRooms: false,
  });
});
