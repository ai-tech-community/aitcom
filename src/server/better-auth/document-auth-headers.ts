export type DocumentCookie = {
  name: string;
  value: string;
};

const SESSION_TOKEN = "session_token";
const SESSION_COOKIE = "better-auth.session_token";
const SECURE_SESSION_COOKIE = `__Secure-${SESSION_COOKIE}`;

/**
 * Next.js Hub document: `headers()` can omit Cookie (or keep only NEXT_LOCALE)
 * while `cookies()` still has `__Secure-better-auth.session_token`. Isolated
 * `GET /api/auth/get-session` is not this walk — Hub `getSession` must see
 * the cookie the browser just stored from Set-Cookie.
 */
export function cookieHeaderForDocumentAuth(
  incomingCookieHeader: string | null | undefined,
  documentCookies: DocumentCookie[],
): string {
  const merged = new Map<string, string>();

  for (const part of (incomingCookieHeader ?? "").split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const name = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1);
    if (name) merged.set(name, value);
  }

  for (const cookie of documentCookies) {
    if (cookie.name && cookie.value) {
      merged.set(cookie.name, cookie.value);
    }
  }

  const unprefixed = merged.get(SESSION_COOKIE);
  const secure = merged.get(SECURE_SESSION_COOKIE);
  if (unprefixed && !secure) {
    merged.set(SECURE_SESSION_COOKIE, unprefixed);
  }
  if (secure && !unprefixed) {
    merged.set(SESSION_COOKIE, secure);
  }

  return [...merged.entries()]
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

export function headersForDocumentAuth(
  incoming: Headers,
  documentCookies: DocumentCookie[],
): Headers {
  const headers = new Headers(incoming);
  const cookie = cookieHeaderForDocumentAuth(
    headers.get("cookie"),
    documentCookies,
  );
  if (cookie) {
    headers.set("cookie", cookie);
  }
  return headers;
}

export function documentCookiesHaveSessionToken(
  documentCookies: DocumentCookie[],
): boolean {
  return documentCookies.some(
    (cookie) => cookie.name.includes(SESSION_TOKEN) && Boolean(cookie.value),
  );
}
