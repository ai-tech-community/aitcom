import { expect, it } from "vitest";

import { STORYLINE_TEST_RECIPIENT } from "./storyline-draft-review";
import {
  renderStorylineAnnounceEmail,
  storylineAnnounceFanoutEnabled,
  storylineAwaitingAnnouncement,
  storylinePublicUrl,
  storylineUnsubscribeUrl,
} from "./storyline-announce";

const production = { VERCEL_ENV: "production", NODE_ENV: "production" };

it("fans out in production and only there", () => {
  expect(storylineAnnounceFanoutEnabled(production)).toBe(true);
  expect(
    storylineAnnounceFanoutEnabled({
      VERCEL_ENV: "preview",
      NODE_ENV: "production",
    }),
  ).toBe(false);
  expect(
    storylineAnnounceFanoutEnabled({
      VERCEL_ENV: "production",
      NODE_ENV: "development",
    }),
  ).toBe(false);
  expect(
    storylineAnnounceFanoutEnabled({
      VERCEL_ENV: "production",
      NODE_ENV: "test",
    }),
  ).toBe(false);
});

it("links the published story on the public site", () => {
  expect(storylinePublicUrl("local-ai")).toBe(
    "https://www.aitcommunity.org/en/news/stories/local-ai",
  );
  expect(storylineUnsubscribeUrl("tok.sig")).toBe(
    "https://www.aitcommunity.org/en/unsubscribe?t=tok.sig",
  );
});

it("announces a story only after this feature published it, and only once", () => {
  const publishedAt = new Date("2026-10-15T12:00:00Z");
  expect(
    storylineAwaitingAnnouncement({
      status: "published",
      publishedAt,
      announcedAt: null,
    }),
  ).toBe(true);
  expect(
    storylineAwaitingAnnouncement({
      status: "published",
      publishedAt: null,
      announcedAt: null,
    }),
  ).toBe(false);
  expect(
    storylineAwaitingAnnouncement({
      status: "draft",
      publishedAt,
      announcedAt: null,
    }),
  ).toBe(false);
  expect(
    storylineAwaitingAnnouncement({
      status: "published",
      publishedAt,
      announcedAt: publishedAt,
    }),
  ).toBe(false);
});

it("uses the stored title and overview and does not invent a summary", () => {
  const storyUrl = storylinePublicUrl("local-ai");
  const unsubscribeUrl = storylineUnsubscribeUrl("tok.sig");
  const message = renderStorylineAnnounceEmail({
    title: "AI on devices",
    summary: "Local processing keeps documents on the device.",
    storyUrl,
    unsubscribeUrl,
  });

  expect(message.subject).toBe("AI on devices");
  expect(message.text).toContain("AI on devices");
  expect(message.text).toContain(
    "Local processing keeps documents on the device.",
  );
  expect(message.text).toContain(storyUrl);
  expect(message.text).toContain(unsubscribeUrl);
  expect(message.html).toContain(storyUrl);
  expect(message.html).toContain(unsubscribeUrl);
  expect(message.html).not.toMatch(/generated|lorem|summary unavailable/i);
  expect(message.text).not.toContain(STORYLINE_TEST_RECIPIENT);
});

it("omits the summary when the story has none stored", () => {
  const message = renderStorylineAnnounceEmail({
    title: "AI on devices",
    summary: "   ",
    storyUrl: storylinePublicUrl("local-ai"),
    unsubscribeUrl: storylineUnsubscribeUrl("tok.sig"),
  });
  expect(message.text).not.toMatch(/in summary|tldr|overview:/i);
  expect(message.html).not.toContain("<p></p>");
  expect(message.html).not.toContain("Stored");
  expect(message.text.split("\n").filter((line) => line.trim())).toEqual([
    "AI on devices",
    storylinePublicUrl("local-ai"),
    `Unsubscribe: ${storylineUnsubscribeUrl("tok.sig")}`,
    "AIT Community",
  ]);
});

it("escapes the stored overview in HTML", () => {
  const message = renderStorylineAnnounceEmail({
    title: "A <story>",
    summary: `Local <script>alert("x")</script> processing`,
    storyUrl: storylinePublicUrl("local-ai"),
    unsubscribeUrl: storylineUnsubscribeUrl("a&b"),
  });
  expect(message.html).not.toContain("<script>");
  expect(message.html).toContain("&lt;script&gt;");
  expect(message.html).toContain("A &lt;story&gt;");
  expect(message.subject).toBe("A <story>");
});
