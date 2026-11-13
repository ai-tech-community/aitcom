/**
 * Which picked files the upload dialog keeps (spec 2026-11-13, Upload
 * dialog): photos and videos only, in the order picked, up to a batch's
 * limits — refused here, at selection, with a line that says why, rather
 * than by the server after the member pressed Upload.
 */
import {
  GALLERY_MAX_FILES_PER_BATCH,
  GALLERY_MAX_VIDEOS_PER_BATCH,
  galleryMediaTypeOf,
} from "@/lib/gallery-rules";

/** Why some picked files were left out. */
export type SelectionNotice =
  | "notMedia"
  /** This browser cannot convert videos, so none can be sent from it. */
  | "videosUnsupported"
  | "tooManyVideos"
  | "tooManyFiles";

const NOTICE_ORDER: readonly SelectionNotice[] = [
  "notMedia",
  "videosUnsupported",
  "tooManyVideos",
  "tooManyFiles",
];

export function acceptPickedFiles(
  chosen: { files: number; videos: number },
  picked: readonly File[],
  options: { canConvertVideo: boolean },
): { accepted: File[]; notices: SelectionNotice[] } {
  const accepted: File[] = [];
  const notices = new Set<SelectionNotice>();
  let files = chosen.files;
  let videos = chosen.videos;
  for (const file of picked) {
    const mediaType = galleryMediaTypeOf(file.type);
    if (mediaType === null) {
      notices.add("notMedia");
      continue;
    }
    if (mediaType === "video" && !options.canConvertVideo) {
      notices.add("videosUnsupported");
      continue;
    }
    if (files >= GALLERY_MAX_FILES_PER_BATCH) {
      notices.add("tooManyFiles");
      continue;
    }
    if (mediaType === "video") {
      if (videos >= GALLERY_MAX_VIDEOS_PER_BATCH) {
        notices.add("tooManyVideos");
        continue;
      }
      videos += 1;
    }
    files += 1;
    accepted.push(file);
  }
  return {
    accepted,
    notices: NOTICE_ORDER.filter((notice) => notices.has(notice)),
  };
}
