import type {
  VideoStorage,
  VideoStorageSource,
} from "@/server/media/video-storage";

/** The part of a feed post that points at its stored video files. */
export type PostVideoFiles = {
  video?: { key?: string | null; thumbnailKey?: string | null } | null;
};

export function videoKeysOf(post: PostVideoFiles): string[] {
  return [post.video?.key, post.video?.thumbnailKey].filter(
    (key): key is string => Boolean(key),
  );
}

/** Deletes a video post's files. Safe to call for posts without a video. */
export async function removePostVideo(
  storage: VideoStorage,
  post: PostVideoFiles,
): Promise<void> {
  const keys = videoKeysOf(post);
  if (keys.length === 0) return;
  await storage.remove(keys);
}

/**
 * Best-effort removal of a post's video files once nothing points at them
 * any more: the post was deleted or removed by a moderator, or an edit
 * replaced or removed its video. That change has already happened, so a
 * storage failure (even storage being unavailable) must not turn it into
 * an error for the user. The abandoned-upload cleanup never covers
 * finished posts, so the log line is the only signal that files were left
 * behind.
 */
export async function cleanUpPostVideoFiles(
  getStorage: VideoStorageSource,
  post: PostVideoFiles & { id: number },
  options: {
    /** The action that dropped the files, e.g. "feed.deletePost", for the log. */
    context: string;
    log?: (message: string, detail: unknown) => void;
  },
): Promise<void> {
  const keys = videoKeysOf(post);
  if (keys.length === 0) return;
  try {
    await removePostVideo(getStorage(), post);
  } catch (error) {
    (options.log ?? console.error)(
      `[${options.context}] video cleanup failed`,
      {
        postId: post.id,
        keys,
        error,
      },
    );
  }
}
