import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));

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
