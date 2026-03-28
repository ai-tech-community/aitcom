import { resolve4, resolve6 } from "node:dns/promises";

/**
 * Validate that a webhook URL is safe to make outbound requests to.
 * Blocks private/internal IPs and non-HTTPS URLs to prevent SSRF.
 *
 * Defends against: direct private IPs, IPv6-mapped IPv4, decimal/octal/hex
 * IP notation, bracket-enclosed IPv6, cloud metadata endpoints, and DNS
 * rebinding (by resolving the hostname and checking resolved IPs).
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
    return { ok: false, reason: "Webhook URL must not point to cloud metadata services" };
  }

  // Block private/internal IP ranges (RFC 1918, link-local, etc.)
  if (isPrivateHostname(hostname)) {
    return { ok: false, reason: "Webhook URL must not point to a private/internal address" };
  }

  // DNS resolution check — resolve hostname and verify all IPs are public.
  // Catches DNS rebinding where hostname resolves to internal IP.
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
    return { ok: false, reason: "Webhook URL must not point to cloud metadata services" };
  }

  if (isPrivateHostname(hostname)) {
    return { ok: false, reason: "Webhook URL must not point to a private/internal address" };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function isPrivateHostname(hostname: string): boolean {
  // Strip brackets from IPv6 notation [::ffff:127.0.0.1]
  const stripped = hostname.replace(/^\[|\]$/g, "");

  // Block IPv6-mapped IPv4 (::ffff:127.0.0.1, ::ffff:10.0.0.1, etc.)
  const mappedV4 = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(stripped);
  if (mappedV4) {
    return isPrivateIPv4(mappedV4[1]!);
  }

  // Block decimal IP notation (e.g. 2130706433 = 127.0.0.1)
  if (/^\d+$/.test(stripped) && stripped.length <= 10) {
    const num = Number(stripped);
    if (num >= 0 && num <= 0xffffffff) {
      const a = (num >>> 24) & 0xff;
      const b = (num >>> 16) & 0xff;
      const c = (num >>> 8) & 0xff;
      const d = num & 0xff;
      return isPrivateIPv4(`${a}.${b}.${c}.${d}`);
    }
  }

  // Block hex IP notation (e.g. 0x7f000001 = 127.0.0.1)
  if (/^0x[0-9a-f]+$/i.test(stripped) && stripped.length <= 12) {
    const num = Number(stripped);
    if (!isNaN(num) && num >= 0 && num <= 0xffffffff) {
      const a = (num >>> 24) & 0xff;
      const b = (num >>> 16) & 0xff;
      const c = (num >>> 8) & 0xff;
      const d = num & 0xff;
      return isPrivateIPv4(`${a}.${b}.${c}.${d}`);
    }
  }

  // Block octal IP notation (e.g. 0177.0.0.1 = 127.0.0.1)
  if (/^0\d{1,3}(\.\d{1,3}){3}$/.test(stripped)) {
    const parts = stripped.split(".").map((p) => parseInt(p, 8));
    if (parts.every((p) => !isNaN(p) && p >= 0 && p <= 255)) {
      return isPrivateIPv4(parts.join("."));
    }
  }

  // Standard dotted-decimal IPv4
  if (isPrivateIPv4(stripped)) return true;

  // Block IPv6 private ranges: ULA (fc/fd), link-local (fe80), loopback (::1)
  if (
    stripped === "::1" ||
    stripped.startsWith("fc") ||
    stripped.startsWith("fd") ||
    stripped.startsWith("fe80")
  ) {
    return true;
  }

  return false;
}

function isPrivateIPv4(ip: string): boolean {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!match) return false;

  const [, aStr, bStr] = match;
  const a = Number(aStr);
  const b = Number(bStr);

  // 127.0.0.0/8 (loopback)
  if (a === 127) return true;
  // 10.0.0.0/8
  if (a === 10) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 169.254.0.0/16 (link-local)
  if (a === 169 && b === 254) return true;
  // 100.64.0.0/10 (carrier-grade NAT / Tailscale)
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 0.0.0.0/8
  if (a === 0) return true;

  return false;
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
    return { ok: false, reason: "Webhook hostname does not resolve to any IP address" };
  }

  for (const ip of ipv4s) {
    if (isPrivateIPv4(ip)) {
      return { ok: false, reason: "Webhook hostname resolves to a private/internal IP address" };
    }
  }

  for (const ip of ipv6s) {
    const lower = ip.toLowerCase();
    if (
      lower === "::1" ||
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      lower.startsWith("fe80") ||
      lower.startsWith("::ffff:")
    ) {
      return { ok: false, reason: "Webhook hostname resolves to a private/internal IP address" };
    }
  }

  return { ok: true };
}
