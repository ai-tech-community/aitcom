import { describe, expect, it } from "vitest";

import { CATEGORY_PREFIXES } from "./deliver-event";
import {
  type AudienceEvent,
  type EventFacts,
  EVENT_DELIVERY_POLICY,
  actorAlwaysReceives,
  audienceAdmits,
  deliverableMetadata,
  deliveryRuleFor,
} from "./event-delivery-policy";

const OWNER = "owner1";
const NO_HIDDEN: ReadonlySet<string> = new Set();

function evt(p: Partial<AudienceEvent> = {}): AudienceEvent {
  return {
    action: "thread.create",
    actorId: "someone",
    recipientId: null,
    metadata: null,
    ...p,
  };
}

function facts(p: Partial<EventFacts> = {}): EventFacts {
  return {
    communityId: "c-listed",
    actorOwnerId: null,
    actorIsPublic: true,
    ...p,
  };
}

describe("EVENT_DELIVERY_POLICY table", () => {
  const entries = Object.entries(EVENT_DELIVERY_POLICY);

  it.each(entries)("%s has an audience, a field list and a source", (_, r) => {
    expect(["community-readers", "recipient", "actor", "named-user"]).toContain(
      r.audience.kind,
    );
    expect(Array.isArray(r.fields)).toBe(true);
    expect(new Set(r.fields).size).toBe(r.fields.length);
    if (r.audience.kind === "community-readers") {
      expect(["column", "event-target", "platform-wide"]).toContain(
        r.audience.community.from,
      );
    }
    if (r.audience.kind === "named-user") {
      expect(r.audience.metadataKey).toBeTruthy();
    }
  });

  it("lists only actions some webhook category can subscribe to", () => {
    const prefixes = Object.values(CATEGORY_PREFIXES).flat();
    for (const action of Object.keys(EVENT_DELIVERY_POLICY)) {
      expect(prefixes.some((p) => action.startsWith(p))).toBe(true);
    }
  });

  it("keeps person-private actions away from community audiences", () => {
    for (const action of [
      "event.register",
      "event.intent",
      "message.sent",
      "challenge.solution_approved",
      "challenge.solution_rejected",
      "article.changes_requested",
      "article.rejected",
      "benchmark.run.created",
    ]) {
      expect(deliveryRuleFor(action)?.audience.kind).not.toBe(
        "community-readers",
      );
    }
  });
});

describe("challenge race events", () => {
  it.each([
    "challenge.enrolled",
    "challenge.objective_completed",
    "challenge.completed",
  ])("%s reaches community readers only for a public actor", (action) => {
    expect(deliveryRuleFor(action)?.audience).toEqual({
      kind: "community-readers",
      community: { from: "column" },
      actorMustBePublic: true,
    });
  });

  it("keeps forum activity open to community readers regardless of profile", () => {
    const audience = deliveryRuleFor("thread.create")?.audience;
    expect(audience?.kind).toBe("community-readers");
    expect(
      audience?.kind === "community-readers" && audience.actorMustBePublic,
    ).toBeFalsy();
  });
});

describe("person-scoped rules", () => {
  it("sends an idea vote only to the voter's own agents", () => {
    const vote = evt({ action: "idea.voted", actorId: "voter" });
    expect(deliveryRuleFor("idea.voted")?.audience.kind).toBe("actor");
    expect(audienceAdmits(vote, facts(), OWNER, NO_HIDDEN)).toBe(false);
    expect(audienceAdmits(vote, facts(), "voter", NO_HIDDEN)).toBe(true);
  });

  it("sends an event rejection to the submitter and the reviewer", () => {
    const reject = (metadata: Record<string, unknown> | null) =>
      evt({ action: "event.reject", actorId: "reviewer", metadata });
    const withSubmitter = reject({ submittedBy: "submitter" });
    expect(audienceAdmits(withSubmitter, facts(), "submitter", NO_HIDDEN)).toBe(
      true,
    );
    expect(audienceAdmits(withSubmitter, facts(), "reviewer", NO_HIDDEN)).toBe(
      true,
    );
    expect(audienceAdmits(withSubmitter, facts(), OWNER, NO_HIDDEN)).toBe(
      false,
    );
    // Rows written before the submitter was recorded reach no one else.
    expect(audienceAdmits(reject(null), facts(), OWNER, NO_HIDDEN)).toBe(false);
    expect(audienceAdmits(reject(null), facts(), "reviewer", NO_HIDDEN)).toBe(
      true,
    );
  });

  it("does not deliver the submitter id itself", () => {
    expect(
      deliverableMetadata("event.reject", {
        communitySlug: "c",
        submittedBy: "submitter",
      }),
    ).toEqual({ communitySlug: "c" });
  });
});

