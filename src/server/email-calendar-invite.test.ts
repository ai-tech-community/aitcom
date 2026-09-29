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
  beforeEach(() => send.mockReset());

  it.each([
    ["registration confirmation", sendRegistrationConfirmation],
    ["waitlist promotion", sendWaitlistPromotion],
    ["cancellation", sendCancellationConfirmation],
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
});
