# Startups (`/en/startups`)

Public directory + Insights. **Live rows live in Neon.** The app reads the
database on each request (`force-dynamic`). Staff inserts after deploy show
up without a redeploy. UI components do not bake a company list.

H1 is **AI startups worth watching**. Source links use Docs · Deep dive ·
Talk · News, or a sourced publication title (Wikipedia, TechCrunch). Never
bare `1` / `2` / `3`.

## Who counts

Companies that materially enable AI: models · agents · AI infra · robotics ·
energy · vertical / other.

Fixed taxonomy (store as `ai-infra` when Pulse says `AI infra`):

`models` · `agents` · `ai-infra` · `robotics` · `energy` · `vertical` · `other`

## v1 seed (20/20)

Ops Pass 2026-09-15, enriched the same day. Migration
`20260915c_startups_v1_seeds` inserts the twenty Pulse-verified rows
(homepage 200 + 1–3 sources). `20260915e_startups_v1_enriched` writes
Ops-passed founders / exit / jobs_url onto those rows. Blank region/stage
stay null and soft-omitted. Logos soft-omit if missing or they fail to
load.

Enriched batch 1: jobs_url 20/20 (careers 200). Founders 17/20 — soft-omit
Weaviate, Apptronik, Skild. Exits: Oklo `ipo` / 2024; Cursor `acquired` /
2026, acquirer SpaceX. **Never invent a people graph or who-works-where.**
No invented size or price figures.

Ship list: Figure AI · Agility Robotics · Apptronik · 1X Technologies ·
Physical Intelligence · Skild AI · Crusoe · Aalo Atomics · Oklo · Emerald AI ·
Anthropic · Mistral AI · Cohere · Hugging Face · LangChain · Pinecone ·
Weaviate · Fireworks AI · Perplexity · Cursor (Anysphere).

**Out of v1** (Pulse overflow — do not insert): Together AI · Replicate ·
Midjourney · ElevenLabs · Runway · Scale AI · Glean · Sierra · Factory ·
Cognition.

Canonical insert payload (post-merge API / admin Neon retries):
[`fixtures/startups-batch1-payload.json`](fixtures/startups-batch1-payload.json).
Stable ids live in
[`src/lib/investigations/startups-v1-seeds.ts`](../../src/lib/investigations/startups-v1-seeds.ts)
— UI components do not bake this list.

## Insert API (staff / Hub operator)

Later batches (daily 30, overflow when Ops-passed) go through the staff API,
not a new seed migration.

tRPC router `startups`. Staff writes are Hub owner/admin only.
CV procedures are any signed-in member (`protectedProcedure`).

| Procedure                 | Purpose                                           |
| ------------------------- | ------------------------------------------------- |
| `startups.createStartup`  | One Ops-passed row                                |
| `startups.createStartups` | Batch, max 30 rows (`STARTUPS_BATCH_MAX`)         |
| `startups.updateStartup`  | Edit an existing row                              |
| `startups.listApproved`   | Public read (also what the page uses)             |
| `startups.getMyCv`        | Member: stored CV filename + extracted text       |
| `startups.upsertMyCv`     | Member: store extracted text (2MB, .txt/.md/.pdf) |
| `startups.deleteMyCv`     | Member: remove the stored CV                      |

Row shape — Pulse fixture aliases are accepted (`logo_url`, `jobs_url`,
`status` as the sourced exit, `exit_acquirer`, `exit_year`):

```json
{
  "name": "Example",
  "homepage": "https://example.com/",
  "category": "AI infra",
  "sources": [
    "https://example.com/about",
    "https://en.wikipedia.org/wiki/Example"
  ],
  "region": null,
  "stage": null,
  "logo_url": null,
  "description": null,
  "founders": [{ "name": "Ada Example", "url": null }],
  "status": null,
  "exit_acquirer": null,
  "exit_year": null,
  "jobs_url": "https://example.com/careers"
}
```

Rules:

- Homepage must be a live `http(s)` URL (Ops confirms 200 before insert).
- Sources: **1–3** URLs.
- `region`, `stage`, `logoUrl`, `description` / `blurb`, `lat`, `lng` may be
  null. The UI soft-omits blanks. `description` is a sourced short blurb only
  — never invent copy. Pulse will enrich existing rows once the column exists.
- `founders` is sourced-only `{ name, url?, imageUrl? }[]`. Blank name rows
  drop. Max 8. Leave `[]` when Pulse did not pass names. Photo URL only when
  sourced — UI uses initials otherwise and **never invents a face or stock
  photo**. **Never invent a people graph or who-works-where.** Ops will Fail
  invent. Source chips must have unique labels (never `News`/`News`).
- Pulse `status` / `exitStatus` is sourced-only `acquired` | `ipo` |
  `shutdown`. Optional `exit_acquirer` / `acquirer` and `exit_year` /
  `exitOn` (`YYYY` or `YYYY-MM-DD`) only when that exit is sourced. Do not
  invent 1 January. Blank = soft-omit (no badge). Listing
  `pending|approved|rejected` is a different field — do not collide.
