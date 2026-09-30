import { describe, expect, it, vi } from "vitest";

import { assertCanUnlink } from "./unlink-guard";

const ALL_ENABLED = { google: true, github: true, linkedin: true };

describe("assertCanUnlink", () => {
  it("allows unlinking when a password remains", async () => {
    const loadAccounts = vi
      .fn()
      .mockResolvedValue([
        { providerId: "google" },
        { providerId: "credential" },
      ]);
    await expect(
      assertCanUnlink("u1", "google", { loadAccounts, enabled: ALL_ENABLED }),
    ).resolves.toBeUndefined();
    expect(loadAccounts).toHaveBeenCalledWith("u1");
  });

  it("blocks unlinking the last working sign-in method", async () => {
    const loadAccounts = vi
      .fn()
      .mockResolvedValue([
        { providerId: "google" },
        { providerId: "linkedin" },
      ]);
    await expect(
      assertCanUnlink("u1", "google", {
        loadAccounts,
        enabled: { google: true, github: true, linkedin: false },
      }),
    ).rejects.toThrow("Add another sign-in method before disconnecting.");
  });

  it("blocks removing the password when no working provider remains", async () => {
    const loadAccounts = vi
      .fn()
      .mockResolvedValue([
        { providerId: "credential" },
        { providerId: "linkedin" },
      ]);
    await expect(
      assertCanUnlink("u1", "credential", {
        loadAccounts,
        enabled: { google: true, github: true, linkedin: false },
      }),
    ).rejects.toThrow("Add another sign-in method before disconnecting.");
  });

  it("ignores provider ids outside the registry", async () => {
    const loadAccounts = vi.fn();
    await assertCanUnlink("u1", "someone-else", {
      loadAccounts,
      enabled: ALL_ENABLED,
    });
    await assertCanUnlink("u1", undefined, {
      loadAccounts,
      enabled: ALL_ENABLED,
    });
    expect(loadAccounts).not.toHaveBeenCalled();
  });
});
