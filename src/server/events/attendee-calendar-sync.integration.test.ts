/**
 * DB-INTEGRATION test for the Events collection's attendee-calendar hook. It
 * proves, against a REAL local DB and the real Payload config, that saving an
 * event:
 *
 *   - with a new start time emails every member holding a seat an updated
 *     invite (and nobody on the waitlist);
 *   - as cancelled emails every seat holder a calendar cancel;
 *   - as a draft emails nobody, and leaves the published event untouched;
 *   - then publishing that draft does email the seat holders;
 *   - with an edit the calendar does not show (the summary) emails nobody.
 *
 * Auto-skips unless RUN_DB_TESTS=1 and a local database is configured; see
 * hackathon-task-progress.integration.test.ts for how to run it.
 */

import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { eq as Eq } from "drizzle-orm";

import type { db as Db } from "@/server/db";
import type * as Schema from "@/server/db/schema";
import type * as EmailModule from "@/server/email";
import type { getPayloadClient as GetPayloadClient } from "@/server/payload";

const sendEventChangedEmail = vi.fn(async () => true);
const sendEventCancelledEmail = vi.fn(async () => true);

vi.mock("@/server/email", async (importOriginal) => ({
  ...(await importOriginal<typeof EmailModule>()),
  sendEventChangedEmail,
  sendEventCancelledEmail,
}));

function looksLikeCloudNeon(url: string): boolean {
  return /neon\.tech|neon\.build|pooler\.[^/]*\.neon/i.test(url);
}

function looksLikeLocalDb(url: string): boolean {
  if (!url) return false;
  if (looksLikeCloudNeon(url)) return false;
  return /(@|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0|db|postgres|host\.docker\.internal)(:|\/)/i.test(
    url,
  );
}

function isLocalDbConfigured(): boolean {
  if (process.env.RUN_DB_TESTS !== "1") return false;
  const proxy = process.env.NEON_LOCAL_PROXY?.trim();
  const dbUrl = process.env.DATABASE_URL?.trim() ?? "";
  if (dbUrl && looksLikeCloudNeon(dbUrl)) return false;
  if (proxy) return true;
  return looksLikeLocalDb(dbUrl);
}

const RUN_DB = isLocalDbConfigured();

