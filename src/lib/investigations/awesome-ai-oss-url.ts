export const AWESOME_REPO_URL_ERROR = "Use a live GitHub or GitLab repo URL.";
export const AWESOME_REPO_DUPLICATE_ERROR =
  "That repo is already submitted or listed.";

export type AwesomeRepoHost = "github" | "gitlab";

export type ParsedAwesomeRepoUrl = {
  normalized: string;
  host: AwesomeRepoHost;
  path: string;
};

const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);
const GITLAB_HOSTS = new Set(["gitlab.com", "www.gitlab.com"]);

const REJECTED_GITHUB_OWNERS = new Set([
  "gist",
  "settings",
  "marketplace",
  "topics",
  "orgs",
  "sponsors",
  "notifications",
  "login",
  "signup",
  "explore",
  "features",
  "pricing",
  "about",
  "enterprise",
  "security",
  "customer-stories",
  "team",
  "enterprise-trial",
]);

const REJECTED_GITLAB_LEAD = new Set([
  "users",
  "explore",
  "help",
  "signin",
  "sign_in",
  "signup",
  "sign_up",
  "dashboard",
  "-",
]);

const REJECTED_TAIL = new Set([
  "issues",
  "pulls",
  "pull",
  "actions",
  "wiki",
  "security",
  "pulse",
  "projects",
  "settings",
  "tree",
  "blob",
  "commit",
  "commits",
  "releases",
  "tags",
  "forks",
  "stargazers",
  "watchers",
  "network",
  "graphs",
  "compare",
  "archive",
]);

export function parseAwesomeRepoUrl(
  raw: string,
):
  | { ok: true; value: ParsedAwesomeRepoUrl }
  | { ok: false; error: typeof AWESOME_REPO_URL_ERROR } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: AWESOME_REPO_URL_ERROR };
  }

  let url: URL;
  try {
    url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    return { ok: false, error: AWESOME_REPO_URL_ERROR };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: AWESOME_REPO_URL_ERROR };
  }

  const host = url.hostname.toLowerCase();
  const hostKind: AwesomeRepoHost | null = GITHUB_HOSTS.has(host)
    ? "github"
    : GITLAB_HOSTS.has(host)
      ? "gitlab"
      : null;
  if (!hostKind) {
    return { ok: false, error: AWESOME_REPO_URL_ERROR };
  }

  const segments = url.pathname
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part, index, all) =>
      index === all.length - 1 ? part.replace(/\.git$/i, "") : part,
    )
    .filter(Boolean);

  if (segments.length < 2) {
    return { ok: false, error: AWESOME_REPO_URL_ERROR };
  }

  if (hostKind === "github") {
    if (segments.length !== 2) {
      return { ok: false, error: AWESOME_REPO_URL_ERROR };
    }
    const [owner, repo] = segments;
    if (
      !owner ||
      !repo ||
      REJECTED_GITHUB_OWNERS.has(owner.toLowerCase()) ||
      REJECTED_TAIL.has(repo.toLowerCase())
    ) {
      return { ok: false, error: AWESOME_REPO_URL_ERROR };
    }
  } else {
    if (REJECTED_GITLAB_LEAD.has(segments[0]!.toLowerCase())) {
      return { ok: false, error: AWESOME_REPO_URL_ERROR };
    }
    const dashAt = segments.indexOf("-");
    const kept = segments.slice(0, dashAt === -1 ? undefined : dashAt);
    if (kept.length < 2) {
      return { ok: false, error: AWESOME_REPO_URL_ERROR };
    }
    const last = kept[kept.length - 1]!.toLowerCase();
    if (REJECTED_TAIL.has(last)) {
      return { ok: false, error: AWESOME_REPO_URL_ERROR };
    }
    segments.length = 0;
    segments.push(...kept);
  }

  const path = segments.join("/");
  const canonicalHost = hostKind === "github" ? "github.com" : "gitlab.com";
  return {
    ok: true,
    value: {
      host: hostKind,
      path,
      normalized: `https://${canonicalHost}/${path}`,
    },
  };
}
