import { describe, expect, it } from "vitest";
import type { CommunityCandidate } from "@/server/communities/discovery";
import {
  NEW_FOR_DAYS,
  ONLINE_PLACE,
  buildDirectory,
  directoryPlaces,
  isNewCommunity,
  matchesQuery,
  toPublicDirectoryCommunity,
  queryDirectory,
  sortDirectory,
  type DirectoryCommunity,
  type DirectoryEventRow,
  type JoinPolicy,
  directoryWants,
  distanceFrom,
} from "./directory";

const NOW = new Date("2026-10-01T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

function candidate(
  id: string,
  over: Partial<CommunityCandidate> = {},
): CommunityCandidate {
  return {
    communityId: id,
    slug: id,
    name: id,
    description: null,
    logoUrl: null,
    memberCount: 1,
    activeNow: 0,
    contributionCount: 0,
    contributionPrev: 0,
    newJoins: 0,
    ...over,
  };
}

function facts(
  entries: [string, { joinPolicy?: JoinPolicy; ageDays?: number }][],
) {
  return new Map(
    entries.map(([id, f]) => [
      id,
      {
        joinPolicy: f.joinPolicy ?? ("open" as const),
        createdAt: new Date(NOW.getTime() - (f.ageDays ?? 400) * DAY),
      },
    ]),
  );
}

function event(
  communityId: string,
  over: Partial<DirectoryEventRow> = {},
): DirectoryEventRow {
  return {
    communityId,
    slug: `${communityId}-meetup`,
    title: "Meetup",
    date: "2026-10-14T00:00:00.000Z",
    startTime: "19:00",
    timezone: "Europe/Amsterdam",
    city: "Amsterdam",
    online: false,
    point: null,
    hackathon: false,
    ...over,
  };
}

function community(
  id: string,
  over: Partial<DirectoryCommunity> = {},
): DirectoryCommunity {
  return {
    id,
    slug: id,
    name: id,
    description: null,
    logoUrl: null,
    joinPolicy: "open",
    createdAt: new Date(NOW.getTime() - 400 * DAY),
    memberCount: 1,
    activeRecently: 0,
    newJoins: 0,
    score: 0,
    isNew: false,
    openRooms: 0,
    nextEvent: null,
    places: [],
    wants: [],
    points: [],
    ...over,
  };
}

describe("isNewCommunity", () => {
  it("is new inside the window and not after it", () => {
    expect(isNewCommunity(new Date(NOW.getTime() - DAY), NOW)).toBe(true);
    expect(
      isNewCommunity(new Date(NOW.getTime() - NEW_FOR_DAYS * DAY), NOW),
    ).toBe(false);
  });
});

describe("buildDirectory", () => {
  it("carries the real join policy, activity, newness and open rooms", () => {
    const [c] = buildDirectory({
      candidates: [candidate("a", { activeNow: 3, newJoins: 2 })],
      facts: facts([["a", { joinPolicy: "approval_required", ageDays: 3 }]]),
      events: [],
      openRooms: new Map([["a", 2]]),
      now: NOW,
    });
    expect(c).toMatchObject({
      openRooms: 2,
      joinPolicy: "approval_required",
      activeRecently: 3,
      newJoins: 2,
      isNew: true,
      nextEvent: null,
      places: [],
    });
  });

  it("takes the first (soonest) event as next and collects every place", () => {
    const [c] = buildDirectory({
      candidates: [candidate("a")],
      facts: facts([["a", {}]]),
      events: [
        event("a", { slug: "first", city: "Utrecht" }),
        event("a", { slug: "second", city: null, online: true }),
        event("a", { slug: "third", city: "Utrecht" }),
        event("b", { slug: "other" }),
      ],
      now: NOW,
    });
    expect(c!.nextEvent?.slug).toBe("first");
    expect(c!.places).toEqual(["Utrecht", ONLINE_PLACE]);
  });

  it("drops a candidate whose row facts are missing", () => {
    const out = buildDirectory({
      candidates: [candidate("a"), candidate("gone")],
      facts: facts([["a", {}]]),
      events: [],
      now: NOW,
    });
    expect(out.map((c) => c.id)).toEqual(["a"]);
  });
});

describe("matchesQuery", () => {
  const c = community("x", {
    name: "xxx.AI",
    description: "An AI Community in Amsterdam",
  });
  it("matches the description as well as the name", () => {
    expect(matchesQuery(c, "amsterdam")).toBe(true);
    expect(matchesQuery(c, "XXX")).toBe(true);
    expect(matchesQuery(c, "rotterdam")).toBe(false);
  });
  it("ignores accents", () => {
    expect(matchesQuery(community("y", { name: "Café Agents" }), "cafe")).toBe(
      true,
    );
  });
});

describe("sortDirectory", () => {
  const a = community("a", {
    score: 1,
    memberCount: 9,
    createdAt: new Date(1),
  });
  const b = community("b", {
    score: 5,
    memberCount: 2,
    createdAt: new Date(3),
  });
  const c = community("c", {
    score: 3,
    memberCount: 4,
    createdAt: new Date(2),
  });
  it("orders by liveness, recency or size", () => {
    expect(sortDirectory([a, b, c], "active").map((x) => x.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
    expect(sortDirectory([a, b, c], "newest").map((x) => x.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
    expect(sortDirectory([a, b, c], "largest").map((x) => x.id)).toEqual([
      "a",
      "c",
      "b",
    ]);
  });
  it("breaks ties by id so pages never shuffle", () => {
    const x = community("x");
    const w = community("w");
    expect(sortDirectory([x, w], "active").map((y) => y.id)).toEqual([
      "w",
      "x",
    ]);
  });
});

describe("toPublicDirectoryCommunity", () => {
  it("keeps ranking internals and event internals on the server", () => {
    const out = toPublicDirectoryCommunity(
      community("a", {
        score: 9,
        newJoins: 4,
        places: ["Utrecht"],
        nextEvent: {
          slug: "s",
          title: "T",
          date: "2026-10-14",
          startTime: "19:00",
          timezone: "Europe/Amsterdam",
          city: "Utrecht",
          online: false,
        },
      }),
    );
    expect(Object.keys(out).sort()).toEqual(
      [
        "activeRecently",
        "description",
        "id",
        "isNew",
        "joinPolicy",
        "logoUrl",
        "memberCount",
        "name",
        "distanceKm",
        "nextEvent",
        "openRooms",
        "slug",
        "wants",
      ].sort(),
    );
    expect(out.nextEvent).toEqual({
      date: "2026-10-14",
      city: "Utrecht",
      online: false,
    });
  });

  it("drops a description that only repeats the name", () => {
    expect(
      toPublicDirectoryCommunity(
        community("a", {
          name: "Demo community",
          description: "demo community",
        }),
      ).description,
    ).toBeNull();
    expect(
      toPublicDirectoryCommunity(
        community("a", { name: "Demo", description: "  " }),
      ).description,
    ).toBeNull();
  });
});

describe("directoryPlaces", () => {
  it("counts each community once per place and keeps one stable spelling", () => {
    const places = directoryPlaces([
      community("a", { places: ["amsterdam", "Amsterdam"] }),
      community("b", { places: ["Amsterdam"] }),
    ]);
    expect(places).toEqual([{ key: "Amsterdam", communities: 2 }]);
  });

  it("counts communities per place, most first, online after cities on ties", () => {
    const places = directoryPlaces([
      community("a", { places: ["Amsterdam", ONLINE_PLACE] }),
      community("b", { places: ["amsterdam"] }),
      community("c", { places: ["Utrecht"] }),
    ]);
    expect(places).toEqual([
      { key: "Amsterdam", communities: 2 },
      { key: "Utrecht", communities: 1 },
      { key: ONLINE_PLACE, communities: 1 },
    ]);
  });
});

describe("queryDirectory", () => {
  const all = [
    community("a", { score: 3, places: ["Amsterdam"] }),
    community("b", { score: 2, description: "agents in Utrecht" }),
    community("c", { score: 1, places: ["Amsterdam"] }),
  ];

  it("pages with an offset cursor", () => {
    const first = queryDirectory(all, { sort: "active", limit: 2 });
    expect(first.items.map((c) => c.id)).toEqual(["a", "b"]);
    expect(first.nextCursor).toBe(2);
    expect(first.total).toBe(3);
    const second = queryDirectory(all, {
      sort: "active",
      limit: 2,
      cursor: first.nextCursor,
    });
    expect(second.items.map((c) => c.id)).toEqual(["c"]);
    expect(second.nextCursor).toBeNull();
  });

  it("filters by place and search together, but offers every place", () => {
    const out = queryDirectory(all, {
      sort: "active",
      limit: 10,
      place: "amsterdam",
      q: "c",
    });
    expect(out.items.map((c) => c.id)).toEqual(["c"]);
    expect(out.places).toEqual([{ key: "Amsterdam", communities: 2 }]);
  });
});

const AMSTERDAM = { lat: 52.37, lng: 4.9 };
const UTRECHT = { lat: 52.09, lng: 5.12 };
const ROTTERDAM = { lat: 51.92, lng: 4.48 };

describe("wants", () => {
  it("reads what a community really offers", () => {
    const [c] = buildDirectory({
      candidates: [candidate("a")],
      facts: facts([["a", {}]]),
      events: [
        event("a", { online: true, city: null }),
        event("a", { hackathon: true, online: true, city: null }),
      ],
      offerings: { learn: new Set(["a"]), work: new Set() },
      now: NOW,
    });
    // Online-only events are not "meet"; a hackathon is "build".
    expect(c!.wants).toEqual(["learn", "build"]);
  });

  it("counts meet from an in-person event and keeps its location", () => {
    const [c] = buildDirectory({
      candidates: [candidate("a")],
      facts: facts([["a", {}]]),
      events: [event("a", { point: UTRECHT })],
      now: NOW,
    });
    expect(c!.wants).toEqual(["meet"]);
    expect(c!.points).toEqual([UTRECHT]);
  });

  it("offers only wants some community has", () => {
    expect(
      directoryWants([
        community("a", { wants: ["meet", "work"] }),
        community("b", { wants: ["meet"] }),
      ]),
    ).toEqual([
      { key: "meet", communities: 2 },
      { key: "work", communities: 1 },
    ]);
  });

  it("filters by want", () => {
    const out = queryDirectory(
      [community("a", { wants: ["learn"] }), community("b")],
      { sort: "active", limit: 10, want: "learn" },
    );
    expect(out.items.map((c) => c.id)).toEqual(["a"]);
  });
});

describe("near", () => {
  it("measures to the nearest located event", () => {
    const c = community("a", { points: [ROTTERDAM, UTRECHT] });
    const km = distanceFrom(c, AMSTERDAM)!;
    expect(km).toBeGreaterThan(30);
    expect(km).toBeLessThan(45);
    expect(distanceFrom(community("b"), AMSTERDAM)).toBeNull();
  });

  it("puts the nearest first and unlocated communities last", () => {
    const out = queryDirectory(
      [
        community("far", { points: [ROTTERDAM], score: 1 }),
        community("none", { score: 99 }),
        community("close", { points: [UTRECHT] }),
      ],
      { sort: "near", origin: AMSTERDAM, limit: 10 },
    );
    expect(out.items.map((c) => c.id)).toEqual(["close", "far", "none"]);
    expect(out.items[0]!.distanceKm).toBeGreaterThan(0);
  });

  it("orders by activity when it does not know where the visitor is", () => {
    const out = queryDirectory(
      [
        community("quiet", { points: [UTRECHT], score: 1 }),
        community("busy", { score: 5 }),
      ],
      { sort: "near", limit: 10 },
    );
    expect(out.items.map((c) => c.id)).toEqual(["busy", "quiet"]);
    expect(out.items.every((c) => c.distanceKm === null)).toBe(true);
  });

  it("sends a coarse distance, never coordinates", () => {
    const pub = toPublicDirectoryCommunity({
      ...community("a", { points: [UTRECHT] }),
      distanceKm: 36.6,
    });
    expect(pub.distanceKm).toBe(37);
    expect(pub).not.toHaveProperty("points");
  });
});
