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
  firstUnreadId: undefined as string | undefined,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
  useLocale: () => "en",
}));
vi.mock("@/components/inbox/connection-status", () => ({
  ConnectionStatus: () => null,
}));
vi.mock("@/server/better-auth/client", () => ({
  authClient: {
    useSession: () => ({
      data: { user: { id: "ada", name: "Ada Session", image: null } },
    }),
  },
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }: React.ComponentProps<"a">) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/components/inbox/conversation-messages", () => ({
  useConversationMessages: () => ({
    data: { messages: data.messages },
    isLoading: false,
    firstUnreadId: data.firstUnreadId,
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

import { ConversationView } from "./conversation-view";
import { groupMessages } from "./chat-transcript";

beforeEach(() => {
  data.messages = [];
  data.roster = [];
  data.firstUnreadId = undefined;
  data.getProfile.mockReset().mockReturnValue({ data: null });
});

it("labels the link from an inbox room to its community", () => {
  const href = "/communities/workbench/spaces/repairs";
  render(
    <ConversationView
      conversationId="room"
      peer={{ name: "Repairs", image: null, isAgent: false }}
      roomHref={href}
      redesigned
    />,
  );
  expect(screen.getByRole("link", { name: "openRoom" })).toHaveAttribute(
    "href",
    href,
  );
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
        redesigned
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
    expect(within(group).getByText("agent")).toBeVisible();
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

  it("labels a sender whose name is unavailable without using an identity from another message", () => {
    data.messages = [message("unavailable")];
    const group = room();
    expect(within(group).getByText("A room message")).toBeVisible();
    expect(
      within(group).queryByText(/unknownRoomAuthor|roomMessageYou/),
    ).toBeNull();
    expect(within(group).getByText("member")).toBeVisible();
  });

  it("keeps partially visible room messages rendered when a banner shrinks the viewport at the bottom", () => {
    let height = 200;
    const observers: { resize: ResizeObserverCallback; targets: Element[] }[] =
      [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        targets: Element[] = [];
        constructor(resize: ResizeObserverCallback) {
          observers.push({ resize, targets: this.targets });
        }
        observe(target: Element) {
          this.targets.push(target);
        }
        disconnect() {
          this.targets.length = 0;
        }
      },
    );
    const clientHeight = vi
      .spyOn(Element.prototype, "clientHeight", "get")
      .mockImplementation(() => height);
    const geometry = vi
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: Element) {
        if (this.hasAttribute("data-chat-day-divider")) {
          return new DOMRect(0, 0, 300, 30);
        }
        if (this.hasAttribute("data-room-message")) {
          const first = this.textContent?.includes("A room message");
          return new DOMRect(0, first && height === 160 ? 20 : 45, 300, 55);
        }
        return new DOMRect(0, 0, 300, height);
      });
    try {
      const first = message("ada");
      data.messages = [
        first,
        { ...first, id: "m2", senderId: "bob", content: "The latest message" },
      ];
      const row = room();
      const log = screen.getByRole("log");
      const viewport = log.firstElementChild as HTMLElement;
      let scrollTop = 200;
      Object.defineProperties(viewport, {
        scrollTop: {
          get: () => scrollTop,
          set: (top: number) => {
            scrollTop = Math.min(top, 400 - height);
          },
        },
        scrollHeight: { value: 400 },
      });
      const resizeViewport = observers.find(({ targets }) =>
        targets.includes(viewport),
      )!.resize;
      resizeViewport([], {} as ResizeObserver);
      height = 160;
      resizeViewport([], {} as ResizeObserver);

      expect(viewport.scrollTop).toBe(240);
      expect(row).not.toHaveAttribute("data-clipped-room-message");
      expect(within(row).getByText("A room message")).toBeVisible();
    } finally {
      geometry.mockRestore();
      clientHeight.mockRestore();
      vi.unstubAllGlobals();
    }
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
    groupMessages([first, second, afterPause, agent, other, last, nextDay]),
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

it("attributes a DM to its sender and gives each text message a copy action", () => {
  const writtenAt = new Date(2026, 10, 28, 10);
  data.messages = [
    {
      id: "1",
      senderId: "bob",
      senderType: "human",
      content: "Incoming",
      createdAt: writtenAt,
    },
    {
      id: "2",
      senderId: "ada",
      senderType: "human",
      content: "Outgoing",
      createdAt: writtenAt,
    },
  ];
  render(
    <ConversationView
      conversationId="c1"
      peer={{ name: "Bob", image: null, isAgent: false }}
      redesigned
    />,
  );
  expect(
    within(
      screen.getByText("Incoming").closest("[data-room-message]")!,
    ).getByText("Bob"),
  ).toBeVisible();
  expect(
    within(
      screen.getByText("Outgoing").closest("[data-room-message]")!,
    ).getByText("you"),
  ).toBeVisible();
  expect(screen.getAllByRole("button", { name: "copyMessage" })).toHaveLength(
    2,
  );
});

it.each([false, true])(
  "places the unread divider before the first unread in room mode %s",
  (room) => {
    data.messages = [
      {
        id: "read",
        senderId: "bob",
        senderType: "human",
        content: "Read",
        createdAt: new Date(2026, 10, 26, 13, 49),
      },
      {
        id: "unread",
        senderId: "bob",
        senderType: "human",
        content: "Unread",
        createdAt: new Date(2026, 10, 26, 13, 51),
      },
    ];
    data.firstUnreadId = "unread";
    render(
      <ConversationView
        conversationId="chat"
        redesigned
        peer={{ name: "Bob", image: null, isAgent: false }}
        roomAuthors={
          room
            ? {
                slug: "workbench",
                previews: [
                  { userId: "bob", displayName: "Bob", avatarUrl: null },
                ],
              }
            : undefined
        }
      />,
    );
    const unread = screen
      .getByText("Unread")
      .closest<HTMLElement>("[data-room-message]")!;
    expect(within(unread).getByText("newMessages")).toBeInTheDocument();
    expect(within(unread).getByText("1:51 PM")).toBeInTheDocument();
    expect(
      unread
        .closest("[data-chat-day]")
        ?.querySelector("[data-chat-day-divider]"),
    ).toBeInTheDocument();
    const copy = within(unread).getByRole("button", { name: "copyMessage" });
    copy.focus();
    expect(copy).toHaveFocus();
  },
);
