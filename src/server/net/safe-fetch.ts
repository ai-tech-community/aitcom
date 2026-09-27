import { validateWebhookUrl } from "@/server/agent/validate-webhook-url";

const MAX_REDIRECTS = 5;

export interface SafeFetchOptions {
  /** Honest identification of the feature making the request. */
  userAgent: string;
  /** Budget for the whole request: every redirect hop and the body read. */
  timeoutMs: number;
}

export interface SafeResponse {
  response: Response;
  /** The URL that finally answered, after redirects. */
  url: string;
}

/**
 * Fetch a user-supplied URL behind the SSRF guard. Re-validates EVERY hop:
 * fetch() uses redirect:"manual" so each redirect's Location is validated
 * before we follow it, preventing a public URL from redirecting into an
 * internal host. One abort signal covers all hops and the body read, so a
 * slow server cannot hold the request open past `timeoutMs`.
 *
 * Residual risk (accepted): validateWebhookUrl resolves DNS to check the IP,
 * then fetch() resolves the hostname again independently, leaving a narrow
 * TOCTOU window where a hostile low-TTL DNS server could rebind to an internal
 * IP between the two lookups. Fully closing this requires pinning the
 * connection to the validated IP (a custom undici Agent.connect.lookup), and
 * undici is not a dependency here. We accept the window because it is heavily
 * mitigated: callers are reachable only by active community members and are
 * rate limited, and the guard re-runs on every redirect hop. Revisit with
 * IP-pinning if a caller is ever exposed more broadly.
 */
export async function safeFetch(
  url: string,
  options: SafeFetchOptions,
): Promise<SafeResponse> {
  const signal = AbortSignal.timeout(options.timeoutMs);
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const guard = await validateWebhookUrl(current);
    if (!guard.ok) {
      throw new Error(`Refusing to fetch URL: ${guard.reason}`);
    }
    const res = await fetch(current, {
      signal,
      redirect: "manual",
      headers: {
        "user-agent": options.userAgent,
        accept: "text/html,application/xhtml+xml,image/*;q=0.9,*/*;q=0.5",
      },
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) {
        throw new Error(`Redirect with no Location (status ${res.status})`);
      }
      current = new URL(location, current).href;
      continue;
    }
    if (!res.ok) {
      throw new Error(`Request failed with status ${res.status}`);
    }
    return { response: res, url: current };
  }
  throw new Error("Too many redirects");
}

/**
 * Read a response body up to `maxBytes`. By default a larger body throws
 * (bounds memory); with `truncate` the read stops quietly at the cap, for
 * callers that only need the start of a document (its <head>).
 */
export async function readBodyCapped(
  res: Response,
  maxBytes: number,
  { truncate = false }: { truncate?: boolean } = {},
): Promise<Buffer> {
  if (!res.body) {
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength <= maxBytes) return buf;
    if (truncate) return buf.subarray(0, maxBytes);
    throw new Error("Response too large");
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    if (total + value.byteLength > maxBytes) {
      await reader.cancel();
      if (!truncate) throw new Error("Response too large");
      chunks.push(value.subarray(0, maxBytes - total));
      total = maxBytes;
      break;
    }
    total += value.byteLength;
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
