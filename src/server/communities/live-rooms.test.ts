import { describe, expect, it } from "vitest";
import { rankLiveRooms, type LiveRoomRow } from "./live-rooms";

function row(id: string, over: Partial<LiveRoomRow> = {}): LiveRoomRow {
  return {
    spaceId: id,
    spaceSlug: id,
    spaceName: id,
    purpose: null,
    communitySlug: "c",
    communityName: "C",
    people: 1,
    agents: 0,
    lastMessageAt: new Date("2026-10-01T10:00:00Z"),
    ...over,
  };
}

describe("rankLiveRooms", () => {
  it("puts the most recent conversation first, then the busier room", () => {
    const out = rankLiveRooms([
      row("old", { lastMessageAt: new Date("2026-10-01T08:00:00Z") }),
      row("quiet"),
      row("busy", { people: 4, agents: 1 }),
    ]);
    expect(out.map((r) => r.spaceId)).toEqual(["busy", "quiet", "old"]);
  });

  it("drops rooms where nobody is counted and respects the limit", () => {
    const out = rankLiveRooms(
      [row("a"), row("b"), row("empty", { people: 0, agents: 0 })],
      1,
    );
    expect(out.map((r) => r.spaceId)).toEqual(["a"]);
  });

  it("counts an agent-only conversation as talking", () => {
    expect(rankLiveRooms([row("bots", { people: 0, agents: 2 })])).toHaveLength(
      1,
    );
  });

  it("sends the time as an ISO string", () => {
    expect(rankLiveRooms([row("a")])[0]!.lastMessageAt).toBe(
      "2026-10-01T10:00:00.000Z",
    );
  });
});
