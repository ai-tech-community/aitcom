import { beforeEach, describe, expect, it, vi } from "vitest";
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
import type { FeedGalleryView } from "@/server/gallery/feed-view";
import type { GalleryItemView } from "@/server/gallery/items";
import { GalleryCollage } from "./gallery-collage";
import { galleryItem } from "./gallery-test-fixtures";

type Page = { items: GalleryItemView[]; nextCursor: number | null };

const m = vi.hoisted(() => ({
  listInput: null as unknown,
  listOptions: null as null | Record<string, unknown>,
  pages: undefined as undefined | Page[],
  hasNextPage: false,
  fetchNextPage: vi.fn(),
  deleteCalls: [] as unknown[],
  invalidateList: vi.fn(),
  invalidateFacets: vi.fn(),
  invalidateItem: vi.fn(),
  editProps: vi.fn(),
}));

vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({
      gallery: {
        list: { invalidate: m.invalidateList },
        facets: { invalidate: m.invalidateFacets },
        item: { invalidate: m.invalidateItem },
      },
    }),
    topics: {
      list: {
        useQuery: () => ({
          data: [{ id: 1, slug: "meetups", label: "Meetups", emoji: "🍕" }],
        }),
      },
    },
    gallery: {
      list: {
        useInfiniteQuery: (
          input: unknown,
          options: Record<string, unknown>,
        ) => {
          m.listInput = input;
          m.listOptions = options;
          return {
            data: m.pages ? { pages: m.pages } : undefined,
            hasNextPage: m.hasNextPage,
            isFetchingNextPage: false,
            isFetchNextPageError: false,
            fetchNextPage: m.fetchNextPage,
          };
        },
      },
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
}));
vi.mock("./gallery-report-dialog", () => ({
  GalleryReportDialog: (props: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onReported: () => void;
  }) =>
    props.open ? (
      <button
        type="button"
        onClick={() => {
          props.onReported();
          props.onOpenChange(false);
        }}
      >
        Reported
      </button>
    ) : null,
}));
vi.mock("./gallery-edit-dialog", () => ({
  GalleryEditDialog: (props: { item: GalleryItemView }) => {
    m.editProps(props);
    return <div data-testid="edit-dialog">{props.item.id}</div>;
  },
}));

const EVENT = { id: 4, title: "Autumn hack night", slug: "autumn-hack" };

/** Items newest first, as the feed sends them. */
function items(count: number, from = 10): GalleryItemView[] {
  return Array.from({ length: count }, (_, index) =>
    galleryItem({
      id: from - index,
      caption: `Photo ${from - index}`,
      batchId: 3,
    }),
  );
}

function gallery(overrides: Partial<FeedGalleryView> = {}): FeedGalleryView {
  const shown = overrides.items ?? items(3);
  return {
    batchId: 3,
    items: shown,
    total: shown.length,
    event: null,
    topicSlug: null,
    ...overrides,
  };
}

const onChange = vi.fn();

function Collage(
  props: Partial<React.ComponentProps<typeof GalleryCollage>> & {
    copies?: number;
  },
) {
  const { copies = 1, ...rest } = props;
  return (
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <ConfirmProvider>
        {Array.from({ length: copies }, (_, index) => (
          <section key={index} aria-label={`Copy ${index + 1}`}>
            <GalleryCollage
              slug="mlops"
              gallery={gallery()}
              onChange={onChange}
              {...rest}
            />
          </section>
        ))}
      </ConfirmProvider>
    </NextIntlClientProvider>
  );
}

function collage(name: string | RegExp = /photos and videos from the gallery/) {
  return screen.getByRole("group", { name });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.listInput = null;
  m.listOptions = null;
  m.pages = undefined;
  m.hasNextPage = false;
  m.deleteCalls = [];
});

