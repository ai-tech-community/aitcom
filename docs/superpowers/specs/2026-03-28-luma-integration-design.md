# Luma Integration Design

**Date:** 2026-03-28
**Status:** Draft
**Scope:** Read-only event sync from Luma calendars into community events

## Overview

Community admins can connect their Luma calendar to their community. Events from Luma are fetched on-demand and merged transparently into the existing community events list. Members see a unified event list with no distinction between native (Payload CMS) events and Luma events. Clicking "Register" on a Luma event links out to the lu.ma event page.

## Admin Configuration Flow

1. New **"Integrations"** tab in community settings (visible to owner/admin only)
2. Admin pastes their Luma API key
3. Backend validates the key via `GET /v1/user/get-self` (Luma API)
4. On success, backend fetches calendars via Luma's entity/calendar endpoints and presents a picker
5. Admin selects which calendar to sync
6. Admin optionally selects tag filters (only sync events with specific Luma tags)
7. Admin can enable/disable the integration at any time
8. Admin can disconnect (delete key + config) at any time

## Data Model

### New table: `community_luma_integrations`

```
id              varchar(255) PK  — UUID
communityId     varchar(255) FK → community.id (unique)
apiKeyEncrypted text NOT NULL    — AES-256-GCM encrypted Luma API key
calendarApiId   text NOT NULL    — Luma calendar API ID
calendarName    text             — display name for admin reference
tagFilters      jsonb            — array of Luma tag IDs to filter by (null = all events)
isEnabled       boolean          — default true
lastSyncCheck   timestamptz      — last time we fetched from Luma (for cache TTL)
createdAt       timestamptz
updatedAt       timestamptz
```

**Why encrypt the API key?** Luma API keys grant full account access. Storing them encrypted at rest protects against DB dump exposure. We use a server-side `LUMA_ENCRYPTION_KEY` env var for AES-256-GCM.

**Why one integration per community?** Keeps v1 simple. A community connects to one Luma calendar. Can extend to multiple later.

### No changes to existing tables

Luma events are not stored in the DB or Payload CMS. They're fetched at query time, normalized to a common shape, and merged with native events.

## API Design (tRPC procedures)

All procedures live in a new `lumaIntegrationRouter` added to the community settings scope.

### `luma.connect`
**Input:** `{ communitySlug, apiKey }`
**Auth:** admin/owner of community
**Behavior:**
1. Validate API key via `GET https://public-api.luma.com/v1/user/get-self` with header `x-luma-api-key`
2. If invalid → throw BAD_REQUEST
3. Encrypt API key with AES-256-GCM and upsert into `community_luma_integrations` with `isEnabled: false` and a placeholder `calendarApiId: ""` (integration becomes active only after `selectCalendar`)
4. Fetch user's calendars (via Luma calendar endpoints)
5. Return list of calendars for the admin to pick from

### `luma.selectCalendar`
**Input:** `{ communitySlug, calendarApiId, calendarName, tagFilters? }`
**Auth:** admin/owner
**Behavior:**
1. Upsert `community_luma_integrations` row with selected calendar + tags
2. Return success

### `luma.getConfig`
**Input:** `{ communitySlug }`
**Auth:** admin/owner
**Returns:** Integration config (calendar name, tag filters, enabled status, last sync) or null

### `luma.updateConfig`
**Input:** `{ communitySlug, tagFilters?, isEnabled? }`
**Auth:** admin/owner
**Behavior:** Update the integration row

### `luma.disconnect`
**Input:** `{ communitySlug }`
**Auth:** admin/owner
**Behavior:** Delete the integration row (removes encrypted key)

### `luma.testConnection`
**Input:** `{ communitySlug }`
**Auth:** admin/owner
**Behavior:** Decrypt key, call Luma API, return ok/error status

## Event Fetching & Merging

### Modified procedure: `events.getCommunityEvents`

The existing `getCommunityEvents` procedure is extended to:

1. Fetch native events from Payload CMS (existing behavior)
2. Check if community has an active Luma integration
3. If yes, fetch Luma events via `GET /v1/calendar/list-events` with the stored calendar ID
   - Apply tag filters if configured
   - Filter to future events + recent past events (last 7 days)
