import { describe, expect, it } from "vitest";
import {
  MAX_QUIET_ROOMS,
  rankLiveRooms,
  squareRooms,
  talkingRoomIds,
  type LiveRoomRow,
  type QuietRoomRow,
} from "./live-rooms";

function row(id: string, over: Partial<LiveRoomRow> = {}): LiveRoomRow {
  return {
    spaceId: id,
    spaceSlug: id,
    spaceName: id,
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

function quiet(id: string, over: Partial<QuietRoomRow> = {}): QuietRoomRow {
  return {
    spaceId: id,
    spaceSlug: id,
    spaceName: id,
    purpose: null,
    communitySlug: "c",
    communityName: "C",
    members: 1,
    ...over,
  };
}

describe("squareRooms", () => {
  it("never lists a talking room as quiet, and keeps the SQL order", () => {
    const out = squareRooms(
      [row("talking")],
      [quiet("big", { members: 9 }), quiet("talking"), quiet("small")],
    );
    expect(out.talking.map((r) => r.spaceId)).toEqual(["talking"]);
    expect(out.quiet.map((r) => r.spaceId)).toEqual(["big", "small"]);
  });

  it("caps the quiet list", () => {
    const rooms = Array.from({ length: 12 }, (_, i) => quiet(`r${i}`));
    expect(squareRooms([], rooms).quiet).toHaveLength(MAX_QUIET_ROOMS);
  });

  it("sends only what the page shows", () => {
    const out = squareRooms(
      [],
      [{ ...quiet("a"), createdAt: new Date() } as QuietRoomRow],
    );
    expect(Object.keys(out.quiet[0]!).sort()).toEqual(
      [
        "communityName",
        "communitySlug",
        "members",
        "purpose",
        "spaceId",
        "spaceName",
        "spaceSlug",
      ].sort(),
    );
  });
});

describe("talkingRoomIds", () => {
  it("names the rooms where someone wrote", () => {
    expect(
      talkingRoomIds([row("a"), row("b", { people: 0, agents: 0 })]),
    ).toEqual(["a"]);
  });
});
