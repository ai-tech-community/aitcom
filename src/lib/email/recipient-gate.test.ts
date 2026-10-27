import { describe, expect, it } from "vitest";

import { gatedMailRecipient, MAIL_TEST_RECIPIENT } from "./recipient-gate";

describe("gatedMailRecipient", () => {
  it("returns the normalized address in production", () => {
    expect(
      gatedMailRecipient(" Reader@Example.com ", {
        VERCEL_ENV: "production",
        NODE_ENV: "production",
      }),
    ).toBe("reader@example.com");
  });

  it("allows only the test recipient everywhere else", () => {
    for (const env of [
      {},
      { VERCEL_ENV: "preview", NODE_ENV: "production" },
      { VERCEL_ENV: "production", NODE_ENV: "test" },
    ]) {
      expect(gatedMailRecipient("reader@example.com", env)).toBeNull();
      expect(gatedMailRecipient(" Greg@Klevox.com ", env)).toBe(
        MAIL_TEST_RECIPIENT,
      );
    }
  });

  it("refuses an address without @ or with spaces", () => {
    const env = { VERCEL_ENV: "production", NODE_ENV: "production" };
    expect(gatedMailRecipient("nonsense", env)).toBeNull();
    expect(gatedMailRecipient("bad address@example.com", env)).toBeNull();
  });
});
