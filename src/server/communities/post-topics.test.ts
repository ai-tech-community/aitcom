import { describe, expect, it, vi } from "vitest";

import { DEFAULT_TOPIC, releaseDeletedTopic } from "./post-topics";

function fakePayload(errorsFor: string[] = []) {
  const update = vi.fn(async ({ collection }: { collection: string }) => ({
    docs: [],
    errors: errorsFor.includes(collection)
      ? [{ id: 1, message: "write failed" }]
      : [],
  }));
  return { payload: { update } as never, update };
}

const TOPIC = { communityId: "c1", slug: "outings" };
const inTopic = {
  and: [
    { communityId: { equals: "c1" } },
    { topicSlug: { equals: "outings" } },
  ],
};

describe("releaseDeletedTopic", () => {
  it("moves the topic's feed posts to the default topic", async () => {
    const { payload, update } = fakePayload();
    await releaseDeletedTopic(payload, TOPIC);
    expect(update).toHaveBeenCalledWith({
      collection: "feed-posts",
      where: inTopic,
      data: { topicSlug: DEFAULT_TOPIC },
    });
  });

  it("takes the category off the topic's gallery items and batches", async () => {
    const { payload, update } = fakePayload();
    await releaseDeletedTopic(payload, TOPIC);
    expect(update).toHaveBeenCalledWith({
      collection: "gallery-items",
      where: inTopic,
      data: { topicSlug: null },
    });
    expect(update).toHaveBeenCalledWith({
      collection: "gallery-batches",
      where: inTopic,
      data: { topicSlug: null },
    });
  });

  it("throws when any row could not be moved, so the topic is kept for a retry", async () => {
    const { payload } = fakePayload(["gallery-items"]);
    const log = vi.fn();
    await expect(releaseDeletedTopic(payload, TOPIC, log)).rejects.toThrow();
    expect(log).toHaveBeenCalledWith(
      "[topics.remove] moving content off a deleted topic failed",
      expect.objectContaining({ collection: "gallery-items" }),
    );
  });
});
