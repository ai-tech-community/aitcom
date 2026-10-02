import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../messages/en.json";
import nl from "../../../messages/nl.json";
import { ConfirmProvider } from "@/components/confirm-dialog";

type Row = {
  id: string;
  title: string;
  content: string;
  readAt: Date | null;
  createdAt: Date;
  metadata: unknown;
};

type ListQuery = {
  data:
    | { pages: { notifications: Row[]; nextCursor: string | null }[] }
    | undefined;
  isPending: boolean;
  isError: boolean;
  refetch: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
};

const state = vi.hoisted(() => ({
  list: undefined as unknown as ListQuery,
  mutate: {
    markRead: vi.fn(),
    markUnread: vi.fn(),
    delete: vi.fn(),
    deleteAll: vi.fn(),
    deleteAllRead: vi.fn(),
  },
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock("@/trpc/react", () => {
  const mutation = (name: keyof typeof state.mutate) => ({
    useMutation: () => ({ mutate: state.mutate[name], isPending: false }),
  });
  return {
    api: {
      useUtils: () => ({
        notifications: {
          list: { invalidate: vi.fn() },
          unreadCount: { invalidate: vi.fn() },
        },
      }),
      notifications: {
        list: { useInfiniteQuery: () => state.list },
        markRead: mutation("markRead"),
        markUnread: mutation("markUnread"),
        delete: mutation("delete"),
        deleteAll: mutation("deleteAll"),
        deleteAllRead: mutation("deleteAllRead"),
      },
    },
  };
});

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { NotificationsList } from "./notifications-list";

const NOW = new Date("2026-10-02T10:00:00.000Z");

const UNREAD: Row = {
  id: "n1",
  title: "Ada replied to your thread",
  content: "Nice idea!",
  readAt: null,
  createdAt: new Date("2026-10-02T08:00:00.000Z"),
  metadata: { reviewPath: "/communities/makers/settings/agent" },
};

const READ: Row = {
  id: "n2",
  title: "Welcome to Makers",
  content: "Say hi.",
  readAt: new Date("2026-10-01T10:00:00.000Z"),
  createdAt: new Date("2026-09-30T10:00:00.000Z"),
  metadata: null,
};

function loaded(rows: Row[]): ListQuery {
  return {
    data: { pages: [{ notifications: rows, nextCursor: null }] },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  };
}

function renderList(locale: "en" | "nl" = "en") {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? en : nl}
      now={NOW}
      timeZone="Europe/Amsterdam"
    >
      <ConfirmProvider>
        <NotificationsList />
      </ConfirmProvider>
    </NextIntlClientProvider>,
  );
}

function rowFor(title: string): HTMLElement {
  return screen.getByText(title).closest<HTMLElement>("li")!;
}

describe("NotificationsList", () => {
  beforeEach(() => {
    for (const fn of Object.values(state.mutate)) fn.mockReset();
  });

  it("shows a skeleton while loading", () => {
    state.list = { ...loaded([]), data: undefined, isPending: true };
    const { container } = renderList();

    expect(
      screen.getByRole("heading", { level: 2, name: /notifications/i }),
    ).toBeTruthy();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it("shows an error with retry, not 'no notifications', when the load fails", () => {
    const refetch = vi.fn();
    state.list = {
      ...loaded([]),
      data: undefined,
      isError: true,
      refetch,
    };
    renderList();

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByText("No notifications yet")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("teaches what shows up here when there is nothing", () => {
    state.list = loaded([]);
    renderList();

    expect(screen.getByText("No notifications yet")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Explore communities" }),
    ).toHaveAttribute("href", "/communities");
  });

  it("marks unread with words, not colour alone, and dates relatively", () => {
    state.list = loaded([UNREAD, READ]);
    renderList();

    expect(within(rowFor(UNREAD.title)).getByText("New")).toBeTruthy();
    expect(within(rowFor(READ.title)).queryByText("New")).toBeNull();
    expect(within(rowFor(UNREAD.title)).getByText("2 hours ago")).toBeTruthy();
    const time = rowFor(READ.title).querySelector("time")!;
    expect(time.getAttribute("dateTime")).toBe(READ.createdAt.toISOString());
  });

  it("keeps row actions reachable by keyboard and on touch", () => {
    state.list = loaded([UNREAD, READ]);
    renderList();

    const unreadRow = rowFor(UNREAD.title);
    const markRead = within(unreadRow).getByRole("button", {
      name: "Mark as read",
    });
    markRead.focus();
    expect(document.activeElement).toBe(markRead);
    // Hidden only until hover or focus; always shown without hover (touch).
    const actions = unreadRow.querySelector(
      '[data-slot="notification-actions"]',
    )!;
    expect(actions.className).toContain("group-focus-within:opacity-100");
    expect(actions.className).toContain("[@media(hover:none)]:opacity-100");

    fireEvent.click(markRead);
    expect(state.mutate.markRead).toHaveBeenCalledWith({ id: "n1" });

    fireEvent.click(
      within(rowFor(READ.title)).getByRole("button", {
        name: "Mark as unread",
      }),
    );
    expect(state.mutate.markUnread).toHaveBeenCalledWith({ id: "n2" });
    fireEvent.click(
      within(rowFor(READ.title)).getByRole("button", { name: "Delete" }),
    );
    expect(state.mutate.delete).toHaveBeenCalledWith({ id: "n2" });
  });

  it("asks before clearing all, and clears only after confirming", async () => {
    state.list = loaded([UNREAD, READ]);
    renderList();

    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Clear all notifications?")).toBeTruthy();
    expect(state.mutate.deleteAll).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Clear" }));
    });
    await waitFor(() =>
      expect(state.mutate.deleteAll).toHaveBeenCalledTimes(1),
    );
  });

  it("keeps everything when clearing all is cancelled", async () => {
    state.list = loaded([UNREAD, READ]);
    renderList();

    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    const dialog = await screen.findByRole("alertdialog");
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    });
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(state.mutate.deleteAll).not.toHaveBeenCalled();
  });

  it("asks before clearing read notifications too", async () => {
    state.list = loaded([UNREAD, READ]);
    renderList();

    fireEvent.click(screen.getByRole("button", { name: "Clear read" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(state.mutate.deleteAllRead).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Clear" }));
    });
    await waitFor(() =>
      expect(state.mutate.deleteAllRead).toHaveBeenCalledTimes(1),
    );
  });

  it("marks a notification read when its review link is followed", () => {
    state.list = loaded([UNREAD]);
    renderList();

    const link = screen.getByRole("link", { name: "Review suggestion" });
    expect(link).toHaveAttribute("href", "/communities/makers/settings/agent");
    fireEvent.click(link);
    expect(state.mutate.markRead).toHaveBeenCalledWith({ id: "n1" });
  });

  it("renders in Dutch", () => {
    state.list = loaded([UNREAD]);
    renderList("nl");

    expect(
      screen.getByRole("button", { name: "Alles als gelezen markeren" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Alles wissen" })).toBeTruthy();
    expect(screen.getByText("Nieuw")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Markeren als gelezen" }),
    ).toBeTruthy();
    expect(screen.getByText("2 uur geleden")).toBeTruthy();
  });
});
