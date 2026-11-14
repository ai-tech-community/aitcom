import type { Where } from "payload";

import { DELETED_AUTHOR_ID } from "@/lib/account-deletion";
import type { GalleryItem } from "@/payload-types";
import type { GalleryViewer } from "@/server/gallery/access";
import {
  galleryReadableWhere,
  isGalleryReadable,
  type ReadableItemFields,
} from "@/server/gallery/items";

/**
 * Which gallery items a magazine may newly feature (spec 2026-11-13,
 * Magazine, settled 14 Nov): items of the magazine's community that are
 * ready, not hidden, whose uploader allowed magazine use and still has an
 * account. One rule, in two forms that tests keep in step: a query for the
 * picker and the suggester, a check for `acceptNew`.
 *
 * Items already placed in an issue are not held to the deleted-account
 * part: they keep rendering, credited as "Deleted member".
 */
export function featurableWhere(communityId: string): Where {
  return {
    and: [
      { communityId: { equals: communityId } },
      { status: { equals: "ready" } },
      { hiddenAt: { exists: false } },
      { magazineConsent: { equals: true } },
      { uploaderId: { not_equals: DELETED_AUTHOR_ID } },
    ],
  };
}

export type FeaturableFields = ReadableItemFields &
  Pick<GalleryItem, "magazineConsent">;

export function isFeaturable(
  item: FeaturableFields,
  communityId: string,
): boolean {
  return (
    item.communityId === communityId &&
    item.status === "ready" &&
    item.hiddenAt == null &&
    item.magazineConsent === true &&
    item.uploaderId !== DELETED_AUTHOR_ID
  );
}

/**
 * What this editor may newly feature: featurable and readable by the
 * editor's own gallery viewer (an editor who is no member never picks a
 * members-only photo). The one predicate the picker, `acceptNew` and the
 * suggester share.
 */
export function featurableByWhere(editor: GalleryViewer): Where {
  return {
    and: [featurableWhere(editor.communityId), galleryReadableWhere(editor)],
  };
}

export function isFeaturableBy(
  item: FeaturableFields,
  editor: GalleryViewer,
): boolean {
  return (
    isFeaturable(item, editor.communityId) && isGalleryReadable(editor, item)
  );
}
