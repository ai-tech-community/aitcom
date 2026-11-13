"use client";

import { useRef, useState, type ReactNode, type RefObject } from "react";

import type { LoadMoreQuery } from "@/components/ui/load-more";
import type { GalleryItemView } from "@/server/gallery/items";
import { api } from "@/trpc/react";

import { GalleryEditDialog } from "./gallery-edit-dialog";
import { GalleryLightbox } from "./gallery-lightbox";
import { useOpening } from "./use-opening";

/**
 * The gallery lightbox and edit dialog for a set of tiles shown outside the
 * Gallery tab (a feed post's collage, an event page): `open(itemId)` opens
 * the item a tile shows, and `host` renders the dialogs. Focus goes back to
 * the opening tile in `scope`, or to `deletedFocus` when that tile's item
 * was deleted.
 *
 * Edit and delete follow the Gallery tab: a member may edit their own
 * item, a moderator may delete any. After a delete the gallery's own lists
 * are refreshed here; `onChange` (after a delete or a saved edit) reloads
 * whatever showed these items, since they came with it.
 */
export function useGalleryLightboxHost({
  slug,
  items,
  scope,
  deletedFocus,
  isMember,
  canModerate,
  onChange,
  more,
}: {
  slug: string;
  /** The items prev/next move through, in order. */
  items: readonly GalleryItemView[];
  /** Where these tiles are: the opener is looked up here. */
  scope: RefObject<HTMLElement | null>;
  /** Where focus lands when the tile it would go back to was deleted. */
  deletedFocus: RefObject<HTMLElement | null>;
  isMember: boolean;
  canModerate: boolean;
  onChange?: () => void;
  /** Paging past the given items, for Next at the last one. */
  more?: LoadMoreQuery;
}): { open: (itemId: number) => void; host: ReactNode } {
  const utils = api.useUtils();
  const [openId, setOpenId] = useState<number | null>(null);
  const [editing, openEdit, closeEdit] = useOpening<{
    item: GalleryItemView;
  }>();
  // The tile that opened the lightbox: focus goes back to it when the item
  // shown last has no tile here (it was further on).
  const opener = useRef<HTMLElement | null>(null);

  const open = (itemId: number) => {
    opener.current =
      scope.current?.querySelector<HTMLElement>(
        `[data-gallery-item-id="${itemId}"]`,
      ) ?? null;
    setOpenId(itemId);
  };

  const host = (
    <>
      <GalleryLightbox
        slug={slug}
        items={items}
        openId={openId}
        onNavigate={setOpenId}
        onClose={() => setOpenId(null)}
        onEdit={isMember ? (item) => openEdit({ item }) : undefined}
        onDeleted={(itemId) => {
          if (opener.current?.dataset.galleryItemId === String(itemId)) {
            opener.current = deletedFocus.current;
          }
          void utils.gallery.list.invalidate({ slug });
          void utils.gallery.facets.invalidate({ slug });
          onChange?.();
        }}
        canModerate={canModerate}
        fallbackFocus={opener}
        focusScope={scope}
        more={more}
      />
      {editing ? (
        <GalleryEditDialog
          key={editing.key}
          slug={slug}
          item={editing.item}
          open={editing.open}
          onOpenChange={(isOpen) => {
            if (!isOpen) closeEdit();
          }}
          onSaved={onChange}
        />
      ) : null}
    </>
  );

  return { open, host };
}
