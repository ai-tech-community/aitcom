import { z } from "zod";
import type { Collector } from "../collector";
import { CollectorStop } from "../errors";
import {
  invalidSource,
  sourceJson,
  sourceText,
} from "../helpers/public-source";

const organization = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/);
const inputSchema = z.object({
  organization,
  limit: z.number().int().min(1).max(500).default(100),
});
const itemSchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
  url: z.string(),
  stars: z.number(),
  forks: z.number(),
  language: z.string().nullable(),
  archived: z.boolean(),
  updatedAt: z.string().nullable(),
});
const repository = z.object({
  name: z.string().trim().min(1),
  description: z.string().nullish(),
  html_url: z.url({ protocol: /^https$/ }),
  stargazers_count: z.number().int().nonnegative(),
  forks_count: z.number().int().nonnegative(),
  language: z.string().nullish(),
  archived: z.boolean(),
  private: z.boolean().optional(),
  updated_at: z.iso.datetime({ offset: true }).nullish(),
});
const RESERVED = new Set([
  "about",
  "pricing",
  "features",
  "settings",
  "login",
  "topics",
  "marketplace",
  "collections",
  "explore",
  "organizations",
  "orgs",
  "sponsors",
  "new",
]);

export function recognizeGithubOrganization(url: URL): string | null {
  if (url.protocol !== "https:" || url.username || url.password || url.port)
    return null;
  const name =
    url.hostname === "api.github.com"
      ? /^\/orgs\/([^/]+)\/repos\/?$/.exec(url.pathname)?.[1]
      : url.hostname === "github.com"
        ? (/^\/orgs\/([^/]+)\/repositories\/?$/.exec(url.pathname)?.[1] ??
          /^\/([^/]+)\/?$/.exec(url.pathname)?.[1])
        : undefined;
  if (!name || RESERVED.has(name.toLowerCase())) return null;
  const parsed = organization.safeParse(name);
  return parsed.success ? parsed.data : null;
}

export const githubRepositories: Collector<
  z.infer<typeof inputSchema>,
  z.infer<typeof itemSchema>
> = {
  id: "github-repositories",
  version: 1,
  author: "platform",
  kind: "api",
  title: {
    en: "GitHub repositories",
    nl: "GitHub-repositories",
    fr: "Dépôts GitHub",
  },
  description: {
    en: "Public repositories from a GitHub organization, with descriptions, stars and links.",
    nl: "Openbare repositories van een GitHub-organisatie, met beschrijvingen, sterren en links.",
    fr: "Dépôts publics d’une organisation GitHub, avec descriptions, étoiles et liens.",
  },
  inputSchema,
  itemSchema,
  fieldHints: {
    organization: {
      label: { en: "Organization", nl: "Organisatie", fr: "Organisation" },
      placeholder: "octokit",
      help: {
        en: "The organization name in github.com/octokit. Personal accounts are not organizations.",
        nl: "De organisatienaam in github.com/octokit. Persoonlijke accounts zijn geen organisaties.",
        fr: "Le nom de l’organisation dans github.com/octokit. Les comptes personnels ne sont pas des organisations.",
      },
    },
    limit: {
      label: {
        en: "Repositories to collect",
        nl: "Aantal repositories",
        fr: "Dépôts à collecter",
      },
      help: {
        en: "Up to 500, sorted by repository name. Public API rate limits apply.",
        nl: "Maximaal 500, gesorteerd op naam. De limieten van de openbare API zijn van toepassing.",
        fr: "Jusqu’à 500, triés par nom. Les limites de l’API publique s’appliquent.",
      },
    },
  },
  sampleItem: {
    name: "rest.js",
    description: "GitHub REST API client",
    url: "https://github.com/octokit/rest.js",
    stars: 100,
    forks: 10,
    language: "TypeScript",
    archived: false,
    updatedAt: null,
  },
  limits: { maxPages: 8, maxItems: 500, maxDurationMs: 60_000 },
  async *run(input, ctx) {
    let count = 0;
    const seen = new Set<string>();
    for (let page = 1; ; page++) {
      const response = await ctx.fetch(
        `https://api.github.com/orgs/${encodeURIComponent(input.organization)}/repos?type=public&sort=full_name&direction=asc&per_page=100&page=${page}`,
        { accept: "application/vnd.github+json" },
      );
      if (response.status === 404)
        throw new CollectorStop(
          "error",
          "failed",
          "The public GitHub organization was not found.",
          { code: "github_organization_not_found" },
        );
      const parsed = z.array(repository).safeParse(await sourceJson(response));
      if (!parsed.success) throw invalidSource();
      ctx.log(`Page ${page}: ${parsed.data.length} repositories.`);
      for (const repo of parsed.data) {
        if (repo.private === true || seen.has(repo.html_url)) continue;
        if (count >= input.limit)
          throw new CollectorStop(
            "item_limit",
            "succeeded",
            "Stopped at the requested repository limit.",
          );
        seen.add(repo.html_url);
        count++;
        yield {
          name: repo.name,
          description: sourceText(repo.description),
          url: repo.html_url,
          stars: repo.stargazers_count,
          forks: repo.forks_count,
          language: sourceText(repo.language),
          archived: repo.archived,
          updatedAt: repo.updated_at ?? null,
        };
      }
      if (parsed.data.length < 100) return;
      if (count >= input.limit)
        throw new CollectorStop(
          "item_limit",
          "succeeded",
          "Stopped at the requested repository limit.",
        );
    }
  },
};
