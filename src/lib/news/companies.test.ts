import { describe, expect, it } from "vitest";

import {
  detectNewsCompanies,
  newsSourceLogoUrl,
  type NewsDirectoryCompany,
} from "./companies";

const northstar: NewsDirectoryCompany = {
  slug: "northstar-labs",
  name: "Northstar Labs",
  homepage: "https://northstar.example",
  logoUrl: "https://cdn.northstar.example/logo.png",
};

describe("detectNewsCompanies", () => {
  it("uses the company's own favicon when the title names it", () => {
    const found = detectNewsCompanies({
      title: "OpenAI ships a new model",
      text: "",
      url: "https://www.theverge.com/story",
    });
    expect(found).toEqual([
      {
        id: "openai",
        name: "OpenAI",
        logoUrl: "https://openai.com/favicon.ico",
      },
    ]);
  });

  it("matches the article host even when the title does not name the company", () => {
    const found = detectNewsCompanies({
      title: "A new research post",
      text: "",
      url: "https://openai.com/news/research",
    });
    expect(found.map((company) => company.id)).toEqual(["openai"]);
  });

  it("does not treat a longer word as a company", () => {
    expect(
      detectNewsCompanies({
        title: "A metadata cleanup and a pineapple tart",
        text: "Claudette wrote it.",
        url: "https://example.com/meta-analysis",
      }),
    ).toEqual([]);
    expect(
      detectNewsCompanies({
        title: "Meta ships Llama",
        text: "",
        url: "https://example.com/llama",
      }).map((company) => company.name),
    ).toEqual(["Meta"]);
    expect(
      detectNewsCompanies({
        title: "Apple updates on-device models",
        text: "",
        url: "https://example.com/apple",
      }).map((company) => company.id),
    ).toEqual(["apple"]);
  });

  it("keeps Groq and xAI apart", () => {
    expect(
      detectNewsCompanies({
        title: "Groq announces a chip",
        text: "",
        url: "https://example.com/groq",
      }).map((company) => company.id),
    ).toEqual(["groq"]);
    expect(
      detectNewsCompanies({
        title: "Grok gets a new voice",
        text: "",
        url: "https://example.com/grok",
      }).map((company) => company.id),
    ).toEqual(["xai"]);
  });

  it("keeps curated order when several companies are named", () => {
    const found = detectNewsCompanies({
      title: "Nvidia, Anthropic, and OpenAI share a stage",
      text: "",
      url: "https://example.com/stage",
    });
    expect(found.map((company) => company.id)).toEqual([
      "openai",
      "anthropic",
      "nvidia",
    ]);
  });

  it("uses a directory startup's stored logo, and its homepage favicon otherwise", () => {
    const stored = detectNewsCompanies(
      {
        title: "Northstar Labs raises a round",
        text: "",
        url: "https://example.com/round",
      },
      [northstar],
    );
    expect(stored).toEqual([
      {
        id: "dir:northstar-labs",
        name: "Northstar Labs",
        logoUrl: "https://cdn.northstar.example/logo.png",
      },
    ]);

    const favicon = detectNewsCompanies(
      {
        title: "Northstar Labs raises a round",
        text: "",
        url: "https://example.com/round",
      },
      [{ ...northstar, logoUrl: null }],
    );
    expect(favicon[0]?.logoUrl).toBe("https://northstar.example/favicon.ico");
  });

  it("skips a directory name that is too short or has no real logo host", () => {
    const found = detectNewsCompanies(
      {
        title: "AI and Ghost",
        text: "",
        url: "https://example.com/note",
      },
      [
        {
          slug: "ai",
          name: "AI",
          homepage: "https://ai.example",
          logoUrl: null,
        },
        {
          slug: "ghost",
          name: "Ghost",
          homepage: "not a url",
          logoUrl: "javascript:alert(1)",
        },
      ],
    );
    expect(found).toEqual([]);
  });

  it("does not add a second logo when a startup shares a curated domain", () => {
    const found = detectNewsCompanies(
      {
        title: "OpenAI hosts a demo",
        text: "",
        url: "https://example.com/demo",
      },
      [
        {
          slug: "openai-labs",
          name: "OpenAI Labs",
          homepage: "https://openai.com",
          logoUrl: "https://cdn.example/openai.png",
        },
      ],
    );
    expect(found.map((company) => company.id)).toEqual(["openai"]);
  });

  it("matches a startup when the article is on that startup's domain", () => {
    const found = detectNewsCompanies(
      {
        title: "Office hours",
        text: "",
        url: "https://northstar.example/blog/hours",
      },
      [northstar],
    );
    expect(found.map((company) => company.id)).toEqual(["dir:northstar-labs"]);
  });
});

describe("newsSourceLogoUrl", () => {
  it("points at the source host favicon and drops unusable URLs", () => {
    expect(newsSourceLogoUrl("https://www.theverge.com/rss/story")).toBe(
      "https://www.theverge.com/favicon.ico",
    );
    expect(newsSourceLogoUrl("javascript:alert(1)")).toBeNull();
    expect(newsSourceLogoUrl(null)).toBeNull();
  });
});