- `jobsUrl` only when Ops confirmed the careers page returns **HTTP 200**.
  Same contract as homepage: confirm at insert, no live fetch on render.
  Blank or non-200 = soft-omit (no Open jobs CTA).
- Map pins (approximate is OK):
  - city/HQ coords (`lat`/`lng`) → pin near that place
  - region string only → pin at the **region/city centroid**
  - unknown location (no region, no coords) → **list only, no pin**
- Pin label is the **sourced place string only** (city/region as given). Never
  invent a street address.
- Do not send size, price, attendance, or growth figures. Those fields do not
  exist.

The fixture is the insert payload. `createStartups` accepts Pulse field
names:

```ts
await caller.startups.createStartups({ rows: payload.seeds });
```

Staff can also add or edit a single row from the Directory when signed in as a
Hub operator (`Add a company`).

## Insights

`/en/startups/insights` aggregates **listed Neon rows only**.
Bento hero: Added over time. 2×2: Category / Region / Stage / Sources
coverage. HTML table under each chart. Blank stage omits the chart (no
fake empty series). **Region mix is soft-omitted until ≥5 distinct sourced
regions** — never invent region zeros. Directory ↔ Insights are hard links.

## Join chrome

Guests see the hard www `/en/join` door plus startups UTMs. Signed-in
Hub members never see Join — `shouldPromoteJoin()` / `PromoteJoinCta` swap
to Open Hub (`/communities/ait/forum`). Same leftover rule as navbar JOIN
(`!user`).

On a dedicated role page, members also get a **Role Brief** copied from
the sourced snapshot (must/nice headings, title seniority, mentioned
languages — never invented copy). The copy prompt is assembled in the
browser so CV text is not SSR'd for crawlers. Private CVs live in
`app.startup_member_cv` as extracted text only (purpose
`startup_role_applications`, one row per user, deletable, cascade on
account delete). Do not reuse `/api/upload`. Tailor / coverage map /
in-app send stay out of this slice.

Directory default is an SSR `<table>` with five columns plus a links cell:
sticky **Company** (sourced `logoUrl`, or a letters-only monogram when none is
on record — never a favicon or invented mark; name is the hard SSR link to
`/en/startups/{slug}`; sourced blurb and founders sit under the name) ·
Category · Region · **Status** (exit badge, open-role count, stage) · Sources
(favicon chips). The last cell holds the homepage icon link (“Open homepage”
for screen readers) and, for moderators, Edit. Blank cells soft-omit — never
invent “—”. A result count sits above the table with **Clear filters** when
any filter or search is on; on small screens the five filter menus fold
behind a **Filters** toggle.

Each listed company has a unique stable `slug` (slugify of the name, with
`-2` / `-3` on collision). Create/update accept or generate a slug and keep
it unique. Profile route is `/en/startups/[slug]` (NL
equivalent). The profile is one page, no tabs: a header (logo in crop marks
or monogram, name, category and exit badges, sourced blurb, Open homepage,
open-roles count), then Founders / Open roles / In the news sections beside
an “At a glance” facts sheet (region, stage, listed date, non-press sources)
and a location map. Sections and fact rows with no sourced data are omitted
entirely; a profile with no sections shows the facts sheet and map side by
side. Never invent copy, faces, marks, metrics, or street addresses.
Map is behind **Open map** → Sheet (`Map` / `Close`). Every sourced
region gets a pin at a city/region centroid; unknown / street-like
strings stay list-only. Maps never zoom past a pin's precision: city
level (zoom 10) at most, country level (zoom 5) for region centroids, and
the profile captions the pin as approximate (`≈ 43.7° N, 79.4° W`). Empty sheet copy is **No locations listed yet**
only when no sourced region can be pinned. No always-on map.

## Directory filters

Crawlable query params on `/startups`. Pagination links keep
the active filters.

| Param      | Values                               | Notes                                                                                                      |
| ---------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `category` | taxonomy id                          | same as before                                                                                             |
| `region`   | sourced region string                | only listed, non-blank regions                                                                             |
| `stage`    | sourced stage string                 | blank stage does not match                                                                                 |
| `status`   | `active` `acquired` `ipo` `shutdown` | blank/null exit → **active** for the filter only. Rows still omit the badge. Not listing pending/approved. |
| `hiring`   | `1`                                  | has sourced `open` roles (`open_role_count` > 0)                                                           |
| `sort`     | `newest` (default) `name` `category` | `newest` is omitted from the URL                                                                           |

## Crawl / SEO

- Directory and Insights are `force-dynamic` and server-read Neon on each
  request. New API rows appear in SSR without a redeploy.
- One canonical per startup profile (`/startups/{slug}`).
  Organization JSON-LD uses sourced fields only and includes `description`
  only when a sourced blurb exists. Sitemap lists each profile slug.
