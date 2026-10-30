import { afterEach, beforeEach, expect, it, vi } from "vitest";

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
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("still throws its existing rejection message after a refused rate-limit retry", async () => {
  vi.useFakeTimers();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  send.mockResolvedValue({ error: { name: "rate_limit_exceeded" } });
  const result = expect(
    sendStorylineAnnounceEmail("greg@klevox.com", message, {
      VERCEL_ENV: "preview",
      NODE_ENV: "production",
    }),
  ).rejects.toThrow("Resend rejected the storyline announcement");
  await vi.advanceTimersByTimeAsync(1000);
  await result;
  expect(send).toHaveBeenCalledTimes(2);
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
