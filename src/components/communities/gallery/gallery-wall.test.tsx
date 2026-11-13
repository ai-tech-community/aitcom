import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../../messages/en.json";
import { GalleryWall, GalleryWallSkeleton } from "./gallery-wall";
import { galleryItem } from "./gallery-test-fixtures";

const EVENT = { id: 4, title: "Autumn hack night", slug: "autumn-hack" };

function wall(items: ReturnType<typeof galleryItem>[], showEvent = true) {
  return (
    <NextIntlClientProvider locale="en" messages={en}>
      <GalleryWall items={items} showEvent={showEvent} onOpen={vi.fn()} />
    </NextIntlClientProvider>
  );
}

describe("GalleryWall", () => {
  it("lists one tile per item, in order", () => {
    render(
      wall([
        galleryItem({ id: 1, caption: "First" }),
        galleryItem({ id: 2, caption: "Second" }),
      ]),
    );
    const list = screen.getByRole("list", { name: "Photos and videos" });
    expect(
      within(list)
        .getAllByRole("button")
        .map((b) => b.getAttribute("aria-label")),
    ).toEqual(["First", "Second"]);
  });

  it("sets its columns by its own width, not the screen's", () => {
    render(wall([galleryItem()]));
    const list = screen.getByRole("list");
    expect(list.parentElement).toHaveClass("@container");
    expect(list).toHaveClass("columns-2", "@xl:columns-3", "@4xl:columns-4");
  });

  it("keeps each tile when its signed links change", () => {
    const { rerender } = render(
      wall([galleryItem({ id: 1 }), galleryItem({ id: 2 })]),
    );
    const second = screen.getAllByRole("button")[1]!;
    second.focus();
    rerender(
      wall([
        galleryItem({ id: 1, thumbnailUrl: "https://files.test/1?sig=b" }),
        galleryItem({ id: 2, thumbnailUrl: "https://files.test/2?sig=b" }),
      ]),
    );
    expect(screen.getAllByRole("button")[1]).toBe(second);
    expect(second).toHaveFocus();
  });

  it("passes showEvent on to the tiles", () => {
    render(wall([galleryItem({ event: EVENT })], false));
    expect(screen.queryByText("Autumn hack night")).toBeNull();
  });
});

describe("GalleryWallSkeleton", () => {
  it("is a busy placeholder with a name", () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <GalleryWallSkeleton />
      </NextIntlClientProvider>,
    );
    const status = screen.getByRole("status", {
      name: "Loading photos and videos",
    });
    expect(status).toHaveAttribute("aria-busy", "true");
  });
});
