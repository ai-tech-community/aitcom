import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
  type GetObjectCommandInput,
} from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { env } from "@/env";
import {
  PLAYBACK_LINK_SECONDS,
  PLAYBACK_LINK_WINDOW_SECONDS,
  UPLOAD_GRANT_SECONDS,
} from "@/lib/video-rules";

export type PresignedUpload = { url: string; fields: Record<string, string> };
export type StoredObject = { contentType: string | null; bytes: number };

export type SignedGetOptions = {
  /** The file name the browser saves, sent back as Content-Disposition. */
  downloadName?: string;
  /** "inline" shows the file in the page (PDF preview). Default "attachment". */
  disposition?: "inline" | "attachment";
  /** The Content-Type S3 answers with. */
  contentType?: string;
};

/**
 * The only code that talks to our S3 bucket for app-managed objects: Reels
 * videos (ADR-0036) and classroom files (spec 2026-09-27 §4.1). An adapter
 * over the AWS SDK — callers deal in keys and links, never in SDK types.
 */
export type ObjectStorage = {
  presignUpload(input: {
    key: string;
    contentType: string;
    maxBytes: number;
  }): Promise<PresignedUpload>;
  inspect(key: string): Promise<StoredObject | null>;
  /**
   * A signed GET link, signed at the start of a PLAYBACK_LINK_WINDOW_SECONDS
   * window so every request inside the window gets the identical URL (a
   * playing video is not reloaded; a PDF preview is not re-fetched). Each
   * link lives at least PLAYBACK_LINK_SECONDS from the moment it is served.
   */
  signedGetUrl(key: string, options?: SignedGetOptions): Promise<string>;
  publicUrl(key: string): string;
  remove(keys: readonly string[]): Promise<void>;
};

/**
 * A lazy way to reach storage. Callers that may never touch a stored object
 * take this instead of an ObjectStorage, so a missing S3 config only fails
 * the requests that actually need it.
 */
export type ObjectStorageSource = () => ObjectStorage;

/**
 * A Content-Disposition header value: an ASCII fallback `filename` for old
 * clients plus the exact name as RFC 5987 `filename*`.
 */
export function contentDisposition(
  disposition: "inline" | "attachment",
  fileName: string,
): string {
  const fallback = fileName.replace(/[^\x20-\x7e]|["\\]/g, "_");
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export function createObjectStorage({
  client,
  bucket,
  region,
  now = Date.now,
}: {
  client: S3Client;
  bucket: string;
  region: string;
  /** Clock for the signing window; injectable for tests. */
  now?: () => number;
}): ObjectStorage {
  return {
    async presignUpload({ key, contentType, maxBytes }) {
      const { url, fields } = await createPresignedPost(client, {
        Bucket: bucket,
        Key: key,
        Conditions: [
          ["content-length-range", 1, maxBytes],
          ["eq", "$Content-Type", contentType],
        ],
        Fields: { "Content-Type": contentType },
        Expires: UPLOAD_GRANT_SECONDS,
      });
      return { url, fields };
    },
    async inspect(key) {
      try {
        const head = await client.send(
          new HeadObjectCommand({ Bucket: bucket, Key: key }),
        );
        return {
          contentType: head.ContentType ?? null,
          bytes: head.ContentLength ?? 0,
        };
      } catch (error) {
        if ((error as { name?: string }).name === "NotFound") return null;
        throw error;
      }
    },
    async signedGetUrl(key, options) {
      const windowMs = PLAYBACK_LINK_WINDOW_SECONDS * 1000;
      const windowStart = Math.floor(now() / windowMs) * windowMs;
      const input: GetObjectCommandInput = { Bucket: bucket, Key: key };
      const disposition = options?.disposition ?? "attachment";
      if (options?.downloadName) {
        input.ResponseContentDisposition = contentDisposition(
          disposition,
          options.downloadName,
        );
      } else if (options?.disposition) {
        input.ResponseContentDisposition = options.disposition;
      }
      if (options?.contentType) input.ResponseContentType = options.contentType;
      return getSignedUrl(client, new GetObjectCommand(input), {
        signingDate: new Date(windowStart),
        expiresIn: PLAYBACK_LINK_SECONDS + PLAYBACK_LINK_WINDOW_SECONDS,
      });
    },
    publicUrl(key) {
      return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
    },
    async remove(keys) {
      if (keys.length === 0) return;
      const result = await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
        }),
      );
      const errors = result.Errors ?? [];
      if (errors.length > 0) {
        const detail = errors
          .map((e) => `${e.Key ?? "?"} (${e.Code ?? "unknown"})`)
          .join(", ");
        throw new Error(`Failed to delete: ${detail}`);
      }
    },
  };
}

let shared: ObjectStorage | null = null;

/** The app's object storage, built from the same S3 settings as Payload media. */
export function getObjectStorage(): ObjectStorage {
  if (shared) return shared;
  const bucket = env.S3_BUCKET;
  const region = env.S3_REGION ?? "eu-central-1";
  if (!bucket || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
    throw new Error("S3 is not configured for object storage");
  }
  shared = createObjectStorage({
    bucket,
    region,
    client: new S3Client({
      region,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      },
    }),
  });
  return shared;
}
