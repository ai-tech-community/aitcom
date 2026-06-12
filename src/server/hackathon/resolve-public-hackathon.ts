// Shared resolution for the public hackathon sub-pages (winners, gallery):
// public event lookup → bound challenge → phase markers → lifecycle phase.
// NOT pure (touches Payload + db) — kept out of the db-free hackathon modules'
// test surface. The helper never calls notFound()/redirect() itself: it returns
// a discriminated result and lets each page keep its own 404/redirect
// semantics (winners gates on "finalized", gallery only bounces "draft").

import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { teams } from "@/server/db/schema";
import { getPayloadClient } from "@/server/payload";
import { hackathonPhase, type HackathonPhase } from "@/server/hackathon/phase";
import type { Challenge, Event } from "@/payload-types";

// Same public-visibility filter as the event details page: hide un-approved
// submissions (pending/rejected) and drafts.
export async function findPublicEvent(
  slug: string,
  locale: "en" | "nl",
): Promise<Event | null> {
  const payload = await getPayloadClient();
  const { docs } = await payload.find({
    collection: "events",
    where: {
      and: [
        { slug: { equals: slug } },
        { status: { not_in: ["draft", "rejected"] } },
      ],
    },
    locale,
    limit: 1,
    depth: 0,
  });
  return docs[0] ?? null;
}

export type PublicHackathonResolution =
  | { found: false }
  | {
      found: true;
      event: Event;
      challenge: Challenge;
      challengeId: number;
      phase: HackathonPhase;
    };

/**
 * Resolves a public hackathon page request. `found: false` covers all
 * not-found cases (no public event, event without a bound challenge — i.e.
 * not a hackathon — or a dangling challenge reference); pages translate it
 * to notFound().
 */
export async function resolvePublicHackathonPage(
  slug: string,
  locale: "en" | "nl",
): Promise<PublicHackathonResolution> {
  const event = await findPublicEvent(slug, locale);
  // Not a hackathon (no bound challenge) → the sub-page does not exist.
  if (!event?.challengeId) return { found: false };

  const payload = await getPayloadClient();
  let challenge: Challenge;
  try {
    challenge = await payload.findByID({
      collection: "challenges",
      id: Number(event.challengeId),
      depth: 0,
    });
  } catch {
    return { found: false };
  }
  const challengeId = Number(challenge.id);

  // Lifecycle phase from server truth (the finalize markers stamped on
  // teams). Cancelled events collapse to "draft" inside hackathonPhase.
  const phaseMarkers = await db
    .select({
      status: teams.status,
      finalRank: teams.finalRank,
      prizeAwardedAt: teams.prizeAwardedAt,
    })
    .from(teams)
    .where(eq(teams.challengeId, challengeId));
  const phase = hackathonPhase({
    eventStatus: event.status,
    challengeStatus: challenge.status ?? "",
    teams: phaseMarkers,
  });

  return { found: true, event, challenge, challengeId, phase };
}
