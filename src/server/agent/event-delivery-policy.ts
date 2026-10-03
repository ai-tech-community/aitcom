/**
 * Which activity events reach an agent, and what each delivery carries.
 *
 * An agent receives only events its owner may read. Every deliverable action
 * is listed in {@link EVENT_DELIVERY_POLICY} with:
 *
 * - its **audience**: any agent whose owner may read the event's community
 *   (content visibility, ADR-0030), or only the agent of one named person
 *   (the event's recipient, its actor, or a user named in its metadata);
 * - for community audiences, **where the community comes from**: the row's
 *   `communityId` column, the event (Payload `events` doc) the row targets
 *   (event rows carry no reliable community column), or none for
 *   platform-wide content;
 * - the **metadata fields** a delivery carries. Every other key is dropped.
 *
 * Actions not listed are never delivered. A community that cannot be resolved
 * denies delivery; a resolved null community is legacy Hub content, readable
 * by everyone.
 *
 * Pure (no db). The batch lookups live in ./event-delivery-audience.
 */

/** Where a community-audience event's community comes from. */
export type CommunitySource =
  /** The row's own `communityId` column. */
  | { from: "column" }
  /**
   * The `events` doc named by `targetId`. Resolves only while that event is
   * publicly listed (published, cancelled or completed), so a pending event
   * never reaches readers through it.
   */
  | { from: "event-target" }
  /** Platform-wide content that belongs to no community: readable by all. */
  | { from: "platform-wide" };

export type DeliveryAudience =
  /** Any agent whose owner may read the event's community. */
  | { kind: "community-readers"; community: CommunitySource }
  /** Only the agent of the user in `recipientId`. */
  | { kind: "recipient" }
  /** Only the agent(s) of the human behind the actor. */
  | { kind: "actor" }
  /** Only the agent of the user named in `metadata[metadataKey]`. */
  | { kind: "named-user"; metadataKey: string };

export interface DeliveryRule {
  audience: DeliveryAudience;
  /** Metadata keys a delivery carries. Every other key is dropped. */
  fields: readonly string[];
}

const COLUMN: CommunitySource = { from: "column" };
const EVENT_TARGET: CommunitySource = { from: "event-target" };
const PLATFORM_WIDE: CommunitySource = { from: "platform-wide" };

function readers(community: CommunitySource, fields: readonly string[]) {
  return {
    audience: { kind: "community-readers", community },
    fields,
  } satisfies DeliveryRule;
}

function actorOnly(fields: readonly string[]) {
  return { audience: { kind: "actor" }, fields } satisfies DeliveryRule;
}

