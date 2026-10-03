import {
  lookup as dnsLookup,
  type LookupAddress,
  type LookupAllOptions,
  type LookupOneOptions,
} from "node:dns";
import { isIP } from "node:net";

import {
  Agent,
  fetch as undiciFetch,
  type RequestInit,
  type Response,
} from "undici";

import { isPublicAddress } from "./address-policy";

export type LookupOptions = LookupOneOptions | LookupAllOptions;
export type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;
export type Resolver = (
  hostname: string,
  options: LookupOptions,
  callback: LookupCallback,
) => void;

/** A connection was refused because DNS answered with a non-public address. */
export class BlockedAddressError extends Error {
  constructor(readonly hostname: string) {
    super(
      `Refusing to connect to ${hostname}: it resolves to a non-public address`,
    );
    this.name = "BlockedAddressError";
  }
}

/**
 * The connect-time DNS step: resolve once, check every answer, and give the
 * socket only answers that passed. The check and the connection use the same
 * answer, so a DNS server cannot switch to an internal address in between.
 */
export function createPinnedLookup(
  resolve: Resolver = dnsLookup as unknown as Resolver,
  isAllowed: (ip: string) => boolean = isPublicAddress,
) {
  return (
    hostname: string,
    options: LookupOptions,
    callback: LookupCallback,
  ): void => {
    resolve(hostname, { ...options, all: true }, (err, address) => {
      if (err) {
        callback(err, []);
        return;
      }
      const answers: LookupAddress[] = Array.isArray(address) ? address : [];
      if (answers.length === 0 || answers.some((a) => !isAllowed(a.address))) {
        callback(new BlockedAddressError(hostname), []);
        return;
      }
      if ((options as LookupAllOptions).all) callback(null, answers);
      else callback(null, answers[0]!.address, answers[0]!.family);
    });
  };
}

/**
 * undici's own fetch with one pinned Agent (its own Agent, so the pair is
 * version-consistent on every Node we run). Redirects are never followed:
 * callers that follow them do it hop by hop, so each hop is checked again.
 */
export function createPinnedFetch(
  options: {
    resolve?: Resolver;
    isAllowed?: (ip: string) => boolean;
  } = {},
) {
  const dispatcher = new Agent({
    connect: { lookup: createPinnedLookup(options.resolve, options.isAllowed) },
  });
  const isAllowed = options.isAllowed ?? isPublicAddress;
  return async (
    url: string | URL,
    init: RequestInit = {},
  ): Promise<Response> => {
    // An IP-literal host never reaches connect.lookup (there is nothing to
    // resolve), so check it here.
    const host = refusedLiteralHost(url, isAllowed);
    if (host !== null) {
      // Same shape undici gives when the lookup refuses an answer.
      throw new TypeError("fetch failed", {
        cause: new BlockedAddressError(host),
      });
    }
    return undiciFetch(url, { ...init, dispatcher, redirect: "manual" });
  };
}

/**
 * The one IP-literal check: returns the host when the URL names a non-public
 * IP address directly, else null (a DNS name, or a public literal). Literals
 * skip DNS, so the pinned lookup never sees them; every caller that refuses
 * them early uses this so the rule cannot drift. The WHATWG parser has already
 * normalised short, decimal, hex and octal IPv4 forms to dotted form.
 */
export function refusedLiteralHost(
  url: string | URL,
  isAllowed: (ip: string) => boolean = isPublicAddress,
): string | null {
  const hostname = new URL(url).hostname;
  const host =
    hostname.startsWith("[") && hostname.endsWith("]")
      ? hostname.slice(1, -1)
      : hostname;
  return isIP(host) !== 0 && !isAllowed(host) ? host : null;
}

/** The shared pinned fetch for every outbound request to a supplied URL. */
export const pinnedFetch = createPinnedFetch();
