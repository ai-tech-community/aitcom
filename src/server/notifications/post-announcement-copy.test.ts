import { describe, expect, it } from "vitest";

import { postAnnouncementCopy } from "./post-announcement-copy";

const post = {
  authorName: "Jane\nDoe",
  communityName: "GIF Lab",
  text: "@everyone: Friday drinks at 6\nBring a friend",
  isVideo: false,
};

describe("postAnnouncementCopy", () => {
  it("leads with the first line, without @everyone, on one line", () => {
    expect(postAnnouncementCopy("en", post)).toMatchObject({
      subject: "Jane Doe in GIF Lab: Friday drinks at 6",
      cta: "Open the feed",
    });
    expect(postAnnouncementCopy("en", post).why).toMatch(
      /because you're a member of GIF Lab/,
    );
  });

  it("falls back to a plain subject, in English or Dutch", () => {
    const empty = { ...post, text: "@everyone", isVideo: true };
    expect(postAnnouncementCopy("en", empty)).toMatchObject({
      subject: "Jane Doe posted in GIF Lab",
      cta: "Watch the video",
    });
    expect(postAnnouncementCopy("nl", empty).subject).toBe(
      "Jane Doe plaatste een bericht in GIF Lab",
    );
  });

  it("clips a long first line", () => {
    const long = { ...post, text: "x".repeat(200) };
    expect(postAnnouncementCopy("en", long).subject).toHaveLength(
      "Jane Doe in GIF Lab: ".length + 80,
    );
  });
});
