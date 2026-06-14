// The published hackathon Event bound to a challenge, or null. Centralizes the
// "which event statuses count" invariant (excludes draft/rejected/cancelled) that
// gates registration/submission/judging decisions share. NOTE: this is the
// stricter query — `currentHackathonPhase` deliberately uses a looser one.
import { getPayloadClient } from "@/server/payload";

export async function boundHackathonEvent(challengeId: number | string) {
  const payload = await getPayloadClient();
  const { docs } = await payload.find({
    collection: "events",
    where: {
      and: [
        { challengeId: { equals: String(challengeId) } },
        { type: { equals: "hackathon" } },
        { status: { not_in: ["draft", "rejected", "cancelled"] } },
      ],
    },
    limit: 1,
    depth: 0,
  });
  return docs[0] ?? null;
}
