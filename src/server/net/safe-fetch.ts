import { isIP } from "node:net";

import type { Response as PinnedResponse } from "undici";

import { validateWebhookUrl } from "@/server/agent/validate-webhook-url";

import { isPublicAddress } from "./address-policy";
import { BlockedAddressError, pinnedFetch } from "./pinned-transport";

const MAX_REDIRECTS = 5;
/** Callers match the "Refusing to fetch URL" prefix (collectors/errors.ts). */
const NON_PUBLIC_REFUSAL =
  "Refusing to fetch URL: it resolves to a non-public address";
const DEFAULT_ACCEPT =
  "text/html,application/xhtml+xml,image/*;q=0.9,*/*;q=0.5";

export interface SafeFetchOptions {
  /** Honest identification of the feature making the request. */
  userAgent: string;
  /** Budget for the whole request: every redirect hop and the body read. */
  timeoutMs: number;
  /** Overrides the default Accept header (HTML and images). */
  accept?: string;
  /** Return non-2xx answers to the caller instead of throwing. */
  allowErrorStatus?: boolean;
  /** Aborts the request early, in addition to `timeoutMs`. */
  signal?: AbortSignal;
  /**
   * "follow" (default) follows up to 5 redirects, validating each hop.
   * "return" hands the first 3xx back so the caller can apply its own
   * per-hop rules (the data-collector context does this).
   */
  redirects?: "follow" | "return";
}

export interface SafeResponse {
  /** undici's Response: the pinned transport is undici's own fetch. */
  response: PinnedResponse;
  /** The URL that finally answered, after redirects. */
  url: string;
}

/**
 * Fetch a user-supplied URL behind the SSRF guard. Re-validates EVERY hop:
 * the pinned transport never follows redirects, so each redirect's Location
 * is validated before we follow it, preventing a public URL from redirecting
 * into an internal host. One abort signal covers all hops and the body read,
 * so a slow server cannot hold the request open past `timeoutMs`.
 *
 * DNS rebinding: validateWebhookUrl resolves the hostname as a friendly
 * pre-check, but the connection does not trust that answer. Every hop goes
 * through `pinnedFetch` (pinned-transport.ts), which resolves once at
 * connect time, checks every answer against the address policy, and
 * connects only to the answers it checked. A DNS server cannot switch to an
 * internal address between the check and the connection, so that window is
 * closed. IP-literal URLs never reach DNS; they are refused by the pre-check
 * (and again here and in the transport) unless they are public.
 */
export async function safeFetch(
  url: string,
  options: SafeFetchOptions,
): Promise<SafeResponse> {
  const timeout = AbortSignal.timeout(options.timeoutMs);
  const signal = options.signal
    ? AbortSignal.any([timeout, options.signal])
    : timeout;
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const guard = await validateWebhookUrl(current);
    if (!guard.ok) {
      throw new Error(`Refusing to fetch URL: ${guard.reason}`);
    }
    if (isNonPublicIpLiteral(current)) {
      throw new Error(NON_PUBLIC_REFUSAL);
    }
    const res = await pinnedFetch(current, {
      signal,
      headers: {
        "user-agent": options.userAgent,
        accept: options.accept ?? DEFAULT_ACCEPT,
      },
    }).catch((err: unknown) => {
      throw isBlockedAddress(err) ? new Error(NON_PUBLIC_REFUSAL) : err;
    });
    if (res.status >= 300 && res.status < 400) {
      if (options.redirects === "return") {
        return { response: res, url: current };
      }
      const location = res.headers.get("location");
      if (!location) {
        throw new Error(`Redirect with no Location (status ${res.status})`);
      }
      current = new URL(location, current).href;
      continue;
    }
    if (!res.ok && !options.allowErrorStatus) {
      throw new Error(`Request failed with status ${res.status}`);
    }
    return { response: res, url: current };
  }
  throw new Error("Too many redirects");
}

/**
 * An IP-literal host that is not public. The pre-check refuses these too;
 * checking here as well keeps safeFetch safe on its own, before any request.
 */
function isNonPublicIpLiteral(url: string): boolean {
  const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
  return isIP(host) !== 0 && !isPublicAddress(host);
}

/** The pinned transport refused the address (it rejects with this cause). */
function isBlockedAddress(err: unknown): boolean {
  return (
    err instanceof BlockedAddressError ||
    (err instanceof Error && err.cause instanceof BlockedAddressError)
  );
}

/**
 * Read a response body up to `maxBytes`. By default a larger body throws
 * (bounds memory); with `truncate` the read stops quietly at the cap, for
 * callers that only need the start of a document (its <head>).
 */
export async function readBodyCapped(
  res: PinnedResponse | Response,
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
