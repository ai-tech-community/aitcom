# Curated public events (`/en/events`)

Thin, indexable list at `/en/events` and `/nl/events`. This is the landing
surface for public AI events parked in the AIT room until they have a row
here.

## Row shape

Only these public fields:

- **date** (`YYYY-MM-DD`)
- **city** or **online**
- **real URL** (official external event page — `https://…`, never invented)
- **one-line why** (EN + NL; short; no essays)

Do **not** store or display attendance, RSVP, or spots-left counts.

## How to add a parked AIT-room event

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
   follow-up migration if the list should ship in git.

The public page reads the table first. If the query fails or the table is
empty, it falls back to the static seed list. Soft-fail empty: never invent
rows.

## Out of scope

- Roles / org-tree (separate PR)
- Awesome AI OSS seed changes
- Invented attendance figures
