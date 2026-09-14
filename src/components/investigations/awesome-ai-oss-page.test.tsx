import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import en from "../../../messages/en.json";
import nl from "../../../messages/nl.json";

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/investigations/awesome-ai-oss",
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) =>
    (en.investigationsAwesomeAiOss as Record<string, string>)[key] ?? key,
}));

vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({
      awesomeAiOss: { sessionState: { invalidate: vi.fn() } },
    }),
    awesomeAiOss: {
      sessionState: { useQuery: () => ({ data: undefined }) },
      vote: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      save: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      submit: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
  },
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...p
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...p}>
      {children}
    </a>
  ),
}));

import {
  AWESOME_AI_OSS_H1,
  AWESOME_AI_OSS_JOIN_HREF,
  AWESOME_AI_OSS_META,
  AWESOME_AI_OSS_PATH,
  AWESOME_AI_OSS_REPOS,
  AWESOME_AI_OSS_REVIEW_PATH,
  AWESOME_AI_OSS_SEEDS_V1,
  AWESOME_CATEGORY_LABELS,
  curatedPublicCards,
} from "@/lib/investigations/awesome-ai-oss";
import { AWESOME_AI_OSS_SEEDS_CHUNK_1 } from "@/lib/investigations/awesome-ai-oss-seeds-chunk-1";
import { GUIDE_PATHS, JOIN_PATH, appPathFromGuideHref } from "@/lib/seo-guides";
import { HOME_CRAWL_DOORS } from "@/components/home/home-crawl-doors";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AwesomeAiOssPage } from "./awesome-ai-oss-page";
import { AwesomeAiOssCard } from "./awesome-ai-oss-card";

const dir = dirname(fileURLToPath(import.meta.url));
const appLocale = join(dir, "../../app/[locale]");
const PAGE_FILE = join(appLocale, "investigations/awesome-ai-oss/page.tsx");
const REVIEW_FILE = join(
  appLocale,
  "investigations/awesome-ai-oss/review/page.tsx",
);
const INDEX_FILE = join(appLocale, "investigations/page.tsx");
const SITEMAP_FILE = join(dir, "../../app/sitemap.ts");
const SITEMAP_TEST_FILE = join(dir, "../../app/sitemap.test.ts");
const HOME_FILE = join(appLocale, "page.tsx");

const BANNED = [
  /product hunt/i,
  /this week/i,
  /member count/i,
  /ledenaantallen/i,
  /\blargest\b/i,
  /grootste/i,
  /\bstars?\b/i,
  /sterren/i,
  /register for the summit/i,
  /register for (?:the )?world summit/i,
];

const DENIALS =
  /does not register you for World Summit|registreert je niet voor World Summit|not a summit ticket|geen summit-ticket|no stars|geen sterren|not a complete catalog|geen complete catalogus|not a star-sorted/gi;

const V1_HREFS = [
  "https://github.com/modelcontextprotocol/servers",
  "https://github.com/modelcontextprotocol/python-sdk",
  "https://github.com/modelcontextprotocol/typescript-sdk",
  "https://github.com/PrefectHQ/fastmcp",
  "https://github.com/lastmile-ai/mcp-agent",
  "https://gitlab.com/gitlab-org/ai/lazy-mcp",
  "https://github.com/openai/openai-agents-python",
  "https://github.com/microsoft/agent-framework",
  "https://github.com/langchain-ai/langgraph",
  "https://github.com/huggingface/transformers",
  "https://github.com/vllm-project/vllm",
  "https://github.com/ollama/ollama",
  "https://github.com/google/A2A",
  "https://gitlab.com/gitlab-org/modelops/applied-ml/code-suggestions/ai-assist",
  "https://gitlab.com/gitlab-org/gitlab",
] as const;

