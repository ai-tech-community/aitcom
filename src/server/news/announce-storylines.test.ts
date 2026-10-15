import { expect, it } from "vitest";

import { STORYLINE_TEST_RECIPIENT } from "@/lib/news/storyline-draft-review";
import type { StorylineAnnounceEnv } from "@/lib/news/storyline-announce";
import {
  STORYLINE_ANNOUNCE_BATCH,
  announcePublishedStorylines,
  type AnnounceMember,
  type AnnounceStore,
  type AnnounceStory,
} from "./announce-storylines";

const SECRET = "announce-test-secret";

function story(
  id: string,
  overrides: Partial<AnnounceStory> = {},
): AnnounceStory {
  return {
    id,
    slug: id,
    title: `Title ${id}`,
    summary: `Stored summary for ${id}.`,
    status: "published",
    publishedAt: new Date("2026-10-15T12:00:00Z"),
    announcedAt: null,
    ...overrides,
  };
}

function member(
  id: string,
  email: string,
  optedOutAt: Date | null = null,
): AnnounceMember {
  return { id, email, optedOutAt };
}

function memoryStore(input: {
  stories: AnnounceStory[];
  members: AnnounceMember[];
  ignoreOnlyEmail?: boolean;
}): AnnounceStore & { claims: Set<string>; announced: Set<string> } {
  const claims = new Set<string>();
  const announced = new Set<string>();
  const key = (storyId: string, userId: string) => `${storyId}:${userId}`;
  const waiting = (
    person: AnnounceMember,
    storyId: string,
    onlyEmail: string | null,
  ) =>
    !claims.has(key(storyId, person.id)) &&
    (input.ignoreOnlyEmail === true ||
      onlyEmail == null ||
      person.email.trim().toLowerCase() === onlyEmail);

  return {
    claims,
    announced,
    async pendingStories(limit) {
      return input.stories
        .filter((row) => !announced.has(row.id))
        .slice(0, limit);
    },
    async recipients(storyId, opts) {
      return input.members
        .filter((person) => waiting(person, storyId, opts.onlyEmail))
        .slice(0, opts.limit);
    },
    async claim(storyId, userId) {
      const claimKey = key(storyId, userId);
      if (claims.has(claimKey)) return false;
      claims.add(claimKey);
      return true;
    },
    async release(storyId, userId) {
      claims.delete(key(storyId, userId));
    },
    async markAnnouncedIfComplete(storyId) {
      const left = input.members.some(
        (person) =>
          person.optedOutAt == null && !claims.has(key(storyId, person.id)),
      );
      if (left) return false;
      announced.add(storyId);
      return true;
    },
  };
}

const preview: StorylineAnnounceEnv = {
  VERCEL_ENV: "preview",
  NODE_ENV: "production",
};

const fanout: StorylineAnnounceEnv = {
  VERCEL_ENV: "production",
  NODE_ENV: "production",
  STORYLINE_ANNOUNCE_FANOUT: "on",
};

it("emails the stored summary to the allowlisted address once when fan-out is off", async () => {
  const store = memoryStore({
    stories: [
      story("local-ai", {
        title: "AI on devices",
        summary: "Local processing",
      }),
    ],
    members: [
      member("greg", "Greg@Klevox.com"),
      member("member", "member@example.com"),
    ],
    ignoreOnlyEmail: true,
  });
  const sent: string[] = [];
  const first = await announcePublishedStorylines(
    store,
    { ...preview, DIGEST_UNSUBSCRIBE_SECRET: SECRET },
    async (to, message) => {
      sent.push(`${to}\n${message.subject}\n${message.text}`);
      return true;
    },
  );
  expect(first.fanout).toBe(false);
  expect(first.sent).toBe(1);
  expect(first.completed).toBe(0);
  expect(sent).toHaveLength(1);
  expect(sent[0]).toContain(STORYLINE_TEST_RECIPIENT);
  expect(sent[0]).toContain("AI on devices");
  expect(sent[0]).toContain("Local processing");
  expect(sent[0]).toContain(
    "https://www.aitcommunity.org/en/news/stories/local-ai",
  );
  expect(sent[0]).toContain("/en/unsubscribe?t=");
  expect(sent.join("\n")).not.toContain("member@example.com");
  expect(store.claims.has("local-ai:member")).toBe(false);
  expect(store.claims.has("local-ai:greg")).toBe(true);

  const second = await announcePublishedStorylines(
    store,
    { ...preview, DIGEST_UNSUBSCRIBE_SECRET: SECRET },
    async () => {
      throw new Error("second run must not send");
    },
  );
  expect(second.sent).toBe(0);
  expect(store.announced.has("local-ai")).toBe(false);
});

