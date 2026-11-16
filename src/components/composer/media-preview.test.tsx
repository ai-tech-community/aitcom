import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { MediaPreview } from "./media-preview";

function renderPreview(size?: "default" | "compact") {
  render(
    <MediaPreview
      src="https://media.giphy.com/media/abc123/200w_s.gif"
      alt="Party parrot"
      removeLabel="Remove"
      onRemove={vi.fn()}
      size={size}
    />,
  );
  return screen.getByRole("img", { name: "Party parrot" });
}

describe("MediaPreview", () => {
  it("shows the picture at the post composer's size by default", () => {
    const picture = renderPreview();

    expect(picture).toHaveClass("max-h-48");
    expect(picture.closest("[data-slot='media-preview']")).toHaveAttribute(
      "data-size",
      "default",
    );
  });

  it("shows the picture smaller at the compact size", () => {
    const picture = renderPreview("compact");

    expect(picture).toHaveClass("max-h-24");
    expect(picture).not.toHaveClass("max-h-48");
    expect(picture.closest("[data-slot='media-preview']")).toHaveAttribute(
      "data-size",
      "compact",
    );
  });
});
