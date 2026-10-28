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

describe("LexicalRenderer admonitions, links and empty paragraphs", () => {
  it("renders a link inside an info callout as a link, in readable text", () => {
    const { container, getByRole } = render(
      <LexicalRenderer
        content={{
          root: {
            children: [
              {
                type: "paragraph",
                children: [
                  { type: "text", text: "[!INFO] Read the " },
                  {
                    type: "link",
                    url: "https://example.com/docs",
                    children: [{ type: "text", text: "docs" }],
                  },
                  { type: "text", text: " first." },
                ],
              },
              {
                type: "paragraph",
                children: [
                  { type: "text", text: "A normal " },
                  {
                    type: "link",
                    fields: { url: "https://example.com/more", newTab: true },
                    children: [{ type: "text", text: "paragraph link" }],
                  },
                ],
              },
            ],
          },
        }}
      />,
    );
    const callout = container.querySelector("[data-admonition='INFO']");
    expect(callout).not.toBeNull();
    expect(callout?.className).toMatch(/text-foreground/);
    expect(callout?.className).not.toMatch(/text-(blue|orange|green|zinc)-100/);
    const docs = getByRole("link", { name: "docs" });
    expect(docs).toHaveAttribute("href", "https://example.com/docs");
    expect(callout).toContainElement(docs);
    expect(callout).toHaveTextContent("Read the docs first.");
    expect(getByRole("link", { name: "paragraph link" })).toHaveAttribute(
      "href",
      "https://example.com/more",
    );
  });

  it("omits empty paragraphs that only pad a block and keeps a blank line in the prose", () => {
    const { container } = render(
      <LexicalRenderer
        content={{
          root: {
            children: [
              {
                type: "paragraph",
                children: [{ type: "text", text: "Before" }],
              },
              { type: "paragraph", children: [] },
              {
                type: "paragraph",
                children: [{ type: "text", text: "Still before" }],
              },
              { type: "paragraph", children: [{ type: "text", text: " " }] },
              {
                type: "image",
                src: "https://img.example.test/a.png",
                alt: "diagram",
              },
              { type: "paragraph", children: [] },
              {
                type: "paragraph",
                children: [{ type: "text", text: "After" }],
              },
            ],
          },
        }}
      />,
    );
    const paragraphs = [...container.querySelectorAll("p")].map(
      (p) => p.textContent,
    );
    expect(paragraphs).toEqual(["Before", "", "Still before", "After"]);
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "https://img.example.test/a.png",
    );
  });
});

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
