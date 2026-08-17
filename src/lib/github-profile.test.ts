import { describe, expect, it, vi } from "vitest";

import { fetchGithubProfile } from "./github-profile";

describe("fetchGithubProfile", () => {
  it("uses the authed /user endpoint when a token is present", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        login: "octocat",
        html_url: "https://github.com/octocat",
      }),
    });

    const profile = await fetchGithubProfile(
      { accessToken: "token", accountId: "1" },
      fetchFn as unknown as typeof fetch,
    );

    expect(profile).toEqual({
      login: "octocat",
      htmlUrl: "https://github.com/octocat",
    });
    expect(fetchFn).toHaveBeenCalledWith(
      "https://api.github.com/user",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer token",
        }),
      }),
    );
  });

  it("falls back to the public user-id lookup", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ login: "octocat" }),
    });

    const profile = await fetchGithubProfile(
      { accountId: "42" },
      fetchFn as unknown as typeof fetch,
    );

    expect(profile?.login).toBe("octocat");
    expect(profile?.htmlUrl).toBe("https://github.com/octocat");
    expect(fetchFn).toHaveBeenCalledWith(
      "https://api.github.com/user/42",
      expect.any(Object),
    );
  });

  it("skips the public lookup for non-numeric account ids", async () => {
    const fetchFn = vi.fn();
    const profile = await fetchGithubProfile(
      { accountId: "not-a-github-id" },
      fetchFn as unknown as typeof fetch,
    );
    expect(profile).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
