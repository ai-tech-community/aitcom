/**
 * Validate that a webhook URL is safe to make outbound requests to.
 * Blocks private/internal IPs and non-HTTPS URLs to prevent SSRF.
 */
export function validateWebhookUrl(raw: string): { ok: true } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "Invalid URL" };
  }

  if (url.protocol !== "https:") {
    return { ok: false, reason: "Webhook URL must use HTTPS" };
  }

  // Block localhost / loopback
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

  // Block private/internal IP ranges (RFC 1918, link-local, etc.)
  if (isPrivateHostname(hostname)) {
    return { ok: false, reason: "Webhook URL must not point to a private/internal address" };
  }

  // Block common cloud metadata endpoints
  if (
    hostname === "169.254.169.254" ||
    hostname === "metadata.google.internal" ||
    hostname === "metadata.internal"
  ) {
    return { ok: false, reason: "Webhook URL must not point to cloud metadata services" };
  }

  return { ok: true };
}

function isPrivateHostname(hostname: string): boolean {
  // Match raw IPv4 addresses against private ranges
  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number) as [number, number, number, number, number];
    // 10.0.0.0/8
    if (a === 10) return true;
    // 172.16.0.0/12
    if (a === 172 && b! >= 16 && b! <= 31) return true;
    // 192.168.0.0/16
    if (a === 192 && b === 168) return true;
    // 169.254.0.0/16 (link-local)
    if (a === 169 && b === 254) return true;
    // 100.64.0.0/10 (carrier-grade NAT / Tailscale)
    if (a === 100 && b! >= 64 && b! <= 127) return true;
    // 0.0.0.0/8
    if (a === 0) return true;
  }

  // Block IPv6 private ranges embedded in bracket notation
  const stripped = hostname.replace(/^\[|\]$/g, "");
  if (stripped.startsWith("fc") || stripped.startsWith("fd") || stripped.startsWith("fe80")) {
    return true;
  }

  return false;
}
