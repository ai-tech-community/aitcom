import { describe, expect, it, vi } from "vitest";

import type { IssueReaderAccess } from "@/lib/magazines/access";
import type { ItemContext } from "../types";
import { articleItemKind } from "./kind";

describe("article card openings", () => {
  it.each<{ access: IssueReaderAccess; label: string }>([
    { access: "teaser", label: "preview readers receive the longer opening" },
    { access: "full", label: "full readers skip the unused longer opening" },
    { access: "editor", label: "builder editor saved views preserve openings" },
  ])("$label", async ({ access }) => {
    const text = Array.from({ length: 100 }, (_, i) => `word${i}`).join(" ");
    const ctx = {
      access,
      magazineId: 1,
      locale: "en",
      payload: {
        find: vi.fn(async () => ({
          docs: [
            {
              id: 2,
              magazine: 1,
              status: "published",
              title: "An article",
              slug: "article",
              content: {
                root: {
                  type: "root",
                  children: [
                    { type: "paragraph", children: [{ type: "text", text }] },
                  ],
                },
              },
            },
          ],
        })),
      },
    } as unknown as ItemContext;
    const views = await articleItemKind.load([{ id: "item", article: 2 }], ctx);
    const view = views.get("item");
    expect(view).toMatchObject({
      article: {
        excerpt: `${text.split(" ").slice(0, 40).join(" ")}…`,
        opening:
          access !== "full" ? `${text.split(" ").slice(0, 80).join(" ")}…` : "",
      },
    });
  });
});
