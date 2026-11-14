import type { CollectionBeforeChangeHook, FieldHook } from "payload";

import type { Media } from "@/payload-types";

/**
 * The S3 folder every new Payload `media` file is written under, unless its
 * caller chose a folder of its own (magazine images use `magazines/<id>`).
 * The app's S3 user may only write inside `media/`, `magazines/` and
 * `private/`, so no upload may land at the bucket root.
 *
 * Files stored before this rule sit at the bucket root with an empty or
 * null prefix. They keep it: their rows and objects are never moved.
 */
export const MEDIA_DEFAULT_PREFIX = "media";

/** An empty or missing prefix means the bucket root. */
function isBucketRoot(prefix: unknown): boolean {
  return typeof prefix !== "string" || prefix.length === 0;
}

/**
 * The folder a media file about to be written goes under: the caller's own
 * folder, else MEDIA_DEFAULT_PREFIX — never the bucket root.
 */
export function prefixForNewFile(prefix: unknown): string {
  return isBucketRoot(prefix) ? MEDIA_DEFAULT_PREFIX : (prefix as string);
}

/**
 * Media `beforeChange`: when a new file is being written — a create with a
 * file, a replaced file, a crop re-upload — store it under a folder. Image
 * sizes follow, because the storage adapter writes them under the same
 * stored prefix.
 *
 * `req.file` is the storage plugin's own signal that files will be uploaded
 * (its afterChange uploads exactly when it is set). Without it, nothing is
 * written, so the stored prefix — and the URL built from it — stay as they
 * are; an old root file keeps working.
 *
 * Collection beforeChange hooks run before field beforeChange hooks, so the
 * plugin's `url` field hook builds the URL from this prefix, and the
 * afterChange upload reads it from the saved doc.
 */
export const storeNewFilesUnderAFolder: CollectionBeforeChangeHook = ({
  data,
  req,
}) => {
  if (!req.file) return data;
  return { ...data, prefix: prefixForNewFile(data.prefix) };
};

/**
 * `prefix` field afterRead: a null prefix (rows stored before the column
 * had a default) reads as "", the bucket root. The S3 adapter builds an old
 * file's key with `path.posix.join(doc.prefix, filename)`, which throws on
 * null: deleting such a doc left its objects in the bucket, and replacing
 * its file failed. The stored null is not rewritten by reading; a later save
 * of the doc stores "" — the same root.
 */
export const readMissingPrefixAsBucketRoot: FieldHook<
  Media,
  string | null | undefined
> = ({ value }): string => value ?? "";
