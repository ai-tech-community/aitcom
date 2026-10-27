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
import { and, eq, inArray } from "drizzle-orm";

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
import type { createCaller as CreateCaller } from "@/server/api/root";

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
  "magazine subscription API [DB integration]",
  { timeout: 60_000 },
  () => {
    let m: {
      db: typeof Db;
      schema: typeof Schema;
      payload: PayloadClient;
      service: typeof Service;
      magazines: typeof Magazines;
      issues: typeof Issues;
      createCaller: typeof CreateCaller;
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
    let scheduled: Array<() => Promise<void>>;

    beforeAll(async () => {
      const [
        { db },
        schema,
        { getPayloadClient },
        service,
        magazines,
        issues,
        { createCaller },
      ] = await Promise.all([
        import("@/server/db"),
        import("@/server/db/schema"),
        import("@/server/payload"),
        import("@/server/magazines/subscriptions/service"),
        import("@/server/magazines/magazine-service"),
        import("@/server/magazines/issue-service"),
        import("@/server/api/root"),
      ]);
      m = {
        db,
        schema,
        payload: await getPayloadClient(),
        service,
        magazines,
        issues,
        createCaller,
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
        recipient: (to) => to,
        sleep: async () => undefined,
      };
      now = new Date();
      scheduled = [];
    });

    afterEach(async () => {
      await runScheduled();
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

    function callerAs(userId: string | null, ip = `ip-${fx.sfx}`) {
      return m.createCaller({
        db: m.db,
        afterResponse: (task) => scheduled.push(task),
        headers: new Headers({ "x-forwarded-for": ip }),
        session: userId
          ? ({ user: { id: userId, name: userId }, session: {} } as never)
          : null,
      }).magazineSubscriptions;
    }

    async function runScheduled() {
      for (const task of scheduled.splice(0)) await task();
    }

    it("only people who may see the magazine can subscribe", async () => {
      const hidden = await magazine("hidden", {
        listed: false,
        issue: "members",
      });
      const input = { magazineSlug: hidden.slug, locale: "en" as const };
      await expect(callerAs(fx.outsiderId).status(input)).rejects.toMatchObject(
        { code: "NOT_FOUND" },
      );
      await expect(
        callerAs(fx.outsiderId).subscribe(input),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(
        callerAs(null).subscribeByEmail({ ...input, email: address() }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(callerAs(fx.memberId).subscribe(input)).resolves.toEqual({
        subscribed: true,
      });
      const publicMag = await magazine("public");
      await expect(
        callerAs(fx.outsiderId).subscribe({
          ...input,
          magazineSlug: publicMag.slug,
        }),
      ).resolves.toEqual({ subscribed: true });
      await expect(
        callerAs(null).subscribeByEmail({
          ...input,
          magazineSlug: publicMag.slug,
          email: address(),
        }),
      ).resolves.toEqual({ ok: true });
      await expect(
        callerAs(fx.outsiderId).status({ magazineSlug: `missing-${fx.sfx}` }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("subscribing through the API takes over the reader's email subscription", async () => {
      const mag = await magazine();
      await subscribe(mag, `${fx.memberId}@example.test`);
      await m.service.confirmEmailSubscription(m, sentToken(), now);
      await callerAs(fx.memberId).subscribe({
        magazineSlug: mag.slug,
        locale: "en",
      });
      expect(await rows(mag.id)).toEqual([
        expect.objectContaining({
          email: null,
          userId: fx.memberId,
          confirmedAt: now,
        }),
      ]);
    });

    it("tells a reader whether they subscribe", async () => {
      const mag = await magazine();
      const input = { magazineSlug: mag.slug };
      expect(await callerAs(null).status(input)).toEqual({
        signedIn: false,
        subscribed: false,
      });
      expect(await callerAs(fx.memberId).status(input)).toEqual({
        signedIn: true,
        subscribed: false,
      });
      await callerAs(fx.memberId).subscribe({ ...input, locale: "nl" });
      expect(await callerAs(fx.memberId).status(input)).toEqual({
        signedIn: true,
        subscribed: true,
      });
    });

    it("anyone subscribed can leave, even after losing access", async () => {
      const mag = await magazine("leaving", {
        listed: false,
        issue: "members",
      });
      const caller = callerAs(fx.memberId);
      const input = { magazineSlug: mag.slug };
      await caller.subscribe({ ...input, locale: "en" });
      await m.db
        .delete(m.schema.communityMemberships)
        .where(
          and(
            eq(m.schema.communityMemberships.communityId, mag.community.id),
            eq(m.schema.communityMemberships.userId, fx.memberId),
          ),
        );
      await expect(caller.status(input)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      await expect(caller.unsubscribe(input)).resolves.toEqual({
        subscribed: false,
      });
      await expect(caller.unsubscribe(input)).resolves.toEqual({
        subscribed: false,
      });
      expect(await rows(mag.id)).toEqual([]);
    });

    it("too many tries from one address are refused", async () => {
      const mag = await magazine("rate", { issue: "none" });
      const input = {
        magazineSlug: mag.slug,
        email: address(),
        locale: "en" as const,
      };
      const anonymous = callerAs(null);
      for (let i = 0; i < 10; i++)
        await expect(anonymous.subscribeByEmail(input)).resolves.toEqual({
          ok: true,
        });
      await expect(anonymous.subscribeByEmail(input)).rejects.toMatchObject({
        code: "TOO_MANY_REQUESTS",
      });
      await expect(
        callerAs(null, `other-${fx.sfx}`).subscribeByEmail(input),
      ).resolves.toEqual({ ok: true });
    });

    it("unknown, known and confirmed addresses get the same answer", async () => {
      const mag = await magazine();
      const input = {
        magazineSlug: mag.slug,
        email: address(),
        locale: "en" as const,
      };
      const caller = callerAs(null);
      const unknown = await caller.subscribeByEmail(input);
      await runScheduled();
      const known = await caller.subscribeByEmail(input);
      await runScheduled();
      await m.db
        .update(m.schema.magazineSubscriptions)
        .set({ confirmedAt: now })
        .where(eq(m.schema.magazineSubscriptions.magazineId, mag.id));
      const confirmed = await caller.subscribeByEmail(input);
      await runScheduled();
      expect([unknown, known, confirmed]).toEqual([
        { ok: true },
        { ok: true },
        { ok: true },
      ]);
      await expect(
        caller.subscribeByEmail({ ...input, email: "invalid" }),
      ).resolves.toEqual({ ok: true });
      await expect(caller.subscribe(input)).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
    });
  },
);