4. Normalize Luma events to a common shape matching the existing event type
5. Merge both lists, sorted by date ascending
6. Return unified list with a `source` field (`"native" | "luma"`)

### Normalized event shape

Luma events are mapped to match the existing Payload CMS event shape:

| Payload field | Luma source |
|---|---|
| `id` | `"luma-" + event.api_id` (string prefix to avoid collision) |
| `title` | `event.name` |
| `slug` | `null` (not routable internally) |
| `description` | `event.description_md` (markdown string) |
| `type` | `"meetup"` (default; Luma has no equivalent field) |
| `date` | `event.start_at` |
| `startTime` | Extracted from `event.start_at` |
| `endTime` | Extracted from `event.end_at` |
| `location` | `event.geo_address_json.address` or `"Online"` if `meeting_url` present |
| `maxAttendees` | `event.max_capacity` |
| `image` | `event.cover_url` (direct URL to Luma CDN) |
| `status` | `"published"` (we only fetch non-cancelled events) |
| `communityId` | Current community ID |
| `source` | `"luma"` |
| `lumaUrl` | `"https://lu.ma/" + event.url` (for register link-out) |
| `lumaApiId` | `event.api_id` |

### Caching strategy

- Server-side in-memory cache with **5 minute TTL** per community
- Cache key: `luma-events:{communityId}`
- On cache miss: fetch from Luma API, store result, update `lastSyncCheck`
- No background jobs or cron needed for v1
- Admin "Test Connection" also refreshes the cache

### Rate limit safety

Luma allows 500 GET requests per 5 minutes per calendar. With a 5-min cache, each community makes at most 1 request per 5 minutes regardless of traffic.

## Frontend Changes

### Settings sidebar

Add `"integrations"` nav item in [settings-sidebar.tsx](src/components/communities/settings/settings-sidebar.tsx), visible to admin/owner roles (same visibility as existing admin-only items).

### New settings page: `/communities/[slug]/settings/integrations`

**States:**

1. **Not connected** — Shows explanation + "Connect Luma" button → opens modal with API key input
2. **Connected, selecting calendar** — Shows calendar picker (radio list) + optional tag multi-select
3. **Connected, active** — Shows connected calendar name, tag filters, enable/disable toggle, "Test Connection" button, "Disconnect" button
4. **Connection error** — Shows error message + "Retry" / "Disconnect" options

### Community events page modifications

In [events/page.tsx](src/app/[locale]/communities/[slug]/events/page.tsx):

- Events with `source === "luma"` get a small "External" or "Luma" badge (subtle, not prominent)
- Clicking a Luma event opens the Luma URL in a new tab instead of internal routing
- Edit/cancel buttons are hidden for Luma events (not manageable from our side)
- Cover images from Luma CDN are rendered the same as native event images

### Type labels extension

The existing `typeLabels` map stays as-is. Luma events default to `"meetup"` type so they render with the MEETUP label. No new types needed.

## Security

- **API key encryption:** AES-256-GCM with a server-side env var (`LUMA_ENCRYPTION_KEY`). Key is decrypted only when making API calls, never returned to the client.
- **Admin-only access:** All integration procedures require admin/owner role on the community.
- **Key display:** Frontend shows only "Connected" status + calendar name, never the API key itself.
- **Disconnect clears everything:** Deleting the integration row removes the encrypted key from the DB.

## Environment Variables

| Variable | Purpose |
|---|---|
| `LUMA_ENCRYPTION_KEY` | 32-byte hex string for AES-256-GCM encryption of Luma API keys |

## Out of Scope (v1)

- **Two-way sync** (creating Luma events from our platform)
- **RSVP sync** (tracking which community members registered on Luma)
- **Webhook-based real-time updates** (polling with cache is sufficient for v1)
- **Multiple calendars per community**
- **Luma membership tier sync**
- **Guest list display** for Luma events

## Future Extensions (v2+)

- Webhook listener for `guest.registered` to show real-time attendee counts
- Create events on Luma from the community admin dashboard
- Bi-directional member sync via `POST /v1/calendar/import-people`
- Multiple calendar support per community
