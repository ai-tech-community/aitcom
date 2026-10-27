import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Event } from "@/payload-types";
import { PICKER_LIMIT } from "@/lib/magazines/picker";
import { HUB_SLUG } from "@/server/communities/hub";

import type { ItemContext, PickerContext } from "../types";
import { loadIssueItemViews } from "../registry";
import { searchPickerCandidates } from "../pickers";
import { eventItemKind } from "./kind";

const find = vi.fn();
function context(access: ItemContext["access"] = "editor") {
  return {
    payload: { find } as unknown as ItemContext["payload"],
    db: {} as ItemContext["db"],
    magazineId: 1,
    issueId: 2,
    community: { id: "community", slug: "community" },
    locale: "nl",
    access,
    reader: {
      viewerId: "editor",
      hiddenCommunityIds: vi.fn(async () => new Set(["hidden"])),
      membersOnlyCommunityIds: vi.fn(async () => new Set(["private"])),
    },
  } satisfies ItemContext;
}
const event = (id: number, overrides: Partial<Event> = {}): Event => ({
  id,
  title: `Event ${id}`,
  slug: `event-${id}`,
  date: "2026-10-24T00:00:00.000Z",
  description: {
    root: {
      type: "root",
      children: [],
      direction: null,
      format: "",
      indent: 0,
      version: 1,
    },
  },
  type: "meetup",
  location: "Amsterdam",
  city: "Amsterdam",
  format: "in-person",
  communityId: "community",
  status: "published",
  createdAt: "",
  updatedAt: "",
  ...overrides,
});
const stored = (eventId: number, id = `block-${eventId}`) => ({
  id,
  eventId,
  intro: "Our take",
});
beforeEach(() => find.mockReset().mockResolvedValue({ docs: [] }));

describe("event item kind", () => {
  it("loads every event of an issue in one query, live documents only", async () => {
    find.mockResolvedValue({
      docs: [event(1, { id: "1" as unknown as number })],
    });
    const views = await eventItemKind.load(
      [stored(1), stored(2), stored(3)],
      context(),
    );
    expect(find).toHaveBeenCalledExactlyOnceWith({
      collection: "events",
      where: { id: { in: [1, 2, 3] } },
      draft: false,
      depth: 0,
      locale: "nl",
      pagination: false,
    });
    expect(views.get("block-1")).toMatchObject({
      event: { title: "Event 1", online: false },
    });
    expect(views.get("block-2")).toMatchObject({ reason: "missing" });
  });

  it("marks draft and rejected events unpublished and private ones no_access", async () => {
    find.mockResolvedValue({
      docs: [
        event(1, { status: "draft" }),
        event(2, { status: "rejected" }),
        event(3, { communityId: "hidden" }),
      ],
    });
    const blocks = [1, 2, 3, 4].map((n) => ({
      blockType: "event" as const,
      ...stored(n),
    }));
    expect(await loadIssueItemViews(blocks, context())).toEqual([
      {
        kind: "event",
        itemId: "block-1",
        unavailable: true,
        reason: "unpublished",
      },
      {
        kind: "event",
        itemId: "block-2",
        unavailable: true,
        reason: "unpublished",
      },
      {
        kind: "event",
        itemId: "block-3",
        unavailable: true,
        reason: "no_access",
      },
      {
        kind: "event",
        itemId: "block-4",
        unavailable: true,
        reason: "missing",
      },
    ]);
    expect(await loadIssueItemViews(blocks, context("full"))).toEqual([]);
  });

  it("shows a cancelled event with its status", async () => {
    find.mockResolvedValue({
      docs: [
        event(1, {
          status: "cancelled",
          format: "online",
          endDate: "2026-10-25T00:00:00.000Z",
        }),
      ],
    });
    expect([
      ...(await eventItemKind.load([stored(1)], context())).values(),
    ]).toEqual([
      {
        kind: "event",
        itemId: "block-1",
        intro: "Our take",
        membersOnly: false,
        event: {
          slug: "event-1",
          title: "Event 1",
          date: "2026-10-24T00:00:00.000Z",
          endDate: "2026-10-25T00:00:00.000Z",
          city: "Amsterdam",
          online: true,
          status: "cancelled",
        },
      },
    ]);
  });

  it("flags events of a members-only community", async () => {
    find.mockResolvedValue({ docs: [event(1, { communityId: "private" })] });
    expect(
      (await eventItemKind.load([stored(1)], context())).get("block-1"),
    ).toMatchObject({ membersOnly: true });
    const ctx = context("full");
    expect(
      (await eventItemKind.load([stored(1)], ctx)).get("block-1"),
    ).toMatchObject({ membersOnly: false });
    expect(ctx.reader.membersOnlyCommunityIds).not.toHaveBeenCalled();
  });

  it("refuses a new event that is unlisted, another community's or unknown alike", async () => {
    find.mockResolvedValue({
      docs: [
        event(1, { status: "draft" }),
        event(2, { communityId: "other" }),
        event(4, { communityId: "hidden" }),
        event(5, { status: "rejected" }),
      ],
    });
    const items = [1, 2, 3, 4, 5].map((id, index) => ({
      index,
      stored: stored(id),
      isNew: true,
    }));
    expect(await eventItemKind.validate(items, context())).toEqual(
      items.map(({ index }) => ({ itemIndex: index, code: "ITEM_INVALID" })),
    );
    expect(find).toHaveBeenCalledTimes(1);
    expect(
      await eventItemKind.validate(
        items.map((i) => ({ ...i, isNew: false })),
        context(),
      ),
    ).toEqual([]);
    expect(
      await eventItemKind.validate(
        [items[0]!, { ...items[0]!, index: 1 }],
        context(),
      ),
    ).toEqual([
      { itemIndex: 0, code: "ITEM_INVALID" },
      { itemIndex: 1, code: "ITEM_INVALID", detail: "duplicate" },
    ]);
  });

  it("the Hub's magazine accepts the Hub's events with no community", async () => {
    find.mockResolvedValue({ docs: [event(1, { communityId: null })] });
    const items = [{ index: 0, stored: stored(1), isNew: true }];
    const ctx = context();
    expect(await eventItemKind.validate(items, ctx)).toEqual([
      { itemIndex: 0, code: "ITEM_INVALID" },
    ]);
    ctx.community = { id: "hub", slug: HUB_SLUG };
    expect(await eventItemKind.validate(items, ctx)).toEqual([]);
  });

  it("round-trips numeric ids and keeps the intro", () => {
    const saved = eventItemKind.toStored({
      kind: "event",
      eventId: 7,
      intro: " Our take ",
    });
    expect(saved).toEqual({ eventId: 7, intro: "Our take" });
    const fromPayload = { ...saved, eventId: "7" as unknown as number };
    expect(eventItemKind.toInput(fromPayload)).toEqual({
      kind: "event",
      eventId: 7,
      intro: "Our take",
    });
    expect(eventItemKind.referenceOf(fromPayload)).toBe("event:7");
    for (const eventId of [0, -1, 1.5])
      expect(
        eventItemKind.input.safeParse({ kind: "event", eventId }).success,
      ).toBe(false);
  });
});

