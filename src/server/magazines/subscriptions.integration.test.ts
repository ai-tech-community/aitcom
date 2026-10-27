// @vitest-environment node
import { eq, inArray } from "drizzle-orm";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type * as ConfirmRoute from "@/app/api/magazine-subscriptions/confirm/route";
import type * as UnsubscribeRoute from "@/app/api/email/unsubscribe/route";
import type { createCaller } from "@/server/api/root";
import type * as Schema from "@/server/db/schema";
import { sendGatedEmail } from "@/server/email";
import { verifyUnsubscribeToken } from "@/server/notifications/unsubscribe-token";

import type { Deps } from "./deps";
import type * as IssueJobs from "./issue-jobs";
import type * as Reading from "./reading";
import type {
  MagazineMailer,
  OutgoingMagazineMail,
} from "./subscriptions/mail";
import type * as Subscriptions from "./subscriptions/service";

vi.mock("@/server/email", () => ({ sendGatedEmail: vi.fn(async () => true) }));

function isLocalDbConfigured(): boolean {
  if (process.env.RUN_DB_TESTS !== "1") return false;
  const url = process.env.DATABASE_URL?.trim() ?? "";
  if (/neon\.tech|neon\.build|pooler\.[^/]*\.neon/i.test(url)) return false;
  return /(@|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0|db|postgres|host\.docker\.internal)(:|\/)/i.test(
    url,
  );
}

const secret = "subscription-guarantee-test-secret";
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
        children: [{ type: "text", text: "News from the garden" }],
      },
    ],
  },
};

