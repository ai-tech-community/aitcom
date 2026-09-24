import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../../messages/en.json";
import { FRESH_LINK_SETTLE_MS, FeedVideoPlayer } from "./feed-video-player";

let visible: (ratio: number) => void = () => undefined;
const play = vi.fn().mockResolvedValue(undefined);
const pause = vi.fn();
const load = vi.fn();

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
  Object.defineProperty(HTMLMediaElement.prototype, "load", {
    configurable: true,
    value: load,
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  play.mockClear();
  pause.mockClear();
  load.mockClear();
});

const video = {
  url: "https://v/1.mp4",
  thumbnailUrl: "https://v/1.jpg",
  durationSeconds: 12,
  width: 720,
  height: 1280,
  visibility: "community" as const,
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
    const onExpired = vi.fn().mockResolvedValue(true);
    const { container } = renderPlayer(false, { onExpired });
    const el = container.querySelector("video")!;
    fireEvent.error(el);
    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Video unavailable.")).not.toBeInTheDocument();
    fireEvent.error(el);
    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Video unavailable.")).toBeInTheDocument();
  });

  it("shows unavailable when the caller says no fresh link is coming", async () => {
    const onExpired = vi.fn().mockResolvedValue(false);
    const { container } = renderPlayer(false, { onExpired });
    fireEvent.error(container.querySelector("video")!);
    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Video unavailable.")).toBeInTheDocument();
  });

  it("shows unavailable when asking for a fresh link fails", async () => {
    const onExpired = vi.fn().mockRejectedValue(new Error("offline"));
    const { container } = renderPlayer(false, { onExpired });
    fireEvent.error(container.querySelector("video")!);
    expect(await screen.findByText("Video unavailable.")).toBeInTheDocument();
  });

  it("waits for the new link when the caller says one is coming", async () => {
    const onExpired = vi.fn().mockResolvedValue(true);
    const { container } = renderPlayer(false, { onExpired });
    fireEvent.error(container.querySelector("video")!);
    await act(async () => undefined);
    expect(screen.queryByText("Video unavailable.")).not.toBeInTheDocument();
  });

  it("shows unavailable when the refreshed link is the same as the failed one", async () => {
    // Private links are stable within a signing window, so a load error that
    // is not an expiry (network drop, 5xx) gets the same URL back. Nothing
    // reloads and no second error fires: the player must not stay blank.
    vi.useFakeTimers();
    const onExpired = vi.fn().mockResolvedValue(true);
    const { container } = renderPlayer(false, { onExpired });
    fireEvent.error(container.querySelector("video")!);
    await act(async () => undefined);
    expect(screen.queryByText("Video unavailable.")).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(FRESH_LINK_SETTLE_MS);
    });
    expect(screen.getByText("Video unavailable.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  it("plays the new link when the refresh brings a different one", async () => {
    vi.useFakeTimers();
    const onExpired = vi.fn().mockResolvedValue(true);
    const view = renderPlayer(false, { onExpired });
    fireEvent.error(view.container.querySelector("video")!);
    await act(async () => undefined);
    view.rerender(
      <NextIntlClientProvider locale="en" messages={en}>
        <FeedVideoPlayer
          video={{ ...video, url: "https://v/1-fresh.mp4" }}
          onExpired={onExpired}
        />
      </NextIntlClientProvider>,
    );
    act(() => {
      vi.advanceTimersByTime(FRESH_LINK_SETTLE_MS);
    });
    expect(screen.queryByText("Video unavailable.")).not.toBeInTheDocument();
    expect(view.container.querySelector("video")).toHaveAttribute(
      "src",
      "https://v/1-fresh.mp4",
    );
  });

  it("Try again after an unchanged link really reloads the video", async () => {
    vi.useFakeTimers();
    const onExpired = vi.fn().mockResolvedValue(false);
    const { container } = renderPlayer(false, { onExpired });
    fireEvent.error(container.querySelector("video")!);
    await act(async () => undefined);
    expect(screen.getByText("Video unavailable.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(load).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Video unavailable.")).not.toBeInTheDocument();
  });

  it("shows unavailable at once for a public video (its link never changes)", () => {
    const onExpired = vi.fn().mockResolvedValue(true);
    const { container } = renderPlayer(false, {
      onExpired,
      video: { ...video, visibility: "public" },
    });
    fireEvent.error(container.querySelector("video")!);
    expect(onExpired).not.toHaveBeenCalled();
    expect(screen.getByText("Video unavailable.")).toBeInTheDocument();
  });

  it("tries again from unavailable: reloads and may ask for a fresh link once more", () => {
    const onExpired = vi.fn().mockResolvedValue(true);
    const { container } = renderPlayer(false, { onExpired });
    const el = container.querySelector("video")!;
    fireEvent.error(el);
    fireEvent.error(el);
    expect(screen.getByText("Video unavailable.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.queryByText("Video unavailable.")).not.toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(1);

    fireEvent.error(el);
    expect(onExpired).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("Video unavailable.")).not.toBeInTheDocument();
  });

  it("asks again after a refreshed link has loaded (a later expiry)", () => {
    const onExpired = vi.fn().mockResolvedValue(true);
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

  it("fetches only metadata by default and buffers ahead when asked", () => {
    const { container, unmount } = renderPlayer();
    expect(container.querySelector("video")).toHaveAttribute(
      "preload",
      "metadata",
    );
    unmount();
    const ahead = renderPlayer(false, { preload: "auto" });
    expect(ahead.container.querySelector("video")).toHaveAttribute(
      "preload",
      "auto",
    );
  });
});
