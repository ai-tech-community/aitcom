# Event Cover-Image Upload + Import-From-Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let members/admins attach a cover image to a community event, and paste a Meetup/Eventbrite/Luma link to auto-fill the submission form.

**Architecture:** A pure HTML→event parser (`event-link-import.ts`) feeds a protected tRPC procedure (`importEventFromUrl`) that fetches the page behind the existing SSRF guard, parses schema.org `Event` JSON-LD (OpenGraph fallback), ingests the cover image into a Payload `media` doc, and returns form-fillable fields. The form gains a paste-to-autofill bar plus a cover-image upload control; both upload and import converge on a single `coverImage` media id stored through the existing event mutations.

**Tech Stack:** Next.js (App Router) + tRPC + Zod, Payload CMS (`media` collection, `events.coverImage` upload relation), Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-29-community-event-import-image-upload-design.md`

---

## File Structure

- **Modify** `src/app/api/upload/route.ts` — also return the created media `id` (today returns only `url`).
- **Modify** `src/server/api/routers/events.ts` — add `coverImage` to `eventUpsertSchema`, map it in `buildEventPayloadData` (export it for testing), persist it in `updateEvent`/`resubmitEvent`, and add the `importEventFromUrl` procedure.
- **Create** `src/lib/event-link-import.ts` — pure `parseEventFromHtml(html, sourceUrl)` (no network).
- **Create** `src/lib/event-link-import.test.ts` — parser unit tests with inline fixture HTML.
- **Create** `src/server/events/import-from-url.ts` — server-side fetch + SSRF + cover-image ingestion helpers used by the procedure.
- **Create** `src/server/events/import-from-url.test.ts` — procedure-helper tests with mocked `fetch`.
- **Modify** `src/components/communities/event-form-dialog.tsx` — cover-image upload control + paste-to-autofill bar + `coverImage` in the submit payload.

---

## Task 1: `/api/upload` returns the media id

**Files:**
- Modify: `src/app/api/upload/route.ts` (final `NextResponse.json` call)

- [ ] **Step 1: Change the response to include the id**

In `src/app/api/upload/route.ts`, the route currently ends with:

```ts
  return NextResponse.json({ url: media.url });
```

Replace that line with:

```ts
  return NextResponse.json({ url: media.url, id: media.id });
```

- [ ] **Step 2: Verify existing callers are unaffected**

Run: `grep -rn "/api/upload" src --include=*.tsx`
Expected: the community-logo caller in `src/components/communities/manage/settings-form.tsx` types the response as `{ url: string }` and reads only `data.url`. Adding `id` is additive and does not break it.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/upload/route.ts
git commit -m "feat(upload): return created media id alongside url"
```

---

## Task 2: Thread `coverImage` through the event schema and mutations

**Files:**
- Modify: `src/server/api/routers/events.ts` (`eventUpsertSchema`, `buildEventPayloadData`, `updateEvent`, `resubmitEvent`)
- Test: `src/server/api/routers/event-payload-data.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/server/api/routers/event-payload-data.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildEventPayloadData } from "./events";

describe("buildEventPayloadData", () => {
  const base = {
    title: "AI Builders Meetup",
    type: "meetup" as const,
    date: "2026-06-12",
    location: "Amsterdam",
  };

  it("passes coverImage media id straight through", () => {
    const data = buildEventPayloadData({ ...base, coverImage: 42 });
    expect(data.coverImage).toBe(42);
  });

  it("leaves coverImage undefined when not provided", () => {
    const data = buildEventPayloadData(base);
    expect(data.coverImage).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/server/api/routers/event-payload-data.test.ts`
Expected: FAIL — `buildEventPayloadData` is not exported, and `coverImage` is not on the schema/return.

- [ ] **Step 3: Add `coverImage` to the schema**

In `src/server/api/routers/events.ts`, inside `eventUpsertSchema` (the `z.object({ ... })` near the top), add this field next to `maxAttendees`:

```ts
  coverImage: z.number().int().positive().optional(),
```

- [ ] **Step 4: Export `buildEventPayloadData` and map the field**

Change the function declaration from:

```ts
function buildEventPayloadData(input: z.infer<typeof eventUpsertSchema>) {
```

