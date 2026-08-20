import { describe, expect, it } from "vitest";

import { isEmailNotVerifiedError } from "./auth-errors";

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
