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
 * Whether a stored post carries a picture, a GIF or a video: the data
 * rule the collection checks for every writer (a post without text must
 * carry something). Members meet the stricter `mayGoWithoutWords`.
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

/**
 * Whether a member's post may go without words, so that it still says
 * something to everyone, screen readers included: a GIF (GIPHY gives it a
 * title), or pictures that all have a description. A video (no text
 * alternative yet), a legacy picture (no description), a poll (its words
 * are the question) and an empty post need words. The one rule for the
 * editor and the server.
 */
export function mayGoWithoutWords(media: {
  gif?: boolean;
  /** The descriptions of the pictures the post will carry. */
  pictureAlts?: readonly string[];
}): boolean {
  if (media.gif) return true;
  const alts = media.pictureAlts ?? [];
  return alts.length > 0 && alts.every((alt) => alt.trim() !== "");
}

/** The message when a post may not go without words. */
export const NEEDS_TEXT_MESSAGE =
  "Write something, or add a GIF or pictures with descriptions.";