to:

```ts
export function buildEventPayloadData(input: z.infer<typeof eventUpsertSchema>) {
```

and add this line to the returned object (next to `maxAttendees: input.maxAttendees,`):

```ts
    coverImage: input.coverImage,
```

- [ ] **Step 5: Persist `coverImage` in `updateEvent` and `resubmitEvent`**

In **both** `updateEvent` and `resubmitEvent`, in the block of `if (input.<field> !== undefined) data.<field> = ...` assignments, add (place it right after the `maxAttendees` assignment):

```ts
      if (input.coverImage !== undefined) data.coverImage = input.coverImage;
```

Note: `submitEvent` and `createEvent` already spread `...buildEventPayloadData(input)`, so they pick up `coverImage` automatically. `submitEvent`'s curation-field strip block (`aitFitScore: undefined`, etc.) does **not** include `coverImage`, so the uploaded image survives — do not add it there.

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm vitest run src/server/api/routers/event-payload-data.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/server/api/routers/events.ts src/server/api/routers/event-payload-data.test.ts
git commit -m "feat(events): accept coverImage media id in event mutations"
```

---

## Task 3: Pure HTML→event parser

**Files:**
- Create: `src/lib/event-link-import.ts`
- Test: `src/lib/event-link-import.test.ts`

This module is pure and synchronous (no network), so it is fully unit-testable.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/event-link-import.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseEventFromHtml } from "./event-link-import";

const SOURCE = "https://lu.ma/ai-builders";

describe("parseEventFromHtml", () => {
  it("extracts an event from schema.org JSON-LD", () => {
    const html = `
      <html><head>
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Event",
        "name": "AI Builders Meetup",
        "description": "An evening of agents and demos.",
        "startDate": "2026-06-12T18:00:00+02:00",
        "endDate": "2026-06-12T21:00:00+02:00",
        "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
        "image": "https://cdn.example.com/cover.jpg",
        "location": {
          "@type": "Place",
          "name": "TQ Amsterdam",
          "address": {
            "@type": "PostalAddress",
            "addressLocality": "Amsterdam",
            "addressCountry": "NL"
          }
        }
      }
      </script>
      </head><body></body></html>`;

    const r = parseEventFromHtml(html, SOURCE);
    expect(r.title).toBe("AI Builders Meetup");
    expect(r.description).toBe("An evening of agents and demos.");
    expect(r.date).toBe("2026-06-12");
    expect(r.startTime).toBe("18:00");
    expect(r.endTime).toBe("21:00");
    expect(r.location).toBe("TQ Amsterdam");
    expect(r.city).toBe("Amsterdam");
    expect(r.country).toBe("NL");
    expect(r.format).toBe("in-person");
    expect(r.coverImageUrl).toBe("https://cdn.example.com/cover.jpg");
    expect(r.sourceUrl).toBe(SOURCE);
  });

  it("finds an Event inside a JSON-LD @graph array", () => {
    const html = `
      <script type="application/ld+json">
      {"@context":"https://schema.org","@graph":[
        {"@type":"WebSite","name":"X"},
        {"@type":"Event","name":"Graph Event","startDate":"2026-07-01T09:30"}
      ]}
      </script>`;
    const r = parseEventFromHtml(html, SOURCE);
    expect(r.title).toBe("Graph Event");
    expect(r.date).toBe("2026-07-01");
    expect(r.startTime).toBe("09:30");
  });

  it("maps online attendance mode to format online", () => {
    const html = `
      <script type="application/ld+json">
      {"@type":"Event","name":"Webinar",
       "eventAttendanceMode":"https://schema.org/OnlineEventAttendanceMode"}
      </script>`;
    expect(parseEventFromHtml(html, SOURCE).format).toBe("online");
  });

  it("falls back to OpenGraph tags when JSON-LD is absent", () => {
    const html = `
      <html><head>
        <meta property="og:title" content="OG Only Event" />
        <meta property="og:description" content="From OpenGraph." />
        <meta property="og:image" content="https://cdn.example.com/og.png" />
      </head></html>`;
    const r = parseEventFromHtml(html, SOURCE);
    expect(r.title).toBe("OG Only Event");
    expect(r.description).toBe("From OpenGraph.");
    expect(r.coverImageUrl).toBe("https://cdn.example.com/og.png");
    expect(r.date).toBeUndefined();
  });

  it("returns only sourceUrl when nothing is parseable", () => {
    const r = parseEventFromHtml("<html><body>nope</body></html>", SOURCE);
    expect(r.sourceUrl).toBe(SOURCE);
    expect(r.title).toBeUndefined();
  });

  it("ignores malformed JSON-LD blocks without throwing", () => {
    const html = `
      <script type="application/ld+json">{ not valid json </script>
      <meta property="og:title" content="Recovered" />`;
    expect(parseEventFromHtml(html, SOURCE).title).toBe("Recovered");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/lib/event-link-import.test.ts`
Expected: FAIL — module `./event-link-import` does not exist.

- [ ] **Step 3: Implement the parser**

Create `src/lib/event-link-import.ts`:

```ts
import { EVENT_FORMAT_OPTIONS } from "@/lib/event-metadata";

type EventFormat = (typeof EVENT_FORMAT_OPTIONS)[number];

export interface ParsedEventImport {
  title?: string;
  summary?: string;
  description?: string;
  date?: string; // YYYY-MM-DD
  startTime?: string; // HH:MM
  endTime?: string; // HH:MM
  location?: string;
  city?: string;
  country?: string;
  format?: EventFormat;
  coverImageUrl?: string;
  sourceUrl: string;
}

/** Pull the raw text of every <script type="application/ld+json"> block. */
function extractJsonLdBlocks(html: string): string[] {
  const blocks: string[] = [];
  const re =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[1]) blocks.push(m[1].trim());
  }
  return blocks;
}

/** Walk parsed JSON-LD (object, array, or @graph) and return the first Event. */
function findEventNode(node: unknown): Record<string, unknown> | null {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findEventNode(item);
      if (found) return found;
    }
    return null;
  }
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    const type = obj["@type"];
    const isEvent = Array.isArray(type)
      ? type.some((t) => String(t).includes("Event"))
      : typeof type === "string" && type.includes("Event");
    if (isEvent) return obj;
    if (Array.isArray(obj["@graph"])) return findEventNode(obj["@graph"]);
  }
  return null;
}

function findEventInBlocks(blocks: string[]): Record<string, unknown> | null {
  for (const raw of blocks) {
    try {
      const parsed: unknown = JSON.parse(raw);
      const event = findEventNode(parsed);
      if (event) return event;
    } catch {
      // Malformed JSON-LD — skip this block.
    }
  }
  return null;
}

/** Split an ISO-ish datetime ("2026-06-12T18:00:00+02:00") into date + HH:MM. */
function splitDateTime(value: unknown): { date?: string; time?: string } {
  if (typeof value !== "string") return {};
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/.exec(value.trim());
  if (!m) return {};
  return { date: m[1], time: m[2] };
}

function attendanceToFormat(value: unknown): EventFormat | undefined {
  const s = String(value ?? "").toLowerCase();
  if (s.includes("online")) return "online";
  if (s.includes("offline")) return "in-person";
  if (s.includes("mixed")) return "hybrid";
  return undefined;
}

function str(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** schema.org image can be a string, an array, or an ImageObject. */
function firstImageUrl(value: unknown): string | undefined {
  if (typeof value === "string") return str(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const url = firstImageUrl(item);
      if (url) return url;
    }
    return undefined;
  }
  if (value && typeof value === "object") {
    return str((value as Record<string, unknown>).url);
  }
  return undefined;
}

function fromJsonLd(
  event: Record<string, unknown>,
  result: ParsedEventImport,
): void {
  result.title = str(event.name);
  result.description = str(event.description);
  const start = splitDateTime(event.startDate);
  result.date = start.date;
  result.startTime = start.time;
  result.endTime = splitDateTime(event.endDate).time;
  result.format = attendanceToFormat(event.eventAttendanceMode);
  result.coverImageUrl = firstImageUrl(event.image);

  const location = event.location;
  if (location && typeof location === "object") {
    const loc = location as Record<string, unknown>;
    result.location = str(loc.name);
    const address = loc.address;
    if (address && typeof address === "object") {
      const addr = address as Record<string, unknown>;
      result.city = str(addr.addressLocality);
      result.country = str(addr.addressCountry);
      result.location ??= str(addr.streetAddress);
    }
  }
}

/** Read <meta property="og:x" content="y"> (property or name attribute). */
function readMeta(html: string, key: string): string | undefined {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`,
    "i",
  );
  const m = re.exec(html);
  if (m?.[1]) return decodeHtmlEntities(m[1].trim()) || undefined;
  // content attribute may appear before property
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`,
    "i",
  );
  const m2 = re2.exec(html);
  return m2?.[1] ? decodeHtmlEntities(m2[1].trim()) || undefined : undefined;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function applyOpenGraphFallback(html: string, result: ParsedEventImport): void {
  result.title ??= readMeta(html, "og:title");
  result.description ??= readMeta(html, "og:description");
  result.coverImageUrl ??= readMeta(html, "og:image");
}

/**
 * Parse an event from a fetched HTML document. Best-effort: every field is
 * optional except `sourceUrl`. Prefers schema.org Event JSON-LD; falls back to
 * OpenGraph meta tags for anything still missing.
 */
export function parseEventFromHtml(
  html: string,
  sourceUrl: string,
): ParsedEventImport {
  const result: ParsedEventImport = { sourceUrl };

  const event = findEventInBlocks(extractJsonLdBlocks(html));
  if (event) fromJsonLd(event, result);

  applyOpenGraphFallback(html, result);

  // summary mirrors description so the form's summary field can prefill too.
  result.summary ??= result.description;

  return result;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/lib/event-link-import.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/event-link-import.ts src/lib/event-link-import.test.ts
git commit -m "feat(events): pure HTML->event parser (JSON-LD + OpenGraph)"
```

