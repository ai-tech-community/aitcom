/** The longest address a member may paste (the collectors' own URL limit). */
export const MAX_ADDRESS_LENGTH = 2_048;

const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * Pasted or typed text as a web address, or null. Text without a scheme is
 * read as https ("example.com/jobs"). Only http(s), a host with a dot, and no
 * user name or password. Used by the paste box (no request for text that is
 * not an address) and again by the server.
 *
 * A shape check only, not a network-safety gate: IP literals (`10.0.0.1`)
 * and `localhost.` pass. That is safe because recognising an address never
 * fetches it, and every fetch of a run goes through the collector context
 * (`src/server/collectors/context/`), which is the guard. Do not use this to
 * decide whether an address may be fetched.
 */
export function parseAddress(text: string): URL | null {
  const trimmed = text.trim();
  if (trimmed === "" || trimmed.length > MAX_ADDRESS_LENGTH) return null;
  if (/\s/.test(trimmed)) return null;
  let url: URL;
  try {
    url = new URL(SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!url.hostname.includes(".") || url.username || url.password) return null;
  if (url.href.length > MAX_ADDRESS_LENGTH) return null;
  return url;
}
