import { describe, expect, it } from "vitest";
import { isPublicAddress } from "./address-policy";

describe("isPublicAddress", () => {
  it.each([
    "93.184.216.34",
    "1.1.1.1",
    "2606:4700:4700::1111",
    "2a00:1450:4001:80b::200e",
  ])("allows the public address %s", (ip) => {
    expect(isPublicAddress(ip)).toBe(true);
  });

  it.each([
    ["loopback", "127.0.0.1"],
    ["private 10/8", "10.1.2.3"],
    ["private 172.16/12", "172.20.0.1"],
    ["private 192.168/16", "192.168.1.1"],
    ["link-local / metadata", "169.254.169.254"],
    ["carrier-grade NAT", "100.64.0.1"],
    ["this network", "0.0.0.0"],
    ["benchmarking 198.18/15", "198.18.0.1"],
    ["multicast", "224.0.0.1"],
    ["reserved 240/4", "240.0.0.1"],
    ["broadcast", "255.255.255.255"],
    ["IPv6 unspecified", "::"],
    ["IPv6 loopback", "::1"],
    ["IPv6 unique local", "fd00::1"],
    ["IPv6 link-local", "fe80::1"],
    ["IPv6 multicast", "ff02::1"],
    ["IPv4-mapped loopback", "::ffff:127.0.0.1"],
    ["IPv4-mapped private", "::ffff:10.0.0.1"],
    ["NAT64", "64:ff9b::7f00:1"],
    ["6to4", "2002:7f00:1::1"],
    ["Teredo", "2001::1"],
    ["documentation", "2001:db8::1"],
    ["not an address", "example.com"],
    ["empty", ""],
  ])("refuses %s (%s)", (_label, ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });

  it("judges an IPv4-mapped public address by its IPv4 part", () => {
    expect(isPublicAddress("::ffff:93.184.216.34")).toBe(true);
  });
});
