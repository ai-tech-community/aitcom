import { describe, expect, it, vi } from "vitest";

import { guardOAuthAccountCreate } from "./release-unproven-password";

describe("guardOAuthAccountCreate", () => {
  it("releases the password when an OAuth account is attached", async () => {
    const release = vi.fn().mockResolvedValue(true);
    await guardOAuthAccountCreate(
      { userId: "u1", providerId: "google" },
      { emailVerificationRequired: true, release },
    );
    expect(release).toHaveBeenCalledWith("u1");
  });

  it("ignores the password account itself being created", async () => {
    const release = vi.fn();
    await guardOAuthAccountCreate(
      { userId: "u1", providerId: "credential" },
      { emailVerificationRequired: true, release },
    );
    expect(release).not.toHaveBeenCalled();
  });

  it("does nothing when email verification is not required", async () => {
    const release = vi.fn();
    await guardOAuthAccountCreate(
      { userId: "u1", providerId: "github" },
      { emailVerificationRequired: false, release },
    );
    expect(release).not.toHaveBeenCalled();
  });

  it("propagates a failed release so the link is aborted", async () => {
    const release = vi.fn().mockRejectedValue(new Error("db down"));
    await expect(
      guardOAuthAccountCreate(
        { userId: "u1", providerId: "google" },
        { emailVerificationRequired: true, release },
      ),
    ).rejects.toThrow("db down");
  });
});
