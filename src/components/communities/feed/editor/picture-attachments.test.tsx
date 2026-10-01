import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string, v?: Record<string, string | number>) =>
    v ? `${k}(${Object.values(v).join(",")})` : k,
}));

import { PictureAttachments, type PictureItem } from "./picture-attachments";

function Strip({
  initial,
  onEmptied = vi.fn(),
  onRetry,
}: {
  initial: PictureItem[];
  onEmptied?: () => void;
  onRetry?: (key: string) => void;
}) {
  const [items, setItems] = useState(initial);
  return (
    <PictureAttachments
      items={items}
      onAltChange={(key, alt) =>
        setItems((list) => list.map((i) => (i.key === key ? { ...i, alt } : i)))
      }
      onRemove={(key) => setItems((list) => list.filter((i) => i.key !== key))}
      onRetry={onRetry}
      onEmptied={onEmptied}
    />
  );
}

const item = (key: string, extra: Partial<PictureItem> = {}): PictureItem => ({
  key,
  src: `blob:${key}`,
  alt: "",
  ...extra,
});

describe("PictureAttachments", () => {
  it("moves focus to the next picture, then the previous, then out", () => {
    const onEmptied = vi.fn();
    render(
      <Strip
        initial={[item("a"), item("b"), item("c")]}
        onEmptied={onEmptied}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "removePicture(1)" }));
    // "b" is now picture 1.
    expect(
      screen.getByRole("button", { name: "removePicture(1)" }),
    ).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "removePicture(2)" }));
    expect(
      screen.getByRole("button", { name: "removePicture(1)" }),
    ).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "removePicture(1)" }));
    expect(onEmptied).toHaveBeenCalled();
  });

  it("labels each description, and says which pictures are uploading", () => {
    render(<Strip initial={[item("a", { uploading: true }), item("b")]} />);
    expect(
      screen.getByRole("textbox", { name: "describePictureLabel(1)" }),
    ).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      "picturesUploading(1)",
    );
  });

  it("explains a failed picture and offers a retry, except when it is too large", () => {
    const onRetry = vi.fn();
    render(
      <Strip
        initial={[
          item("a", { failed: "failed" }),
          item("b", { failed: "tooLarge" }),
        ]}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByText("pictureFailed")).toBeVisible();
    expect(screen.getByText("pictureTooLarge")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "retryPicture(1)" }));
    expect(onRetry).toHaveBeenCalledWith("a");
    expect(
      screen.queryByRole("button", { name: "retryPicture(2)" }),
    ).toBeNull();
  });
});
