import { describe, expect, it } from "vitest";

import {
  getAuthClientErrorMessage,
  isEmailNotVerifiedError,
  oauthErrorCallbackURL,
  oauthErrorMessageKey,
} from "./auth-errors";

describe("isEmailNotVerifiedError", () => {
  it("recognizes Better Auth EMAIL_NOT_VERIFIED", () => {
    expect(
      isEmailNotVerifiedError({
        code: "EMAIL_NOT_VERIFIED",
        message: "Email not verified",
        status: 403,
      }),
    ).toBe(true);
  });

  it("falls back to the 403 message when the code is missing", () => {
    expect(
      isEmailNotVerifiedError({
        message: "Email not verified",
        status: 403,
      }),
    ).toBe(true);
  });

  it("ignores other sign-in failures", () => {
    expect(
      isEmailNotVerifiedError({
        code: "INVALID_EMAIL_OR_PASSWORD",
        message: "Invalid email or password",
        status: 401,
      }),
    ).toBe(false);
    expect(isEmailNotVerifiedError(null)).toBe(false);
  });
});

describe("getAuthClientErrorMessage", () => {
  it("surfaces Better Auth Invalid origin from a returned client error", () => {
    expect(
      getAuthClientErrorMessage(
        { message: "Invalid origin", status: 403 },
        "Sign up failed",
      ),
    ).toBe("Invalid origin");
  });

  it("surfaces Invalid origin when the client throws instead of returning error", () => {
    expect(
      getAuthClientErrorMessage(new Error("Invalid origin"), "Sign up failed"),
    ).toBe("Invalid origin");
  });

  it("uses the fallback when the error has no message", () => {
    expect(getAuthClientErrorMessage(null, "Sign up failed")).toBe(
      "Sign up failed",
    );
    expect(getAuthClientErrorMessage({}, "Sign up failed")).toBe(
      "Sign up failed",
    );
  });
});

describe("oauthErrorMessageKey", () => {
  it("maps Better Auth OAuth codes to member-facing keys", () => {
    expect(oauthErrorMessageKey("account_not_linked")).toBe(
      "oauthUnverifiedEmail",
    );
    expect(oauthErrorMessageKey("unable_to_link_account")).toBe(
      "oauthUnverifiedEmail",
    );
    expect(
      oauthErrorMessageKey("account_already_linked_to_different_user"),
    ).toBe("oauthAccountInUse");
    expect(oauthErrorMessageKey("invalid_code")).toBe("oauthFailed");
  });

  it("stays quiet for no error or a cancelled consent screen", () => {
    expect(oauthErrorMessageKey(null)).toBeNull();
    expect(oauthErrorMessageKey("access_denied")).toBeNull();
  });
});

describe("oauthErrorCallbackURL", () => {
  it("keeps the query and drops a previous error", () => {
    expect(
      oauthErrorCallbackURL(
        "/en/auth/signin",
        new URLSearchParams("redirect=%2Fx&error=a&error_description=b"),
      ),
    ).toBe("/en/auth/signin?redirect=%2Fx");
    expect(oauthErrorCallbackURL("/en/auth/signin", null)).toBe(
      "/en/auth/signin",
    );
  });
});