export const EVENT_DELIVERY_POLICY: Readonly<Record<string, DeliveryRule>> = {
  // ── Forum ────────────────────────────────────────────────────────────────
  "thread.create": readers(COLUMN, ["title", "category", "slug"]),
  // Carries the thread author as recipientId for the activation funnel, but a
  // reply is readable by everyone who may read the thread.
  "thread.reply": readers(COLUMN, ["threadTitle", "threadSlug", "title"]),

  // ── Community ideas ──────────────────────────────────────────────────────
  "idea.submitted": readers(COLUMN, ["title"]),
  "idea.voted": readers(COLUMN, ["title"]),

  // ── Challenges ───────────────────────────────────────────────────────────
  // The race (who joined, objectives done, finishers) is readable where the
  // challenge is (ADR-0030); the work and its review stay with the people in it.
  "challenge.enrolled": readers(COLUMN, ["title", "collaborationModel"]),
  "challenge.objective_completed": readers(COLUMN, [
    "title",
    "objectiveIndex",
    "collaborationModel",
  ]),
  "challenge.completed": readers(COLUMN, ["title", "collaborationModel"]),
  "challenge.abandoned": actorOnly([
    "title",
    "completedObjectives",
    "totalObjectives",
  ]),
  "challenge.solution_submitted": actorOnly(["title"]),
  "challenge.solution_approved": {
    audience: { kind: "named-user", metadataKey: "participantUserId" },
    fields: ["objectiveIndex", "collaborationModel"],
  },
  "challenge.solution_rejected": {
    audience: { kind: "named-user", metadataKey: "participantUserId" },
    fields: ["objectiveIndex", "collaborationModel"],
  },
  // Proposed and sponsor-created challenges start as drafts.
  "challenge.proposed": actorOnly(["title", "collaborationModel"]),
  "challenge.created": actorOnly(["title", "collaborationModel"]),
  // Challenge channels are for enrolled participants.
  "challenge.channel_post": actorOnly(["title", "threadType"]),

  // ── Inbox ────────────────────────────────────────────────────────────────
  "message.sent": { audience: { kind: "recipient" }, fields: [] },

  // ── Articles (platform-wide, not community-scoped) ───────────────────────
  "article.published": readers(PLATFORM_WIDE, ["title", "type"]),
  // Review outcomes go to the author; publishing is announced separately.
  "article.approved": actorOnly(["title", "type"]),
  "article.submitted": actorOnly(["title", "type"]),
  "article.changes_requested": actorOnly(["title", "reviewNote"]),
  "article.rejected": actorOnly(["title", "reviewNote"]),

  // ── Events ───────────────────────────────────────────────────────────────
  "event.create": readers(EVENT_TARGET, ["title", "communitySlug"]),
  "event.approve": readers(EVENT_TARGET, ["communitySlug"]),
  "event.update": readers(EVENT_TARGET, ["title", "communitySlug"]),
  "event.cancel": readers(EVENT_TARGET, ["communitySlug"]),
  // Attendee lists are organizer-only (ADR-0038).
  "event.register": actorOnly(["eventTitle"]),
  "event.intent": actorOnly(["eventTitle"]),
  // Submissions are pending until a community admin reviews them.
  "event.submit": actorOnly(["title", "communitySlug"]),
  "event.resubmit": actorOnly(["communitySlug"]),
  "event.reject": actorOnly(["communitySlug"]),
  "event.organizer_change": {
    audience: { kind: "named-user", metadataKey: "to" },
    fields: ["eventTitle"],
  },

  // ── Benchmark ────────────────────────────────────────────────────────────
  "benchmark.run.created": actorOnly([
    "promptId",
    "modelSurface",
    "modelProvider",
    "modelId",
    "assignmentId",
  ]),
};

/** The rule for an action, or null when the action is never delivered. */
export function deliveryRuleFor(action: string): DeliveryRule | null {
  return Object.hasOwn(EVENT_DELIVERY_POLICY, action)
    ? EVENT_DELIVERY_POLICY[action]!
    : null;
}

/**
 * The metadata a delivery of this event carries: only the action's listed
 * fields. Empty for an action that is never delivered.
 */
export function deliverableMetadata(
  action: string,
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const rule = deliveryRuleFor(action);
  const out: Record<string, unknown> = {};
  if (!rule || !metadata) return out;
  for (const key of rule.fields) {
    if (Object.hasOwn(metadata, key) && metadata[key] !== undefined) {
      out[key] = metadata[key];
    }
  }
  return out;
}

/** The parts of an activity event the audience decision reads. */
export interface AudienceEvent {
  action: string;
  actorId: string;
  recipientId: string | null;
  metadata: Record<string, unknown> | null;
}

/** What the batch lookups found out about one event. */
export interface EventFacts {
  /**
   * The event's community: an id, null for legacy Hub content, or undefined
   * when it could not be resolved (delivery is denied).
   */
  communityId: string | null | undefined;
  /** The human behind the actor: the member, or the acting agent's owner. */
  actorOwnerId: string | null;
}

/**
 * Whether the agent of `ownerId` may receive this event. `hiddenCommunityIds`
 * are the communities whose content that owner may not read
 * (`hiddenContentCommunityIds`).
 */
export function audienceAdmits(
  event: AudienceEvent,
  facts: EventFacts,
  ownerId: string,
  hiddenCommunityIds: ReadonlySet<string>,
): boolean {
  const rule = deliveryRuleFor(event.action);
  if (!rule) return false;
  const audience = rule.audience;
  switch (audience.kind) {
    case "community-readers":
      if (facts.communityId === undefined) return false;
      if (facts.communityId === null) return true;
      return !hiddenCommunityIds.has(facts.communityId);
    case "recipient":
      return event.recipientId !== null && event.recipientId === ownerId;
    case "actor":
      return (
        event.actorId === ownerId ||
        (facts.actorOwnerId !== null && facts.actorOwnerId === ownerId)
      );
    case "named-user": {
      const named = event.metadata?.[audience.metadataKey];
      return typeof named === "string" && named === ownerId;
    }
  }
}
