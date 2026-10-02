import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.hoisted(() => vi.fn());

vi.mock("@/env", () => ({ env: { RESEND_API_KEY: "test-key" } }));
vi.mock("@/server/payload", () => ({ getPayloadClient: vi.fn() }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));

import { sendBroadcastEmail } from "./email";

describe("sendBroadcastEmail", () => {
  beforeEach(() => {
    send.mockReset();
    send.mockResolvedValue({ error: null });
  });

  it("links 'Manage notifications' to the email preferences on Settings", async () => {
    expect(await sendBroadcastEmail("a@example.test", "Hi", "Body")).toBe(true);

    const manage =
      "https://www.aitcommunity.org/en/dashboard/settings#notifications";
    const message = send.mock.calls[0]![0] as { html: string; text: string };
    expect(message.html).toContain(`href="${manage}"`);
    expect(message.text).toContain(`Manage notifications: ${manage}`);
    expect(message.html).not.toContain("/dashboard/notifications");
  });
});
