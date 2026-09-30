// @vitest-environment node
/**
 * DB-INTEGRATION for the attendee read model (ADR-0038) against real rows:
 * joins, waitlist order, community membership, past attendance counted only
 * from the given earlier events, `intent` rows left out, and the privacy rule.
 * Auto-skips unless RUN_DB_TESTS=1 and a local database is configured.
 */
import type { eq as Eq, inArray as InArray } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import type { RegistrationQuestion } from "@/lib/events/registration-questions";
import type { db as Db } from "@/server/db";
import type * as Schema from "@/server/db/schema";

import type { loadEventAttendees as Load } from "./attendee-details";

function looksLikeCloudNeon(url: string): boolean {
  return /neon\.tech|neon\.build|pooler\.[^/]*\.neon/i.test(url);
}
function isLocalDbConfigured(): boolean {
  if (process.env.RUN_DB_TESTS !== "1") return false;
  const dbUrl = process.env.DATABASE_URL?.trim() ?? "";
  if (dbUrl && looksLikeCloudNeon(dbUrl)) return false;
  return /(@|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0|db|postgres|host\.docker\.internal)(:|\/)/i.test(
    dbUrl,
  );
}
const RUN_DB = isLocalDbConfigured();

const QUESTIONS: RegistrationQuestion[] = [
  {
    id: "hope",
    type: "long_text",
    label: "What do you hope to learn?",
    required: false,
  },
  {
    id: "level",
    type: "single_choice",
    label: "Your AI experience",
    required: true,
    options: [
      { id: "new", label: "New to it" },
      { id: "pro", label: "Daily" },
    ],
  },
];

