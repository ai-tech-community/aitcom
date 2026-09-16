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
- Detail routes stay at `/events/[slug]`.

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