describe.skipIf(!isLocalDbConfigured())(
  "magazine subscription guarantees [DB integration]",
  { timeout: 60_000 },
  () => {
    let m: Deps & {
      schema: typeof Schema;
      createCaller: typeof createCaller;
      confirm: typeof ConfirmRoute.POST;
      unsubscribe: typeof UnsubscribeRoute.POST;
      runMagazineIssueJobs: typeof IssueJobs.runMagazineIssueJobs;
      loadIssuePage: typeof Reading.loadIssuePage;
      readConfirmLink: typeof Subscriptions.readConfirmLink;
    };
    let fx: {
      ids: string[];
      ownerId: string;
      memberId: string;
      contributorId: string;
      outsiderId: string;
      communitySlug: string;
      communityId?: string;
      magazineSlug: string;
      magazineId?: number;
      email: string;
    };
    let send: ReturnType<
      typeof vi.fn<(to: string, mail: OutgoingMagazineMail) => Promise<boolean>>
    >;
    let mailer: MagazineMailer;
    let scheduledWork: Array<() => Promise<void>>;

    beforeAll(async () => {
      const [
        { db },
        schema,
        { createCaller },
        { getPayloadClient },
        { POST: confirm },
        { POST: unsubscribe },
        { runMagazineIssueJobs },
        { loadIssuePage },
        { readConfirmLink },
      ] = await Promise.all([
        import("@/server/db"),
        import("@/server/db/schema"),
        import("@/server/api/root"),
        import("@/server/payload"),
        import("@/app/api/magazine-subscriptions/confirm/route"),
        import("@/app/api/email/unsubscribe/route"),
        import("./issue-jobs"),
        import("./reading"),
        import("./subscriptions/service"),
      ]);
      m = {
        db,
        schema,
        createCaller,
        payload: await getPayloadClient(),
        confirm,
        unsubscribe,
        runMagazineIssueJobs,
        loadIssuePage,
        readConfirmLink,
      };
    }, 120_000);

    function callerAs(userId: string | null) {
      return m.createCaller({
        db: m.db,
        afterResponse: (task) => scheduledWork.push(task),
        headers: new Headers({ "x-forwarded-for": "192.0.2.91" }),
        session: userId
          ? ({ user: { id: userId, name: userId }, session: {} } as never)
          : null,
      });
    }

    async function publicDraft(title: string) {
      const owner = callerAs(fx.ownerId).magazines;
      const { id } = await owner.createIssue({ slug: fx.communitySlug, title });
      const ref = { slug: fx.communitySlug, issueId: id };
      const editing = await owner.getIssueForEditing(ref);
      const { issue } = await owner.setIssueItems({
        ...ref,
        expectedUpdatedAt: editing.issue.updatedAt,
        items: [{ kind: "editorial", body: richText }],
      });
      return owner.updateIssue({
        ...ref,
        expectedUpdatedAt: issue.updatedAt,
        visibility: "public",
      });
    }

    beforeEach(async () => {
      vi.stubEnv("DIGEST_UNSUBSCRIBE_SECRET", secret);
      vi.mocked(sendGatedEmail).mockClear();
      send = vi.fn(async () => true);
      mailer = {
        send,
        recipient: (to) => to,
        sleep: async () => undefined,
      };
      scheduledWork = [];
      const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      const ids = ["owner", "member", "contributor", "outsider"].map(
        (role) => `guarantee-${role}-${suffix}`,
      );
      const [ownerId, memberId, contributorId, outsiderId] = ids as [
        string,
        string,
        string,
        string,
      ];
      fx = {
        ids,
        ownerId,
        memberId,
        contributorId,
        outsiderId,
        communitySlug: `guarantee-${suffix}`,
        magazineSlug: `gazette-${suffix}`,
        email: `reader-${suffix}@example.test`,
      };
      await m.db
        .insert(m.schema.user)
        .values(
          ids.map((id) => ({ id, name: id, email: `${id}@example.test` })),
        );
      await m.db
        .insert(m.schema.memberProfiles)
        .values(ids.map((userId) => ({ userId, displayName: userId })));
      const [community] = await m.db
        .insert(m.schema.communities)
        .values({
          name: "Garden club",
          slug: fx.communitySlug,
          createdBy: ownerId,
          isListedInDirectory: true,
        })
        .returning();
      fx.communityId = community!.id;
      await m.db.insert(m.schema.communityMemberships).values([
        { communityId: community!.id, userId: ownerId, role: "owner" },
        { communityId: community!.id, userId: memberId, role: "member" },
        { communityId: community!.id, userId: contributorId, role: "member" },
      ]);
      const magazine = await callerAs(ownerId).magazines.saveSettings({
        slug: fx.communitySlug,
        name: "The Gazette",
        magazineSlug: fx.magazineSlug,
        topics: [],
        defaultVisibility: "members",
      });
      fx.magazineId = magazine.id;

      // Decision 2: email signup requires an existing public issue. Publish it
      // before anyone subscribes, then finish its announcement as fixture setup.
      const issue = await publicDraft("Welcome");
      await callerAs(ownerId).magazines.publishIssue({
        slug: fx.communitySlug,
        issueId: issue.id,
        expectedUpdatedAt: issue.updatedAt,
      });
      await m.runMagazineIssueJobs(m, { now: new Date(), mailer });
      expect(send).not.toHaveBeenCalled();
    }, 60_000);

    afterEach(async () => {
      for (const task of scheduledWork.splice(0)) await task();
      vi.unstubAllEnvs();
      if (!fx) return;
      const { db, schema: s, payload } = m;
      if (fx.magazineId !== undefined) {
        await db
          .delete(s.magazineSubscriptions)
          .where(eq(s.magazineSubscriptions.magazineId, fx.magazineId));
        // Deleting issues/subscriptions cascades their announcements/deliveries.
        await payload.delete({
          collection: "magazine-issues",
          where: { magazine: { equals: fx.magazineId } },
        });
        await db
          .delete(s.magazineStaff)
          .where(eq(s.magazineStaff.magazineId, fx.magazineId));
        await payload.delete({ collection: "magazines", id: fx.magazineId });
      }
      if (fx.communityId) {
        await db
          .delete(s.spaces)
          .where(eq(s.spaces.communityId, fx.communityId));
        await db
          .delete(s.communityMemberships)
          .where(eq(s.communityMemberships.communityId, fx.communityId));
        await db
          .delete(s.communities)
          .where(eq(s.communities.id, fx.communityId));
      }
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
    }, 60_000);

    it("from subscribe to a scheduled issue in every inbox and mailbox, once", async () => {
      const owner = callerAs(fx.ownerId);
      const member = callerAs(fx.memberId);
      const slug = fx.communitySlug;
      const subscription = {
        magazineSlug: fx.magazineSlug,
        locale: "en" as const,
      };
      expect(
        await member.magazineSubscriptions.subscribe(subscription),
      ).toEqual({
        subscribed: true,
      });
      expect(
        await callerAs(null).magazineSubscriptions.subscribeByEmail({
          ...subscription,
          email: fx.email,
        }),
      ).toEqual({ ok: true });
      for (const task of scheduledWork.splice(0)) await task();
      expect(sendGatedEmail).toHaveBeenCalledExactlyOnceWith(
        fx.email,
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
      const confirmationMail = vi.mocked(sendGatedEmail).mock.calls[0]![1];
      const confirmUrl = new URL(
        /https:\/\/\S*\/magazine-subscriptions\/confirm\?t=\S+/.exec(
          confirmationMail.text,
        )![0],
      );
      const token = confirmUrl.searchParams.get("t")!;
      expect((await m.readConfirmLink(m, token, new Date())).status).toBe(
        "ready",
      );
      const confirmed = await m.confirm(
        new Request("https://example.test/api/magazine-subscriptions/confirm", {
          method: "POST",
          body: new URLSearchParams({ t: token, locale: "en" }),
        }),
      );
      expect(confirmed.status).toBe(303);
      expect(confirmed.headers.get("location")).toBe(
        `https://example.test/en/magazine-subscriptions/confirm?t=${token}`,
      );
      expect((await m.readConfirmLink(m, token, new Date())).status).toBe(
        "subscribed",
      );
      expect(await owner.magazines.subscriberCounts({ slug })).toEqual({
        withAccount: 1,
        byEmail: 1,
        waiting: 0,
      });

      const now = new Date();
      const issue = await publicDraft("Autumn");
      const scheduled = await owner.magazines.scheduleIssue({
        slug,
        issueId: issue.id,
        expectedUpdatedAt: issue.updatedAt,
        publishAt: new Date(now.getTime() + 3_600_000).toISOString(),
      });
      expect(scheduled.status).toBe("scheduled");
      expect((await member.notifications.list({})).notifications).toHaveLength(
        0,
      );
      const reading = {
        magazineSlug: fx.magazineSlug,
        issueSlug: scheduled.slug,
        viewerId: fx.outsiderId,
        locale: "en" as const,
      };
      expect(await m.loadIssuePage(m, reading)).toBeNull();
      expect(send).not.toHaveBeenCalled();

      const due = new Date(now.getTime() + 7_200_000);
      expect(await m.runMagazineIssueJobs(m, { now: due, mailer })).toEqual({
        published: 1,
        failed: 0,
        retried: 0,
        purged: 0,
        inbox: 0, // The publish path already delivered the inbox notice inline.
        email: 1,
        completed: 1,
      });
      const firstInbox = await member.notifications.list({});
      expect(firstInbox.nextCursor).toBeNull();
      expect(firstInbox.notifications).toHaveLength(1);
      expect(firstInbox.notifications[0]).toMatchObject({
        type: "magazine_issue_published",
        metadata: {
          issueId: issue.id,
          reviewPath: `/magazines/${fx.magazineSlug}/${issue.slug}`,
        },
      });
      expect(await m.loadIssuePage(m, reading)).toMatchObject({
        issue: { id: issue.id, status: "published" },
      });
      expect(send).toHaveBeenCalledExactlyOnceWith(fx.email, expect.anything());
      const mail = send.mock.calls[0]![1];
      expect(mail.subject).toBe("The Gazette: Autumn");
      const unsubscribeUrl = new URL(
        /https:\/\/\S*\/unsubscribe\?t=\S+/.exec(mail.text)![0],
      );
      const unsubscribeToken = unsubscribeUrl.searchParams.get("t")!;
      expect(verifyUnsubscribeToken(unsubscribeToken, secret)).toEqual({
        scope: "magazine",
        subscriptionId: expect.any(String),
      });
      expect(mail.headers!["List-Unsubscribe-Post"]).toBe(
        "List-Unsubscribe=One-Click",
      );
      const oneClickUrl = /<([^>]+\/api\/email\/unsubscribe\?t=[^>]+)>/.exec(
        mail.headers!["List-Unsubscribe"]!,
      )![1]!;
      expect(new URL(oneClickUrl).searchParams.get("t")).toBe(unsubscribeToken);

      const noWork = {
        published: 0,
        failed: 0,
        retried: 0,
        purged: 0,
        inbox: 0,
        email: 0,
        completed: 0,
      };
      expect(await m.runMagazineIssueJobs(m, { now: due, mailer })).toEqual(
        noWork,
      );
      expect((await member.notifications.list({})).notifications).toEqual(
        firstInbox.notifications,
      );
      expect(send).toHaveBeenCalledTimes(1);
      expect(sendGatedEmail).toHaveBeenCalledTimes(1);

      const unsubscribed = await m.unsubscribe(
        new Request(oneClickUrl, {
          method: "POST",
          body: new URLSearchParams({ "List-Unsubscribe": "One-Click" }),
        }),
      );
      expect(unsubscribed.status).toBe(200);
      expect(await unsubscribed.json()).toEqual({ ok: true });
      // The confirm link identified X's row. Its disappearance also proves the
      // signed unsubscribe link removed X, without inspecting storage directly.
      expect(await m.readConfirmLink(m, token, new Date())).toEqual({
        status: "invalid",
        magazine: null,
      });

      const second = await publicDraft("Winter");
      await owner.magazines.publishIssue({
        slug,
        issueId: second.id,
        expectedUpdatedAt: second.updatedAt,
      });
      const secondInbox = await member.notifications.list({});
      expect(secondInbox.nextCursor).toBeNull();
      expect(secondInbox.notifications).toHaveLength(2);
      expect(
        secondInbox.notifications.filter(
          (notice) => notice.metadata?.issueId === issue.id,
        ),
      ).toHaveLength(1);
      expect(
        secondInbox.notifications.filter(
          (notice) => notice.metadata?.issueId === second.id,
        ),
      ).toHaveLength(1);
      expect(await m.runMagazineIssueJobs(m, { now: due, mailer })).toEqual({
        ...noWork,
        completed: 1,
      });
      expect((await member.notifications.list({})).notifications).toEqual(
        secondInbox.notifications,
      );
      expect(send).toHaveBeenCalledTimes(1);
      expect(sendGatedEmail).toHaveBeenCalledTimes(1);

      const counts = { withAccount: 1, byEmail: 0, waiting: 0 };
      expect(await owner.magazines.subscriberCounts({ slug })).toEqual(counts);
      await owner.magazines.assignStaffRole({
        slug,
        userId: fx.contributorId,
        role: "contributor",
      });
      expect(
        await callerAs(fx.contributorId).magazines.subscriberCounts({ slug }),
      ).toEqual(counts);
      await expect(
        callerAs(fx.outsiderId).magazines.subscriberCounts({ slug }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  },
);
