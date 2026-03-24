# Blog Quick Wins — Sprint 1 Design

**Date:** 2026-03-24
**Scope:** Pagination, RSS Feed, Reading Time on Index, Anchor Links on Headings, Table of Contents Sidebar
**Approach:** Server-side only (Approach A) — zero additional client JS

---

## 1. Pagination

### Behavior

- Blog index (`src/app/[locale]/blog/page.tsx`) reads `?page=N` from URL search params (defaults to 1).
- Passes `limit: 10` and `page: N` to the existing Payload `find()` call.
- Payload already returns `totalDocs`, `totalPages`, `hasNextPage`, `hasPrevPage` — we use these directly.
- Navigation is plain `<Link href={`/blog?page=${n}`}>` elements using `@/i18n/navigation` — no client JS.
- Since the page now reads `searchParams`, switch from static `export const metadata` to `generateMetadata()` for consistency with dynamic pages.

### Invalid Page Handling

- Parse `page` as integer. If non-numeric, negative, or zero, clamp to 1.
- If `page` exceeds `totalPages`, clamp to `totalPages` (show last page, not empty results).

### UI

- Pagination bar rendered below the article rows.
- Contains: `← PREV` link (disabled/hidden on page 1), page indicator (e.g. `3 / 7`), `NEXT →` link (disabled/hidden on last page).
- Styled with existing mono/muted design language: `font-mono text-xs text-muted-foreground tracking-wider`.
- Hidden entirely when there is only one page of results.

### i18n Keys

- `blog.pagination.prev` — "PREV"
- `blog.pagination.next` — "NEXT"

### Files Changed

- `src/app/[locale]/blog/page.tsx` — accept search params, switch to `generateMetadata()`, pass to query, render pagination controls.
- `messages/en.json`, `messages/nl.json` — add pagination translation keys.

---

## 2. RSS Feed

### Behavior

- New Next.js Route Handler at `src/app/feed.xml/route.ts`.
- `GET` handler queries Payload for latest 20 published & approved articles, sorted by `-publishedAt`.
- Hard-codes `locale: "en"` for content (single English-language feed). If multi-locale feeds are needed later, we can add per-locale routes.
- Generates RSS 2.0 XML via string template with Dublin Core namespace for author names.
- Each `<item>` includes: `<title>`, `<link>` (absolute URL), `<pubDate>` (RFC 822 format), `<description>` (first ~200 words from Lexical JSON), `<dc:creator>` (author name — RSS `<author>` expects email, `dc:creator` accepts plain names), `<category>` (article type).
- All text content (titles, descriptions) is XML-escaped via a shared `escapeXml()` utility that escapes `&`, `<`, `>`, `"`, `'`.
- Returns `Response` with `Content-Type: application/xml; charset=utf-8`.
- Sets `Cache-Control: public, max-age=3600, s-maxage=3600` header (1 hour cache).

### Content Extraction

- Reuse `extractPlainText()` from `src/lib/lexical.tsx` (will need to export it; see note in Shared Utilities about the space-joining fix).
- Truncate to ~200 words, append `...` if truncated.

### Discovery

- Add `<link rel="alternate" type="application/rss+xml" title="AIT Community Blog" href="/feed.xml">` to `src/app/[locale]/layout.tsx` metadata.
- Add an RSS icon/link in the blog index header bar, next to the `+ WRITE` button.

### Files Changed

- `src/app/feed.xml/route.ts` — new file, RSS route handler with `escapeXml()`.
- `src/lib/lexical.tsx` — export `extractPlainText()`.
- `src/app/[locale]/layout.tsx` — add RSS `<link rel="alternate">` to metadata.
- `src/app/[locale]/blog/page.tsx` — add RSS link to header.

---

## 3. Reading Time on Blog Index

### Behavior

- New shared utility `estimateReadingTime(content: unknown): number` in `src/lib/lexical.tsx`.
- Walks Lexical JSON tree via `extractPlainText()`, splits on whitespace, counts words, divides by 200 WPM, rounds up to nearest minute (minimum 1).
- Called server-side per article in the blog listing — no extra DB calls needed since `content` is already part of the article document.

### Performance Note

With pagination (10 articles per page), fetching full `content` is acceptable. If this becomes a concern at scale, a pre-computed `readingTime` field on the Articles collection would be the long-term fix.

### UI

- Shown as `3 MIN` label in each article row.
- Desktop: positioned between the title and the type badge. Requires a new `sm:order-N` value; existing order values will be adjusted.
- Mobile: shown inline next to the date and type badge.
- Styled as `font-mono text-[11px] text-muted-foreground tracking-wider`.

### i18n Keys

- `blog.readingTime` — "{minutes} MIN"

### Files Changed

- `src/lib/lexical.tsx` — add `estimateReadingTime()` export.
- `src/app/[locale]/blog/page.tsx` — render reading time in article rows.
- `messages/en.json`, `messages/nl.json` — add reading time translation key.

---

## 4. Anchor Links on Headings

### Behavior

- Modify the `heading` case in `renderNode()` inside `src/lib/lexical.tsx`.
- Extract heading text via `extractPlainText()`, slugify using the shared `slugify()` utility (see Shared Utilities).
- Add `id={slug}` attribute to the heading element.
- Add a `#` anchor `<a>` inside the heading that links to `#{slug}`.
- Handle duplicate slugs by appending `-1`, `-2`, etc. via a counter map threaded through the render pass.

