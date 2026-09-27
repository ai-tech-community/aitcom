import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import {
  assertEventCancellable,
  EVENT_ALREADY_OVER_MESSAGE,
} from "./cancel-guard";

const NOW = new Date("2026-09-27T10:00:00.000Z");

describe("assertEventCancellable", () => {
  it("allows cancelling an event that is still ahead", () => {
    expect(() =>
      assertEventCancellable(
        {
          date: "2026-10-01T00:00:00.000Z",
          startTime: "18:00",
          timezone: "Europe/Amsterdam",
        },
        NOW,
      ),
    ).not.toThrow();
  });

  it("allows cancelling an event that is running today, where it happens", () => {
    expect(() =>
      assertEventCancellable(
        {
          date: "2026-09-27",
          startTime: null,
          timezone: "America/Los_Angeles",
        },
        NOW,
      ),
    ).not.toThrow();
  });

  it("refuses an event that is over, with a clear message", () => {
    let error: unknown;
    try {
      assertEventCancellable(
        {
          date: "2026-09-20T00:00:00.000Z",
          startTime: "18:00",
          endTime: "21:00",
          timezone: "Europe/Amsterdam",
        },
        NOW,
      );
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(TRPCError);
    expect((error as TRPCError).code).toBe("BAD_REQUEST");
    expect((error as TRPCError).message).toBe(EVENT_ALREADY_OVER_MESSAGE);
  });

  it("refuses an event whose end time passed earlier today", () => {
    expect(() =>
      assertEventCancellable(
        {
          date: "2026-09-27T00:00:00.000Z",
          startTime: "08:00",
          endTime: "11:00",
          timezone: "Europe/Amsterdam",
        },
        NOW,
      ),
    ).toThrow(EVENT_ALREADY_OVER_MESSAGE);
  });

  it("is what the cancelEvent procedure runs before cancelling", () => {
    const router = readFileSync(
      join(process.cwd(), "src/server/api/routers/events.ts"),
      "utf8",
    );
    const cancel = router.slice(
      router.indexOf("cancelEvent: protectedProcedure"),
    );
    const guard = cancel.indexOf("assertEventCancellable(existingEvent)");
    const update = cancel.indexOf('data: { status: "cancelled" }');
    expect(guard).toBeGreaterThan(0);
    expect(guard).toBeLessThan(update);
  });
});
