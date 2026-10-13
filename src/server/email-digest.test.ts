import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.hoisted(() => vi.fn());

vi.mock("@/env", () => ({ env: { RESEND_API_KEY: "test-key" } }));
vi.mock("@/server/payload", () => ({ getPayloadClient: vi.fn() }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));

import { sendHubDigestEmail } from "./email";

describe("sendHubDigestEmail", () => {
  beforeEach(() => {
    send.mockReset();
    send.mockResolvedValue({ data: { id: "email_1" }, error: null });
  });

  it("sends the html and plain-text parts", async () => {
    await expect(
      sendHubDigestEmail("member@example.com", "<p>Hi</p>", "Hi"),
    ).resolves.toBe(true);

    await expect(
      sendHubDigestEmail("member@example.com", "<p>Hi</p>", "Hi", {
        "List-Unsubscribe":
          "<https://www.aitcommunity.org/api/email/unsubscribe?t=abc>",
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      }),
    ).resolves.toBe(true);

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "member@example.com",
        subject: "Your weekly AIT digest",
        html: "<p>Hi</p>",
        text: "Hi",
        headers: {
          "List-Unsubscribe":
            "<https://www.aitcommunity.org/api/email/unsubscribe?t=abc>",
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      }),
    );
  });

  it("surfaces a Resend error instead of reporting success", async () => {
    send.mockResolvedValue({
      data: null,
      error: { message: "invalid recipient", name: "validation_error" },
    });
    await expect(
      sendHubDigestEmail("member@example.com", "<p>Hi</p>", "Hi"),
    ).rejects.toThrow(/invalid recipient/);
  });
});