---

## Task 4: Server fetch + SSRF + cover-image ingestion helpers

**Files:**
- Create: `src/server/events/import-from-url.ts`
- Test: `src/server/events/import-from-url.test.ts`

These helpers do the network + Payload work, kept out of the parser so the parser stays pure. `ingestRemoteImage` takes the Payload client as a parameter so the test can pass a fake.

- [ ] **Step 1: Write the failing tests**

Create `src/server/events/import-from-url.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchEventPageHtml, ingestRemoteImage } from "./import-from-url";

describe("fetchEventPageHtml", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects non-HTTPS / private URLs via the SSRF guard", async () => {
    await expect(fetchEventPageHtml("http://localhost/x")).rejects.toThrow();
  });

  it("rejects a non-HTML response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    await expect(
      fetchEventPageHtml("https://lu.ma/ai-builders"),
    ).rejects.toThrow(/not an HTML page/i);
  });

  it("returns HTML on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<html>ok</html>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      ),
    );
    const html = await fetchEventPageHtml("https://lu.ma/ai-builders");
    expect(html).toContain("<html>ok</html>");
  });
});

describe("ingestRemoteImage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("downloads an image and creates a media doc", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "image/png" },
        }),
      ),
    );
    const payload = {
      create: vi.fn().mockResolvedValue({ id: 7, url: "/media/7.png" }),
    };
    const result = await ingestRemoteImage(
      payload as never,
      "https://cdn.example.com/cover.png",
      "Cover for My Event",
    );
    expect(result).toEqual({ id: 7, url: "/media/7.png" });
    expect(payload.create).toHaveBeenCalledOnce();
  });

  it("returns null when the URL is not an image", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<html></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      ),
    );
    const payload = { create: vi.fn() };
    const result = await ingestRemoteImage(
      payload as never,
      "https://cdn.example.com/not-an-image",
      "alt",
    );
    expect(result).toBeNull();
    expect(payload.create).not.toHaveBeenCalled();
  });

  it("returns null when the image host fails the SSRF guard", async () => {
    const payload = { create: vi.fn() };
    const result = await ingestRemoteImage(
      payload as never,
      "http://127.0.0.1/cover.png",
      "alt",
    );
    expect(result).toBeNull();
    expect(payload.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/server/events/import-from-url.test.ts`
