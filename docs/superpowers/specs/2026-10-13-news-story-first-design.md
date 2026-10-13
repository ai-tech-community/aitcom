# Story-first news

Date: 2026-10-13
Branch: `feat/news-story-first`
Base: `origin/main` at `8d8b360f`

## Intent

Turn the existing news archive into a place where readers can understand how a development unfolded and explore meaningful connections to other developments. A reader opens a collected article, sees its context in an ongoing storyline, follows the timeline back to earlier reporting, and can inspect the evidence for a connection to another storyline.

The fictional Acme example in the conversation illustrates the interaction. It is not production content.

## Existing implementation

- `src/app/[locale]/news/page.tsx` renders `/en/news` and `/nl/news`.
- `src/components/news/news-table-browser.tsx` owns the filter interactions.
- `src/server/news/table-page.ts` queries counted, paginated archive results with caching.
- `src/lib/news/table-query.ts` owns search parameters and existing article deep links.
- `app.news_item` contains URL, title, author, publication date, source excerpt, and an optional AI summary.
- `app.news_rumor` separately stores member submissions and their moderation state.
- `app.news_item_startup` connects collected articles to directory companies.
- RSS ingestion and bot submission already populate the archive. They do not currently construct ongoing storylines.
- Current archive search already covers title, source excerpt, and AI summary. This proposal reuses it.
- The existing `story` query parameter identifies an individual collected article. Preserve its meaning and digest links.

## Approaches and decision

1. **Persisted editorial storylines — recommended first slice.** Staff build storylines from articles already in the archive. Each explanation carries evidence. This provides the complete reader experience with inspectable relationships and stable URLs.
2. **Automatic clustering and publishing.** Faster coverage, but feed excerpts can be sparse and topical similarity does not establish a relationship. Broad feeds also contain non-AI news. Publishing inferred causal links automatically would undermine the intended experience.
3. **Temporary groups assembled on page load.** Avoids persistent editorial data, but membership changes between visits, stable timelines are difficult, and it repeats processing on reader requests.

Use persisted editorial storylines, with staff editing included in the first slice. Automated draft suggestions can be added later against the same model. Do not fabricate storylines from keyword overlap or present model inference as established fact.

## First deliverable

### News entry point

Add a clearly labeled ongoing-stories section above the existing archive. Show up to six published storylines ordered by the latest dated article, with title, short overview, article count, and latest update date. Provide a paginated `/news/stories` index with title/overview search.

Keep the archive table, existing filters, rumor submission, pagination, outbound article links, and digest deep links functional. Collected article rows gain links to their published storylines and their corresponding timeline entries. Load memberships for the current page in one batch rather than one query per article.

When no storylines are published, the archive stays usable and the new section has an honest empty state. Do not seed fictional content.

### Storyline page

`/news/stories/[slug]` shows:

1. Title, editorial overview, article count, and latest development date.
2. A chronological “How did we get here?” timeline.
3. Unresolved questions entered by an editor.
4. Related storylines, each with an expandable explanation and evidence links.

Each timeline entry shows the source article's title, source, publication date, a short account of what it adds, and a link to the original reporting. Entries have stable anchors based on article ID so archive links can open the right development.

Order known publication dates oldest first, breaking ties by article ID. Group undated articles separately and label them undated; collection time must not masquerade as publication time. The latest dated entry is visually marked and reachable via a “Latest development” link.

The “What it adds” text is editorial synthesis, displayed distinctly from quoted source evidence. Connecting language such as “led to” requires explicit supporting evidence; otherwise describe the thematic relationship without asserting causation.

### Editorial workflow

Provide a staff-only storyline editor at `/news/stories/manage`, using the existing staff authorization rule. Editors can:

- Create a draft with a stable slug, title, overview, and unresolved questions.
- Search existing collected articles using the archive query and attach them to the draft.
- Write a per-article contribution note and evidence excerpt.
- Connect two storylines with a relationship label, explanation, and supporting articles.
- Publish, return to draft, and edit a storyline.

Publishing requires a title, overview, and at least two valid collected articles with contribution notes and source evidence. Evidence excerpts must be normalized substrings of the article's stored source excerpt or title; generated summaries are not evidence. Editors can select text from the stored source to satisfy this constraint. Short excerpts limit public quotation length.

Storylines can include an article in more than one storyline. Duplicate membership within one storyline is prohibited. Article deletion cascades its membership and evidence references. A storyline with fewer than two remaining articles is excluded from public results until repaired.

