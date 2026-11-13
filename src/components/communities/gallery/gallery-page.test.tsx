import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSyncExternalStore } from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../../messages/en.json";
import { ConfirmProvider } from "@/components/confirm-dialog";
import type { GalleryFacets, GalleryItemView } from "@/server/gallery/items";
import { GalleryPage } from "./gallery-page";
import { galleryItem } from "./gallery-test-fixtures";

type ListState = {
  isPending: boolean;
  isError: boolean;
  items: GalleryItemView[];
  hasNextPage: boolean;
};

const m = vi.hoisted(() => ({
  search: "",
  listeners: new Set<() => void>(),
  listInputs: [] as unknown[],
  list: null as unknown as ListState,
  refetch: vi.fn(),
  fetchNextPage: vi.fn(),
  facets: undefined as GalleryFacets | undefined,
  itemInputs: [] as unknown[],
  item: undefined as GalleryItemView | undefined,
  itemError: null as null | { message: string; data: { code: string } },
  signedIn: false,
  memberships: [] as { slug: string; status: string; role: string }[],
  requireAuth: vi.fn(),
  invalidateList: vi.fn(),
  invalidateFacets: vi.fn(),
  deleteFails: false,
  toastError: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () =>
    new URLSearchParams(
      useSyncExternalStore(
        (listener) => {
          m.listeners.add(listener);
          return () => m.listeners.delete(listener);
        },
        () => m.search,
      ),
    ),
}));
vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({
      gallery: {
        list: { invalidate: m.invalidateList },
        facets: { invalidate: m.invalidateFacets },
      },
    }),
    gallery: {
      list: {
        useInfiniteQuery: (input: unknown) => {
          m.listInputs.push(input);
          return {
            isPending: m.list.isPending,
            isError: m.list.isError,
            data: m.list.isPending
              ? undefined
              : { pages: [{ items: m.list.items, nextCursor: null }] },
            hasNextPage: m.list.hasNextPage,
            isFetchingNextPage: false,
            isFetchNextPageError: false,
            fetchNextPage: m.fetchNextPage,
            refetch: m.refetch,
          };
        },
      },
      facets: { useQuery: () => ({ data: m.facets }) },
      item: {
        useQuery: (input: unknown, opts: { enabled: boolean }) => {
          if (opts.enabled) m.itemInputs.push(input);
          return {
            data: opts.enabled ? m.item : undefined,
            isError: opts.enabled && m.itemError !== null,
            error: opts.enabled ? m.itemError : null,
          };
        },
      },
      deleteItem: {
        useMutation: (opts: {
          onSuccess?: (data: unknown, input: unknown) => void;
          onError?: (error: unknown, input: unknown) => void;
        }) => ({
          isPending: false,
          mutate: (input: unknown) => {
            if (m.deleteFails) opts.onError?.({ message: "x" }, input);
            else opts.onSuccess?.(undefined, input);
          },
        }),
      },
    },
    topics: {
      list: {
        useQuery: () => ({
          data: [{ id: 1, slug: "meetups", label: "Meetups", emoji: null }],
        }),
      },
    },
    communities: {
      getBySlug: {
        useQuery: () => ({
          data: { name: "MLOps Amsterdam", joinPolicy: "open" },
        }),
      },
      getMyCommunities: {
        useQuery: (_: unknown, opts: { enabled: boolean }) => ({
          data: opts.enabled ? m.memberships : undefined,
          isPending: !opts.enabled,
        }),
      },
    },
  },
}));
vi.mock("@/components/auth/auth-required-dialog", () => ({
  useRequireAuth: () => ({
    requireAuth: m.requireAuth,
    promptAuth: vi.fn(),
    authStatus: m.signedIn ? "authenticated" : "guest",
  }),
}));
vi.mock("../use-community-join", () => ({
  useViewerSignedIn: () => m.signedIn,
}));
vi.mock("../join-button", () => ({
  JoinButton: () => <button type="button">Join community</button>,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: m.toastError },
}));

const PATH = "/en/communities/mlops/gallery";

function setUrl(search: string) {
  window.history.replaceState(null, "", search ? `${PATH}?${search}` : PATH);
}

// Next syncs history.replaceState into useSearchParams; the mock does too.
const realReplaceState = window.history.replaceState.bind(window.history);
const replaceState = vi
  .spyOn(window.history, "replaceState")
  .mockImplementation((data, unused, url) => {
    realReplaceState(data, unused, url);
    m.search = window.location.search.replace(/^\?/, "");
    for (const listener of m.listeners) listener();
  });