Expected: FAIL — module `./import-from-url` does not exist.

- [ ] **Step 3: Implement the helpers**

Create `src/server/events/import-from-url.ts`:

```ts
import type { getPayloadClient } from "@/server/payload";
import { validateWebhookUrl } from "@/server/agent/validate-webhook-url";

type PayloadClient = Awaited<ReturnType<typeof getPayloadClient>>;

const FETCH_TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

async function fetchWithLimits(
  url: string,
  maxBytes: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "user-agent": "aitcom-event-importer/1.0" },
    });
    if (!res.ok) {
      throw new Error(`Request failed with status ${res.status}`);
    }
    const declared = Number(res.headers.get("content-length") ?? "0");
    if (declared > maxBytes) {
      throw new Error("Response too large");
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch an event page's HTML behind the SSRF guard. Throws on a blocked host,
 * a failed request, or a non-HTML content type.
 */
export async function fetchEventPageHtml(url: string): Promise<string> {
  const guard = await validateWebhookUrl(url);
  if (!guard.ok) {
    throw new Error(`Refusing to fetch URL: ${guard.reason}`);
  }
  const res = await fetchWithLimits(url, MAX_HTML_BYTES);
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) {
    throw new Error("That link is not an HTML page");
  }
  const html = await res.text();
  return html.slice(0, MAX_HTML_BYTES);
}

/**
 * Download a remote image behind the SSRF guard and create a Payload media doc.
 * Returns the media id + url, or null on any failure (best-effort — a missing
 * cover image must never fail the whole import).
 */
export async function ingestRemoteImage(
  payload: PayloadClient,
  url: string,
  alt: string,
): Promise<{ id: number; url: string } | null> {
  try {
    const guard = await validateWebhookUrl(url);
    if (!guard.ok) return null;

    const res = await fetchWithLimits(url, MAX_IMAGE_BYTES);
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) return null;

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.byteLength > MAX_IMAGE_BYTES) return null;

    const extension = contentType.split("/")[1]?.split(";")[0] ?? "jpg";
    const media = await payload.create({
      collection: "media",
      data: { alt },
      file: {
        data: buffer,
        name: `event-cover.${extension}`,
        mimetype: contentType.split(";")[0],
        size: buffer.byteLength,
      },
    });
    return { id: media.id as number, url: media.url as string };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/server/events/import-from-url.test.ts`