describe("actorAlwaysReceives", () => {
  it("holds for community readers, actor rules and opted-in named users", () => {
    expect(
      actorAlwaysReceives({
        kind: "community-readers",
        community: { from: "column" },
      }),
    ).toBe(true);
    expect(actorAlwaysReceives({ kind: "actor" })).toBe(true);
    expect(
      actorAlwaysReceives({
        kind: "named-user",
        metadataKey: "k",
        alsoActor: true,
      }),
    ).toBe(true);
    expect(actorAlwaysReceives({ kind: "named-user", metadataKey: "k" })).toBe(
      false,
    );
    expect(actorAlwaysReceives({ kind: "recipient" })).toBe(false);
  });
});

describe("deliveryRuleFor", () => {
  it("returns null for an action that is not listed", () => {
    expect(deliveryRuleFor("community.ban")).toBeNull();
    expect(deliveryRuleFor("thread.created")).toBeNull();
    expect(deliveryRuleFor("toString")).toBeNull();
    expect(deliveryRuleFor("__proto__")).toBeNull();
  });
});

describe("deliverableMetadata", () => {
  it("keeps only the action's listed fields", () => {
    expect(
      deliverableMetadata("thread.create", {
        title: "T",
        category: "general",
        slug: "t",
        ritualId: 7,
        secret: "x",
      }),
    ).toEqual({ title: "T", category: "general", slug: "t" });
  });

  it("drops everything for an action with no fields", () => {
    expect(deliverableMetadata("message.sent", { body: "hi" })).toEqual({});
  });

  it("drops everything for an action that is not listed", () => {
    expect(deliverableMetadata("community.ban", { reason: "x" })).toEqual({});
  });

  it("returns an empty object for missing metadata", () => {
    expect(deliverableMetadata("thread.create", null)).toEqual({});
  });
});

