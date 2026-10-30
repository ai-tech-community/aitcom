import { createHmac } from "crypto";
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
  it("signs and reads a magazine token carrying the subscription id", () => {
    const token = signUnsubscribeToken(
      { subscriptionId: "subscription-1", scope: "magazine" },
      SECRET,
    );
    expect(verifyUnsubscribeToken(token, SECRET)).toEqual({
      subscriptionId: "subscription-1",
      scope: "magazine",
    });
    expect(
      JSON.parse(
        Buffer.from(token.split(".")[0]!, "base64url").toString("utf8"),
      ),
    ).toEqual({
      u: "subscription-1",
      s: "magazine",
    });
  });

  it("existing digest and story tokens still read the same", () => {
    for (const scope of ["digest", "story"] as const) {
      // The wire shape used before magazine subscriptions were added.
      const body = Buffer.from(`{"u":"legacy-user","s":"${scope}"}`).toString(
        "base64url",
      );
      const signature = createHmac("sha256", SECRET)
        .update(body)
        .digest("base64url");
      const token = `${body}.${signature}`;
      expect(verifyUnsubscribeToken(token, SECRET)).toEqual({
        userId: "legacy-user",
        scope,
      });
      expect(
        signUnsubscribeToken({ userId: "legacy-user", scope }, SECRET),
      ).toBe(token);
    }
  });

  it("refuses an unknown scope", () => {
    const body = Buffer.from('{"u":"subscription-1","s":"unknown"}').toString(
      "base64url",
    );
    const signature = createHmac("sha256", SECRET)
      .update(body)
      .digest("base64url");
    expect(verifyUnsubscribeToken(`${body}.${signature}`, SECRET)).toBeNull();
  });

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

  it("round-trips a news-story opt-out and rejects an unknown scope", () => {
    const token = signUnsubscribeToken(
      { userId: "user-1", scope: "story" },
      SECRET,
    );
    expect(verifyUnsubscribeToken(token, SECRET)).toEqual({
      userId: "user-1",
      scope: "story",
    });
    const digest = signUnsubscribeToken(
      { userId: "user-1", scope: "digest" },
      SECRET,
    );
    const body = Buffer.from(
      JSON.stringify({ u: "user-1", s: "broadcast" }),
      "utf8",
    ).toString("base64url");
    const forged = `${body}.${digest.split(".")[1]}`;
    expect(verifyUnsubscribeToken(forged, SECRET)).toBeNull();
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