Expected: PASS (6 tests). Note: `validateWebhookUrl` rejects `http://` and loopback synchronously before any DNS, so the SSRF cases pass without network.

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm typecheck`
Expected: no errors.

```bash
git add src/server/events/import-from-url.ts src/server/events/import-from-url.test.ts
git commit -m "feat(events): SSRF-guarded page fetch + cover-image ingestion"
```

---

## Task 5: `importEventFromUrl` tRPC procedure

**Files:**
- Modify: `src/server/api/routers/events.ts` (new imports + new procedure)

- [ ] **Step 1: Add imports**

At the top of `src/server/api/routers/events.ts`, add:

```ts
import { parseEventFromHtml } from "@/lib/event-link-import";
import {
  fetchEventPageHtml,
  ingestRemoteImage,
} from "@/server/events/import-from-url";
```

- [ ] **Step 2: Add the procedure**

Inside `createTRPCRouter({ ... })`, add a new procedure (place it right after `submitEvent`):

```ts
  importEventFromUrl: protectedProcedure
    .input(z.object({ url: z.string().url() }))
    .mutation(async ({ input }) => {
      let html: string;
      try {
        html = await fetchEventPageHtml(input.url);
      } catch {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Couldn't read that link — please check the URL or fill the form manually.",
        });
      }

      const parsed = parseEventFromHtml(html, input.url);

      let coverImage: { id: number; url: string } | null = null;
      if (parsed.coverImageUrl) {
        const payload = await getPayloadClient();
        coverImage = await ingestRemoteImage(
          payload,
          parsed.coverImageUrl,
          parsed.title ?? "Event cover",
        );
      }

      return {
        title: parsed.title ?? null,
        summary: parsed.summary ?? null,
        description: parsed.description ?? null,
        date: parsed.date ?? null,
        startTime: parsed.startTime ?? null,
        endTime: parsed.endTime ?? null,
        location: parsed.location ?? null,
        city: parsed.city ?? null,
        country: parsed.country ?? null,
        format: parsed.format ?? null,
        sourceUrl: parsed.sourceUrl,
        coverImageId: coverImage?.id ?? null,
        coverImageUrl: coverImage?.url ?? null,
      };
    }),
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 4: Lint**