const CHUNK2_HREFS = [
  "https://github.com/makenotion/notion-mcp-server",
  "https://github.com/devhub/devhub-cms-mcp",
  "https://github.com/heroku/heroku-mcp-server",
  "https://github.com/baidu-maps/mcp",
  "https://github.com/solana-foundation/solana-dev-mcp",
  "https://github.com/bankless/onchain-mcp",
  "https://github.com/comet-ml/opik-mcp",
  "https://github.com/dynatrace-oss/dynatrace-mcp",
  "https://github.com/grafana/mcp-grafana",
  "https://github.com/hashicorp/terraform-mcp-server",
  "https://github.com/aquasecurity/trivy-mcp",
  "https://github.com/huggingface/hf-mcp-server",
  "https://github.com/smithery-ai/cli",
  "https://github.com/mcpdotdirect/template-mcp-server",
  "https://github.com/cyanheads/atlas-mcp-server",
  "https://github.com/doobidoo/mcp-memory-service",
  "https://github.com/evalstate/mcp-miro",
  "https://github.com/ahujasid/blender-mcp",
  "https://github.com/MarkusPfundstein/mcp-obsidian",
  "https://github.com/pierrebrunelle/mcp-server-openai",
  "https://github.com/agno-agi/agno",
  "https://github.com/pydantic/pydantic-ai",
  "https://github.com/567-labs/instructor",
  "https://github.com/dottxt-ai/outlines",
  "https://github.com/stanfordnlp/dspy",
  "https://github.com/guidance-ai/guidance",
  "https://github.com/yoheinakajima/babyagi",
  "https://github.com/FoundationAgents/MetaGPT",
  "https://github.com/OpenBMB/ChatDev",
  "https://github.com/OpenHands/OpenHands",
  "https://github.com/SWE-agent/SWE-agent",
  "https://github.com/superagent-ai/superagent",
  "https://github.com/deepset-ai/haystack",
  "https://github.com/neuml/txtai",
  "https://github.com/zylon-ai/private-gpt",
  "https://github.com/The-Vibe-Company/quivr",
  "https://github.com/infiniflow/ragflow",
  "https://github.com/HKUDS/LightRAG",
  "https://github.com/microsoft/graphrag",
  "https://github.com/mem0ai/mem0",
  "https://github.com/getzep/graphiti",
  "https://github.com/letta-ai/letta",
  "https://github.com/topoteretes/cognee",
  "https://github.com/qdrant/qdrant",
  "https://github.com/milvus-io/milvus",
  "https://github.com/weaviate/weaviate",
  "https://github.com/chroma-core/chroma",
  "https://github.com/lancedb/lancedb",
  "https://github.com/pgvector/pgvector",
  "https://github.com/facebookresearch/faiss",
] as const;

const EXPECTED_HREFS = [
  ...V1_HREFS,
  ...AWESOME_AI_OSS_SEEDS_CHUNK_1.map((seed) => seed.href),
  ...CHUNK2_HREFS,
] as const;

function tFrom(messages: typeof en.investigationsAwesomeAiOss) {
  return (key: string) => messages[key as keyof typeof messages] ?? "";
}

function hrefsOf(container: HTMLElement) {
  return screen
    .getAllByRole("link")
    .filter((node) => container.contains(node))
    .map((node) => node.getAttribute("href"));
}

function expectNoBannedClaims(text: string) {
  const withoutDenials = text.replace(DENIALS, "");
  for (const pattern of BANNED) {
    expect(withoutDenials).not.toMatch(pattern);
  }
}

function expectAnonymousVoteLock(container: HTMLElement) {
  expect(container.querySelector("[data-awesome-vote-count]")).toBeNull();
  expect(container.textContent).not.toMatch(/★/);
  expect(
    screen.queryByRole("button", { name: /^Vote$|^Voted$/i }),
  ).not.toBeInTheDocument();
  expect(container.textContent).not.toMatch(/Most voted/);
}

