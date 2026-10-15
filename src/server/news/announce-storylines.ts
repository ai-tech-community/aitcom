import {
  STORYLINE_TEST_RECIPIENT,
  storylineMailRecipient,
} from "@/lib/news/storyline-draft-review";
import {
  renderStorylineAnnounceEmail,
  storylineAnnounceFanoutEnabled,
  storylineAwaitingAnnouncement,
  storylinePublicUrl,
  storylineUnsubscribeUrl,
  type StorylineAnnounceEnv,
} from "@/lib/news/storyline-announce";
import {
  digestListUnsubscribeHeaders,
  signUnsubscribeToken,
  unsubscribeSecret,
} from "@/server/notifications/unsubscribe-token";

/** Members mailed in one cron run. The next run continues where this one stopped. */
export const STORYLINE_ANNOUNCE_BATCH = 40;

/** Gap between fan-out sends so a run stays under Resend's rate limit. */
export const STORYLINE_ANNOUNCE_PACE_MS = 600;

const STORIES_PER_FANOUT = 1;
const STORIES_PER_PREVIEW = 5;

export type AnnounceStory = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  status: string;
  publishedAt: Date | null;
  announcedAt: Date | null;
};

export type AnnounceMember = {
  id: string;
  email: string;
  optedOutAt: Date | null;
};

export type AnnounceMessage = {
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
};

export type AnnounceStore = {
  pendingStories(limit: number): Promise<AnnounceStory[]>;
  recipients(
    storyId: string,
    opts: { onlyEmail: string | null; limit: number },
  ): Promise<AnnounceMember[]>;
  claim(storyId: string, userId: string): Promise<boolean>;
  release(storyId: string, userId: string): Promise<void>;
  markAnnouncedIfComplete(storyId: string): Promise<boolean>;
};

export type AnnounceResult = {
  fanout: boolean;
  stories: number;
  sent: number;
  skipped: number;
  completed: number;
};

/**
 * Mail published stories outside the publish request.
 * Each member is claimed once per story. Production emails every member who
 * has not opted out. Every other run may reach the allowlisted address and
 * leaves the story unfinished so a later production deploy can finish it.
 */
export async function announcePublishedStorylines(
  store: AnnounceStore,
  env: StorylineAnnounceEnv & {
    DIGEST_UNSUBSCRIBE_SECRET?: string;
    BETTER_AUTH_SECRET?: string;
  },
  send: (to: string, message: AnnounceMessage) => Promise<boolean>,
  sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<AnnounceResult> {
  const fanout = storylineAnnounceFanoutEnabled(env);
  const secret = unsubscribeSecret(env);
  if (!secret) {
    console.error(
      "news-storyline-announce: unsubscribe secret is not configured",
    );
    return { fanout, stories: 0, sent: 0, skipped: 0, completed: 0 };
  }

  const onlyEmail = fanout ? null : STORYLINE_TEST_RECIPIENT;
  const pending = await store.pendingStories(
    fanout ? STORIES_PER_FANOUT : STORIES_PER_PREVIEW,
  );
  const stories = pending.filter(storylineAwaitingAnnouncement);
  let sent = 0;
  let skipped = 0;
  let completed = 0;

  for (const story of stories) {
    const people = await store.recipients(story.id, {
      onlyEmail,
      limit: STORYLINE_ANNOUNCE_BATCH,
    });
    for (const person of people) {
      if (person.optedOutAt) {
        skipped += 1;
        continue;
      }
      const recipient = storylineMailRecipient(person.email, env);
      if (!recipient || (!fanout && recipient !== STORYLINE_TEST_RECIPIENT)) {
        skipped += 1;
        continue;
      }
      const won = await store.claim(story.id, person.id);
      if (!won) {
        skipped += 1;
        continue;
      }
      const token = signUnsubscribeToken(
        { userId: person.id, scope: "story" },
        secret,
      );
      const rendered = renderStorylineAnnounceEmail({
        title: story.title,
        summary: story.summary,
        storyUrl: storylinePublicUrl(story.slug),
        unsubscribeUrl: storylineUnsubscribeUrl(token),
      });
      try {
        const ok = await send(recipient, {
          ...rendered,
          headers: digestListUnsubscribeHeaders(token),
        });
        if (!ok) {
          await store.release(story.id, person.id);
          skipped += 1;
          continue;
        }
        sent += 1;
        if (fanout) await sleep(STORYLINE_ANNOUNCE_PACE_MS);
      } catch {
        console.error("news-storyline-announce: send failed", {
          storyId: story.id,
          userId: person.id,
        });
      }
    }
    if (fanout && (await store.markAnnouncedIfComplete(story.id))) {
      completed += 1;
    }
  }

  return { fanout, stories: stories.length, sent, skipped, completed };
}
