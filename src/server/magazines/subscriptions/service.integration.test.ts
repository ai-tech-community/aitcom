// @vitest-environment node
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { eq, inArray } from "drizzle-orm";

import type { db as Db } from "@/server/db";
import type * as Schema from "@/server/db/schema";
import type { PayloadClient } from "@/server/magazines/deps";
import type * as Service from "@/server/magazines/subscriptions/service";
import type {
  MagazineMailer,
  OutgoingMagazineMail,
} from "@/server/magazines/subscriptions/mail";
import type * as Magazines from "@/server/magazines/magazine-service";
import type * as Issues from "@/server/magazines/issue-service";

vi.mock("@/server/email", () => ({ sendGatedEmail: vi.fn(async () => true) }));

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

function richText(text: string) {
  return {
    root: {
      type: "root",
      direction: "ltr" as const,
      format: "" as const,
      indent: 0,
      version: 1,
      children: [
        { type: "paragraph", version: 1, children: [{ type: "text", text }] },
      ],
    },
  };
}

describe.skipIf(!isLocalDbConfigured())(
  "magazine subscriptions [DB integration]",
  { timeout: 60_000 },
  () => {
    let m: {
      db: typeof Db;
      schema: typeof Schema;
      payload: PayloadClient;
      service: typeof Service;
      magazines: typeof Magazines;
      issues: typeof Issues;
    };
    let fx: {
      sfx: string;
      ownerId: string;
      memberId: string;
      outsiderId: string;
      communityIds: string[];
    };
    let send: ReturnType<
      typeof vi.fn<(to: string, mail: OutgoingMagazineMail) => Promise<boolean>>
    >;
    let mailer: MagazineMailer;
    let now: Date;

    beforeAll(async () => {
      const [{ db }, schema, { getPayloadClient }, service, magazines, issues] =
        await Promise.all([
          import("@/server/db"),
          import("@/server/db/schema"),
          import("@/server/payload"),
          import("@/server/magazines/subscriptions/service"),
          import("@/server/magazines/magazine-service"),
          import("@/server/magazines/issue-service"),
        ]);
      m = {
        db,
        schema,
        payload: await getPayloadClient(),
        service,
        magazines,
        issues,
      };
    }, 120_000);

    beforeEach(async () => {
      const sfx = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      fx = {
        sfx,
        ownerId: `sub-owner-${sfx}`,
        memberId: `sub-member-${sfx}`,
        outsiderId: `sub-outsider-${sfx}`,
        communityIds: [],
      };
      const ids = [fx.ownerId, fx.memberId, fx.outsiderId];
      await m.db
        .insert(m.schema.user)
        .values(
          ids.map((id) => ({ id, email: `${id}@example.test`, name: id })),
        );
      await m.db
        .insert(m.schema.memberProfiles)
        .values(ids.map((userId) => ({ userId, displayName: userId })));
      send = vi.fn(async () => true);
      mailer = {
        send,
        env: { VERCEL_ENV: "production", NODE_ENV: "production" },
        sleep: async () => undefined,
      };
      now = new Date();
    });

    afterEach(async () => {
      if (!fx) return;
      const { db, schema, payload } = m;
      const ids = [fx.ownerId, fx.memberId, fx.outsiderId];
      if (fx.communityIds.length) {
        const { docs } = await payload.find({
          collection: "magazines",
          where: { communityId: { in: fx.communityIds } },
          depth: 0,
          pagination: false,
        });
        const magazineIds = docs.map((mag) => Number(mag.id));
        if (magazineIds.length) {
          await db
            .delete(schema.magazineSubscriptions)
            .where(
              inArray(schema.magazineSubscriptions.magazineId, magazineIds),
            );
          await db
            .delete(schema.magazineStaff)
            .where(inArray(schema.magazineStaff.magazineId, magazineIds));
          await payload.delete({
            collection: "magazine-issues",
            where: { magazine: { in: magazineIds } },
          });
          await payload.delete({
            collection: "magazines",
            where: { id: { in: magazineIds } },
          });
        }
        await db
          .delete(schema.spaces)
          .where(inArray(schema.spaces.communityId, fx.communityIds));
        await db
          .delete(schema.communityMemberships)
          .where(
            inArray(schema.communityMemberships.communityId, fx.communityIds),
          );
        await db
          .delete(schema.communities)
          .where(inArray(schema.communities.id, fx.communityIds));
      }
      await db
        .delete(schema.notifications)
        .where(inArray(schema.notifications.userId, ids));
      await db
        .delete(schema.pointsEvents)
        .where(inArray(schema.pointsEvents.userId, ids));
      await db
        .delete(schema.activityEvents)
        .where(inArray(schema.activityEvents.actorId, ids));
      await db
        .delete(schema.memberBadges)
        .where(inArray(schema.memberBadges.userId, ids));
      await db
        .delete(schema.memberProfiles)
        .where(inArray(schema.memberProfiles.userId, ids));
      await db.delete(schema.user).where(inArray(schema.user.id, ids));
    }, 60_000);

    async function magazine(
      label = "gazette",
      opts: { listed?: boolean; issue?: "public" | "members" | "none" } = {},
    ) {
      const [community] = await m.db
        .insert(m.schema.communities)
        .values({
          name: label,
          slug: `sub-${label}-${fx.sfx}`,
          createdBy: fx.ownerId,
          isListedInDirectory: opts.listed ?? true,
        })
        .returning();
      fx.communityIds.push(community!.id);
      await m.db.insert(m.schema.communityMemberships).values([
        { communityId: community!.id, userId: fx.ownerId, role: "owner" },
        { communityId: community!.id, userId: fx.memberId, role: "member" },
      ]);
      const mag = await m.magazines.saveMagazineSettings(
        m,
        community!,
        {
          name: `Gazette ${label}`,
          slug: `sub-${label}-${fx.sfx}`,
          topics: [],
          defaultVisibility: opts.issue === "members" ? "members" : "public",
        },
        fx.ownerId,
        true,
      );
      if (opts.issue !== "none") {
        const actor = { userId: fx.ownerId, community: community! };
        let issue = await m.issues.createIssue(
          m,
          mag,
          { title: "First issue" },
          actor,
        );
        ({ issue } = await m.issues.setIssueItems(
          m,
          issue,
          [
            {
              kind: "editorial",
              heading: "Welcome",
              body: richText("Our first issue"),
            },
          ],
          issue.updatedAt,
          actor,
        ));
        await m.issues.publishIssue(m, issue, issue.updatedAt, actor);
      }
      return { ...mag, community: community! };
    }

    const address = () => `reader-${fx.sfx}@example.test`;
    const later = (minutes: number) =>
      new Date(now.getTime() + minutes * 60_000);
    function subscribe(
      mag: { id: number; name: string },
      email = address(),
      at = now,
    ) {
      return m.service.subscribeByEmail(
        m,
        { magazine: mag, email, locale: "en" },
        mailer,
        at,
      );
    }
    async function rows(magazineId: number) {
      return m.db
        .select()
        .from(m.schema.magazineSubscriptions)
        .where(eq(m.schema.magazineSubscriptions.magazineId, magazineId));
    }
    function sentToken(index = 0) {
      const text = send.mock.calls[index]![1].text;
      const url =
        /https:\/\/[^\s]+\/magazine-subscriptions\/confirm\?t=[^\s]+/.exec(
          text,
        )![0];
      return new URL(url).searchParams.get("t")!;
    }

    it("a signed-in reader subscribes once and can leave", async () => {
      const mag = await magazine();
      await m.service.subscribeAccount(m.db, mag.id, fx.memberId, "nl", now);
      await m.service.subscribeAccount(
        m.db,
        mag.id,
        fx.memberId,
        "nl",
        later(1),
      );
      expect(await rows(mag.id)).toEqual([
        expect.objectContaining({ userId: fx.memberId, confirmedAt: now }),
      ]);
      expect(
        await m.service.isAccountSubscribed(m.db, mag.id, fx.memberId),
      ).toBe(true);
      await m.service.unsubscribeAccount(m.db, mag.id, fx.memberId);
      await m.service.unsubscribeAccount(m.db, mag.id, fx.memberId);
      expect(
        await m.service.isAccountSubscribed(m.db, mag.id, fx.memberId),
      ).toBe(false);
    });

    it("email subscribe stores a waiting row and mails one link", async () => {
      const mag = await magazine();
      await m.service.subscribeByEmail(
        m,
        {
          magazine: mag,
          email: ` Reader-${fx.sfx}@Example.Test `,
          locale: "nl",
        },
        mailer,
        now,
      );
      const [row] = await rows(mag.id);
      expect(row).toMatchObject({
        email: address(),
        confirmedAt: null,
        locale: "nl",
        confirmSendCount: 1,
      });
      expect(row!.confirmTokenHash).toMatch(/^[a-f0-9]{64}$/);
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0]![0]).toBe(address());
      expect(send.mock.calls[0]![1].text).toContain(
        "/nl/magazine-subscriptions/confirm?t=",
      );
      expect(send.mock.calls[0]![1].text).not.toContain(row!.confirmTokenHash);
    });

    it("asking again soon sends no second mail and answers the same", async () => {
      const mag = await magazine();
      await expect(subscribe(mag)).resolves.toBeUndefined();
      const token = sentToken();
      await expect(
        subscribe(mag, address(), later(5)),
      ).resolves.toBeUndefined();
      expect(send).toHaveBeenCalledTimes(1);
      await expect(
        subscribe(mag, address(), later(11)),
      ).resolves.toBeUndefined();
      expect(send).toHaveBeenCalledTimes(2);
      expect(sentToken(1)).not.toBe(token);
      expect(
        await m.service.readConfirmLink(m, token, later(11)),
      ).toMatchObject({ status: "invalid" });
      await m.service.confirmEmailSubscription(m, sentToken(1), later(12));
      await expect(
        subscribe(mag, address(), later(22)),
      ).resolves.toBeUndefined();
      await m.service.subscribeAccount(m.db, mag.id, fx.memberId, "en", now);
      await expect(
        subscribe(mag, `${fx.memberId}@example.test`),
      ).resolves.toBeUndefined();
      await expect(subscribe(mag, "not an address")).resolves.toBeUndefined();
      expect(send).toHaveBeenCalledTimes(2);
      expect(await rows(mag.id)).toHaveLength(2);
    });

    it("never more than three mails per magazine or five magazines a day", async () => {
      const mag = await magazine();
      for (let i = 0; i < 4; i++)
        await subscribe(mag, address(), later(i * 11));
      expect(send).toHaveBeenCalledTimes(3);
      send.mockClear();
      const magazines = [];
      for (let i = 0; i < 6; i++) magazines.push(await magazine(`daily-${i}`));
      const email = `other-${fx.sfx}@example.test`;
      for (const mag of magazines) await subscribe(mag, email);
      expect(send).toHaveBeenCalledTimes(5);
      await subscribe(magazines[5]!, email, later(24 * 60 + 1));
      expect(send).toHaveBeenCalledTimes(6);
    });

    it("parallel requests cannot beat the daily limit", async () => {
      const magazines = [];
      for (let i = 0; i < 8; i++)
        magazines.push(await magazine(`parallel-${i}`));
      await Promise.all(magazines.map((mag) => subscribe(mag)));
      expect(send).toHaveBeenCalledTimes(5);
      const stored = await m.db
        .select()
        .from(m.schema.magazineSubscriptions)
        .where(eq(m.schema.magazineSubscriptions.email, address()));
      expect(stored.filter((row) => row.confirmSentAt)).toHaveLength(5);
    });

    it("a magazine sends at most 50 confirmation mails a day", async () => {
      const mag = await magazine();
      await Promise.all(
        Array.from({ length: 51 }, (_, i) =>
          subscribe(mag, `reader-${i}-${fx.sfx}@example.test`),
        ),
      );
      expect(send).toHaveBeenCalledTimes(50);
      const waiting = await rows(mag.id);
      expect(waiting).toHaveLength(50);
      const accepted = new Set(waiting.map((row) => row.email));
      const refused = Array.from(
        { length: 51 },
        (_, i) => `reader-${i}-${fx.sfx}@example.test`,
      ).find((email) => !accepted.has(email))!;
      await subscribe(mag, refused, later(24 * 60 + 1));
      expect(send).toHaveBeenCalledTimes(51);
    });

    it("a magazine with nothing public mails nobody", async () => {
      for (const issue of ["none", "members"] as const) {
        const mag = await magazine(issue, { issue });
        await expect(subscribe(mag)).resolves.toBeUndefined();
        expect(await rows(mag.id)).toEqual([]);
      }
      expect(send).not.toHaveBeenCalled();
    });

    it("confirming works once and old links expire", async () => {
      const mag = await magazine();
      await subscribe(mag);
      const token = sentToken();
      const ready = {
        status: "ready",
        magazine: { name: mag.name, slug: mag.slug },
      };
      expect(await m.service.readConfirmLink(m, token, now)).toEqual(ready);
      expect((await rows(mag.id))[0]!.confirmedAt).toBeNull();
      expect(await m.service.confirmEmailSubscription(m, token, now)).toEqual({
        ...ready,
        status: "subscribed",
      });
      expect((await rows(mag.id))[0]!.confirmedAt).toEqual(now);
      expect(
        await m.service.confirmEmailSubscription(m, token, later(1)),
      ).toMatchObject({ status: "subscribed" });
      await subscribe(mag, `expired-${fx.sfx}@example.test`);
      const expired = sentToken(1);
      expect(
        await m.service.readConfirmLink(m, expired, later(8 * 24 * 60)),
      ).toMatchObject({ status: "expired" });
      expect(
        await m.service.confirmEmailSubscription(
          m,
          expired,
          later(8 * 24 * 60),
        ),
      ).toMatchObject({ status: "expired" });
      expect(
        (await rows(mag.id)).find((row) => row.email?.startsWith("expired-"))!
          .confirmedAt,
      ).toBeNull();
      expect(await m.service.readConfirmLink(m, "nonsense", now)).toEqual({
        status: "invalid",
        magazine: null,
      });
    });

    it("an account subscription takes over an email one", async () => {
      const mag = await magazine();
      await subscribe(mag, `${fx.memberId}@example.test`);
      await m.service.confirmEmailSubscription(m, sentToken(), now);
      await m.service.subscribeAccount(
        m.db,
        mag.id,
        fx.memberId,
        "en",
        later(24 * 60),
      );
      expect(await rows(mag.id)).toEqual([
        expect.objectContaining({
          userId: fx.memberId,
          email: null,
          confirmedAt: now,
        }),
      ]);
      await m.service.subscribeAccount(
        m.db,
        mag.id,
        fx.outsiderId,
        "en",
        later(24 * 60),
      );
      expect(
        (await rows(mag.id)).find((row) => row.userId === fx.outsiderId)!
          .confirmedAt,
      ).toEqual(later(24 * 60));
    });

    it("counts subscribers by kind", async () => {
      const mag = await magazine();
      await m.service.subscribeAccount(m.db, mag.id, fx.memberId, "en", now);
      await subscribe(mag);
      await m.service.confirmEmailSubscription(m, sentToken(), now);
      await subscribe(mag, `waiting-${fx.sfx}@example.test`);
      expect(await m.service.countSubscribers(m.db, mag.id)).toEqual({
        withAccount: 1,
        byEmail: 1,
        waiting: 1,
      });
      const row = (await rows(mag.id)).find((row) => row.email === address())!;
      await m.service.removeSubscription(m.db, row.id);
      await m.service.removeSubscription(m.db, row.id);
      expect(await m.service.countSubscribers(m.db, mag.id)).toEqual({
        withAccount: 1,
        byEmail: 0,
        waiting: 1,
      });
    });

    it("removes links nobody confirmed after 30 days", async () => {
      const mag = await magazine();
      const old = later(-31 * 24 * 60);
      await m.db.insert(m.schema.magazineSubscriptions).values([
        {
          magazineId: mag.id,
          email: `old-${fx.sfx}@example.test`,
          createdAt: old,
        },
        {
          magazineId: mag.id,
          email: `resent-${fx.sfx}@example.test`,
          createdAt: old,
          confirmSentAt: later(-2 * 24 * 60),
        },
        {
          magazineId: mag.id,
          email: `confirmed-${fx.sfx}@example.test`,
          createdAt: old,
          confirmedAt: old,
        },
        {
          magazineId: mag.id,
          email: `fresh-${fx.sfx}@example.test`,
          createdAt: now,
        },
      ]);
      expect(await m.service.purgeUnconfirmedSubscriptions(m.db, now)).toBe(1);
      expect(await rows(mag.id)).toHaveLength(3);
    });

    it("a send that throws never fails the subscribe", async () => {
      const mag = await magazine();
      const log = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      try {
        send.mockRejectedValueOnce(new Error(address()));
        await expect(subscribe(mag)).resolves.toBeUndefined();
        send.mockResolvedValueOnce(false);
        await expect(
          subscribe(mag, `false-${fx.sfx}@example.test`),
        ).resolves.toBeUndefined();
        expect(log.mock.calls).toEqual([
          ["[magazines] confirmation mail failed"],
          ["[magazines] confirmation mail failed"],
        ]);
      } finally {
        log.mockRestore();
      }
    });
  },
);
