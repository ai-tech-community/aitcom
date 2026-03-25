# Blog Sprint 2 — Search, Tag Filtering, Sharing, Related Articles

**Date:** 2026-03-25
**Scope:** Search by title/tags, tag filter on blog index, social sharing buttons, related articles section
**Approach:** Server-side only (Approach A from Sprint 1) — zero additional client JS

---

## 1. Search

### Behavior

- Blog index (`src/app/[locale]/blog/page.tsx`) reads `?q=<query>` from URL search params alongside existing `?page=N` and new `?tag=X`.
- If `q` is present, adds Payload `where` conditions using `or`: title `like` query OR any `tags.tag` `like` query.
- Payload's `like` operator does case-insensitive substring matching — no extra infrastructure needed.
- Searching resets page to 1 unless `page` is explicitly provided.
- Empty or whitespace-only `q` is ignored (treated as no search).

### UI

- A search `<form>` rendered between the section header and the table header.
- Uses native `<form action="/blog" method="get">` with an `<input name="q">` — zero JS, standard HTML form submission.
- The input is pre-filled with the current `q` value when a search is active.
- Styled as a minimal mono input: `border-border bg-transparent font-mono text-sm` with a `/ SEARCH` placeholder.
- When a search is active, show a "clear" link (`x`) next to the input that navigates back to `/blog` (or `/blog?tag=X` if a tag filter is also active).
- The form preserves `tag` param if present via a hidden `<input type="hidden" name="tag" value={tag}>`, so search + tag filter compose correctly.

### Pagination Integration

- All pagination links include the current `q` and `tag` params: `/blog?q=react&tag=ai&page=2`.
- The redirect-on-out-of-range logic also preserves `q` and `tag` query params in the redirect URL.

### i18n Keys

- `blog.search.placeholder` — "SEARCH..."
- `blog.search.clear` — "CLEAR"
- `blog.search.noResults` — "No articles match your search."

### Files Changed

- `src/app/[locale]/blog/page.tsx` — read `q` param, add search conditions to query, render search form, preserve params in pagination links.
- `messages/en.json`, `messages/nl.json` — add search translation keys.

---

## 2. Tag Filtering

### Behavior

- Blog index reads `?tag=<tagname>` from search params.
- If `tag` is present, adds a Payload `where` condition: `tags.tag` `equals` the tag value (exact match, case-sensitive — tags are stored lowercase).
- Combines with search (`q`) and pagination (`page`) — all three are independent URL params that compose together.

### UI on Blog Index

- When a tag filter is active, show an active filter pill below the search bar: a highlighted tag badge with an `x` clear link.
- The clear link navigates to `/blog` (preserving `q` if present, dropping `tag`).
- The active filter pill uses the existing dashed-border tag styling but with a filled/highlighted state (`bg-foreground/10`).

### Tag Links on Article Detail

- The tag badges on `src/app/[locale]/blog/[slug]/page.tsx` (currently static `<span>` elements) become clickable `<Link href="/blog?tag=X">` elements.
- Add `hover:text-foreground cursor-pointer` to make them feel interactive.
- Keep the existing dashed-border styling.

### i18n Keys

- `blog.filter.activeTag` — "TAG:"

### Files Changed

- `src/app/[locale]/blog/page.tsx` — read `tag` param, add filter condition to query, render active filter pill, preserve params.
- `src/app/[locale]/blog/[slug]/page.tsx` — change tag `<span>` to `<Link>`.
- `messages/en.json`, `messages/nl.json` — add filter translation keys.

---

## 3. Social Sharing

### Behavior

- Three share options rendered on the article detail page below the content area.
- All are plain `<a>` tags with pre-built share URLs — zero JS, no third-party scripts or tracking.
- **Twitter/X:** `https://twitter.com/intent/tweet?url={encodedUrl}&text={encodedTitle}`
- **LinkedIn:** `https://www.linkedin.com/sharing/share-offsite/?url={encodedUrl}`
- **Copy link:** Plain `<a href={articleUrl}>` labeled "LINK" — users right-click to copy. No clipboard API needed (would require client JS).

### URL Construction

- Article URL: `https://aitcommunity.org/en/blog/${slug}` (hardcoded to `en` locale, consistent with RSS feed approach).
- Title and URL are URI-encoded via `encodeURIComponent()`.

