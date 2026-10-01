import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { DirectoryParams } from "./directory-params";

const state = vi.hoisted(() => ({
  lastInput: null as unknown,
  pages: [] as unknown[],
}));

vi.mock("@/trpc/react", () => ({
  api: {
    communities: {
      directory: {
        useInfiniteQuery: (input: unknown) => {
          state.lastInput = input;
          return {
            isLoading: false,
            isError: false,
            data: { pages: state.pages },
            hasNextPage: false,
          };
        },
      },
    },
  },
}));
vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (k: string, vars?: Record<string, unknown>) =>
    vars ? `${k}:${JSON.stringify(vars)}` : k,
}));
vi.mock("./community-card", () => ({
  CommunityCard: ({ community }: { community: { name: string } }) => (
    <div>{community.name}</div>
  ),
}));
vi.mock("@/components/communities/create-community-dialog", () => ({
  CreateCommunityButton: () => <button type="button">create</button>,
}));

import { DiscoverCommunities } from "./discover-communities";

const DEFAULTS: DirectoryParams = {
  q: "",
  place: null,
  want: null,
  sort: "active",
};

function page(
  names: string[],
  places: string[] = [],
  extra: { wants?: string[]; origin?: unknown; distanceKm?: number } = {},
) {
  return {
    items: names.map((name) => ({
      id: name,
      name,
      distanceKm: extra.distanceKm ?? null,
    })),
    total: names.length,
    nextCursor: null,
    places: places.map((key) => ({ key, communities: 1 })),
    wants: (extra.wants ?? []).map((key) => ({ key, communities: 1 })),
    origin: extra.origin ?? null,
  };
}

afterEach(() => vi.useRealTimers());

