"use client";

import { useCallback } from "react";

import { api } from "@/trpc/react";

/**
 * Reloads what the gallery shows after an item changed: the wall and its
 * filter choices and, given its id, the item on its own (a linked item
 * that is not on the loaded wall).
 */
export function useGalleryRefresh(slug: string) {
  const utils = api.useUtils();
  return useCallback(
    (itemId?: number) => {
      void utils.gallery.list.invalidate({ slug });
      void utils.gallery.facets.invalidate({ slug });
      if (itemId !== undefined) {
        void utils.gallery.item.invalidate({ slug, itemId });
      }
    },
    [utils, slug],
  );
}
