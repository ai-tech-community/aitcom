// Every module that queries the articles collection decides who may read
// what it returns (ADR-0042, ADR-0043). A magazine article is readable only
// through an issue the viewer may read, so a new reader that forgets the
// rule leaks members-only articles. This inventory fails when a reader
// appears or disappears without that decision being recorded here.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..", "..");

/** Each reviewed reader, with the rule it applies to what it reads. */
const READERS: Record<string, string> = {
  "src/app/sitemap.ts":
    "publicArticleWhere; magazine URLs come from sitemap-paths",
  "src/app/feed.xml/route.ts": "publicArticleWhere (the blog feed only)",
  "src/app/[locale]/blog/page.tsx": "publicArticleWhere",
  "src/app/[locale]/blog/[slug]/page.tsx":
    "isPublicArticle on the page; publicArticleWhere for related articles",
  "src/app/[locale]/blog/edit/[slug]/page.tsx":
    "the author's own blog article; a magazine article is not found",
  "src/server/api/routers/articles.ts":
    "the author's own articles (editing); My articles leaves out magazine articles",
  "src/server/api/routers/comments.ts": "canReadArticle",
  "src/server/api/routers/agent.ts":
    "readableArticleWhere, anonymous issue scope; community search: magazine articles in that community's public issues",
  "src/server/members/profile-work.ts":
    "readableArticleWhere, anonymous issue scope",
  "src/server/badges/metrics.ts":
    "a count of the member's own published articles; shows no article",
  "src/server/magazines/reading.ts":
    "resolveMagazineIssueAccess for the issue that holds the article",
  "src/server/magazines/sitemap-paths.ts":
    "readableMagazineArticleWhere, anonymous issue scope",
  "src/server/magazines/article-publication.ts":
    "writer: publishes and credits articles of a published issue",
  "src/server/magazines/article-placement.ts":
    "writer: an article's placement in an issue",
  "src/server/magazines/article-submission.ts":
    "writer: router checks authorship; live magazine write capability and locked latest draft gate every change",
  "src/server/magazines/payload-writes.ts":
    "transaction helper: locks and reads the latest draft; its caller checks authorship and magazine capability",
  "src/server/magazines/items/article/kind.ts":
    "issue items; readers get unavailable unless the article is published",
  "src/server/magazines/magazine-articles.ts":
    "editor lists, behind requireEditorOfMagazine",
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return name === "node_modules" ? [] : sourceFiles(path);
    }
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)
      ? [path]
      : [];
  });
}

describe("articles readers", () => {
  it("every module that queries the articles collection is a reviewed reader", () => {
    const readers = sourceFiles(join(ROOT, "src"))
      .filter((path) =>
        /collection:\s*"articles"/.test(readFileSync(path, "utf8")),
      )
      .map((path) => relative(ROOT, path))
      .sort();

    expect(
      readers,
      "A new articles reader must use publicArticleWhere / readableArticleWhere / canReadArticle — add it here after review.",
    ).toEqual(Object.keys(READERS).sort());
  });
});
