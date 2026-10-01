/**
 * Finishing a join after sign-in. A guest who presses Join is sent to sign
 * in with `?join=<slug>` on the return path (the page they were on — the
 * directory or a community page), and this browser remembers that it asked.
 * Back on the page, the join runs only if that memory matches: the param
 * alone, e.g. in a link someone sent, never joins anyone.
 * Server-safe module: nothing here touches the browser until called.
 */
export const JOIN_COMMUNITY_PARAM = "join";

/** How long a recorded intent stays valid: a generous sign-up round trip. */
export const JOIN_INTENT_TTL_MS = 30 * 60 * 1000;

const INTENT_KEY = "ait:join-intent";

/** The return path that finishes joining `slug` once signed in. */
export function joinReturnPath(currentPath: string, slug: string): string {
  const [path = "/", query = ""] = currentPath.split("?");
  const params = new URLSearchParams(query);
  params.set(JOIN_COMMUNITY_PARAM, slug);
  return `${path}?${params.toString()}`;
}

/** Records that this browser pressed Join for `slug` (before sign-in). */
export function rememberJoinIntent(slug: string, now: number = Date.now()) {
  try {
    window.sessionStorage.setItem(
      INTENT_KEY,
      JSON.stringify({ slug, at: now }),
    );
  } catch {
    // Storage unavailable (private mode): the join will not auto-finish,
    // and the visitor can press Join again after signing in.
  }
}

/**
 * Whether this browser recorded a fresh intent to join `slug`. Consumes the
 * record either way, so it can be used once.
 */
export function takeJoinIntent(slug: string, now: number = Date.now()) {
  try {
    const raw = window.sessionStorage.getItem(INTENT_KEY);
    window.sessionStorage.removeItem(INTENT_KEY);
    if (!raw) return false;
    const intent = JSON.parse(raw) as { slug?: unknown; at?: unknown };
    return (
      intent.slug === slug &&
      typeof intent.at === "number" &&
      now - intent.at >= 0 &&
      now - intent.at < JOIN_INTENT_TTL_MS
    );
  } catch {
    return false;
  }
}
