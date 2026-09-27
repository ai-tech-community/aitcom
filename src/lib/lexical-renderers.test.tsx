import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LexicalRenderer } from "./lexical";

const content = {
  root: {
    children: [
      { type: "paragraph", children: [{ type: "text", text: "hello" }] },
      {
        type: "block",
        fields: { blockType: "Embed", url: "https://youtu.be/dQw4w9WgXcQ" },
      },
      {
        type: "block",
        fields: {
          blockType: "Image",
          src: "https://img.example.test/a.png",
          alt: "diagram",
        },
      },
    ],
  },
};

describe("LexicalRenderer block renderers", () => {
  it("renders nothing for an Embed block when no renderers are passed (forum, launchpad)", () => {
    const { container } = render(<LexicalRenderer content={content} />);
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.textContent).toContain("hello");
  });

  it("hands custom blocks to the matching renderer with their fields", () => {
    const Embed = vi.fn(() => <div data-testid="embed" />);
    const { getByTestId } = render(
      <LexicalRenderer content={content} blockRenderers={{ Embed }} />,
    );
    expect(getByTestId("embed")).toBeTruthy();
    expect(Embed).toHaveBeenCalledWith(
      expect.objectContaining({
        blockType: "Embed",
        url: "https://youtu.be/dQw4w9WgXcQ",
      }),
    );
  });

  it("keeps built-in blocks built-in even if a renderer uses their name", () => {
    // Image is a built-in block that renders synchronously (Code renders via
    // an async server component, which a client test can't mount).
    const Image = vi.fn(() => <div data-testid="custom-image" />);
    const { queryByTestId, container } = render(
      <LexicalRenderer content={content} blockRenderers={{ Image }} />,
    );
    expect(queryByTestId("custom-image")).toBeNull();
    expect(Image).not.toHaveBeenCalled();
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "https://img.example.test/a.png",
    );
  });
});
