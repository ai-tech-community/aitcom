import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../../messages/en.json";
import { FeedVideoPlayer } from "./feed-video-player";

let visible: (ratio: number) => void = () => undefined;
const play = vi.fn().mockResolvedValue(undefined);
const pause = vi.fn();

beforeEach(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: (entries: Array<{ intersectionRatio: number }>) => void) {
        visible = (ratio) => cb([{ intersectionRatio: ratio }]);
      }
      observe = vi.fn();
      disconnect = vi.fn();
    },
  );
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: play,
  });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", {
    configurable: true,
    value: pause,
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  play.mockClear();
  pause.mockClear();
});

const video = {
  url: "https://v/1.mp4",
  thumbnailUrl: "https://v/1.jpg",
  durationSeconds: 12,
  width: 720,
  height: 1280,
  visibility: "public" as const,
};

function renderPlayer(
  reducedMotion = false,
  props: Partial<React.ComponentProps<typeof FeedVideoPlayer>> = {},
) {
  vi.stubGlobal("matchMedia", () => ({
    matches: reducedMotion,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <FeedVideoPlayer video={video} {...props} />
    </NextIntlClientProvider>,
  );
}

describe("FeedVideoPlayer", () => {
  it("plays muted when mostly on screen and pauses when scrolled away", () => {
    const { container } = renderPlayer();
    const el = container.querySelector("video")!;
    expect(el.muted).toBe(true);
    act(() => visible(0.7));
    expect(play).toHaveBeenCalled();
    act(() => visible(0.1));
    expect(pause).toHaveBeenCalled();
  });

  it("never autoplays with reduced motion; shows a play button instead", () => {
    renderPlayer(true);
    act(() => visible(1));
    expect(play).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Play video" }));
    expect(play).toHaveBeenCalled();
  });

  it("toggles sound with a labelled button", () => {
    const { container } = renderPlayer();
    fireEvent.click(screen.getByRole("button", { name: "Turn sound on" }));
    expect(container.querySelector("video")!.muted).toBe(false);
    expect(
      screen.getByRole("button", { name: "Turn sound off" }),
    ).toBeInTheDocument();
  });

  it("toggles sound when the video itself is tapped", () => {
    const { container } = renderPlayer();
    const el = container.querySelector("video")!;
    fireEvent.click(el);
    expect(el.muted).toBe(false);
    fireEvent.click(el);
    expect(el.muted).toBe(true);
  });

  it("asks for a fresh link once when playback fails, then shows unavailable", () => {
    const onExpired = vi.fn();
    const { container } = renderPlayer(false, { onExpired });
    const el = container.querySelector("video")!;
    fireEvent.error(el);
    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Video unavailable.")).not.toBeInTheDocument();
    fireEvent.error(el);
    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Video unavailable.")).toBeInTheDocument();
  });

  it("asks again after a refreshed link has loaded (a later expiry)", () => {
    const onExpired = vi.fn();
    const { container } = renderPlayer(false, { onExpired });
    const el = container.querySelector("video")!;
    fireEvent.error(el);
    fireEvent.loadedData(el);
    fireEvent.error(el);
    expect(onExpired).toHaveBeenCalledTimes(2);
  });
});

describe("FeedVideoPlayer play and pause", () => {
  it("lets a reduced-motion viewer play again after scrolling away and back", () => {
    const { container } = renderPlayer(true);
    const el = container.querySelector("video")!;
    fireEvent.click(screen.getByRole("button", { name: "Play video" }));
    fireEvent.play(el);
    expect(play).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "Pause video" }),
    ).toBeInTheDocument();

    act(() => visible(0.1));
    expect(pause).toHaveBeenCalled();
    fireEvent.pause(el);
    act(() => visible(1));
    expect(play).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Play video" }));
    expect(play).toHaveBeenCalledTimes(2);
  });

  it("pauses a playing video with the pause button and stays paused on scroll back", () => {
    const { container } = renderPlayer();
    const el = container.querySelector("video")!;
    act(() => visible(0.7));
    fireEvent.play(el);
    expect(play).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Pause video" }));
    expect(pause).toHaveBeenCalledTimes(1);
    fireEvent.pause(el);
    expect(
      screen.getByRole("button", { name: "Play video" }),
    ).toBeInTheDocument();

    act(() => visible(0.1));
    act(() => visible(0.9));
    expect(play).toHaveBeenCalledTimes(1);
  });
});
