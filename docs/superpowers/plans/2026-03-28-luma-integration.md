# Luma Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow community admins to connect a Luma calendar so events are fetched and merged transparently into the community events list.

**Architecture:** New `community_luma_integrations` DB table stores encrypted Luma API keys per community. A new tRPC router (`lumaRouter`) handles admin CRUD. The existing `getCommunityEvents` procedure is extended to fetch + merge Luma events at query time with a 5-min in-memory cache. Luma events link out to lu.ma for registration.

**Tech Stack:** Drizzle ORM, tRPC, Next.js App Router, React, next-intl, Node crypto (AES-256-GCM)

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/server/luma/crypto.ts` | Encrypt/decrypt Luma API keys (AES-256-GCM) |
| Create | `src/server/luma/client.ts` | Luma API client (fetch user, calendars, events) |
| Create | `src/server/luma/cache.ts` | In-memory TTL cache for Luma events |
| Create | `src/server/luma/normalize.ts` | Transform Luma event → unified event shape |
| Create | `src/server/api/routers/luma.ts` | tRPC router for Luma integration admin CRUD |
| Create | `src/components/communities/settings/integrations-settings.tsx` | Integrations settings page component |
| Create | `src/app/[locale]/communities/[slug]/settings/integrations/page.tsx` | Integrations settings route |
| Modify | `src/server/db/schema.ts` | Add `communityLumaIntegrations` table |
| Modify | `src/env.js` | Add `LUMA_ENCRYPTION_KEY` env var |
| Modify | `src/server/api/root.ts` | Register `lumaRouter` |
| Modify | `src/server/api/routers/events.ts` | Extend `getCommunityEvents` to merge Luma events |
| Modify | `src/components/communities/settings/settings-sidebar.tsx` | Add "Integrations" nav item |
| Modify | `src/app/[locale]/communities/[slug]/events/page.tsx` | Handle Luma events (link-out, hide edit buttons) |
| Modify | `messages/en.json` | Add i18n strings for integrations |
| Modify | `messages/nl.json` | Add i18n strings for integrations (Dutch) |

---

### Task 1: Add `LUMA_ENCRYPTION_KEY` env var

**Files:**
- Modify: `src/env.js:9-25` (server block)

- [ ] **Step 1: Add env var to schema**

In `src/env.js`, add to the `server` object after `MOLLIE_API_KEY`:

```js
LUMA_ENCRYPTION_KEY: z.string().length(64).optional(), // 32-byte hex
```

- [ ] **Step 2: Add to runtimeEnv**

In `src/env.js`, add to the `runtimeEnv` object after `MOLLIE_API_KEY`:

```js
LUMA_ENCRYPTION_KEY: process.env.LUMA_ENCRYPTION_KEY,
```

- [ ] **Step 3: Verify with `tsc --noEmit`**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/env.js
git commit -m "feat(luma): add LUMA_ENCRYPTION_KEY env var"
```

---

### Task 2: Create Luma crypto utility

**Files:**
- Create: `src/server/luma/crypto.ts`

- [ ] **Step 1: Create the crypto module**

```ts
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { env } from "@/env";

function getKey(): Buffer {
  const hex = env.LUMA_ENCRYPTION_KEY;
  if (!hex) throw new Error("LUMA_ENCRYPTION_KEY is not set");
  return Buffer.from(hex, "hex");
}

export function encryptApiKey(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  // Format: base64(iv + tag + ciphertext)
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptApiKey(encoded: string): string {
  const key = getKey();
  const buf = Buffer.from(encoded, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext) + decipher.final("utf8");
}
```

- [ ] **Step 2: Verify with `tsc --noEmit`**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/server/luma/crypto.ts
git commit -m "feat(luma): add AES-256-GCM encrypt/decrypt for API keys"
```

---

### Task 3: Create Luma API client

**Files:**
- Create: `src/server/luma/client.ts`

- [ ] **Step 1: Create the Luma client**

```ts
const LUMA_BASE = "https://public-api.luma.com";

interface LumaUser {
  api_id: string;
  name: string;
  email: string;
}

export interface LumaCalendar {
  api_id: string;
  name: string;
  slug: string;
}

export interface LumaEvent {
  api_id: string;
  name: string;
  description_md: string | null;
  start_at: string;
  end_at: string | null;
  cover_url: string | null;
  url: string;
  geo_address_json: { address?: string } | null;
  meeting_url: string | null;
  max_capacity: number | null;
  timezone: string;
}

