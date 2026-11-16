import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("@/server/better-auth/client", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "ada" } } }) },
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
vi.mock("@/components/inbox/use-inbox-stream", () => ({
  useInboxStream: () => undefined,
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
vi.mock("./conversation-list", () => ({ ConversationList: () => null }));
vi.mock("./new-message", () => ({ NewMessage: () => null }));
// Records whose profile the docked pane shows.
vi.mock("./profile-pane", () => ({
  ProfilePane: ({ peerUserId }: { peerUserId: string | null }) => (
    <div data-testid="profile" data-peer-user-id={peerUserId ?? ""} />
  ),
  RoomInfoPane: () => null,
}));

const queries = vi.hoisted(() => ({
  list: vi.fn(),
  one: vi.fn(),
}));
vi.mock("@/trpc/react", () => ({
  api: {
    inbox: {
      listConversations: { useQuery: queries.list },
      getConversation: { useQuery: queries.one },
    },
  },
}));

import { MessagesShell } from "./messages-shell";

/** A dm with Bob, the shape `listConversations` and `getConversation` give. */
function dmWithBob(id: string) {
  return {
    id,
    type: "dm",
    updatedAt: "2026-01-01T00:00:00.000Z",
    isPinned: false,
    lastMessage: null,
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

type RetryRule = (failureCount: number, error: unknown) => boolean;

/** The retry rule the last `getConversation` query was given. */
function lookUpRetry(): RetryRule | boolean | number | undefined {
  const call = queries.one.mock.calls.at(-1) as
    | [unknown, { retry?: RetryRule | boolean | number } | undefined]
    | undefined;
  return call?.[1]?.retry;
}

/** A tRPC error as React Query hands it to `retry`. */
function trpcError(code: string) {
  return { data: { code } };
}

function composerKind() {
  return screen.getByTestId("composer").getAttribute("data-kind");
}

/** Whether the last `getConversation` query was allowed to run. */
function lookUpEnabled(): boolean | undefined {
  const call = queries.one.mock.calls.at(-1) as
    | [unknown, { enabled?: boolean } | undefined]
    | undefined;
  return call?.[1]?.enabled;
}

describe("MessagesShell active conversation", () => {
  beforeEach(() => {
    queries.list.mockReset();
    queries.one.mockReset();
    queries.one.mockReturnValue({ data: undefined });
  });

  it("looks up a conversation the list lacks and shows its person", () => {
    queries.list.mockReturnValue({
      data: { conversations: [dmWithBob("other")], nextCursor: null },
    });
    queries.one.mockReturnValue({ data: dmWithBob("old") });

    render(<MessagesShell activeConversationId="old" />);

    expect(queries.one).toHaveBeenCalledWith(
      { conversationId: "old" },
      expect.objectContaining({ enabled: true }),
    );
    expect(composerKind()).toBe("person");
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(
      screen.getByTestId("profile").getAttribute("data-peer-user-id"),
    ).toBe("bob");
  });

  it("does not look up the conversation while the list is loading", () => {
    queries.list.mockReturnValue({ data: undefined });

    render(<MessagesShell activeConversationId="old" />);

    expect(lookUpEnabled()).toBe(false);
    expect(composerKind()).toBe("agent");
  });

  it("does not look up a conversation the list already has", () => {
    queries.list.mockReturnValue({
      data: { conversations: [dmWithBob("listed")], nextCursor: null },
    });

    render(<MessagesShell activeConversationId="listed" />);

    expect(lookUpEnabled()).toBe(false);
    expect(composerKind()).toBe("person");
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("does not retry a conversation that does not exist, but retries other failures", () => {
    queries.list.mockReturnValue({
      data: { conversations: [dmWithBob("other")], nextCursor: null },
    });

    render(<MessagesShell activeConversationId="gone" />);

    const retry = lookUpRetry();
    expect(typeof retry).toBe("function");
    const rule = retry as RetryRule;
    expect(rule(0, trpcError("NOT_FOUND"))).toBe(false);
    expect(rule(0, trpcError("INTERNAL_SERVER_ERROR"))).toBe(true);
    expect(rule(2, trpcError("INTERNAL_SERVER_ERROR"))).toBe(true);
    expect(rule(3, trpcError("INTERNAL_SERVER_ERROR"))).toBe(false);
  });
});
