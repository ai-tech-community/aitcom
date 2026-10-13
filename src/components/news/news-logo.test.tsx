import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NewsLogo } from "./news-logo";

describe("NewsLogo", () => {
  it("shows the image when a logo URL is present", () => {
    render(
      <NewsLogo
        src="https://www.technologyreview.com/static/media/favicon.ico"
        name="MIT Technology Review"
      />,
    );
    expect(
      screen.getByRole("img", { name: "MIT Technology Review" }),
    ).toHaveAttribute(
      "src",
      "https://www.technologyreview.com/static/media/favicon.ico",
    );
  });

  it("renders an initial tile when there is no logo URL", () => {
    render(<NewsLogo src={null} name="MIT Technology Review" />);
    const tile = screen.getByRole("img", { name: "MIT Technology Review" });
    expect(tile).toHaveAttribute("data-news-logo-fallback", "");
    expect(tile).toHaveTextContent("M");
    expect(tile.className).toContain("bg-muted");
    expect(tile.className).toContain("size-5");
  });

  it("switches to the initial tile when the image fails", () => {
    render(
      <NewsLogo
        src="https://www.technologyreview.com/favicon.ico"
        name="The Verge"
      />,
    );
    fireEvent.error(screen.getByRole("img", { name: "The Verge" }));
    expect(screen.getByRole("img", { name: "The Verge" })).toHaveTextContent(
      "T",
    );
  });

  it("uses a newspaper mark when the name has no letter or digit", () => {
    const { container } = render(<NewsLogo src={null} name="—" />);
    expect(container.querySelector("svg")).toBeTruthy();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
