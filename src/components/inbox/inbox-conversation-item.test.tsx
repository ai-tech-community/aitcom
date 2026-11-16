import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../messages/en.json";

vi.mock("./inbox-provider", () => ({
  useInbox: () => ({ openChat: vi.fn() }),
}));

import { InboxConversationItem } from "./inbox-conversation-item";

function renderItem(lastMessage: {
  content: string;
  attachmentKind: "gif" | null;
}) {
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <InboxConversationItem
        id="c1"
        type="dm"
        displayName="Bob"
        image={null}
        lastMessage={lastMessage}
        lastMessageSenderType="user"
        lastMessageAt="2026-11-16T10:00:00.000Z"
        unreadCount={0}
      />
    </NextIntlClientProvider>,
  );
}

describe("InboxConversationItem", () => {
  it("reads GIF for a last message that is only a GIF", () => {
    renderItem({ content: "", attachmentKind: "gif" });

    expect(screen.getByText("GIF")).toBeInTheDocument();
  });

  it("reads the words of a last message that has them", () => {
    renderItem({ content: "look at this", attachmentKind: "gif" });

    expect(screen.getByText("look at this")).toBeInTheDocument();
    expect(screen.queryByText("GIF")).toBeNull();
  });
});
