import {
  APIError,
  type CollectionBeforeChangeHook,
  type CollectionBeforeOperationHook,
  type FieldAccess,
  type FieldHook,
  type PayloadRequest,
} from "payload";

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

/** The only folders a caller may choose for a new file besides the default. */
const MAGAZINE_PREFIX = /^magazines\/\d+$/;

export const LEGACY_ROOT_EDIT_MESSAGE =
  "This image is stored the old way. Upload it again to crop it or move its focal point.";

/** An empty or missing prefix means the bucket root. */
function isBucketRoot(prefix: unknown): boolean {
  return typeof prefix !== "string" || prefix.length === 0;
}

/**
 * The folder a media file about to be written goes under: MEDIA_DEFAULT_PREFIX
 * when none was chosen, or the caller's `magazines/<id>`. Anything else is
 * refused, so a caller can never write at the root or into another feature's
 * folder (`private/classroom/…`, `media/gallery/…`).
 */
export function prefixForNewFile(prefix: unknown): string {
  if (isBucketRoot(prefix)) return MEDIA_DEFAULT_PREFIX;
  if (
    prefix === MEDIA_DEFAULT_PREFIX ||
    (typeof prefix === "string" && MAGAZINE_PREFIX.test(prefix))
  ) {
    return prefix;
  }
  throw new APIError(
    `Media files can only be stored under "${MEDIA_DEFAULT_PREFIX}" or "magazines/<id>", not "${String(prefix)}".`,
    400,
  );
}

/**
 * The storage plugin's own signal that files will be uploaded: it uploads
 * from `req.file`, or from the copy it keeps in context after clearing
 * `req.file` (`getIncomingFiles`). Following the same signal means the
 * folder rule applies to exactly the writes the plugin makes.
 */
export function isWritingAFile(req: PayloadRequest): boolean {
  const kept = req.context?._payloadCloudStorage as
    | { file?: unknown }
    | undefined;
  return Boolean(req.file ?? kept?.file);
}

/**
 * `req.context` key for the prefix a local-API caller asked for. Set at the
 * start of every media create/update (so a value never leaks from an
 * earlier operation on the same request) and read by the same operation's
 * beforeChange. No media operation runs between the two.
 */
const CALLER_PREFIX = "mediaCallerPrefix";

/**
 * Media `beforeOperation`: hold the caller's prefix back until beforeChange.
 *
 * Payload picks a free file name before any other hook runs, and narrows
 * its duplicate check to `data.prefix` when one is sent. The `filename`
 * unique index is global, so a create sent with `prefix: "media"` and the
 * name of an old root file would fail on the index instead of being renamed
 * `name-1`. Without a prefix in `data`, the check stays global.
 *
 * Only a local-API caller (overrideAccess) may choose a prefix; the field
 * is closed to REST writes, so theirs is simply dropped here.
 */
export const holdBackCallerPrefix: CollectionBeforeOperationHook = ({
  args,
  operation,
  req,
}) => {
  if (operation !== "create" && operation !== "update") return args;
  const { data, overrideAccess } = args as {
    data?: Record<string, unknown>;
    overrideAccess?: boolean;
  };
  req.context[CALLER_PREFIX] = undefined;
  if (!data || !("prefix" in data)) return args;
  const { prefix, ...rest } = data;
  if (overrideAccess) req.context[CALLER_PREFIX] = prefix;
  return { ...args, data: rest } as typeof args;
};

/**
 * Media `beforeChange`: when a new file is being written — a create with a
 * file, a replaced file, a crop or focal-point re-upload — store it under a
 * folder (see prefixForNewFile). Image sizes follow, because the storage
 * adapter writes them under the same stored prefix.
 *
 * Without a file being written nothing is uploaded, so the stored prefix —
 * and the URL built from it — stay as they are: an old root file keeps
 * working.
 *
 * Re-writing the same file of an old root doc (crop or focal point: the
 * name is kept) is refused. It would move the file to `media/` and delete
 * the root objects, breaking every place that stored its URL as text.
 *
 * Collection beforeChange hooks run before field beforeChange hooks, so the
 * plugin's `url` field hook builds the URL from this prefix, and the
 * afterChange upload reads it from the saved doc.
 */
export const storeNewFilesUnderAFolder: CollectionBeforeChangeHook = ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (!isWritingAFile(req)) return data;
  const original = originalDoc as Partial<Media> | undefined;
  if (
    operation === "update" &&
    original &&
    isBucketRoot(original.prefix) &&
    data.filename === original.filename
  ) {
    throw new APIError(LEGACY_ROOT_EDIT_MESSAGE, 400);
  }
  const chosen = req.context[CALLER_PREFIX];
  return {
    ...data,
    prefix: prefixForNewFile(chosen !== undefined ? chosen : data.prefix),
  };
};

/** The `prefix` field is set by the hooks above, never through REST. */
export const noPrefixWrites: FieldAccess = () => false;

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