describe("event picker", () => {
  it("offers listed community events with date and status facts", async () => {
    find.mockResolvedValue({
      docs: [
        event(1, { status: "cancelled" }),
        event(2, { status: "completed" }),
        event(3),
      ],
    });
    const ctx = context();
    const pickerCtx: PickerContext = {
      deps: { payload: ctx.payload, db: ctx.db },
      magazineId: 1,
      community: ctx.community,
      viewerId: "editor",
      locale: "nl",
    };
    const candidates = await searchPickerCandidates("event", "", pickerCtx);
    expect(find).toHaveBeenLastCalledWith({
      collection: "events",
      where: {
        and: [
          { status: { in: ["published", "cancelled", "completed"] } },
          { communityId: { equals: "community" } },
        ],
      },
      sort: "-date",
      draft: false,
      depth: 0,
      locale: "nl",
      limit: PICKER_LIMIT,
    });
    expect(candidates[0]).toEqual({
      input: { kind: "event", eventId: 1 },
      reference: "event:1",
      title: "Event 1",
      facts: [
        { type: "date", label: "starts", at: "2026-10-24T00:00:00.000Z" },
        { type: "eventStatus", status: "cancelled" },
      ],
      openHref: null,
    });
    expect(candidates[1]!.facts[1]).toEqual({
      type: "eventStatus",
      status: "completed",
    });
    expect(candidates[2]!.facts).toHaveLength(1);
    await searchPickerCandidates("event", "models", pickerCtx);
    expect(find.mock.lastCall![0].where.and).toContainEqual({
      title: { like: "models" },
    });
    await searchPickerCandidates("event", "", {
      ...pickerCtx,
      community: { id: "hub", slug: HUB_SLUG },
    });
    expect(find.mock.lastCall![0].where.and[1]).toEqual({
      or: [
        { communityId: { equals: "hub" } },
        { communityId: { exists: false } },
      ],
    });
  });
});