describe("Awesome AI OSS investigation route", () => {
  it("lives under /investigations, not /guides", () => {
    expect(AWESOME_AI_OSS_PATH).toBe("/investigations/awesome-ai-oss");
    expect(existsSync(PAGE_FILE)).toBe(true);
    expect(existsSync(join(appLocale, "guides/awesome-ai-oss/page.tsx"))).toBe(
      false,
    );

    const src = readFileSync(PAGE_FILE, "utf8");
    expect(src).toContain("AWESOME_AI_OSS_PATH");
    expect(src).toContain("localeAlternates");
    expect(src).toContain("AwesomeAiOssPage");
    expect(src).toContain("parseAwesomeDirectoryQuery");
    expect(src).toContain("robots: { index: true, follow: true }");
  });
});

describe("Awesome AI OSS catalog", () => {
  it("keeps the locked v1 15 and lists chunk 1 and chunk 2 GitHub seeds", () => {
    expect(AWESOME_AI_OSS_SEEDS_V1.map((seed) => seed.href)).toEqual([
      ...V1_HREFS,
    ]);
    expect(AWESOME_AI_OSS_REPOS).toHaveLength(115);
    expect(AWESOME_AI_OSS_REPOS.map((repo) => repo.href)).toEqual([
      ...EXPECTED_HREFS,
    ]);
    expect(
      AWESOME_AI_OSS_REPOS.filter((repo) =>
        repo.href.startsWith("https://github.com/"),
      ),
    ).toHaveLength(112);
    expect(
      AWESOME_AI_OSS_REPOS.filter((repo) =>
        repo.href.startsWith("https://gitlab.com/"),
      ),
    ).toHaveLength(3);
    expect(AWESOME_AI_OSS_REPOS.map((repo) => repo.href)).not.toContain(
      "https://github.com/jlowin/fastmcp",
    );
    expect(
      AWESOME_AI_OSS_REPOS.some((repo) =>
        repo.href.toLowerCase().includes("jlowin/fastmcp"),
      ),
    ).toBe(false);
    for (const repo of AWESOME_AI_OSS_REPOS) {
      expect(repo.blurb.en.trim().length).toBeGreaterThan(0);
      expect(repo.blurb.nl.trim().length).toBeGreaterThan(0);
      expectNoBannedClaims(`${repo.blurb.en}\n${repo.blurb.nl}`);
    }
    expect(AWESOME_AI_OSS_META).toBe(
      "A short curated map of open-source building blocks for human + agent pairs. Live GitHub and GitLab only. Not a registry and not a star-sorted dump.",
    );
  });
});

