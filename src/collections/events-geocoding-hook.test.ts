import type { PayloadRequest } from "payload";
import { beforeEach, describe, expect, it, vi } from "vitest";

const geocodeEvent = vi.hoisted(() => vi.fn());
vi.mock("@/server/geocoding/nominatim", () => ({ geocodeEvent }));
const calendar = vi.hoisted(() => ({
  attendeeCalendarChange: vi.fn(() => "update"),
  notifyAttendeesOfEventChange: vi.fn(async () => ({
    emailed: 1,
    attendees: 1,
  })),
}));
vi.mock("@/server/events/attendee-calendar-sync", () => calendar);

import { Events } from "./Events";

const geocodeHook = Events.hooks!.afterChange![0]!;
const previousDoc = {
  id: 7,
  location: "Amstelveen",
  city: "Amstelveen",
  country: "Netherlands",
  coverImage: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  geocodeEvent.mockResolvedValue({ latitude: 52.3, longitude: 4.86 });
});

describe("event cover save with geocoding", () => {
  it.each(["draft", "published"])(
    "keeps geocoding in the same %s save mode",
    async (_status) => {
      const update = vi.fn(async () => ({}));
      await geocodeHook({
        req: {
          transactionID: "event-save",
          context: {},
          payload: { update, logger: { error: vi.fn() } },
        },
        doc: { ...previousDoc, coverImage: 42, _status },
        previousDoc,
        operation: "update",
      } as never);
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ draft: _status === "draft" }),
      );
    },
  );

  it("finishes the cover save while its transaction holds the event row", async () => {
    const req = {
      transactionID: "event-save",
      context: {},
      payload: {
        update: vi.fn(async (options: { req?: PayloadRequest }) => {
          // A second transaction cannot update the row until the outer save
          // commits. The afterChange hook runs before that commit.
          if (options.req?.transactionID !== "event-save") {
            await new Promise(() => undefined);
          }
          return { ...previousDoc, coverImage: 42 };
        }),
        logger: { error: vi.fn() },
      },
    };
    const saving = geocodeHook({
      req,
      doc: { ...previousDoc, coverImage: 42 },
      previousDoc,
      operation: "update",
    } as never);

    // Bound the simulated lock wait without touching a database.
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      expect(
        await Promise.race([
          Promise.resolve(saving).then(() => "saved"),
          new Promise((resolve) => {
            timer = setTimeout(() => resolve("waiting for row lock"), 50);
          }),
        ]),
      ).toBe("saved");
    } finally {
      clearTimeout(timer);
    }
    expect(req.payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "events",
        id: 7,
        data: expect.objectContaining({ latitude: 52.3, longitude: 4.86 }),
      }),
    );
    expect(req.context).toEqual({});
  });

  it("keeps the original calendar snapshot through the nested geocode update", async () => {
    let live = {
      ...previousDoc,
      startTime: "12:00",
      coverImage: null as number | null,
    };
    const before = { ...live };
    const after = { ...live, startTime: "13:00", coverImage: 42 };
    const capture = Events.hooks!.beforeChange![1]!;
    const notify = Events.hooks!.afterChange![1]!;
    const req = {
      transactionID: "event-save",
      context: {},
      payload: {
        findByID: vi.fn(async () => live),
        update: vi.fn(async (options: { req: PayloadRequest }) => {
          const args = {
            req: options.req,
            doc: live,
            originalDoc: live,
            operation: "update",
            data: {},
          };
          await capture(args as never);
          await geocodeHook(args as never);
          await notify(args as never);
          return live;
        }),
        logger: { error: vi.fn(), info: vi.fn() },
      },
    };
    await capture({
      req,
      originalDoc: before,
      operation: "update",
      data: {},
    } as never);
    live = after;
    const args = { req, doc: after, previousDoc: before, operation: "update" };
    await geocodeHook(args as never);
    await notify(args as never);

    expect(geocodeEvent).toHaveBeenCalledTimes(1);
    expect(req.payload.update).toHaveBeenCalledTimes(1);
    expect(calendar.attendeeCalendarChange).toHaveBeenCalledExactlyOnceWith(
      before,
      after,
    );
    expect(
      calendar.notifyAttendeesOfEventChange,
    ).toHaveBeenCalledExactlyOnceWith(after, "update");
  });
});