describe("GalleryCollage", () => {
  it("shows a single item on its own, across the whole collage", () => {
    render(<Collage gallery={gallery({ items: items(1) })} />);
    const group = screen.getByRole("group", {
      name: "One photo or video from the gallery",
    });
    const tiles = within(group).getAllByRole("button");
    expect(tiles).toHaveLength(1);
    expect(tiles[0]).toHaveClass("col-span-2");
  });

  it("puts a second item beside the first, full height", () => {
    render(<Collage gallery={gallery({ items: items(2) })} />);
    const group = collage("2 photos and videos from the gallery");
    const tiles = within(group).getAllByRole("button");
    expect(tiles.map((tile) => tile.getAttribute("aria-label"))).toEqual([
      "Photo 10",
      "Photo 9",
    ]);
    expect(tiles[0]).not.toHaveClass("col-span-2");
    expect(tiles[1]!.parentElement).toHaveClass("grid-rows-1");
  });

  it("fills the collage's cells instead of keeping each item's shape", () => {
    render(<Collage />);
    for (const tile of within(collage()).getAllByRole("button")) {
      expect(tile.style.getPropertyValue("--tile-ratio")).toBe("");
      expect(tile).toHaveClass("h-full");
    }
  });

  it("shows where focus is when it falls back to the collage itself", () => {
    render(<Collage />);
    const group = collage();
    expect(group).toHaveAttribute("tabindex", "-1");
    expect(group).toHaveClass("focus-visible:ring-[3px]");
  });

  it("shows three items as one large and two small, with no count", () => {
    render(<Collage />);
    const group = collage("3 photos and videos from the gallery");
    const tiles = within(group).getAllByRole("button");
    expect(tiles.map((tile) => tile.getAttribute("aria-label"))).toEqual([
      "Photo 10",
      "Photo 9",
      "Photo 8",
    ]);
    expect(tiles[1]!.parentElement).toHaveClass("grid-rows-2");
    expect(within(group).queryByText(/^\+/)).toBeNull();
  });

  it("marks the third tile with how many more the batch has", () => {
    render(<Collage gallery={gallery({ total: 5 })} />);
    const group = collage("5 photos and videos from the gallery");
    const tiles = within(group).getAllByRole("button");
    expect(tiles).toHaveLength(3);
    const more = within(group).getByText("+2");
    // A visual count on the third tile; the group's name says the total.
    expect(more).toHaveAttribute("aria-hidden", "true");
    expect(more.parentElement).toContainElement(tiles[2]!);
  });

  it("badges a video with its length", () => {
    const video = galleryItem({
      id: 20,
      mediaType: "video",
      durationSeconds: 42,
      caption: "Group song",
    });
    render(<Collage gallery={gallery({ items: [video, ...items(2)] })} />);
    expect(
      screen.getByRole("button", { name: "Group song" }),
    ).toHaveAccessibleDescription("Video, 0:42");
  });

  it("links the batch's event and shows its category", () => {
    render(
      <Collage gallery={gallery({ event: EVENT, topicSlug: "meetups" })} />,
    );
    expect(
      screen.getByRole("link", { name: "Autumn hack night" }),
    ).toHaveAttribute("href", "/events/autumn-hack");
    expect(screen.getByText("🍕 Meetups")).toBeInTheDocument();
  });

  it("shows neither chip for a batch without an event or category", () => {
    render(<Collage />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByText("🍕 Meetups")).toBeNull();
  });

  it("opens the lightbox over the batch at the tile clicked", () => {
    render(<Collage />);
    fireEvent.click(screen.getByRole("button", { name: "Photo 9" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleName("Photo 9");
    fireEvent.keyDown(dialog, { key: "ArrowRight" });
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Photo 8");
    // Nothing more to load for a batch the collage shows whole.
    expect(m.fetchNextPage).not.toHaveBeenCalled();
  });

  it("pages through the rest of the batch after the collage's items", () => {
    m.hasNextPage = true;
    const { rerender } = render(<Collage gallery={gallery({ total: 5 })} />);
    expect(m.listInput).toEqual({ slug: "mlops", batchId: 3 });
    // The rest starts after the collage's last item, and only on demand.
    expect(m.listOptions).toMatchObject({ initialCursor: 8, enabled: false });

    fireEvent.click(screen.getByRole("button", { name: "Photo 8" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowRight" });
    expect(m.fetchNextPage).toHaveBeenCalledTimes(1);

    m.pages = [{ items: items(2, 7), nextCursor: null }];
    m.hasNextPage = false;
    rerender(<Collage gallery={gallery({ total: 5 })} />);
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Photo 7");
    // Loaded pages stay fresh when an item is edited or deleted.
    expect(m.listOptions).toMatchObject({ enabled: true });
  });

  it("returns focus to the tile it showed, in the copy that opened it", async () => {
    render(<Collage copies={2} />);
    const second = screen.getByRole("region", { name: "Copy 2" });
    fireEvent.click(within(second).getByRole("button", { name: "Photo 10" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowRight" });
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() =>
      expect(
        within(second).getByRole("button", { name: "Photo 9" }),
      ).toHaveFocus(),
    );
  });

  it("returns focus to the opening tile after showing an item past the collage", async () => {
    m.hasNextPage = true;
    m.pages = [{ items: items(2, 7), nextCursor: null }];
    render(<Collage copies={2} gallery={gallery({ total: 5 })} />);
    const second = screen.getByRole("region", { name: "Copy 2" });
    fireEvent.click(within(second).getByRole("button", { name: "Photo 8" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowRight" });
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Photo 7");
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() =>
      expect(
        within(second).getByRole("button", { name: "Photo 8" }),
      ).toHaveFocus(),
    );
  });

  it("lets a moderator delete an item, then reloads the post", async () => {
    render(<Collage memberRole="moderator" />);
    fireEvent.click(screen.getByRole("button", { name: "Photo 9" }));
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
      expect(m.deleteCalls).toEqual([{ slug: "mlops", itemId: 9 }]),
    );
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(m.invalidateList).toHaveBeenCalledWith({ slug: "mlops" });
    expect(m.invalidateFacets).toHaveBeenCalledWith({ slug: "mlops" });
    expect(m.invalidateItem).toHaveBeenCalledWith({ slug: "mlops", itemId: 9 });
  });

  it("lets a member edit their own item, then reloads the post", () => {
    const own = galleryItem({ id: 30, caption: "Mine", isOwn: true });
    render(<Collage memberRole="member" gallery={gallery({ items: [own] })} />);
    fireEvent.click(screen.getByRole("button", { name: "Mine" }));
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("button", { name: "Delete" }),
    ).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Edit details" }),
    );
    expect(screen.getByTestId("edit-dialog")).toHaveTextContent("30");
    const props = m.editProps.mock.calls.at(-1)![0] as {
      slug: string;
      onSaved: () => void;
    };
    expect(props.slug).toBe("mlops");
    props.onSaved();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("lets someone signed in report an item, then reloads the post", async () => {
    render(<Collage memberRole={null} signedIn />);
    fireEvent.click(screen.getByRole("button", { name: "Photo 9" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Report",
      }),
    );
    // A stand-in outside the modal lightbox: found by its text.
    fireEvent.click(screen.getByText("Reported"));
    expect(m.invalidateList).toHaveBeenCalledWith({ slug: "mlops" });
    expect(m.invalidateFacets).toHaveBeenCalledWith({ slug: "mlops" });
    expect(m.invalidateItem).toHaveBeenCalledWith({ slug: "mlops", itemId: 9 });
    expect(onChange).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("offers no Report to someone signed out", () => {
    render(<Collage memberRole={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Photo 9" }));
    expect(
      within(screen.getByRole("dialog")).queryByRole("button", {
        name: "Report",
      }),
    ).toBeNull();
  });

  it("offers neither edit nor delete to someone who is not a member", () => {
    render(<Collage memberRole={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Photo 9" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByRole("button", { name: "Delete" })).toBeNull();
    expect(
      within(dialog).queryByRole("button", { name: "Edit details" }),
    ).toBeNull();
  });
});
