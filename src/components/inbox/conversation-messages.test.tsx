import { renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import {
  firstUnreadMessage,
  useConversationMessages,
} from "./conversation-messages";

const api = vi.hoisted(() => ({
  summary: vi.fn(),
  messages: vi.fn(),
  markRead: vi.fn(),
}));
vi.mock("@/components/shells/shell-unread", () => ({
  useShellUnread: () => ({ markRead: api.markRead }),
}));
vi.mock("@/trpc/react", () => ({
  api: {
    inbox: {
      getConversation: { useQuery: api.summary },
      getMessages: { useQuery: api.messages },
    },
  },
}));

const initial = new Date("2026-11-28T13:51:00Z");
const date = (minute: number) => new Date(initial.getTime() + minute * 60_000);
const message = (
  id: string,
  minute: number,
  senderId = "peer",
  senderType: "human" | "agent" = "human",
) => ({
  id,
  senderId,
  senderType,
  createdAt: date(minute),
});

it("uses the opening unread count and cutoff without including self sends, optimistic rows or later arrivals", () => {
  const messages = [
    message("seen", -3),
    message("first", -2),
    message("own", -1, "viewer"),
    message("agent", 0, "viewer", "agent"),
    message("optimistic-pending", 0, "viewer"),
    message("later", 1),
  ];
  expect(
    firstUnreadMessage(
      messages,
      { count: 2, latestAt: initial.getTime() },
      "viewer",
    ),
  ).toBe("first");
  expect(
    firstUnreadMessage(
      messages,
      { count: 0, latestAt: initial.getTime() },
      "viewer",
    ),
  ).toBeUndefined();
});

it("waits for the summary before a read-advancing fetch and keeps its divider across polls", () => {
  api.summary.mockReturnValue({ isFetchedAfterMount: false, isFetching: true });
  api.messages.mockReturnValue({
    isLoading: false,
    data: { messages: [message("seen", -1), message("unread", 0)] },
  });
  const { result, rerender } = renderHook(() =>
    useConversationMessages("chat", "viewer"),
  );
  expect(result.current.isLoading).toBe(true);
  expect(api.messages).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.objectContaining({ enabled: false }),
  );
  expect(api.markRead).not.toHaveBeenCalled();
  api.summary.mockReturnValue({
    isFetchedAfterMount: true,
    isFetching: false,
    data: { unreadCount: 1, lastMessage: { createdAt: initial } },
  });
  rerender();
  expect(result.current.firstUnreadId).toBe("unread");
  expect(api.messages).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.objectContaining({ enabled: true }),
  );
  api.summary.mockReturnValue({
    isFetchedAfterMount: true,
    isFetching: false,
    data: { unreadCount: 0 },
  });
  api.messages.mockReturnValue({
    isLoading: false,
    data: {
      messages: [
        message("seen", -1),
        message("unread", 0),
        message("later", 1),
      ],
    },
  });
  rerender();
  expect(result.current.firstUnreadId).toBe("unread");
});