Run: `pnpm lint`
Expected: ✔ no warnings or errors.

- [ ] **Step 5: Commit**

```bash
git add src/server/api/routers/events.ts
git commit -m "feat(events): importEventFromUrl tRPC procedure"
```

---

## Task 6: Cover-image upload control in the form

**Files:**
- Modify: `src/components/communities/event-form-dialog.tsx`

- [ ] **Step 1: Extend the form state**

In `EventFormData` (the `interface` near line 41), add two fields after `maxAttendees: string;`:

```ts
  coverImageId: number | null;
  coverImageUrl: string | null;
```

In `emptyForm` (near line 68), add after `maxAttendees: "",`:

```ts
  coverImageId: null,
  coverImageUrl: null,
```

- [ ] **Step 2: Add imports and an upload-in-progress state**

Ensure these icons are imported from `lucide-react` (add any missing to the existing import): `ImagePlus`, `X`. Add `useRef` to the existing `react` import.

Inside the component body (after `const [form, setForm] = useState...`), add:

```ts
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [coverUploading, setCoverUploading] = useState(false);
```

- [ ] **Step 3: Include `coverImage` in the submit payload**

In the `payload` object (the one with `maxAttendees: form.maxAttendees ? ... : undefined`), add:

```ts
    coverImage: form.coverImageId ?? undefined,
```

- [ ] **Step 4: Add the upload handler**

Add this function inside the component (near the other handlers like `toggleAudience`):

```ts
  const handleCoverUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("alt", form.title || "Event cover");
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = (await res.json()) as { url: string; id: number };
      setForm((current) => ({
        ...current,
        coverImageId: data.id,
        coverImageUrl: data.url,
      }));
    } catch {
      toast.error("Image upload failed");
    } finally {
      setCoverUploading(false);
      if (coverInputRef.current) coverInputRef.current.value = "";
    }
  };
```

- [ ] **Step 5: Render the cover-image control**

Inside the form, just above the closing `</form>`'s submit `<Button>`, add a cover-image block (uses `next/image` is not required — a plain `<img>` preview is fine here):

```tsx
          <div className="space-y-2">
            <Label>Cover image</Label>
            {form.coverImageUrl ? (
              <div className="relative w-fit">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={form.coverImageUrl}
                  alt="Event cover preview"
                  className="border-border h-28 rounded-lg border object-cover"
                />
                <button
                  type="button"
                  className="bg-background/80 absolute top-1 right-1 rounded-full border p-1"
                  onClick={() =>
                    setForm((c) => ({
                      ...c,
                      coverImageId: null,
                      coverImageUrl: null,
                    }))
                  }
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={coverUploading}
                onClick={() => coverInputRef.current?.click()}
              >
                {coverUploading ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <ImagePlus className="mr-2 size-4" />
                )}
                {coverUploading ? "Uploading..." : "Upload cover image"}
              </Button>
            )}
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleCoverUpload}
            />
          </div>
```

- [ ] **Step 6: Typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors, no warnings.

- [ ] **Step 7: Commit**

```bash
git add src/components/communities/event-form-dialog.tsx
git commit -m "feat(events): cover-image upload control in submission form"
```

---

## Task 7: Paste-to-autofill bar in the form

**Files:**
- Modify: `src/components/communities/event-form-dialog.tsx`

- [ ] **Step 1: Add state and the import mutation**

Inside the component body, add:

```ts
  const [importUrl, setImportUrl] = useState("");

  const importMutation = api.events.importEventFromUrl.useMutation({
    onSuccess: (data) => {
      setForm((current) => ({
        ...current,
        title: data.title ?? current.title,
        summary: data.summary ?? current.summary,
        description: data.description ?? current.description,
        date: data.date ?? current.date,
        startTime: data.startTime ?? current.startTime,
        endTime: data.endTime ?? current.endTime,
        location: data.location ?? current.location,
        city: data.city ?? current.city,
        country: data.country ?? current.country,
        format: data.format ?? current.format,
        sourceUrl: data.sourceUrl ?? current.sourceUrl,
        coverImageId: data.coverImageId ?? current.coverImageId,
        coverImageUrl: data.coverImageUrl ?? current.coverImageUrl,
      }));
      toast.success("Imported — review the details and submit");
    },
    onError: (error) => toast.error(error.message),
  });
```

