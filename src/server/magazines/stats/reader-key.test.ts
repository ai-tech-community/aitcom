// @vitest-environment node
import { describe, expect, it } from "vitest";

import { readerKey, readerKeySecret } from "./reader-key";

const input = {
  viewerId: null,
  ip: "192.0.2.43",
  userAgent: "Magazine reader browser",
  now: new Date("2026-10-28T23:59:59Z"),
  secret: "reader-key-test-secret",
};

describe("magazine reader keys", () => {
  it("keeps one signed-in reader across days and devices", () => {
    const signedIn = { ...input, viewerId: "member-private-id" };
    const key = readerKey(signedIn);
    expect(key).toMatch(/^u[a-f0-9]{32}$/);
    expect(
      readerKey({
        ...signedIn,
        now: new Date("2026-10-30"),
        ip: "other",
        userAgent: "other",
      }),
    ).toBe(key);
    expect(readerKey({ ...signedIn, viewerId: "another-member" })).not.toBe(
      key,
    );
    expect(key).not.toContain(signedIn.viewerId);
  });

  it("rotates signed-out readers by UTC day, IP and user agent", () => {
    const key = readerKey(input);
    expect(key).toMatch(/^a[a-f0-9]{32}$/);
    expect(
      readerKey({ ...input, now: new Date("2026-10-29T00:59:59+01:00") }),
    ).toBe(key);
    expect(
      readerKey({ ...input, now: new Date("2026-10-29T00:00:00Z") }),
    ).not.toBe(key);
    expect(readerKey({ ...input, ip: "192.0.2.44" })).not.toBe(key);
    expect(readerKey({ ...input, userAgent: "Another browser" })).not.toBe(key);
    expect(key).not.toContain(input.ip);
    expect(key).not.toContain(input.userAgent);
  });

  it("uses the secret and the magazine-reader domain", () => {
    // Known HMAC-SHA256 of magazine-reader|anon|2026-10-28|192.0.2.43|Magazine reader browser.
    expect(readerKey(input)).toBe("af28400cbfbff4e0a5439566af3968a64");
    expect(readerKey({ ...input, secret: "another-secret" })).not.toBe(
      readerKey(input),
    );
  });

  it("trims the secret and records nothing without one", () => {
    expect(readerKeySecret({ BETTER_AUTH_SECRET: "  a secret  " })).toBe(
      "a secret",
    );
    expect(readerKeySecret({ BETTER_AUTH_SECRET: " \n " })).toBeNull();
    expect(readerKeySecret({})).toBeNull();
  });
});