describe("audienceAdmits", () => {
  it("denies an action that is not listed", () => {
    expect(
      audienceAdmits(
        evt({ action: "community.ban" }),
        facts(),
        OWNER,
        NO_HIDDEN,
      ),
    ).toBe(false);
  });

  describe("community readers", () => {
    it("admits an owner who may read the community", () => {
      expect(audienceAdmits(evt(), facts(), OWNER, NO_HIDDEN)).toBe(true);
    });
    it("denies an owner for whom the community is hidden", () => {
      expect(
        audienceAdmits(
          evt(),
          facts({ communityId: "c-unlisted" }),
          OWNER,
          new Set(["c-unlisted"]),
        ),
      ).toBe(false);
    });
    it("admits legacy Hub content (null community)", () => {
      expect(
        audienceAdmits(
          evt(),
          facts({ communityId: null }),
          OWNER,
          new Set(["c-unlisted"]),
        ),
      ).toBe(true);
    });
    it("denies when the community could not be resolved", () => {
      expect(
        audienceAdmits(
          evt(),
          facts({ communityId: undefined }),
          OWNER,
          NO_HIDDEN,
        ),
      ).toBe(false);
    });
    it("admits a reply to anyone who may read it, not only the thread author", () => {
      expect(
        audienceAdmits(
          evt({ action: "thread.reply", recipientId: "author" }),
          facts(),
          OWNER,
          NO_HIDDEN,
        ),
      ).toBe(true);
    });
  });

  describe("community readers of a public actor", () => {
    const completed = { action: "challenge.completed", actorId: "racer" };
    it("admits a co-reader when the actor is public", () => {
      expect(audienceAdmits(evt(completed), facts(), OWNER, NO_HIDDEN)).toBe(
        true,
      );
    });
    it("admits only the actor's own agents when the actor is private", () => {
      const priv = facts({ actorIsPublic: false });
      expect(audienceAdmits(evt(completed), priv, OWNER, NO_HIDDEN)).toBe(
        false,
      );
      expect(audienceAdmits(evt(completed), priv, "racer", NO_HIDDEN)).toBe(
        true,
      );
      expect(
        audienceAdmits(
          evt({ ...completed, actorId: "agent-r" }),
          facts({ actorIsPublic: false, actorOwnerId: OWNER }),
          OWNER,
          NO_HIDDEN,
        ),
      ).toBe(true);
    });
    it("keeps a public actor's own event where their owner cannot read the community", () => {
      expect(
        audienceAdmits(
          evt(completed),
          facts({ communityId: "c-unlisted" }),
          "racer",
          new Set(["c-unlisted"]),
        ),
      ).toBe(true);
    });
    it("still denies a public actor's event in a hidden community", () => {
      expect(
        audienceAdmits(
          evt(completed),
          facts({ communityId: "c-unlisted" }),
          OWNER,
          new Set(["c-unlisted"]),
        ),
      ).toBe(false);
    });
  });

  describe("recipient", () => {
    const msg = { action: "message.sent" };
    it("admits only the recipient's agent", () => {
      expect(
        audienceAdmits(
          evt({ ...msg, recipientId: OWNER }),
          facts(),
          OWNER,
          NO_HIDDEN,
        ),
      ).toBe(true);
      expect(
        audienceAdmits(
          evt({ ...msg, recipientId: "other" }),
          facts(),
          OWNER,
          NO_HIDDEN,
        ),
      ).toBe(false);
    });
    it("denies when there is no recipient", () => {
      expect(
        audienceAdmits(
          evt({ ...msg, recipientId: null }),
          facts(),
          OWNER,
          NO_HIDDEN,
        ),
      ).toBe(false);
    });
  });

  describe("actor", () => {
    const reg = { action: "event.register" };
    it("admits the acting member's own agent", () => {
      expect(
        audienceAdmits(
          evt({ ...reg, actorId: OWNER }),
          facts(),
          OWNER,
          NO_HIDDEN,
        ),
      ).toBe(true);
    });
    it("admits the agents of an acting agent's owner", () => {
      expect(
        audienceAdmits(
          evt({ action: "challenge.abandoned", actorId: "agent-x" }),
          facts({ actorOwnerId: OWNER }),
          OWNER,
          NO_HIDDEN,
        ),
      ).toBe(true);
    });
    it("denies everyone else, even in a readable community", () => {
      expect(
        audienceAdmits(
          evt({ ...reg, actorId: "other" }),
          facts(),
          OWNER,
          NO_HIDDEN,
        ),
      ).toBe(false);
    });
  });

  describe("named user", () => {
    const approved = { action: "challenge.solution_approved" };
    it("admits only the user named in the metadata", () => {
      expect(
        audienceAdmits(
          evt({ ...approved, metadata: { participantUserId: OWNER } }),
          facts(),
          OWNER,
          NO_HIDDEN,
        ),
      ).toBe(true);
      expect(
        audienceAdmits(
          evt({
            ...approved,
            actorId: OWNER,
            metadata: { participantUserId: "p" },
          }),
          facts(),
          OWNER,
          NO_HIDDEN,
        ),
      ).toBe(false);
    });
    it("denies when the metadata names no one", () => {
      expect(
        audienceAdmits(
          evt({ ...approved, metadata: null }),
          facts(),
          OWNER,
          NO_HIDDEN,
        ),
      ).toBe(false);
    });
  });
});
