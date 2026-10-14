import { beforeEach, expect, it, vi } from "vitest";

const send = vi.hoisted(() => vi.fn());

vi.mock("@/env", () => ({ env: { RESEND_API_KEY: "test-key" } }));
vi.mock("@/server/payload", () => ({ getPayloadClient: vi.fn() }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));

import { sendStorylineDraftReviewEmail } from "./email";

const reviewUrl =
  "https://www.aitcommunity.org/en/news/stories/drafts/f79b8204-0a7a-485a-82c9-a2a072034eab";

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue({ error: null });
});

it("never emails a member from a test, even if the caller claims production", async () => {
  await expect(
    sendStorylineDraftReviewEmail(
      "member@example.com",
      { title: "Local AI", reviewUrl },
      { VERCEL_ENV: "production", NODE_ENV: "production" },
    ),
  ).rejects.toThrow("Storyline review email refused");
  expect(send).not.toHaveBeenCalled();
});

it("skips member addresses on preview and sends only the allowlisted address", async () => {
  const preview = { VERCEL_ENV: "preview", NODE_ENV: "production" };
  expect(
    await sendStorylineDraftReviewEmail(
      "member@example.com",
      { title: "Local AI", reviewUrl },
      preview,
    ),
  ).toBe(false);
  expect(
    await sendStorylineDraftReviewEmail(
      "Greg@Klevox.com",
      { title: "Local AI", reviewUrl },
      preview,
    ),
  ).toBe(true);
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0]?.[0]).toMatchObject({
    to: "greg@klevox.com",
    subject: "A news storyline draft is waiting for review",
  });
  expect(send.mock.calls[0]?.[0].html).toContain(reviewUrl);
  expect(send.mock.calls[0]?.[0].text).toContain(reviewUrl);
});
