import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { send, configured } = vi.hoisted(() => ({
  send: vi.fn(),
  configured: { RESEND_API_KEY: "test-key" },
}));
vi.mock("@/env", () => ({ env: configured }));
vi.mock("@/server/payload", () => ({ getPayloadClient: vi.fn() }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));

import { sendGatedEmail } from "./email";

const message = {
  subject: "New issue",
  html: "<p>Read it</p>",
  text: "Read it",
};
const env = { VERCEL_ENV: "preview", NODE_ENV: "production" };
const options = {
  refusedMessage: "Refused",
  rejectedMessage: "Rejected",
  logPrefix: "test-mail",
  retryOnRateLimit: true,
};

beforeEach(() => {
  configured.RESEND_API_KEY = "test-key";
  send.mockReset().mockResolvedValue({ error: null });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("keeps the gated recipient even if a message carries extra recipient fields", async () => {
  const extra = {
    ...message,
    to: "member@example.com",
    headers: { "List-Unsubscribe": "<https://example.test/leave>" },
  };
  expect(await sendGatedEmail("Greg@Klevox.com", extra, env, options)).toBe(
    true,
  );
  expect(send).toHaveBeenCalledWith(
    expect.objectContaining({
      to: "greg@klevox.com",
      ...message,
      headers: extra.headers,
    }),
  );
});

it("returns false when the gate refuses or Resend is not configured", async () => {
  expect(
    await sendGatedEmail("member@example.com", message, env, options),
  ).toBe(false);
  configured.RESEND_API_KEY = "";
  expect(await sendGatedEmail("greg@klevox.com", message, env, options)).toBe(
    false,
  );
  expect(send).not.toHaveBeenCalled();
});

it("retries a rate limit once after one second", async () => {
  vi.useFakeTimers();
  send.mockResolvedValueOnce({ error: { name: "rate_limit_exceeded" } });
  const sending = sendGatedEmail("greg@klevox.com", message, env, options);
  await vi.advanceTimersByTimeAsync(999);
  expect(send).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(await sending).toBe(true);
  expect(send).toHaveBeenCalledTimes(2);
});

it("uses the caller's rejection message and logs only the error name without retry", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  send.mockResolvedValue({
    error: { name: "rate_limit_exceeded", message: "private details" },
  });
  await expect(
    sendGatedEmail("greg@klevox.com", message, env, {
      ...options,
      retryOnRateLimit: false,
    }),
  ).rejects.toThrow("Rejected");
  expect(send).toHaveBeenCalledTimes(1);
  expect(log).toHaveBeenCalledWith(
    "test-mail: resend rejected the email",
    "rate_limit_exceeded",
  );
});
