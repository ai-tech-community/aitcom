import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const m = vi.hoisted(() => ({ reduce: false }));
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("@/hooks/use-media-query", () => ({ useMediaQuery: () => m.reduce }));

import { FeedGif } from "./feed-gif";

const gif = {
  title: "Party parrot",
  mp4Url: "https://media.giphy.com/a.mp4",
  stillUrl: "https://media.giphy.com/a_s.gif",
  width: 400,
  height: 300,
};

describe("FeedGif", () => {
  it("plays the GIF as a muted loop, named by its title, and pauses on request", () => {
    m.reduce = false;
    render(<FeedGif gif={gif} />);
    const video = screen.getByLabelText("gifBadge: Party parrot");
    expect(video.tagName).toBe("VIDEO");
    expect(video).toHaveAttribute("src", gif.mp4Url);
    fireEvent.click(screen.getByRole("button", { name: "pauseGif" }));
    expect(
      screen.getByRole("img", { name: "gifBadge: Party parrot" }),
    ).toHaveAttribute("src", gif.stillUrl);
  });

  it("stays still for reduced motion until the member plays it", () => {
    m.reduce = true;
    render(<FeedGif gif={gif} />);
    expect(document.querySelector("video")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "playGif" }));
    expect(document.querySelector("video")).not.toBeNull();
  });
});
