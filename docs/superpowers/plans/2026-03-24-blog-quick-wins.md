# Blog Quick Wins (Sprint 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add pagination, RSS feed, reading time, anchor links on headings, and a sticky table of contents sidebar to the blog.

**Architecture:** All features are server-side only (React Server Components), zero additional client JS. Shared text utilities extracted into `src/lib/text-utils.ts` to avoid duplication between the editor and the renderer.

**Tech Stack:** Next.js 15 (RSC), Payload CMS, Lexical JSON, next-intl, vitest

**Spec:** `docs/superpowers/specs/2026-03-24-blog-quick-wins-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/text-utils.ts` | Create | Shared `slugify()` utility |
| `src/lib/text-utils.test.ts` | Create | Tests for slugify |
| `src/lib/lexical.tsx` | Modify | Export `extractPlainText` (fixed), add `extractHeadings`, `estimateReadingTime`, thread `slugMap` for anchor links |
| `src/lib/lexical.test.ts` | Create | Tests for extractPlainText, extractHeadings, estimateReadingTime |
| `src/components/article-editor/utils.ts` | Modify | Re-export `slugify` from text-utils |
| `src/app/[locale]/blog/page.tsx` | Modify | Pagination, reading time, RSS link, `generateMetadata()` |
| `src/app/[locale]/blog/[slug]/page.tsx` | Modify | ToC sidebar, conditional two-column layout |
| `src/app/feed.xml/route.ts` | Create | RSS 2.0 feed route handler |
| `src/app/[locale]/layout.tsx` | Modify | RSS `<link rel="alternate">` in metadata |
| `messages/en.json` | Modify | Add i18n keys for pagination, reading time, ToC |
| `messages/nl.json` | Modify | Add i18n keys for pagination, reading time, ToC |

---

### Task 1: Shared `slugify()` utility

**Files:**
- Create: `src/lib/text-utils.ts`
- Create: `src/lib/text-utils.test.ts`
- Modify: `src/components/article-editor/utils.ts`

- [ ] **Step 1: Write tests for `slugify()`**

Create `src/lib/text-utils.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { slugify } from "./text-utils";

describe("slugify", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    expect(slugify("Getting Started with AI")).toBe("getting-started-with-ai");
  });

  it("strips special characters", () => {
    expect(slugify("API & SDK")).toBe("api-sdk");
  });

  it("handles accented characters via NFD normalization", () => {
    expect(slugify("Über uns")).toBe("uber-uns");
  });

  it("strips leading and trailing hyphens", () => {
    expect(slugify("--hello world--")).toBe("hello-world");
  });

  it("truncates to 80 characters", () => {
    const long = "a".repeat(100);
    expect(slugify(long).length).toBeLessThanOrEqual(80);
  });

  it("returns empty string for empty input", () => {
    expect(slugify("")).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/text-utils.test.ts`
Expected: FAIL — module `./text-utils` not found.

- [ ] **Step 3: Implement `slugify()`**

Create `src/lib/text-utils.ts`:

```ts
/**
 * Convert text to a URL-safe slug.
 * Uses NFD normalization to handle accented characters.
 */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/text-utils.test.ts`
Expected: All 6 tests PASS.

- [ ] **Step 5: Update editor utils to re-export**

In `src/components/article-editor/utils.ts`, replace the `generateSlug` function body (lines 74-82) to re-export:

```ts
import { slugify } from "@/lib/text-utils";

export function generateSlug(title: string): string {
  return slugify(title);
}
```

Add the import at the top of the file (line 3, after existing imports). Keep the `generateSlug` wrapper so existing call sites don't break.

- [ ] **Step 6: Run typecheck to verify no regressions**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/text-utils.ts src/lib/text-utils.test.ts src/components/article-editor/utils.ts
git commit -m "feat(blog): add shared slugify utility and consolidate with editor"
```

---

### Task 2: Fix `extractPlainText` and add `estimateReadingTime` + `extractHeadings`

**Files:**
- Modify: `src/lib/lexical.tsx`
- Create: `src/lib/lexical.test.ts`

- [ ] **Step 1: Write tests**

Create `src/lib/lexical.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { extractPlainText, estimateReadingTime, extractHeadings } from "./lexical";