describe.skipIf(!RUN_DB)("loadEventAttendees [DB integration]", () => {
  let db: typeof Db;
  let schema: typeof Schema;
  let eq: typeof Eq;
  let inArray: typeof InArray;
  let load: typeof Load;

  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const EVENT_ID = 900_000_000 + Math.floor(Math.random() * 1_000_000);
  const EARLIER_ID = EVENT_ID + 1;
  const OTHER_COMMUNITY_EVENT_ID = EVENT_ID + 2;
  const ids = {
    ada: `it-att-ada-${suffix}`,
    grace: `it-att-grace-${suffix}`,
    linus: `it-att-linus-${suffix}`,
    old: `it-att-old-${suffix}`,
    fan: `it-att-fan-${suffix}`,
  };
  let communityId: string;

  beforeAll(async () => {
    const [dbMod, schemaMod, drizzle, mod] = await Promise.all([
      import("@/server/db"),
      import("@/server/db/schema"),
      import("drizzle-orm"),
      import("./attendee-details"),
    ]);
    db = dbMod.db;
    schema = schemaMod;
    eq = drizzle.eq;
    inArray = drizzle.inArray;
    load = mod.loadEventAttendees;
  }, 120_000);

  afterEach(async () => {
    const userIds = Object.values(ids);
    await db
      .delete(schema.eventRegistrations)
      .where(inArray(schema.eventRegistrations.userId, userIds));
    await db
      .delete(schema.communityMemberships)
      .where(inArray(schema.communityMemberships.userId, userIds));
    await db
      .delete(schema.memberProfiles)
      .where(inArray(schema.memberProfiles.userId, userIds));
    if (communityId) {
      await db
        .delete(schema.communities)
        .where(eq(schema.communities.id, communityId));
    }
    await db.delete(schema.user).where(inArray(schema.user.id, userIds));
  });

  it("builds every row from real data, one query per concern", async () => {
    for (const [key, id] of Object.entries(ids)) {
      await db.insert(schema.user).values({
        id,
        email: `${id}@example.test`,
        name: key,
        firstName: key === "old" ? null : key,
        lastName: key === "old" ? null : "Test",
      });
    }
    await db.insert(schema.memberProfiles).values([
      {
        userId: ids.ada,
        displayName: "Ada",
        isPublic: true,
        company: "Engines",
        skills: ["math"],
      },
      {
        userId: ids.grace,
        displayName: "Grace",
        isPublic: false,
        company: "Navy",
      },
    ]);
    const [community] = await db
      .insert(schema.communities)
      .values({
        name: `IT ${suffix}`,
        slug: `it-att-${suffix}`,
        createdBy: ids.ada,
      })
      .returning({ id: schema.communities.id });
    communityId = community!.id;
    await db.insert(schema.communityMemberships).values([
      { communityId, userId: ids.ada, status: "active" },
      { communityId, userId: ids.grace, status: "pending_approval" },
    ]);

    const t = (minutes: number) => new Date(Date.UTC(2026, 9, 1, 10, minutes));
    const notice = t(0);
    await db.insert(schema.eventRegistrations).values([
      {
        eventId: EVENT_ID,
        userId: ids.ada,
        status: "registered",
        registeredAt: t(1),
        organizerNoticeAt: notice,
        answers: { hope: "Agents", level: "pro" },
      },
      {
        eventId: EVENT_ID,
        userId: ids.linus,
        status: "waitlisted",
        registeredAt: t(3),
        organizerNoticeAt: notice,
      },
      {
        eventId: EVENT_ID,
        userId: ids.grace,
        status: "waitlisted",
        registeredAt: t(2),
        organizerNoticeAt: notice,
        answers: { level: "new" },
      },
      {
        eventId: EVENT_ID,
        userId: ids.old,
        status: "registered",
        registeredAt: t(0),
        answers: { hope: "never told" },
      },
      {
        eventId: EVENT_ID,
        userId: ids.fan,
        status: "intent",
        registeredAt: t(4),
      },
      // Past attendance: one in an earlier event of this community, one
      // elsewhere that must not count.
      {
        eventId: EARLIER_ID,
        userId: ids.ada,
        status: "attended",
        registeredAt: t(0),
      },
      {
        eventId: OTHER_COMMUNITY_EVENT_ID,
        userId: ids.ada,
        status: "attended",
        registeredAt: t(0),
      },
    ]);

    const { counts, rows } = await load(
      db,
      { id: EVENT_ID, communityId, questions: QUESTIONS },
      [EARLIER_ID],
    );

    expect(rows.map((r) => r.displayName)).toEqual([
      "old", // no names on the account: falls back to the account name
      "ada Test",
      "grace Test",
      "linus Test",
    ]);
    expect(counts).toMatchObject({ registered: 2, waitlisted: 2 });

    const [old, ada, grace, linus] = rows;
    expect(old).toMatchObject({
      email: null,
      detailsShared: false,
      profile: null,
    });
    expect(ada).toMatchObject({
      email: `${ids.ada}@example.test`,
      pastEventsAttended: 1,
      profile: { company: "Engines", skills: ["math"] },
    });
    expect(ada!.communityMemberSince).toBeInstanceOf(Date);
    expect(grace).toMatchObject({
      waitlistPosition: 1,
      profile: null, // private profile
      communityMemberSince: null, // pending, not active
    });
    expect(linus).toMatchObject({
      waitlistPosition: 2,
      profile: null,
      answers: [],
    });

    // Answers come back as words, in question order; a private profile
    // keeps them, registering before the notice hides them.
    expect(ada!.answers).toEqual([
      {
        questionId: "hope",
        question: "What do you hope to learn?",
        type: "long_text",
        value: "Agents",
      },
      {
        questionId: "level",
        question: "Your AI experience",
        type: "single_choice",
        value: "Daily",
      },
    ]);
    expect(grace!.answers.map((a) => a.value)).toEqual(["New to it"]);
    expect(old!.answers).toEqual([]);
  });

  it("returns an empty list for an event nobody registered for", async () => {
    await expect(
      load(db, { id: EVENT_ID + 50, communityId: "none", questions: [] }, []),
    ).resolves.toMatchObject({ rows: [], counts: { registered: 0 } });
  });
});
