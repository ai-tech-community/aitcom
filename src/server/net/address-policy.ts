import ipaddr from "ipaddr.js";

/**
 * May we open a connection to this IP? Only ordinary public unicast
 * addresses: never loopback, private, link-local (cloud metadata),
 * carrier-grade NAT, multicast, reserved, documentation, benchmarking, or
 * IPv6 transition ranges (NAT64, 6to4, Teredo) that can tunnel to them.
 * IPv4-mapped IPv6 is judged by its IPv4 part. Anything unparsable is refused.
 */
export function isPublicAddress(ip: string): boolean {
  if (!ip || !ipaddr.isValid(ip)) return false;
  try {
    return ipaddr.process(ip).range() === "unicast";
  } catch {
    return false;
  }
}
