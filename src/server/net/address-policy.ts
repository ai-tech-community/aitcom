import ipaddr from "ipaddr.js";

/**
 * May we open a connection to this IP? Only ordinary public unicast
 * addresses: never loopback, private, link-local (cloud metadata),
 * carrier-grade NAT, multicast, reserved, documentation, benchmarking, or
 * IPv6 transition ranges (NAT64, 6to4, Teredo, IPv4-compatible) that can
 * tunnel to them.
 * IPv4-mapped IPv6 is judged by its IPv4 part. Anything unparsable is refused.
 */
export function isPublicAddress(ip: string): boolean {
  if (!ip || !ipaddr.isValid(ip)) return false;
  try {
    const addr = ipaddr.process(ip);
    if (addr.range() !== "unicast") return false;
    return !(
      addr.kind() === "ipv6" &&
      IPV6_NOT_PUBLIC.some((range) => (addr as ipaddr.IPv6).match(range))
    );
  } catch {
    return false;
  }
}

/** IPv6 ranges ipaddr.js still calls "unicast" but that are not public. */
const IPV6_NOT_PUBLIC: [ipaddr.IPv6, number][] = [
  // IPv4-compatible IPv6 (deprecated, RFC 4291): ::7f00:1 is 127.0.0.1.
  "::/96",
  // Local-use NAT64 prefix (RFC 8215): can translate to internal IPv4.
  "64:ff9b:1::/48",
  // Site-local (deprecated, RFC 3879): the old private IPv6 range.
  "fec0::/10",
  // Documentation (RFC 9637).
  "3fff::/20",
].map((cidr) => ipaddr.IPv6.parseCIDR(cidr));
