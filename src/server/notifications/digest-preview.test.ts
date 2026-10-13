import { describe, expect, it } from "vitest";

import {
  assertDigestTestRecipient,
  DIGEST_TEST_RECIPIENT,
  previewAccess,
  previewSendPlan,
} from "./digest-preview";

describe("digest preview access", () => {
  it("requires a signed-in Payload admin", () => {
    expect(previewAccess(null)).toBe(401);
    expect(previewAccess({ email: "", payloadRole: "admin" })).toBe(401);
    expect(previewAccess({ email: "ada@example.com", payloadRole: null })).toBe(
      403,
    );
    expect(
      previewAccess({ email: "ada@example.com", payloadRole: "editor" }),
    ).toBe(403);
    expect(
      previewAccess({ email: "greg@klevox.com", payloadRole: "admin" }),
    ).toBe("ok");
  });
});

describe("digest preview send plan", () => {
  it("renders without sending when send is omitted", () => {
    expect(previewSendPlan({ send: null, to: null })).toEqual({
      action: "render",
    });
  });

  it("sends only to the allowlisted address when send=greg", () => {
    expect(previewSendPlan({ send: "greg", to: null })).toEqual({
      action: "send",
      to: "greg@klevox.com",
    });
    expect(DIGEST_TEST_RECIPIENT).toBe("greg@klevox.com");
    expect(() => assertDigestTestRecipient("greg@klevox.com")).not.toThrow();
    expect(() => assertDigestTestRecipient("member@example.com")).toThrow(
      /refused/,
    );
  });

  it("rejects every other recipient, including a forged to param", () => {
    expect(previewSendPlan({ send: "member@example.com", to: null })).toEqual({
      action: "reject",
    });
    expect(previewSendPlan({ send: "greg", to: "member@example.com" })).toEqual(
      { action: "reject" },
    );
    expect(previewSendPlan({ send: null, to: "greg@klevox.com" })).toEqual({
      action: "reject",
    });
  });
});
