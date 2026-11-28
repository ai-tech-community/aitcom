import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

// Pins the kind the floating chat window and the mobile inbox hand the
// composer: both only render once the conversation (and so its type) is
// known, and pass it straight through.
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("@/server/better-auth/client", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "ada" } } }) },
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

const inbox = vi.hoisted(() => ({
  setActiveChat: vi.fn(),
  toggleList: vi.fn(),
}));
vi.mock("./inbox-provider", () => ({
  useInbox: () => ({
    closeChat: vi.fn(),
    minimizeChat: vi.fn(),
    ...inbox,
  }),
}));
vi.mock("./use-inbox-stream", () => ({ useInboxStream: () => undefined }));
vi.mock("./conversation-messages", () => ({
  useConversationMessages: () => ({
    data: { messages: [] },
    isLoading: false,
  }),
}));
vi.mock("./message-composer", () => ({
  MessageComposer: ({ kind }: { kind: string }) => (
    <div data-testid="composer" data-kind={kind} />
  ),
}));

import { ChatWindow } from "./chat-window";
import { InboxMobileView } from "./inbox-mobile-view";

function composerKind() {
  return screen.getByTestId("composer").getAttribute("data-kind");
}

describe("composer kind per surface", () => {
  it.each([
    [false, "person"],
    [true, "agent"],
  ])("chat window with isAgent=%s gives %s", (isAgent, kind) => {
    render(
      <ChatWindow
        conversationId="c1"
        displayName="Bob"
        image={null}
        isAgent={isAgent}
      />,
    );

    expect(composerKind()).toBe(kind);
  });

  it.each([
    [false, "person"],
    [true, "agent"],
  ])("mobile inbox with isAgent=%s gives %s", (isAgent, kind) => {
    render(
      <InboxMobileView
        chatInfo={{
          conversationId: "c1",
          displayName: "Bob",
          image: null,
          isAgent,
        }}
      />,
    );

    expect(composerKind()).toBe(kind);
  });
});

it("closes a shell chat without reopening the floating Inbox list", () => {
  render(
    <InboxMobileView
      restoreListOnClose={false}
      chatInfo={{
        conversationId: "c1",
        displayName: "Bob",
        image: null,
        isAgent: false,
      }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "close" }));
  expect(inbox.setActiveChat).toHaveBeenCalledWith(null);
  expect(inbox.toggleList).not.toHaveBeenCalled();
});
