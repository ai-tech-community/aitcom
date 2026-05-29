# Community event submission: cover-image upload + import-from-link

**Date:** 2026-05-29
**Status:** Approved — ready for implementation planning

## Problem

The community event submission form (added in PR #48) has two gaps:

1. **No image.** The form's schema has no image field, so neither members nor
   admins can attach a cover image when submitting/creating an event — even
   though the `Events` collection already has `coverImage`/`image` upload
   relations and the public pages render them.
2. **Tedious manual entry.** Most events members want to add already exist on
   Meetup, Eventbrite, or Luma. Re-typing title, date, location, and
   description by hand is slow and error-prone.

This spec adds cover-image upload and an "import from link" flow that pastes a
URL and auto-fills the form.

## Goals

- Members and admins can attach a cover image to an event from the submit/create form.
- A member can paste a Meetup / Eventbrite / Luma URL and have the form auto-fill
  (including the cover image), then review/edit before submitting.
- Imported events from members still go through the existing draft → approval
  flow. Import only pre-fills; it never auto-publishes.
- The "easier form" change is minimal and progressive: a paste-to-autofill bar
  at the top of the existing dialog; all fields stay visible and editable.

## Non-goals

- Per-provider API integrations (Luma API key, Eventbrite token, Meetup
  GraphQL). The importer is a single generic metadata scrape.
- Changing the approval workflow, roles, or who can submit.
- A multi-step wizard or hiding fields behind progressive disclosure.
- Backfilling images onto existing events.

## Existing infrastructure reused

- `POST /api/upload` — auth-gated, image-only, 2 MB cap; creates a Payload
  `media` doc. Currently returns `{ url }`.
- `Events` collection `coverImage` (and legacy `image`) — `type: "upload",
  relationTo: "media"`. Public pages render via `getImageUrl` (list,
  `src/app/[locale]/events/page.tsx`) and `getMedia` (detail,
  `src/app/[locale]/events/[slug]/page.tsx`), both reading `coverImage ?? image`.
- `src/lib/event-draft-import.ts` — prepared (currently unwired) normalized
  "discovered event" shape (`discoveredEventImportSchema`) including
  `coverImageUrl`, with the documented convention that media URLs are a sidecar
  requiring a separate media-ingestion step. The importer emits a form-friendly
  subset of this shape.
- `validateWebhookUrl` (`src/server/agent/validate-webhook-url`) — SSRF guard
  used for server-side URL fetches.
- The community-logo upload UI in `src/components/communities/manage/settings-form.tsx`
  is the pattern for the in-form image control (file input → `/api/upload` →
  preview + remove).

## Design

### Component A — cover-image upload

**Schema / server**
- Add `coverImage: z.number().optional()` (a `media` doc id) to
  `eventUpsertSchema` in `src/server/api/routers/events.ts`.
- `buildEventPayloadData` maps `coverImage: input.coverImage` onto the
  collection's existing `coverImage` upload relation.
- `submitEvent`, `createEvent`, `updateEvent`, and `resubmitEvent` all accept
  and persist the `coverImage` id. `submitEvent`'s curation-field strip does
  **not** strip `coverImage` (it is not a curation field).
- Extend `POST /api/upload` to return `{ url, id }` where `id = media.id`.
  Existing logo callers ignore the extra field (non-breaking).

**Form**
- Add a "Cover image" control to `event-form-dialog.tsx`, reusing the
  community-logo upload pattern: hidden file input → `POST /api/upload` →
  store the returned `{ id, url }`, show a preview thumbnail with a remove
  button. Visible to both members and admins.
- The form holds the cover as `{ coverImageId: number | null, coverImageUrl:
  string | null }`; on submit it sends `coverImage: coverImageId ?? undefined`.

### Component B — link importer

**Pure parser — `src/lib/event-link-import.ts`**
- `parseEventFromHtml(html: string, sourceUrl: string): ParsedEventImport`
- Strategy: parse all `<script type="application/ld+json">` blocks, find a
  schema.org `Event` (or array/`@graph` containing one); fall back to
  OpenGraph / `<meta>` tags when JSON-LD is absent or thin.
- Maps to a form-friendly subset of `discoveredEventImportSchema`:
  `title`, `summary`, `description`, `type` (default `meetup`; infer from
  `eventAttendanceMode`/keywords where possible), `date`, `startTime`,
  `endTime`, `location`, `city`, `country`, `format`
  (online/offline → `virtual`/`in_person`), `sourceUrl` (the pasted URL),
  `coverImageUrl` (JSON-LD `image` or `og:image`).
- Pure and synchronous — no network. All fields optional except best-effort
  `title`; returns whatever it can extract.

**tRPC procedure — `events.importEventFromUrl`** (protected)
- Input: `{ url: z.string().url() }`.
- Steps:
  1. Validate the URL is public http(s) via the SSRF guard; reject otherwise.
  2. Fetch the page HTML with a timeout, a max response-size cap, and a
     `text/html` content-type check.
  3. `parseEventFromHtml(html, url)`.
  4. If `coverImageUrl` is present: download it under the same SSRF guard +
     size cap + `image/*` content-type check, create a `media` doc, capture its
     `id`.
  5. Return the parsed fields plus `{ coverImageId, coverImageUrl }`.
- Creates **no** event — it only reads and pre-fills. (Image ingestion creates
  a `media` doc, same orphan-on-cancel behavior as a manual upload.)

### Component C — form wiring (paste-to-autofill banner)

- A link input + "Import" button at the top of the existing dialog.
- On Import: call `importEventFromUrl`; on success, merge non-empty returned
  fields into form state and set the cover preview from `coverImageId/Url`.
- All fields remain visible and editable. Submission uses the existing
  `submitEvent` (members) / `createEvent` (admins) path, so members' imports
  stay drafts requiring approval.

## Data flow (import)

```
paste URL → importEventFromUrl
  → validate (SSRF) → fetch HTML (timeout/size/type)
  → parseEventFromHtml
  → if coverImageUrl: download (SSRF/size/type) → media doc → coverImageId
  → return { ...fields, coverImageId, coverImageUrl }
→ prefill form state + cover preview
→ user edits → submitEvent / createEvent (stores coverImage id)
```

Both upload and import converge on the same form state: a `coverImage` media id
+ a preview URL.

## Error handling & security

- **Best-effort import:** unreachable URL, non-HTML response, or no parseable
  `Event` → toast "Couldn't read that link — please fill the form manually."
  Partial data fills what was found. Manual entry is never blocked.
- **SSRF:** both the page fetch and the cover-image download run through the
  URL guard; private/internal/loopback hosts are rejected.
- **Resource limits:** request timeout, max response size, and content-type
  enforcement on both fetches (`text/html` for the page, `image/*` + the
  existing 2 MB cap for the image).
- **Auth:** `importEventFromUrl` is a `protectedProcedure`; `/api/upload`
  already requires a session.

## Testing

- `parseEventFromHtml` unit tests with fixture HTML for Meetup, Eventbrite, and
  Luma: JSON-LD `Event` present, OG-only fallback, and missing/partial fields.
- `importEventFromUrl` with mocked fetch: success path, SSRF-blocked host,
  non-HTML response, and no-Event-data.
- Mapping test: a `coverImage` id round-trips through `buildEventPayloadData`
  onto the collection field.

## Open questions

None blocking. Provider-specific quirks (e.g. Meetup rendering details
client-side) will be handled best-effort by the OG fallback; if a source proves
too thin in practice, a per-host override can be added later without changing
this design.
