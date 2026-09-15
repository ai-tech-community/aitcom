# Startups investigation (`/en/investigations/startups`)

Public directory + Insights. **Live rows live in Neon.** The app reads the
database on each request (`force-dynamic`). Staff inserts after deploy show
up without a redeploy. UI components do not bake a company list.

## Who counts

Companies that materially enable AI: models · agents · AI infra · robotics ·
energy · vertical / other.

Fixed taxonomy (store as `ai-infra` when Pulse says `AI infra`):

`models` · `agents` · `ai-infra` · `robotics` · `energy` · `vertical` · `other`

## v1 seed (20/20)

Ops Pass 2026-09-15. Migration `20260915c_startups_v1_seeds` inserts these
twenty Pulse-verified rows (homepage 200 + 1–3 sources). Blank region/stage
are stored null and soft-omitted. Logos soft-omit if missing or they fail to
load. No invented size or price figures.

Ship list: Figure AI · Agility Robotics · Apptronik · 1X Technologies ·
Physical Intelligence · Skild AI · Crusoe · Aalo Atomics · Oklo · Emerald AI ·
Anthropic · Mistral AI · Cohere · Hugging Face · LangChain · Pinecone ·
Weaviate · Fireworks AI · Perplexity · Cursor (Anysphere).

**Out of v1** (Pulse overflow — do not insert): Together AI · Replicate ·
Midjourney · ElevenLabs · Runway · Scale AI · Glean · Sierra · Factory ·
Cognition.

Source of truth for the twenty rows:
[`src/lib/investigations/startups-v1-seeds.ts`](../../src/lib/investigations/startups-v1-seeds.ts).
Same payload for API retries:
[`fixtures/startups-batch1-payload.json`](fixtures/startups-batch1-payload.json).

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

Row shape (Pulse-compatible):

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
  "logoUrl": null,
  "lat": null,
  "lng": null
}
```

Rules:

- Homepage must be a live `http(s)` URL (Ops confirms 200 before insert).
- Sources: **1–3** URLs.
- `region`, `stage`, `logoUrl`, `lat`, `lng` may be null. The UI soft-omits blanks.
- Map pins (approximate is OK):
  - city/HQ coords (`lat`/`lng`) → pin near that place
  - region string only → pin at the **region/city centroid**
  - unknown location (no region, no coords) → **list only, no pin**
- Pin label is the **sourced place string only** (city/region as given). Never
  invent a street address.
- Do not send size, price, attendance, or growth figures. Those fields do not
  exist.

Map Pulse `logo_url` → `logoUrl` when calling `createStartups`. Example:

```ts
await caller.startups.createStartups({
  rows: payload.seeds.map((row) => ({
    name: row.name,
    homepage: row.homepage,
    category: row.category,
    sources: row.sources,
    region: row.region,
    stage: row.stage,
    logoUrl: row.logo_url,
  })),
});
```

Staff can also add or edit a single row from the Directory when signed in as a
Hub operator (`Add a company`).

## Insights

`/en/investigations/startups/insights` aggregates **listed Neon rows only**.
Bento hero: Added over time. 2×2: Category / Region / Stage / Sources
coverage. HTML table under each chart. Blank region/stage omit the chart
(no fake empty series). Directory ↔ Insights are hard links.

## Crawl / SEO

- Directory and Insights are `force-dynamic` and server-read Neon on each
  request. New API rows appear in SSR without a redeploy.
- Directory pages after page 1 use crawlable `?page=` links (`STARTUPS_PAGE_SIZE`
  is 24, so a list past ~50 rows is page 3).
- The sitemap includes `/investigations/startups`, `/insights`, and later
  `?page=` paths from the live approved row count.