### UI

- Horizontal row of three links styled as bordered buttons matching the existing RSS/WRITE button style: `border-border text-muted-foreground hover:text-foreground rounded border px-3 py-1 font-mono text-xs tracking-wider transition-colors`.
- Preceded by a `/ SHARE` label in the standard mono header style.
- Positioned after the content area (below the ToC flex container), before the related articles section.
- Twitter and LinkedIn links open in new tabs (`target="_blank" rel="noopener noreferrer"`).

### i18n Keys

- `blog.share.title` — "SHARE"
- `blog.share.twitter` — "X"
- `blog.share.linkedin` — "LINKEDIN"
- `blog.share.copyLink` — "LINK"

### Files Changed

- `src/app/[locale]/blog/[slug]/page.tsx` — add sharing section.
- `messages/en.json`, `messages/nl.json` — add sharing translation keys.

---

## 4. Related Articles

### Behavior

- On the article detail page, after the sharing section, query Payload for related articles.
- **Tag-based matching:** Query articles where `tags.tag` is `in` the current article's tag list. Exclude the current article by `id`. Apply the same published + approved filter as the blog index.
- Payload returns up to 10 candidates. Sort in-memory by shared tag count (descending), then by `publishedAt` (descending). Take the top 3.
- **Fallback:** If fewer than 3 tag-matched results, run a secondary query for recent published articles (excluding the current article and already-matched IDs), sorted by `-publishedAt`, to pad to 3 total.
- **No tags:** If the current article has no tags, skip the tag query entirely and show 3 recent articles.
- If no articles exist at all (e.g., single-article blog), hide the section entirely.

### In-Memory Sorting

Payload doesn't support "sort by number of matching tags." The approach:
1. Query with `tags.tag` `in` `[tag1, tag2, tag3]` — Payload returns articles matching any tag.
2. For each result, count how many of the current article's tags appear in the result's tags.
3. Sort by count descending, then `publishedAt` descending.
4. Slice to 3.

This is efficient because we limit the Payload query to 10 results and the in-memory sort is trivial.

### UI

- Section header: `/ RELATED` in the standard mono style.
- Three article cards in a responsive grid: `grid grid-cols-1 sm:grid-cols-3 gap-4`.
- Each card is a `<Link>` to the article detail page, styled as a bordered container with:
  - Title (font-medium, text-sm)
  - Type badge (same styling as blog index)
  - Date + reading time (muted, mono, text-xs)
- Cards use `hover:bg-secondary/50 transition-colors` for hover feedback.
- Section hidden when no related articles exist.

### i18n Keys

- `blog.related.title` — "RELATED"

### Files Changed

- `src/app/[locale]/blog/[slug]/page.tsx` — add related articles query and section.
- `messages/en.json`, `messages/nl.json` — add related translation key.

---

## Shared Concerns

### Query Param Preservation

All features that add URL params (`q`, `tag`, `page`) must compose correctly. Helper approach:
- Build a small `buildBlogUrl(params: { q?: string; tag?: string; page?: number }): string` utility that constructs `/blog?...` with only non-empty params.
- Used by: pagination links, search form hidden inputs, tag filter clear link, active filter pill clear link.

### Files Changed (Shared)

- `src/app/[locale]/blog/page.tsx` — add `buildBlogUrl` helper (or inline).

### i18n Summary

| Key | EN | NL |
|-----|----|----|
| `blog.search.placeholder` | "SEARCH..." | "ZOEKEN..." |
| `blog.search.clear` | "CLEAR" | "WISSEN" |
| `blog.search.noResults` | "No articles match your search." | "Geen artikelen gevonden." |
| `blog.filter.activeTag` | "TAG:" | "TAG:" |
| `blog.share.title` | "SHARE" | "DELEN" |
| `blog.share.twitter` | "X" | "X" |
| `blog.share.linkedin` | "LINKEDIN" | "LINKEDIN" |
| `blog.share.copyLink` | "LINK" | "LINK" |
| `blog.related.title` | "RELATED" | "GERELATEERD" |

---

## Out of Scope

- Full-text content search (title + tags only for now)
- Client-side clipboard copy (would require client JS)
- Active tag highlighting in search results
- Per-locale share URLs (hardcoded to English, consistent with RSS)
- Facebook/Reddit/other social platforms
