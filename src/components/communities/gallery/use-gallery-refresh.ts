"use client";

import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { api } from "@/trpc/react";

/**
 * Reloads what the gallery shows after an item changed or went away: the
 * wall and its filter choices, and the item's own entry (a linked item
 * that is not on the loaded wall).
 *
 * - `changed`: the viewer can still read the item — a moderator restored
 *   it or reported it — so its own entry is read again.
 * - `deleted`: the viewer can no longer read the item — deleted, removed,
 *   or reported out of their sight. Its own entry is dropped, not
 *   invalidated: a linked item is still on screen when this runs, and an
 *   invalidate would ask for it again only to be told it is gone.
 */
export function useGalleryRefresh(slug: string) {
  const utils = api.useUtils();
  // tRPC's provider shares this client (src/trpc/react.tsx).
  const queryClient = useQueryClient();
  return useMemo(() => {
    const lists = () => {
      void utils.gallery.list.invalidate({ slug });
      void utils.gallery.facets.invalidate({ slug });
    };
    return {
      changed: (itemId: number) => {
        lists();
        void utils.gallery.item.invalidate({ slug, itemId });
      },
      deleted: (itemId: number) => {
        lists();
        queryClient.removeQueries({
          queryKey: utils.gallery.item.queryOptions({ slug, itemId }).queryKey,
          exact: true,
        });
      },
    };
  }, [utils, queryClient, slug]);
}
