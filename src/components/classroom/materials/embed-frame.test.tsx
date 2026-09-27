import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmbedFrame } from "./embed-frame";

describe("EmbedFrame", () => {
  it("renders a sandboxed iframe on the built embed address", () => {
    const { container } = render(
      <EmbedFrame url="https://youtu.be/dQw4w9WgXcQ" />,
    );
    const iframe = container.querySelector("iframe");
    expect(iframe?.getAttribute("src")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
    expect(iframe?.getAttribute("sandbox")).toBe(
      "allow-scripts allow-same-origin allow-presentation allow-popups",
    );
    expect(iframe?.getAttribute("referrerpolicy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(iframe?.getAttribute("loading")).toBe("lazy");
    expect(iframe?.getAttribute("allow")).toBe(
      "fullscreen; picture-in-picture; encrypted-media; clipboard-write",
    );
    expect(iframe?.getAttribute("title")).toBe("YouTube");
  });

  it("uses a page-shaped frame for documents", () => {
    const { container } = render(
      <EmbedFrame url="https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123/edit" />,
    );
    expect(container.firstElementChild?.className).toContain("h-[70vh]");
  });

  it("renders nothing for a link it cannot embed", () => {
    const { container } = render(<EmbedFrame url="https://evil.test/x" />);
    expect(container.innerHTML).toBe("");
  });
});
