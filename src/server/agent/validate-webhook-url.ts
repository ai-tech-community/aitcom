import { resolve4, resolve6 } from "node:dns/promises";

import ipaddr from "ipaddr.js";

import { isPublicAddress } from "@/server/net/address-policy";

/**
 * An early, friendly refusal for a supplied URL: non-HTTPS, localhost, cloud
 * metadata names, non-public IP literals (per `isPublicAddress`, including
 * IPv6-mapped IPv4, decimal/octal/hex IPv4 and bracketed IPv6), and hostnames
 * whose DNS answer today is not public. It gives the member a clear reason
 * before anything is sent.
 *
 * It is not the connection guard. DNS can answer differently a moment later
 * (rebinding), so the address actually connected to is checked by the pinned
 * transport in src/server/net/pinned-transport.ts, which every outbound
 * request to a supplied URL goes through.
 */
export async function validateWebhookUrl(
  raw: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "Invalid URL" };
  }

  if (url.protocol !== "https:") {
    return { ok: false, reason: "Webhook URL must use HTTPS" };
  }

  const hostname = url.hostname.toLowerCase();

  // Block localhost / loopback
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    hostname === "0.0.0.0"
  ) {
    return { ok: false, reason: "Webhook URL must not point to localhost" };
  }

  // Block common cloud metadata endpoints
  if (
    hostname === "169.254.169.254" ||
    hostname === "metadata.google.internal" ||
    hostname === "metadata.internal"
  ) {
    return {
      ok: false,
      reason: "Webhook URL must not point to cloud metadata services",
    };
  }

  // Block IP literals that are not public addresses (private, loopback,
  // link-local, multicast, reserved, IPv6 transition ranges, ...)
  if (isPrivateHostname(hostname)) {
    return {
      ok: false,
      reason: "Webhook URL must not point to a private/internal address",
    };
  }

  // DNS resolution check: refuse early, with a clear reason, a hostname whose
  // current answer is not public. Not a rebinding defence (DNS may answer
  // differently at connect time); the pinned transport is the guard.
  const dnsCheck = await checkResolvedIPs(hostname);
  if (!dnsCheck.ok) {
    return dnsCheck;
  }

  return { ok: true };
}

/**
 * Synchronous URL-only validation (no DNS). Kept as the original export name
 * for call sites that cannot await (e.g. inline checks before the async path).
 */
export function validateWebhookUrlSync(
  raw: string,
): { ok: true } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "Invalid URL" };
  }

  if (url.protocol !== "https:") {
    return { ok: false, reason: "Webhook URL must use HTTPS" };
  }

  const hostname = url.hostname.toLowerCase();

  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    hostname === "0.0.0.0"
  ) {
    return { ok: false, reason: "Webhook URL must not point to localhost" };
  }

  if (
    hostname === "169.254.169.254" ||
    hostname === "metadata.google.internal" ||
    hostname === "metadata.internal"
  ) {
    return {
      ok: false,
      reason: "Webhook URL must not point to cloud metadata services",
    };
  }

  if (isPrivateHostname(hostname)) {
    return {
      ok: false,
      reason: "Webhook URL must not point to a private/internal address",
    };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Is the hostname an IP literal that is not a public address? Hostnames that
 * are not IP literals return false here; their DNS answers are checked later.
 */
function isPrivateHostname(hostname: string): boolean {
  const ip = ipLiteralOf(hostname);
  return ip !== null && !isPublicAddress(ip);
}

/**
 * The IP address a hostname spells, or null when it is not an IP literal.
 * Strips IPv6 brackets ([::ffff:127.0.0.1]) and normalises decimal
 * (2130706433), hex (0x7f000001) and octal (0177.0.0.1) IPv4 notations to
 * dotted form. The WHATWG URL parser already does this for URLs; these
 * helpers keep the check correct for any hostname string.
 */
function ipLiteralOf(hostname: string): string | null {
  const stripped = hostname.replace(/^\[|\]$/g, "");
  const ip = numericIPv4(stripped) ?? stripped;
  return ipaddr.isValid(ip) ? ip : null;
}

function numericIPv4(stripped: string): string | null {
  // Decimal IP notation (e.g. 2130706433 = 127.0.0.1)
  if (/^\d+$/.test(stripped) && stripped.length <= 10) {
    const num = Number(stripped);
    if (num >= 0 && num <= 0xffffffff) return dottedIPv4(num);
  }

  // Hex IP notation (e.g. 0x7f000001 = 127.0.0.1)
  if (/^0x[0-9a-f]+$/i.test(stripped) && stripped.length <= 12) {
    const num = Number(stripped);
    if (!isNaN(num) && num >= 0 && num <= 0xffffffff) return dottedIPv4(num);
  }

  // Octal IP notation (e.g. 0177.0.0.1 = 127.0.0.1)
  if (/^0\d{1,3}(\.\d{1,3}){3}$/.test(stripped)) {
    const parts = stripped.split(".").map((p) => parseInt(p, 8));
    if (parts.every((p) => !isNaN(p) && p >= 0 && p <= 255)) {
      return parts.join(".");
    }
  }

  return null;
}

function dottedIPv4(num: number): string {
  const a = (num >>> 24) & 0xff;
  const b = (num >>> 16) & 0xff;
  const c = (num >>> 8) & 0xff;
  const d = num & 0xff;
  return `${a}.${b}.${c}.${d}`;
}

async function checkResolvedIPs(
  hostname: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  // Skip DNS for raw IPs — already checked above
  if (/^[\d.:[\]]+$/.test(hostname)) return { ok: true };

  let ipv4s: string[] = [];
  let ipv6s: string[] = [];

  try {
    ipv4s = await resolve4(hostname);
  } catch {
    // ENODATA / ENOTFOUND — no A records, that's fine
  }

  try {
    ipv6s = await resolve6(hostname);
  } catch {
    // ENODATA / ENOTFOUND — no AAAA records, that's fine
  }

  if (ipv4s.length === 0 && ipv6s.length === 0) {
    return {
      ok: false,
      reason: "Webhook hostname does not resolve to any IP address",
    };
  }

  if ([...ipv4s, ...ipv6s].some((ip) => !isPublicAddress(ip))) {
    return {
      ok: false,
      reason: "Webhook hostname resolves to a private/internal IP address",
    };
  }

  return { ok: true };
}
