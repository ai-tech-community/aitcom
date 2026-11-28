/**
 * Seed the Workbench Notes redesign preview. Run through test-env.sh.
 */
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { RequiredDataFromCollectionSlug, Where } from "payload";

import fixture from "./fixtures/redesign-demo-content.json";

// Guard before importing anything that can initialize Payload, auth or the DB.
const databaseUrl = process.env.DATABASE_URL ?? "";
const target = URL.canParse(databaseUrl) ? new URL(databaseUrl) : undefined;
if (
  !target ||
  !["postgres:", "postgresql:"].includes(target.protocol) ||
  target.host !== "127.0.0.1:55432" ||
  target.pathname !== "/aitcom_test" ||
  target.search ||
  target.hash
) {
  throw new Error(
    "Refusing to seed: DATABASE_URL must point to 127.0.0.1:55432/aitcom_test.",
  );
}
if (process.env.PAYLOAD_PUSH === "true") {
  throw new Error("Refusing to seed with PAYLOAD_PUSH=true.");
}
const localProxy = "127.0.0.1:5434";
process.env.NEON_LOCAL_PROXY ??= localProxy;
if (process.env.NEON_LOCAL_PROXY !== localProxy) {
  throw new Error(
    "Refusing to seed through a proxy other than the local test proxy.",
  );
}
// Better Auth's normal signup hooks must not send email for synthetic users.
delete process.env.RESEND_API_KEY;

const communitySlug = fixture.community.id;
const memberEmail = (id: string) => `${id}@${communitySlug}.aitcommunity.local`;
const previewMemberId = "glass-pebble";

type SeedCollection =
  | "community-topics"
  | "feed-posts"
  | "feed-comments"
  | "events"
  | "courses"
  | "modules"
  | "lessons";

// These collections have serial IDs and no fixture key field. Keep stable
// positive IDs far above the normal sequence without advancing it.
function fixtureDocumentId(collection: SeedCollection, id: string): number {
  const hash = createHash("sha256")
    .update(`${communitySlug}/${collection}/${id}`)
    .digest()
    .readUInt32BE(0);
  return 1_000_000_000 + (hash % 1_000_000_000);
}

function scopedKey(
  scope: string,
  scopeId: string | number,
  key: string,
  value: string | number,
): Where {
  return {
    and: [{ [scope]: { equals: scopeId } }, { [key]: { equals: value } }],
  };
}

