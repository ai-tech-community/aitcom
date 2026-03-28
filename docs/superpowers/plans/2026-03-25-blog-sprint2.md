# Blog Sprint 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add search, tag filtering, social sharing, and related articles to the blog.

**Architecture:** All features are server-side only (React Server Components), zero additional client JS. Search and tag filtering use URL search params composed via a shared `buildBlogUrl` helper. Related articles use tag-based matching with in-memory sorting.

**Tech Stack:** Next.js 15 (RSC), Payload CMS, next-intl, vitest

**Spec:** `docs/superpowers/specs/2026-03-25-blog-sprint2-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/blog-utils.ts` | Create | `buildBlogUrl` helper for composing URL params |
| `src/lib/blog-utils.test.ts` | Create | Tests for buildBlogUrl |
| `src/app/[locale]/blog/page.tsx` | Modify | Search form, tag filter, param-aware pagination, buildBlogUrl usage |
| `src/app/[locale]/blog/[slug]/page.tsx` | Modify | Clickable tags, sharing section, related articles section |
| `messages/en.json` | Modify | Add 9 i18n keys |
| `messages/nl.json` | Modify | Add 9 i18n keys |

---

### Task 1: `buildBlogUrl` helper + i18n keys

**Files:**
- Create: `src/lib/blog-utils.ts`
- Create: `src/lib/blog-utils.test.ts`
- Modify: `messages/en.json`
- Modify: `messages/nl.json`

- [ ] **Step 1: Write tests for `buildBlogUrl`**

Create `src/lib/blog-utils.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildBlogUrl } from "./blog-utils";

describe("buildBlogUrl", () => {
  it("returns /blog with no params", () => {
    expect(buildBlogUrl({})).toBe("/blog");
  });

  it("includes q param", () => {
    expect(buildBlogUrl({ q: "react" })).toBe("/blog?q=react");
  });

  it("includes tag param", () => {
    expect(buildBlogUrl({ tag: "ai" })).toBe("/blog?tag=ai");
  });

  it("includes page param", () => {
    expect(buildBlogUrl({ page: 2 })).toBe("/blog?page=2");
  });

  it("composes all params", () => {
    expect(buildBlogUrl({ q: "react", tag: "ai", page: 3 })).toBe(
      "/blog?q=react&tag=ai&page=3",
    );
  });

  it("omits empty q", () => {
    expect(buildBlogUrl({ q: "", tag: "ai" })).toBe("/blog?tag=ai");
  });

  it("omits whitespace-only q", () => {
    expect(buildBlogUrl({ q: "   ", tag: "ai" })).toBe("/blog?tag=ai");
  });

  it("omits page 1", () => {
    expect(buildBlogUrl({ page: 1 })).toBe("/blog");
  });

  it("omits undefined values", () => {
    expect(buildBlogUrl({ q: undefined, tag: undefined, page: undefined })).toBe("/blog");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/blog-utils.test.ts`
Expected: FAIL — module `./blog-utils` not found.

- [ ] **Step 3: Implement `buildBlogUrl`**

Create `src/lib/blog-utils.ts`:

```ts
/**
 * Build a blog URL with optional search, tag, and page params.
 * Returns locale-less paths (e.g., `/blog?tag=ai`).
 * Must be used with `<Link>` from `@/i18n/navigation` which prepends the locale.
 */
export function buildBlogUrl(params: {
  q?: string;
  tag?: string;
  page?: number;
}): string {
  const searchParams = new URLSearchParams();

  const q = params.q?.trim();
  if (q) searchParams.set("q", q);
  if (params.tag) searchParams.set("tag", params.tag);
  if (params.page && params.page > 1) searchParams.set("page", String(params.page));

  const qs = searchParams.toString();
  return qs ? `/blog?${qs}` : "/blog";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/blog-utils.test.ts`
Expected: All 9 tests PASS.

- [ ] **Step 5: Add all i18n keys**

In `messages/en.json`, inside the `"blog"` object after the `"rssFeed"` entry, add:

```json
    "search": {
      "placeholder": "SEARCH...",
      "clear": "CLEAR",
      "noResults": "No articles match your search."
    },
    "filter": {
      "activeTag": "TAG:"
    },
    "share": {
      "title": "SHARE",
      "twitter": "X",
      "linkedin": "LINKEDIN",
      "copyLink": "LINK"
    },
    "related": {
      "title": "RELATED"
    }
```

In `messages/nl.json`, inside the `"blog"` object after the `"rssFeed"` entry, add:

