import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const m = vi.hoisted(() => ({ reduce: false }));
// Only the `media` namespace exists, holding only the keys en.json has,
// so a string read from anywhere else fails the render.
vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => {
    if (namespace !== "media") {
      throw new Error(`unexpected namespace "${namespace}"`);
    }
    return (key: string) => {
      if (!(key in en.media)) throw new Error(`unknown key "media.${key}"`);
      return key;
    };
  },
}));
vi.mock("@/hooks/use-media-query", () => ({ useMediaQuery: () => m.reduce }));

import en from "../../../messages/en.json";

import { GifPlayer } from "./gif-player";

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

describe("GifPlayer", () => {
  it("plays only once mostly on screen, muted, and the button follows the video", () => {
    m.reduce = false;
    render(<GifPlayer gif={gif} />);
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
    render(<GifPlayer gif={gif} />);
    act(() => seen?.(1));
    fireEvent.click(screen.getByRole("button", { name: "pauseGif" }));
    expect(
      screen.getByRole("img", { name: "gifBadge: Party parrot" }),
    ).toHaveAttribute("src", gif.stillUrl);
  });

  it("stays still for reduced motion until the member plays it", () => {
    m.reduce = true;
    render(<GifPlayer gif={gif} />);
    expect(document.querySelector("video")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "playGif" }));
    expect(document.querySelector("video")).not.toBeNull();
  });

  it("falls back to the still frame when the video fails, then says it is gone", () => {
    m.reduce = false;
    render(<GifPlayer gif={gif} />);
    fireEvent.error(document.querySelector("video")!);
    const still = screen.getByRole("img", { name: "gifBadge: Party parrot" });
    expect(screen.queryByRole("button")).toBeNull();
    fireEvent.error(still);
    expect(screen.getByText("gifGone")).toBeVisible();
  });

  it("keeps a feed GIF up to the feed's height", () => {
    m.reduce = true;
    render(<GifPlayer gif={gif} />);
    expect(document.querySelector("figure")).toHaveClass("max-h-96");
    expect(screen.getByRole("img")).toHaveClass("max-h-96");
  });

  it("message size caps the height", () => {
    m.reduce = true;
    render(<GifPlayer gif={gif} size="message" />);
    const figure = document.querySelector("figure");
    expect(figure).toHaveClass("max-h-60");
    expect(figure).not.toHaveClass("max-h-96");
    expect(screen.getByRole("img")).toHaveClass("max-h-60");
    fireEvent.click(screen.getByRole("button", { name: "playGif" }));
    const video = document.querySelector("video");
    expect(video).toHaveClass("max-h-60");
    expect(video).not.toHaveClass("max-h-96");
  });
});