describe("Awesome AI OSS page citation contract", () => {
  it("uses the Writing Bot H1/lede, Hub≠registry, pick rules, and Join CTA", () => {
    expect(en.investigationsAwesomeAiOss.title).toBe(AWESOME_AI_OSS_H1);
    const { container } = render(
      <AwesomeAiOssPage locale="en" t={tFrom(en.investigationsAwesomeAiOss)} />,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: AWESOME_AI_OSS_H1 }),
    ).toBeInTheDocument();
    expect(container.textContent).toMatch(
      /Pick tools here\. Belong somewhere next/,
    );
    expect(container.textContent).toMatch(/Not a star-sorted awesome dump/);
    expect(container.textContent).toMatch(
      /Registries find\/connect tools; AIT Hub is where agents belong with humans/,
    );
    expect(container.textContent).toMatch(/live GitHub\/GitLab only/i);
    expect(container.textContent).toMatch(/no stars/i);
    expect(container.textContent).toMatch(/not a complete catalog/i);
    expect(container.textContent).toMatch(/not a summit ticket/i);

    const hrefs = hrefsOf(container);
    expect(hrefs).toContain("/investigations");
    expect(hrefs).toContain(GUIDE_PATHS.mcpRegistryVsHub);
    expect(hrefs).toContain(GUIDE_PATHS.registerAgentMcp);
    expect(hrefs).toContain(AWESOME_AI_OSS_JOIN_HREF);
    expect(AWESOME_AI_OSS_JOIN_HREF).toBe(
      "https://www.aitcommunity.org/en/join",
    );
    expect(hrefs).not.toContain("/guides/awesome-ai-oss");
    expect(hrefs.some((href) => href === "/en/join")).toBe(false);

    for (const href of EXPECTED_HREFS) {
      expect(hrefs).toContain(href);
    }

    expect(container.querySelector("form")).toBeNull();
    expectNoBannedClaims(container.textContent ?? "");
    expectNoBannedClaims(
      Object.values(en.investigationsAwesomeAiOss).join("\n"),
    );
  });

  it("renders the card grid, Writing Bot chrome, and category tags", () => {
    const { container } = render(
      <AwesomeAiOssPage locale="en" t={tFrom(en.investigationsAwesomeAiOss)} />,
    );

    expect(screen.getByPlaceholderText("Search projects…")).toBeInTheDocument();
    expect(screen.getAllByText("Filter by category").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Newest first").length).toBeGreaterThan(0);
    const signIn = screen.getByRole("link", {
      name: "Sign in to submit or vote",
    });
    expect(signIn).toHaveAttribute(
      "href",
      "/en/auth/signin?redirect=/en/investigations/awesome-ai-oss",
    );
    expect(signIn.getAttribute("href")).not.toMatch(/join/i);
    expect(screen.queryByText("Submit a project")).not.toBeInTheDocument();
    expect(screen.queryByText("Most voted")).not.toBeInTheDocument();

    for (const label of Object.values(AWESOME_CATEGORY_LABELS).map(
      (entry) => entry.en,
    )) {
      expect(container.textContent).toContain(label);
    }

    expect(container.textContent).toMatch(/reference MCP servers/i);
    expect(container.textContent).toMatch(/GitLab AI Gateway/i);
    expect(container.textContent).toMatch(/GitLab application/i);
    expect(container.textContent).toMatch(/Added: November 25, 2024/);
    expectAnonymousVoteLock(container);
  });
});

describe("Awesome AI OSS i18n", () => {
  it("has matching EN and NL keys with real copy and no banned claims", () => {
    const enKeys = Object.keys(en.investigationsAwesomeAiOss).sort();
    const nlKeys = Object.keys(nl.investigationsAwesomeAiOss).sort();
    expect(nlKeys).toEqual(enKeys);
    expect(en.investigationsAwesomeAiOss.title).toBe(AWESOME_AI_OSS_H1);
    expect(en.investigationsAwesomeAiOss.searchPlaceholder).toBe(
      "Search projects…",
    );
    expect(en.investigationsAwesomeAiOss.submitSuccess).toBe(
      "Submitted. We’ll list it after review - no public score until it’s approved.",
    );

    for (const messages of [
      en.investigationsAwesomeAiOss,
      nl.investigationsAwesomeAiOss,
    ]) {
      expect(messages.title.trim().length).toBeGreaterThan(0);
      expect(messages.lead.trim().length).toBeGreaterThan(0);
      expectNoBannedClaims(Object.values(messages).join("\n"));
    }
  });

  it("keeps Hub≠registry, Join, and the 15 repos on the Dutch page", () => {
    const { container } = render(
      <AwesomeAiOssPage locale="nl" t={tFrom(nl.investigationsAwesomeAiOss)} />,
    );
    const hrefs = hrefsOf(container);
    expect(hrefs).toContain(GUIDE_PATHS.mcpRegistryVsHub);
    expect(hrefs).toContain(GUIDE_PATHS.registerAgentMcp);
    expect(hrefs).toContain(AWESOME_AI_OSS_JOIN_HREF);
    for (const href of EXPECTED_HREFS) {
      expect(hrefs).toContain(href);
    }
    expect(container.textContent).toMatch(/geen summit-ticket/i);
    expectAnonymousVoteLock(container);
    expectNoBannedClaims(container.textContent ?? "");
  });
});