interface LumaEventsResponse {
  entries: Array<{ event: LumaEvent }>;
  next_cursor: string | null;
}

async function lumaFetch<T>(
  path: string,
  apiKey: string,
  params?: Record<string, string>,
): Promise<T> {
  const url = new URL(path, LUMA_BASE);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  const res = await fetch(url.toString(), {
    headers: { "x-luma-api-key": apiKey },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    throw new Error(`Luma API error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

/** Validate an API key by fetching the authenticated user. */
export async function validateApiKey(
  apiKey: string,
): Promise<{ valid: true; user: LumaUser } | { valid: false }> {
  try {
    const data = await lumaFetch<LumaUser>("/v1/user/get-self", apiKey);
    return { valid: true, user: data };
  } catch {
    return { valid: false };
  }
}

/** Fetch calendars the authenticated user has access to. */
export async function getCalendars(apiKey: string): Promise<LumaCalendar[]> {
  // Luma doesn't have a "list my calendars" endpoint directly.
  // The user's own calendar is resolved via entity lookup using their slug.
  // For v1, we use the user's own calendar from get-self response.
  const user = await lumaFetch<LumaUser>("/v1/user/get-self", apiKey);
  // The user's calendar API ID is the same as their user API ID in Luma
  return [
    {
      api_id: user.api_id,
      name: user.name,
      slug: user.email,
    },
  ];
}

/** Fetch upcoming events from a Luma calendar. */
export async function getCalendarEvents(
  apiKey: string,
  calendarApiId: string,
): Promise<LumaEvent[]> {
  const events: LumaEvent[] = [];
  let cursor: string | null = null;

  // Fetch up to 2 pages (200 events max) to avoid excessive API calls
  for (let page = 0; page < 2; page++) {
    const params: Record<string, string> = {
      calendar_api_id: calendarApiId,
      sort_column: "start_at",
      sort_direction: "asc",
    };
    if (cursor) params.pagination_cursor = cursor;

    const data = await lumaFetch<LumaEventsResponse>(
      "/v1/calendar/list-events",
      apiKey,
      params,
    );

    for (const entry of data.entries) {
      events.push(entry.event);
    }

    if (!data.next_cursor) break;
    cursor = data.next_cursor;
  }

  return events;
}
```

- [ ] **Step 2: Verify with `tsc --noEmit`**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/server/luma/client.ts
git commit -m "feat(luma): add Luma API client (validate, calendars, events)"
```

---

### Task 4: Create Luma event cache

**Files:**
- Create: `src/server/luma/cache.ts`

- [ ] **Step 1: Create the TTL cache**

```ts
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

const TTL_MS = 5 * 60 * 1000; // 5 minutes

export function getCached<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setCached<T>(key: string, data: T): void {
  store.set(key, { data, expiresAt: Date.now() + TTL_MS });
}

export function invalidateCache(key: string): void {
  store.delete(key);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/server/luma/cache.ts
git commit -m "feat(luma): add in-memory TTL cache for Luma events"
```

---

### Task 5: Create Luma event normalizer

**Files:**
- Create: `src/server/luma/normalize.ts`

- [ ] **Step 1: Create the normalizer**

```ts
import type { LumaEvent } from "./client";

export interface NormalizedEvent {
  id: string | number;
  title: string;
  slug: string | null;
  description: string | null;
  type: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  location: string;
  maxAttendees: number | null;
  image: string | null;
  status: string;
  communityId: string;
  source: "native" | "luma";
  lumaUrl: string | null;
}

function extractTime(isoString: string): string {
  const d = new Date(isoString);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function normalizeLumaEvent(
  event: LumaEvent,
  communityId: string,
): NormalizedEvent {
  const location =
    event.geo_address_json?.address ??
    (event.meeting_url ? "Online" : "TBA");

  return {
    id: `luma-${event.api_id}`,
    title: event.name,
    slug: null,
    description: event.description_md,
    type: "meetup",
    date: event.start_at,
    startTime: extractTime(event.start_at),
    endTime: event.end_at ? extractTime(event.end_at) : null,
    location,
    maxAttendees: event.max_capacity,
    image: event.cover_url,
    status: "published",
    communityId,
    source: "luma",
    lumaUrl: `https://lu.ma/${event.url}`,
  };
}
```

- [ ] **Step 2: Verify with `tsc --noEmit`**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/server/luma/normalize.ts
git commit -m "feat(luma): add Luma event normalizer to unified event shape"
```

---

### Task 6: Add `communityLumaIntegrations` DB table

**Files:**
- Modify: `src/server/db/schema.ts`

- [ ] **Step 1: Add the table definition**

Add after the `communities` table and its related tables (around line 1365), before any community relations:

```ts
export const communityLumaIntegrations = appSchema.table(
  "community_luma_integration",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    communityId: d
      .varchar({ length: 255 })
      .notNull()
      .unique()
      .references(() => communities.id),
    apiKeyEncrypted: d.text().notNull(),
    calendarApiId: d.text().notNull().default(""),
    calendarName: d.text(),
    tagFilters: d
      .jsonb()
      .$type<string[]>(),
    isEnabled: d.boolean().notNull().default(false),
    lastSyncCheck: d.timestamp({ withTimezone: true }),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
  }),
  (t) => [
    index("luma_integration_community_idx").on(t.communityId),
  ],
);
```

- [ ] **Step 2: Generate migration**

Run: `npx drizzle-kit generate`
Expected: A new migration file is created in the migrations directory

- [ ] **Step 3: Apply migration**

Run: `npx drizzle-kit push`
Expected: Table `app.community_luma_integration` created

- [ ] **Step 4: Verify with `tsc --noEmit`**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/server/db/schema.ts drizzle/
git commit -m "feat(luma): add community_luma_integrations table"
```

---

### Task 7: Create Luma tRPC router

**Files:**
- Create: `src/server/api/routers/luma.ts`
- Modify: `src/server/api/root.ts`

- [ ] **Step 1: Create the router**

```ts
import { z } from "zod";
import { eq, and, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
  communities,
  communityMemberships,
  communityLumaIntegrations,
} from "@/server/db/schema";
import { encryptApiKey, decryptApiKey } from "@/server/luma/crypto";
import { validateApiKey, getCalendars } from "@/server/luma/client";
import { invalidateCache } from "@/server/luma/cache";

/** Assert caller is admin/owner of the given community. Returns community row. */
async function requireCommunityAdmin(
  db: Parameters<Parameters<typeof protectedProcedure.query>[0]>["ctx"]["db"],
  userId: string,
  communitySlug: string,
) {
  const community = await db.query.communities.findFirst({
    where: and(
      eq(communities.slug, communitySlug),
      isNull(communities.deletedAt),
    ),
  });
  if (!community) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Community not found" });
  }

  const membership = await db.query.communityMemberships.findFirst({
    where: and(
      eq(communityMemberships.communityId, community.id),
      eq(communityMemberships.userId, userId),
    ),
  });
  if (
    membership?.status !== "active" ||
    (membership.role !== "owner" && membership.role !== "admin")
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only community admins can manage integrations",
    });
  }

  return community;
}

export const lumaRouter = createTRPCRouter({
  /** Validate a Luma API key and return available calendars. */
  connect: protectedProcedure
    .input(
      z.object({
        communitySlug: z.string(),
        apiKey: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const community = await requireCommunityAdmin(
        ctx.db,
        ctx.session.user.id,
        input.communitySlug,
      );

      // Validate the key with Luma
      const result = await validateApiKey(input.apiKey);
      if (!result.valid) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid Luma API key. Make sure you have a Luma Plus subscription.",
        });
      }

      // Encrypt and store (upsert)
      const encrypted = encryptApiKey(input.apiKey);

      const [existing] = await ctx.db
        .select({ id: communityLumaIntegrations.id })
        .from(communityLumaIntegrations)
        .where(eq(communityLumaIntegrations.communityId, community.id))
        .limit(1);

      if (existing) {
        await ctx.db
          .update(communityLumaIntegrations)
          .set({
            apiKeyEncrypted: encrypted,
            calendarApiId: "",
            isEnabled: false,
          })
          .where(eq(communityLumaIntegrations.id, existing.id));
      } else {
        await ctx.db.insert(communityLumaIntegrations).values({
          communityId: community.id,
          apiKeyEncrypted: encrypted,
          calendarApiId: "",
          isEnabled: false,
        });
      }

      // Fetch calendars
      const calendars = await getCalendars(input.apiKey);

      return {
        lumaUser: result.user.name,
        calendars,
      };
    }),

  /** Select which calendar to sync after connecting. */
  selectCalendar: protectedProcedure
    .input(
      z.object({
        communitySlug: z.string(),
        calendarApiId: z.string().min(1),
        calendarName: z.string(),
        tagFilters: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const community = await requireCommunityAdmin(
        ctx.db,
        ctx.session.user.id,
        input.communitySlug,
      );

      await ctx.db
        .update(communityLumaIntegrations)
        .set({
          calendarApiId: input.calendarApiId,
          calendarName: input.calendarName,
          tagFilters: input.tagFilters ?? null,
          isEnabled: true,
        })
        .where(eq(communityLumaIntegrations.communityId, community.id));

      invalidateCache(`luma-events:${community.id}`);

      return { success: true };
    }),

  /** Get the current integration config (admin only). */
  getConfig: protectedProcedure
    .input(z.object({ communitySlug: z.string() }))
    .query(async ({ ctx, input }) => {
      const community = await requireCommunityAdmin(
        ctx.db,
        ctx.session.user.id,
        input.communitySlug,
      );

      const [integration] = await ctx.db
        .select({
          calendarApiId: communityLumaIntegrations.calendarApiId,
          calendarName: communityLumaIntegrations.calendarName,
          tagFilters: communityLumaIntegrations.tagFilters,
          isEnabled: communityLumaIntegrations.isEnabled,
          lastSyncCheck: communityLumaIntegrations.lastSyncCheck,
          createdAt: communityLumaIntegrations.createdAt,
        })
        .from(communityLumaIntegrations)
        .where(eq(communityLumaIntegrations.communityId, community.id))
        .limit(1);

      return integration ?? null;
    }),

  /** Update tag filters or enable/disable. */
  updateConfig: protectedProcedure
    .input(
      z.object({
        communitySlug: z.string(),
        tagFilters: z.array(z.string()).optional(),
        isEnabled: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const community = await requireCommunityAdmin(
        ctx.db,
        ctx.session.user.id,
        input.communitySlug,
      );

      const updates: Record<string, unknown> = {};
      if (input.tagFilters !== undefined) updates.tagFilters = input.tagFilters;
      if (input.isEnabled !== undefined) updates.isEnabled = input.isEnabled;

      await ctx.db
        .update(communityLumaIntegrations)
        .set(updates)
        .where(eq(communityLumaIntegrations.communityId, community.id));

      invalidateCache(`luma-events:${community.id}`);

      return { success: true };
    }),

  /** Disconnect Luma integration. */
  disconnect: protectedProcedure
    .input(z.object({ communitySlug: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const community = await requireCommunityAdmin(
        ctx.db,
        ctx.session.user.id,
        input.communitySlug,
      );

      await ctx.db
        .delete(communityLumaIntegrations)
        .where(eq(communityLumaIntegrations.communityId, community.id));

      invalidateCache(`luma-events:${community.id}`);

      return { success: true };
    }),

  /** Test the connection by calling Luma API with the stored key. */
  testConnection: protectedProcedure
    .input(z.object({ communitySlug: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const community = await requireCommunityAdmin(
        ctx.db,
        ctx.session.user.id,
        input.communitySlug,
      );

      const [integration] = await ctx.db
        .select({
          apiKeyEncrypted: communityLumaIntegrations.apiKeyEncrypted,
        })
        .from(communityLumaIntegrations)
        .where(eq(communityLumaIntegrations.communityId, community.id))
        .limit(1);

      if (!integration) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No Luma integration configured",
        });
      }

      const apiKey = decryptApiKey(integration.apiKeyEncrypted);
      const result = await validateApiKey(apiKey);

      if (!result.valid) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Luma API key is no longer valid. Please reconnect.",
        });
      }

      invalidateCache(`luma-events:${community.id}`);

      return { ok: true, lumaUser: result.user.name };
    }),
});
```

- [ ] **Step 2: Register the router in root.ts**

In `src/server/api/root.ts`, add the import:

```ts
import { lumaRouter } from "@/server/api/routers/luma";
```

And add to the `createTRPCRouter({...})` object:

```ts
luma: lumaRouter,
```

- [ ] **Step 3: Verify with `tsc --noEmit`**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/server/api/routers/luma.ts src/server/api/root.ts
git commit -m "feat(luma): add tRPC router for Luma integration CRUD"
```

