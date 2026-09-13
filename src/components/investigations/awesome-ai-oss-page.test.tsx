import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

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

import en from "../../../messages/en.json";
import nl from "../../../messages/nl.json";
import {
  AWESOME_AI_OSS_H1,
  AWESOME_AI_OSS_JOIN_HREF,
  AWESOME_AI_OSS_PATH,
  AWESOME_AI_OSS_REPOS,
} from "@/lib/investigations/awesome-ai-oss";
import { GUIDE_PATHS, JOIN_PATH, appPathFromGuideHref } from "@/lib/seo-guides";
import { HOME_CRAWL_DOORS } from "@/components/home/home-crawl-doors";
import { AwesomeAiOssPage } from "./awesome-ai-oss-page";

const dir = dirname(fileURLToPath(import.meta.url));
const appLocale = join(dir, "../../app/[locale]");
const PAGE_FILE = join(appLocale, "investigations/awesome-ai-oss/page.tsx");
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

const EXPECTED_HREFS = [
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

function expectNoSubmitVote(text: string, hrefs: Array<string | null>) {
  expect(text).not.toMatch(/\bsubmit\b/i);
  expect(text).not.toMatch(/\binzenden\b/i);
  expect(text).not.toMatch(/\bvote\b/i);
  expect(text).not.toMatch(/\bstem\b/i);
  expect(hrefs.join("\n")).not.toMatch(/submit|vote/i);
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
  });
});

describe("Awesome AI OSS catalog", () => {
  it("lists exactly 12 GitHub + 3 GitLab repos with locked URLs", () => {
    expect(AWESOME_AI_OSS_REPOS).toHaveLength(15);
    expect(AWESOME_AI_OSS_REPOS.map((repo) => repo.href)).toEqual([
      ...EXPECTED_HREFS,
    ]);
    expect(
      AWESOME_AI_OSS_REPOS.filter((repo) =>
        repo.href.startsWith("https://github.com/"),
      ),
    ).toHaveLength(12);
    expect(
      AWESOME_AI_OSS_REPOS.filter((repo) =>
        repo.href.startsWith("https://gitlab.com/"),
      ),
    ).toHaveLength(3);
    for (const repo of AWESOME_AI_OSS_REPOS) {
      expect(repo.blurb.en.trim().length).toBeGreaterThan(0);
      expect(repo.blurb.nl.trim().length).toBeGreaterThan(0);
      expectNoBannedClaims(`${repo.blurb.en}\n${repo.blurb.nl}`);
    }
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

    for (const href of EXPECTED_HREFS) {
      expect(hrefs).toContain(href);
    }

    expect(container.querySelector("form")).toBeNull();
    expectNoSubmitVote(container.textContent ?? "", hrefs);
    expectNoBannedClaims(container.textContent ?? "");
    expectNoBannedClaims(
      Object.values(en.investigationsAwesomeAiOss).join("\n"),
    );
  });

  it("renders category H2s and one line per repo", () => {
    const { container } = render(
      <AwesomeAiOssPage locale="en" t={tFrom(en.investigationsAwesomeAiOss)} />,
    );

    expect(
      screen.getByRole("heading", { name: /Protocols & SDKs/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /MCP servers & agent runtimes/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Agent frameworks/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Open models & serving/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /^GitLab$/i }),
    ).toBeInTheDocument();

    expect(container.textContent).toMatch(/reference MCP servers/i);
    expect(container.textContent).toMatch(/GitLab AI Gateway/i);
    expect(container.textContent).toMatch(/GitLab application/i);
  });
});

describe("Awesome AI OSS i18n", () => {
  it("has matching EN and NL keys with real copy and no banned claims", () => {
    const enKeys = Object.keys(en.investigationsAwesomeAiOss).sort();
    const nlKeys = Object.keys(nl.investigationsAwesomeAiOss).sort();
    expect(nlKeys).toEqual(enKeys);
    expect(en.investigationsAwesomeAiOss.title).toBe(AWESOME_AI_OSS_H1);

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
    expectNoSubmitVote(container.textContent ?? "", hrefs);
    expectNoBannedClaims(container.textContent ?? "");
  });
});

describe("Awesome AI OSS site integration", () => {
  it("is in the sitemap static pages", () => {
    const sitemap = readFileSync(SITEMAP_FILE, "utf8");
    const sitemapTest = readFileSync(SITEMAP_TEST_FILE, "utf8");
    expect(sitemap).toContain(AWESOME_AI_OSS_PATH);
    expect(sitemapTest).toContain(AWESOME_AI_OSS_PATH);
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
});
