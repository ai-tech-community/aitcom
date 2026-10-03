import { describe, expect, it } from "vitest";

import { CATEGORY_PREFIXES } from "./deliver-event";
import {
  type AudienceEvent,
  type EventFacts,
  EVENT_DELIVERY_POLICY,
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
  return { communityId: "c-listed", actorOwnerId: null, ...p };
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
