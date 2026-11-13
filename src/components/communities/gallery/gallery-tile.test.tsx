import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../../messages/en.json";
import { GalleryTile } from "./gallery-tile";
import { galleryItem } from "./gallery-test-fixtures";

const EVENT = { id: 4, title: "Autumn hack night", slug: "autumn-hack" };

function renderTile(
  item: ReturnType<typeof galleryItem>,
  props: { showEvent?: boolean; onOpen?: (id: number) => void } = {},
) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <GalleryTile
        item={item}
        showEvent={props.showEvent ?? true}
        onOpen={props.onOpen ?? vi.fn()}
      />
    </NextIntlClientProvider>,
  );
}

describe("GalleryTile", () => {
  it("is a button named by the caption first", () => {
    renderTile(galleryItem({ caption: "Demo time", alt: "People at desks" }));
    expect(screen.getByRole("button", { name: "Demo time" })).toBeVisible();
  });

  it("falls back to the alt text", () => {
    renderTile(galleryItem({ caption: "  ", alt: "People at desks" }));
    expect(
      screen.getByRole("button", { name: "People at desks" }),
    ).toBeVisible();
  });

  it("describes an item with neither from its event and uploader", () => {
    renderTile(galleryItem({ event: EVENT }));
    expect(
      screen.getByRole("button", {
        name: "Photo from Autumn hack night by Ana Lopez",
      }),
    ).toBeVisible();
  });

  it("describes a video without an event by its uploader", () => {
    renderTile(galleryItem({ mediaType: "video", durationSeconds: 42 }));
    expect(
      screen.getByRole("button", { name: "Video by Ana Lopez" }),
    ).toBeVisible();
  });

  it("names a deleted member as the uploader", () => {
    renderTile(galleryItem({ uploader: null }));
    expect(
      screen.getByRole("button", { name: "Photo by Deleted member" }),
    ).toBeVisible();
  });

  it("marks a video with its length, in words for screen readers", () => {
    renderTile(galleryItem({ mediaType: "video", durationSeconds: 65.4 }));
    const tile = screen.getByRole("button");
    expect(tile).toHaveTextContent("1:05");
    expect(tile).toHaveAccessibleDescription("Video, 1:05");
  });

  it("still marks a video whose length is unknown", () => {
    renderTile(galleryItem({ mediaType: "video", durationSeconds: null }));
    expect(screen.getByRole("button")).toHaveAccessibleDescription("Video");
  });

  it("shows no video badge on a photo", () => {
    renderTile(galleryItem());
    expect(screen.getByRole("button")).not.toHaveAccessibleDescription();
    expect(screen.getByRole("button")).not.toHaveTextContent(/\d:\d\d/);
  });

  it("shows the event title only when asked to", () => {
    const item = galleryItem({ event: EVENT, caption: "Demo time" });
    const { unmount } = renderTile(item, { showEvent: true });
    expect(screen.getByText("Autumn hack night")).toBeInTheDocument();
    unmount();
    renderTile(item, { showEvent: false });
    expect(screen.queryByText("Autumn hack night")).toBeNull();
  });

  it("loads the thumbnail as given, past the image optimizer", () => {
    const item = galleryItem({ id: 9 });
    const { container } = renderTile(item);
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      item.thumbnailUrl,
    );
  });

  it("opens its item", () => {
    const onOpen = vi.fn();
    renderTile(galleryItem({ id: 7 }), { onOpen });
    fireEvent.click(screen.getByRole("button"));
    expect(onOpen).toHaveBeenCalledWith(7);
  });
});