describe("Awesome AI OSS site integration", () => {
  it("is in the sitemap static pages and pending review is not", () => {
    const sitemap = readFileSync(SITEMAP_FILE, "utf8");
    const sitemapTest = readFileSync(SITEMAP_TEST_FILE, "utf8");
    expect(sitemap).toContain(AWESOME_AI_OSS_PATH);
    expect(sitemapTest).toContain(AWESOME_AI_OSS_PATH);
    expect(sitemap).not.toContain(AWESOME_AI_OSS_REVIEW_PATH);
  });

  it("is hard-linked from /en crawl doors and the Investigations index", () => {
    const homepage = readFileSync(HOME_FILE, "utf8");
    expect(homepage).toContain("HomeCrawlDoors");

    expect(HOME_CRAWL_DOORS.map((door) => door.href)).toContain(
      AWESOME_AI_OSS_PATH,
    );
    expect(en.hubDoors.awesomeLabel.trim().length).toBeGreaterThan(0);
    expect(nl.hubDoors.awesomeLabel.trim().length).toBeGreaterThan(0);

    const index = readFileSync(INDEX_FILE, "utf8");
    expect(index).toContain(AWESOME_AI_OSS_PATH);
    expect(index).not.toMatch(/\bstars?\b/i);
    expect(index).not.toMatch(/\blargest\b/i);
  });

  it("maps www cite URLs onto the investigation path", () => {
    expect(
      appPathFromGuideHref(
        "https://www.aitcommunity.org/en/investigations/awesome-ai-oss",
      ),
    ).toBe(AWESOME_AI_OSS_PATH);
    expect(appPathFromGuideHref("/en/investigations/awesome-ai-oss")).toBe(
      AWESOME_AI_OSS_PATH,
    );
  });

  it("keeps join as a Hub door, not a summit ticket", () => {
    expect(AWESOME_AI_OSS_JOIN_HREF).toBe(
      `https://www.aitcommunity.org/en${JOIN_PATH}`,
    );
  });

  it("uses Writing Bot Phase 2 strings verbatim", () => {
    const copy = en.investigationsAwesomeAiOss;
    expect(copy.searchPlaceholder).toBe("Search projects…");
    expect(copy.filterLabel).toBe("Filter by category");
    expect(copy.sortNewest).toBe("Newest first");
    expect(copy.sortVoted).toBe("Most voted");
    expect(copy.submitProject).toBe("Submit a project");
    expect(copy.signInCta).toBe("Sign in to submit or vote");
    expect(copy.empty).toBe(
      "No projects match. Try another category or clear search.",
    );
    expect(copy.openRepo).toBe("Open repo");
    expect(copy.vote).toBe("Vote");
    expect(copy.voted).toBe("Voted");
    expect(copy.removeVote).toBe("Remove vote");
    expect(copy.signInToVote).toBe("Sign in to vote");
    expect(copy.voteTooltip).toBe("One vote per member");
    expect(copy.save).toBe("Save");
    expect(copy.submitTitle).toBe("Submit a project");
    expect(copy.submitHelp).toBe(
      "Suggest a live open-source project for AIT builders. Submissions are reviewed before they appear on the public list.",
    );
    expect(copy.fieldName).toBe("Project name");
    expect(copy.fieldRepo).toBe("Repository URL");
    expect(copy.fieldCategory).toBe("Category");
    expect(copy.fieldBlurb).toBe("One-line blurb");
    expect(copy.fieldBlurbHint).toBe("What it is and when to open it");
    expect(copy.fieldNote).toBe("Your note for reviewers");
    expect(copy.submitForReview).toBe("Submit for review");
    expect(copy.cancel).toBe("Cancel");
    expect(copy.submitSuccess).toBe(
      "Submitted. We’ll list it after review - no public score until it’s approved.",
    );
    expect(copy.urlError).toBe("Use a live GitHub or GitLab repo URL.");
    expect(copy.duplicateError).toBe(
      "That repo is already submitted or listed.",
    );
    expect(copy.queueTitle).toBe("Awaiting review");
    expect(copy.approveList).toBe("Approve & list");
    expect(copy.reject).toBe("Reject");
    expect(AWESOME_CATEGORY_LABELS.protocols.en).toBe("Protocols & SDKs");
    expect(AWESOME_CATEGORY_LABELS.runtimes.en).toBe("MCP servers & runtimes");
    expect(AWESOME_CATEGORY_LABELS.frameworks.en).toBe("Agent frameworks");
    expect(AWESOME_CATEGORY_LABELS.rag.en).toBe("RAG & memory");
    expect(AWESOME_CATEGORY_LABELS.models.en).toBe("Open models & serving");
    expect(AWESOME_CATEGORY_LABELS.other.en).toBe("Other");
  });

  it("keeps the hard /en/join CTA only on the curated Investigations page", () => {
    const joinNeedle = /aitcommunity\.org\/en\/join|AWESOME_AI_OSS_JOIN_HREF/;
    const curatedPage = readFileSync(
      join(dir, "awesome-ai-oss-page.tsx"),
      "utf8",
    );
    expect(curatedPage).toContain("AWESOME_AI_OSS_JOIN_HREF");

    const siblings = [
      join(dir, "awesome-ai-oss-directory.tsx"),
      join(dir, "awesome-ai-oss-card.tsx"),
      join(dir, "awesome-ai-oss-submit-dialog.tsx"),
      join(dir, "awesome-ai-oss-review-queue.tsx"),
      REVIEW_FILE,
      PAGE_FILE,
    ];
    for (const file of siblings) {
      expect(readFileSync(file, "utf8")).not.toMatch(joinNeedle);
    }

    const route = readFileSync(PAGE_FILE, "utf8");
    expect(route).toContain("/auth/signin?redirect=");
    expect(route).toContain("AWESOME_AI_OSS_PATH");
    expect(route).not.toMatch(/join/i);
  });

  it("exposes a noindex People review path", () => {
    expect(existsSync(REVIEW_FILE)).toBe(true);
    const src = readFileSync(REVIEW_FILE, "utf8");
    expect(src).toContain("robots: { index: false, follow: false }");
    expect(src).toContain("userIsHubOperator");
    expect(src).toContain("/auth/signin?redirect=");
    expect(src).not.toMatch(/join/i);
    const queue = readFileSync(
      join(dir, "awesome-ai-oss-review-queue.tsx"),
      "utf8",
    );
    expect(queue).toContain("approveList");
    expect(queue).toContain("reject");
  });
});

