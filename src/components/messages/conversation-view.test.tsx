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

import { ConversationView } from "./conversation-view";

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