const makeParagraph = (text: string) => ({
  type: "paragraph",
  children: [{ type: "text", text }],
});

const makeHeading = (text: string, tag: "h2" | "h3") => ({
  type: "heading",
  tag,
  children: [{ type: "text", text }],
});

const wrapInRoot = (children: unknown[]) => ({
  root: { children },
});

describe("extractPlainText", () => {
  it("joins text nodes with spaces", () => {
    const nodes = [
      { type: "text", text: "Hello" },
      { type: "text", text: "World" },
    ];
    expect(extractPlainText(nodes)).toBe("Hello World");
  });

  it("normalizes whitespace", () => {
    const nodes = [{ type: "text", text: "Hello   World" }];
    expect(extractPlainText(nodes)).toBe("Hello World");
  });

  it("extracts text from nested children", () => {
    const nodes = [
      {
        type: "paragraph",
        children: [{ type: "text", text: "Nested text" }],
      },
    ];
    expect(extractPlainText(nodes)).toBe("Nested text");
  });
});

describe("estimateReadingTime", () => {
  it("returns 1 for short content", () => {
    const content = wrapInRoot([makeParagraph("Hello world")]);
    expect(estimateReadingTime(content)).toBe(1);
  });

  it("calculates reading time at 200 WPM", () => {
    const words = Array(400).fill("word").join(" ");
    const content = wrapInRoot([makeParagraph(words)]);
    expect(estimateReadingTime(content)).toBe(2);
  });

  it("rounds up", () => {
    const words = Array(201).fill("word").join(" ");
    const content = wrapInRoot([makeParagraph(words)]);
    expect(estimateReadingTime(content)).toBe(2);
  });

  it("returns 1 for empty content", () => {
    expect(estimateReadingTime(null)).toBe(1);
    expect(estimateReadingTime({})).toBe(1);
  });
});

