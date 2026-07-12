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

export async function getCalendars(apiKey: string): Promise<LumaCalendar[]> {
  const user = await lumaFetch<LumaUser>("/v1/user/get-self", apiKey);
  return [
    {
      api_id: user.api_id,
      name: user.name,
      slug: user.email,
    },
  ];
}

/**
 * Fetches up to 2 pages (Luma's max page size × 2) of a calendar's events,
 * sorted by `start_at` ascending.
 *
 * `after` is optional and, when supplied, is passed through as the `after`
 * query param on `/v1/calendar/list-events` so the API returns events
 * starting from that instant forward instead of the calendar's oldest
 * events. Without it (the default — used by the live display path in
 * `getCommunityEvents`, unchanged), a calendar with more than 2 pages of
 * history returns only its OLDEST events and can truncate before reaching
 * anything upcoming; the ingestion cron always passes `after` (now) so the
 * corpus it feeds sees future events instead.
 */
export async function getCalendarEvents(
  apiKey: string,
  calendarApiId: string,
  after?: string,
): Promise<LumaEvent[]> {
  const events: LumaEvent[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < 2; page++) {
    const params: Record<string, string> = {
      calendar_api_id: calendarApiId,
      sort_column: "start_at",
      sort_direction: "asc",
    };
    if (after) params.after = after;
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
