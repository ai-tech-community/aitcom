import { describe, expect, it, vi } from "vitest";
import type { Payload } from "payload";

import { resolveExcludeEventId } from "./exclude-ownership";

type Db = Parameters<typeof resolveExcludeEventId>[1];

function mockPayload(event: Record<string, unknown> | null | Error): {
  payload: Payload;
  findByID: ReturnType<typeof vi.fn>;
} {
  const findByID = vi.fn().mockImplementation(async () => {
    if (event instanceof Error) throw event;
    if (event === null) return null;
    return event;
  });
  return { payload: { findByID } as unknown as Payload, findByID };
}

function mockDb(membership: { status: string; role: string } | null): {
  db: Db;
  findFirst: ReturnType<typeof vi.fn>;
} {
  const findFirst = vi.fn().mockResolvedValue(membership ?? undefined);
  return {
    db: { query: { communityMemberships: { findFirst } } } as unknown as Db,
    findFirst,
  };
}

const session = { user: { id: "user-1" } };

describe("resolveExcludeEventId", () => {
  it("resolves to undefined when excludeEventId is not provided", async () => {
    const { payload, findByID } = mockPayload(null);
    const { db } = mockDb(null);

    const result = await resolveExcludeEventId(payload, db, session, undefined);

    expect(result).toBeUndefined();
    expect(findByID).not.toHaveBeenCalled();
  });

  it("ignores a nonexistent event id when findByID throws NotFound", async () => {
    const { payload } = mockPayload(new Error("NotFound"));
    const { db, findFirst } = mockDb(null);

    const result = await resolveExcludeEventId(payload, db, session, 999);

    expect(result).toBeUndefined();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("ignores a nonexistent event id when findByID resolves to a falsy value", async () => {
    const { payload } = mockPayload(null);
    const { db } = mockDb(null);

    const result = await resolveExcludeEventId(payload, db, session, 999);

    expect(result).toBeUndefined();
  });

  it("honors excludeEventId when the caller is the event's submittedBy (owner)", async () => {
    const { payload } = mockPayload({
      id: 42,
      submittedBy: "user-1",
      communityId: "community-1",
    });
    const { db, findFirst } = mockDb(null);

    const result = await resolveExcludeEventId(payload, db, session, 42);

    expect(result).toBe(42);
    // Owner is decided from submittedBy alone — no membership lookup needed.
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("ignores excludeEventId for a non-owner with no community role", async () => {
    const { payload } = mockPayload({
      id: 42,
      submittedBy: "someone-else",
      communityId: "community-1",
    });
    const { db } = mockDb(null);

    const result = await resolveExcludeEventId(payload, db, session, 42);

    expect(result).toBeUndefined();
  });

  it("honors excludeEventId when the caller is an active owner of the event's community", async () => {
    const { payload } = mockPayload({
      id: 42,
      submittedBy: "someone-else",
      communityId: "community-1",
    });
    const { db } = mockDb({ status: "active", role: "owner" });

    const result = await resolveExcludeEventId(payload, db, session, 42);

    expect(result).toBe(42);
  });

  it("honors excludeEventId when the caller is an active admin of the event's community", async () => {
    const { payload } = mockPayload({
      id: 42,
      submittedBy: "someone-else",
      communityId: "community-1",
    });
    const { db } = mockDb({ status: "active", role: "admin" });

    const result = await resolveExcludeEventId(payload, db, session, 42);

    expect(result).toBe(42);
  });

  it("ignores excludeEventId when the caller is only a moderator of the event's community", async () => {
    const { payload } = mockPayload({
      id: 42,
      submittedBy: "someone-else",
      communityId: "community-1",
    });
    const { db } = mockDb({ status: "active", role: "moderator" });

    const result = await resolveExcludeEventId(payload, db, session, 42);

    expect(result).toBeUndefined();
  });

  it("ignores excludeEventId when the caller's admin membership is not active", async () => {
    const { payload } = mockPayload({
      id: 42,
      submittedBy: "someone-else",
      communityId: "community-1",
    });
    const { db } = mockDb({ status: "pending_approval", role: "admin" });

    const result = await resolveExcludeEventId(payload, db, session, 42);

    expect(result).toBeUndefined();
  });

  it("ignores excludeEventId when the event has no communityId and the caller isn't the submitter", async () => {
    const { payload } = mockPayload({
      id: 42,
      submittedBy: "someone-else",
      communityId: null,
    });
    const { db, findFirst } = mockDb(null);

    const result = await resolveExcludeEventId(payload, db, session, 42);

    expect(result).toBeUndefined();
    expect(findFirst).not.toHaveBeenCalled();
  });
});
