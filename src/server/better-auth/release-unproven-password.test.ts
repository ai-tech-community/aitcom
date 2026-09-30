import { describe, expect, it, vi } from "vitest";

import { createProviderVerificationGuard } from "./release-unproven-password";

function guard(emailVerificationRequired = true) {
  const release = vi.fn().mockResolvedValue(true);
  const revert = vi.fn().mockResolvedValue(undefined);
  return {
    release,
    revert,
    ...createProviderVerificationGuard({
      emailVerificationRequired,
      release,
      revert,
    }),
  };
}

describe("createProviderVerificationGuard", () => {
  it("releases the password when an OAuth callback verifies the email", async () => {
    const g = guard();
    const ctx = { path: "/callback/:id" };

    g.before({ emailVerified: true }, ctx);
    await g.after({ id: "u1" }, ctx);

    expect(g.release).toHaveBeenCalledWith("u1");
  });

  it("releases once per update, not on a later update in the same request", async () => {
    const g = guard();
    const ctx = { path: "/callback/google" };

    g.before({ emailVerified: true }, ctx);
    await g.after({ id: "u1" }, ctx);
    await g.after({ id: "u1" }, ctx);

    expect(g.release).toHaveBeenCalledTimes(1);
  });

  it("ignores the email-link verification route", async () => {
    const g = guard();
    const ctx = { path: "/verify-email" };

    g.before({ emailVerified: true }, ctx);
    await g.after({ id: "u1" }, ctx);

    expect(g.release).not.toHaveBeenCalled();
  });

  it("ignores callback updates that do not verify the email", async () => {
    const g = guard();
    const ctx = { path: "/callback/:id" };

    g.before({ emailVerified: false }, ctx);
    await g.after({ id: "u1" }, ctx);

    expect(g.release).not.toHaveBeenCalled();
  });

  it("does nothing outside a request (no hook context)", async () => {
    const g = guard();

    g.before({ emailVerified: true }, null);
    await g.after({ id: "u1" }, null);

    expect(g.release).not.toHaveBeenCalled();
  });

  it("does nothing when email verification is not required", async () => {
    const g = guard(false);
    const ctx = { path: "/callback/:id" };

    g.before({ emailVerified: true }, ctx);
    await g.after({ id: "u1" }, ctx);

    expect(g.release).not.toHaveBeenCalled();
  });

  it("does not let one request's mark leak into another", async () => {
    const g = guard();

    g.before({ emailVerified: true }, { path: "/callback/:id" });
    await g.after({ id: "u2" }, { path: "/callback/:id" });

    expect(g.release).not.toHaveBeenCalled();
  });

  it("covers ID-token sign-in, which runs the same join", async () => {
    const g = guard();
    const ctx = { path: "/sign-in/social" };

    g.before({ emailVerified: true }, ctx);
    await g.after({ id: "u1" }, ctx);

    expect(g.release).toHaveBeenCalledWith("u1");
  });

  it("puts the account back to unverified when the release fails", async () => {
    const g = guard();
    g.release.mockRejectedValue(new Error("db blip"));
    const ctx = { path: "/callback/:id" };

    g.before({ emailVerified: true }, ctx);
    await expect(g.after({ id: "u1" }, ctx)).rejects.toThrow("db blip");

    expect(g.revert).toHaveBeenCalledWith("u1");
  });

  it("does not revert after a successful release", async () => {
    const g = guard();
    const ctx = { path: "/callback/:id" };

    g.before({ emailVerified: true }, ctx);
    await g.after({ id: "u1" }, ctx);

    expect(g.revert).not.toHaveBeenCalled();
  });
});
