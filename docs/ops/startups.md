# Startups investigation (`/en/investigations/startups`)

Public directory + Insights. **Live rows live in Neon.** This repo ships the
schema, the staff insert API, and the empty UI. Ops Passes are homepage 200 +
1–3 sources + a listed category — inserted through the API, not GitHub diffs.

## Who counts

Companies that materially enable AI: models · agents · AI infra · robotics ·
energy · vertical / other.

Fixed taxonomy (store as `ai-infra` when Pulse says `AI infra`):

`models` · `agents` · `ai-infra` · `robotics` · `energy` · `vertical` · `other`

## What this PR does **not** do

- No JSX / TS seed arrays of companies
- No migration `INSERT` of company rows
- No PR-per-batch. Batch 1 and the daily 30 go through the insert API.

Empty Neon → soft empty state on Directory and Insights. That is correct.

## Insert API (staff / Hub operator)

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
- Map pins render **only** when both `lat` and `lng` are verified numbers. Do
  not invent coordinates from a city string.
- Do not send size, price, attendance, or growth figures. Those fields do not
  exist.

Example payload for a first batch (not loaded by the app):
[`fixtures/startups-batch1-payload.json`](fixtures/startups-batch1-payload.json).

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

`/en/investigations/startups/insights` aggregates **listed Neon rows only**
(category mix, region mix from non-blank region, listed-over-time). CSS bento

- HTML table fallback. No invented metrics.
