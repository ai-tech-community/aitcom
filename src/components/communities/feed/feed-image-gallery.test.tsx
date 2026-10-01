import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string, v?: Record<string, string | number>) =>
    v ? `${k}(${Object.values(v).join(",")})` : k,
}));

import { FeedImageGallery } from "./feed-image-gallery";

const images = [
  { url: "https://s3.test/1.jpg", alt: "Our new office" },
  { url: "https://s3.test/2.jpg", alt: "" },
  { url: "https://s3.test/3.jpg", alt: "The team" },
];

describe("FeedImageGallery", () => {
  it("shows one picture whole, described by its alt text", () => {
    render(<FeedImageGallery images={images.slice(0, 1)} />);
    expect(screen.getByRole("img", { name: "Our new office" })).toBeVisible();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("lays three pictures out with the first one tall, and names unnamed ones", () => {
    render(<FeedImageGallery images={images} />);
    const list = screen.getByRole("list", { name: "pictures(3)" });
    expect(within(list).getAllByRole("listitem")[0]).toHaveClass("row-span-2");
    expect(
      screen.getByRole("button", { name: "openPicture(pictureOf(2,3))" }),
    ).toBeVisible();
  });

  it("opens a large view that moves between pictures with the arrow keys", () => {
    render(<FeedImageGallery images={images} />);
    fireEvent.click(
      screen.getByRole("button", { name: "openPicture(Our new office)" }),
    );
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("1 / 3")).toBeVisible();
    expect(within(dialog).getByText("Our new office")).toBeVisible();
    fireEvent.keyDown(dialog, { key: "ArrowRight" });
    expect(within(dialog).getByText("2 / 3")).toBeVisible();
    expect(within(dialog).getByText("noDescription")).toBeVisible();
    fireEvent.keyDown(dialog, { key: "ArrowLeft" });
    fireEvent.keyDown(dialog, { key: "ArrowLeft" });
    expect(within(dialog).getByText("3 / 3")).toBeVisible();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "closePicture" }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