describe.skipIf(!RUN_DB)(
  "Events attendee calendar hook [DB integration]",
  () => {
    type Mods = {
      db: typeof Db;
      schema: typeof Schema;
      getPayloadClient: typeof GetPayloadClient;
      eq: typeof Eq;
    };
    let m: Mods;

    beforeAll(async () => {
      const url = process.env.DATABASE_URL ?? "";
      if (looksLikeCloudNeon(url)) {
        throw new Error(
          "Refusing to run DB integration tests against a cloud Neon DATABASE_URL.",
        );
      }
      const [{ db }, schema, { getPayloadClient }, drizzle] = await Promise.all(
        [
          import("@/server/db"),
          import("@/server/db/schema"),
          import("@/server/payload"),
          import("drizzle-orm"),
        ],
      );
      m = { db, schema, getPayloadClient, eq: drizzle.eq };
    });

    let eventId: number;
    let userIds: string[];

    let consoleError: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
      vi.clearAllMocks();
      consoleError = vi.spyOn(console, "error");
      const { db, schema, getPayloadClient } = m;
      const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      const seatId = `it-cal-seat-${suffix}`;
      const waitId = `it-cal-wait-${suffix}`;
      userIds = [seatId, waitId];

      for (const id of userIds) {
        await db
          .insert(schema.user)
          .values({ id, email: `${id}@example.test`, name: id });
      }

      const payload = await getPayloadClient();
      const event = await payload.create({
        collection: "events",
        data: {
          title: `Integration calendar event ${suffix}`,
          slug: `it-cal-event-${suffix}`,
          description: {
            root: {
              type: "root",
              direction: "ltr" as const,
              format: "" as const,
              indent: 0,
              version: 1,
              children: [
                {
                  type: "paragraph",
                  version: 1,
                  children: [{ type: "text", text: "integration test" }],
                },
              ],
            },
          },
          type: "meetup" as const,
          status: "published" as const,
          date: "2026-11-02",
          startTime: "19:00",
          endTime: "22:00",
          timezone: "Europe/Amsterdam",
          location: "Test Lab",
        },
        context: { skipGeocode: true },
      });
      eventId = Number(event.id);

      await db.insert(schema.eventRegistrations).values([
        { eventId, userId: seatId, status: "registered" },
        { eventId, userId: waitId, status: "waitlisted" },
      ]);
    });

    afterEach(async () => {
      // A send that failed quietly must not pass as "emailed nobody".
      expect(consoleError).not.toHaveBeenCalled();
      consoleError.mockRestore();
      const { db, schema, eq, getPayloadClient } = m;
      await db
        .delete(schema.eventRegistrations)
        .where(eq(schema.eventRegistrations.eventId, eventId));
      for (const id of userIds) {
        await db.delete(schema.user).where(eq(schema.user.id, id));
      }
      try {
        const payload = await getPayloadClient();
        await payload.delete({ collection: "events", id: eventId });
      } catch {
        // Best-effort teardown.
      }
    });

    async function updateEvent(
      data: Record<string, unknown>,
      options: { draft?: boolean } = {},
    ) {
      const payload = await m.getPayloadClient();
      return payload.update({
        collection: "events",
        id: eventId,
        data,
        draft: options.draft,
        context: { skipGeocode: true },
      });
    }

    it("sends the seat holder an updated invite when the time moves", async () => {
      await updateEvent({ startTime: "20:00" });

      expect(sendEventChangedEmail).toHaveBeenCalledTimes(1);
      const [to, , , invite] = sendEventChangedEmail.mock
        .calls[0]! as unknown as [
        string,
        string,
        unknown,
        { content: string; contentType: string },
      ];
      expect(to).toBe(`${userIds[0]}@example.test`);
      expect(invite.contentType).toContain("method=REQUEST");
      expect(invite.content).toContain(
        "DTSTART;TZID=Europe/Amsterdam:20261102T200000",
      );
      expect(sendEventCancelledEmail).not.toHaveBeenCalled();
    });

    it("sends the seat holder a calendar cancel when the event is cancelled", async () => {
      await updateEvent({ status: "cancelled" });

      expect(sendEventCancelledEmail).toHaveBeenCalledTimes(1);
      expect(sendEventChangedEmail).not.toHaveBeenCalled();
    });

    it("emails nobody for a draft, and the live event keeps its time", async () => {
      await updateEvent(
        { startTime: "20:00", _status: "draft" },
        { draft: true },
      );

      expect(sendEventChangedEmail).not.toHaveBeenCalled();
      const payload = await m.getPayloadClient();
      const live = await payload.findByID({
        collection: "events",
        id: eventId,
      });
      expect(live.startTime).toBe("19:00");
    });

    it("tells seat holders once a draft with a new time is published", async () => {
      await updateEvent(
        { startTime: "20:00", _status: "draft" },
        { draft: true },
      );
      expect(sendEventChangedEmail).not.toHaveBeenCalled();

      await updateEvent({ _status: "published" });

      expect(sendEventChangedEmail).toHaveBeenCalledTimes(1);
      const invite = (
        sendEventChangedEmail.mock.calls[0]! as unknown as [
          string,
          string,
          unknown,
          { content: string },
        ]
      )[3];
      expect(invite.content).toContain(
        "DTSTART;TZID=Europe/Amsterdam:20261102T200000",
      );
    });

    it("emails nobody for an edit the calendar does not show", async () => {
      await updateEvent({ summary: "A new blurb" });

      expect(sendEventChangedEmail).not.toHaveBeenCalled();
      expect(sendEventCancelledEmail).not.toHaveBeenCalled();
    });
  },
);
