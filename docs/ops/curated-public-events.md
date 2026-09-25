# Curated public events (parked store)

The public surface at `/en/events` and `/nl/events` is again the **fat CMS
listing** (filters / map / cards) of hosted Payload `events` with
`status = published` and `discoverySource ≠ luma`. That Greg override
supersedes the thin curated-only bar from #285 / #300.

`app.curated_public_event` and `src/lib/events/public-events-seeds.ts`
remain in the repo as a parked AIT-room store. They are **not** the
public listing. Do not dump curated seed rows onto `/en/events` as a
substitute for the CMS chrome.

## Public listing (current)

- Hosted Payload published events (cards)
- Upcoming / past tabs, search, type / focus / format / AIT-fit filters
- Grid and map views
- Join chrome: guests get hard www `/en/join` with events UTMs; signed-in
  Hub members get Open Hub (zero Join). No invented attendance / RSVP /
  spots-left counts on the listing.
- Event JSON-LD on the listing only when name, startDate, url, and a real
  place are sourced. Hollow rows are omitted. Never invent attendance,
  RSVP, spots-left, end dates, or "Online" as a city.
- Detail routes stay at `/events/[slug]`.
- Default upcoming sort is `date` ascending, so a published row shows in start-date order.

## Landing a row on `/events` (fat CMS)

Staff-cleared events belong in Payload `events`, `status = published` and
`_status = published`, with `discovery_source` other than `luma`. Migration
`20260925a_builder_public_events` upserts the 25 Sep 2026 ops batch (The AI
Conference, World Summit AI Amsterdam, AI Engineer New York, NVIDIA GTC
Berlin, TEDAI Vienna) and soft-retires a still-published Turku row
(`status = cancelled`, `review_status = archived`). `20260925b_tedai_vienna`
re-upserts `tedai-2026` only, from that same seed, and leaves every other
Vienna row in place. No attendance, RSVP,
price, or image. Production applies unrecorded migrations during the Vercel
build, so www `/en/events` shows them after that deploy. The static guide at
`/events/world-summit-ai-amsterdam-2026` still wins over the CMS detail route
for that slug.

## Parked curated row shape (unused by `/events`)

Only these fields if you still park an AIT-room event here:

- **date** (`YYYY-MM-DD`)
- **city** or **online**
- **real URL** (official external event page — `https://…`, never invented)
- **one-line why** (EN + NL; short; no essays)

Do **not** store or display attendance, RSVP, or spots-left counts.

## How to add a parked AIT-room event (store only)

1. Confirm the official event page is live and the date is published there.
2. Insert a row into `app.curated_public_event`:

```sql
INSERT INTO app.curated_public_event (
  id, title, date, online, city, url, why_en, why_nl
) VALUES (
  'short-stable-id',
  'Event title',
  '2026-10-07',
  false,
  'Amsterdam',          -- NULL when online = true
  'https://official.example/event',
  'One-line why in English.',
  'Eén regel waarom in het Nederlands.'
);
```

3. Or add the same object to `src/lib/events/public-events-seeds.ts` and a
   follow-up migration if the list should ship in git. Weekday +5
   (`20260916a_curated_public_events_weekday`) inserts those official
   start-date rows; never invent end dates or attendance.

## Out of scope

- Roles / org-tree (separate PR)
- Awesome AI OSS seed changes
- Invented attendance figures
