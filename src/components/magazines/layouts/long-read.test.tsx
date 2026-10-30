import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { articleView, editorialView } from "../test-fixtures";
import { renderWithIntl } from "../test-intl";
import { itemAnchorId } from "../reading/anchors";
import { LongReadLayout } from "./long-read";
import { LAYOUTS } from "./registry";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const href = (slug: string) => `/magazines/gazette/issue-1/${slug}`;

describe("long-read layout", () => {
  it("renders every item in issue order, one column, as leads", () => {
    const items = [articleView(1), editorialView(2), articleView(3)];
    const { container } = renderWithIntl(
      <LongReadLayout items={items} href={href} teaser={null} />,
    );
    expect(LAYOUTS["long-read"]).toBe(LongReadLayout);
    expect(container.firstElementChild).toHaveClass(
      "max-w-3xl",
      "mx-auto",
      "flex-col",
    );
    expect(screen.getAllByRole("heading").map((h) => h.textContent)).toEqual([
      "Article 1",
      "Editorial 2",
      "Article 3",
    ]);
    for (const item of items)
      expect(
        container.querySelector(`[id="${itemAnchorId(item.itemId)}"]`),
      ).not.toBeNull();
    for (const n of [1, 3]) {
      expect(screen.getByText(`Excerpt of article ${n}.`)).toBeVisible();
      expect(
        screen.getByRole("link", { name: "Article " + n }).closest("h2"),
      ).toHaveClass("text-2xl");
    }
    expect(screen.getAllByRole("link", { name: /Read article/ })).toHaveLength(
      2,
    );
  });

  it("passes the preview prompt to articles", () => {
    renderWithIntl(
      <LongReadLayout
        items={[articleView(1), articleView(2)]}
        href={href}
        teaser={{ inlinePrompt: <button>Join our community</button> }}
      />,
    );
    expect(
      screen.getAllByRole("button", { name: "Join our community" }),
    ).toHaveLength(2);
    for (const n of [1, 2]) {
      expect(screen.getByText(`Opening of article ${n}.`)).toBeVisible();
      expect(screen.queryByText(`Excerpt of article ${n}.`)).toBeNull();
    }
    expect(screen.queryByRole("link", { name: /Read article/ })).toBeNull();
  });
});
