# Collector presets and the collector workspace — design

**Date:** 2026-10-04
**Status:** accepted — Slice A planned in docs/superpowers/plans/2026-10-04-collector-presets-workspace.md
**Builds on:** `2026-10-03-data-collectors-design.md` (engine, page-list), ADR-0040, ADR-0041

## Problem

A member who wants the open roles of a startup, or the Hacker News front page,
today has to pick the "List on a web page" collector and write CSS selectors.
Most members can't, and some well-known sites (Ashby and Workable job boards)
build their list in the browser, so no selector can read them. The real-world
check of 2026-10 found 6 of 33 startup careers pages in that group.

The collector screens also waste space: they sit beside the dashboard side
panel, and each page stacks a breadcrumb and a section kicker over a title the
member already knows.

## Goal

1. **Known sites are one step.** The member picks a known site (or pastes a
   link we recognise) and fills in only what is specific to them, such as a
   board name. Custom selectors stay available for any other page.
2. **Sites that publish clean data are read from that data,** not from their
   HTML, so JavaScript-built boards work.
3. **The collector pages use the full width,** with one persistent left rail
   instead of breadcrumbs and repeated titles.

What makes this ours: presets are reviewed code, not a public marketplace of
member scripts; every preset runs through the same guarded context
(robots.txt, per-site limit, budgets, https-only public addresses) as every
other collector.

## Non-goals

- Member-authored or member-shared presets (a later marketplace slice).
- JavaScript rendering of pages.
- Logged-in or token-gated sources.
- Changing the engine, quota, run storage, export or retention.

## Concepts

### Preset (Prototype)

A preset is a named, ready-made start for one collector: a prototype input
the member copies and adjusts (refactoring.guru *Prototype*).

```ts
// src/server/collectors/presets/preset.ts
import type { PresetGroup } from "@/lib/collectors/presets"; // "jobs" | "research" | "custom"

export interface CollectorPreset<I> {
  id: string;                       // url slug, e.g. "greenhouse-board"
  group: PresetGroup;
  title: LocalizedText;
  summary: LocalizedText;           // one sentence: what it reads
  collectorId: string;              // must exist in the collector catalog
  /** The full input, minus the fields the member must give. */
  base: Partial<I>;
  /** Input fields shown up front; everything else sits behind "Show settings". */
  ask: readonly (keyof I & string)[];
  /** Field hints that replace the collector's own for this preset. */
  hints?: Partial<Record<keyof I & string, FieldHint>>;
  /** Recognise a pasted address; return the input to pre-fill, or null. */
  recognize?: (url: URL) => Partial<I> | null;
}
```

- `recognize` is an optional function property, not a method, so passing it
  around unbound is safe (the unbound-method lint).
- A preset's hint replaces the collector's hint for that field as a whole;
  fields keep the collector's order, and a hint for a field the collector
  does not hint comes last.
- What screens share with the server (`PRESET_GROUPS` / `PresetGroup`,
  `CUSTOM_PAGE_PRESET_ID`, the former start ids) lives in
  `src/lib/collectors/presets.ts`, an import-free module, so client code never
  imports from `src/server/`.

- Presets live in `src/server/collectors/presets/catalog.ts` as typed data in
  code, like the collector catalog (ADR-0040) and the badge catalog
  (ADR-0039). Each entry is built with `definePreset(collector, …)`, which
  types `base`, `ask` and `hints` by that collector's input and sets
  `collectorId`. Adding a preset = one entry; adding a site with a data feed =
  one adapter (below) plus one entry.
- **Every start from the web goes through a preset.** Today's collectors
  become presets: `feed` (feed-items, asks `url`, group `research`) and
  `custom-page` (page-list, asks everything, group `custom`). There is no
  second path into the start form.
