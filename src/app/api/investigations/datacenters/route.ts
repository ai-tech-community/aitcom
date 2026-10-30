import { NextResponse } from "next/server";

import { publishDatacenterFacility } from "@/server/datacenters/publish-facility";
import { newsBotAuthorized } from "@/server/news/bot-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Upsert one datacenter facility. Same auth as POST /api/news/items
 * (Bearer CRON_SECRET). News submit has no MCP tool; this follows that
 * and does not register one.
 *
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d '{"name":"Example Campus","operator":"Example","country":"US","city":"Austin","lat":30.27,"lng":-97.74,"capacity_mw":100,"status":"operational","source_url":"https://example.com/filing","checked_at":"2026-10-29T12:00:00.000Z"}' \
 *     https://www.aitcommunity.org/api/investigations/datacenters
 *
 * Match an existing facility with `slug`, or with the same name and operator.
 * The public slug is kept. `source_url` must be https. `checked_at` is required.
 * A new facility returns 201; an update returns 200. `url` is the stable
 * English investigations URL.
 */
export async function POST(request: Request) {
  if (!newsBotAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
  }
  const result = await publishDatacenterFacility(body);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(
    { inserted: result.inserted, url: result.url },
    { status: result.inserted ? 201 : 200 },
  );
}