```json
    "search": {
      "placeholder": "ZOEKEN...",
      "clear": "WISSEN",
      "noResults": "Geen artikelen gevonden."
    },
    "filter": {
      "activeTag": "TAG:"
    },
    "share": {
      "title": "DELEN",
      "twitter": "X",
      "linkedin": "LINKEDIN",
      "copyLink": "LINK"
    },
    "related": {
      "title": "GERELATEERD"
    }
```

- [ ] **Step 6: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/blog-utils.ts src/lib/blog-utils.test.ts messages/en.json messages/nl.json
git commit -m "feat(blog): add buildBlogUrl helper and sprint 2 i18n keys"
```

---

### Task 2: Search + tag filtering on blog index

**Files:**
- Modify: `src/app/[locale]/blog/page.tsx`

- [ ] **Step 1: Add imports**

Add at the top of `src/app/[locale]/blog/page.tsx`:

```ts
import { buildBlogUrl } from "@/lib/blog-utils";
```

- [ ] **Step 2: Parse `q` and `tag` from search params**

After the existing `rawPage` / `requestedPage` parsing (line 38-39), add:

```ts
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const tag = typeof params.tag === "string" ? params.tag.trim() : "";
```

- [ ] **Step 3: Add search and tag conditions to the Payload query**

Replace lines 41-60 entirely (from `const payload = await getPayloadClient()` through the closing `});` of `payload.find()`) with:

```ts
  // Build where conditions
  const conditions: Record<string, unknown>[] = [
    { status: { equals: "published" } },
    {
      or: [
        { authorType: { not_equals: "member" } },
        { reviewStatus: { equals: "approved" } },
      ],
    },
  ];

  // Search: title or tags match query
  if (q) {
    conditions.push({
      or: [
        { title: { like: q } },
        { "tags.tag": { like: q } },
      ],
    });
  }

  // Tag filter
  if (tag) {
    conditions.push({ "tags.tag": { like: tag } });
  }

  const payload = await getPayloadClient();
  const result = await payload.find({
    collection: "articles",
    where: { and: conditions },
    sort: "-publishedAt",
    locale: locale as "en" | "nl",
    draft: false,
    limit: 10,
    page: requestedPage,
  });
```

- [ ] **Step 4: Update the redirect to preserve query params**

Replace the existing redirect (line 65-67):

```ts
  if (requestedPage > totalPages && totalPages > 0) {
    redirect(`/blog?page=${totalPages}`);
  }
```

With:

```ts
  if (requestedPage > totalPages && totalPages > 0) {
    redirect(buildBlogUrl({ q: q || undefined, tag: tag || undefined, page: totalPages }));
  }
```

- [ ] **Step 5: Determine empty state type**

After the `const articles = result.docs;` line, add:

```ts
  const hasFilters = !!(q || tag);
```

- [ ] **Step 6: Render search form and active tag filter**

Between the section header `</div>` (line 104) and the `{articles.length === 0 ?` conditional (line 106), add the search form and active filter pill:

```tsx
      {/* Search + Filter Bar */}
      <div className="mt-4 space-y-2">
        <form method="get" className="flex items-center gap-2">
          {tag && <input type="hidden" name="tag" value={tag} />}
          <input
            name="q"
            type="text"
            defaultValue={q}
            maxLength={200}
            placeholder={`/ ${t("search.placeholder")}`}
            className="border-border bg-transparent text-foreground placeholder:text-muted-foreground w-full rounded border px-3 py-1.5 font-mono text-sm tracking-wider outline-none focus:ring-1 focus:ring-current"
          />
          {q && (
            <Link
              href={buildBlogUrl({ tag: tag || undefined })}
              className="text-muted-foreground hover:text-foreground font-mono text-xs tracking-wider transition-colors"
            >
              {t("search.clear")}
            </Link>
          )}
        </form>

        {tag && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground font-mono text-[10px] tracking-wider">
              {t("filter.activeTag")}
            </span>
            <span className="bg-foreground/10 border-border text-muted-foreground rounded border border-dashed px-1.5 py-0.5 font-mono text-[10px] tracking-wider">
              {tag}
            </span>
            <Link
              href={buildBlogUrl({ q: q || undefined })}
              className="text-muted-foreground hover:text-foreground font-mono text-[10px] transition-colors"
            >
              ×
            </Link>
          </div>
        )}
      </div>
