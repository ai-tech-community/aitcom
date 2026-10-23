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
- AI filter on the same URL: `?ai=1` (the stored text is about AI) and
  `?ai=0` (the stored text is not). Null rows match neither. Those two
  views are `noindex,follow` with a canonical of `/events`. The unfiltered
  URL, title, and Event JSON-LD stay on the page without `ai`.
- `events.is_ai` is a nullable boolean. Migration `20261015b_event_is_ai`
  only adds the column, and it is registered after
  `20261015b_startup_role_is_ai`. `/api/cron/event-ai` classifies title, summary,
  and description in batches and skips a row that is already true or false.
  GPU, NVIDIA, automation, ML, LLMs, agents, and data science count as AI.
  A title that does not settle the subject stays null and matches neither
  filter. A non-AI reading does not drop the event. Discovery still requires
  a real http(s) source link and does not invent one.
- Grid and map views
- Join chrome: guests get hard www `/en/join` with events UTMs; signed-in
  Hub members get Open Hub (zero Join). No invented attendance / RSVP /
  spots-left counts on the listing.
- Event JSON-LD on the listing only when name, startDate, url, and a real
  place are sourced. Hollow rows are omitted. Never invent attendance,
  RSVP, spots-left, end dates, or "Online" as a city. A stored `endDate`
  is included when the row has one, and omitted when it does not.
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
Vienna row in place. `20261005a_pytorch_aixia_web_summit` upserts only
`pytorch-conference-north-america-2026`, `aixia-2026`, and `web-summit-2026`
from that same seed. `20261006a_five_public_events` upserts only
`boston-openclaw-meetup-2026`, `techex-amsterdam-hackathon-2026`,
`agentic-ai-in-the-wild-2026`, `hacktoberfest-hack-day-barcelona-2026`, and
`llmday-london-2026` from that same seed.
`20261019a_five_public_events` upserts only
`iamexpat-fair-the-hague-2026`, `slush-2026`,
`ai-europe-congress-2026`, `ukairs-2026`, and
`ai-hpi-conference-2026` from that same seed.
`20261021a_ten_public_events` upserts only
`ai-devcon-nyc-2026`, `ai-engineering-summit-austin-2026`,
`siai-2026`, `kvk-ondernemersdagen-2026`,
`ai-coding-summit-nyc-2026`, `dsc-europe-2026`,
`expatise-income-tax-utrecht-2026`, `ae-global-summit-2026`,
`data-science-summit-warsaw-2026`, and
`generative-ai-summit-london-2026` from that same seed.
`20261022a_seven_public_events` upserts only
`agentic-transformation-summit-amsterdam-2026`,
`sinterklaasintocht-amsterdam-2026`,
`handelsblatt-ai-summit-2026`, `microsoft-ignite-2026`,
`welcome-to-the-hague-2026`, `apidays-paris-2026`, and
`the-ai-summit-new-york-2026` from that same seed.
`20261023a_six_public_events` upserts only
`the-amsterdam-ai-summit-2026`, `say-hello-eindhoven-2026`,
`tedxamsterdam-2026`, `ai-data-science-day-2026`,
`big-data-conference-europe-2026`, and `aws-reinvent-2026`
from that same seed. `big-data-conference-europe-2026` is hybrid
(Vilnius and online). The summary keeps the lowest single ticket,
1-day onsite €450 excl. VAT, and says the ticket includes AI Summit
Europe. The 3-for-2 workshop price is not stored. The map pin is
Forum Cinemas Vingis. `the-amsterdam-ai-summit-2026` keeps the live
General Admission offer at €34.99. `ai-data-science-day-2026` and
`say-hello-eindhoven-2026` say registration is required and do not
say the event is free. `aws-reinvent-2026` stores the stated full
price of $2,499 and names Las Vegas, because the page names no hall.
`tedxamsterdam-2026` is a different event from `tedai-2026`. `is_ai`
is false for Say Hello and TEDxAmsterdam. The same migration writes a
Nominatim point for each venue only when latitude or longitude is still
null.
`agentic-transformation-summit-amsterdam-2026` keeps the lowest public
pass in the summary (from €1,799 + VAT) and does not store one euro price.
`handelsblatt-ai-summit-2026` keeps the page's "from €950" cost label in
the summary. `microsoft-ignite-2026` is hybrid and keeps the free digital
pass first, then the Hub pass at $1,625 for 17–19 Nov. It does not mention
the $325 pre-day add-on. `apidays-paris-2026` sets `is_ai` true: the
official theme is AI ecosystems with APIs, and the summary says so.
Leaving the column null would let the event-ai cron set the same value.
`the-ai-summit-new-york-2026` keeps the live Expo pass as "from $129".
The expo page still says "starting at just $49", but that price widget's
timer is 28 Aug 2026 23:59 UTC, which has passed.
`welcome-to-the-hague-2026` says registration is required and does not
say the evening is free. `sinterklaasintocht-amsterdam-2026` stores the
published clock times and says they are approximate. The same migration writes a
Nominatim point for each venue only when latitude or longitude is still
null. The intocht pin is Het Scheepvaartmuseum, the published 11:30
arrival on a route that is not one hall. `is_ai` is false for the intocht
and the Hague evening.
`dsc-europe-2026` links to the open-pass page, not the invite-only
executive summit. `ae-global-summit-2026` keeps the official single-day
and student prices in the summary (£15 student, £30 general, £45 student
three-day) and does not store one euro price. `kvk-ondernemersdagen-2026`
stores a free ticket (0 cents). `siai-2026`, `ai-coding-summit-nyc-2026`,
and `data-science-summit-warsaw-2026` are hybrid.
`ai-coding-summit-nyc-2026` is stored at Liberty Science Center,
Jersey City, NJ. On `20261021a`, `is_ai` is false only for the KVK
event and the Expatise tax day. The same migration writes a
Nominatim point for each venue only when latitude or longitude is still
null. `ukairs-2026` stores the
registration close from the official registration page
(`registration_deadline`, shown on the card). `ai-hpi-conference-2026`
stores the stated €290 ticket as 29000 cents. On `20261019a`, `is_ai` is
set on those five rows only. All five are stored as conferences. The enum has no
fair or expo value, so the IamExpat fair uses conference, and Slush is a
conference even though the summary says startup event. `is_ai` is a
separate column. The same migration writes a Nominatim
point for each venue only when latitude or longitude is still null.
`techex-amsterdam-hackathon-2026` keeps the start date 16 Oct 2026 and stores
no end date: the official page's JSON-LD ends 19 Oct and its copy says 20 Oct.
Held rows (The New Agentic Economy
Hackathon, AI & Big Data Expo Europe, Apply AI Summit) are not in the seed.
No attendance, RSVP, or image. A ticket price is stored only when the official page states one. Production applies unrecorded migrations during the Vercel
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