---

### Task 8: Extend `getCommunityEvents` to merge Luma events

**Files:**
- Modify: `src/server/api/routers/events.ts:362-385`

- [ ] **Step 1: Add imports at top of events.ts**

Add these imports to the top of `src/server/api/routers/events.ts`:

```ts
import { communityLumaIntegrations } from "@/server/db/schema";
import { decryptApiKey } from "@/server/luma/crypto";
import { getCalendarEvents } from "@/server/luma/client";
import { getCached, setCached } from "@/server/luma/cache";
import { normalizeLumaEvent } from "@/server/luma/normalize";
import type { NormalizedEvent } from "@/server/luma/normalize";
```

- [ ] **Step 2: Replace the `getCommunityEvents` procedure**

Replace the existing `getCommunityEvents` procedure (lines 362-385) with:

```ts
  getCommunityEvents: publicProcedure
    .input(z.object({ communitySlug: z.string() }))
    .query(async ({ ctx, input }) => {
      const community = await ctx.db.query.communities.findFirst({
        where: and(eq(communities.slug, input.communitySlug), isNull(communities.deletedAt)),
        columns: { id: true },
      });
      if (!community) return [];

      // 1. Fetch native events from Payload CMS
      const payload = await getPayloadClient();
      const { docs } = await payload.find({
        collection: "events",
        where: {
          and: [
            { status: { equals: "published" } },
            { communityId: { equals: community.id } },
          ],
        },
        sort: "date",
        draft: false,
      });

      // Normalize native events
      const nativeEvents: NormalizedEvent[] = docs.map((e) => ({
        id: e.id,
        title: e.title,
        slug: e.slug,
        description: null,
        type: e.type,
        date: e.date,
        startTime: e.startTime ?? null,
        endTime: e.endTime ?? null,
        location: e.location,
        maxAttendees: (e.maxAttendees as number | null) ?? null,
        image: null,
        status: e.status,
        communityId: community.id,
        source: "native" as const,
        lumaUrl: null,
      }));

      // 2. Check for Luma integration
      let lumaEvents: NormalizedEvent[] = [];

      const [integration] = await ctx.db
        .select()
        .from(communityLumaIntegrations)
        .where(
          and(
            eq(communityLumaIntegrations.communityId, community.id),
            eq(communityLumaIntegrations.isEnabled, true),
          ),
        )
        .limit(1);

      if (integration && integration.calendarApiId) {
        const cacheKey = `luma-events:${community.id}`;
        const cached = getCached<NormalizedEvent[]>(cacheKey);

        if (cached) {
          lumaEvents = cached;
        } else {
          try {
            const apiKey = decryptApiKey(integration.apiKeyEncrypted);
            const rawEvents = await getCalendarEvents(
              apiKey,
              integration.calendarApiId,
            );

            lumaEvents = rawEvents.map((e) =>
              normalizeLumaEvent(e, community.id),
            );
            setCached(cacheKey, lumaEvents);

            // Update lastSyncCheck (fire and forget)
            void ctx.db
              .update(communityLumaIntegrations)
              .set({ lastSyncCheck: new Date() })
              .where(eq(communityLumaIntegrations.id, integration.id));
          } catch (err) {
            console.error("Failed to fetch Luma events:", err);
            // Graceful degradation: return native events only
          }
        }
      }

      // 3. Merge and sort by date ascending
      const allEvents = [...nativeEvents, ...lumaEvents].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );

      return allEvents;
    }),
```