describe("extractHeadings", () => {
  it("extracts h2 and h3 headings with slugs", () => {
    const content = wrapInRoot([
      makeHeading("Introduction", "h2"),
      makeParagraph("Some text"),
      makeHeading("Getting Started", "h3"),
    ]);
    expect(extractHeadings(content)).toEqual([
      { text: "Introduction", slug: "introduction", level: 2 },
      { text: "Getting Started", slug: "getting-started", level: 3 },
    ]);
  });

  it("deduplicates slugs", () => {
    const content = wrapInRoot([
      makeHeading("Setup", "h2"),
      makeHeading("Setup", "h2"),
      makeHeading("Setup", "h2"),
    ]);
    const headings = extractHeadings(content);
    expect(headings[0]!.slug).toBe("setup");
    expect(headings[1]!.slug).toBe("setup-1");
    expect(headings[2]!.slug).toBe("setup-2");
  });

  it("returns empty array for no headings", () => {
    const content = wrapInRoot([makeParagraph("Just text")]);
    expect(extractHeadings(content)).toEqual([]);
  });

  it("returns empty array for null content", () => {
    expect(extractHeadings(null)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/lexical.test.ts`
Expected: FAIL — `estimateReadingTime` and `extractHeadings` are not exported.

- [ ] **Step 3: Fix `extractPlainText` and export it**

In `src/lib/lexical.tsx`, modify the existing `extractPlainText` function (line 21-29) to join with spaces and normalize whitespace, then export it:

Change:
```ts
function extractPlainText(nodes: LexicalNode[]): string {
  return nodes
    .map((n) => {
      if (typeof n.text === "string") return n.text;
      if (n.children?.length) return extractPlainText(n.children);
      return "";
    })
    .join("");
}
```

To:
```ts
export function extractPlainText(nodes: LexicalNode[]): string {
  return nodes
    .map((n) => {
      if (typeof n.text === "string") return n.text;
      if (n.children?.length) return extractPlainText(n.children);
      return "";
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
```

- [ ] **Step 4: Add `estimateReadingTime` export**

Add after `extractPlainText` in `src/lib/lexical.tsx`:

```ts
/**
 * Estimate reading time in minutes from Lexical JSON content.
 * Uses 200 WPM average reading speed.
 */
export function estimateReadingTime(content: unknown): number {
  const data = typeof content === "string"
    ? (JSON.parse(content) as LexicalRoot)
    : (content as LexicalRoot);

  if (!data?.root?.children) return 1;

  const text = extractPlainText(data.root.children);
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(wordCount / 200));
}
```

- [ ] **Step 5: Add `extractHeadings` export**

Add after `estimateReadingTime` in `src/lib/lexical.tsx`:

```ts
import { slugify } from "@/lib/text-utils";

export type Heading = { text: string; slug: string; level: 2 | 3 };

/**
 * Extract H2/H3 headings from Lexical JSON content with deduplicated slugs.
 * Used for table of contents and anchor link generation.
 */
export function extractHeadings(content: unknown): Heading[] {
  const data = typeof content === "string"
    ? (JSON.parse(content) as LexicalRoot)
    : (content as LexicalRoot);

  if (!data?.root?.children) return [];

  const slugMap = new Map<string, number>();
  const headings: Heading[] = [];

  for (const node of data.root.children) {
    if (
      node.type === "heading" &&
      (node.tag === "h2" || node.tag === "h3")
    ) {
      const text = extractPlainText(node.children ?? []);
      const baseSlug = slugify(text);
      const count = slugMap.get(baseSlug) ?? 0;
      const slug = count === 0 ? baseSlug : `${baseSlug}-${count}`;
      slugMap.set(baseSlug, count + 1);

      headings.push({
        text,
        slug,
        level: node.tag === "h2" ? 2 : 3,
      });
    }
  }

  return headings;
}
```

Note: Add the `slugify` import at the top of the file alongside other imports.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/lib/lexical.test.ts`
Expected: All tests PASS.

- [ ] **Step 7: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/lexical.tsx src/lib/lexical.test.ts
git commit -m "feat(blog): fix extractPlainText spacing, add estimateReadingTime and extractHeadings"
```

---

### Task 3: Anchor links on headings

**Files:**
- Modify: `src/lib/lexical.tsx`

- [ ] **Step 1: Thread `slugMap` through `renderNode`**

In `src/lib/lexical.tsx`, change the `renderNode` signature from:

```ts
function renderNode(node: LexicalNode, idx: number): React.ReactNode {
```

To:

```ts
function renderNode(node: LexicalNode, idx: number, slugMap: Map<string, number>): React.ReactNode {
```

Update **every** recursive `renderNode(c, i)` call to `renderNode(c, i, slugMap)`. These are at approximately:
- Line 99 (paragraph children)
- Line 116 (heading children — will be replaced in next step)
- Line 131 (list children)
- Line 139 (listitem children)
- Line 149 (blockquote children)
- Line 201 (link children)
- Line 233 (default children)

- [ ] **Step 2: Modify the heading case to add anchor links**

Replace the `case "heading"` block (approximately lines 104-119) with:

```ts
    case "heading": {
      const Tag = (node.tag ?? "h2") as "h2" | "h3" | "h4" | "h5" | "h6";
      const headingClass: Record<string, string> = {
        h1: "mt-8 mb-4 text-3xl font-bold tracking-tight",
        h2: "mt-8 mb-3 text-2xl font-bold tracking-tight",
        h3: "mt-6 mb-2 text-xl font-semibold",
        h4: "mt-4 mb-2 text-lg font-semibold",
        h5: "mt-4 mb-2 font-semibold",
        h6: "mt-4 mb-2 font-medium text-muted-foreground",
      };
      const text = extractPlainText(node.children ?? []);
      const baseSlug = slugify(text);
      const count = slugMap.get(baseSlug) ?? 0;
      const slug = count === 0 ? baseSlug : `${baseSlug}-${count}`;
      slugMap.set(baseSlug, count + 1);

      return (
        <Tag key={idx} id={slug} className={`group ${headingClass[node.tag ?? "h2"]}`}>
          {node.children?.map((c, i) => renderNode(c, i, slugMap))}
          <a
            href={`#${slug}`}
            aria-label="Link to this section"
            className="text-muted-foreground ml-2 opacity-0 transition-opacity group-hover:opacity-100"
          >
            #
          </a>
        </Tag>
      );
    }
```

Note: Add `import { slugify } from "@/lib/text-utils";` if not already added in Task 2.

- [ ] **Step 3: Update `LexicalRenderer` to create and pass `slugMap`**

In the `LexicalRenderer` component (approximately line 283), change:

```ts
  return (
    <div className="text-foreground leading-7">
      {data.root.children.map((node, i) => renderNode(node, i))}
    </div>
  );
```

To:

```ts
  const slugMap = new Map<string, number>();
  return (
    <div className="text-foreground leading-7">
      {data.root.children.map((node, i) => renderNode(node, i, slugMap))}
    </div>
  );
```

- [ ] **Step 4: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/lexical.tsx
git commit -m "feat(blog): add anchor links with hover # on article headings"
```

---

### Task 4: i18n keys

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/nl.json`

- [ ] **Step 1: Add English translation keys**

In `messages/en.json`, inside the `"blog"` object (after the `"backToBlog"` entry), add:

```json
    "pagination": {
      "prev": "PREV",
      "next": "NEXT"
    },
    "readingTime": "{minutes} MIN",
    "tableOfContents": "CONTENTS",
    "rssFeed": "RSS"
```

- [ ] **Step 2: Add Dutch translation keys**

In `messages/nl.json`, inside the `"blog"` object (after the `"backToBlog"` entry), add:

```json
    "pagination": {
      "prev": "VORIGE",
      "next": "VOLGENDE"
    },
    "readingTime": "{minutes} MIN",
    "tableOfContents": "INHOUD",
    "rssFeed": "RSS"
```

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add messages/en.json messages/nl.json
git commit -m "feat(blog): add i18n keys for pagination, reading time, ToC, and RSS"
```

---

### Task 5: Pagination on blog index

**Files:**
- Modify: `src/app/[locale]/blog/page.tsx`

- [ ] **Step 1: Switch to `generateMetadata()` and accept `searchParams`**

Replace the static `export const metadata` (lines 7-17) with:

```ts
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Blog",
    description:
      "Articles, tutorials, and talk recordings from the AI Tech Community.",
    ...buildOgMeta(
      "Blog",
      "Articles, tutorials, and talk recordings from the AI Tech Community.",
      "Blog",
    ),
    alternates: buildAlternates("/blog"),
  };
}
```

Add `import type { Metadata } from "next";` at the top if not already present.

- [ ] **Step 2: Update `BlogPage` to read `searchParams` and paginate**

Change the component signature and query:

Add `import { redirect } from "next/navigation";` at the top of the file.

```ts
export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getLocale();
  const t = await getTranslations("blog");
  const params = await searchParams;

  // Parse and clamp page number
  const rawPage = typeof params.page === "string" ? parseInt(params.page, 10) : 1;
  const requestedPage = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1;

  const payload = await getPayloadClient();
  const result = await payload.find({
    collection: "articles",
    where: {
      and: [
        { status: { equals: "published" } },
        {
          or: [
            { authorType: { not_equals: "member" } },
            { reviewStatus: { equals: "approved" } },
          ],
        },
      ],
    },
    sort: "-publishedAt",
    locale: locale as "en" | "nl",
    draft: false,
    limit: 10,
    page: requestedPage,
  });

  const totalPages = result.totalPages;

  // Redirect to last page if requested page exceeds total (spec: "show last page, not empty results")
  if (requestedPage > totalPages && totalPages > 0) {
    redirect(`/blog?page=${totalPages}`);
  }

  const page = Math.min(requestedPage, Math.max(1, totalPages));
  const articles = result.docs;
```

- [ ] **Step 3: Add reading time and RSS link to the header/rows**

Add the import at the top of the file:

```ts
import { estimateReadingTime } from "@/lib/lexical";
```

In the header bar (the `<div>` with `flex items-center justify-between`), add an RSS link next to the WRITE button:

```tsx
<div className="flex items-center gap-3">
  <a
    href="/feed.xml"
    className="border-border text-muted-foreground hover:text-foreground rounded border px-3 py-1 font-mono text-xs tracking-wider transition-colors"
    title="RSS Feed"
  >
    {t("rssFeed")}
  </a>
  <Link
    href="/blog/write"
    className="border-border text-muted-foreground hover:text-foreground rounded border px-3 py-1 font-mono text-xs tracking-wider transition-colors"
  >
    + WRITE
  </Link>
</div>
```

Add a reading time column header in the table header (desktop) between TITLE and TYPE:

```tsx
<span className="text-muted-foreground w-20 font-mono text-[11px] font-medium tracking-wider">
  / READ
</span>
```

In each article row, add reading time between title and type badge:

```tsx
{/* Reading time - desktop */}
<span className="text-muted-foreground hidden w-20 font-mono text-[11px] tracking-wider sm:order-3 sm:inline">
  {t("readingTime", { minutes: estimateReadingTime(article.content) })}
</span>
```

Update `sm:order-N` on existing elements in the same article row:
- Title `<span>` (currently `sm:order-2`): keep as `sm:order-2`
- Desktop type badge `<span>` (currently `sm:order-3`): change to `sm:order-4`
- `+` arrow `<span>` (currently `sm:order-4`): change to `sm:order-5`

On mobile, add reading time inline next to the type badge:

```tsx
<span className="text-muted-foreground font-mono text-[10px] tracking-wider sm:hidden">
  {t("readingTime", { minutes: estimateReadingTime(article.content) })}
</span>
```

- [ ] **Step 4: Add pagination controls below the article list**

After the article rows mapping (after the closing `</>` of the fragment), add pagination:

```tsx
{/* Pagination */}
{totalPages > 1 && (
  <div className="mt-8 flex items-center justify-center gap-6 font-mono text-xs tracking-wider">
    {page > 1 ? (
      <Link
        href={`/blog?page=${page - 1}`}
        className="text-muted-foreground hover:text-foreground transition-colors"
      >
        ← {t("pagination.prev")}
      </Link>
    ) : (
      <span className="text-muted-foreground/40">← {t("pagination.prev")}</span>
    )}

    <span className="text-muted-foreground">
      {page} / {totalPages}
    </span>

    {page < totalPages ? (
      <Link
        href={`/blog?page=${page + 1}`}
        className="text-muted-foreground hover:text-foreground transition-colors"
      >
        {t("pagination.next")} →
      </Link>
    ) : (
      <span className="text-muted-foreground/40">{t("pagination.next")} →</span>
    )}
  </div>
)}
```

- [ ] **Step 5: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/[locale]/blog/page.tsx
git commit -m "feat(blog): add pagination, reading time, and RSS link to blog index"
```

---

### Task 6: RSS feed route handler

**Files:**
- Create: `src/app/feed.xml/route.ts`
- Modify: `src/app/[locale]/layout.tsx`

- [ ] **Step 1: Create the RSS route handler**

Create `src/app/feed.xml/route.ts`:

```ts
import { getPayloadClient } from "@/server/payload";
import { extractPlainText } from "@/lib/lexical";

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toRfc822(dateStr: string): string {
  return new Date(dateStr).toUTCString();
}

function truncateWords(text: string, maxWords: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(" ") + "...";
}

type LexicalRoot = {
  root?: { children?: unknown[] };
};

export async function GET() {
  const payload = await getPayloadClient();
  const { docs: articles } = await payload.find({
    collection: "articles",
    where: {
      and: [
        { status: { equals: "published" } },
        {
          or: [
            { authorType: { not_equals: "member" } },
            { reviewStatus: { equals: "approved" } },
          ],
        },
      ],
    },
    sort: "-publishedAt",
    locale: "en",
    draft: false,
    limit: 20,
  });

  const siteUrl = "https://aitcommunity.org";

  const items = articles
    .map((article) => {
      const content = article.content as LexicalRoot | string | null;
      let plainText = "";
      if (typeof content === "string") {
        try {
          const parsed = JSON.parse(content) as LexicalRoot;
          plainText = extractPlainText(parsed.root?.children ?? []);
        } catch { /* empty */ }
      } else if (content?.root?.children) {
        plainText = extractPlainText(content.root.children as Parameters<typeof extractPlainText>[0]);
      }

      const description = truncateWords(plainText, 200);
      const author = article.authorName ?? "AIT Community";
      const link = `${siteUrl}/en/blog/${article.slug}`;

      return `    <item>
      <title>${escapeXml(article.title)}</title>
      <link>${escapeXml(link)}</link>
      <description>${escapeXml(description)}</description>
      <dc:creator>${escapeXml(author)}</dc:creator>
      <category>${escapeXml(article.type)}</category>
      ${article.publishedAt ? `<pubDate>${toRfc822(article.publishedAt)}</pubDate>` : ""}
      <guid isPermaLink="true">${escapeXml(link)}</guid>
    </item>`;
    })
    .join("\n");

  const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>AIT Community Blog</title>
    <link>${siteUrl}/en/blog</link>
    <description>Articles, tutorials, and talk recordings from the AI Tech Community.</description>
    <language>en</language>
${items}
  </channel>
</rss>`;

  return new Response(feed, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
```

- [ ] **Step 2: Add RSS alternate link to layout metadata**

In `src/app/[locale]/layout.tsx`, add to the existing `metadata` export (inside the object, after `icons`):

```ts
alternates: {
  types: {
    "application/rss+xml": "/feed.xml",
  },
},
```

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/feed.xml/route.ts src/app/[locale]/layout.tsx
git commit -m "feat(blog): add RSS 2.0 feed at /feed.xml with auto-discovery"
```

---

### Task 7: Table of Contents sticky sidebar

**Files:**
- Modify: `src/app/[locale]/blog/[slug]/page.tsx`

- [ ] **Step 1: Add heading extraction import and ToC logic**

Add imports at the top of `src/app/[locale]/blog/[slug]/page.tsx`:

```ts
import { extractHeadings, type Heading } from "@/lib/lexical";
```

- [ ] **Step 2: Extract headings before rendering**

Inside the `ArticleDetailPage` component, after the `tags` extraction (after line 80), add:

```ts
  const headings = extractHeadings(article.content);
  const showToc = headings.length >= 2;
```

- [ ] **Step 3: Switch to conditional two-column layout**

Replace the content section (the `<div className="border-border mt-8 border-t pt-8">` block, approximately line 163-165) with a conditional layout:

```tsx
      {/* Content area */}
      <div className={`border-border mt-8 border-t pt-8 ${showToc ? "flex gap-8" : ""}`}>
        {/* Article content */}
        <div className={showToc ? "min-w-0 flex-1" : ""}>
          <LexicalRenderer content={article.content} />
        </div>

        {/* Table of Contents sidebar */}
        {showToc && (
          <aside className="hidden w-64 shrink-0 lg:block">
            <nav className="sticky top-24">
              <h2 className="text-muted-foreground mb-3 font-mono text-xs font-medium tracking-wider">
                / {t("tableOfContents")}
              </h2>
              <ul className="space-y-1.5">
                {headings.map((heading) => (
                  <li key={heading.slug}>
                    <a
                      href={`#${heading.slug}`}
                      className={`text-muted-foreground hover:text-foreground block font-mono text-sm transition-colors ${
                        heading.level === 3 ? "pl-3" : ""
                      }`}
                    >
                      {heading.text}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>
        )}
      </div>
```

- [ ] **Step 4: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/[locale]/blog/[slug]/page.tsx
git commit -m "feat(blog): add sticky table of contents sidebar on article detail page"
```

---

### Task 8: Final verification

- [ ] **Step 1: Run full typecheck**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS.

- [ ] **Step 3: Run linter**

Run: `npx next lint`
Expected: No errors (or only pre-existing warnings).

- [ ] **Step 4: Visual smoke test checklist**

Start the dev server (`pnpm dev`) and manually verify:

1. `/en/blog` — articles paginate (10 per page), pagination controls visible
2. `/en/blog?page=2` — shows second page (if enough articles)
3. `/en/blog?page=abc` — falls back to page 1
4. `/en/blog` — reading time visible per article row
5. `/en/blog` — RSS link visible in header
6. `/feed.xml` — returns valid XML with article items
7. `/en/blog/[any-slug]` — headings have `#` anchor on hover
8. `/en/blog/[any-slug]` — clicking `#` updates URL hash
9. `/en/blog/[any-slug]` — ToC sidebar visible on desktop (if 2+ headings)
10. `/en/blog/[any-slug]` — ToC hidden on mobile
11. `/en/blog/[any-slug]` — ToC links scroll to correct heading
12. View page source — `<link rel="alternate" type="application/rss+xml">` present