async function main() {
  const { and, eq, sql } = await import("drizzle-orm");
  const { db } = await import("@/server/db");
  const {
    communities,
    communityMemberships,
    conversationParticipants,
    conversations,
    eventRegistrations,
    memberProfiles,
    messages,
    spaceMemberships,
    spaces,
    user,
  } = await import("@/server/db/schema");
  const { auth } = await import("@/server/better-auth");
  const { getPayloadClient } = await import("@/server/payload");
  const { plainTextToLexical } =
    await import("@/server/challenge-engine/lexical");
  const { getOrCreateRoomConversation } =
    await import("@/server/communities/room-conversation");
  const { syncFeedPostCounters } =
    await import("@/server/communities/feed-post-counters");

  const payload = await getPayloadClient();
  payload.db.allowIDOnCreate = true;
  const counts: Record<
    string,
    { created: number; updated: number; unchanged: number }
  > = {};

  async function saveDocument<Slug extends SeedCollection>(
    collection: Slug,
    where: Where,
    data: RequiredDataFromCollectionSlug<Slug>,
    context?: Record<string, boolean>,
  ): Promise<number> {
    const options: {
      collection: SeedCollection;
      depth: number;
      context?: Record<string, boolean>;
    } = { collection, depth: 0, context };
    const {
      docs: [existing],
    } = await payload.find({ ...options, where, limit: 1 });
    const count = (counts[collection] ??= {
      created: 0,
      updated: 0,
      unchanged: 0,
    });
    // An event update creates a Payload version even when the event is unchanged.
    if (
      collection === "events" &&
      existing &&
      Object.entries(data).every(([field, value]) =>
        isDeepStrictEqual(Reflect.get(existing, field), value),
      )
    ) {
      count.unchanged++;
      return existing.id;
    }
    const doc = existing
      ? await payload.update({ ...options, id: existing.id, data })
      : await payload.create({ ...options, data });
    if (data.id !== undefined && doc.id !== data.id) {
      throw new Error(`Payload did not preserve fixture ID for ${collection}.`);
    }
    count[existing ? "updated" : "created"]++;
    return doc.id;
  }

  const owner = fixture.members.find((member) => member.role === "owner");
  if (!owner) throw new Error("The fixture needs a community owner.");
  // Same fallback as seed-dev-user.ts for the local Docker environment.
  const password = process.env.DEV_USER_PASSWORD ?? "devpassword123";
  const authContext = await auth.$context;

  // Serialize seed runs. Payload and auth use their own connections, so the
  // individual writes use stable keys and can resume after a partial run.
  await db.transaction(async (lock) => {
    await lock.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`aitcom.seed.${communitySlug}`}))`,
    );

    const members = new Map<string, { id: string; name: string }>();
    for (const member of fixture.members) {
      const email = memberEmail(member.id);
      const name = member.displayName;
      const canSignIn = member.id === owner.id || member.id === previewMemberId;
      if (canSignIn) {
        const existing = await db.query.user.findFirst({
          where: eq(user.email, email),
        });
        if (!existing)
          await auth.api.signUpEmail({ body: { email, password, name } });
      }
      const [saved] = await db
        .insert(user)
        .values({ email, name, emailVerified: true })
        .onConflictDoUpdate({
          target: user.email,
          set: { name, emailVerified: true },
        })
        .returning({ id: user.id });
      const userId = saved!.id;
      members.set(member.id, { id: userId, name });
      if (canSignIn) {
        const accounts = await authContext.internalAdapter.findAccounts(userId);
        const credential = accounts.find(
          (account) => account.providerId === "credential",
        );
        if (!credential) {
          await authContext.internalAdapter.linkAccount({
            userId,
            accountId: userId,
            providerId: "credential",
            password: await authContext.password.hash(password),
          });
        } else if (
          !credential.password ||
          !(await authContext.password.verify({
            hash: credential.password,
            password,
          }))
        ) {
          await authContext.internalAdapter.updatePassword(
            userId,
            await authContext.password.hash(password),
          );
        }
      }
      const profile = { displayName: name, bio: member.bio };
      await db
        .insert(memberProfiles)
        .values({ userId, ...profile })
        .onConflictDoUpdate({ target: memberProfiles.userId, set: profile });
    }
    function getMember(id: string) {
      const member = members.get(id);
      if (!member) throw new Error(`Unknown fixture member: ${id}`);
      return member;
    }

    const ownerId = getMember(owner.id).id;
    const communityFields = {
      name: fixture.community.name,
      description: `${fixture.community.tagline}\n\n${fixture.community.description}`,
      createdBy: ownerId,
      deletedAt: null,
    };
    const [community] = await db
      .insert(communities)
      .values({ slug: communitySlug, ...communityFields })
      .onConflictDoUpdate({ target: communities.slug, set: communityFields })
      .returning({ id: communities.id });
    const communityId = community!.id;

    for (const member of fixture.members) {
      const role =
        member.role as (typeof communityMemberships.$inferInsert)["role"];
      const membership = { role, status: "active" } as const;
      await db
        .insert(communityMemberships)
        .values({ communityId, userId: getMember(member.id).id, ...membership })
        .onConflictDoUpdate({
          target: [
            communityMemberships.communityId,
            communityMemberships.userId,
          ],
          set: membership,
        });
    }

    const roomIds = new Map<string, string>();
    for (const [position, space] of fixture.spaces.entries()) {
      if (space.type === "post") {
        await saveDocument(
          "community-topics",
          scopedKey("communityId", communityId, "slug", space.id),
          {
            communityId,
            slug: space.id,
            label: space.name,
            sortOrder: position,
          },
        );
        continue;
      }
      const builtinSurface = space.type === "event" ? "events" : "classroom";
      const isRoom = space.type === "chat";
      const slug = isRoom ? space.id : builtinSurface;
      const fields = {
        kind: isRoom ? "room" : "builtin",
        builtinSurface: isRoom ? null : builtinSurface,
        visibility: isRoom ? "public" : null,
        name: space.name,
        purpose: space.description,
        position,
        archivedAt: null,
        createdBy: ownerId,
      } satisfies Partial<typeof spaces.$inferInsert>;
      const [saved] = await db
        .insert(spaces)
        .values({ communityId, slug, ...fields })
        .onConflictDoUpdate({
          target: [spaces.communityId, spaces.slug],
          set: fields,
        })
        .returning({ id: spaces.id });
      if (isRoom) roomIds.set(space.id, saved!.id);
    }
    // The reference capture opens the existing Forum from the sidebar.
    await db
      .insert(spaces)
      .values({
        communityId,
        slug: "forum",
        kind: "builtin",
        builtinSurface: "forum",
        position: fixture.spaces.length,
      })
      .onConflictDoNothing({ target: [spaces.communityId, spaces.slug] });

    let comments = 0;
    for (const post of fixture.posts) {
      const id = fixtureDocumentId("feed-posts", post.id);
      const author = getMember(post.authorId);
      const postId = await saveDocument(
        "feed-posts",
        scopedKey("communityId", communityId, "id", id),
        {
          id,
          communityId,
          createdAt: post.createdAt,
          content: `${post.title}\n\n${post.body}`,
          authorId: author.id,
          authorName: author.name,
          topicSlug: post.spaceId,
          visibility: "community",
          isPinned: post.pinned,
          isDeleted: false,
        },
      );
      for (const comment of post.comments) {
        const id = fixtureDocumentId("feed-comments", comment.id);
        const author = getMember(comment.authorId);
        await saveDocument(
          "feed-comments",
          scopedKey("post", postId, "id", id),
          {
            id,
            communityId,
            createdAt: comment.createdAt,
            content: comment.body,
            post: postId,
            authorId: author.id,
            authorName: author.name,
            isDeleted: false,
          },
        );
        comments++;
      }
      await syncFeedPostCounters(payload, postId);
    }

    let rsvps = 0;
    for (const event of fixture.events) {
      // Payload events store a calendar day and local wall-clock times.
      const startDay = event.startsAt.slice(0, 10);
      const endDay = event.endsAt.slice(0, 10);
      const eventId = await saveDocument(
        "events",
        scopedKey("communityId", communityId, "slug", event.id),
        {
          communityId,
          slug: event.id,
          title: event.title,
          description: plainTextToLexical(event.description),
          organizerId: getMember(event.hostId).id,
          type: "workshop",
          format: event.location.kind === "online" ? "online" : "in-person",
          location: event.location.label,
          date: new Date(startDay).toISOString(),
          endDate: endDay === startDay ? null : new Date(endDay).toISOString(),
          startTime: event.startsAt.slice(11, 16),
          endTime: event.endsAt.slice(11, 16),
          timezone: event.timezone,
          status: "published",
          _status: "published",
        },
        { skipGeocode: true, skipAttendeeCalendar: true },
      );
      for (const memberId of event.rsvpMemberIds) {
        const userId = getMember(memberId).id;
        const [existing] = await db
          .select({ id: eventRegistrations.id })
          .from(eventRegistrations)
          .where(
            and(
              eq(eventRegistrations.eventId, eventId),
              eq(eventRegistrations.userId, userId),
            ),
          )
          .limit(1);
        await db
          .insert(eventRegistrations)
          .values({ id: existing?.id, eventId, userId, status: "registered" })
          .onConflictDoUpdate({
            target: eventRegistrations.id,
            set: { status: "registered" },
          });
        rsvps++;
      }
    }

    const { course } = fixture;
    const courseAuthor = getMember(course.authorId);
    const courseId = await saveDocument(
      "courses",
      scopedKey("communityId", communityId, "slug", course.id),
      {
        communityId,
        slug: course.id,
        title: course.title,
        summary: course.description,
        authorId: courseAuthor.id,
        authorName: courseAuthor.name,
        status: "published",
      },
    );
    let lessons = 0;
    for (const [order, module] of course.modules.entries()) {
      const id = fixtureDocumentId("modules", `${course.id}/${module.id}`);
      const moduleId = await saveDocument(
        "modules",
        scopedKey("course", courseId, "id", id),
        {
          id,
          course: courseId,
          title: module.title,
          order,
        },
      );
      for (const [order, lesson] of module.lessons.entries()) {
        const id = fixtureDocumentId(
          "lessons",
          `${course.id}/${module.id}/${lesson.id}`,
        );
        await saveDocument("lessons", scopedKey("course", courseId, "id", id), {
          id,
          course: courseId,
          module: moduleId,
          title: lesson.title,
          body: plainTextToLexical(lesson.body),
          order,
        });
        lessons++;
      }
    }

    type FixtureMessage =
      (typeof fixture.chatThreads)[number]["messages"][number];
    async function saveMessages(
      conversationId: string,
      items: FixtureMessage[],
    ) {
      for (const message of items) {
        const fields = {
          conversationId,
          senderId: getMember(message.authorId).id,
          content: message.body,
          createdAt: new Date(message.sentAt),
        };
        // Seed history through the inbox store without publishing sends or mail.
        await db
          .insert(messages)
          .values({ id: `${communitySlug}/${message.id}`, ...fields })
          .onConflictDoUpdate({ target: messages.id, set: fields });
      }
    }

    let roomMessages = 0;
    for (const [fixtureId, spaceId] of roomIds) {
      const items = fixture.chatThreads
        .filter((thread) => thread.spaceId === fixtureId)
        .flatMap((thread) => thread.messages);
      const conversationId = await getOrCreateRoomConversation(db, spaceId);
      const roomMembers = new Set([
        owner.id,
        previewMemberId,
        ...items.map((message) => message.authorId),
      ]);
      for (const memberId of roomMembers) {
        const fields = {
          role:
            memberId === owner.id
              ? ("moderator" as const)
              : ("member" as const),
          status: "active" as const,
        };
        await db
          .insert(spaceMemberships)
          .values({ spaceId, userId: getMember(memberId).id, ...fields })
          .onConflictDoUpdate({
            target: [spaceMemberships.spaceId, spaceMemberships.userId],
            set: fields,
          });
      }
      await saveMessages(conversationId, items);
      roomMessages += items.length;
    }

    let dmMessages = 0;
    for (const dm of fixture.directMessages) {
      // Inbox links put the conversation ID in one URL segment.
      const conversationId = `${communitySlug}-dm-${dm.id}`;
      const times = dm.messages.map((message) => Date.parse(message.sentAt));
      const updatedAt = new Date(Math.max(...times));
      await db.transaction(async (tx) => {
        await tx
          .insert(conversations)
          .values({
            id: conversationId,
            type: "dm",
            createdAt: new Date(Math.min(...times)),
            updatedAt,
          })
          .onConflictDoUpdate({ target: conversations.id, set: { updatedAt } });
        await tx
          .insert(conversationParticipants)
          .values(
            dm.participantIds.map((id) => ({
              conversationId,
              userId: getMember(id).id,
            })),
          )
          .onConflictDoNothing({
            target: [
              conversationParticipants.conversationId,
              conversationParticipants.userId,
            ],
          });
      });
      await saveMessages(conversationId, dm.messages);
      dmMessages += dm.messages.length;
    }

    console.log(
      JSON.stringify(
        {
          community: communitySlug,
          members: members.size,
          credentials: 2,
          spaces: {
            room: roomIds.size,
            builtins: fixture.spaces.filter(
              (space) => space.type === "event" || space.type === "course",
            ).length,
            feedTopics: fixture.spaces.filter((space) => space.type === "post")
              .length,
            forum: 1,
          },
          posts: fixture.posts.length,
          comments,
          events: fixture.events.length,
          rsvps,
          courses: 1,
          modules: course.modules.length,
          lessons,
          roomMessages,
          dmConversations: fixture.directMessages.length,
          dmMessages,
          payloadWrites: counts,
        },
        null,
        2,
      ),
    );
    console.log(
      `Space groups skipped (${fixture.spaceGroups.length}): no group store exists.`,
    );
    console.log(
      "Post spaces use feed topics. Room conversations store chat history without thread grouping.",
    );
    console.log(
      `Sign in with DEV_USER_PASSWORD as owner ${memberEmail(owner.id)} or member ${memberEmail(previewMemberId)}.`,
    );
  });
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error("Redesign demo seed failed:", error);
    process.exit(1);
  });
