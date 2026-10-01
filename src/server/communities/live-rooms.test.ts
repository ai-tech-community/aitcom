import { describe, expect, it } from "vitest";
import {
  rankLiveRooms,
  squareRooms,
  type LiveRoomRow,
  type PublicRoomRow,
} from "./live-rooms";

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

function room(id: string, over: Partial<PublicRoomRow> = {}): PublicRoomRow {
  return {
    spaceId: id,
    spaceSlug: id,
    spaceName: id,
    purpose: null,
    communitySlug: "c",
    communityName: "C",
    members: 1,
    createdAt: new Date("2026-09-01T00:00:00Z"),
    ...over,
  };
}

describe("squareRooms", () => {
  it("lists talking rooms once, and the rest as quiet, biggest first", () => {
    const out = squareRooms(
      [
        room("talking"),
        room("small", { members: 1 }),
        room("big", { members: 9 }),
      ],
      [row("talking")],
    );
    expect(out.talking.map((r) => r.spaceId)).toEqual(["talking"]);
    expect(out.quiet.map((r) => r.spaceId)).toEqual(["big", "small"]);
    expect(out.quietTotal).toBe(2);
  });

  it("caps the quiet list but counts every quiet room", () => {
    const rooms = Array.from({ length: 5 }, (_, i) => room(`r${i}`));
    const out = squareRooms(rooms, [], { quiet: 2 });
    expect(out.quiet).toHaveLength(2);
    expect(out.quietTotal).toBe(5);
  });

  it("keeps internal timestamps of quiet rooms on the server", () => {
    const out = squareRooms([room("a")], []);
    expect(out.quiet[0]).not.toHaveProperty("createdAt");
  });
});
