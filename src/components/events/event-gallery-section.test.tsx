import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as ReactQuery from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../messages/en.json";
import { ConfirmProvider } from "@/components/confirm-dialog";
import { galleryItem } from "@/components/communities/gallery/gallery-test-fixtures";
import type { EventGallerySection as Section } from "@/server/gallery/event-section";
import type { GalleryItemView } from "@/server/gallery/items";

import { EventGallerySection } from "./event-gallery-section";

const m = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  deleteCalls: [] as unknown[],
  editProps: vi.fn(),
  invalidateList: vi.fn(),
  invalidateFacets: vi.fn(),
  invalidateItem: vi.fn(),
  removeQueries: vi.fn(),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof ReactQuery>()),
  useQueryClient: () => ({ removeQueries: m.removeQueries }),
}));
vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({
      gallery: {
        list: { invalidate: m.invalidateList },
        facets: { invalidate: m.invalidateFacets },
        item: {
          invalidate: m.invalidateItem,
          queryOptions: (input: unknown) => ({ queryKey: ["item", input] }),
        },
      },
    }),
    topics: { list: { useQuery: () => ({ data: [] }) } },
    gallery: {
      deleteItem: {
        useMutation: (opts: {
          onSuccess?: (data: unknown, input: unknown) => void;
        }) => ({
          isPending: false,
          mutate: (input: unknown) => {
            m.deleteCalls.push(input);
            opts.onSuccess?.(undefined, input);
          },
        }),
      },
    },
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: React.ComponentProps<"a">) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: m.push, refresh: m.refresh }),
  getPathname: ({ href, locale }: { href: string; locale: string }) =>
    `/${locale}${href}`,
}));
vi.mock("@/components/auth/auth-required-dialog", () => ({
  useRequireAuth: () => ({
    requireAuth: m.requireAuth,
    promptAuth: vi.fn(),
    authStatus: "guest",
  }),
}));
vi.mock("@/components/communities/gallery/gallery-edit-dialog", () => ({
  GalleryEditDialog: (props: {
    item: GalleryItemView;
    onSaved?: () => void;
  }) => {
    m.editProps(props);
    return <div data-testid="edit-dialog">{props.item.id}</div>;
  },
}));

function items(count: number, from = 20): GalleryItemView[] {
  return Array.from({ length: count }, (_, index) =>
    galleryItem({ id: from - index, caption: `Photo ${from - index}` }),
  );
}

function section(overrides: Partial<Section> = {}): Section {
  const shown = overrides.items ?? items(3);
  return {
    communitySlug: "runners",
    eventId: 50,
    items: shown,
    total: shown.length,
    viewer: { kind: "member", canModerate: false },
    ...overrides,
  };
}

function renderSection(props: Partial<Section> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <ConfirmProvider>
        <EventGallerySection section={section(props)} />
      </ConfirmProvider>
    </NextIntlClientProvider>,
  );
}

const region = () => screen.getByRole("region", { name: "Photos and videos" });
const ADD = { name: "Add yours" };

beforeEach(() => {
  vi.clearAllMocks();
  m.deleteCalls = [];
});

