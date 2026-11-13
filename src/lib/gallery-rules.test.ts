import { describe, expect, it } from "vitest";

import { VIDEO_UPLOADS_PER_DAY } from "@/lib/video-rules";

import {
  GALLERY_KEY_PREFIXES,
  GALLERY_MAX_FILES_PER_BATCH,
  GALLERY_MAX_VIDEOS_PER_BATCH,
  GALLERY_PHOTO_CONTENT_TYPES,
  GALLERY_PHOTOS_PER_DAY,
  GALLERY_VIDEOS_PER_DAY,
  galleryItemLabel,
  galleryObjectKeys,
  isGalleryErrorCode,
  isGalleryKey,
} from "./gallery-rules";

describe("gallery limits", () => {
  it("keeps the agreed batch and daily limits", () => {
    expect(GALLERY_MAX_FILES_PER_BATCH).toBe(30);
    expect(GALLERY_MAX_VIDEOS_PER_BATCH).toBe(10);
    expect(GALLERY_PHOTOS_PER_DAY).toBe(150);
    expect(GALLERY_VIDEOS_PER_DAY).toBe(VIDEO_UPLOADS_PER_DAY);
    expect([...GALLERY_PHOTO_CONTENT_TYPES]).toEqual(["image/jpeg"]);
  });
});

describe("galleryObjectKeys", () => {
  it("puts a public photo and its thumbnail under the public gallery folder", () => {
    expect(
      galleryObjectKeys({
        storage: "public",
        communityId: "c1",
        uploadId: "u1",
        mediaType: "photo",
      }),
    ).toEqual({
      fileKey: "media/gallery/public/c1/u1.jpg",
      thumbnailKey: "media/gallery/public/c1/u1-thumb.jpg",
    });
  });

  it("puts a private video and its thumbnail under the private gallery folder", () => {
    expect(
      galleryObjectKeys({
        storage: "private",
        communityId: "c1",
        uploadId: "u1",
        mediaType: "video",
      }),
    ).toEqual({
      fileKey: "private/gallery/c1/u1.mp4",
      thumbnailKey: "private/gallery/c1/u1-thumb.jpg",
    });
  });

  it("refuses ids that could escape their folder", () => {
    for (const [communityId, uploadId] of [
      ["../videos", "u1"],
      ["c1", "../../x"],
      ["c1/other", "u1"],
      ["", "u1"],
    ] as const) {
      expect(() =>
        galleryObjectKeys({
          storage: "public",
          communityId,
          uploadId,
          mediaType: "photo",
        }),
      ).toThrow();
    }
  });
});

describe("isGalleryKey", () => {
  it("accepts keys under the two gallery folders only", () => {
    expect(isGalleryKey("private/gallery/c/x.jpg")).toBe(true);
    expect(isGalleryKey("media/gallery/public/c/x-thumb.jpg")).toBe(true);
    expect(isGalleryKey("media/gallery/public/c/x.mp4")).toBe(true);
    expect(isGalleryKey("private/videos/x.mp4")).toBe(false);
    expect(isGalleryKey("media/videos/public/c/x.mp4")).toBe(false);
    expect(isGalleryKey("media/gallery/c/x.jpg")).toBe(false);
  });

  it("refuses keys that only look like gallery keys", () => {
    expect(isGalleryKey("private/gallery/../videos/x.mp4")).toBe(false);
    expect(isGalleryKey("private/gallery/c/d/x.jpg")).toBe(false);
    expect(isGalleryKey("private/gallery/c/x.exe")).toBe(false);
    expect(isGalleryKey("xprivate/gallery/c/x.jpg")).toBe(false);
    expect(isGalleryKey(GALLERY_KEY_PREFIXES.private)).toBe(false);
  });
});

describe("galleryItemLabel", () => {
  const base = {
    caption: null,
    alt: null,
    mediaType: "photo" as const,
    eventTitle: "Demo night",
    uploaderName: "Ada",
  };

  it("uses the caption first", () => {
    expect(
      galleryItemLabel({ ...base, caption: "On stage", alt: "A person" }),
    ).toEqual({ text: "On stage" });
  });

  it("uses the alt text when there is no caption", () => {
    expect(
      galleryItemLabel({ ...base, caption: "  ", alt: "A person speaking" }),
    ).toEqual({ text: "A person speaking" });
  });

  it("describes a photo from an event by its uploader", () => {
    expect(galleryItemLabel(base)).toEqual({
      key: "gallery.label.photoFromEvent",
      values: { event: "Demo night", name: "Ada" },
    });
  });

  it("describes a photo without an event by its uploader", () => {
    expect(galleryItemLabel({ ...base, eventTitle: null })).toEqual({
      key: "gallery.label.photoBy",
      values: { name: "Ada" },
    });
  });

  it("describes videos with the video wording", () => {
    expect(galleryItemLabel({ ...base, mediaType: "video" })).toEqual({
      key: "gallery.label.videoFromEvent",
      values: { event: "Demo night", name: "Ada" },
    });
    expect(
      galleryItemLabel({ ...base, mediaType: "video", eventTitle: null }),
    ).toEqual({ key: "gallery.label.videoBy", values: { name: "Ada" } });
  });
});

describe("isGalleryErrorCode", () => {
  it("recognises the gallery's refusal codes and nothing else", () => {
    expect(isGalleryErrorCode("STORAGE_FULL")).toBe(true);
    expect(isGalleryErrorCode("UPLOAD_EXPIRED")).toBe(true);
    expect(isGalleryErrorCode("storage_full")).toBe(false);
    expect(isGalleryErrorCode("Internal server error")).toBe(false);
    expect(isGalleryErrorCode(undefined)).toBe(false);
    expect(isGalleryErrorCode(42)).toBe(false);
  });
});
