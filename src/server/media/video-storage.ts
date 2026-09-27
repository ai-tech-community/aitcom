import type { S3Client } from "@aws-sdk/client-s3";

import type { VideoStorageClass } from "@/lib/video-rules";
import {
  createObjectStorage,
  getObjectStorage,
  type ObjectStorage,
  type PresignedUpload,
  type StoredObject,
} from "./object-storage";

export type { PresignedUpload, StoredObject };

/**
 * Video storage for community short videos (ADR-0036). A facade over the
 * generic ObjectStorage adapter: it keeps the video vocabulary
 * (`playbackUrl(key, storageClass)`) so feed and Reels code never changes
 * when the storage underneath does.
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

/** Video vocabulary over any ObjectStorage. */
export function videoStorageOver(objects: ObjectStorage): VideoStorage {
  return {
    presignUpload: (input) => objects.presignUpload(input),
    inspect: (key) => objects.inspect(key),
    async playbackUrl(key, storage) {
      return storage === "public"
        ? objects.publicUrl(key)
        : objects.signedGetUrl(key);
    },
    remove: (keys) => objects.remove(keys),
  };
}

export function createVideoStorage(input: {
  client: S3Client;
  bucket: string;
  region: string;
  /** Clock for the signing window; injectable for tests. */
  now?: () => number;
}): VideoStorage {
  return videoStorageOver(createObjectStorage(input));
}

let shared: VideoStorage | null = null;

/** The app's video storage, built from the same S3 settings as Payload media. */
export function getVideoStorage(): VideoStorage {
  shared ??= videoStorageOver(getObjectStorage());
  return shared;
}
