// Pure invariant for the Event<->Challenge binding (ADR-0029). A challenge is
// team-based / competitive EXACTLY when it is bound to a hackathon event, so
// binding is the discriminator. The binding is only legal when the event is a
// hackathon and the two share a communityId (so the Hub-wide / community-scoped
// distinction both inherit cannot be broken by binding across scopes).
//
// Kept db-free so it can be unit-tested without a database or Payload.

export class BindingError extends Error {}

export function assertBindable(
  event: { type: string; communityId: string | null | undefined },
  challenge: { communityId: string | null | undefined },
): void {
  if (event.type !== "hackathon") {
    throw new BindingError(
      "Only an event of type 'hackathon' can be bound to a challenge.",
    );
  }
  const eventCommunity = event.communityId ?? null;
  const challengeCommunity = challenge.communityId ?? null;
  if (eventCommunity !== challengeCommunity) {
    throw new BindingError(
      "Event and challenge must share the same communityId to bind.",
    );
  }
}
