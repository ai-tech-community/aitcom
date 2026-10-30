import { env } from "@/env";
import { readingTimeInput } from "@/lib/magazines/reading-time";
import { auth } from "@/server/better-auth";
import { db } from "@/server/db";
import { recordReadingTimeFor } from "@/server/magazines/stats/reading-time";
import { getPayloadClient } from "@/server/payload";
import { clientIpFromHeaders } from "@/server/rate-limit/client-ip";
import { createPerUserLimit } from "@/server/rate-limit/per-user-window";

export const runtime = "nodejs";
const recordLimit = createPerUserLimit({ windowMs: 60_000, max: 120 });
const response = (recorded: boolean, status = 200) =>
  Response.json(
    { recorded },
    { status, headers: { "Cache-Control": "no-store" } },
  );

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (
    (origin && origin !== new URL(request.url).origin) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    return response(false, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return response(false, 400);
  if (!recordLimit(clientIpFromHeaders(request.headers)).allowed)
    return response(false, 429);
  // Match opening tallies' disabled state when reader statistics lack a secret.
  if (!env.BETTER_AUTH_SECRET?.trim()) return response(false);
  let input;
  try {
    input = readingTimeInput.safeParse(await request.json());
  } catch {
    return response(false, 400);
  }
  if (!input.success) return response(false, 400);
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    const recorded = await recordReadingTimeFor(
      { db, payload: await getPayloadClient() },
      {
        ...input.data,
        viewerId: session?.user.id ?? null,
        now: new Date(),
      },
    );
    return response(recorded);
  } catch {
    // Telemetry must not interrupt the page or disclose gated content.
    return response(false, 503);
  }
}
