/**
 * The one rule for a lesson's resource link, shared by the server (what it
 * stores) and the builder (what it sends, and which half-typed rows it holds
 * back). One rule on both sides means a link the server stored is never shown
 * as unfinished, and a link the builder sends is never refused.
 *
 * A resource link is a full address (it parses as an absolute URL — web,
 * mail, file transfer…) that fits the stored column, and never one whose
 * scheme runs code in the learner's browser instead of opening something.
 */
export const RESOURCE_URL_MAX_LENGTH = 500;

const CODE_SCHEMES: ReadonlySet<string> = new Set([
  "javascript:",
  "data:",
  "vbscript:",
]);

export function isResourceUrl(url: string): boolean {
  if (url.length > RESOURCE_URL_MAX_LENGTH || url !== url.trim()) return false;
  let protocol: string;
  try {
    ({ protocol } = new URL(url));
  } catch {
    return false;
  }
  return !CODE_SCHEMES.has(protocol);
}