- [ ] **Step 2: Render the import bar**

Immediately inside the `<form ...>` element, before the first existing field group, add:

```tsx
          <div className="border-border bg-secondary/30 space-y-2 rounded-lg border p-3">
            <Label htmlFor="event-import-url">
              Import from a link (Meetup, Eventbrite, Luma)
            </Label>
            <div className="flex gap-2">
              <Input
                id="event-import-url"
                type="url"
                placeholder="https://lu.ma/your-event"
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
              />
              <Button
                type="button"
                variant="secondary"
                disabled={!importUrl || importMutation.isPending}
                onClick={() => importMutation.mutate({ url: importUrl })}
              >
                {importMutation.isPending ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : null}
                {importMutation.isPending ? "Importing..." : "Import"}
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              We&apos;ll pre-fill what we can find. You can edit everything
              before submitting.
            </p>
          </div>
```

- [ ] **Step 3: Reset the import field when the dialog closes**

In the existing `useEffect` that resets the form, add `setImportUrl("")` to the `mode === "create"` branch so a reopened dialog starts clean:

```ts
    } else if (open && mode === "create") {
      setForm(emptyForm);
      setImportUrl("");
    }
```

- [ ] **Step 4: Typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors, no warnings.

- [ ] **Step 5: Commit**

```bash
git add src/components/communities/event-form-dialog.tsx
git commit -m "feat(events): paste-to-autofill import bar in submission form"
```

---

## Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the whole test suite**

Run: `pnpm test`
Expected: all tests pass, including the new `event-link-import`, `import-from-url`, and `event-payload-data` suites.

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors, ✔ no warnings.

- [ ] **Step 3: Manual smoke test (use the `run` skill or `pnpm dev`)**

As an active community member on `/communities/<slug>/events`:
1. Click **Submit Event** → paste a real Luma/Eventbrite/Meetup event URL → **Import**.
2. Confirm title/date/location and the cover preview pre-fill; edit a field.
3. Submit → confirm it lands in the admin **Pending** tab with the cover image.
4. As admin, approve → confirm it shows on the global `/events` page with its cover image and community badge.
5. Separately, create an event manually and upload a cover image via **Upload cover image**; confirm the preview, submit, and image render.

- [ ] **Step 4: Final commit (if any formatting changed)**

```bash
pnpm format:write
git add -A
git commit -m "style(events): prettier formatting for import/upload feature" || echo "nothing to format"
```

---

## Self-Review Notes

- **Spec coverage:** cover-image upload (Tasks 1, 2, 6) ✓; generic JSON-LD/OG importer (Tasks 3–5) ✓; paste-to-autofill banner, all fields visible (Task 7) ✓; image lands in `coverImage` media relation (Tasks 1, 4, 6) ✓; members' imports still require approval — `importEventFromUrl` creates no event, submission uses the unchanged `submitEvent` path (Task 5) ✓; SSRF + size + content-type guards (Task 4) ✓; best-effort import errors (Tasks 4, 5, 7) ✓; tests for parser, importer helpers, and mapping (Tasks 3, 4, 2) ✓.
- **Type consistency:** the procedure returns `{ ...fields, coverImageId, coverImageUrl }`; the form's `importMutation.onSuccess` consumes exactly those names; `coverImageId`/`coverImageUrl` match the `EventFormData` additions; `coverImage` (media id) is the single field threaded through schema → `buildEventPayloadData`/`updateEvent`/`resubmitEvent`.
- **Format values:** importer emits only `"online" | "in-person" | "hybrid"`, matching `EVENT_FORMAT_OPTIONS`.
- **Decisions deferred from spec review (defaults kept):** event `type` is NOT inferred (the form keeps its `"meetup"` default for the member to adjust) — avoids bad guesses; orphan `media` docs from abandoned imports/uploads are accepted, same as the existing logo flow.
