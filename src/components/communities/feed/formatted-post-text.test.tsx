import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: React.ComponentProps<"a">) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { FormattedPostText } from "./formatted-post-text";

describe("FormattedPostText", () => {
  it("shows bold, italic, lists and links, never raw markup", () => {
    const { container } = render(
      <FormattedPostText
        text={
          "**Meetup** on _Friday_\n- talks at https://x.test/talks\n- <b>pizza</b>\n1. arrive"
        }
      />,
    );
    expect(container.querySelector("strong")).toHaveTextContent("Meetup");
    expect(container.querySelector("em")).toHaveTextContent("Friday");
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "https://x.test/talks",
    );
    // Markup a member types is shown as text.
    expect(container.querySelector("b")).toBeNull();
    expect(screen.getByText("<b>pizza</b>")).toBeVisible();
  });
});

describe("FormattedPostText mentions", () => {
  const mentions = [
    { userId: "u-jane", name: "Jane Doe", hasProfile: true },
    { userId: "u-joe", name: "Joe", hasProfile: false },
  ];

  it("links a mention to an open profile, and only names the others", () => {
    render(
      <FormattedPostText
        text={"**Thanks @Jane Doe** and @Joe!\n- @Jane Doe again"}
        mentions={mentions}
      />,
    );
    const links = screen.getAllByRole("link", { name: "@Jane Doe" });
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute("href", "/members/u-jane");
    expect(links[0]!.closest("strong")).not.toBeNull();
    expect(screen.queryByRole("link", { name: "@Joe" })).toBeNull();
    expect(screen.getByText("@Joe").tagName).toBe("SPAN");
  });

  it("never cuts a web link at an @", () => {
    render(
      <FormattedPostText
        text="See https://x.test/@Joe for more"
        mentions={mentions}
      />,
    );
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "https://x.test/@Joe",
    );
  });
});
