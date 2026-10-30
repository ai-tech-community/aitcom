import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { LexicalEditor } from "@payloadcms/richtext-lexical/lexical";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { toast } from "sonner";

import { ArticleImageBlock } from "./image-node";

const editor = {
  update(fn: () => void) {
    try {
      fn();
    } catch {
      // The node lookup needs a live editor; the URL state is what we assert.
    }
  },
} as unknown as LexicalEditor;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("ArticleImageBlock upload", () => {
  it("uploads a file through /api/upload and shows the returned URL", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ url: "https://cdn.example/cover.png" })),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <ArticleImageBlock src="" alt="diagram" nodeKey="k1" editor={editor} />,
    );

    const input =
      document.querySelector<HTMLInputElement>('input[type="file"]')!;
    expect(input).toHaveAttribute("accept", "image/*");
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    fireEvent.change(input, {
      target: {
        files: [new File(["png"], "diagram.png", { type: "image/png" })],
      },
    });

    expect(await screen.findByRole("img")).toHaveAttribute(
      "src",
      "https://cdn.example/cover.png",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("textbox", { name: "Image URL" })).toHaveValue(
      "https://cdn.example/cover.png",
    );
  });

  it("rejects a non-image without uploading", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<ArticleImageBlock src="" alt="" nodeKey="k1" editor={editor} />);
    fireEvent.change(
      document.querySelector<HTMLInputElement>('input[type="file"]')!,
      {
        target: {
          files: [new File(["hi"], "notes.txt", { type: "text/plain" })],
        },
      },
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Only images are allowed"),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
