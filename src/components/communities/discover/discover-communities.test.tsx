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

const DEFAULTS: DirectoryParams = { q: "", place: null, sort: "active" };

function page(names: string[], places: string[] = []) {
  return {
    items: names.map((name) => ({ id: name, name })),
    total: names.length,
    nextCursor: null,
    places: places.map((key) => ({ key, communities: 1 })),
  };
}

afterEach(() => vi.useRealTimers());

describe("DiscoverCommunities", () => {
  it("queries exactly what the URL says", () => {
    state.pages = [page(["Alpha"])];
    render(
      <DiscoverCommunities
        params={{ q: "ml", place: "Utrecht", sort: "newest" }}
        onParamsChange={vi.fn()}
      />,
    );
    expect(state.lastInput).toEqual({
      q: "ml",
      place: "Utrecht",
      sort: "newest",
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
});
