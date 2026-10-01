/** The longest a feed post's text may be, for the editor and the server. */
export const POST_MAX_LENGTH = 2000;

/** What a post carries, as far as needing words goes. */
export type PostMediaShape = {
  images?: readonly unknown[] | null;
  /** The deprecated single picture, and a legacy picture by URL. */
  image?: unknown;
  imageUrl?: string | null;
  gif?: { giphyId?: string | null } | null;
  video?: { key?: string | null } | null;
};

/**
 * Whether a post carries a picture, a GIF or a video. Such a post may go
 * without text (the media says it); any other post needs words, and a
 * poll's text is its question.
 */
export function carriesMedia(post: PostMediaShape): boolean {
  return (
    (post.images?.length ?? 0) > 0 ||
    Boolean(post.image) ||
    Boolean(post.imageUrl) ||
    Boolean(post.gif?.giphyId) ||
    Boolean(post.video?.key)
  );
}

/** The message when a post has neither words nor media. */
export const NEEDS_TEXT_MESSAGE =
  "Write something, or add a picture, GIF or video.";