const pushState = vi.spyOn(window.history, "pushState");

const FACETS: GalleryFacets = {
  events: [{ id: 4, title: "Autumn hack night", day: "2026-11-02" }],
  topics: ["meetups"],
  hasUnlinked: true,
};

function renderPage() {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <ConfirmProvider>
        <GalleryPage slug="mlops" />
      </ConfirmProvider>
    </NextIntlClientProvider>,
  );
}

function asMember(role = "member") {
  m.signedIn = true;
  m.memberships = [{ slug: "mlops", status: "active", role }];
}

const lastListInput = () => m.listInputs.at(-1);

beforeEach(() => {
  vi.clearAllMocks();
  setUrl("");
  m.listInputs = [];
  m.itemInputs = [];
  m.list = { isPending: false, isError: false, items: [], hasNextPage: false };
  m.facets = FACETS;
  m.item = undefined;
  m.itemError = null;
  m.signedIn = false;
  m.memberships = [];
  m.deleteFails = false;
});

describe("GalleryPage", () => {
  it("opens with the house kicker, the heading and the add action", () => {
    asMember();
    m.list.items = [galleryItem({ id: 1, caption: "One" })];
    renderPage();
    expect(screen.getByText("Gallery")).toBeVisible();
    expect(
      screen.getByRole("heading", { level: 2, name: "Photos and videos" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Add photos and videos" }),
    ).toHaveAttribute("data-variant", "default");
  });

  it("asks for the wall with the filters in the URL", () => {
    setUrl("event=4&topic=meetups&type=video");
    renderPage();
    expect(lastListInput()).toEqual({
      slug: "mlops",
      eventId: 4,
      topicSlug: "meetups",
      mediaType: "video",
      limit: 40,
    });
  });

  it("writes a chosen filter into the URL in place and asks again", () => {
    setUrl("topic=meetups");
    renderPage();
    replaceState.mockClear();
    fireEvent.click(
      within(screen.getByRole("radiogroup", { name: "Type" })).getByRole(
        "radio",
        { name: "Videos" },
      ),
    );
    expect(replaceState).toHaveBeenLastCalledWith(
      null,
      "",
      `${PATH}?topic=meetups&type=video`,
    );
    expect(pushState).not.toHaveBeenCalled();
    expect(lastListInput()).toEqual({
      slug: "mlops",
      topicSlug: "meetups",
      mediaType: "video",
      limit: 40,
    });
  });

  it("clears a category back to all", () => {
    setUrl("topic=meetups");
    renderPage();
    fireEvent.click(
      within(screen.getByRole("radiogroup", { name: "Category" })).getByRole(
        "radio",
        { name: "All" },
      ),
    );
    expect(window.location.search).toBe("");
    expect(lastListInput()).toEqual({ slug: "mlops", limit: 40 });
  });

  it("asks a guest to sign in when they press Add, uploading nothing", () => {
    renderPage();
    fireEvent.click(
      screen.getByRole("button", { name: "Add photos and videos" }),
    );
    expect(m.requireAuth).toHaveBeenCalledWith(
      expect.any(Function),
      "Sign in to add photos and videos",
    );
  });

  it("shows tile placeholders while the wall loads", () => {
    m.list.isPending = true;
    renderPage();
    expect(
      screen.getByRole("status", { name: "Loading photos and videos" }),
    ).toBeVisible();
  });

  it("shows a failed load with a retry", () => {
    m.list.isError = true;
    renderPage();
    expect(screen.getByRole("alert")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(m.refetch).toHaveBeenCalled();
  });

  it("teaches a member to add the first photos on an empty wall", () => {
    asMember();
    renderPage();
    expect(screen.getByText("No photos or videos yet")).toBeVisible();
    expect(
      screen.getByText("Add the first photos from your last event."),
    ).toBeVisible();
    const adds = screen.getAllByRole("button", {
      name: "Add photos and videos",
    });
    // One orange action per screen: the empty state's copy of it is quiet.
    expect(adds.map((b) => b.getAttribute("data-variant"))).toEqual([
      "default",
      "outline",
    ]);
  });

  it("tells a visitor that members see more on an empty wall", () => {
    renderPage();
    expect(screen.getByText("No photos or videos to show yet")).toBeVisible();
  });

  it("offers to clear filters that match nothing", () => {
    setUrl("type=video");
    renderPage();
    expect(screen.getByText("Nothing matches these filters")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Show everything" }));
    expect(window.location.search).toBe("");
  });

  it("loads the next page on request", () => {
    m.list.items = [galleryItem({ id: 1, caption: "One" })];
    m.list.hasNextPage = true;
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(m.fetchNextPage).toHaveBeenCalled();
  });

  it("shows event titles on tiles only while not filtered to one event", () => {
    const item = galleryItem({
      id: 1,
      caption: "One",
      event: { id: 4, title: "Autumn hack night", slug: "autumn-hack" },
    });
    m.list.items = [item];
    const { unmount } = renderPage();
    const tile = screen.getByRole("button", { name: "One" });
    expect(tile).toHaveTextContent("Autumn hack night");
    unmount();
    setUrl("event=4");
    renderPage();
    expect(screen.getByRole("button", { name: "One" })).not.toHaveTextContent(
      "Autumn hack night",
    );
  });

  it("opens a tile in the lightbox and keeps it in the URL", () => {
    m.list.items = [galleryItem({ id: 1, caption: "One" })];
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "One" }));
    expect(screen.getByRole("dialog", { name: "One" })).toBeVisible();
    expect(window.location.search).toBe("?item=1");
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(window.location.search).toBe("");
  });

  it("opens a linked item that is not on the loaded wall", () => {
    m.list.items = [galleryItem({ id: 1, caption: "One" })];
    m.item = galleryItem({ id: 99, caption: "Linked" });
    setUrl("item=99");
    renderPage();
    expect(m.itemInputs).toContainEqual({ slug: "mlops", itemId: 99 });
    expect(screen.getByRole("dialog", { name: "Linked" })).toBeVisible();
  });

  it("does not fetch an item the wall already has", () => {
    m.list.items = [galleryItem({ id: 1, caption: "One" })];
    setUrl("item=1");
    renderPage();
    expect(m.itemInputs).toEqual([]);
    expect(screen.getByRole("dialog", { name: "One" })).toBeVisible();
  });

  it("says so and drops a linked item the viewer cannot open", () => {
    m.itemError = { message: "NOT_FOUND", data: { code: "NOT_FOUND" } };
    setUrl("item=99");
    renderPage();
    expect(m.toastError).toHaveBeenCalledWith(
      "This photo or video is no longer here.",
    );
    expect(window.location.search).toBe("");
  });

  it("calls a failed load of a linked item a failure, not gone", () => {
    m.itemError = {
      message: "INTERNAL_SERVER_ERROR",
      data: { code: "INTERNAL_SERVER_ERROR" },
    };
    setUrl("item=99");
    renderPage();
    expect(m.toastError).toHaveBeenCalledWith(
      "We couldn't open this photo or video. Please try again.",
    );
  });

  it("returns focus to the heading after closing a linked item", async () => {
    m.list.items = [galleryItem({ id: 1, caption: "One" })];
    m.item = galleryItem({ id: 99, caption: "Linked" });
    setUrl("item=99");
    renderPage();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Photos and videos" }),
      ).toHaveFocus(),
    );
  });

  it("lets the lightbox go on into the next page of the wall", () => {
    m.list.items = [galleryItem({ id: 1, caption: "One" })];
    m.list.hasNextPage = true;
    setUrl("item=1");
    renderPage();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowRight" });
    expect(m.fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("lets a moderator delete someone else's item and refreshes the wall", async () => {
    asMember("moderator");
    m.list.items = [galleryItem({ id: 1, caption: "One" })];
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "One" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Delete",
      }),
    );
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Delete",
      }),
    );
    await waitFor(() =>
      expect(m.invalidateList).toHaveBeenCalledWith({ slug: "mlops" }),
    );
    expect(m.invalidateFacets).toHaveBeenCalledWith({ slug: "mlops" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(window.location.search).toBe("");
    // No tile left to return to: focus goes to the heading.
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Photos and videos" }),
      ).toHaveFocus(),
    );
  });

  it("gives a plain member no Delete on someone else's item", () => {
    asMember("member");
    m.list.items = [galleryItem({ id: 1, caption: "One" })];
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "One" }));
    expect(
      within(screen.getByRole("dialog")).queryByRole("button", {
        name: "Delete",
      }),
    ).toBeNull();
  });
});