```

- [ ] **Step 7: Update empty state to distinguish filtered vs unfiltered**

Replace the existing empty state (line 106-107):

```tsx
      {articles.length === 0 ? (
        <p className="text-muted-foreground mt-12 text-center">{t("noArticles")}</p>
```

With:

```tsx
      {articles.length === 0 ? (
        <p className="text-muted-foreground mt-12 text-center">
          {hasFilters ? t("search.noResults") : t("noArticles")}
        </p>
```

- [ ] **Step 8: Update all pagination links to preserve params**

Replace the three pagination `href` values:

Change `href={`/blog?page=${page - 1}`}` to:
```tsx
href={buildBlogUrl({ q: q || undefined, tag: tag || undefined, page: page - 1 })}
```

Change `href={`/blog?page=${page + 1}`}` to:
```tsx
href={buildBlogUrl({ q: q || undefined, tag: tag || undefined, page: page + 1 })}
```

- [ ] **Step 9: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 10: Commit**

```bash
git add src/app/[locale]/blog/page.tsx
git commit -m "feat(blog): add search and tag filtering to blog index"
```

---

### Task 3: Clickable tags on article detail

**Files:**
- Modify: `src/app/[locale]/blog/[slug]/page.tsx`

- [ ] **Step 1: Replace static tag `<span>` with `<Link>`**

In `src/app/[locale]/blog/[slug]/page.tsx`, replace the tags section (lines 138-149):

```tsx
      {/* Tags */}
      {tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="border-border text-muted-foreground rounded border border-dashed px-1.5 py-0.5 font-mono text-[10px] tracking-wider"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
```

With:

```tsx
      {/* Tags */}
      {tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <Link
              key={tag}
              href={`/blog?tag=${encodeURIComponent(tag)}`}
              className="border-border text-muted-foreground hover:text-foreground cursor-pointer rounded border border-dashed px-1.5 py-0.5 font-mono text-[10px] tracking-wider transition-colors"
            >
              {tag}
            </Link>
          ))}
        </div>
      )}
```

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/[locale]/blog/[slug]/page.tsx
git commit -m "feat(blog): make tags clickable on article detail page"
```

---

### Task 4: Social sharing section

**Files:**
- Modify: `src/app/[locale]/blog/[slug]/page.tsx`

- [ ] **Step 1: Add sharing section after content area**

In `src/app/[locale]/blog/[slug]/page.tsx`, after the closing `</div>` of the content area (the flex container with ToC, approximately line 196), add:

```tsx
      {/* Share */}
      <div className="mt-8">
        <h2 className="text-muted-foreground mb-3 font-mono text-xs font-medium tracking-wider">
          / {t("share.title")}
        </h2>
        <div className="flex items-center gap-2">
          <a
            href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(`https://aitcommunity.org/en/blog/${slug}`)}&text=${encodeURIComponent(article.title)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="border-border text-muted-foreground hover:text-foreground rounded border px-3 py-1 font-mono text-xs tracking-wider transition-colors"
          >
            {t("share.twitter")}
          </a>
          <a
            href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(`https://aitcommunity.org/en/blog/${slug}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="border-border text-muted-foreground hover:text-foreground rounded border px-3 py-1 font-mono text-xs tracking-wider transition-colors"
          >
            {t("share.linkedin")}
          </a>
          <a
            href={`https://aitcommunity.org/en/blog/${slug}`}
            title="Right-click to copy link"
            className="border-border text-muted-foreground hover:text-foreground rounded border px-3 py-1 font-mono text-xs tracking-wider transition-colors"
          >
            {t("share.copyLink")}
          </a>
        </div>
      </div>
```

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/[locale]/blog/[slug]/page.tsx
git commit -m "feat(blog): add social sharing section on article detail page"
```

---

### Task 5: Related articles section

**Files:**
- Modify: `src/app/[locale]/blog/[slug]/page.tsx`

- [ ] **Step 1: Add `estimateReadingTime` import**

Add to the existing import from `@/lib/lexical`:

```ts
import { LexicalRenderer, extractHeadings, estimateReadingTime } from "@/lib/lexical";
```

- [ ] **Step 2: Add related articles query logic**

Inside the `ArticleDetailPage` component, after the `showToc` line (line 83) and before the `return` statement, add:

```ts
  // Fetch related articles
  const payload = await getPayloadClient();
  const publishedFilter = [
    { status: { equals: "published" } },
    {
      or: [
        { authorType: { not_equals: "member" } },
        { reviewStatus: { equals: "approved" } },
      ],
    },
  ];

  let relatedArticles: (typeof article)[] = [];

  if (tags.length > 0) {
    // Query articles sharing at least one tag
    const { docs: tagMatched } = await payload.find({
      collection: "articles",
      where: {
        and: [
          ...publishedFilter,
          { id: { not_equals: article.id } },
          {
            or: tags.map((tagName) => ({ "tags.tag": { equals: tagName } })),
          },
        ],
      },
      sort: "-publishedAt",
      locale: locale as "en" | "nl",
      draft: false,
      limit: 10,
    });

    // Sort by number of shared tags (descending), then by publishedAt
    const tagSet = new Set(tags);
    relatedArticles = tagMatched
      .map((a) => {
        const aTags = Array.isArray(a.tags)
          ? (a.tags as { tag: string }[]).map((tagObj) => tagObj.tag)
          : [];
        const sharedCount = aTags.filter((tagStr) => tagSet.has(tagStr)).length;
        return { article: a, sharedCount };
      })
      .sort((a, b) => {
        if (b.sharedCount !== a.sharedCount) return b.sharedCount - a.sharedCount;
        const aDate = a.article.publishedAt ?? "";
        const bDate = b.article.publishedAt ?? "";
        return bDate.localeCompare(aDate);
      })
      .slice(0, 3)
      .map((r) => r.article);
  }

  // Pad with recent articles if fewer than 3
  if (relatedArticles.length < 3) {
    const excludeIds = [article.id, ...relatedArticles.map((a) => a.id)];
    const { docs: recent } = await payload.find({
      collection: "articles",
      where: {
        and: [
          ...publishedFilter,
          ...excludeIds.map((id) => ({ id: { not_equals: id } })),
        ],
      },
      sort: "-publishedAt",
      locale: locale as "en" | "nl",
      draft: false,
      limit: 3 - relatedArticles.length,
    });
    relatedArticles = [...relatedArticles, ...recent];
  }
```

Note: The `getArticleBySlug` function already creates a `payload` instance via `getPayloadClient()`, but it's cached with React's `cache()`. We need a separate call here for the related articles query. However, `getPayloadClient()` is likely also cached or is a singleton — verify by reading its implementation. If it's cheap to call (which is typical for Payload), this is fine.

- [ ] **Step 3: Render related articles section**

After the sharing section `</div>`, add:

```tsx
      {/* Related Articles */}
      {relatedArticles.length > 0 && (
        <div className="mt-8">
          <h2 className="text-muted-foreground mb-3 font-mono text-xs font-medium tracking-wider">
            / {t("related.title")}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {relatedArticles.map((related) => (
              <Link
                key={related.id}
                href={`/blog/${related.slug}`}
                className="border-border hover:bg-secondary/50 rounded border p-4 transition-colors"
              >
                <span className="text-sm font-medium leading-snug">
                  {related.title}
                </span>
                <div className="text-muted-foreground mt-2 flex items-center gap-2 font-mono text-[10px] tracking-wider">
                  <span className="border-border rounded border px-1.5 py-0.5 font-medium">
                    {typeLabels[related.type] ?? related.type}
                  </span>
                  {related.publishedAt && (
                    <span>{formatDate(related.publishedAt)}</span>
                  )}
                  <span>
                    {t("readingTime", { minutes: estimateReadingTime(related.content) })}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
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
git commit -m "feat(blog): add related articles section on article detail page"
```

---

### Task 6: Final verification

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

1. `/en/blog` — search bar visible below header
2. `/en/blog` — type a query, submit form, URL shows `?q=...`, results filtered
3. `/en/blog?q=nonexistent` — shows "No articles match your search." with clear link
4. `/en/blog?q=test` — click CLEAR, returns to `/en/blog`
5. `/en/blog?tag=ai` — shows active filter pill, articles filtered
6. `/en/blog?tag=ai` — click `×` on filter pill, returns to `/en/blog`
7. `/en/blog?q=react&tag=ai` — search + tag compose correctly
8. `/en/blog?q=react&tag=ai&page=2` — pagination preserves both params
9. `/en/blog/[slug]` — tags are clickable, navigate to `/en/blog?tag=X`
10. `/en/blog/[slug]` — sharing section visible below content
11. `/en/blog/[slug]` — Twitter/LinkedIn links open in new tabs with correct share URLs
12. `/en/blog/[slug]` — LINK button has "Right-click to copy link" tooltip
13. `/en/blog/[slug]` — related articles section visible (if articles exist)
14. `/en/blog/[slug]` — related article cards show title, type badge, date, reading time
15. `/en/blog/[slug]` — related article cards link to correct articles
