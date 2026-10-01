import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

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

/** The observer the GIF registers, so a test can scroll it into view. */
let seen: ((ratio: number) => void) | null = null;

beforeEach(() => {
  seen = null;
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(
        callback: (entries: { intersectionRatio: number }[]) => void,
      ) {
        seen = (ratio) => callback([{ intersectionRatio: ratio }]);
      }
      observe = vi.fn();
      disconnect = vi.fn();
    },
  );
  // jsdom cannot play media: playing just fires the element's events.
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    this.dispatchEvent(new Event("play"));
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    this.dispatchEvent(new Event("pause"));
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("FeedGif", () => {
  it("plays only once mostly on screen, muted, and the button follows the video", () => {
    m.reduce = false;
    render(<FeedGif gif={gif} />);
    const video = screen.getByLabelText<HTMLVideoElement>(
      "gifBadge: Party parrot",
    );
    expect(video.tagName).toBe("VIDEO");
    expect(video.muted).toBe(true);
    expect(video).toHaveAttribute("preload", "metadata");
    // Autoplay blocked or off screen: the button offers to play.
    expect(screen.getByRole("button", { name: "playGif" })).toBeVisible();
    act(() => seen?.(0.8));
    expect(screen.getByRole("button", { name: "pauseGif" })).toBeVisible();
    act(() => seen?.(0.2));
    expect(screen.getByRole("button", { name: "playGif" })).toBeVisible();
  });

  it("pauses on request, showing the still frame", () => {
    m.reduce = false;
    render(<FeedGif gif={gif} />);
    act(() => seen?.(1));
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

  it("falls back to the still frame when the video fails, then says it is gone", () => {
    m.reduce = false;
    render(<FeedGif gif={gif} />);
    fireEvent.error(document.querySelector("video")!);
    const still = screen.getByRole("img", { name: "gifBadge: Party parrot" });
    expect(screen.queryByRole("button")).toBeNull();
    fireEvent.error(still);
    expect(screen.getByText("gifGone")).toBeVisible();
  });
});
