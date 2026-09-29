// The calendar invite handed to an event email must reach Resend as an
// attachment with its iTIP content type, or mail clients show no invite.
import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();

vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));
vi.mock("@/env", () => ({ env: { RESEND_API_KEY: "re_test" } }));
vi.mock("@/server/email-template", () => ({
  escapeHtml: (s: string) => s,
  renderEmailFromTemplate: async () => null,
  REGISTRATION_CONFIRMATION_TEMPLATE_KEY: "event-registration-confirmation",
}));

const {
  sendRegistrationConfirmation,
  sendWaitlistPromotion,
  sendCancellationConfirmation,
  sendEventChangedEmail,
  sendEventCancelledEmail,
} = await import("./email");

const EVENT = {
  eventTitle: "Builders night",
  eventDate: "2 Nov 2026",
  eventTime: "19:00–22:00 CET (Europe/Amsterdam)",
  eventLocation: "Amsterdam",
  eventSlug: "builders-night",
};
const INVITE = {
  filename: "invite.ics",
  content: "BEGIN:VCALENDAR\r\nEND:VCALENDAR",
  contentType: "text/calendar; charset=utf-8; method=REQUEST",
};

describe("event emails with a calendar invite", () => {
  beforeEach(() => {
    send.mockReset();
    send.mockResolvedValue({ data: { id: "em_1" }, error: null });
  });

  it.each([
    ["registration confirmation", sendRegistrationConfirmation],
    ["waitlist promotion", sendWaitlistPromotion],
    ["cancellation", sendCancellationConfirmation],
    ["event changed", sendEventChangedEmail],
    ["event cancelled", sendEventCancelledEmail],
  ])("%s attaches the invite", async (_name, sendEmail) => {
    await sendEmail("ada@example.com", "Ada", EVENT, INVITE);

    expect(send).toHaveBeenCalledTimes(1);
    const [message] = send.mock.calls[0]! as [
      {
        attachments: {
          filename: string;
          content: Buffer;
          contentType: string;
        }[];
      },
    ];
    expect(message.attachments).toHaveLength(1);
    expect(message.attachments[0]!.filename).toBe("invite.ics");
    expect(message.attachments[0]!.contentType).toBe(INVITE.contentType);
    expect(message.attachments[0]!.content.toString("utf-8")).toBe(
      INVITE.content,
    );
  });

  it("sends no attachment when there is no invite", async () => {
    await sendRegistrationConfirmation("ada@example.com", "Ada", EVENT);
    expect(send.mock.calls[0]![0]).toMatchObject({ attachments: undefined });
  });

  it("waits and tries once more when sending too fast", async () => {
    vi.useFakeTimers();
    send
      .mockResolvedValueOnce({
        data: null,
        error: { name: "rate_limit_exceeded", message: "Too many requests" },
      })
      .mockResolvedValueOnce({ data: { id: "em_2" }, error: null });

    const sent = sendEventChangedEmail("ada@example.com", "Ada", EVENT, INVITE);
    await vi.advanceTimersByTimeAsync(1000);

    await expect(sent).resolves.toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("reports a send Resend refused", async () => {
    send.mockResolvedValueOnce({
      data: null,
      error: { name: "validation_error", message: "bad address" },
    });
    await expect(
      sendEventCancelledEmail("bad", "Ada", EVENT, INVITE),
    ).resolves.toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
