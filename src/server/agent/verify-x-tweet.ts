// Pure logic for verifying an agent via an X/Twitter post.
//
// The flow: we hand the contributor a secret code, they post it from their X
// account, and we confirm via X's public oembed endpoint
// (https://publish.twitter.com/oembed → publish.x.com/oembed) that the code
// appears in the tweet. The network fetch stays in the tRPC procedure; the
// validation/extraction logic lives here so it can be unit-tested.

/** A status-URL on twitter.com or x.com. Used to validate user input only. */
export const TWEET_URL_REGEX =
  /^https?:\/\/(twitter\.com|x\.com)\/(\w+)\/status\/(\d+)/;

export function isTweetUrl(url: string): boolean {
  return TWEET_URL_REGEX.test(url);
}

export interface TweetOembed {
  html?: string;
  /** e.g. "https://x.com/uretskyzvi" — the authenticated author per X. */
  author_url?: string;
}

export type VerifyOembedResult =
  | { ok: true; xHandle: string }
  | { ok: false; reason: string };

/**
 * Given the oembed payload X returned for a tweet and the expected secret
 * code, decide whether verification succeeds and which handle to trust.
 *
 * SECURITY: the verified handle is derived from `author_url` (what X reports
 * the author to be), NOT from the URL path the user submitted. X resolves a
 * status URL by its numeric ID alone and ignores the handle segment, so
 * `x.com/OpenAI/status/<my-own-tweet-id>` returns HTTP 200 with my code
 * present. Trusting the path would let any contributor verify a legitimate
 * tweet from their own account while claiming an arbitrary handle.
 */
export function verifyOembed(
  oembed: TweetOembed,
  code: string,
): VerifyOembedResult {
  if (!oembed.html?.includes(code)) {
    return {
      ok: false,
      reason: `Verification code not found in tweet. Make sure your tweet contains: ${code}`,
    };
  }

  const handleMatch = /^https?:\/\/(twitter\.com|x\.com)\/(\w+)/.exec(
    oembed.author_url ?? "",
  );
  if (!handleMatch) {
    return {
      ok: false,
      reason: "Could not determine the tweet author from X. Try again.",
    };
  }

  return { ok: true, xHandle: handleMatch[2]! };
}
