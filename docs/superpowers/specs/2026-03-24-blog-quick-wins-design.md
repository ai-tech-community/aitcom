# Blog Quick Wins — Sprint 1 Design

**Date:** 2026-03-24
**Scope:** Pagination, RSS Feed, Reading Time on Index, Anchor Links on Headings, Table of Contents Sidebar
**Approach:** Server-side only (Approach A) — zero additional client JS

---

## 1. Pagination

### Behavior

- Blog index (`/[locale]/blog/page.tsx`) reads `?page=N` from URL search params (defaults to 1).
- Passes `limit: 10` and `page: N` to the existing Payload `find()` call.
- Payload already returns `totalDocs`, `totalPages`, `hasNextPage`, `hasPrevPage` — we use these directly.
- Navigation is plain `<Link>` elements — no client JS.

### UI

- Pagination bar rendered below the article rows.
- Contains: `← PREV` link (disabled/hidden on page 1), page indicator (e.g. `3 / 7`), `NEXT →` link (disabled/hidden on last page).
- Styled with existing mono/muted design language: `font-mono text-xs text-muted-foreground tracking-wider`.
- Hidden entirely when there is only one page of results.

### Files Changed

- `src/app/[locale]/blog/page.tsx` — accept search params, pass to query, render pagination controls.

---

## 2. RSS Feed

### Behavior

- New Next.js Route Handler at `src/app/feed.xml/route.ts`.
- `GET` handler queries Payload for latest 20 published & approved articles, sorted by `-publishedAt`.
- Generates RSS 2.0 XML via string template (no library needed).
- Each `<item>` includes: `<title>`, `<link>` (absolute URL), `<pubDate>` (RFC 822), `<description>` (first ~200 words from Lexical JSON), `<author>`, `<category>` (article type).
- Returns `Response` with `Content-Type: application/xml; charset=utf-8`.

### Content Extraction

- Reuse `extractPlainText()` from `src/lib/lexical.tsx` (will need to export it).
- Truncate to ~200 words, append `...` if truncated.

### Discovery

- Add `<link rel="alternate" type="application/rss+xml" title="AIT Community Blog" href="/feed.xml">` to root layout `<head>`.
- Add an RSS icon/link in the blog index header bar, next to the `+ WRITE` button.

### Files Changed

- `src/app/feed.xml/route.ts` — new file, RSS route handler.
- `src/lib/lexical.tsx` — export `extractPlainText()`.
- `src/app/layout.tsx` or equivalent — add `<link rel="alternate">` tag.
- `src/app/[locale]/blog/page.tsx` — add RSS link to header.

---

## 3. Reading Time on Blog Index

### Behavior

- New shared utility `estimateReadingTime(content: unknown): number` in `src/lib/lexical.tsx`.
- Walks Lexical JSON tree via `extractPlainText()`, counts words, divides by 200 WPM, rounds up to nearest minute (minimum 1).
- Called server-side per article in the blog listing — no extra DB calls needed since `content` is already part of the article document.

### UI

- Shown as `3 MIN` label in each article row.
- Desktop: positioned between the title and the type badge.
- Mobile: shown inline next to the date and type badge.
- Styled as `font-mono text-[11px] text-muted-foreground tracking-wider`.

### Files Changed

- `src/lib/lexical.tsx` — add `estimateReadingTime()` export.
- `src/app/[locale]/blog/page.tsx` — render reading time in article rows.

---

## 4. Anchor Links on Headings

### Behavior

- Modify the `heading` case in `renderNode()` inside `src/lib/lexical.tsx`.
- Extract heading text via `extractPlainText()`, slugify: lowercase, replace whitespace/special chars with hyphens, strip leading/trailing hyphens.
- Add `id={slug}` attribute to the heading element.
- Add a `#` anchor `<a>` inside the heading that links to `#{slug}`.
- Handle duplicate slugs by appending `-1`, `-2`, etc. via a counter map threaded through the render pass.

### Slugification

- `"Getting Started with AI"` → `getting-started-with-ai`
- `"API & SDK"` → `api-sdk`
- Duplicate `"Setup"` headings → `setup`, `setup-1`

### UI

- Anchor `#` link styled with `opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground ml-2`.
- Heading element wrapped in `group` class for hover detection.
- Clicking the link updates the URL hash.

### Rendering Change

- `renderNode` currently receives `(node, idx)`. To track duplicate slugs across the entire document, we pass a mutable `slugMap: Map<string, number>` through the render tree. This is created once at the top level in `LexicalRenderer` and threaded down.

### Files Changed

- `src/lib/lexical.tsx` — modify heading rendering, add slug utilities, thread slug map.

---

## 5. Table of Contents (Sticky Sidebar)

### Behavior

- On the article detail page (`/[locale]/blog/[slug]/page.tsx`), before rendering, walk the Lexical JSON to extract all H2/H3 headings into a `{ text: string; slug: string; level: 2 | 3 }[]` array.
- Uses the same slugification logic from Section 4 (shared utility).
- ToC only renders if the article has 2+ headings.

### Layout Change

- Current: single `max-w-6xl` column.
- New: two-column flex/grid layout within `max-w-6xl`.
  - Left: article content, `flex-1` (roughly 70%).
  - Right: ToC sidebar, `w-64 hidden lg:block` (roughly 30%).
- On screens `< lg`: ToC hidden, article takes full width. No layout change on mobile.

### UI

- Sidebar is `sticky top-24` so it stays pinned while scrolling.
- Header: `/ CONTENTS` in `font-mono text-xs text-muted-foreground tracking-wider`.
- Each entry is an `<a href="#slug">` styled as `text-sm font-mono text-muted-foreground hover:text-foreground transition-colors`.
- H3 entries indented with `pl-3` under their parent H2.
- No active-heading highlighting (pure server-side — no scroll tracking).

### Files Changed

- `src/app/[locale]/blog/[slug]/page.tsx` — add heading extraction, two-column layout, ToC sidebar.
- `src/lib/lexical.tsx` — export heading extraction utility (shared with anchor links slugification).

---

## Shared Utilities Summary

New exports from `src/lib/lexical.tsx`:

| Export | Purpose |
|--------|---------|
| `extractPlainText(nodes)` | Already exists, needs to be exported |
| `slugify(text)` | Convert heading text to URL-safe slug |
| `extractHeadings(content)` | Walk Lexical JSON, return `{ text, slug, level }[]` |
| `estimateReadingTime(content)` | Word count ÷ 200 WPM, rounded up |

---

## Out of Scope

- Client-side scroll tracking for ToC active state
- Infinite scroll pagination
- Full article content in RSS feed
- Search, categories, comments (Sprint 2+)
