// @vitest-environment node
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { issuePath } from "@/lib/magazines/paths";
import type { Magazine } from "@/payload-types";
import type * as Schema from "@/server/db/schema";
import { verifyUnsubscribeToken } from "@/server/notifications/unsubscribe-token";

import type * as Announcements from "./announcements";
import type { Deps } from "./deps";
import type * as Issues from "./issue-service";
import type {
  MagazineMailer,
  OutgoingMagazineMail,
} from "./subscriptions/mail";

vi.mock("@/server/email", () => ({ sendGatedEmail: vi.fn(async () => true) }));

function isLocalDbConfigured(): boolean {
  if (process.env.RUN_DB_TESTS !== "1") return false;
  const url = process.env.DATABASE_URL?.trim() ?? "";
  if (/neon\.tech|neon\.build|pooler\.[^/]*\.neon/i.test(url)) return false;
  return /(@|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0|db|postgres|host\.docker\.internal)(:|\/)/i.test(
    url,
  );
}
const now = new Date("2026-10-27T14:00:00Z");
const before = new Date(now.getTime() - 1000);
const secret = "announcement-test-secret";
const richText = {
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
        children: [{ type: "text", text: "Hello readers" }],
      },
    ],
  },
};

describe.skipIf(!isLocalDbConfigured())(
  "magazine announcements [DB integration]",
  { timeout: 60_000 },
  () => {
    let m: Deps & {
      s: typeof Schema;
      a: typeof Announcements;
      issues: typeof Issues;
    };
    let fx: {
      ids: string[];
      owner: string;
      member: string;
      outsider: string;
      pending: string;
      community: { id: string; slug: string; isListedInDirectory: boolean };
      magazine: Magazine;
      x: string;
      w: string;
    };
    let send: ReturnType<
      typeof vi.fn<(to: string, mail: OutgoingMagazineMail) => Promise<boolean>>
    >;
    let mailer: MagazineMailer;

    beforeAll(async () => {
      const [{ db }, s, { getPayloadClient }, a, issues] = await Promise.all([
        import("@/server/db"),
        import("@/server/db/schema"),
        import("@/server/payload"),
        import("./announcements"),
        import("./issue-service"),
      ]);
      m = { db, s, payload: await getPayloadClient(), a, issues };
    }, 120_000);
    beforeEach(async () => {
      vi.stubEnv("DIGEST_UNSUBSCRIBE_SECRET", secret);
      const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      const ids = ["owner", "member", "outsider", "pending"].map(
        (role) => `ann-${role}-${suffix}`,
      );
      const [owner, member, outsider, pending] = ids as [
        string,
        string,
        string,
        string,
      ];
      await m.db
        .insert(m.s.user)
        .values(
          ids.map((id) => ({ id, name: id, email: `${id}@example.test` })),
        );
      await m.db
        .insert(m.s.memberProfiles)
        .values(ids.map((userId) => ({ userId, displayName: userId })));
      const [community] = await m.db
        .insert(m.s.communities)
        .values({
          name: "Garden club",
          slug: `ann-${suffix}`,
          createdBy: owner,
          isListedInDirectory: true,
        })
        .returning();
      await m.db.insert(m.s.communityMemberships).values([
        { communityId: community!.id, userId: owner, role: "owner" },
        { communityId: community!.id, userId: member, role: "member" },
        {
          communityId: community!.id,
          userId: pending,
          role: "member",
          status: "pending_approval",
        },
      ]);
      const { saveMagazineSettings } = await import("./magazine-service");
      const magazine = await saveMagazineSettings(
        m,
        community!,
        {
          name: "The Gazette",
          slug: `ann-${suffix}`,
          topics: [],
          defaultVisibility: "public",
        },
        owner,
        true,
      );
      const x = `ann-x-${suffix}`,
        w = `ann-w-${suffix}`;
      fx = {
        ids,
        owner,
        member,
        outsider,
        pending,
        community: community!,
        magazine,
        x,
        w,
      };
      await m.db.insert(m.s.magazineSubscriptions).values([
        ...[member, outsider, pending].map((userId) => ({
          magazineId: magazine.id,
          userId,
          confirmedAt: before,
        })),
        {
          id: x,
          magazineId: magazine.id,
          email: `x-${suffix}@example.test`,
          locale: "nl",
          confirmedAt: before,
        },
        {
          id: w,
          magazineId: magazine.id,
          email: `w-${suffix}@example.test`,
          confirmedAt: null,
        },
      ]);
      send = vi.fn(async () => true);
      mailer = {
        send,
        env: { VERCEL_ENV: "production", NODE_ENV: "production" },
        sleep: vi.fn(async () => undefined),
      };
    });
    afterEach(async () => {
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
      if (!fx) return;
      const { db, s, payload } = m;
      await db
        .delete(s.magazineSubscriptions)
        .where(eq(s.magazineSubscriptions.magazineId, fx.magazine.id));
      await payload.delete({
        collection: "magazine-issues",
        where: { magazine: { equals: fx.magazine.id } },
      });
      await payload.delete({ collection: "magazines", id: fx.magazine.id });
      await db
        .delete(s.magazineStaff)
        .where(eq(s.magazineStaff.magazineId, fx.magazine.id));
      await db
        .delete(s.spaces)
        .where(eq(s.spaces.communityId, fx.community.id));
      await db
        .delete(s.communityMemberships)
        .where(eq(s.communityMemberships.communityId, fx.community.id));
      await db
        .delete(s.communities)
        .where(eq(s.communities.id, fx.community.id));
      await db
        .delete(s.notifications)
        .where(inArray(s.notifications.userId, fx.ids));
      await db
        .delete(s.pointsEvents)
        .where(inArray(s.pointsEvents.userId, fx.ids));
      await db
        .delete(s.activityEvents)
        .where(inArray(s.activityEvents.actorId, fx.ids));
      await db
        .delete(s.memberBadges)
        .where(inArray(s.memberBadges.userId, fx.ids));
      await db
        .delete(s.memberProfiles)
        .where(inArray(s.memberProfiles.userId, fx.ids));
      await db.delete(s.user).where(inArray(s.user.id, fx.ids));
    });
    const actor = () => ({ userId: fx.owner, community: fx.community });
    async function draft(visibility: "public" | "members" = "public") {
      const issue = await m.issues.createIssue(
        m,
        fx.magazine,
        { title: "Autumn" },
        actor(),
      );
      const changed = await m.issues.updateIssueDetails(
        m,
        issue,
        { visibility },
        issue.updatedAt,
        actor(),
        true,
      );
      const { issue: filled } = await m.issues.setIssueItems(
        m,
        changed,
        [{ kind: "editorial", body: richText }],
        changed.updatedAt,
        actor(),
      );
      await m.payload.update({
        collection: "magazine-issues",
        id: filled.id,
        locale: "nl",
        data: { title: "Herfst", items: filled.items },
      });
      return m.payload.findByID({
        collection: "magazine-issues",
        id: filled.id,
        depth: 0,
      });
    }
    async function publish(visibility: "public" | "members" = "public") {
      const issue = await draft(visibility);
      return m.issues.publishIssue(m, issue, issue.updatedAt, actor(), { now });
    }
    const run = (time = now) =>
      m.a.deliverPendingAnnouncements(m, mailer, time);
    const announcement = (id: number) =>
      m.db.query.magazineIssueAnnouncements.findFirst({
        where: eq(m.s.magazineIssueAnnouncements.issueId, id),
      });
    const notices = () =>
      m.db
        .select()
        .from(m.s.notifications)
        .where(
          and(
            eq(m.s.notifications.communityId, fx.community.id),
            eq(m.s.notifications.type, "magazine_issue_published"),
          ),
        );
    async function resetInbox() {
      await m.db
        .delete(m.s.notifications)
        .where(eq(m.s.notifications.communityId, fx.community.id));
      await m.db
        .delete(m.s.magazineIssueDeliveries)
        .where(
          and(
            eq(m.s.magazineIssueDeliveries.channel, "inbox"),
            inArray(
              m.s.magazineIssueDeliveries.subscriptionId,
              m.db
                .select({ id: m.s.magazineSubscriptions.id })
                .from(m.s.magazineSubscriptions)
                .where(
                  eq(m.s.magazineSubscriptions.magazineId, fx.magazine.id),
                ),
            ),
          ),
        );
    }

    it("a members-only issue reaches members only", async () => {
      const issue = await publish("members");
      const rows = await notices();
      expect(rows.map((r) => r.userId)).toEqual([fx.member]);
      expect(rows[0]!.metadata).toMatchObject({
        reviewPath: issuePath(fx.magazine, issue),
      });
      expect(await run()).toMatchObject({ email: 0, completed: 1 });
      expect((await announcement(issue.id))!.completedAt).not.toBeNull();
      expect(await run()).toEqual({ inbox: 0, email: 0, completed: 0 });
      expect(send).not.toHaveBeenCalled();
    });
    it("a public issue reaches every subscriber once", async () => {
      const issue = await publish();
      expect((await notices()).map((r) => r.userId).sort()).toEqual(
        [fx.member, fx.outsider, fx.pending].sort(),
      );
      expect(await run()).toMatchObject({ email: 1, completed: 1 });
      expect(await run()).toEqual({ inbox: 0, email: 0, completed: 0 });
      expect(send).toHaveBeenCalledTimes(1);
      const [to, mail] = send.mock.calls[0]!;
      expect(to).toContain("x-");
      expect(mail.subject).toBe("The Gazette: Herfst");
      expect(mail.text).toContain(
        "Nummer 1 van The Gazette, van Garden club, is uit.",
      );
      expect(mail.headers!["List-Unsubscribe-Post"]).toBe(
        "List-Unsubscribe=One-Click",
      );
      expect(mail.headers!["List-Unsubscribe"]).toContain(
        "/api/email/unsubscribe?t=",
      );
      const url = /https:\/\/\S*\/unsubscribe\?t=\S+/.exec(mail.text)![0];
      expect(
        verifyUnsubscribeToken(new URL(url).searchParams.get("t")!, secret),
      ).toEqual({ scope: "magazine", subscriptionId: fx.x });
      expect((await announcement(issue.id))!.completedAt).not.toBeNull();
      expect(mailer.sleep).toHaveBeenCalledWith(600);
    });
    it("two deliveries at once still tell each subscriber once", async () => {
      const issue = await publish();
      await resetInbox();
      const counts = await Promise.all([
        m.a.deliverInboxAnnouncement(m, issue.id),
        m.a.deliverInboxAnnouncement(m, issue.id),
      ]);
      expect(counts.reduce((a, b) => a + b, 0)).toBe(3);
      expect((await notices()).map((r) => r.userId).sort()).toEqual(
        [fx.member, fx.outsider, fx.pending].sort(),
      );
      await Promise.all([run(), run()]);
      expect(send).toHaveBeenCalledTimes(1);
    });
    it("late subscribers and leavers are not told", async () => {
      const issue = await publish();
      const publishedAt = (await announcement(issue.id))!.publishedAt;
      const late = new Date(publishedAt.getTime() + 1000);
      await m.db.insert(m.s.magazineSubscriptions).values([
        { magazineId: fx.magazine.id, userId: fx.owner, confirmedAt: late },
        {
          magazineId: fx.magazine.id,
          email: "late@example.test",
          confirmedAt: late,
        },
      ]);
      const { removeSubscription } = await import("./subscriptions/service");
      await removeSubscription(m.db, fx.x);
      await run();
      expect(send).not.toHaveBeenCalled();
      expect((await notices()).some((r) => r.userId === fx.owner)).toBe(false);
      const next = await draft();
      await m.issues.publishIssue(m, next, next.updatedAt, actor(), {
        now: new Date(late.getTime() + 1000),
      });
      await run(new Date(late.getTime() + 1000));
      expect(send).toHaveBeenCalledExactlyOnceWith(
        "late@example.test",
        expect.anything(),
      );
      expect(
        (await notices()).filter((r) => r.userId === fx.owner),
      ).toHaveLength(1);
    });
    it("someone who subscribed at the very moment of publishing is told", async () => {
      const issue = await publish();
      const publishedAt = (await announcement(issue.id))!.publishedAt;
      await m.db.insert(m.s.magazineSubscriptions).values({
        magazineId: fx.magazine.id,
        userId: fx.owner,
        confirmedAt: publishedAt,
      });
      expect(await m.a.deliverInboxAnnouncement(m, issue.id)).toBe(1);
      expect(
        (await notices()).filter((r) => r.userId === fx.owner),
      ).toHaveLength(1);
    });
    it("who is told matches the resolver", async () => {
      const { issueAccessFacts, issueAudience, resolveMagazineIssueAccess } =
        await import("./issue-access");
      const { loadMagazineEditorship, NO_STANDING } =
        await import("./editorship");
      for (const kind of ["listed", "members", "unconfirmed"] as const) {
        const issue = await publish(kind === "members" ? "members" : "public");
        if (kind === "unconfirmed")
          await m.db
            .update(m.s.communities)
            .set({ isListedInDirectory: false })
            .where(eq(m.s.communities.id, fx.community.id));
        await resetInbox();
        const community = {
          ...fx.community,
          deleted: false,
          isListedInDirectory: kind !== "unconfirmed",
        };
        const facts = issueAccessFacts(issue)!;
        const audience = issueAudience(community, facts);
        const context = {
          issueId: issue.id,
          magazineId: fx.magazine.id,
          communityId: fx.community.id,
          publishedAt: (await announcement(issue.id))!.publishedAt,
          audience,
        };
        const eligible = await m.a.eligibleInboxSubscriptions(m.db, context);
        for (const userId of [fx.member, fx.outsider, fx.pending]) {
          const viewer = await loadMagazineEditorship(
            m.db,
            { communityId: fx.community.id, magazineId: fx.magazine.id },
            userId,
          );
          expect(eligible.some((row) => row.userId === userId)).toBe(
            resolveMagazineIssueAccess({ viewer, community, issue: facts }) !==
              "none",
          );
        }
        const emails = await m.a.eligibleEmailSubscriptions(m.db, context);
        expect(emails.some((row) => row.id === fx.x)).toBe(
          audience === "everyone",
        );
        expect(audience === "everyone").toBe(
          resolveMagazineIssueAccess({
            viewer: NO_STANDING,
            community,
            issue: facts,
          }) === "full",
        );
      }
    });
    it("a refused send is tried again next run; a send that throws is not", async () => {
      const issue = await publish();
      send.mockResolvedValueOnce(false);
      await run();
      expect(
        await m.db.query.magazineIssueDeliveries.findFirst({
          where: eq(m.s.magazineIssueDeliveries.subscriptionId, fx.x),
        }),
      ).toBeUndefined();
      expect((await announcement(issue.id))!.completedAt).toBeNull();
      await run();
      expect(send).toHaveBeenCalledTimes(2);
      await publish();
      send.mockRejectedValueOnce(new Error("Send uncertain"));
      await run();
      await run();
      expect(send).toHaveBeenCalledTimes(3);
    });
    it("outside production only the test address is mailed and the issue stays open", async () => {
      const issue = await publish();
      mailer.env = { VERCEL_ENV: "preview", NODE_ENV: "production" };
      await m.db.insert(m.s.magazineSubscriptions).values({
        magazineId: fx.magazine.id,
        email: "greg@klevox.com",
        confirmedAt: before,
      });
      await run();
      expect(send).toHaveBeenCalledExactlyOnceWith(
        "greg@klevox.com",
        expect.anything(),
      );
      expect((await announcement(issue.id))!.completedAt).toBeNull();
      expect(
        await m.db.query.magazineIssueDeliveries.findFirst({
          where: eq(m.s.magazineIssueDeliveries.subscriptionId, fx.x),
        }),
      ).toBeUndefined();
    });
    it("announcements that never finish do not block newer ones", async () => {
      mailer.env = { VERCEL_ENV: "preview", NODE_ENV: "production" };

      for (let i = 0; i < 11; i++) await publish();
      await resetInbox();
      await run();
      const rows = await m.db
        .select()
        .from(m.s.magazineIssueAnnouncements)
        .where(eq(m.s.magazineIssueAnnouncements.magazineId, fx.magazine.id));
      expect(rows.filter((r) => r.lastAttemptedAt !== null)).toHaveLength(10);
      const last = rows.find((r) => r.lastAttemptedAt === null)!;
      await run(new Date(now.getTime() + 1000));
      expect(
        (await announcement(last.issueId))!.lastAttemptedAt,
      ).not.toBeNull();
      expect(
        (await notices()).some(
          (r) => (r.metadata as { issueId: number }).issueId === last.issueId,
        ),
      ).toBe(true);
    });
    it("old open announcements are given up after a week", async () => {
      const issue = await publish();
      await resetInbox();
      const log = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      await m.db
        .update(m.s.magazineIssueAnnouncements)
        .set({ publishedAt: new Date(now.getTime() - 8 * 86400000) })
        .where(eq(m.s.magazineIssueAnnouncements.issueId, issue.id));
      await m.db
        .update(m.s.magazineSubscriptions)
        .set({ confirmedAt: new Date(now.getTime() - 9 * 86400000) })
        .where(
          and(
            eq(m.s.magazineSubscriptions.magazineId, fx.magazine.id),
            sql`${m.s.magazineSubscriptions.confirmedAt} IS NOT NULL`,
          ),
        );
      expect(await run()).toMatchObject({ completed: 1, email: 0, inbox: 0 });
      expect((await announcement(issue.id))!.completedAt).not.toBeNull();
      expect(send).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith("[magazines] announcement given up", {
        issueId: issue.id,
        leftOver: 4,
      });
    });
    it("a refused send reopens a completed announcement", async () => {
      const issue = await publish();
      send.mockImplementationOnce(async () => {
        await m.db.execute(
          sql`UPDATE app.magazine_issue_announcement SET completed_at = ${now} WHERE issue_id = ${issue.id}`,
        );
        return false;
      });
      await run();
      expect((await announcement(issue.id))!.completedAt).toBeNull();
      expect(
        await m.db.query.magazineIssueDeliveries.findFirst({
          where: eq(m.s.magazineIssueDeliveries.subscriptionId, fx.x),
        }),
      ).toBeUndefined();
      await run();
      expect(send).toHaveBeenCalledTimes(2);
    });
    it("a stale completion cannot overwrite a refused send's reopening", async () => {
      const issue = await publish();
      let startSend!: () => void;
      let refuse!: (sent: boolean) => void;
      const started = new Promise<void>((resolve) => {
        startSend = resolve;
      });
      const refused = new Promise<boolean>((resolve) => {
        refuse = resolve;
      });
      send.mockImplementationOnce(async () => {
        startSend();
        return refused;
      });
      const first = run();
      await started;
      // Delay a completion made outside the eligibility transaction until the
      // refusal has reopened the row. Transactional completion holds its lock
      // through the check/update and therefore cannot make this stale write.
      const lateCompleter = {
        ...m,
        db: new Proxy(m.db, {
          get(target, key, receiver) {
            if (key !== "update")
              return Reflect.get(target, key, receiver) as unknown;
            return (table: typeof m.s.magazineIssueAnnouncements) => {
              const builder = target.update(table);
              const set = builder.set.bind(builder);
              builder.set = (values) => {
                const query = set(values);
                if (values.completedAt) {
                  const returning = query.returning.bind(query);
                  query.returning = (() => {
                    refuse(false);
                    return first.then(() => returning());
                  }) as typeof query.returning;
                }
                return query;
              };
              return builder;
            };
          },
        }),
      };
      await m.a.deliverPendingAnnouncements(lateCompleter, mailer, now);
      refuse(false);
      await first;
      expect((await announcement(issue.id))!.completedAt).toBeNull();
      expect(
        await m.db.query.magazineIssueDeliveries.findFirst({
          where: eq(m.s.magazineIssueDeliveries.subscriptionId, fx.x),
        }),
      ).toBeUndefined();
      await run();
      expect(send).toHaveBeenCalledTimes(2);
    });

    it("a public issue switched to members before the email run emails nobody", async () => {
      const issue = await publish();
      await m.issues.updateIssueDetails(
        m,
        issue,
        { visibility: "members" },
        issue.updatedAt,
        actor(),
        true,
      );
      await run();
      expect(send).not.toHaveBeenCalled();
      expect((await announcement(issue.id))!.completedAt).not.toBeNull();
    });
    it("a failed inbox insert rolls back its claims and can be retried", async () => {
      const issue = await publish();
      await resetInbox();
      const noticesModule = await import("./notifications");
      const error = new Error("private@example.test");
      vi.spyOn(noticesModule, "insertMagazineNoticesIn").mockRejectedValueOnce(
        error,
      );
      const log = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      expect(await m.a.deliverInboxAnnouncement(m, issue.id)).toBe(0);
      expect(await notices()).toHaveLength(0);
      expect(
        await m.db
          .select()
          .from(m.s.magazineIssueDeliveries)
          .where(
            and(
              eq(m.s.magazineIssueDeliveries.issueId, issue.id),
              eq(m.s.magazineIssueDeliveries.channel, "inbox"),
            ),
          ),
      ).toHaveLength(0);
      expect(log).toHaveBeenCalledWith(
        "[magazines] inbox announcement failed",
        { issueId: issue.id, error },
      );
      expect(JSON.stringify(log.mock.calls)).not.toContain("@");
      expect(await m.a.deliverInboxAnnouncement(m, issue.id)).toBe(3);
    });

    it("a missing unsubscribe secret leaves email available for a later run", async () => {
      const issue = await publish();
      vi.stubEnv("DIGEST_UNSUBSCRIBE_SECRET", "");
      vi.stubEnv("BETTER_AUTH_SECRET", "");
      const log = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      await run();
      expect(send).not.toHaveBeenCalled();
      expect((await announcement(issue.id))!.completedAt).toBeNull();
      expect(
        await m.db.query.magazineIssueDeliveries.findFirst({
          where: eq(m.s.magazineIssueDeliveries.subscriptionId, fx.x),
        }),
      ).toBeUndefined();
      expect(log).toHaveBeenCalledWith(
        "[magazines] announcement email secret missing",
      );
      vi.stubEnv("DIGEST_UNSUBSCRIBE_SECRET", secret);
      await run();
      expect(send).toHaveBeenCalledTimes(1);
    });

    it("a rendering failure leaves the email unclaimed for another run", async () => {
      await publish();
      const mail = await import("./subscriptions/mail");
      vi.spyOn(mail, "issueMail").mockRejectedValueOnce(
        new Error("Messages unavailable"),
      );
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      await run();
      expect(send).not.toHaveBeenCalled();
      expect(
        await m.db.query.magazineIssueDeliveries.findFirst({
          where: eq(m.s.magazineIssueDeliveries.subscriptionId, fx.x),
        }),
      ).toBeUndefined();
      await run();
      expect(send).toHaveBeenCalledTimes(1);
    });

    it("the email budget is shared across issues and unfinished work continues next run", async () => {
      await m.db.insert(m.s.magazineSubscriptions).values(
        Array.from({ length: 100 }, (_, i) => ({
          magazineId: fx.magazine.id,
          email: `budget-${i}@example.test`,
          confirmedAt: before,
        })),
      );
      await publish();
      await publish();
      expect(await run()).toMatchObject({ email: 100 });
      expect(await run(new Date(now.getTime() + 1000))).toMatchObject({
        email: 100,
      });
      expect(await run(new Date(now.getTime() + 2000))).toMatchObject({
        email: 2,
      });
      expect(send).toHaveBeenCalledTimes(202);
      expect(
        new Set(send.mock.calls.map(([to, mail]) => `${to}:${mail.text}`)).size,
      ).toBe(202);
      expect(await run(new Date(now.getTime() + 3000))).toEqual({
        inbox: 0,
        email: 0,
        completed: 0,
      });
    });

    it("publishing and cleanup failures do not skip announcement delivery", async () => {
      await publish();
      const scheduled = await import("./scheduled-publishing");
      const subscriptions = await import("./subscriptions/service");
      vi.spyOn(scheduled, "publishDueIssues").mockRejectedValueOnce(
        new Error("Publish unavailable"),
      );
      vi.spyOn(
        subscriptions,
        "purgeUnconfirmedSubscriptions",
      ).mockRejectedValueOnce(new Error("Cleanup unavailable"));
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const { runMagazineIssueJobs } = await import("./issue-jobs");
      expect(await runMagazineIssueJobs(m, { now, mailer })).toMatchObject({
        published: 0,
        purged: 0,
        email: 1,
        completed: 1,
      });
      expect(send).toHaveBeenCalledTimes(1);
    });

    it("a scheduled issue tells subscribers through the same path", async () => {
      const issue = await draft();
      const due = new Date(now.getTime() + 60000);
      await m.issues.scheduleIssue(
        m,
        issue,
        due,
        issue.updatedAt,
        actor(),
        now,
      );
      const { runMagazineIssueJobs } = await import("./issue-jobs");
      expect(await runMagazineIssueJobs(m, { now: due, mailer })).toMatchObject(
        { published: 1, email: 1 },
      );
      expect((await notices()).some((r) => r.userId === fx.member)).toBe(true);
      expect(send).toHaveBeenCalledTimes(1);
    });
  },
);