- Open positions live at `/jobs` with one page per sourced role
  (`/jobs/{roleSlug}`). The table filters by company, location, work type,
  and search, and sorts by role, company, or location. A signed-in member can
  follow a filtered search; the next visit lists roles this directory stored
  after the last look, with no employer publish date unless the careers page
  printed one. Each startup profile hiring list shows location and work type
  when the board provided them. A role link opens that startup
  job page. Hub members can privately mark “I’m applying” on that page, and
  track a role from the jobs table. `/dashboard/jobs` lists only those tracked
  roles and lets the member move them through Applying, Applied, Talking,
  Offer, and Passed. Ask for help posts a question in one community the member
  belongs to, with their note and a classroom only when that community already
  lists it.
  `/startups/jobs`, `/investigations/startups/jobs`, and the old
  community `/communities/{slug}/jobs` board permanent-redirect here. The daily `startup-jobs-scan` cron reads
  every listed startup with a verified `jobs_url` (oldest `jobs_scanned_at`
  first) until `STARTUP_JOBS_SCAN_BUDGET_MS` (~240s). ATS JSON first (Ashby /
  Greenhouse / Lever / Workable); otherwise listing HTML then the original
  posting page for any missing JD. Title + source URL are required to
  publish. Location/category index CTAs (`Jobs in Chicago`,
  `Software Engineer Jobs in New York`) and apply buttons (`View Position & Apply`)
  are skipped, as are raw URL titles and “check out our open roles” links. An
  empty YC `jobPostings` list is a live empty board: the site-wide `/jobs`
  directory is not followed. YC and Work at a Startup pages are read from
  that list (or the embedded job object), then the original posting page
  supplies the JD. Rippling boards are read from the page payload. A listing
  title that only adds “Apply now” is replaced by the posting-page title.
  Card chrome glued into the title (work type, location, “Read more”) is
  stripped so the stored title and JobPosting JSON-LD stay role-only. The
  JobPosting block is emitted only when the ATS supplied a real publish
  date (`datePosted`, `publishedAt`, `published_on`, or `first_published`).
  `updated_at`, `createdAt`, `fetchedAt`, and the crawl clock are never
  used as `datePosted`. A sourced place is a PostalAddress with only the
  `addressLocality` / `addressRegion` / `addressCountry` tokens in the
  string. Street and postal code stay omitted. `employmentType`,
  `validThrough`, and `baseSalary` stay omitted unless the ATS already
  stored a real value. OCR
  prefixes like “kevAbout” are dropped from the description start.
  Rich-text blocks (for example Webflow `job-rich-text`), Elementor post
  content, and Framer `Content` regions supply the JD when the page has no
  article. Otherwise the visible page text is cut to the posting itself,
  starting at sections such as “About the role” and “Requirements”, so a
  menu labeled description is not stored as the JD. Schema.org `FULL_TIME`
  is stored as “Full-time”. If that text is still missing and
  `STARTUP_ROLE_VISUAL_BACKUP=1`, a capped local screenshot plus Tesseract
  pass is the backup. It uses no paid vision API and does nothing when
  Chrome or Tesseract is not installed.
  Low-confidence extracts stay `pending_review`. Roles that
  disappear on a later **successful** scan become `closed` and keep their
  page. A live empty board writes `open_role_count = 0` on `app.startup`
  (do not invent a JD). A failed fetch does not close roles or zero the
  count. The Status column shows the count when open roles exist;
  otherwise it is soft-omitted. `/en/roles` remains Hub seats.
- `/investigations/startups` permanent-redirects to `/startups`.
- Global nav lists **Jobs** (`[W]`) and **Startups** (`[U]`) inline
  after Hub **Roles** (ADR-0010). `/jobs` is sourced startup openings;
  `/startups` is the directory. Footer Navigate lists Startups. Do **not**
  replace Hub `/roles`. Nested `/startups/{slug}` keeps Startups active;
  `/jobs/{slug}` keeps Jobs active.
- Directory pages after page 1 use crawlable `?page=` links (`STARTUPS_PAGE_SIZE`
  is 24, so a list past ~50 rows is page 3). Pagination stays crawlable.
- **Crawl is open:** Directory + Insights send `index,follow` and stay **in
  the sitemap** (including `?page=`). Do **not** noindex or drop these paths
  based on verified count. **≥3000 is promo-only** (no LinkedIn / newsletter /
  Hub push until then) — not a crawl gate and **not** a public Investigation
  Pass. Writing Bot + Ops Pass are still required before claiming Pass. Do
  not invent a Pass flag.
- Cursor chip `Cursor: Joining SpaceX` is the sourced
  `https://cursor.com/blog/joining-spacex` URL (migration
  `20260915f_startups_v1_polish`). UI reads `sources[]` from Neon — do not
  seed that label in JSX.
