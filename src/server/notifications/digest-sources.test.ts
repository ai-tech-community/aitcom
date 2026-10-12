import { describe, expect, it } from "vitest";

import { feedHighlight, forumHighlight } from "./digest-items";

const COMMUNITIES = [
  { id: "hub", slug: "ait" },
  { id: "lab", slug: "lab" },
];

describe("forumHighlight", () => {
  it("links a thread in the member's community", () => {
    expect(
      forumHighlight(
        {
          title: "Ship notes",
          slug: "ship-notes",
          communityId: "lab",
          replyCount: 3,
        },
        COMMUNITIES,
      ),
    ).toEqual({
      communityId: "lab",
      title: "Ship notes",
      path: "/en/communities/lab/forum/ship-notes",
      kind: "thread",
      score: 3,
    });
  });

  it("treats an unscoped thread as the Hub", () => {
    const item = forumHighlight(
      { title: "Welcome", slug: "welcome", replyCount: 2 },
      COMMUNITIES,
    );
    expect(item?.path).toBe("/en/communities/ait/forum/welcome");
    expect(item?.communityId).toBe("hub");
  });

  it("skips a deleted thread", () => {
    expect(
      forumHighlight(
        { title: "Gone", slug: "gone", communityId: "lab", isDeleted: true },
        COMMUNITIES,
      ),
    ).toBeNull();
  });
});

describe("feedHighlight", () => {
  it("uses likes or comments, whichever is higher", () => {
    const item = feedHighlight(
      {
        id: 9,
        content: "Look at this",
        communityId: "lab",
        likeCount: 1,
        commentCount: 4,
      },
      COMMUNITIES,
    );
    expect(item).toMatchObject({
      score: 4,
      path: "/en/communities/lab",
      kind: "post",
    });
  });

  it("points a video post at the reel", () => {
    const item = feedHighlight(
      {
        id: 4,
        content: "Demo",
        communityId: "lab",
        likeCount: 2,
        video: { key: "clip" },
      },
      COMMUNITIES,
    );
    expect(item?.path).toBe("/en/communities/lab/reels?v=4");
  });
});
