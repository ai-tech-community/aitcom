import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

const data = vi.hoisted(() => ({
  messages: [] as {
    id: string;
    senderId: string;
    senderType: string;
    createdAt: Date;
    content: string;
  }[],
  roster: [] as { userId: string; displayName: string; image: string | null }[],
  getProfile: vi.fn(),
}));

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("@/server/better-auth/client", () => ({
  authClient: {
    useSession: () => ({
      data: { user: { id: "ada", name: "Ada Session", image: null } },
    }),
  },
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
vi.mock("@/components/inbox/conversation-messages", () => ({
  useConversationMessages: () => ({
    data: { messages: data.messages },
    isLoading: false,
  }),
}));
vi.mock("@/trpc/react", () => ({
  api: {
    communities: {
      getMembers: {
        useQuery: () => ({ data: { items: data.roster }, isLoading: false }),
      },
    },
    useQueries: (createQueries: (proxy: unknown) => unknown) =>
      createQueries({ members: { getPublicProfile: data.getProfile } }),
  },
}));
vi.mock("@/components/inbox/message-body", () => ({
  MessageBody: ({ message }: { message: { content: string } }) => (
    <span>{message.content}</span>
  ),
}));
// Records the kind the view hands the composer.
vi.mock("@/components/inbox/message-composer", () => ({
  MessageComposer: ({ kind }: { kind: string }) => (
    <div data-testid="composer" data-kind={kind} />
  ),
}));

import { ConversationView, groupRoomMessages } from "./conversation-view";

beforeEach(() => {
  data.messages = [];
  data.roster = [];
  data.getProfile.mockReset().mockReturnValue({ data: null });
});

describe("room author attribution", () => {
  const message = (senderId: string, senderType = "human") => ({
    id: "m1",
    senderId,
    senderType,
    createdAt: new Date(2026, 10, 28, 10),
    content: "A room message",
  });

  function room(
    previews: {
      userId: string;
      displayName: string;
      avatarUrl: string | null;
    }[] = [],
  ) {
    render(
      <ConversationView
        conversationId="room"
        peer={null}
        hideHeader
        roomAuthors={{ slug: "workbench", previews }}
      />,
    );
    return screen
      .getByText("A room message")
      .closest<HTMLElement>("[data-room-message]")!;
  }

  it("uses the existing profile lookup for a sender outside the first 50 roster members", () => {
    data.messages = [message("outside-roster")];
    data.roster = Array.from({ length: 50 }, (_, index) => ({
      userId: `u-${index}`,
      displayName: `Member ${index}`,
      image: null,
    }));
    data.getProfile.mockReturnValue({
      data: {
        profile: { displayName: "Outside Roster" },
        user: { avatarUrl: null },
      },
    });
    const group = room();
    expect(data.getProfile).toHaveBeenCalledWith(
      { userId: "outside-roster" },
      { retry: false },
    );
    expect(within(group).getByText("Outside Roster")).toBeVisible();
    expect(within(group).getByText("OR")).toBeVisible();
  });

  it("renders agent messages without using their owner's name or avatar", () => {
    data.messages = [message("ada", "agent")];
    const group = room([
      { userId: "ada", displayName: "Human Owner", avatarUrl: null },
    ]);
    expect(group.querySelector('[data-slot="avatar"]')).toBeNull();
    expect(
      within(group).queryByText(/Human Owner|Ada Session|unknownRoomAuthor/),
    ).toBeNull();
    expect(data.getProfile).not.toHaveBeenCalled();
  });

  it("uses the session identity for the viewer's own messages without querying profiles", () => {
    data.messages = [message("ada")];
    const group = room([
      { userId: "ada", displayName: "Stale Display Name", avatarUrl: null },
    ]);
    expect(within(group).getByText("Ada Session")).toBeVisible();
    expect(within(group).queryByText("Stale Display Name")).toBeNull();
    expect(data.getProfile).not.toHaveBeenCalled();
  });

  it("keeps the original message layout when a sender has no readable public profile", () => {
    data.messages = [message("unavailable")];
    const group = room();
    expect(within(group).getByText("A room message")).toBeVisible();
    expect(
      within(group).queryByText(/unknownRoomAuthor|roomMessageYou/),
    ).toBeNull();
    expect(group.querySelector('[data-slot="avatar"]')).toBeNull();
  });
});

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
