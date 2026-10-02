// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { loadMyEventPairs, type EventFinder } from "./my-event-pairs";

type Db = Parameters<typeof loadMyEventPairs>[0]["db"];

function dbReturning(rows: unknown[]): Db {
  const where = vi.fn(async () => rows);
  return {
    select: () => ({ from: () => ({ where }) }),
  } as unknown as Db;
}

describe("loadMyEventPairs (My events tab and Next up)", () => {
  it("asks Payload only for events a member can open and that still happen", async () => {
    const find = vi.fn(async () => ({
      docs: [{ id: 11, title: "Kept" }],
    }));
    const pairs = await loadMyEventPairs(
      {
        db: dbReturning([
          { id: "r1", eventId: 11, status: "registered" },
          { id: "r2", eventId: 12, status: "registered" },
        ]),
        getPayload: async () => ({ find }) as unknown as EventFinder,
      },
      { userId: "u1", locale: "en" },
    );

    expect(find).toHaveBeenCalledWith({
      collection: "events",
      where: {
        and: [
          { id: { in: [11, 12] } },
          { status: { not_in: ["draft", "rejected", "cancelled"] } },
        ],
      },
      locale: "en",
      limit: 2,
      depth: 0,
    });
    // Event 12 was filtered out by Payload, so its registration is dropped.
    expect(pairs.map((p) => p.registration.id)).toEqual(["r1"]);
  });
});
