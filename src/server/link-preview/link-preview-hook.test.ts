import { describe, expect, it, vi } from "vitest";

import type { LinkPreviewMeta } from "@/lib/link-preview";
import { linkPreviewBeforeChange } from "./link-preview-hook";

const META: LinkPreviewMeta = {
  title: "Grok Bot Cheatsheet",
  description: "One-page reference",
  imageUrl: "https://cdn.example.com/thumb.img",
  siteName: "Claude",
};
const LINK = "https://claude.ai/artifact/QfGAfn6EPmuJngAgwsZoa9";

type HookArgs = Parameters<ReturnType<typeof linkPreviewBeforeChange>>[0];

function run(
  fetcher: (url: string) => Promise<LinkPreviewMeta | null>,
  data: Record<string, unknown>,
  originalDoc?: Record<string, unknown>,
) {
  const hook = linkPreviewBeforeChange(fetcher);
  return hook({
    data,
    originalDoc,
    operation: originalDoc ? "update" : "create",
  } as unknown as HookArgs) as Promise<Record<string, unknown>>;
}

describe("linkPreviewBeforeChange", () => {
  it("previews the first link of a new post", async () => {
    const fetcher = vi.fn().mockResolvedValue(META);
    const data = await run(fetcher, {
      content: `Grok Bot cheat sheet ${LINK} and https://other.example.com`,
    });
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(LINK);
    expect(data.linkPreview).toEqual({ url: LINK, hidden: false, ...META });
  });

  it("stores the URL alone when the page gives nothing", async () => {
    const data = await run(vi.fn().mockResolvedValue(null), {
      content: `see ${LINK}`,
    });
    expect(data.linkPreview).toEqual({
      url: LINK,
      hidden: false,
      title: null,
      description: null,
      imageUrl: null,
      siteName: null,
    });
  });

  it("does not fetch for a post without a link", async () => {
    const fetcher = vi.fn();
    const data = await run(fetcher, { content: "just words" });
    expect(fetcher).not.toHaveBeenCalled();
    expect(data.linkPreview).toBeUndefined();
  });

  it("does not refetch when an edit keeps the same link", async () => {
    const fetcher = vi.fn();
    const data = await run(
      fetcher,
      { content: `new words ${LINK}` },
      { content: `old words ${LINK}`, linkPreview: { url: LINK, ...META } },
    );
    expect(fetcher).not.toHaveBeenCalled();
    expect(data.linkPreview).toBeUndefined();
  });

  it("does not fetch on an update that leaves content alone", async () => {
    const fetcher = vi.fn();
    await run(
      fetcher,
      { likeCount: 3 },
      { content: `x ${LINK}`, linkPreview: { url: LINK, ...META } },
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("refetches when an edit changes the link", async () => {
    const fetcher = vi.fn().mockResolvedValue(META);
    const data = await run(
      fetcher,
      { content: "now https://new.example.com/page" },
      { content: `x ${LINK}`, linkPreview: { url: LINK, ...META } },
    );
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(
      "https://new.example.com/page",
    );
    expect(data.linkPreview).toMatchObject({
      url: "https://new.example.com/page",
    });
  });

  it("clears the preview when an edit removes the link", async () => {
    const data = await run(
      vi.fn(),
      { content: "no link any more" },
      { content: `x ${LINK}`, linkPreview: { url: LINK, ...META } },
    );
    expect(data.linkPreview).toEqual({
      url: null,
      hidden: false,
      title: null,
      description: null,
      imageUrl: null,
      siteName: null,
    });
  });

  it("shows the preview again when an edit brings a new link", async () => {
    const data = await run(
      vi.fn().mockResolvedValue(META),
      { content: "now https://new.example.com/page" },
      {
        content: `x ${LINK}`,
        linkPreview: { url: LINK, hidden: true, ...META },
      },
    );
    expect(data.linkPreview).toMatchObject({
      url: "https://new.example.com/page",
      hidden: false,
    });
  });
});
