import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as ReactQuery from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";

import { useGalleryRefresh } from "./use-gallery-refresh";

const m = vi.hoisted(() => ({
  invalidateList: vi.fn(),
  invalidateFacets: vi.fn(),
  invalidateItem: vi.fn(),
  removeQueries: vi.fn(),
  itemQueryOptions: vi.fn((input: unknown) => ({
    queryKey: [["gallery", "item"], { input, type: "query" }],
  })),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof ReactQuery>()),
  useQueryClient: () => ({ removeQueries: m.removeQueries }),
}));
vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({
      gallery: {
        list: { invalidate: m.invalidateList },
        facets: { invalidate: m.invalidateFacets },
        item: {
          invalidate: m.invalidateItem,
          queryOptions: m.itemQueryOptions,
        },
      },
    }),
  },
}));

const ITEM_KEY = [
  ["gallery", "item"],
  { input: { slug: "mlops", itemId: 7 }, type: "query" },
];

describe("useGalleryRefresh", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reloads the wall, its filters and the item after a change", () => {
    const { result } = renderHook(() => useGalleryRefresh("mlops"));
    result.current.changed(7);
    expect(m.invalidateList).toHaveBeenCalledWith({ slug: "mlops" });
    expect(m.invalidateFacets).toHaveBeenCalledWith({ slug: "mlops" });
    expect(m.invalidateItem).toHaveBeenCalledWith({ slug: "mlops", itemId: 7 });
    expect(m.removeQueries).not.toHaveBeenCalled();
  });

  it("drops a deleted item's own entry instead of asking for it again", () => {
    const { result } = renderHook(() => useGalleryRefresh("mlops"));
    result.current.deleted(7);
    expect(m.invalidateList).toHaveBeenCalledWith({ slug: "mlops" });
    expect(m.invalidateFacets).toHaveBeenCalledWith({ slug: "mlops" });
    // An invalidate would refetch a linked item still on screen, only to
    // be told it is gone.
    expect(m.invalidateItem).not.toHaveBeenCalled();
    expect(m.removeQueries).toHaveBeenCalledWith({
      queryKey: ITEM_KEY,
      exact: true,
    });
  });
});
