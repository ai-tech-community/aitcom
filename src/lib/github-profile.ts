import { githubProfileUrl } from "@/lib/social-identity";

export type GithubProfile = {
  login: string;
  htmlUrl: string;
};

export async function fetchGithubProfile(
  opts: { accessToken?: string | null; accountId: string },
  fetchFn: typeof fetch = fetch,
): Promise<GithubProfile | null> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "ait-community",
  };
  const signal =
    typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
      ? AbortSignal.timeout(4000)
      : undefined;

  try {
    if (opts.accessToken) {
      const authed = await fetchFn("https://api.github.com/user", {
        headers: { ...headers, Authorization: `Bearer ${opts.accessToken}` },
        signal,
      });
      if (authed.ok) {
        const data: unknown = await authed.json();
        if (
          data &&
          typeof data === "object" &&
          "login" in data &&
          typeof data.login === "string"
        ) {
          const htmlUrl =
            "html_url" in data && typeof data.html_url === "string"
              ? data.html_url
              : githubProfileUrl(data.login);
          return { login: data.login, htmlUrl };
        }
      }
    }

    if (!/^\d+$/.test(opts.accountId)) return null;

    const res = await fetchFn(`https://api.github.com/user/${opts.accountId}`, {
      headers,
      signal,
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (
      !data ||
      typeof data !== "object" ||
      !("login" in data) ||
      typeof data.login !== "string"
    ) {
      return null;
    }
    const htmlUrl =
      "html_url" in data && typeof data.html_url === "string"
        ? data.html_url
        : githubProfileUrl(data.login);
    return { login: data.login, htmlUrl };
  } catch {
    return null;
  }
}
