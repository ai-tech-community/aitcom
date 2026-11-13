import { beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
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
import type { GalleryItemView } from "@/server/gallery/items";
import { GalleryLightbox } from "./gallery-lightbox";
import { GalleryWall } from "./gallery-wall";
import { galleryItem } from "./gallery-test-fixtures";

const m = vi.hoisted(() => ({
  deleteCalls: [] as unknown[],
  deleteFails: null as null | { message: string; data?: { code: string } },
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/trpc/react", () => ({
  api: {
    topics: {
      list: {
        useQuery: () => ({
          data: [{ id: 1, slug: "meetups", label: "Meetups", emoji: "🍕" }],
        }),
      },
    },
    gallery: {
      deleteItem: {
        useMutation: (opts: {
          onSuccess?: (data: unknown, input: unknown) => void;
          onError?: (error: unknown, input: unknown) => void;
        }) => ({
          isPending: false,
          mutate: (input: unknown) => {
            m.deleteCalls.push(input);
            if (m.deleteFails) opts.onError?.(m.deleteFails, input);
            else opts.onSuccess?.(undefined, input);
          },
        }),
      },
    },
  },
}));
vi.mock("sonner", () => ({
  toast: { success: m.toastSuccess, error: m.toastError },
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

const EVENT = { id: 4, title: "Autumn hack night", slug: "autumn-hack" };

const ITEMS = [
  galleryItem({ id: 1, caption: "Opening talk", alt: "A speaker on stage" }),
  galleryItem({
    id: 2,
    caption: "Demo time",
    event: EVENT,
    topicSlug: "meetups",
    visibility: "public",
    magazineConsent: true,
  }),
  galleryItem({
    id: 3,
    mediaType: "video",
    durationSeconds: 42,
    caption: "Group song",
  }),
];

type HarnessProps = Partial<React.ComponentProps<typeof GalleryLightbox>> & {
  items?: GalleryItemView[];
};

const spies = { onClose: vi.fn(), onDeleted: vi.fn(), onEdit: vi.fn() };

function Harness({ items = ITEMS, ...props }: HarnessProps) {
  const [openId, setOpenId] = useState<number | null>(null);
  return (
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <ConfirmProvider>
        <GalleryWall items={items} showEvent onOpen={setOpenId} />
        <GalleryLightbox
          slug="mlops"
          items={items}
          openId={openId}
          onNavigate={setOpenId}
          onClose={() => {
            spies.onClose();
            setOpenId(null);
          }}
          {...props}
        />
      </ConfirmProvider>
    </NextIntlClientProvider>
  );
}

/** Confirms the delete in the shared confirmation dialog. */
function confirmDelete() {
  fireEvent.click(
    within(screen.getByRole("alertdialog")).getByRole("button", {
      name: "Delete",
    }),
  );
}

function open(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
  return screen.getByRole("dialog");
}

beforeEach(() => {
  m.deleteCalls = [];
  m.deleteFails = null;
  vi.clearAllMocks();
});

describe("GalleryLightbox", () => {
  it("opens as a modal dialog named after the item, showing the full photo", () => {
    render(<Harness />);
    const dialog = open("Opening talk");
    expect(dialog).toHaveAccessibleName("Opening talk");
    expect(
      within(dialog).getByRole("img", { name: "A speaker on stage" }),
    ).toHaveAttribute("src", ITEMS[0]!.url);
  });

  it("plays a video inline with controls and its thumbnail as poster", () => {
    const { baseElement } = render(<Harness />);
    open("Group song");
    const video = baseElement.querySelector("video")!;
    expect(video).toHaveAttribute("src", ITEMS[2]!.url);
    expect(video).toHaveAttribute("poster", ITEMS[2]!.thumbnailUrl);
    expect(video).toHaveAttribute("controls");
    expect(video).toHaveAttribute("playsinline");
  });

  it("moves between items with the arrow keys and the buttons", () => {
    render(<Harness />);
    const dialog = open("Opening talk");
    expect(
      within(dialog).getByRole("button", { name: "Previous" }),
    ).toBeDisabled();
    fireEvent.keyDown(dialog, { key: "ArrowRight" });
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Demo time");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Group song");
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowRight" });
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Group song");
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowLeft" });
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Demo time");
  });

  it("leaves the arrow keys to a playing video", () => {
    const { baseElement } = render(<Harness />);
    open("Group song");
    fireEvent.keyDown(baseElement.querySelector("video")!, {
      key: "ArrowLeft",
    });
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Group song");
  });

  it("closes on Escape and returns focus to the tile of the item it showed", async () => {
    render(<Harness />);
    const dialog = open("Opening talk");
    fireEvent.keyDown(dialog, { key: "ArrowRight" });
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(spies.onClose).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Demo time" })).toHaveFocus(),
    );
  });

  it("closes with the close button", async () => {
    render(<Harness />);
    open("Opening talk");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Opening talk" }),
      ).toHaveFocus(),
    );
  });

  it("lists who added it, the event, category, audience and magazine permission", () => {
    render(<Harness />);
    const dialog = open("Demo time");
    expect(within(dialog).getByText("Ana Lopez")).toBeVisible();
    expect(
      within(dialog).getByRole("link", { name: "Autumn hack night" }),
    ).toHaveAttribute("href", "/events/autumn-hack");
    expect(within(dialog).getByText("🍕 Meetups")).toBeVisible();
    expect(within(dialog).getByText("Everyone")).toBeVisible();
    expect(within(dialog).getByText("Editors may use it")).toBeVisible();
  });

  it("says plainly what an item without those has", () => {
    render(<Harness />);
    const dialog = open("Opening talk");
    expect(within(dialog).getByText("Not from an event")).toBeVisible();
    expect(within(dialog).getByText("None")).toBeVisible();
    expect(within(dialog).getByText("Members only")).toBeVisible();
    expect(within(dialog).getByText("Not for the magazine")).toBeVisible();
    expect(within(dialog).getByText("A speaker on stage")).toBeVisible();
  });

  it("gives the uploader Edit details and Delete", () => {
    const own = [galleryItem({ id: 5, caption: "Mine", isOwn: true })];
    render(<Harness items={own} onEdit={spies.onEdit} />);
    const dialog = open("Mine");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Edit details" }),
    );
    expect(spies.onEdit).toHaveBeenCalledWith(own[0]);
    expect(
      within(dialog).getByRole("button", { name: "Delete" }),
    ).toBeVisible();
  });

  it("gives other members neither", () => {
    render(<Harness onEdit={spies.onEdit} />);
    const dialog = open("Opening talk");
    expect(
      within(dialog).queryByRole("button", { name: "Edit details" }),
    ).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("gives a moderator Delete but not Edit on someone else's item", () => {
    render(<Harness canModerate onEdit={spies.onEdit} />);
    const dialog = open("Opening talk");
    expect(
      within(dialog).queryByRole("button", { name: "Edit details" }),
    ).toBeNull();
    expect(
      within(dialog).getByRole("button", { name: "Delete" }),
    ).toBeVisible();
  });

  it("deletes only after the confirmation, then focuses a neighbour", async () => {
    const own = [
      galleryItem({ id: 5, caption: "Mine", isOwn: true }),
      galleryItem({ id: 6, caption: "Next one" }),
    ];
    render(<Harness items={own} onDeleted={spies.onDeleted} />);
    const dialog = open("Mine");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(
      screen.getByRole("alertdialog", { name: "Delete this photo?" }),
    ).toBeVisible();
    expect(m.deleteCalls).toEqual([]);
    confirmDelete();
    await waitFor(() =>
      expect(m.deleteCalls).toEqual([{ slug: "mlops", itemId: 5 }]),
    );
    expect(spies.onDeleted).toHaveBeenCalledWith(5);
    expect(m.toastSuccess).toHaveBeenCalledWith("Deleted");
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Next one" })).toHaveFocus(),
    );
  });

  it("does nothing when the delete is cancelled", async () => {
    render(<Harness canModerate />);
    open("Opening talk");
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Cancel",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(m.deleteCalls).toEqual([]);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("explains a refused delete in words, never the raw code", async () => {
    m.deleteFails = { message: "NOT_ALLOWED", data: { code: "FORBIDDEN" } };
    render(<Harness canModerate onDeleted={spies.onDeleted} />);
    open("Opening talk");
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    confirmDelete();
    await waitFor(() =>
      expect(m.toastError).toHaveBeenCalledWith(
        "You can't change this photo or video.",
      ),
    );
    expect(spies.onDeleted).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("explains an unknown failure with the general line", async () => {
    m.deleteFails = { message: "connect ECONNREFUSED 10.0.0.1:5432" };
    render(<Harness canModerate />);
    open("Opening talk");
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    confirmDelete();
    await waitFor(() =>
      expect(m.toastError).toHaveBeenCalledWith(
        "We couldn't delete it. Please try again.",
      ),
    );
  });
});