describe("DiscoverCommunities", () => {
  it("queries exactly what the URL says", () => {
    state.pages = [page(["Alpha"])];
    render(
      <DiscoverCommunities
        params={{ q: "ml", place: "Utrecht", want: null, sort: "newest" }}
        onParamsChange={vi.fn()}
      />,
    );
    expect(state.lastInput).toEqual({
      q: "ml",
      place: "Utrecht",
      want: undefined,
      sort: "newest",
      near: undefined,
      limit: 24,
      locale: "en",
    });
  });

  it("writes the search to the URL after a pause", () => {
    vi.useFakeTimers();
    state.pages = [page(["Alpha"])];
    const onParamsChange = vi.fn();
    render(
      <DiscoverCommunities params={DEFAULTS} onParamsChange={onParamsChange} />,
    );
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "agents" },
    });
    expect(onParamsChange).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onParamsChange).toHaveBeenCalledWith({ q: "agents" });
  });

  it("clears the search at once", () => {
    state.pages = [page(["Alpha"])];
    const onParamsChange = vi.fn();
    render(
      <DiscoverCommunities
        params={{ ...DEFAULTS, q: "agents" }}
        onParamsChange={onParamsChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "clearSearch" }));
    expect(onParamsChange).toHaveBeenCalledWith({ q: "" });
  });

  it("changes the sort", () => {
    state.pages = [page(["Alpha"])];
    const onParamsChange = vi.fn();
    render(
      <DiscoverCommunities params={DEFAULTS} onParamsChange={onParamsChange} />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "sortLargest" }));
    expect(onParamsChange).toHaveBeenCalledWith({ sort: "largest" });
  });

  it("keeps letters typed while the URL catches up", () => {
    vi.useFakeTimers();
    state.pages = [page(["Alpha"])];
    const onParamsChange = vi.fn();
    const { rerender } = render(
      <DiscoverCommunities params={DEFAULTS} onParamsChange={onParamsChange} />,
    );
    const box = screen.getByRole("searchbox");
    fireEvent.change(box, { target: { value: "ab" } });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    fireEvent.change(box, { target: { value: "abc" } });
    // The URL now reports the earlier "ab".
    rerender(
      <DiscoverCommunities
        params={{ ...DEFAULTS, q: "ab" }}
        onParamsChange={onParamsChange}
      />,
    );
    expect(box).toHaveValue("abc");
  });

  it("follows an outside URL change, e.g. Back", () => {
    state.pages = [page(["Alpha"])];
    const { rerender } = render(
      <DiscoverCommunities
        params={{ ...DEFAULTS, q: "ml" }}
        onParamsChange={vi.fn()}
      />,
    );
    rerender(
      <DiscoverCommunities params={DEFAULTS} onParamsChange={vi.fn()} />,
    );
    expect(screen.getByRole("searchbox")).toHaveValue("");
  });

  it("uses the latest handler when the pause ends", () => {
    vi.useFakeTimers();
    state.pages = [page(["Alpha"])];
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(
      <DiscoverCommunities params={DEFAULTS} onParamsChange={first} />,
    );
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "x" },
    });
    rerender(
      <DiscoverCommunities
        params={{ ...DEFAULTS, sort: "newest" }}
        onParamsChange={second}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith({ q: "x" });
  });

  it("shows a community once even if two pages both hold it", () => {
    state.pages = [page(["Alpha", "Beta"]), page(["Beta", "Gamma"])];
    render(<DiscoverCommunities params={DEFAULTS} onParamsChange={vi.fn()} />);
    expect(screen.getAllByText("Beta")).toHaveLength(1);
    expect(screen.getByText("Gamma")).toBeInTheDocument();
  });

  it("hides the place filter while there is only one place", () => {
    state.pages = [page(["Alpha"], ["Amsterdam"])];
    render(<DiscoverCommunities params={DEFAULTS} onParamsChange={vi.fn()} />);
    expect(screen.queryByRole("group", { name: "placeLabel" })).toBeNull();
  });

  it("marks the URL's place even when it is spelled differently", () => {
    state.pages = [page(["Alpha"], ["Amsterdam", "online"])];
    render(
      <DiscoverCommunities
        params={{ ...DEFAULTS, place: "amsterdam" }}
        onParamsChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Amsterdam" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(1);
  });

  it("offers the places of upcoming events and filters by one", () => {
    state.pages = [page(["Alpha"], ["Amsterdam", "online"])];
    const onParamsChange = vi.fn();
    render(
      <DiscoverCommunities params={DEFAULTS} onParamsChange={onParamsChange} />,
    );
    expect(screen.getByRole("button", { name: "placeAll" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "placeOnline" }));
    expect(onParamsChange).toHaveBeenCalledWith({ place: "online" });
  });

  it("lets the visitor start a community when nothing matches", () => {
    state.pages = [page([])];
    render(
      <DiscoverCommunities
        params={{ ...DEFAULTS, q: "zzz" }}
        onParamsChange={vi.fn()}
      />,
    );
    expect(screen.getByText("emptyTitle")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "create" })).toBeInTheDocument();
  });

  it("offers the wants some community has, and filters by one", () => {
    state.pages = [page(["Alpha"], [], { wants: ["meet", "learn"] })];
    const onParamsChange = vi.fn();
    render(
      <DiscoverCommunities params={DEFAULTS} onParamsChange={onParamsChange} />,
    );
    const group = screen.getByRole("group", { name: "wantLabel" });
    expect(group).toHaveTextContent("wantMeet");
    expect(group).not.toHaveTextContent("wantWork");
    fireEvent.click(screen.getByRole("button", { name: "wantLearn" }));
    expect(onParamsChange).toHaveBeenCalledWith({ want: "learn" });
  });

  it("explains a distance sort from the visitor's area", () => {
    state.pages = [
      page(["Alpha"], [], {
        origin: { precise: false, city: "Utrecht" },
        distanceKm: 12,
      }),
    ];
    render(
      <DiscoverCommunities
        params={{ ...DEFAULTS, sort: "near" }}
        onParamsChange={vi.fn()}
      />,
    );
    expect(
      screen.getByText('nearFromCity:{"city":"Utrecht"}'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "usePreciseLocation" }),
    ).toBeInTheDocument();
  });

  it("asks for the location only when the visitor presses the button, and sends it rounded", () => {
    const getCurrentPosition = vi.fn(
      (ok: (p: { coords: { latitude: number; longitude: number } }) => void) =>
        ok({ coords: { latitude: 52.37403, longitude: 4.88969 } }),
    );
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } });
    try {
      state.pages = [page(["Alpha"])];
      render(
        <DiscoverCommunities
          params={{ ...DEFAULTS, sort: "near" }}
          onParamsChange={vi.fn()}
        />,
      );
      expect(getCurrentPosition).not.toHaveBeenCalled();
      expect(screen.getByText("nearNeedsLocation")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "useMyLocation" }));
      expect(getCurrentPosition).toHaveBeenCalledTimes(1);
      expect(state.lastInput).toMatchObject({
        sort: "near",
        near: { lat: 52.37, lng: 4.89 },
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("says so when the location cannot be found", () => {
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (_ok: unknown, fail: () => void) => fail(),
      },
    });
    try {
      state.pages = [page(["Alpha"])];
      render(
        <DiscoverCommunities
          params={{ ...DEFAULTS, sort: "near" }}
          onParamsChange={vi.fn()}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "useMyLocation" }));
      expect(screen.getByText("locationFailed")).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("says plainly when no community can be placed on the map yet", () => {
    state.pages = [
      page(["Alpha"], [], { origin: { precise: true, city: null } }),
    ];
    render(
      <DiscoverCommunities
        params={{ ...DEFAULTS, sort: "near" }}
        onParamsChange={vi.fn()}
      />,
    );
    expect(screen.getByText("nearNoneLocated")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /location/i })).toBeNull();
  });
});
