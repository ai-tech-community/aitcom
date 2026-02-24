# SEO Improvements Design

**Date**: 2026-02-24
**Goal**: Full SEO foundation + social sharing for organic discovery and rich link previews
**Domain**: https://aitcommunity.org
**Locales**: en (default), nl

## 1. Foundation Layer

### metadataBase

Set `metadataBase: new URL("https://aitcommunity.org")` in `src/app/[locale]/layout.tsx`. Required for Next.js to resolve relative OG image URLs and canonical links into absolute URLs.

### robots.ts

Create `src/app/robots.ts` (app root, not locale-scoped):

- Allow all crawlers on all public pages
- Disallow: `/dashboard`, `/auth/*`, `/admin`
- Sitemap: `https://aitcommunity.org/sitemap.xml`

### sitemap.ts

Create `src/app/sitemap.ts` (app root):

Query Payload for all published content and generate entries for both locales:

- Static pages: home, events, blog, community, members, sponsors, jobs, privacy, terms
- Dynamic: all published events (by slug), all published articles (by slug), all forum threads (by slug)
- Each entry includes `alternates.languages` with `en` and `nl` URLs

## 2. Page Metadata + hreflang

### Shared helper: `src/lib/metadata.ts`

- `buildAlternates(path: string)` — returns `{ canonical, languages: { en, nl, "x-default" } }` for a given path
- `buildOgMeta(title, description, imageUrl?)` — returns `{ openGraph, twitter }` with site name, card type, etc.

### Per-page generateMetadata

| Page | title | description | OG image |
|---|---|---|---|
| `/` (home) | "AIT Community -- AI Tech Community Netherlands" | Existing description | Default OG |
| `/events` | "Events -- AIT Community" | Static summary | Default OG |
| `/events/[slug]` | `event.title` | type + date + location | Event cover or default |
| `/blog` | "Blog -- AIT Community" | Static summary | Default OG |
| `/blog/[slug]` | `article.title` | Content excerpt or tags | mediaUrl or default |
| `/community` | "Community -- AIT Community" | Static | Default OG |
| `/community/[slug]` | `thread.title` | Static community desc | Default OG |
| `/members` | "Members -- AIT Community" | Static | Default OG |
| `/members/[id]` | `member.displayName` | Bio truncated 160 chars | Default OG |
| `/sponsors` | "Sponsors -- AIT Community" | Static | Default OG |
| `/jobs` | "Jobs -- AIT Community" | Static | Default OG |
| `/privacy` | Existing, add OG + alternates | Existing | Default |
| `/terms` | Existing, add OG + alternates | Existing | Default |

### noindex pages

`/auth/signin`, `/auth/signup`, `/dashboard` get `robots: { index: false, follow: false }`.

### hreflang

Every public page includes `alternates` with `en`, `nl`, and `x-default` (pointing to `en`).

## 3. Structured Data (JSON-LD)

### Component: `src/components/json-ld.tsx`

Renders `<script type="application/ld+json">` with passed data.

### Organization (home page)

```json
{
  "@type": "Organization",
  "name": "AIT Community",
  "url": "https://aitcommunity.org",
  "logo": "https://aitcommunity.org/logo.png",
  "description": "A community for technical innovators in the Netherlands..."
}
```

### Event (event detail pages)

```json
{
  "@type": "Event",
  "name": "event.title",
  "startDate": "ISO 8601",
  "endDate": "ISO 8601 (if available)",
  "location": { "@type": "Place", "name": "event.location" },
  "image": "event.image.url",
  "eventStatus": "EventScheduled | EventCancelled",
  "eventAttendanceMode": "OfflineEventAttendanceMode",
  "organizer": { "@type": "Organization", "name": "AIT Community" },
  "offers": { "@type": "Offer", "price": "event.price / 100", "priceCurrency": "EUR" }
}
```

### Article (blog post pages)

```json
{
  "@type": "Article",
  "headline": "article.title",
  "datePublished": "article.publishedAt",
  "image": "article.mediaUrl",
  "author": { "@type": "Organization", "name": "AIT Community" },
  "publisher": { "@type": "Organization", "name": "AIT Community", "logo": "..." }
}
```

## 4. Dynamic OG Image Generation

### Route: `src/app/[locale]/og/route.tsx`

Single GET route handler using `ImageResponse` (from `next/og`).

**Design**: 1200x630, black background, white "AIT." logo top-left, large white title text centered, orange accent line, subtitle below. Matches site aesthetic.

**Query params**: `?title=...&subtitle=...`

Usage from generateMetadata:
```ts
openGraph: {
  images: [`/og?title=${encodeURIComponent(title)}&subtitle=${encodeURIComponent(subtitle)}`]
}
```

Covers all page types through different title/subtitle combinations.

## 5. Semantic HTML Fixes

### Home page double h1

Merge two `<h1>` tags (page.tsx:113-121) into one:
```html
<h1>
  <span class="font-light">Welcome to</span>
  <span class="font-extrabold">AI Tech Community Netherlands</span>
</h1>
```

### Section labels to h2

Change `SectionLabel` component on home page from `<span>` to `<h2>` with same styling. Apply same pattern to section headings on event detail, blog list, events list, members list, and member detail pages.

### img to next/image

- Event detail cover image (events/[slug]/page.tsx:85)
- Blog post featured image (blog/[slug]/page.tsx:103)

Both are likely LCP elements on their pages. Switch to `<Image>` with appropriate `width`/`height` or `fill` + `sizes` props.

## Files to Create

- `src/app/robots.ts`
- `src/app/sitemap.ts`
- `src/lib/metadata.ts`
- `src/components/json-ld.tsx`
- `src/app/[locale]/og/route.tsx`

## Files to Modify

- `src/app/[locale]/layout.tsx` — add metadataBase
- `src/app/[locale]/page.tsx` — metadata, JSON-LD, fix h1, SectionLabel to h2
- `src/app/[locale]/events/page.tsx` — metadata, h2 headings
- `src/app/[locale]/events/[slug]/page.tsx` — metadata, JSON-LD, img to Image, h2 headings
- `src/app/[locale]/blog/page.tsx` — metadata, h2 headings
- `src/app/[locale]/blog/[slug]/page.tsx` — expand metadata, JSON-LD, img to Image
- `src/app/[locale]/community/page.tsx` — metadata
- `src/app/[locale]/community/[slug]/page.tsx` — expand metadata
- `src/app/[locale]/members/page.tsx` — metadata, h2 headings
- `src/app/[locale]/members/[id]/page.tsx` — metadata, h2 headings
- `src/app/[locale]/sponsors/page.tsx` — metadata
- `src/app/[locale]/jobs/page.tsx` — metadata
- `src/app/[locale]/privacy/page.tsx` — add OG + alternates
- `src/app/[locale]/terms/page.tsx` — add OG + alternates
- `src/app/[locale]/auth/signin/page.tsx` — noindex
- `src/app/[locale]/auth/signup/page.tsx` — noindex
- `src/app/[locale]/dashboard/page.tsx` — noindex
