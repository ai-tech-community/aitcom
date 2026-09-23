import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { env } from "@/env";
import {
  PLAYBACK_LINK_SECONDS,
  UPLOAD_GRANT_SECONDS,
  type VideoStorageClass,
} from "@/lib/video-rules";

export type PresignedUpload = { url: string; fields: Record<string, string> };
export type StoredObject = { contentType: string | null; bytes: number };

/**
 * The only code that touches video storage (ADR-0036). Everything else asks
 * this module, so moving to a video platform later changes one file.
 */
export type VideoStorage = {
  presignUpload(input: {
    key: string;
    contentType: string;
    maxBytes: number;
  }): Promise<PresignedUpload>;
  inspect(key: string): Promise<StoredObject | null>;
  playbackUrl(key: string, storage: VideoStorageClass): Promise<string>;
  remove(keys: readonly string[]): Promise<void>;
};

/**
 * A lazy way to reach video storage. Callers that may never touch a video
 * (text-only feeds) take this instead of a VideoStorage, so a missing S3
 * config only fails the requests that actually need it.
 */
export type VideoStorageSource = () => VideoStorage;

export function createVideoStorage({
  client,
  bucket,
  region,
}: {
  client: S3Client;
  bucket: string;
  region: string;
}): VideoStorage {
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
    async playbackUrl(key, storage) {
      if (storage === "public") {
        return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
      }
      return getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: bucket, Key: key }),
        { expiresIn: PLAYBACK_LINK_SECONDS },
      );
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

let shared: VideoStorage | null = null;

/** The app's video storage, built from the same S3 settings as Payload media. */
export function getVideoStorage(): VideoStorage {
  if (shared) return shared;
  const bucket = env.S3_BUCKET;
  const region = env.S3_REGION ?? "eu-central-1";
  if (!bucket || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
    throw new Error("S3 is not configured for video storage");
  }
  shared = createVideoStorage({
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
