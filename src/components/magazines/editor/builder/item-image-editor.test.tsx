import { act, fireEvent, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { newItemImage, type ItemImage } from "@/lib/magazines/item-image";
import { renderWithIntl } from "../../test-intl";
import { ItemImageEditor } from "./item-image-editor";

const upload = vi.hoisted(() => vi.fn());
const failed = vi.hoisted(() => vi.fn());
vi.mock("@/lib/upload-shared-image", () => ({ uploadSharedImage: upload }));
vi.mock("sonner", () => ({ toast: { error: failed } }));

function Host({
  initial = null,
  onUploadingChange,
}: {
  initial?: ItemImage | null;
  onUploadingChange?: (busy: boolean) => void;
}) {
  const [image, setImage] = useState(initial);
  return (
    <ItemImageEditor
      value={image}
      onChange={setImage}
      sourceImageUrl="https://example.test/source.jpg"
      onUploadingChange={onUploadingChange}
    />
  );
}

beforeEach(() => {
  upload.mockReset();
  failed.mockReset();
});

describe("item image editor", () => {
  it("reuses a source image and previews the crop, caption, credit and alt text", () => {
    renderWithIntl(<Host />);
    fireEvent.click(screen.getByRole("button", { name: "Use article image" }));
    fireEvent.change(screen.getByLabelText("Alt text"), {
      target: { value: "Builders at a workshop" },
    });
    fireEvent.change(screen.getByLabelText("Image shape"), {
      target: { value: "portrait" },
    });
    fireEvent.change(
      screen.getByRole("slider", { name: "Horizontal focal point" }),
      { target: { value: "25" } },
    );
    fireEvent.change(
      screen.getByRole("slider", { name: "Vertical focal point" }),
      { target: { value: "80" } },
    );
    fireEvent.change(screen.getByLabelText("Caption (optional)"), {
      target: { value: "A moment " },
    });
    expect(screen.getByLabelText("Caption (optional)")).toHaveValue(
      "A moment ",
    );
    fireEvent.change(screen.getByLabelText("Caption (optional)"), {
      target: { value: "A moment together." },
    });
    fireEvent.change(screen.getByLabelText("Image credit (optional)"), {
      target: { value: "Photo: Jo" },
    });
    const image = screen.getByRole("img", { name: "Builders at a workshop" });
    expect(image).toHaveAttribute("src", "https://example.test/source.jpg");
    expect(image).toHaveStyle({ objectPosition: "25% 80%" });
    expect(image.parentElement).toHaveStyle({ aspectRatio: "3 / 4" });
    expect(screen.getByText("A moment together.")).toBeVisible();
    expect(screen.getByText("Photo: Jo")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Remove custom image" }),
    );
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByLabelText("Caption (optional)")).toBeNull();
  });

  it("reports upload progress and uses the returned image", async () => {
    let complete!: (url: string) => void;
    upload.mockReturnValue(
      new Promise<string>((resolve) => {
        complete = resolve;
      }),
    );
    const busy = vi.fn();
    const { container } = renderWithIntl(<Host onUploadingChange={busy} />);
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: {
        files: [new File(["image"], "photo.png", { type: "image/png" })],
      },
    });
    expect(busy).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole("button", { name: /Uploading/ })).toBeDisabled();
    await act(async () => complete("https://example.test/uploaded.png"));
    expect(busy).toHaveBeenLastCalledWith(false);
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "https://example.test/uploaded.png",
    );
  });

  it("keeps the previous image when upload fails and clears the busy state", async () => {
    upload.mockRejectedValue(new Error("Unavailable"));
    const busy = vi.fn();
    const { container } = renderWithIntl(
      <Host
        initial={newItemImage("https://example.test/old.jpg")}
        onUploadingChange={busy}
      />,
    );
    await act(async () => {
      fireEvent.change(container.querySelector('input[type="file"]')!, {
        target: {
          files: [new File(["image"], "photo.png", { type: "image/png" })],
        },
      });
    });
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "https://example.test/old.jpg",
    );
    expect(failed).toHaveBeenCalledWith(
      "Could not upload the image. Try again.",
    );
    expect(busy).toHaveBeenLastCalledWith(false);
  });
});
