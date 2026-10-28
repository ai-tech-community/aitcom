import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { articleView, editorialView } from "../test-fixtures";
import { renderWithIntl } from "../test-intl";
import { itemAnchorId } from "../reading/anchors";
import { DigestLayout } from "./digest";
import { LAYOUTS } from "./registry";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const href = (slug: string) => `/magazines/gazette/issue-1/${slug}`;

describe("digest layout", () => {
  it("renders an ordered list of rows with anchors", () => {
    renderWithIntl(
      <DigestLayout
        items={[
          articleView(1, { imageUrl: "https://example.test/cover.png" }),
          editorialView(2),
        ]}
        href={href}
        teaser={null}
      />,
    );
    expect(LAYOUTS.digest).toBe(DigestLayout);
    const list = screen.getByRole("list");
    expect(list.tagName).toBe("OL");
    expect(list).toHaveClass("divide-y", "divide-border");
    const rows = within(list).getAllByRole("listitem");
    expect(rows.map((row) => row.id)).toEqual([
      itemAnchorId("article-1"),
      itemAnchorId("editorial-2"),
    ]);
    expect(rows.map((row) => row.firstElementChild?.textContent)).toEqual([
      "01",
      "02",
    ]);
    expect(rows[0]?.firstElementChild).toHaveAttribute("aria-hidden", "true");
    expect(
      within(rows[0]!).getByRole("link", { name: "Article 1" }),
    ).toHaveAttribute("href", "/magazines/gazette/issue-1/article-1");
    expect(within(rows[1]!).getByText("Editorial 2")).toBeVisible();
    expect(list.querySelector("img")).toBeNull();
    expect(screen.queryByText("Excerpt of article 1.")).toBeNull();
    expect(screen.queryByText("Body of editorial 2.")).toBeNull();
  });

  it("a preview row says members read the whole article and has no button", () => {
    renderWithIntl(
      <DigestLayout
        items={[articleView(1)]}
        href={href}
        teaser={{ inlinePrompt: <button>Join our community</button> }}
      />,
    );
    expect(screen.getByText("Members read the whole article")).toHaveClass(
      "text-muted-foreground",
    );
    expect(screen.getByRole("link", { name: "Article 1" })).toBeVisible();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText("Opening of article 1.")).toBeNull();
    expect(screen.queryByRole("link", { name: /Read article/ })).toBeNull();
  });
});
