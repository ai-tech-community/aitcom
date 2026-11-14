import { galleryItemInputReference } from "@/lib/magazines/references";

import { referenceBuilderKind } from "./reference";

export const galleryItemBuilderKind = referenceBuilderKind({
  kind: "galleryItem",
  labelKey: "galleryItem",
  referenceOf: galleryItemInputReference,
  openLabelKey: "openGalleryItem",
  // The item is the picture: the server refuses an issue image on it.
  acceptsImage: false,
});
