import { describe, expect, it } from "vitest";

import {
  DIGEST_UNSUBSCRIBE_MAILTO,
  digestListUnsubscribeHeaders,
  signUnsubscribeToken,
  unsubscribeConfirmStatus,
  unsubscribeSecret,
  verifyUnsubscribeToken,
} from "./unsubscribe-token";

const SECRET = "test-unsubscribe-secret";

describe("unsubscribe tokens", () => {
  it("round-trips a digest opt-out for a user", () => {
    const token = signUnsubscribeToken(
      { userId: "user-1", scope: "digest" },
      SECRET,
    );
    expect(verifyUnsubscribeToken(token, SECRET)).toEqual({
      userId: "user-1",
      scope: "digest",
    });
  });

  it("rejects a tampered payload, a bad signature, and the wrong secret", () => {
    const token = signUnsubscribeToken(
      { userId: "user-1", scope: "digest" },
      SECRET,
    );
    const [body, sig] = token.split(".");
    const flipped = Buffer.from(body!, "base64url");
    flipped[0] = flipped[0]! ^ 0xff;
    const tampered = `${flipped.toString("base64url")}.${sig}`;

    expect(verifyUnsubscribeToken(tampered, SECRET)).toBeNull();
    expect(
      verifyUnsubscribeToken(`${body}.${sig!.slice(0, -1)}x`, SECRET),
    ).toBeNull();
    expect(verifyUnsubscribeToken(token, "other-secret")).toBeNull();
    expect(verifyUnsubscribeToken("not-a-token", SECRET)).toBeNull();
    expect(verifyUnsubscribeToken("", SECRET)).toBeNull();
  });

  it("prefers the dedicated secret and falls back to the auth secret", () => {
    expect(
      unsubscribeSecret({
        DIGEST_UNSUBSCRIBE_SECRET: " dedicated ",
        BETTER_AUTH_SECRET: "auth",
      }),
    ).toBe("dedicated");
    expect(
      unsubscribeSecret({
        BETTER_AUTH_SECRET: " auth ",
      }),
    ).toBe("auth");
    expect(unsubscribeSecret({})).toBeNull();
  });

  it("shows the confirm form only for a token that verifies", () => {
    const token = signUnsubscribeToken(
      { userId: "user-1", scope: "digest" },
      SECRET,
    );
    expect(unsubscribeConfirmStatus(token, SECRET, false)).toBe("ready");
    expect(unsubscribeConfirmStatus(token, SECRET, true)).toBe("done");
    expect(unsubscribeConfirmStatus("nope", SECRET, false)).toBe("invalid");
    expect(unsubscribeConfirmStatus(undefined, SECRET, false)).toBe("invalid");
    expect(unsubscribeConfirmStatus(token, null, false)).toBe("invalid");
  });

  it("builds List-Unsubscribe headers without campaign tags", () => {
    const headers = digestListUnsubscribeHeaders("tok_en.sig");
    expect(headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(headers["List-Unsubscribe"]).toBe(
      `<https://www.aitcommunity.org/api/email/unsubscribe?t=tok_en.sig>, <${DIGEST_UNSUBSCRIBE_MAILTO}>`,
    );
    expect(headers["List-Unsubscribe"]).not.toContain("utm_");
  });
});
