import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  rows: [] as unknown[][],
  writes: [] as Record<string, unknown>[],
}));
vi.mock("@/server/db", () => {
  const query = (result: () => unknown) => {
    const chain: Record<string, unknown> = {};
    for (const key of [
      "from",
      "where",
      "for",
      "limit",
      "innerJoin",
      "leftJoin",
      "orderBy",
      "returning",
      "onConflictDoNothing",
    ])
      chain[key] = () => chain;
    chain.then = (resolve: (v: unknown) => void) => resolve(result());
    return chain;
  };
  const db = {
    select: () => query(() => state.rows.shift() ?? []),
    insert: () => ({ values: () => query(() => []) }),
    update: () => ({
      set: (v: Record<string, unknown>) =>
        query(() => {
          state.writes.push(v);
          return state.rows.shift() ?? [];
        }),
    }),
  };
  return {
    db: {
      ...db,
      transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
    },
  };
});
import { db } from "@/server/db";
import {
  reserveStoryline,
  releaseStorylineReservation,
  lockSubmissionReservation,
  listStorylineResearch,
  readStorylineCoverage,
} from "./storyline-reservations";
const now = new Date("2026-10-13T10:00:00Z");
const identity = { agentId: "a1", ownerId: "o1" };
const topic = { topicKey: "local-ai", title: "Local AI" };
const row = (patch = {}) => ({
  id: "r1",
  ...topic,
  ...identity,
  expiresAt: new Date(now.getTime() + 3600000),
  releasedAt: null,
  draftId: null,
  ...patch,
});
beforeEach(() => {
  state.rows = [];
  state.writes = [];
});
it("keeps another agent's live topic unavailable without leaking the token", async () => {
  state.rows = [[{ id: "a2" }], [row()], []];
  const result = await reserveStoryline(
    { agentId: "a2", ownerId: "o2" },
    topic,
    now,
  );
  expect(result).toMatchObject({ state: "researching", reservationId: null });
  expect(state.writes).toEqual([]);
});
it("reuses an owner's live lease without extending expiry", async () => {
  state.rows = [[{ id: "a1" }], [row()], []];
  expect(await reserveStoryline(identity, topic, now)).toMatchObject({
    reservationId: "r1",
    expiresAt: row().expiresAt,
  });
  expect(state.writes).toEqual([]);
});
it("reclaims expired research for 24 hours and enforces the per-agent cap", async () => {
  state.rows = [[{ id: "a2" }], [row({ expiresAt: now })], [], [], []];
  const result = await reserveStoryline(
    { agentId: "a2", ownerId: "o2" },
    topic,
    now,
  );
  expect(result).toMatchObject({
    reservationId: "r1",
    expiresAt: new Date("2026-10-14T10:00:00Z"),
  });
  expect(state.writes[0]).toMatchObject({
    agentId: "a2",
    ownerId: "o2",
    releasedAt: null,
    draftId: null,
  });
  state.writes = [];
  state.rows = [
    [{ id: "a1" }],
    [row({ expiresAt: now })],
    [],
    [],
    [{ id: "x" }, { id: "y" }, { id: "z" }],
  ];
  await expect(reserveStoryline(identity, topic, now)).rejects.toMatchObject({
    code: "TOO_MANY_REQUESTS",
  });
  expect(state.writes).toEqual([]);
});
it("returns shared published coverage or pending review rather than claiming again", async () => {
  state.rows = [
    [{ id: "a1" }],
    [row()],
    [{ slug: "local-ai", readable: true }],
  ];
  expect(await reserveStoryline(identity, topic, now)).toMatchObject({
    state: "published",
    slug: "local-ai",
    reservationId: null,
  });
  state.rows = [
    [{ id: "a1" }],
    [row({ draftId: "d1", expiresAt: now })],
    [],
    [{ status: "pending" }],
  ];
  expect(await reserveStoryline(identity, topic, now)).toMatchObject({
    state: "awaiting_editors",
    reservationId: null,
  });
  expect(state.writes).toEqual([]);
});
it("reclaims dismissed proposals even before their original lease expires", async () => {
  state.rows = [
    [{ id: "a1" }],
    [row({ draftId: "d1" })],
    [],
    [{ status: "rejected" }],
    [],
    [],
  ];
  expect(await reserveStoryline(identity, topic, now)).toMatchObject({
    reservationId: "r1",
  });
  expect(state.writes[0]).toMatchObject({ draftId: null });
});
it("rejects forged owner, topic, released or expired submission reservations", async () => {
  await db.transaction(async (tx) => {
    for (const patch of [
      { ownerId: "other" },
      { agentId: "other" },
      { topicKey: "other" },
      { releasedAt: now },
      { expiresAt: now },
    ]) {
      state.rows = [[row(patch)]];
      await expect(
        lockSubmissionReservation(tx, identity, "r1", "local-ai", now),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    }
    state.rows = [[row()], []];
    expect(
      (await lockSubmissionReservation(tx, identity, "r1", "local-ai", now))
        .draftId,
    ).toBeNull();
  });
});
it("reuses a successfully submitted lease after expiry but refuses rejected drafts", async () => {
  await db.transaction(async (tx) => {
    state.rows = [
      [row({ draftId: "d1", expiresAt: now })],
      [{ status: "pending" }],
    ];
    expect(
      (await lockSubmissionReservation(tx, identity, "r1", "local-ai", now))
        .draftId,
    ).toBe("d1");
    state.rows = [[row({ draftId: "d1" })], [{ status: "rejected" }]];
    await expect(
      lockSubmissionReservation(tx, identity, "r1", "local-ai", now),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
it("rejects inactive ownership and releasing another agent's reservation", async () => {
  state.rows = [[]];
  await expect(reserveStoryline(identity, topic, now)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  state.rows = [[{ id: "a1" }], []];
  await expect(
    releaseStorylineReservation(identity, "other"),
  ).rejects.toMatchObject({ code: "CONFLICT" });
});
it("exposes only privacy-safe board state, hiding ghost identity and draft tokens", async () => {
  state.rows = [
    [
      {
        ...row(),
        draftStatus: "pending",
        agentName: "Secret",
        visibility: "ghost",
        storyStatus: null,
        slug: null,
        metadata: { private: "secret" },
      },
    ],
  ];
  expect(await listStorylineResearch()).toEqual([
    {
      title: "Local AI",
      topicKey: "local-ai",
      state: "awaiting_editors",
      expiresAt: null,
      agentName: null,
      slug: null,
    },
  ]);
});
it("resolves approved provenance to the final published slug and treats dismissed drafts as available", async () => {
  state.rows = [
    [row({ draftId: "d1" })],
    [],
    [{ status: "approved", metadata: { savedStorylineId: "s1" } }],
    [{ readable: true, slug: "edited-slug" }],
  ];
  expect(await readStorylineCoverage("local-ai")).toEqual({
    state: "published",
    slug: "edited-slug",
  });
  state.rows = [[row({ draftId: "d1" })], [], [{ status: "rejected" }]];
  expect(await readStorylineCoverage("local-ai")).toEqual({
    state: "available",
    slug: null,
  });
});

it("blocks a legacy pending proposal with no reservation and surfaces only its topic key", async () => {
  state.rows = [[{ id: "a1" }], [row()], [], [{ id: "legacy-draft" }]];
  expect(await reserveStoryline(identity, topic, now)).toMatchObject({
    state: "awaiting_editors",
    reservationId: null,
  });
  expect(state.writes).toEqual([]);
  state.rows = [
    [],
    [
      {
        topicKey: "local-ai",
        agentName: "Hidden",
        visibility: "ghost",
        content: "Private draft",
      },
    ],
  ];
  expect(await listStorylineResearch()).toEqual([
    {
      topicKey: "local-ai",
      title: "local ai",
      state: "awaiting_editors",
      expiresAt: null,
      agentName: null,
      slug: null,
    },
  ]);
});
it("keeps damaged published coverage with editors and never returns its broken reader URL", async () => {
  state.rows = [[row()], [{ slug: "local-ai", readable: false }]];
  expect(await readStorylineCoverage("local-ai")).toEqual({
    state: "awaiting_editors",
    slug: null,
  });
  state.rows = [
    [
      {
        ...row(),
        storyStatus: "published",
        readable: false,
        slug: "local-ai",
        visibility: "visible",
        agentName: "Atlas",
        draftStatus: "approved",
      },
    ],
    [],
  ];
  expect((await listStorylineResearch())[0]).toMatchObject({
    state: "awaiting_editors",
    slug: null,
  });
});
