import { Resend } from "resend";
import { env } from "@/env";

let resendInstance: Resend | null = null;

export function getResend(): Resend | null {
  if (!env.RESEND_API_KEY) return null;
  if (!resendInstance) {
    resendInstance = new Resend(env.RESEND_API_KEY);
  }
  return resendInstance;
}

const FROM_EMAIL = "AIT Community <noreply@aitcommunity.nl>";

interface EventEmailData {
  eventTitle: string;
  eventDate: string;
  eventLocation: string;
  eventSlug: string;
}

/**
 * Send registration confirmation email.
 */
export async function sendRegistrationConfirmation(
  to: string,
  userName: string,
  event: EventEmailData,
) {
  const resend = getResend();
  if (!resend) return;

  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `Registration confirmed: ${event.eventTitle}`,
    html: `
      <div style="font-family: monospace; max-width: 600px; margin: 0 auto;">
        <h2 style="font-size: 18px;">You're registered!</h2>
        <p>Hi ${userName},</p>
        <p>Your registration for <strong>${event.eventTitle}</strong> has been confirmed.</p>
        <table style="margin: 16px 0; font-size: 14px;">
          <tr><td style="padding: 4px 12px 4px 0; color: #666;">Date</td><td>${event.eventDate}</td></tr>
          <tr><td style="padding: 4px 12px 4px 0; color: #666;">Location</td><td>${event.eventLocation}</td></tr>
        </table>
        <p style="margin-top: 24px;">
          <a href="https://aitcommunity.nl/events/${event.eventSlug}" style="color: #000; font-weight: bold;">
            View event details →
          </a>
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="font-size: 12px; color: #999;">
          AIT Community Netherlands
        </p>
      </div>
    `,
  });
}

/**
 * Send cancellation confirmation email.
 */
export async function sendCancellationConfirmation(
  to: string,
  userName: string,
  event: EventEmailData,
) {
  const resend = getResend();
  if (!resend) return;

  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `Registration cancelled: ${event.eventTitle}`,
    html: `
      <div style="font-family: monospace; max-width: 600px; margin: 0 auto;">
        <h2 style="font-size: 18px;">Registration cancelled</h2>
        <p>Hi ${userName},</p>
        <p>Your registration for <strong>${event.eventTitle}</strong> has been cancelled.</p>
        <p>If this was a mistake, you can register again:</p>
        <p style="margin-top: 16px;">
          <a href="https://aitcommunity.nl/events/${event.eventSlug}" style="color: #000; font-weight: bold;">
            Register again →
          </a>
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="font-size: 12px; color: #999;">
          AIT Community Netherlands
        </p>
      </div>
    `,
  });
}

/**
 * Send waitlist promotion email (when a spot opens up).
 */
export async function sendWaitlistPromotion(
  to: string,
  userName: string,
  event: EventEmailData,
) {
  const resend = getResend();
  if (!resend) return;

  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `You got a spot! ${event.eventTitle}`,
    html: `
      <div style="font-family: monospace; max-width: 600px; margin: 0 auto;">
        <h2 style="font-size: 18px;">A spot opened up!</h2>
        <p>Hi ${userName},</p>
        <p>Good news — a spot opened up for <strong>${event.eventTitle}</strong> and you've been moved from the waitlist to registered!</p>
        <table style="margin: 16px 0; font-size: 14px;">
          <tr><td style="padding: 4px 12px 4px 0; color: #666;">Date</td><td>${event.eventDate}</td></tr>
          <tr><td style="padding: 4px 12px 4px 0; color: #666;">Location</td><td>${event.eventLocation}</td></tr>
        </table>
        <p style="margin-top: 24px;">
          <a href="https://aitcommunity.nl/events/${event.eventSlug}" style="color: #000; font-weight: bold;">
            View event details →
          </a>
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="font-size: 12px; color: #999;">
          AIT Community Netherlands
        </p>
      </div>
    `,
  });
}
