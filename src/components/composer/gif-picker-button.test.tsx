import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const m = vi.hoisted(() => ({
  calls: [] as unknown[],
  result: {} as Record<string, unknown>,
  reduce: false,
}));

// Only the `composer` namespace exists, holding only the keys en.json has,
// so a string read from anywhere else fails the render.
vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => {
    if (namespace !== "composer") {
      throw new Error(`unexpected namespace "${namespace}"`);
    }
    return (key: string) => {
      if (!(key in en.composer)) {
        throw new Error(`unknown key "composer.${key}"`);
      }
      return key;
    };
  },
  useLocale: () => "nl",
}));
vi.mock("@/hooks/use-media-query", () => ({ useMediaQuery: () => m.reduce }));
vi.mock("@/trpc/react", () => ({
  api: {
    gifs: {
      search: {
        useInfiniteQuery: (input: unknown) => {
          m.calls.push(input);
          return m.result;
        },
      },
    },
  },
}));

import en from "../../../messages/en.json";
import { TooltipProvider } from "@/components/ui/tooltip";

import { GifPickerButton } from "./gif-picker-button";

const gif = (id: string) => ({
  giphyId: id,
  title: `Title ${id}`,
  mp4Url: `https://media.giphy.com/${id}.mp4`,
  stillUrl: `https://media.giphy.com/${id}_s.gif`,
  width: 400,
  height: 300,
  preview: {
    mp4Url: `https://media.giphy.com/${id}_200.mp4`,
    stillUrl: `https://media.giphy.com/${id}_200_s.gif`,
    width: 200,
    height: 150,
  },
});

function loaded(ids: string[], more = false) {
  return {
    isPending: false,
    isError: false,
    data: { pages: [{ gifs: ids.map(gif), nextCursor: more ? 24 : null }] },
    hasNextPage: more,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  };
}

function open(onPick = vi.fn()) {
  render(
    <TooltipProvider>
      <GifPickerButton onPick={onPick} />
    </TooltipProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "gif" }));
  return onPick;
}

beforeEach(() => {
  vi.useFakeTimers();
  m.calls = [];
  m.reduce = false;
  m.result = loaded(["a", "b"]);
});
afterEach(() => vi.useRealTimers());

describe("GifPickerButton", () => {
  it("uses its own label by default", () => {
    render(
      <TooltipProvider>
        <GifPickerButton onPick={vi.fn()} />
      </TooltipProvider>,
    );
    expect(screen.getByRole("button", { name: "gif" })).toBeVisible();
  });

  it("takes the label its composer gives it", () => {
    render(
      <TooltipProvider>
        <GifPickerButton label="Replace with GIF" onPick={vi.fn()} />
      </TooltipProvider>,
    );
    expect(
      screen.getByRole("button", { name: "Replace with GIF" }),
    ).toBeVisible();
  });

  it("shows trending GIFs in the member's language and picks one", () => {
    const onPick = open();
    expect(m.calls.at(-1)).toEqual({ query: "", lang: "nl" });
    expect(screen.getByText("gifTrending")).toBeVisible();
    expect(screen.getByText("poweredByGiphy")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Title b" }));
    expect(onPick).toHaveBeenCalledWith(gif("b"));
    expect(screen.queryByText("gifTrending")).toBeNull();
  });

  it("searches without a community", () => {
    open();
    const input = m.calls.at(-1);
    expect(input).toBeDefined();
    expect(input).not.toHaveProperty("communitySlug");
  });

  it("searches once the member stops typing", () => {
    open();
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "party" },
    });
    expect(m.calls.at(-1)).toMatchObject({ query: "" });
    act(() => {
      vi.advanceTimersByTime(450);
    });
    expect(m.calls.at(-1)).toMatchObject({ query: "party" });
    expect(screen.getByText("gifResultsFor")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "gifClear" }));
    expect(screen.getByRole("searchbox")).toHaveValue("");
  });

  it("shows still previews that play only while hovered or focused", () => {
    open();
    expect(document.querySelectorAll("video")).toHaveLength(0);
    fireEvent.mouseEnter(screen.getByRole("button", { name: "Title a" }));
    expect(document.querySelectorAll("video")).toHaveLength(1);
    fireEvent.mouseLeave(screen.getByRole("button", { name: "Title a" }));
    expect(document.querySelectorAll("video")).toHaveLength(0);
  });

  it("shows still previews when the member asks for reduced motion", () => {
    m.reduce = true;
    open();
    fireEvent.focus(screen.getByRole("button", { name: "Title a" }));
    expect(document.querySelectorAll("video")).toHaveLength(0);
    expect(document.querySelectorAll("img")).toHaveLength(2);
  });

  it("loads more on request", () => {
    m.result = loaded(["a"], true);
    open();
    fireEvent.click(screen.getByRole("button", { name: "gifMore" }));
    expect(
      (m.result as ReturnType<typeof loaded>).fetchNextPage,
    ).toHaveBeenCalled();
  });

  it("says when GIF search is busy, with a retry", () => {
    const refetch = vi.fn();
    m.result = {
      isPending: false,
      isError: true,
      error: {
        message: "GIF search is busy. Try again in a few minutes.",
        data: { code: "TOO_MANY_REQUESTS" },
      },
      refetch,
    };
    open();
    expect(screen.getAllByText("gifBusy")).toHaveLength(2);
    expect(screen.getByRole("status")).toHaveTextContent("gifBusy");
    fireEvent.click(screen.getByRole("button", { name: "tryAgain" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("says when nothing matched", () => {
    m.result = loaded([]);
    open();
    expect(screen.getByRole("status")).toHaveTextContent("gifNone");
  });

  it("keeps tiles in place and drops repeats when more GIFs arrive", () => {
    m.result = {
      ...loaded([]),
      data: {
        pages: [
          { gifs: ["a", "b"].map(gif), nextCursor: 24 },
          { gifs: ["b", "c"].map(gif), nextCursor: null },
        ],
      },
    };
    open();
    const names = screen
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label"))
      .filter((n) => n?.startsWith("Title"));
    expect(names.sort()).toEqual(["Title a", "Title b", "Title c"]);
    expect(screen.getByRole("status")).toHaveTextContent("gifCount");
  });
});
