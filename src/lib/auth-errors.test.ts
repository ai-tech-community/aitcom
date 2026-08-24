import { describe, expect, it } from "vitest";

import {
  getAuthClientErrorMessage,
  isEmailNotVerifiedError,
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