describe("Awesome AI OSS card vote lock", () => {
  it("never prints vote counts or stars on an anonymous card", () => {
    const card = curatedPublicCards()[0]!;
    const { container } = render(
      <AwesomeAiOssCard
        card={card}
        locale="en"
        signedIn={false}
        copy={{
          openRepo: "Open repo",
          vote: "Vote",
          voted: "Voted",
          removeVote: "Remove vote",
          voteTooltip: "One vote per member",
          save: "Save",
          saved: "Saved",
        }}
      />,
    );
    expect(container.querySelector("[data-awesome-vote-count]")).toBeNull();
    expect(container.textContent).not.toMatch(/★/);
    expect(container.textContent).not.toMatch(/\bVote\b/);
    expect(screen.getByRole("link", { name: "Open repo" })).toHaveAttribute(
      "href",
      card.repoUrl,
    );
  });

  it("shows Vote/Voted after a session but still hides counts until they arrive", () => {
    const card = curatedPublicCards()[0]!;
    const { container } = render(
      <TooltipProvider>
        <AwesomeAiOssCard
          card={card}
          locale="en"
          signedIn
          session={{ voted: false }}
          copy={{
            openRepo: "Open repo",
            vote: "Vote",
            voted: "Voted",
            removeVote: "Remove vote",
            voteTooltip: "One vote per member",
            save: "Save",
            saved: "Saved",
          }}
        />
      </TooltipProvider>,
    );
    expect(screen.getByRole("button", { name: "Vote" })).toBeInTheDocument();
    expect(container.querySelector("[data-awesome-vote-count]")).toBeNull();
  });
});
