import { beforeEach, expect, it, vi } from "vitest";

const send = vi.hoisted(() => vi.fn());

vi.mock("@/env", () => ({ env: { RESEND_API_KEY: "test-key" } }));
vi.mock("@/server/payload", () => ({ getPayloadClient: vi.fn() }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));

import { sendStorylineAnnounceEmail } from "./email";

const message = {
  subject: "AI on devices",
  html: "<p>Local processing</p>",
  text: "Local processing",
};

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue({ error: null });
});

it("refuses a member address from a test process even when the env says production", async () => {
  await expect(
    sendStorylineAnnounceEmail("member@example.com", message, {
      VERCEL_ENV: "production",
      NODE_ENV: "production",
    }),
  ).rejects.toThrow("Storyline announcement email refused");
  expect(send).not.toHaveBeenCalled();
});

it("sends only the allowlisted address from preview", async () => {
  const preview = { VERCEL_ENV: "preview", NODE_ENV: "production" };
  expect(
    await sendStorylineAnnounceEmail("member@example.com", message, preview),
  ).toBe(false);
  expect(
    await sendStorylineAnnounceEmail("Greg@Klevox.com", message, preview),
  ).toBe(true);
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0]?.[0]).toMatchObject({
    to: "greg@klevox.com",
    subject: "AI on devices",
    text: "Local processing",
  });
});
