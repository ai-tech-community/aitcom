import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("@/server/better-auth/client", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "ada" } } }) },
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
vi.mock("@/components/inbox/conversation-messages", () => ({
  useConversationMessages: () => ({
    data: { messages: [] },
    isLoading: false,
  }),
}));
// Records the kind the view hands the composer.
vi.mock("@/components/inbox/message-composer", () => ({
  MessageComposer: ({ kind }: { kind: string }) => (
    <div data-testid="composer" data-kind={kind} />
  ),
}));

import { ConversationView, groupRoomMessages } from "./conversation-view";

it("groups consecutive posts by author, sender type and short intervals within a day", () => {
  const make = (
    senderId: string,
    hour: number,
    minute: number,
    senderType = "human",
  ) => ({
    senderId,
    senderType,
    createdAt: new Date(2026, 10, 28, hour, minute),
  });
  const first = make("ada", 10, 0);
  const second = make("ada", 10, 3);
  const afterPause = make("ada", 10, 8);
  const agent = make("ada", 10, 9, "agent");
  const other = make("sam", 10, 10);
  const last = make("sam", 23, 59);
  const nextDay = { ...last, createdAt: new Date(2026, 10, 29, 0, 0) };
  expect(
    groupRoomMessages([first, second, afterPause, agent, other, last, nextDay]),
  ).toEqual([
    [first, second],
    [afterPause],
    [agent],
    [other],
    [last],
    [nextDay],
  ]);
});

function composerKind() {
  return screen.getByTestId("composer").getAttribute("data-kind");
}

describe("ConversationView composer kind", () => {
  it("is a person conversation when the peer is a person", () => {
    render(
      <ConversationView
        conversationId="c1"
        peer={{ name: "Bob", image: null, isAgent: false }}
      />,
    );

    expect(composerKind()).toBe("person");
  });

  it("is an agent conversation when the peer is an agent", () => {
    render(
      <ConversationView
        conversationId="c1"
        peer={{ name: "Helper", image: null, isAgent: true }}
      />,
    );

    expect(composerKind()).toBe("agent");
  });

  it("takes no GIF while the peer is unknown", () => {
    render(<ConversationView conversationId="c1" peer={null} />);

    expect(composerKind()).toBe("agent");
  });
});
