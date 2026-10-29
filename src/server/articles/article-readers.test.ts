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
  "src/server/magazines/stats/issue-stats.ts":
    "titles only, of articles placed in the issue; callers gate with canEditIssueAt",
  "src/server/magazines/share-cards.ts":
    "anonymous scope via loadReadableIssue (viewerId null); article must be published and placed in this issue",
  "src/app/sitemap.ts":
    "publicArticleWhere; magazine URLs come from sitemap-paths",
  "src/app/feed.xml/route.ts": "publicArticleWhere (the blog feed only)",
  "src/app/[locale]/blog/page.tsx": "publicArticleWhere",
  "src/app/[locale]/blog/[slug]/page.tsx":
    "isPublicArticle on the page; publicArticleWhere for related articles",
  "src/app/[locale]/blog/edit/[slug]/page.tsx":
    "the author's own blog article; a magazine article is not found",
  "src/server/api/routers/agent-magazines.ts":
    "delete draft: an editor reads one article's title to queue a delete the community owner approves; the article is not returned to a reader",
  "src/server/api/routers/articles.ts":
    "the author's own articles (editing); My articles leaves out magazine articles",
  "src/server/api/routers/comments.ts": "canReadArticle",
  "src/server/api/routers/agent.ts":
    "readableArticleWhere, anonymous issue scope; community search: magazine articles in that community's public issues",
  "src/server/members/profile-work.ts":
    "readableArticleWhere, anonymous issue scope",
  "src/server/badges/metrics.ts":
    "a count of the member's own published articles; shows no article",
  "src/server/magazines/stats/record.ts":
    "access re-checked by loadIssueAccessById; article must be published and placed in this issue; reads ids only",
  "src/server/magazines/reading.ts":
    "resolveMagazineIssueAccess for the issue that holds the article",
  "src/server/magazines/sitemap-paths.ts":
    "readableMagazineArticleWhere, anonymous issue scope",
  "src/server/magazines/agent-magazine.ts":
    "browse: published articles only in issues readableIssueIds allows at full reach, plus the calling agent's own drafts; submissions are the editor queue or that viewer's own pending articles; draft reads that surface a version id are reported as the main-row id looked up by slug; writes touch the agent's own drafts and mark those drafts ready only when a person approves the issue",
  "src/server/magazines/article-publication.ts":
    "writer: publishes and credits articles of a published issue",
  "src/server/magazines/article-placement.ts":
    "writer: an article's placement in an issue",
  "src/server/magazines/article-submission.ts":
    "writer: router checks authorship; live magazine write capability and locked latest draft gate every change; deleting a magazine reads its articles only to remove unpublished ones",
  "src/server/magazines/article-review.ts":
    "editor queue behind edit capability; review page checks live magazine editorship and member authorship; decisions check magazine and locked latest draft",
  "src/server/magazines/payload-writes.ts":
    "transaction helper: locks and reads the latest draft; its caller checks authorship and magazine capability",
  "src/server/magazines/items/article/kind.ts":
    "issue items; readers get unavailable unless the article is published",
  "src/server/magazines/magazine-articles.ts":
    "editor lists, behind requireMagazineCapability(edit); slug allocation reads draft slugs of one magazine and does not return article text",
  "src/scripts/normalize-magazine-article-paragraphs.ts":
    "operator script, not a request path: magazine articles only, drafts included, so it cannot use the public reader filters; it prints ids and, with --write, replaces content with the same body minus empty paragraphs; it does not show an article to a viewer",
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      // src/test holds shared test fixtures, which never ship.
      return name === "node_modules" || path.endsWith(join("src", "test"))
        ? []
        : sourceFiles(path);
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
        // Populated article relationships are reads, too.
        /collection:\s*"articles"|populate:\s*\{[^}]*\barticles:/.test(
          readFileSync(path, "utf8"),
        ),
      )
      .map((path) => relative(ROOT, path))
      .sort();

    expect(
      readers,
      "A new articles reader must use publicArticleWhere / readableArticleWhere / canReadArticle — add it here after review.",
    ).toEqual(Object.keys(READERS).sort());
  });
});
