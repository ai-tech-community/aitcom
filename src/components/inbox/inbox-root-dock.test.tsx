import { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const inboxState = vi.hoisted(() => ({
  isListOpen: false,
  openChats: [] as string[],
  minimizedChats: [] as string[],
  activeChat: null as string | null,
}));

vi.mock("@/server/better-auth/client", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "ada" } } }) },
}));
/** What `listConversations` returns; most tests need no conversations. */
const listed = vi.hoisted(() => ({ data: undefined as unknown }));
/** Counts each time a mobile conversation view mounts. */
const mobileMounts = vi.hoisted(() => vi.fn());

vi.mock("@/trpc/react", () => ({
  api: {
    inbox: {
      listConversations: { useQuery: () => ({ data: listed.data }) },
      totalUnreadCount: { useQuery: () => ({ data: { count: 0 } }) },
    },
  },
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("./inbox-provider", () => ({ useInbox: () => inboxState }));
vi.mock("./inbox-pill", () => ({
  InboxPill: () => <button type="button">INBOX</button>,
}));
vi.mock("./inbox-list", () => ({ InboxList: () => <div>inbox list</div> }));
vi.mock("./chat-window", () => ({ ChatWindow: () => null }));
vi.mock("./chat-window-minimized", () => ({ ChatWindowMinimized: () => null }));
vi.mock("./inbox-mobile-view", async () => {
  const { useEffect } = await import("react");
  return {
    InboxMobileView: ({
      chatInfo,
    }: {
      chatInfo: { conversationId: string };
    }) => {
      useEffect(() => {
        mobileMounts(chatInfo.conversationId);
        // Mount-only on purpose: a re-render with new props is not a remount.
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return <div data-testid="mobile-view">{chatInfo.conversationId}</div>;
    },
  };
});

import { InboxRoot } from "./inbox-root";

type InboxPillModule = { InboxPill: () => React.ReactNode };

const Reminder = () => <button type="button">Getting started</button>;

beforeEach(() => {
  inboxState.isListOpen = false;
  inboxState.openChats = [];
  inboxState.minimizedChats = [];
  inboxState.activeChat = null;
  listed.data = undefined;
  mobileMounts.mockReset();
});

describe("InboxRoot dock", () => {
  it("renders leading dock items in the same fixed row, before the inbox pill", () => {
    render(<InboxRoot dockLeading={<Reminder />} />);
    const reminder = screen.getByRole("button", { name: "Getting started" });
    const inbox = screen.getByRole("button", { name: "INBOX" });
    // One shared flex container: they sit side by side and cannot overlap.
    const slot = reminder.closest('[data-slot="dock-leading"]');
    expect(slot?.parentElement).toBe(inbox.parentElement);
    expect(inbox.parentElement).toHaveClass("fixed", "flex");
    expect(
      reminder.compareDocumentPosition(inbox) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("hides the redesigned launcher and still shows an open inbox", () => {
    const { rerender } = render(<InboxRoot showLauncher={false} />);
    expect(screen.queryByRole("button", { name: "INBOX" })).toBeNull();
    inboxState.isListOpen = true;
    rerender(<InboxRoot showLauncher={false} />);
    expect(screen.getByText("inbox list")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "INBOX" })).toBeNull();
  });

  it("steps the leading items aside while the inbox list is open", () => {
    inboxState.isListOpen = true;
    render(<InboxRoot dockLeading={<Reminder />} />);
    expect(
      screen.queryByRole("button", { name: "Getting started" }),
    ).toBeNull();
  });

  it("steps aside while a chat is open", () => {
    inboxState.openChats = ["c1"];
    render(<InboxRoot dockLeading={<Reminder />} />);
    expect(
      screen.queryByRole("button", { name: "Getting started" }),
    ).toBeNull();
  });

  it("steps aside while chats are minimized, so they do not crowd the row", () => {
    inboxState.minimizedChats = ["c1"];
    render(<InboxRoot dockLeading={<Reminder />} />);
    expect(
      screen.queryByRole("button", { name: "Getting started" }),
    ).toBeNull();
  });

  it("keeps the leading item mounted while hidden, so its state survives", () => {
    const mounts = vi.fn();
    function Counted() {
      useEffect(() => {
        mounts();
      }, []);
      return <button type="button">Getting started</button>;
    }
    const { rerender } = render(<InboxRoot dockLeading={<Counted />} />);
    inboxState.isListOpen = true;
    rerender(<InboxRoot dockLeading={<Counted />} />);
    expect(
      screen.queryByRole("button", { name: "Getting started" }),
    ).toBeNull();
    inboxState.isListOpen = false;
    rerender(<InboxRoot dockLeading={<Counted />} />);
    expect(
      screen.getByRole("button", { name: "Getting started" }),
    ).toBeInTheDocument();
    expect(mounts).toHaveBeenCalledTimes(1);
  });

  it("marks the inbox pill as the dock's focus home", async () => {
    const { InboxPill: RealInboxPill } =
      await vi.importActual<InboxPillModule>("./inbox-pill");
    const { container } = render(<RealInboxPill />);
    expect(container.querySelector("[data-dock-home]")).not.toBeNull();
  });

  it("keeps the z-index bump class well-formed when the list is open", () => {
    inboxState.isListOpen = true;
    const { container } = render(<InboxRoot />);
    const dock = container.querySelector(".fixed");
    expect(dock).toHaveClass("sm:right-4", "max-sm:z-60");
  });
});

/** A dm with Bob, the shape `listConversations` gives. */
function dmWithBob(id: string) {
  return {
    id,
    type: "dm",
    isRoom: false,
    title: null,
    agentInfo: null,
    participants: [{ userId: "bob", displayName: "Bob", image: null }],
  };
}

describe("InboxRoot mobile conversation", () => {
  it("starts a fresh conversation view when the open conversation changes", () => {
    listed.data = { conversations: [dmWithBob("a"), dmWithBob("b")] };
    inboxState.activeChat = "a";
    const { rerender } = render(<InboxRoot />);

    inboxState.activeChat = "b";
    rerender(<InboxRoot />);

    // A remount drops anything picked or typed for the first conversation.
    expect(screen.getByTestId("mobile-view")).toHaveTextContent("b");
    expect(mobileMounts.mock.calls).toEqual([["a"], ["b"]]);
  });
});