### Slugification

Uses the same algorithm as the existing `generateSlug()` in `src/components/article-editor/utils.ts` (including NFD normalization for accented characters). The logic is extracted into a shared `slugify()` in `src/lib/text-utils.ts` so both the editor and renderer use the same function:

- `"Getting Started with AI"` → `getting-started-with-ai`
- `"API & SDK"` → `api-sdk`
- `"Über uns"` → `uber-uns`
- Duplicate `"Setup"` headings → `setup`, `setup-1`

### UI

- Anchor `#` link styled with `opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground ml-2`.
- Heading element wrapped in `group` class for hover detection.
- Anchor link includes `aria-label="Link to this section"` for keyboard/screen reader accessibility.
- Clicking the link updates the URL hash.

### Rendering Change

- `renderNode` signature changes to `renderNode(node: LexicalNode, idx: number, slugMap: Map<string, number>)`.
- `slugMap` is created once in `LexicalRenderer` and passed through all recursive `renderNode` calls.
- Only `heading` nodes read/write the map; all other node types pass it through unchanged.

### Files Changed

- `src/lib/lexical.tsx` — modify heading rendering, thread slug map through `renderNode`.
- `src/lib/text-utils.ts` — new file, shared `slugify()` extracted from editor utils.
- `src/components/article-editor/utils.ts` — update `generateSlug()` to import from `src/lib/text-utils.ts`.

---

## 5. Table of Contents (Sticky Sidebar)

### Behavior

- On the article detail page (`src/app/[locale]/blog/[slug]/page.tsx`), before rendering, walk the Lexical JSON to extract all H2/H3 headings into a `{ text: string; slug: string; level: 2 | 3 }[]` array.
- Uses the same `slugify()` from `src/lib/text-utils.ts` and applies the same `slugMap` deduplication algorithm as `renderNode` does for anchor IDs. This ensures ToC `href="#slug"` values match the heading `id` attributes exactly.
- ToC only renders if the article has 2+ headings.

### Layout Change

- Current: single `max-w-6xl` column.
- **Conditional layout:** If fewer than 2 headings, keep the existing single-column layout unchanged. If 2+ headings, switch to two-column:
  - Left: article content, `flex-1` (roughly 70%).
  - Right: ToC sidebar, `w-64 shrink-0 hidden lg:block` (roughly 30%).
- On screens `< lg`: ToC hidden, article takes full width. No layout change on mobile.

### UI

- Sidebar is `sticky top-24` so it stays pinned while scrolling. The `top-24` value accounts for the navbar height; if the navbar height changes, this value should be updated accordingly.
- Header: `/ CONTENTS` in `font-mono text-xs text-muted-foreground tracking-wider`.
- Each entry is an `<a href="#slug">` styled as `text-sm font-mono text-muted-foreground hover:text-foreground transition-colors`.
- H3 entries indented with `pl-3` under their parent H2.
- No active-heading highlighting (pure server-side — no scroll tracking).

### i18n Keys

- `blog.tableOfContents` — "CONTENTS"

### Files Changed

- `src/app/[locale]/blog/[slug]/page.tsx` — add heading extraction, conditional two-column layout, ToC sidebar.
- `src/lib/lexical.tsx` — export `extractHeadings()` utility.
- `messages/en.json`, `messages/nl.json` — add ToC translation key.

---

## Shared Utilities

### Consolidation Strategy

The article editor (`src/components/article-editor/utils.ts`) and the Lexical renderer (`src/lib/lexical.tsx`) both have overlapping text utilities. To avoid duplication and ensure consistency:

1. **`src/lib/text-utils.ts`** (new file) — shared pure functions used by both editor and renderer:
   - `slugify(text: string): string` — extracted from editor's `generateSlug()`, includes NFD normalization.

2. **`src/lib/lexical.tsx`** — server-side Lexical utilities (exports added):
   - `extractPlainText(nodes: LexicalNode[]): string` — **fix: change `.join("")` to `.join(" ")` with whitespace normalization** to produce accurate word boundaries. This fix is required for correct word counting (reading time) and RSS description truncation.
   - `extractHeadings(content: unknown): { text: string; slug: string; level: 2 | 3 }[]` — walks Lexical JSON, applies `slugify()` with `slugMap` deduplication.
   - `estimateReadingTime(content: unknown): number` — word count / 200 WPM, rounded up, minimum 1.

3. **`src/components/article-editor/utils.ts`** — update `generateSlug()` to re-export from `src/lib/text-utils.ts`. Update editor's `getHeadingOutline()` remains editor-specific (returns different shape, no slugs needed in editor context).

### New Exports Summary

| File | Export | Purpose |
|------|--------|---------|
| `src/lib/text-utils.ts` | `slugify(text)` | Shared slug generation with NFD normalization |
| `src/lib/lexical.tsx` | `extractPlainText(nodes)` | Plain text from Lexical nodes (fixed: space-joined) |
| `src/lib/lexical.tsx` | `extractHeadings(content)` | `{ text, slug, level }[]` with deduplication |
| `src/lib/lexical.tsx` | `estimateReadingTime(content)` | Word count / 200 WPM, rounded up |

---

## Out of Scope

- Client-side scroll tracking for ToC active state
- Infinite scroll pagination
- Full article content in RSS feed
- Per-locale RSS feeds (hardcoded to English for now)
- Search, categories, comments (Sprint 2+)
