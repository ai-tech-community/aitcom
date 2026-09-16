# Startups investigation (`/en/investigations/startups`)

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

tRPC router `startups`, Hub owner/admin only:

| Procedure                 | Purpose                                   |
| ------------------------- | ----------------------------------------- |
| `startups.createStartup`  | One Ops-passed row                        |
| `startups.createStartups` | Batch, max 30 rows (`STARTUPS_BATCH_MAX`) |
| `startups.updateStartup`  | Edit an existing row                      |
| `startups.listApproved`   | Public read (also what the page uses)     |

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
- `region`, `stage`, `logoUrl`, `lat`, `lng` may be null. The UI soft-omits blanks.
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

`/en/investigations/startups/insights` aggregates **listed Neon rows only**.
Bento hero: Added over time. 2×2: Category / Region / Stage / Sources
coverage. HTML table under each chart. Blank stage omits the chart (no
fake empty series). **Region mix is soft-omitted until ≥5 distinct sourced
regions** — never invent region zeros. Directory ↔ Insights are hard links.

## Join chrome

Guests see the hard www `/en/join` door plus investigation UTMs. Signed-in
Hub members never see Join — `shouldPromoteJoin()` / `PromoteJoinCta` swap
to Open Hub (`/communities/ait/forum`). Same leftover rule as navbar JOIN
(`!user`).

Directory default is an SSR `<table>`: sticky **Name** · **Founders**
(sourced name + profile link; AvatarGroup OK) · **Homepage** (its own
hard `<a>`, not only Name) · Category · Region/City · Stage · Exit ·
Sources (favicon chips) · Jobs. Blank cells soft-omit — never invent “—”.
Map is behind **Open map** → Sheet (`Map` / `Close`). Every sourced
region gets a pin at a city/region centroid; unknown / street-like
strings stay list-only. Empty sheet copy is **No locations listed yet**
only when no sourced region can be pinned. No always-on map.

## Directory filters

Crawlable query params on `/investigations/startups`. Pagination links keep
the active filters.

| Param      | Values                               | Notes                                                                                                      |
| ---------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `category` | taxonomy id                          | same as before                                                                                             |
| `region`   | sourced region string                | only listed, non-blank regions                                                                             |
| `stage`    | sourced stage string                 | blank stage does not match                                                                                 |
| `status`   | `active` `acquired` `ipo` `shutdown` | blank/null exit → **active** for the filter only. Rows still omit the badge. Not listing pending/approved. |
| `hiring`   | `1`                                  | has a sourced `jobs_url`                                                                                   |
| `sort`     | `newest` (default) `name` `category` | `newest` is omitted from the URL                                                                           |

## Crawl / SEO

- Directory and Insights are `force-dynamic` and server-read Neon on each
  request. New API rows appear in SSR without a redeploy.
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
