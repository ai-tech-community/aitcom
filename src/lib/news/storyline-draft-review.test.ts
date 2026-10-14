import { expect, it } from "vitest";

import {
  STORYLINE_TEST_RECIPIENT,
  renderStorylineDraftReviewEmail,
  storylineDraftReviewPath,
  storylineDraftReviewUrl,
  storylineDraftViewerRole,
  storylineMailRecipient,
  storylineReviewRecipients,
  summarizeStorylineDraft,
} from "./storyline-draft-review";

const EXISTING_DRAFT = "f79b8204-0a7a-485a-82c9-a2a072034eab";

it("builds a direct review link for a draft", () => {
  expect(storylineDraftReviewPath(EXISTING_DRAFT)).toBe(
    `/news/stories/drafts/${EXISTING_DRAFT}`,
  );
  expect(
    storylineDraftReviewUrl(EXISTING_DRAFT, "https://www.aitcommunity.org"),
  ).toBe(
    `https://www.aitcommunity.org/en/news/stories/drafts/${EXISTING_DRAFT}`,
  );
});

it("emails members only from production and otherwise only the allowlisted address", () => {
  const production = { VERCEL_ENV: "production", NODE_ENV: "production" };
  expect(storylineMailRecipient("Owner@Example.com", production)).toBe(
    "owner@example.com",
  );
  expect(
    storylineMailRecipient("owner@example.com", {
      VERCEL_ENV: "preview",
      NODE_ENV: "production",
    }),
  ).toBeNull();
  expect(
    storylineMailRecipient("owner@example.com", {
      VERCEL_ENV: "production",
      NODE_ENV: "test",
    }),
  ).toBeNull();
  expect(
    storylineMailRecipient("Greg@Klevox.com", {
      VERCEL_ENV: "preview",
      NODE_ENV: "production",
    }),
  ).toBe(STORYLINE_TEST_RECIPIENT);
  expect(
    storylineMailRecipient(STORYLINE_TEST_RECIPIENT, { NODE_ENV: "test" }),
  ).toBe(STORYLINE_TEST_RECIPIENT);
});

it("notifies the owner and each editor once", () => {
  expect(
    storylineReviewRecipients({
      owner: { userId: "owner", email: "Owner@Example.com" },
      editors: [
        { userId: "owner", email: "owner@example.com" },
        { userId: "ed", email: "Editor@Example.com" },
        { userId: null, email: "payload-only@example.com" },
        { userId: "ed", email: "other@example.com" },
      ],
    }),
  ).toEqual([
    { userId: "owner", email: "owner@example.com", kind: "owner" },
    { userId: "ed", email: "editor@example.com", kind: "editor" },
    { userId: null, email: "payload-only@example.com", kind: "editor" },
  ]);
});

it("lets the owner or an editor open a draft and hides it from everyone else", () => {
  expect(
    storylineDraftViewerRole({
      viewerId: null,
      ownerId: "owner",
      staff: false,
    }),
  ).toBe("anonymous");
  expect(
    storylineDraftViewerRole({
      viewerId: "owner",
      ownerId: "owner",
      staff: false,
    }),
  ).toBe("owner");
  expect(
    storylineDraftViewerRole({
      viewerId: "ed",
      ownerId: "owner",
      staff: true,
    }),
  ).toBe("editor");
  expect(
    storylineDraftViewerRole({
      viewerId: "stranger",
      ownerId: "owner",
      staff: false,
    }),
  ).toBe("denied");
});

it("keeps an existing pending draft visible when its stored input is incomplete", () => {
  const summary = summarizeStorylineDraft({
    id: EXISTING_DRAFT,
    ownerId: "owner",
    content: "Stored headline\n\nStored overview",
    status: "pending",
    createdAt: new Date("2026-10-14T12:00:00.000Z"),
    metadata: { input: { titleEn: "" } },
    agentName: null,
  });
  expect(summary).toMatchObject({
    id: EXISTING_DRAFT,
    title: "Stored headline",
    overview: "Stored overview",
    agentName: "Connected agent",
    status: "pending",
    reviewPath: `/news/stories/drafts/${EXISTING_DRAFT}`,
  });
});

it("puts the review link in the email", () => {
  const url = storylineDraftReviewUrl(
    EXISTING_DRAFT,
    "https://www.aitcommunity.org",
  );
  const message = renderStorylineDraftReviewEmail({
    title: "Local AI <script>",
    reviewUrl: url,
  });
  expect(message.subject).toBe("A news storyline draft is waiting for review");
  expect(message.html).toContain(url);
  expect(message.html).toContain("Local AI &lt;script&gt;");
  expect(message.html).not.toContain("<script>");
  expect(message.text).toContain(url);
});