it("does not claim a member who opted out", async () => {
  const store = memoryStore({
    stories: [story("local-ai")],
    members: [
      member(
        "greg",
        STORYLINE_TEST_RECIPIENT,
        new Date("2026-10-15T00:00:00Z"),
      ),
      member("member", "member@example.com"),
    ],
    ignoreOnlyEmail: true,
  });
  const result = await announcePublishedStorylines(
    store,
    { ...preview, DIGEST_UNSUBSCRIBE_SECRET: SECRET },
    async () => {
      throw new Error("opted-out address must not be emailed");
    },
  );
  expect(result.sent).toBe(0);
  expect(store.claims.size).toBe(0);
});

it("batches members when fan-out is on and finishes the story on the last batch", async () => {
  const members = Array.from({ length: STORYLINE_ANNOUNCE_BATCH + 1 }, (_, i) =>
    member(`user-${i}`, `user-${i}@example.com`),
  );
  const store = memoryStore({
    stories: [story("local-ai", { summary: "Stored overview only." })],
    members,
  });
  const addresses: string[] = [];
  const env = { ...fanout, DIGEST_UNSUBSCRIBE_SECRET: SECRET };
  const send = async (to: string) => {
    addresses.push(to);
    return true;
  };
  const pace = async () => {
    await Promise.resolve();
  };
  const first = await announcePublishedStorylines(store, env, send, pace);
  expect(first.fanout).toBe(true);
  expect(first.sent).toBe(STORYLINE_ANNOUNCE_BATCH);
  expect(first.completed).toBe(0);
  const second = await announcePublishedStorylines(store, env, send, pace);
  expect(second.sent).toBe(1);
  expect(second.completed).toBe(1);
  const third = await announcePublishedStorylines(store, env, send, pace);
  expect(third.sent).toBe(0);
  expect(addresses).toHaveLength(STORYLINE_ANNOUNCE_BATCH + 1);
  expect(new Set(addresses).size).toBe(addresses.length);
});

it("keeps a claim when sending throws so the story is not emailed twice", async () => {
  const store = memoryStore({
    stories: [story("local-ai")],
    members: [member("greg", STORYLINE_TEST_RECIPIENT)],
  });
  const env = { ...preview, DIGEST_UNSUBSCRIBE_SECRET: SECRET };
  const first = await announcePublishedStorylines(store, env, async () => {
    throw new Error("resend down");
  });
  expect(first.sent).toBe(0);
  expect(store.claims.has("local-ai:greg")).toBe(true);
  const second = await announcePublishedStorylines(
    store,
    env,
    async () => true,
  );
  expect(second.sent).toBe(0);
});

it("does not send when the unsubscribe secret is missing", async () => {
  const store = memoryStore({
    stories: [story("local-ai")],
    members: [member("greg", STORYLINE_TEST_RECIPIENT)],
  });
  const result = await announcePublishedStorylines(
    store,
    preview,
    async () => true,
  );
  expect(result.sent).toBe(0);
  expect(store.claims.size).toBe(0);
});

it("leaves stories published before this column for later", async () => {
  const store = memoryStore({
    stories: [story("old", { publishedAt: null })],
    members: [member("greg", STORYLINE_TEST_RECIPIENT)],
  });
  const result = await announcePublishedStorylines(
    store,
    { ...fanout, DIGEST_UNSUBSCRIBE_SECRET: SECRET },
    async () => {
      throw new Error("archive story must not be emailed");
    },
  );
  expect(result.stories).toBe(0);
  expect(result.sent).toBe(0);
});