- [ ] **Step 3: Verify with `tsc --noEmit`**

Run: `npx tsc --noEmit`
Expected: No errors (there may be type adjustments needed for the Payload return type changing — see next step)

- [ ] **Step 4: Fix any type issues in events page**

The return type of `getCommunityEvents` has changed from Payload docs to `NormalizedEvent[]`. The events page at `src/app/[locale]/communities/[slug]/events/page.tsx` accesses `event.id`, `event.title`, `event.slug`, `event.date`, `event.type`, `event.status`, `event.startTime`, `event.endTime`, `event.location`, `event.maxAttendees` — all of which exist on `NormalizedEvent`. If tsc flags issues, they'll be addressed in Task 10.

- [ ] **Step 5: Commit**

```bash
git add src/server/api/routers/events.ts
git commit -m "feat(luma): merge Luma events into getCommunityEvents with cache"
```

---

### Task 9: Add i18n strings

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/nl.json`

- [ ] **Step 1: Add English strings**

In `messages/en.json`, add `"integrations"` to the `communities.settings.sidebar` object:

```json
"sidebar": {
  "general": "General",
  "members": "Members",
  "invites": "Invites",
  "rules": "Rules",
  "ownership": "Ownership",
  "integrations": "Integrations"
},
```

Also add a new `communities.settings.integrations` block (at the same level as `sidebar`, `members`, etc.):

```json
"integrations": {
  "title": "Integrations",
  "description": "Connect external services to your community.",
  "luma": {
    "title": "Luma Events",
    "description": "Sync events from your Luma calendar. Events will appear in your community events list.",
    "connect": "Connect Luma",
    "disconnect": "Disconnect",
    "disconnectConfirm": "Are you sure? This will remove the Luma connection and stop syncing events.",
    "apiKeyLabel": "Luma API Key",
    "apiKeyPlaceholder": "Paste your Luma API key",
    "apiKeyHelp": "Find your API key in Luma Settings → API. Requires Luma Plus.",
    "connecting": "Validating...",
    "selectCalendar": "Select Calendar",
    "selectCalendarDescription": "Choose which Luma calendar to sync events from.",
    "connected": "Connected",
    "calendarLabel": "Calendar",
    "enabled": "Sync enabled",
    "disabled": "Sync paused",
    "testConnection": "Test Connection",
    "testing": "Testing...",
    "testSuccess": "Connection successful!",
    "testFailed": "Connection failed. Please reconnect.",
    "lastSync": "Last synced",
    "never": "never"
  }
}
```

- [ ] **Step 2: Add Dutch strings**

Add the same structure to `messages/nl.json` with Dutch translations:

Sidebar addition:
```json
"integrations": "Integraties"
```

Integrations block:
```json
"integrations": {
  "title": "Integraties",
  "description": "Verbind externe diensten met je community.",
  "luma": {
    "title": "Luma Evenementen",
    "description": "Synchroniseer evenementen van je Luma-kalender. Evenementen verschijnen in je community evenementenlijst.",
    "connect": "Verbind Luma",
    "disconnect": "Ontkoppelen",
    "disconnectConfirm": "Weet je het zeker? Dit verwijdert de Luma-verbinding en stopt met het synchroniseren van evenementen.",
    "apiKeyLabel": "Luma API-sleutel",
    "apiKeyPlaceholder": "Plak je Luma API-sleutel",
    "apiKeyHelp": "Vind je API-sleutel in Luma Instellingen → API. Vereist Luma Plus.",
    "connecting": "Valideren...",
    "selectCalendar": "Selecteer Kalender",
    "selectCalendarDescription": "Kies welke Luma-kalender je wilt synchroniseren.",
    "connected": "Verbonden",
    "calendarLabel": "Kalender",
    "enabled": "Synchronisatie actief",
    "disabled": "Synchronisatie gepauzeerd",
    "testConnection": "Test Verbinding",
    "testing": "Testen...",
    "testSuccess": "Verbinding succesvol!",
    "testFailed": "Verbinding mislukt. Verbind opnieuw.",
    "lastSync": "Laatst gesynchroniseerd",
    "never": "nooit"
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add messages/en.json messages/nl.json
git commit -m "feat(luma): add i18n strings for Luma integration settings"
```

---

### Task 10: Add "Integrations" to settings sidebar

**Files:**
- Modify: `src/components/communities/settings/settings-sidebar.tsx:24-29`

- [ ] **Step 1: Add the nav item**

In `src/components/communities/settings/settings-sidebar.tsx`, add `"integrations"` to the `items` array, before `"ownership"`:

```ts
  const items: NavItem[] = [
    { key: "general", href: `${basePath}/general` },
    { key: "members", href: `${basePath}/members` },
    { key: "invites", href: `${basePath}/invites` },
    { key: "rules", href: `${basePath}/rules` },
    { key: "integrations", href: `${basePath}/integrations`, ownerOnly: true },
    { key: "ownership", href: `${basePath}/ownership`, ownerOnly: true },
  ];
```

- [ ] **Step 2: Update the type cast for `t()`**

Update the translation key type cast on line 53:

```ts
{t(item.key as "general" | "members" | "invites" | "rules" | "integrations" | "ownership")}
```

- [ ] **Step 3: Verify with `tsc --noEmit`**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/components/communities/settings/settings-sidebar.tsx
git commit -m "feat(luma): add Integrations tab to community settings sidebar"
```

---

### Task 11: Create integrations settings page

**Files:**
- Create: `src/components/communities/settings/integrations-settings.tsx`
- Create: `src/app/[locale]/communities/[slug]/settings/integrations/page.tsx`

- [ ] **Step 1: Create the integrations settings component**

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface IntegrationsSettingsProps {
  slug: string;
}

export function IntegrationsSettings({ slug }: IntegrationsSettingsProps) {
  const t = useTranslations("communities.settings.integrations.luma");
  const tPage = useTranslations("communities.settings.integrations");
  const utils = api.useUtils();

  const { data: config, isLoading } = api.luma.getConfig.useQuery({
    communitySlug: slug,
  });

  const [apiKey, setApiKey] = useState("");
  const [showKeyInput, setShowKeyInput] = useState(false);

  const connectMutation = api.luma.connect.useMutation({
    onSuccess: (data) => {
      // Auto-select if only one calendar
      if (data.calendars.length === 1) {
        selectCalendarMutation.mutate({
          communitySlug: slug,
          calendarApiId: data.calendars[0]!.api_id,
          calendarName: data.calendars[0]!.name,
        });
      }
      setApiKey("");
      setShowKeyInput(false);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const selectCalendarMutation = api.luma.selectCalendar.useMutation({
    onSuccess: () => {
      void utils.luma.getConfig.invalidate();
      toast.success(t("testSuccess"));
    },
  });

  const disconnectMutation = api.luma.disconnect.useMutation({
    onSuccess: () => {
      void utils.luma.getConfig.invalidate();
      toast.success(t("disconnect"));
    },
  });

  const toggleMutation = api.luma.updateConfig.useMutation({
    onSuccess: () => {
      void utils.luma.getConfig.invalidate();
    },
  });

  const testMutation = api.luma.testConnection.useMutation({
    onSuccess: () => {
      toast.success(t("testSuccess"));
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
      </div>
    );
  }

  const isConnected = config && config.calendarApiId !== "";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">
          {tPage("title")}
        </h2>
        <p className="text-muted-foreground text-sm">{tPage("description")}</p>
      </div>

      <div className="border-border rounded-lg border p-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-medium">{t("title")}</h3>
            <p className="text-muted-foreground mt-1 text-sm">
              {t("description")}
            </p>
          </div>
        </div>

        {isConnected ? (
          <div className="mt-4 space-y-3">
            {/* Connected state */}
            <div className="bg-secondary/50 flex items-center justify-between rounded-md px-3 py-2">
              <div>
                <span className="text-sm font-medium">{t("calendarLabel")}: </span>
                <span className="text-sm">{config.calendarName}</span>
              </div>
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-200">
                {config.isEnabled ? t("enabled") : t("disabled")}
              </span>
            </div>

            {config.lastSyncCheck && (
              <p className="text-muted-foreground text-xs">
                {t("lastSync")}: {new Date(config.lastSyncCheck).toLocaleString()}
              </p>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  toggleMutation.mutate({
                    communitySlug: slug,
                    isEnabled: !config.isEnabled,
                  })
                }
                disabled={toggleMutation.isPending}
              >
                {config.isEnabled ? t("disabled") : t("enabled")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => testMutation.mutate({ communitySlug: slug })}
                disabled={testMutation.isPending}
              >
                {testMutation.isPending ? t("testing") : t("testConnection")}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (window.confirm(t("disconnectConfirm"))) {
                    disconnectMutation.mutate({ communitySlug: slug });
                  }
                }}
                disabled={disconnectMutation.isPending}
              >
                {t("disconnect")}
              </Button>
            </div>
          </div>
        ) : showKeyInput ? (
          <div className="mt-4 space-y-3">
            {/* API key input */}
            <div>
              <label className="text-sm font-medium">{t("apiKeyLabel")}</label>
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={t("apiKeyPlaceholder")}
                className="mt-1"
              />
              <p className="text-muted-foreground mt-1 text-xs">
                {t("apiKeyHelp")}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() =>
                  connectMutation.mutate({
                    communitySlug: slug,
                    apiKey,
                  })
                }
                disabled={connectMutation.isPending || !apiKey}
              >
                {connectMutation.isPending ? (
                  <>
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                    {t("connecting")}
                  </>
                ) : (
                  t("connect")
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowKeyInput(false);
                  setApiKey("");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <Button
              size="sm"
              onClick={() => setShowKeyInput(true)}
            >
              {t("connect")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the page route**

Create `src/app/[locale]/communities/[slug]/settings/integrations/page.tsx`:

```tsx
"use client";

import { use } from "react";
import { IntegrationsSettings } from "@/components/communities/settings/integrations-settings";

export default function IntegrationsSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return <IntegrationsSettings slug={slug} />;
}
```

- [ ] **Step 3: Verify with `tsc --noEmit`**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/components/communities/settings/integrations-settings.tsx src/app/\[locale\]/communities/\[slug\]/settings/integrations/page.tsx
git commit -m "feat(luma): add integrations settings page with Luma connect/disconnect UI"
```

---

### Task 12: Update community events page for Luma events

**Files:**
- Modify: `src/app/[locale]/communities/[slug]/events/page.tsx`

- [ ] **Step 1: Update the event rendering**

Replace the entire events page content with the updated version that handles the `source` field.

In `src/app/[locale]/communities/[slug]/events/page.tsx`, make these changes:

1. Add `ExternalLink` to the lucide-react import:

```ts
import { Plus, Pencil, XCircle, ExternalLink } from "lucide-react";
```

2. Replace the event row `<Link>` block (the `events.map` callback, lines ~94-151) with:

```tsx
          {events.map((event) => {
            const isLuma = event.source === "luma";
            const Wrapper = isLuma ? "a" : Link;
            const wrapperProps = isLuma
              ? {
                  href: event.lumaUrl!,
                  target: "_blank",
                  rel: "noopener noreferrer",
                }
              : { href: `/events/${event.slug}` as never };

            return (
              <Wrapper
                key={event.id}
                {...(wrapperProps as Record<string, unknown>)}
                className="border-border hover:bg-secondary/50 flex flex-col gap-1.5 border-b px-4 py-3.5 transition-colors sm:flex-row sm:items-center sm:gap-0"
              >
                <span className="flex items-center gap-1.5 text-[15px] font-medium leading-snug sm:order-2 sm:flex-1">
                  {event.title}
                  {isLuma && (
                    <ExternalLink className="text-muted-foreground inline size-3" />
                  )}
                </span>
                <div className="flex items-center gap-3 sm:order-1 sm:w-32">
                  <div className="bg-foreground h-2 w-2 rounded-full" />
                  <span className="font-mono text-[12px] sm:text-[13px]">
                    {formatDate(event.date)}
                  </span>
                  <span className="border-border text-muted-foreground rounded border px-2 py-0.5 font-mono text-[10px] font-medium tracking-wider sm:hidden">
                    {typeLabels[event.type] ?? event.type}
                  </span>
                </div>
                <span className="border-border text-muted-foreground hidden rounded border px-2.5 py-0.5 font-mono text-[11px] font-medium tracking-wider sm:order-3 sm:inline">
                  {typeLabels[event.type] ?? event.type}
                </span>
                {event.status === "cancelled" && (
                  <span className="text-destructive font-mono text-[10px] font-medium sm:order-4 sm:ml-2">
                    {t("cancelled")}
                  </span>
                )}
                <span className="text-muted-foreground ml-4 hidden font-mono text-lg font-light sm:order-5 sm:inline">
                  +
                </span>
                {isAdminOrOwner && !isLuma && event.status !== "cancelled" && (
                  <div
                    className="flex shrink-0 items-center gap-1 sm:order-6"
                    onClick={(e) => e.preventDefault()}
                  >
                    <button
                      className="rounded p-1 hover:bg-zinc-100"
                      onClick={() => {
                        setEditingEvent({
                          id: event.id as number,
                          data: {
                            title: event.title,
                            description: "",
                            type: event.type,
                            date:
                              typeof event.date === "string"
                                ? event.date.split("T")[0] ?? ""
                                : "",
                            startTime: event.startTime ?? "",
                            endTime: event.endTime ?? "",
                            location: event.location,
                            maxAttendees: event.maxAttendees
                              ? String(event.maxAttendees)
                              : "",
                          },
                        });
                        setDialogOpen(true);
                      }}
                    >
                      <Pencil className="size-3.5 text-zinc-400" />
                    </button>
                    <button
                      className="rounded p-1 hover:bg-zinc-100"
                      onClick={() => {
                        if (window.confirm(t("cancelEventConfirm"))) {
                          cancelMutation.mutate({
                            eventId: event.id as number,
                            communitySlug: slug,
                          });
                        }
                      }}
                    >
                      <XCircle className="size-3.5 text-zinc-400" />
                    </button>
                  </div>
                )}
              </Wrapper>
            );
          })}
```

- [ ] **Step 2: Verify with `tsc --noEmit`**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/app/\[locale\]/communities/\[slug\]/events/page.tsx
git commit -m "feat(luma): handle Luma events in community events page (link-out, hide edit)"
```

---

### Task 13: Final verification

- [ ] **Step 1: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Run linter**

Run: `npx next lint`
Expected: No errors (or only pre-existing warnings)

- [ ] **Step 3: Test dev server starts**

Run: `npx next dev` and verify no startup errors.

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix(luma): address lint/type issues from integration"
```
