import { and, asc, eq, ne } from "drizzle-orm";
import type { db as Db } from "@/server/db";
import { eventRegistrations } from "@/server/db/schema";
import { registrationSource } from "@/lib/events/registration-source";
import { sourceFromHeaders } from "./registration-source-token";

/** First registration owns attribution, including after cancellation. */
export async function resolveRegistrationAttribution(
  db: typeof Db,
  userId: string,
  eventId: number,
  headers: Headers,
  secret: string,
) {
  const [first] = await db
    .select({
      registrationSource: eventRegistrations.registrationSource,
      attributedAt: eventRegistrations.attributedAt,
    })
    .from(eventRegistrations)
    .where(
      and(
        eq(eventRegistrations.eventId, eventId),
        eq(eventRegistrations.userId, userId),
        ne(eventRegistrations.status, "intent"),
      ),
    )
    .orderBy(asc(eventRegistrations.registeredAt), asc(eventRegistrations.id))
    .limit(1);
  if (first)
    return {
      registrationSource: registrationSource(first.registrationSource),
      attributedAt: first.attributedAt,
    };
  const token = sourceFromHeaders(headers, eventId, secret);
  return {
    registrationSource: token?.source ?? ("direct_or_unknown" as const),
    attributedAt: token ? new Date(token.capturedAt) : null,
  };
}
