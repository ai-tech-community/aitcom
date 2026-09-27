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
vi.mock("@/trpc/react", () => ({
  api: {
    inbox: {
      listConversations: { useQuery: () => ({ data: undefined }) },
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
vi.mock("./inbox-mobile-view", () => ({ InboxMobileView: () => null }));

import { InboxRoot } from "./inbox-root";

const Reminder = () => <button type="button">Getting started</button>;

beforeEach(() => {
  inboxState.isListOpen = false;
  inboxState.openChats = [];
  inboxState.minimizedChats = [];
  inboxState.activeChat = null;
});

describe("InboxRoot dock", () => {
  it("renders leading dock items in the same fixed row, before the inbox pill", () => {
    render(<InboxRoot dockLeading={<Reminder />} />);
    const reminder = screen.getByRole("button", { name: "Getting started" });
    const inbox = screen.getByRole("button", { name: "INBOX" });
    // One shared flex container: they sit side by side and cannot overlap.
    expect(reminder.parentElement).toBe(inbox.parentElement);
    expect(reminder.parentElement).toHaveClass("fixed", "flex");
    expect(
      reminder.compareDocumentPosition(inbox) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
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

  it("keeps the z-index bump class well-formed when the list is open", () => {
    inboxState.isListOpen = true;
    const { container } = render(<InboxRoot />);
    const dock = container.querySelector(".fixed");
    expect(dock).toHaveClass("sm:right-4", "max-sm:z-60");
  });
});