- The facade (`CollectorRuns.startRun` in `src/server/collectors/runs.ts`)
  starts a run either by preset (the web) or by collector id (the agent,
  ADR-0040; the run's `preset_id` stays null). A preset whose collector is
  switched off (`COLLECTORS_DISABLED`) is hidden and cannot start. Every
  facade dependency comes through a port: the collector catalog port has
  `all()` / `get()` (what may start now) and `everything()` (the full
  catalog, switched-off collectors included, for naming and exporting
  existing runs).
- The server does not merge `base` into the input. The start form pre-fills
  `base` (and any pasted values); the server validates exactly what is sent
  with the collector's `inputSchema`.
- A test checks every preset: its `collectorId` exists; `base` merged with a
  sample of the `ask` fields parses with the collector's `inputSchema`;
  page-list presets' selectors pass the selector allowlist.

### Recognising a pasted link

`recognizePreset(url, presets)` (`src/server/collectors/presets/recognize.ts`)
asks each available preset's `recognize` in catalog order and returns the
first match as `{ presetId, input, matched }`:

- A match → `matched: true`.
- No match → `custom-page` with `url` filled in and `matched: false` (the
  start page then shows no "Recognised as" line).
- `null` only when the Custom page itself is unavailable (its collector is
  switched off by `COLLECTORS_DISABLED`). The paste box then says "We can't
  collect from this address right now."
- A recognizer that throws counts as no match (logged); the scan goes on.
  Each recognizer gets its own copy of the URL.

Recognition never fetches: it is a pure function of the address, so pasting
a link sends no request to that site. Pasted text is read as an address by
`parseAddress` (`src/lib/collectors/address.ts`), in the browser and again on
the server: text without a scheme is read as `https://`; only http(s), a
host with a dot, no user name or password, at most 2,048 characters (checked
again after the scheme is added). `parseAddress` is a shape check only, not a
network-safety gate: IP literals and `localhost.` pass it. That is safe
because recognition never fetches and every fetch of a run goes through the
collector context, which is the guard.

Recognition is served by a tRPC query (`collectors.recognize`) so the matcher
code stays on the server with the catalog. It answers
`{ ok: true, presetId, matched, prefill }` or
`{ ok: false, reason: "not_an_address" | "no_preset" }`. The prefill travels
to the start page as query parameters named after the input fields, plus
`recognised=1` when `matched` is true (`startHref` / `readStartQuery` in
`src/lib/collectors/start-address.ts`, the one place that encodes it). No
collector input may be named `recognised` (a catalog test checks this). The
member always sees which preset was chosen and can pick another.

## New collectors

### Job board (`job-board`)

Every open role of one company from a hosted job board's public data.

- Input: `{ board: "greenhouse" | "lever" | "ashby" | "workable" | "personio", name: string }`
  (`name` = the board's account token, `^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$`).
- Rows: `{ title, location, department, url, postedAt }` (nullable where a
  board lacks the field).
- Inside, one adapter per board (Strategy):
  `{ feedUrl(name), parse(payload) }`. Greenhouse, Lever, Ashby and Workable
  reuse the existing `*BoardUrl` builders, `parse*Jobs` readers and
  `detectJobBoardFromUrl`. These pure functions move from
  `src/lib/investigations/startup-job-boards.ts` to a new shared module
  `src/lib/job-boards/` that both the startup jobs scan and the collector
  import; neither depends on the other. Personio is new: its public XML feed
  (`https://{name}.jobs.personio.de/xml`), parsed with the existing feed/XML
  helper.
- All requests go through `ctx.fetch`. A 404 from the board ends the run with
  a new failure code `board_not_found` ("We couldn't find a job board with
  this name. Check the part after <board host>/.").
- Presets: one per board (`greenhouse-board`, `lever-board`, `ashby-board`,
  `workable-board`, `personio-board`), each asking only `name`, each with a
  `recognize` built on the existing `detectJobBoardFromUrl` (plus Personio's
  `{name}.jobs.personio.de` / `.com`).

### Hacker News (`hacker-news`)

- Input: `{ list: "top" | "new" | "ask" | "show", limit: 1–500, default 30 }`.
- Reads the official public API (`hacker-news.firebaseio.com/v0/{list}stories.json`,
  then each item) through `ctx.fetch`, so robots.txt and the per-site limit
  apply; the item count is bounded by `limit` and the collector's limits.
- Rows: `{ title, url, points, comments, author, postedAt, hnUrl }`.
- Preset `hacker-news` asks `list`; `recognize` matches `news.ycombinator.com`
  paths (`/`, `/newest`, `/ask`, `/show`).

### page-list presets

Saved page-list inputs for known sites without a data feed. A site
qualifies when its list is in the HTML as sent, its robots.txt allows the
path, and its markup is stable across two checks a week apart. Slice C
starts with the candidates that pass this check (to be measured, not
assumed); each ships with a saved copy of a real page under
`src/server/collectors/presets/fixtures/` and a test that its selectors
return the expected rows from that copy. Selector rot shows up to members as
a 0-row run (with the existing "builds its list in the browser" note) and is
fixed by editing one entry.

### Event listings (`page-events`) — Slice D

Upcoming events of one organizer or calendar on Luma, Eventbrite, Meetup
and similar sites.

- These sites' member-facing calendars are JavaScript-heavy, and their APIs
  need the organizer's own key (our existing `src/server/luma/client.ts`
  reads only calendars we own). What their public event pages commonly
  publish is schema.org `Event` structured data (JSON-LD). One collector
  reads that: fetch the page through `ctx.fetch`, take every `Event` (also
  inside `ItemList` / `@graph`), and yield
  `{ name, startsAt, endsAt, url, venue, city, online, organizer }`.
- JSON-LD is read inside the extraction sandbox (ADR-0041), as a new
  extraction kind, so no page content is parsed in the collector's process.
- Presets per site (`luma-calendar`, `eventbrite-organizer`,
  `meetup-group`), each asking for the calendar / organizer / group address
  and with a `recognize` for its host. A generic `event-page` preset covers
  any other site that publishes `Event` data.
- **Measured before building, not assumed:** the slice starts with a check of
  real public pages per site — does the HTML as sent contain `Event`
  JSON-LD, and does robots.txt allow the path. A site that fails is left out
  of the presets and listed in the spec with the reason.
- Group "Events" joins "Jobs" and "Research" in the rail.

## Screens

Full width, no side panel, no breadcrumbs, no section kickers on collector
pages. The dashboard greeting and tabs stay.

### Layout seam

The member dashboard layout (`src/app/[locale]/dashboard/(member)/layout.tsx`)
renders greeting, tabs, then content beside the side panel. The frame
(greeting + tabs) is extracted into a `MemberDashboardFrame` component; the
collector routes move to a sibling route group `(member-wide)` whose layout
uses the frame without the side panel. Other tabs are unchanged. DESIGN.md's
"Page frame" section gains this as a named exception.

### Collector workspace

`src/components/collectors/collector-workspace.tsx`: a two-column layout used
by every collector page (start, My runs, one run).

- **Left rail** (16rem): the paste box; presets grouped "Jobs",
  "Research" (empty groups left out); "Custom page" last, without a group
  label; a "My runs" link. The active entry is marked (`aria-current`); a run
  page marks "My runs" active. "My runs" is a fixed route, so it stays
  reachable while the preset list is loading or has failed. On narrow screens
  (below `lg`) the list folds into a compact picker above the content. From
  `lg` the rail is sticky and scrolls on its own when taller than the
  viewport (the member side panel's pattern), so its footer stays reachable
  as presets grow.
- **Rail footer**: the usage line ("{used} of {limit} runs used · last 24
  hours") and the "How our collector visits sites" link.
- **Right side**: the page's content with one heading (one `h2`).
- The workspace is mounted once by `collectors/layout.tsx`, so the rail keeps
  its state while the member moves between pages.

### Start page `/dashboard/collectors/new/[presetId]`

- Heading = preset title; one sentence = preset summary.
- Only the `ask` fields, rendered by the existing schema-driven field
  renderers with the preset's hints.
- "Show settings" reveals the rest of the input pre-filled from `base`;
  editing them is allowed (the member's input is still validated by the
  collector's schema and the selector allowlist).
- The limits line and the one orange Start button, as today.
- The form starts afresh for every new preset and every new paste: it is
  keyed by preset + start query, so typed values and old problems do not
  carry over. The same start handed in again (a server refresh) keeps what
  the member typed.
- After a refused start, focus moves to the first refused field (its refused
  input, else its first input); "Show settings" opens by itself when that
  field is inside it. With no refused field, focus moves to the problem
  message itself: it is then a labelled group, not a live alert, so it is
  read once (on focus), and it shows the DESIGN.md focus ring. When a field
  takes focus, the message stays a live alert and is not focusable.
- An unknown or unavailable preset id shows "This kind of collection isn't
  available. Pick one from the list."
- Former start addresses named a collector (`/new/feed-items`,
  `/new/page-list`). They redirect permanently, query kept, to the preset
  that replaced them (`feed`, `custom-page`). The same frozen map
  (`src/lib/collectors/presets.ts`) names runs from before presets. New
  presets never need an entry.
- `/dashboard/collectors` shows the workspace with no preset selected: the
  right side has the line "Pick a site from the list, or paste a link." (its
  one heading) and the member's last 5 runs (none → only the line; the runs
  appear only once loaded, with no skeleton flash). The
  paste box does not take focus by itself, so screen-reader users still meet
  the greeting and tabs first (WCAG 2.2 AA).

### Paste flow

Paste or type an address in the rail's box → `collectors.recognize` →
navigate to the matched preset with its fields pre-filled, and a single line
under the heading: "Recognised as {name} ({detail})." followed by the link
"Not right? Pick another.", e.g. "Recognised as Greenhouse board (acme)."
The line is one translated message; the detail (the preset's main input,
often an address) is set in mono. With no detail it reads "Recognised as
{name}.". No match → `custom-page` with the address filled in and no
"Recognised as" line. Text that is not an address never leaves the browser
and gets an inline message.

### My runs and run page

Inside the workspace; breadcrumbs and kicker titles removed; one `h2` each.
My runs' heading is "My runs"; a run's heading is its name, "<preset title> ·
<main input>" (e.g. "Greenhouse board · acme"; the main input is the
preset's first `ask` field). Runs record their `presetId` (null for runs
started before this change and for agent starts) so every screen names a run
by its preset. A run from before presets is named through the frozen
former-start map. The overview also returns `titles`: every preset and
collector title, switched-off ones included, so a run's name never falls
back to a raw id. The names come from the overview query, which may load
after the runs: until it has loaded, the run page, My runs and the landing
keep their loading state and show no name. If it fails, a run is named with
the neutral label "Collection" ("Verzameling") plus its first address, never
its collector id.

## Data

- `collector_run.preset_id varchar(64) null` (like `collector_id`) — one migration
  (`src/migrations/20261004a_collector_run_preset.ts`, Payload migration per
  repo practice). The engine ignores it; screens read it.
- No preset table: presets are code.

## Errors (member copy, EN + NL)

| Case | Outcome |
|---|---|
| Board name not found (404) | failed, `board_not_found`, names the board host |
| Pasted address not recognised | not an error: opens Custom page, address filled, no "Recognised as" line |
| Pasted address, Custom page unavailable (`COLLECTORS_DISABLED`) | inline message "We can't collect from this address right now.", no navigation |
| Pasted text is not an address | inline field message, no navigation, no request |
| Unknown or unavailable preset id | "This kind of collection isn't available. Pick one from the list." |
| robots.txt, rate limit, budgets | existing codes and copy |
| Preset input fails the schema after "Show settings" edits | existing per-field messages |

## Testing

- Adapters: each parses a saved real answer of its board (fixtures), and
  handles empty boards and 404.
- Matchers: table tests of addresses → preset + input, including near misses
  (`greenhouse.io` marketing pages, `news.ycombinator.com/item?id=`).
- Catalog invariants (above).
- Components: rail (active state, narrow screens), paste flow (match,
  no match, invalid), "Show settings", headings (no breadcrumbs); the former
  start address redirect (query kept); the start form keyed per preset and
  per paste (a new paste starts afresh, the same start keeps typed values);
  focus after a refused start (first refused field, opening "Show settings",
  else the problem message); run names while the overview loads and after
  it fails.
- Real-world check after Slice B: the 33-startup sample through the real
  engine on the local test database, as in the page-list check; the
  JavaScript-built boards are expected to work through `job-board`.

## Slices

| Slice | Content | Ships |
|---|---|---|
| A | Preset model + catalog with `feed` and `custom-page`; layout seam; workspace rail; full-width pages without breadcrumbs/kickers; paste box (recognition returns Custom page only); former start addresses redirect; runs named by preset; `preset_id` migration | screens only, flag-gated as today |
| B | `job-board` collector, 5 adapters (Personio new), `board_not_found`, 5 presets with recognizers, real-world check | |
| C | `hacker-news` collector + preset; first page-list presets with fixtures | |
| D | `page-events` collector (schema.org `Event` from the page, read in the sandbox); "Events" group; Luma, Eventbrite, Meetup and generic presets for the sites that pass the check | |

## Patterns (refactoring.guru)

- **Prototype** — presets are ready inputs copied and adjusted.
- **Strategy** — collectors (existing) and job-board adapters.
- **Protection Proxy** — unchanged: every request through `CollectorContext`.
- Rejected: **Abstract Factory** per site (one factory per site adds a class
  where a data entry is enough); a **Chain of Responsibility** object for
  recognition (an ordered list scan is the same behaviour with less code);
  presets in the database (no member authoring yet; code review is the
  safety gate).
