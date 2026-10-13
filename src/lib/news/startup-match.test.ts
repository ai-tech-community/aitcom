import { describe, expect, it } from "vitest";

import {
  applyNewsStartupLinks,
  indexNewsStartups,
  isGenericStartupName,
  matchIndexedNewsStartups,
  matchNewsStartups,
  type NewsStartupRef,
} from "./startup-match";

const northstar: NewsStartupRef = {
  id: "ns",
  slug: "northstar-labs",
  name: "Northstar Labs",
  homepage: "https://northstar.example",
};

const openai: NewsStartupRef = {
  id: "oa",
  slug: "openai",
  name: "OpenAI",
  homepage: "https://openai.com",
};

const apple: NewsStartupRef = {
  id: "ap",
  slug: "apple",
  name: "Apple",
  homepage: "https://apple.com",
};

describe("matchNewsStartups", () => {
  it("matches a long name ignoring case, and not as part of a longer word", () => {
    expect(
      matchNewsStartups(
        {
          title: "northstar labs raises",
          text: "",
          url: "https://example.com/round",
        },
        [northstar],
      ).map((startup) => startup.id),
    ).toEqual(["ns"]);
    expect(
      matchNewsStartups(
        {
          title: "A northstarlabs note",
          text: "",
          url: "https://example.com/note",
        },
        [northstar],
      ),
    ).toEqual([]);
  });

  it("matches short names only with their original casing", () => {
    expect(
      matchNewsStartups(
        {
          title: "Apple updates on-device models",
          text: "",
          url: "https://example.com/apple",
        },
        [apple],
      ).map((startup) => startup.id),
    ).toEqual(["ap"]);
    expect(
      matchNewsStartups(
        {
          title: "An apple tart and a pineapple",
          text: "openai lowered prices.",
          url: "https://example.com/tart",
        },
        [apple, openai],
      ),
    ).toEqual([]);
    expect(
      matchNewsStartups(
        {
          title: "OpenAI ships",
          text: "",
          url: "https://example.com/ship",
        },
        [openai],
      ).map((startup) => startup.id),
    ).toEqual(["oa"]);
  });

  it("does not match generic or very short names, and still matches their domain", () => {
    const lab: NewsStartupRef = {
      id: "lab",
      slug: "ai-lab",
      name: "AI Lab",
      homepage: "https://ailab.example",
    };
    const meta: NewsStartupRef = {
      id: "meta",
      slug: "meta",
      name: "Meta",
      homepage: "https://meta.example",
    };
    expect(isGenericStartupName("AI Lab")).toBe(true);
    expect(isGenericStartupName("Labs")).toBe(true);
    expect(
      matchNewsStartups(
        {
          title: "The AI Lab posted a note about Meta",
          text: "",
          url: "https://example.com/note",
        },
        [lab, meta],
      ),
    ).toEqual([]);
    expect(
      matchNewsStartups(
        {
          title: "Office hours",
          text: "See https://ailab.example/post",
          url: "https://example.com/hours",
        },
        [lab],
      ).map((startup) => startup.id),
    ).toEqual(["lab"]);
    expect(
      matchNewsStartups(
        {
          title: "A post",
          text: "",
          url: "https://blog.meta.example/hours",
        },
        [meta],
      ).map((startup) => startup.id),
    ).toEqual(["meta"]);
  });

  it("does not treat a parent host or a longer domain as the startup", () => {
    const nested: NewsStartupRef = {
      id: "blog",
      slug: "blog-example",
      name: "Example Blog",
      homepage: "https://blog.example.com",
    };
    expect(
      matchNewsStartups(
        { title: "Front page", text: "", url: "https://example.com/story" },
        [nested],
      ),
    ).toEqual([]);
    expect(
      matchNewsStartups(
        {
          title: "See northstar.example.evil.com",
          text: "",
          url: "https://example.com/evil",
        },
        [northstar],
      ),
    ).toEqual([]);
  });

  it("matches one real name inside a directory-sized list", () => {
    const text = "A weekly note about models, chips, and labs. ".repeat(12);
    const startups: NewsStartupRef[] = Array.from(
      { length: 13_000 },
      (_, i) => ({
        id: `s-${i}`,
        slug: `s-${i}`,
        name: `N${i} Labs`,
        homepage: `https://n${i}.example`,
      }),
    );
    startups[400] = openai;
    const started = Date.now();
    const indexed = indexNewsStartups(startups);
    const hits = matchIndexedNewsStartups(
      { title: "OpenAI ships", text, url: "https://news.example/openai" },
      indexed,
    );
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(hits.map((startup) => startup.id)).toEqual(["oa"]);
    expect(
      matchNewsStartups(
        { title: "openai ships", text: "", url: "https://news.example/note" },
        [openai],
      ),
    ).toEqual([]);
  });
});

describe("applyNewsStartupLinks", () => {
  it("links a curated logo that shares the startup domain and adds a missing mark", () => {
    const linked = applyNewsStartupLinks(
      [
        {
          id: "openai",
          name: "OpenAI",
          logoUrl: "https://openai.com/favicon.ico",
        },
      ],
      [
        {
          ...openai,
          logoUrl: null,
        },
      ],
    );
    expect(linked).toEqual([
      {
        id: "openai",
        name: "OpenAI",
        logoUrl: "https://openai.com/favicon.ico",
        profilePath: "/startups/openai",
      },
    ]);

    const added = applyNewsStartupLinks(
      [],
      [{ ...northstar, logoUrl: "https://cdn.northstar.example/logo.png" }],
    );
    expect(added).toEqual([
      {
        id: "dir:northstar-labs",
        name: "Northstar Labs",
        logoUrl: "https://cdn.northstar.example/logo.png",
        profilePath: "/startups/northstar-labs",
      },
    ]);
  });
});
