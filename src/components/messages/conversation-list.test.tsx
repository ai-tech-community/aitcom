import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../messages/en.json";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, ...props }: React.ComponentProps<"a">) => (
    <a {...props}>{children}</a>
  ),
}));

const conversations = vi.hoisted(() => ({
  list: [] as unknown[],
  rows: [] as unknown[],
  markers: new Map<string, number>(),
}));
vi.mock("@/components/shells/shell-unread", async (load) => ({
  ...(await load<Record<string, unknown>>()),
  useShellUnread: () => ({
    conversationRows: conversations.rows,
    readThrough: conversations.markers,
  }),
}));
vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({}),
    inbox: {
      listConversations: {
        useQuery: () => ({
          data: { conversations: conversations.list, nextCursor: null },
          isError: false,
          isLoading: false,
        }),
      },
    },
  },
}));

import { ConversationList } from "./conversation-list";

/** A dm with Bob whose last message is `lastMessage`. */
function dmWithBob(lastMessage: {
  content: string;
  attachmentKind: "gif" | null;
}) {
  return {
    id: "c1",
    type: "dm",
    updatedAt: "2026-11-16T10:00:00.000Z",
    isPinned: false,
    lastMessage: {
      ...lastMessage,
      senderType: "user",
      senderId: "bob",
      createdAt: "2026-11-16T10:00:00.000Z",
    },
    participants: [{ userId: "bob", displayName: "Bob", image: null }],
    agentInfo: null,
    unreadCount: 0,
    isRoom: false,
    title: null,
    roomSlug: null,
    spaceId: null,
    roomVisibility: null,
    communitySlug: null,
    communityName: null,
    communityLogoUrl: null,
    memberCount: 0,
  };
}

function renderList(
  overrides?: Partial<React.ComponentProps<typeof ConversationList>>,
) {
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <ConversationList onNewMessage={vi.fn()} {...overrides} />
    </NextIntlClientProvider>,
  );
}

describe("ConversationList", () => {
  it("reads GIF for a last message that is only a GIF", () => {
    conversations.list = [dmWithBob({ content: "", attachmentKind: "gif" })];

    renderList();

    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("GIF")).toBeInTheDocument();
  });

  it("reads the words of a last message that has them", () => {
    conversations.list = [
      dmWithBob({ content: "look at this", attachmentKind: "gif" }),
    ];

    renderList();

    expect(screen.getByText("look at this")).toBeInTheDocument();
    expect(screen.queryByText("GIF")).toBeNull();
  });
});

it("retains the community return path and labels the unread count", () => {
  conversations.list = [
    {
      ...dmWithBob({ content: "Workshop notes", attachmentKind: null }),
      unreadCount: 3,
    },
  ];
  renderList({
    redesigned: true,
    fromCommunity: "workbench-notes",
    activeConversationId: "c1",
  });
  const row = screen.getByRole("link", { name: /Bob/ });
  expect(row).toHaveAttribute(
    "href",
    "/messages/c1?fromCommunity=workbench-notes",
  );
  expect(row).toHaveAttribute("aria-current", "page");
  expect(screen.getByLabelText("3 unread messages")).toBeVisible();
});

it("opens the unread snapshot and omits a room already read locally", () => {
  const base = dmWithBob({ content: "Workshop notes", attachmentKind: null });
  conversations.list = [
    { ...base, id: "room", isRoom: true, title: "Workshop", unreadCount: 3 },
  ];
  conversations.rows = [{ ...base, id: "older-dm", unreadCount: 2 }];
  conversations.markers.set(
    "room",
    new Date(base.lastMessage.createdAt).getTime(),
  );
  try {
    renderList({
      redesigned: true,
      fromCommunity: "workbench-notes",
      unreadOnly: true,
    });
    expect(screen.queryByText("Workshop", { exact: true })).toBeNull();
    const row = screen.getByRole("link", { name: /Bob/ });
    expect(row).toHaveAttribute(
      "href",
      "/messages/older-dm?fromCommunity=workbench-notes&view=unread",
    );
    expect(screen.getByText("Bob")).toHaveClass("font-bold");
    expect(screen.getByLabelText("2 unread messages")).toBeVisible();
  } finally {
    conversations.rows = [];
    conversations.markers.clear();
  }
});
