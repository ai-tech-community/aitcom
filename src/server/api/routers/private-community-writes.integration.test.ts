// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  createPrivateCommunityFixture,
  isLocalDbConfigured,
  type CommunityFixtureRef,
  type PrivateCommunityFixture,
} from "@/test/private-community-fixture";

// Agent calls authenticate with an API key; stub only the key lookup so a
// test can pick the agent's owner. Everything else runs for real.
const agentKey = vi.hoisted(() => ({
  agentId: "",
  ownerId: null as string | null,
}));
vi.mock("@/server/agent/api-key", () => ({
  validateApiKey: vi.fn(async () => ({
    agentId: agentKey.agentId,
    ownerId: agentKey.ownerId,
    scopes: ["read", "contribute"],
    status: agentKey.ownerId ? "active" : "unclaimed",
  })),
}));

const RUN_DB = isLocalDbConfigured();

/**
 * Writes and spectator reads of a members-only community (ADR-0050): an
 * outsider gets NOT_FOUND (never FORBIDDEN, so nothing is confirmed to
 * exist), a reader who is not a member gets FORBIDDEN, and an active
 * member succeeds. Hub-wide content (no community) is unchanged.
 */
describe.skipIf(!RUN_DB)(
  "private community writes [DB integration]",
  { timeout: 60_000 },
  () => {
    type Mods = {
      db: typeof import("@/server/db").db;
      schema: typeof import("@/server/db/schema");
      createCaller: typeof import("@/server/api/root").createCaller;
      payload: Awaited<
        ReturnType<typeof import("@/server/payload").getPayloadClient>
      >;
      plainTextToLexical: typeof import("@/server/challenge-engine/lexical").plainTextToLexical;
    };
    let m: Mods;
    let f: PrivateCommunityFixture;
    const threadOf = new Map<string, number>();
    const ideaOf = new Map<string, number>();
    const projectOf = new Map<string, { id: number; slug: string }>();
    const challengeOf = new Map<string, number>();
    const teamOf = new Map<string, string>();
    let hubThreadId: number;
    let hubChallengeId: number;

    const RICH = {
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
            children: [{ type: "text", text: "gate test" }],
          },
        ],
      },
    };

    async function createChallenge(label: string, communityId: string | null) {
      const challenge = await m.payload.create({
        collection: "challenges",
        data: {
          title: `Gate challenge ${label}`,
          slug: `gate-challenge-${label}`,
          description: RICH,
          type: "open-ended" as const,
          status: "active" as const,
          difficulty: "beginner" as const,
          publishedBy: "member" as const,
          creatorId: f.users.owner,
          startsAt: new Date().toISOString(),
          endsAt: new Date(Date.now() + 86_400_000).toISOString(),
          objectives: [
            {
              description: "Ship it",
              verification: "self-report" as const,
              targetCount: 1,
            },
          ],
          rewards: { xpReward: 0 },
          maxParticipants: 0,
          ...(communityId ? { communityId } : {}),
        },
      });
      return challenge.id;
    }

    beforeAll(async () => {
      const [{ db }, schema, { createCaller }, { getPayloadClient }, lexical] =
        await Promise.all([
          import("@/server/db"),
          import("@/server/db/schema"),
          import("@/server/api/root"),
          import("@/server/payload"),
          import("@/server/challenge-engine/lexical"),
        ]);
      m = {
        db,
        schema,
        createCaller,
        payload: await getPayloadClient(),
        plainTextToLexical: lexical.plainTextToLexical,
      };
      f = await createPrivateCommunityFixture(m);
      agentKey.agentId = `pcg-agent-${f.sfx}`;
      await db.insert(schema.agentProfiles).values({
        id: agentKey.agentId,
        name: `Gate agent ${f.sfx}`,
        ownerId: f.users.member,
      });
      for (const c of [f.open, f.inviteOnly, f.approval, f.unlisted]) {
        const thread = await m.payload.create({
          collection: "forum-threads",
          data: {
            title: `Rocket engines ${c.slug}`,
            slug: `gate-write-thread-${c.slug}`,
            content: m.plainTextToLexical("How do rocket engines cool?"),
            category: "general",
            authorId: f.users.owner,
            authorName: "Owner",
            communityId: c.id,
          },
        });
        threadOf.set(c.id, thread.id);
        const idea = await m.payload.create({
          collection: "community-ideas",
          data: {
            title: `Gate idea ${c.slug}`,
            authorId: f.users.owner,
            status: "open",
            category: "platform",
            communityId: c.id,
            voteCount: 0,
          },
        });
        ideaOf.set(c.id, idea.id);
        const project = await m.payload.create({
          collection: "launchpad-projects",
          data: {
            title: `Gate project ${c.slug}`,
            slug: `gate-project-${c.slug}`,
            pitch: RICH,
            stage: "idea",
            authorId: f.users.owner,
            authorName: "Owner",
            status: "published",
            communityId: c.id,
          } as never,
        });
        projectOf.set(c.id, { id: project.id, slug: project.slug });
        const challengeId = await createChallenge(c.slug, c.id);
        challengeOf.set(c.id, challengeId);
        const [team] = await db
          .insert(schema.teams)
          .values({
            challengeId,
            eventId: 1,
            name: `Gate team ${c.slug}`,
            captainId: f.users.owner,
            joinCode: `G${challengeId}`.slice(0, 20),
            maxSize: 5,
            status: "locked",
          })
          .returning();
        teamOf.set(c.id, team!.id);
      }
      const hub = await m.payload.create({
        collection: "forum-threads",
        data: {
          title: `Hub rocket engines ${f.sfx}`,
          slug: `gate-hub-thread-${f.sfx}`,
          content: m.plainTextToLexical("Hub-wide thread"),
          category: "general",
          authorId: f.users.owner,
          authorName: "Owner",
        },
      });
      hubThreadId = hub.id;
      hubChallengeId = await createChallenge(`hub-${f.sfx}`, null);
    }, 120_000);

    afterAll(async () => {
      agentKey.ownerId = null;
      if (!m) return;
      const { inArray, eq } = await import("drizzle-orm");
      const userIds = Object.values(f.users);
      const threadIds = [...threadOf.values(), hubThreadId];
      await m.payload.delete({
        collection: "forum-replies",
        where: { thread: { in: threadIds } },
      });
      await m.payload.delete({
        collection: "forum-threads",
        where: {
          or: [{ id: { in: threadIds } }, { authorId: { in: userIds } }],
        },
      });
      await m.payload.delete({
        collection: "idea-votes",
        where: { voterId: { in: userIds } },
      });
      await m.payload.delete({
        collection: "community-ideas",
        where: { authorId: { in: userIds } },
      });
      const projectIds = [...projectOf.values()].map((p) => p.id);
      await m.db
        .delete(m.schema.launchpadVotes)
        .where(inArray(m.schema.launchpadVotes.projectId, projectIds));
      await m.db
        .delete(m.schema.launchpadComments)
        .where(inArray(m.schema.launchpadComments.projectId, projectIds));
      await m.db
        .delete(m.schema.notifications)
        .where(inArray(m.schema.notifications.userId, userIds));
      await m.payload.delete({
        collection: "launchpad-projects",
        where: { id: { in: projectIds } },
      });
      const challengeIds = [...challengeOf.values(), hubChallengeId];
      await m.db
        .delete(m.schema.teams)
        .where(inArray(m.schema.teams.challengeId, challengeIds));
      await m.db
        .delete(m.schema.challengeChannels)
        .where(inArray(m.schema.challengeChannels.challengeId, challengeIds));
      await m.payload.delete({
        collection: "challenges",
        where: { id: { in: challengeIds } },
      });
      await m.db
        .delete(m.schema.agentDrafts)
        .where(eq(m.schema.agentDrafts.agentId, agentKey.agentId));
      await m.db
        .delete(m.schema.agentProfiles)
        .where(eq(m.schema.agentProfiles.id, agentKey.agentId));
      await m.db
        .delete(m.schema.activityEvents)
        .where(inArray(m.schema.activityEvents.actorId, userIds));
      await f.cleanup();
    }, 120_000);

    function callerAs(userId: string | null) {
      return m.createCaller({
        db: m.db,
        headers: new Headers({ authorization: "Bearer test-key" }),
        session: userId
          ? ({ user: { id: userId, name: "Tester" }, session: {} } as never)
          : null,
      });
    }

    /** An agent call, acting as `ownerId` (null: an unclaimed agent). */
    function agentOf(ownerId: string | null) {
      agentKey.ownerId = ownerId;
      return callerAs(null);
    }

    /** Signed-in people who may not read a members-only community. */
    const strangers = () => [
      f.users.outsider,
      f.users.pending,
      f.users.invited,
    ];

    async function expectEachHidden(
      write: (c: CommunityFixtureRef, userId: string) => Promise<unknown>,
    ) {
      for (const [, c] of f.membersOnly) {
        for (const userId of strangers()) {
          await expect(write(c, userId)).rejects.toMatchObject({
            code: "NOT_FOUND",
          });
        }
      }
    }

    describe("forum.createThread", () => {
      const thread = (communitySlug?: string) => ({
        title: "A thread from the gate tests",
        content: "Some words.",
        category: "general" as const,
        ...(communitySlug ? { communitySlug } : {}),
      });

      it("answers NOT_FOUND to anyone outside a members-only community", async () => {
        await expectEachHidden((c, userId) =>
          callerAs(userId).forum.createThread(thread(c.slug)),
        );
      });

      it("refuses a non-member of a public community with FORBIDDEN", async () => {
        await expect(
          callerAs(f.users.outsider).forum.createThread(thread(f.open.slug)),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
      });

      it("answers NOT_FOUND for an unknown community, never a Hub thread", async () => {
        await expect(
          callerAs(f.users.member).forum.createThread(thread(`nope-${f.sfx}`)),
        ).rejects.toMatchObject({ code: "NOT_FOUND" });
      });

      it("lets a member post, and anyone post a Hub-wide thread", async () => {
        await expect(
          callerAs(f.users.member).forum.createThread(
            thread(f.inviteOnly.slug),
          ),
        ).resolves.toMatchObject({ communityId: f.inviteOnly.id });
        await expect(
          callerAs(f.users.outsider).forum.createThread(thread()),
        ).resolves.toMatchObject({ authorId: f.users.outsider });
      });
    });

    describe("forum.addReply", () => {
      it("answers a hidden thread like a missing one", async () => {
        await expectEachHidden((c, userId) =>
          callerAs(userId).forum.addReply({
            threadId: threadOf.get(c.id)!,
            content: "hi",
          }),
        );
        await expect(
          callerAs(f.users.outsider).forum.addReply({
            threadId: 2_000_000_000,
            content: "hi",
          }),
        ).rejects.toMatchObject({
          code: "NOT_FOUND",
          message: "Thread not found",
        });
        await expect(
          callerAs(f.users.outsider).forum.addReply({
            threadId: threadOf.get(f.approval.id)!,
            content: "hi",
          }),
        ).rejects.toMatchObject({
          code: "NOT_FOUND",
          message: "Thread not found",
        });
      });

      it("refuses a non-member of a public community, lets members and Hub posters in", async () => {
        await expect(
          callerAs(f.users.outsider).forum.addReply({
            threadId: threadOf.get(f.open.id)!,
            content: "hi",
          }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(
          callerAs(f.users.member).forum.addReply({
            threadId: threadOf.get(f.unlisted.id)!,
            content: "hi",
          }),
        ).resolves.toMatchObject({ authorId: f.users.member });
        await expect(
          callerAs(f.users.outsider).forum.addReply({
            threadId: hubThreadId,
            content: "hi",
          }),
        ).resolves.toMatchObject({ authorId: f.users.outsider });
      });
    });

    describe("ideas", () => {
      it("forum.submitIdea needs an active member", async () => {
        await expectEachHidden((c, userId) =>
          callerAs(userId).forum.submitIdea({
            title: "An idea",
            communitySlug: c.slug,
          }),
        );
        await expect(
          callerAs(f.users.outsider).forum.submitIdea({
            title: "An idea",
            communitySlug: f.open.slug,
          }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(
          callerAs(f.users.member).forum.submitIdea({
            title: "An idea",
            communitySlug: `nope-${f.sfx}`,
          }),
        ).rejects.toMatchObject({ code: "NOT_FOUND" });
        await expect(
          callerAs(f.users.member).forum.submitIdea({
            title: "An idea",
            communitySlug: f.approval.slug,
          }),
        ).resolves.toMatchObject({ communityId: f.approval.id });
      });

      it("forum.toggleVote needs an active member of the idea's community", async () => {
        await expectEachHidden((c, userId) =>
          callerAs(userId).forum.toggleVote({ ideaId: ideaOf.get(c.id)! }),
        );
        await expect(
          callerAs(f.users.outsider).forum.toggleVote({
            ideaId: ideaOf.get(f.open.id)!,
          }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(
          callerAs(f.users.outsider).forum.toggleVote({
            ideaId: 2_000_000_000,
          }),
        ).rejects.toMatchObject({ code: "NOT_FOUND" });
        await expect(
          callerAs(f.users.member).forum.toggleVote({
            ideaId: ideaOf.get(f.inviteOnly.id)!,
          }),
        ).resolves.toEqual({ voted: true });
      });

      it("agent.voteIdea votes only for a member owner", async () => {
        for (const [, c] of f.membersOnly) {
          for (const owner of strangers()) {
            await expect(
              agentOf(owner).agent.voteIdea({ ideaId: ideaOf.get(c.id)! }),
            ).rejects.toMatchObject({ code: "NOT_FOUND" });
          }
        }
        await expect(
          agentOf(f.users.member).agent.voteIdea({
            ideaId: ideaOf.get(f.unlisted.id)!,
          }),
        ).resolves.toEqual({ voted: true });
      });
    });

    describe("agent forum drafts", () => {
      it("agentForum.createThread drafts only for a member owner", async () => {
        for (const [, c] of f.membersOnly) {
          for (const owner of strangers()) {
            await expect(
              agentOf(owner).agent.createThread({
                title: "An agent thread",
                content: "Words.",
                communitySlug: c.slug,
              }),
            ).rejects.toMatchObject({ code: "NOT_FOUND" });
          }
        }
        await expect(
          agentOf(f.users.outsider).agent.createThread({
            title: "An agent thread",
            content: "Words.",
            communitySlug: f.open.slug,
          }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(
          agentOf(f.users.member).agent.createThread({
            title: "An agent thread",
            content: "Words.",
            communitySlug: f.approval.slug,
          }),
        ).resolves.toMatchObject({ mode: "draft" });
      });

      it("agent.replyToThread and shareKnowledge draft only for a member owner", async () => {
        const reply = "Rocket engines cool with regenerative cooling.";
        for (const [, c] of f.membersOnly) {
          for (const owner of strangers()) {
            const agent = agentOf(owner);
            await expect(
              agent.agent.replyToThread({
                threadId: threadOf.get(c.id)!,
                content: reply,
              }),
            ).rejects.toMatchObject({ code: "NOT_FOUND" });
            await expect(
              agent.agent.shareKnowledge({
                threadId: threadOf.get(c.id)!,
                content: reply,
              }),
            ).rejects.toMatchObject({ code: "NOT_FOUND" });
          }
        }
        await expect(
          agentOf(f.users.member).agent.replyToThread({
            threadId: threadOf.get(f.inviteOnly.id)!,
            content: reply,
          }),
        ).resolves.toMatchObject({ mode: "draft" });
      });

      it("re-checks the owner's membership when a draft is approved", async () => {
        const { and, eq } = await import("drizzle-orm");
        const reply = "Rocket engines cool with regenerative cooling.";
        const replyDraft = await agentOf(f.users.member).agent.replyToThread({
          threadId: threadOf.get(f.approval.id)!,
          content: reply,
        });
        const threadDraft = await agentOf(f.users.member).agent.createThread({
          title: "A thread to publish later",
          content: "Words.",
          communitySlug: f.approval.slug,
        });
        const membership = and(
          eq(m.schema.communityMemberships.communityId, f.approval.id),
          eq(m.schema.communityMemberships.userId, f.users.member),
        );
        await m.db
          .update(m.schema.communityMemberships)
          .set({ status: "banned" })
          .where(membership);
        try {
          for (const draft of [replyDraft, threadDraft]) {
            await expect(
              callerAs(f.users.member).agentManagement.reviewDraft({
                draftId: draft.draftId,
                action: "approved",
              }),
            ).rejects.toMatchObject({ code: "NOT_FOUND" });
            const [row] = await m.db
              .select({ status: m.schema.agentDrafts.status })
              .from(m.schema.agentDrafts)
              .where(eq(m.schema.agentDrafts.id, draft.draftId));
            expect(row?.status).toBe("pending");
          }
        } finally {
          await m.db
            .update(m.schema.communityMemberships)
            .set({ status: "active" })
            .where(membership);
        }
        await expect(
          callerAs(f.users.member).agentManagement.reviewDraft({
            draftId: replyDraft.draftId,
            action: "approved",
          }),
        ).resolves.toBeTruthy();
      });

      it("resolves a reply draft's community from its thread when the metadata has none", async () => {
        const { eq } = await import("drizzle-orm");
        const [draft] = await m.db
          .insert(m.schema.agentDrafts)
          .values({
            agentId: agentKey.agentId,
            ownerId: f.users.outsider,
            type: "thread_reply",
            targetType: "forum-threads",
            targetId: String(threadOf.get(f.inviteOnly.id)!),
            content: "Sneaking in.",
            status: "pending",
          })
          .returning({ id: m.schema.agentDrafts.id });
        await expect(
          callerAs(f.users.outsider).agentManagement.reviewDraft({
            draftId: draft!.id,
            action: "approved",
          }),
        ).rejects.toMatchObject({ code: "NOT_FOUND" });
        const [row] = await m.db
          .select({ status: m.schema.agentDrafts.status })
          .from(m.schema.agentDrafts)
          .where(eq(m.schema.agentDrafts.id, draft!.id));
        expect(row?.status).toBe("pending");
      });
    });

    describe("launchpad", () => {
      it("hides a members-only community's projects from outsiders", async () => {
        for (const viewer of f.outsiders) {
          const list = await callerAs(viewer).launchpad.list({
            search: "Gate project",
            limit: 50,
          });
          const slugs = list.projects.map((p) => p.slug);
          expect(slugs).toContain(projectOf.get(f.open.id)!.slug);
          for (const [, c] of f.membersOnly) {
            expect(slugs).not.toContain(projectOf.get(c.id)!.slug);
            await expect(
              callerAs(viewer).launchpad.getBySlug({
                slug: projectOf.get(c.id)!.slug,
              }),
            ).rejects.toMatchObject({ code: "NOT_FOUND" });
          }
        }
        const member = await callerAs(f.users.member).launchpad.list({
          search: "Gate project",
          limit: 50,
        });
        expect(member.projects).toHaveLength(4);
      });

      it("lets only members vote on or comment on a community's project", async () => {
        await expectEachHidden((c, userId) =>
          callerAs(userId).launchpad.vote({
            projectId: projectOf.get(c.id)!.id,
          }),
        );
        await expectEachHidden((c, userId) =>
          callerAs(userId).launchpad.addComment({
            projectId: projectOf.get(c.id)!.id,
            content: "Nice",
          }),
        );
        await expect(
          callerAs(f.users.outsider).launchpad.vote({
            projectId: projectOf.get(f.open.id)!.id,
          }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(
          callerAs(f.users.member).launchpad.vote({
            projectId: projectOf.get(f.unlisted.id)!.id,
          }),
        ).resolves.toMatchObject({ voted: true });
        await expect(
          callerAs(f.users.member).launchpad.addComment({
            projectId: projectOf.get(f.unlisted.id)!.id,
            content: "Nice",
          }),
        ).resolves.toBeTruthy();
      });
    });

    describe("challenge and hackathon spectator views", () => {
      it("hide a members-only community's challenge from outsiders", async () => {
        for (const viewer of f.outsiders) {
          const caller = callerAs(viewer);
          const listed = (await caller.challenges.list()).map((c) => c.id);
          expect(listed).toContain(hubChallengeId);
          expect(listed).toContain(challengeOf.get(f.open.id));
          for (const [, c] of f.membersOnly) {
            const challengeId = challengeOf.get(c.id)!;
            const teamId = teamOf.get(c.id)!;
            expect(listed).not.toContain(challengeId);
            for (const read of [
              () => caller.challenges.getById({ id: challengeId }),
              () => caller.challenges.getLeaderboard({ challengeId }),
              () => caller.challengeChannel.getChannel({ challengeId }),
              () => caller.hackathon.teamLeaderboard({ challengeId }),
              () => caller.hackathon.agentStats({ challengeId }),
              () => caller.hackathon.peoplesChoiceState({ challengeId }),
              () => caller.hackathon.teamGridStatus({ teamId }),
              () => caller.hackathon.teamHeatmap({ teamId }),
            ]) {
              await expect(read()).rejects.toMatchObject({
                code: "NOT_FOUND",
              });
            }
          }
        }
      });

      it("show them to members, and a public or Hub challenge to anyone", async () => {
        const member = callerAs(f.users.member);
        const challengeId = challengeOf.get(f.inviteOnly.id)!;
        await expect(
          member.challenges.getById({ id: challengeId }),
        ).resolves.toMatchObject({ id: challengeId });
        await expect(
          member.hackathon.teamLeaderboard({ challengeId }),
        ).resolves.toHaveLength(1);
        await expect(
          member.hackathon.teamGridStatus({
            teamId: teamOf.get(f.inviteOnly.id)!,
          }),
        ).resolves.toEqual({ total: 0, byStatus: {} });
        const guest = callerAs(null);
        await expect(
          guest.challenges.getById({ id: hubChallengeId }),
        ).resolves.toMatchObject({ id: hubChallengeId });
        await expect(
          guest.hackathon.teamLeaderboard({
            challengeId: challengeOf.get(f.open.id)!,
          }),
        ).resolves.toHaveLength(1);
      });

      it("answer a missing challenge or team like a hidden one", async () => {
        const guest = callerAs(null);
        await expect(
          guest.challenges.getById({ id: 2_000_000_000 }),
        ).rejects.toMatchObject({ code: "NOT_FOUND" });
        await expect(
          guest.hackathon.teamHeatmap({ teamId: `nope-${f.sfx}` }),
        ).rejects.toMatchObject({ code: "NOT_FOUND" });
      });
    });
  },
);
