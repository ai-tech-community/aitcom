import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../messages/en.json";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

const conversations = vi.hoisted(() => ({ list: [] as unknown[] }));
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

function renderList() {
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <ConversationList onNewMessage={vi.fn()} />
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
