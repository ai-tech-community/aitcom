import type { GalleryItemView } from "@/server/gallery/items";

/** A ready gallery item as the API returns it, for component tests. */
export function galleryItem(
  overrides: Partial<GalleryItemView> = {},
): GalleryItemView {
  const id = overrides.id ?? 1;
  return {
    id,
    mediaType: "photo",
    url: `https://files.test/private/gallery/c1/${id}.jpg?sig=a`,
    thumbnailUrl: `https://files.test/private/gallery/c1/${id}-thumb.jpg?sig=a`,
    width: 1200,
    height: 800,
    durationSeconds: null,
    caption: null,
    alt: null,
    event: null,
    topicSlug: null,
    visibility: "community",
    magazineConsent: false,
    uploader: { id: "u-ana", name: "Ana Lopez", image: null },
    createdAt: "2026-11-12T10:00:00.000Z",
    isOwn: false,
    batchId: 1,
    ...overrides,
  };
}
