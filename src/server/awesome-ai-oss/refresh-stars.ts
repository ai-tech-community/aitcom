import { parseAwesomeRepoUrl } from "@/lib/investigations/awesome-ai-oss-url";

export type AwesomeStarProject = {
  id: string;
  repoUrl: string;
  repoHost: "github" | "gitlab";
};

export type RefreshAwesomeStarsDeps = {
  listProjects: () => Promise<AwesomeStarProject[]>;
  updateStars: (
    id: string,
    starCount: number,
    checkedAt: Date,
  ) => Promise<void>;
  fetchImpl?: typeof fetch;
  now?: Date;
  githubToken?: string;
  gitlabToken?: string;
  githubBatchSize?: number;
};

export type RefreshAwesomeStarsResult = {
  updated: number;
  failed: number;
};

const GITHUB_BATCH = 40;
const USER_AGENT = "aitcom-awesome-ai-oss-stars";

export async function refreshAwesomeStarCounts(
  deps: RefreshAwesomeStarsDeps,
): Promise<RefreshAwesomeStarsResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? new Date();
  const batchSize = deps.githubBatchSize ?? GITHUB_BATCH;
  const projects = await deps.listProjects();

  let updated = 0;
  let failed = 0;

  const github: Array<AwesomeStarProject & { owner: string; name: string }> =
    [];
  const gitlab: Array<AwesomeStarProject & { path: string }> = [];

  for (const project of projects) {
    const parsed = parseAwesomeRepoUrl(project.repoUrl);
    if (!parsed.ok) {
      failed += 1;
      continue;
    }
    if (parsed.value.host === "github") {
      const [owner, name] = parsed.value.path.split("/");
      if (!owner || !name) {
        failed += 1;
        continue;
      }
      github.push({ ...project, owner, name });
    } else {
      gitlab.push({ ...project, path: parsed.value.path });
    }
  }

  for (let i = 0; i < github.length; i += batchSize) {
    const chunk = github.slice(i, i + batchSize);
    const counts = await fetchGithubStars(chunk, {
      fetchImpl,
      token:
        deps.githubToken ?? process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN,
    });
    for (const project of chunk) {
      const count = counts.get(project.id);
      if (typeof count !== "number") {
        failed += 1;
        continue;
      }
      await deps.updateStars(project.id, count, now);
      updated += 1;
    }
  }

  for (const project of gitlab) {
    const count = await fetchGitlabStars(project.path, {
      fetchImpl,
      token: deps.gitlabToken ?? process.env.GITLAB_TOKEN,
    });
    if (typeof count !== "number") {
      failed += 1;
      continue;
    }
    await deps.updateStars(project.id, count, now);
    updated += 1;
  }

  return { updated, failed };
}

async function fetchGithubStars(
  repos: Array<{ id: string; owner: string; name: string }>,
  opts: { fetchImpl: typeof fetch; token?: string },
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (repos.length === 0) return counts;

  const fields = repos
    .map(
      (repo, index) =>
        `r${index}: repository(owner: ${JSON.stringify(repo.owner)}, name: ${JSON.stringify(repo.name)}) { stargazers { totalCount } }`,
    )
    .join("\n");

  try {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
    };
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`;

    const response = await opts.fetchImpl("https://api.github.com/graphql", {
      method: "POST",
      headers,
      body: JSON.stringify({ query: `query {\n${fields}\n}` }),
    });
    if (!response.ok) return counts;
    const body = (await response.json()) as {
      data?: Record<string, { stargazers?: { totalCount?: number } } | null>;
    };
    for (const [index, repo] of repos.entries()) {
      const total = body.data?.[`r${index}`]?.stargazers?.totalCount;
      if (typeof total === "number" && Number.isFinite(total)) {
        counts.set(repo.id, total);
      }
    }
  } catch {
    return counts;
  }
  return counts;
}

async function fetchGitlabStars(
  path: string,
  opts: { fetchImpl: typeof fetch; token?: string },
): Promise<number | null> {
  try {
    const headers: Record<string, string> = {
      "User-Agent": USER_AGENT,
    };
    if (opts.token) headers["PRIVATE-TOKEN"] = opts.token;
    const response = await opts.fetchImpl(
      `https://gitlab.com/api/v4/projects/${encodeURIComponent(path)}`,
      { headers },
    );
    if (!response.ok) return null;
    const body = (await response.json()) as { star_count?: number };
    return typeof body.star_count === "number" &&
      Number.isFinite(body.star_count)
      ? body.star_count
      : null;
  } catch {
    return null;
  }
}