describe("EventGallerySection", () => {
  it("is a section headed by the house kicker, with the count in mono", () => {
    renderSection({ items: items(6), total: 14 });
    const heading = within(region()).getByRole("heading", { level: 2 });
    expect(heading).toHaveTextContent("/ Photos and videos");
    const count = within(region()).getByText("14 items");
    expect(count).toHaveClass("font-mono", "uppercase");
  });

  it("shows the tiles as square tiles that open the lightbox", () => {
    renderSection({ items: items(6), total: 6 });
    const tiles = within(region()).getAllByRole("button", { name: /^Photo/ });
    expect(tiles.map((tile) => tile.getAttribute("aria-label"))).toEqual([
      "Photo 20",
      "Photo 19",
      "Photo 18",
      "Photo 17",
      "Photo 16",
      "Photo 15",
    ]);
    expect(tiles[0]!.parentElement).toHaveClass("aspect-square");
    fireEvent.click(tiles[1]!);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleName("Photo 19");
    fireEvent.keyDown(dialog, { key: "ArrowRight" });
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Photo 18");
  });

  it("links to the gallery filtered to the event when there are more than six", () => {
    renderSection({ items: items(6), total: 14 });
    expect(
      within(region()).getByRole("link", {
        name: "See all 14 in the gallery",
      }),
    ).toHaveAttribute("href", "/communities/runners/gallery?event=50");
  });

  it("has no See all when every item is shown", () => {
    renderSection({ items: items(6), total: 6 });
    expect(
      within(region()).queryByRole("link", { name: /See all/ }),
    ).toBeNull();
  });

  describe("Add yours", () => {
    it("opens the upload with this event chosen, for a member", () => {
      renderSection();
      const add = within(region()).getByRole("link", ADD);
      expect(add).toHaveAttribute(
        "href",
        "/communities/runners/gallery?upload=1&event=50",
      );
      // The event page keeps its own orange action (One Voice Rule).
      expect(add).toHaveAttribute("data-variant", "ink");
    });

    it("asks a guest to sign in, coming back to the upload for this event", () => {
      renderSection({ viewer: { kind: "guest", canJoin: true } });
      const add = within(region()).getByRole("button", ADD);
      expect(add).toHaveAttribute("data-variant", "ink");
      fireEvent.click(add);
      expect(m.requireAuth).toHaveBeenCalledWith(
        expect.any(Function),
        "Sign in to add your photos and videos",
        { returnTo: "/en/communities/runners/gallery?upload=1&event=50" },
      );
      // Already signed in after all: straight to the upload.
      m.requireAuth.mock.calls[0]![0]();
      expect(m.push).toHaveBeenCalledWith(
        "/communities/runners/gallery?upload=1&event=50",
      );
    });

    it("leads a non-member who may join to the community page", () => {
      renderSection({ viewer: { kind: "outsider", canJoin: true } });
      const add = within(region()).getByRole("link", ADD);
      expect(add).toHaveAttribute("href", "/communities/runners");
      expect(add).toHaveAttribute("data-variant", "ink");
    });

    it("is absent for a non-member who cannot join", () => {
      renderSection({ viewer: { kind: "outsider", canJoin: false } });
      expect(within(region()).queryByRole("link", ADD)).toBeNull();
      expect(within(region()).queryByRole("button", ADD)).toBeNull();
    });

    it("is absent for a guest the community would not let in (invite-only)", () => {
      renderSection({ viewer: { kind: "guest", canJoin: false } });
      expect(within(region()).queryByRole("link", ADD)).toBeNull();
      expect(within(region()).queryByRole("button", ADD)).toBeNull();
      expect(m.requireAuth).not.toHaveBeenCalled();
    });
  });

  it("invites a member to add the first photos when there are none", () => {
    renderSection({ items: [], total: 0 });
    expect(
      within(region()).getByText("Be the first to add photos from this event."),
    ).toBeInTheDocument();
    expect(within(region()).queryByText("0 items")).toBeNull();
    expect(within(region()).getByRole("link", ADD)).toBeInTheDocument();
  });

  it("lets a moderator delete an item, then reloads the page", async () => {
    renderSection({ viewer: { kind: "member", canModerate: true } });
    fireEvent.click(screen.getByRole("button", { name: "Photo 19" }));
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
      expect(m.deleteCalls).toEqual([{ slug: "runners", itemId: 19 }]),
    );
    expect(m.refresh).toHaveBeenCalledTimes(1);
  });

  it("refreshes the gallery's own lists after a delete, like the feed does", async () => {
    const own = galleryItem({ id: 30, caption: "Mine", isOwn: true });
    renderSection({ items: [own], total: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Mine" }));
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
      expect(m.invalidateList).toHaveBeenCalledWith({ slug: "runners" }),
    );
    expect(m.invalidateFacets).toHaveBeenCalledWith({ slug: "runners" });
    expect(m.refresh).toHaveBeenCalledTimes(1);
  });

  it("lets a member edit their own item, then reloads the page", () => {
    const own = galleryItem({ id: 30, caption: "Mine", isOwn: true });
    renderSection({ items: [own], total: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Mine" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Edit details",
      }),
    );
    expect(screen.getByTestId("edit-dialog")).toHaveTextContent("30");
    const props = m.editProps.mock.calls.at(-1)![0] as { onSaved: () => void };
    props.onSaved();
    expect(m.refresh).toHaveBeenCalledTimes(1);
  });

  it("offers Report to a signed-in non-member, but not to a guest", () => {
    const report = { name: "Report" };
    const { unmount } = renderSection({
      viewer: { kind: "outsider", canJoin: true },
    });
    fireEvent.click(within(region()).getByRole("button", { name: "Photo 20" }));
    expect(
      within(screen.getByRole("dialog")).getByRole("button", report),
    ).toBeVisible();
    unmount();
    renderSection({ viewer: { kind: "guest", canJoin: true } });
    fireEvent.click(within(region()).getByRole("button", { name: "Photo 20" }));
    expect(
      within(screen.getByRole("dialog")).queryByRole("button", report),
    ).toBeNull();
  });

  it("offers no edit to someone who is not a member", () => {
    const own = galleryItem({ id: 30, caption: "Mine", isOwn: true });
    renderSection({
      items: [own],
      total: 1,
      viewer: { kind: "outsider", canJoin: true },
    });
    fireEvent.click(screen.getByRole("button", { name: "Mine" }));
    expect(
      within(screen.getByRole("dialog")).queryByRole("button", {
        name: "Edit details",
      }),
    ).toBeNull();
  });
});