The UI explains why publication is blocked when requirements are missing. Article selection is paginated; it must not load the entire archive into the browser.

## Domain model

Use “article” for an existing `news_item` and “storyline” for a continuing narrative. Existing types and URL parameters that call an article a story remain compatible.

Add three concepts using Drizzle tables and the repository's registered migration pattern:

- **Storyline:** ID, unique stable slug, EN/NL title and overview, EN/NL unresolved questions, draft/published status, creator/updater IDs, created/updated timestamps.
- **Membership:** storyline ID, article ID, EN/NL contribution note, source evidence excerpt. Composite uniqueness on storyline/article and an article-side index for archive lookups.
- **Connection:** directed source and target storyline IDs, relation type (`shared_development`, `builds_on`, or `contrasting_claims`), EN/NL explanation, evidence references to memberships in both storylines. Reject self-links and duplicate source/target/type combinations. Render incoming and outgoing connections with correct direction.

English editorial content is required for publication. Dutch editorial content is optional and falls back visibly to English. Interface copy is translated in both locales. Source headlines and evidence remain in their original language.

Readers only see connections whose endpoints are public and whose evidence references remain valid. Every public connection includes at least one supporting article from each endpoint. All initial connections are editor-reviewed; no automatic suggestion is published in this slice.

## Module boundaries and data flow

- `src/lib/news/storylines.ts`: shared types and validation for editorial input, slugs, evidence, and publication eligibility. No database or UI imports.
- `src/server/news/storylines.ts`: bounded index/detail/membership reads and authorized editorial writes through explicit database adapters.
- Existing `newsRouter`: staff-only mutations validate authorization server-side, validate references, save related changes atomically, and invalidate storylines and archive caches.
- Storyline pages: server-rendered public reads with explicit not-found and load-failure handling. No model calls on reader requests.
- Storyline editor: isolated client form components using the existing tRPC and UI conventions.
- Existing news page: batch-load published memberships for visible collected article IDs and load the bounded storyline preview.

Public reads exclude drafts. Staff-only authorization applies both to the editor page and every mutation. Client controls are not authorization boundaries. Article text is treated as data and rendered as text; outbound URLs follow the existing news URL rules.

## Failure and empty states

- Unknown or draft slug: public 404.
- Missing evidence or article: prevent publication with a specific error.
- No storylines/search matches: helpful empty state and route back to the archive.
- Database load failure: explicit unavailable message; do not silently report zero results.
- Missing English editorial copy: prevent publication.
- Draft connection endpoint or deleted evidence: omit that connection publicly.
- Storyline changes invalidate both storyline reads and article membership badges.
- The reader experience makes no claim to have read full external articles: initial evidence comes from the stored excerpts and headlines.

## Visual behavior

Follow `PRODUCT.md` and `DESIGN.md`: white/true-dark surfaces, Geist Sans narrative copy, Mono dates and the house section label, flat ruled structure, and restrained orange for the primary action. Prefer a readable timeline to a large network visualization. Use semantic headings, native links, keyboard-operable disclosures, visible focus, mobile stacking, and reduced-motion support.

## Later slices

These are separate follow-on work, not fake controls in the first release:

- AI-assisted draft grouping and proposed explanations, with evidence validation and editorial review.
- Following a storyline with meaningful update notifications using the existing notification infrastructure.
- An optional graph around the current storyline, derived from persisted connections.
- Semantic archive search and cited question answering.
- Full-article extraction for evidence beyond RSS excerpts, with provenance and source quoting limits.

## Verification and delivery constraints

Run only added/touched unit test files and `pnpm typecheck` in the changed workspace. Use mocked storage and fixture articles; never point tests at a real database. No integration, Chromium, full-suite, or all-workspace test lanes.

Focused tests must prove publication eligibility, evidence validation, duplicate/reference constraints, public draft exclusion, incoming/outgoing connection direction, chronology and undated behavior, staff authorization, archive deep-link compatibility, and EN/NL fallback. Page/component tests should assert meaningful reader and editor behavior rather than mirror markup.

Prepare migrations but do not apply them, seed content, trigger ingestion, or otherwise write to a database. Do not push. Validation requiring migrated storage remains explicitly pending for the deployment owner.

## Acceptance example

Given two or more real stored articles with suitable excerpts, a staff editor can create and publish a storyline without code changes. A reader discovers it on `/news`, opens its timeline, follows each original source, and navigates an explained connection to another published storyline. The existing searchable archive and rumor flow continue to work. No fictional article or unsupported connection is needed to demonstrate the complete flow.
