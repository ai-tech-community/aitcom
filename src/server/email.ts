/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
 
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

const FROM_EMAIL = "AIT Community <noreply@mailer.aitcommunity.org>";

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
          <a href="https://aitcommunity.org/events/${event.eventSlug}" style="color: #000; font-weight: bold;">
            View event details →
          </a>
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="font-size: 12px; color: #999;">
          AIT Community
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
          <a href="https://aitcommunity.org/events/${event.eventSlug}" style="color: #000; font-weight: bold;">
            Register again →
          </a>
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="font-size: 12px; color: #999;">
          AIT Community
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
        <p>Good news - a spot opened up for <strong>${event.eventTitle}</strong> and you've been moved from the waitlist to registered!</p>
        <table style="margin: 16px 0; font-size: 14px;">
          <tr><td style="padding: 4px 12px 4px 0; color: #666;">Date</td><td>${event.eventDate}</td></tr>
          <tr><td style="padding: 4px 12px 4px 0; color: #666;">Location</td><td>${event.eventLocation}</td></tr>
        </table>
        <p style="margin-top: 24px;">
          <a href="https://aitcommunity.org/events/${event.eventSlug}" style="color: #000; font-weight: bold;">
            View event details →
          </a>
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="font-size: 12px; color: #999;">
          AIT Community
        </p>
      </div>
    `,
  });
}

interface SponsorApplicationEmailData {
  companyName: string;
  tier: string;
  contactName: string;
  contactEmail: string;
}

/**
 * Send confirmation to applicant after submitting sponsor application.
 */
export async function sendSponsorApplicationConfirmation(
  to: string,
  contactName: string,
  data: SponsorApplicationEmailData,
) {
  const resend = getResend();
  if (!resend) return;

  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `Application received - ${data.tier} sponsorship`,
    html: `
      <div style="font-family: monospace; max-width: 600px; margin: 0 auto;">
        <h2 style="font-size: 18px;">Thanks for your interest!</h2>
        <p>Hi ${contactName},</p>
        <p>We've received your <strong>${data.tier}</strong> sponsorship application for <strong>${data.companyName}</strong>.</p>
        <p>Our team will review it and get back to you shortly.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="font-size: 12px; color: #999;">AIT Community</p>
      </div>
    `,
  });
}

/**
 * Notify AIT team of new sponsor application.
 */
export async function sendSponsorApplicationNotification(
  data: SponsorApplicationEmailData,
) {
  const resend = getResend();
  if (!resend) return;

  await resend.emails.send({
    from: FROM_EMAIL,
    to: "info@aitcommunity.org",
    subject: `New sponsor application: ${data.companyName} (${data.tier})`,
    html: `
      <div style="font-family: monospace; max-width: 600px; margin: 0 auto;">
        <h2 style="font-size: 18px;">New Sponsor Application</h2>
        <table style="margin: 16px 0; font-size: 14px;">
          <tr><td style="padding: 4px 12px 4px 0; color: #666;">Company</td><td>${data.companyName}</td></tr>
          <tr><td style="padding: 4px 12px 4px 0; color: #666;">Tier</td><td>${data.tier}</td></tr>
          <tr><td style="padding: 4px 12px 4px 0; color: #666;">Contact</td><td>${data.contactName} (${data.contactEmail})</td></tr>
        </table>
        <p><a href="https://aitcommunity.org/admin/collections/sponsor-applications" style="color: #000; font-weight: bold;">Review in admin →</a></p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="font-size: 12px; color: #999;">AIT Community</p>
      </div>
    `,
  });
}

/**
 * Welcome email sent to sponsor on application approval.
 */
export async function sendSponsorWelcome(
  to: string,
  contactName: string,
  data: SponsorApplicationEmailData,
) {
  const resend = getResend();
  if (!resend) return;

  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `Welcome aboard, ${data.companyName}!`,
    html: `
      <div style="font-family: monospace; max-width: 600px; margin: 0 auto;">
        <h2 style="font-size: 18px;">You're an official AIT sponsor!</h2>
        <p>Hi ${contactName},</p>
        <p>Great news - your <strong>${data.tier}</strong> sponsorship application for <strong>${data.companyName}</strong> has been approved.</p>
        <p>Welcome to the AIT Community as an official sponsor. Our team will be in touch with next steps.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="font-size: 12px; color: #999;">AIT Community</p>
      </div>
    `,
  });
}

/**
 * Welcome email sent when a new member joins.
 */
export async function sendMemberWelcome(
  to: string,
  displayName: string,
) {
  const resend = getResend();
  if (!resend) return;

  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `Welcome to AIT Community, ${displayName}!`,
    html: `
      <div style="font-family: monospace; max-width: 600px; margin: 0 auto;">
        <h2 style="font-size: 18px;">Welcome, ${displayName}!</h2>
        <p>You've joined AIT Community — a platform for engineers and AI agents building together.</p>
        <p style="margin-top: 16px;">Here's what to do next:</p>
        <ul style="font-size: 14px; line-height: 1.8;">
          <li><a href="https://www.aitcommunity.org/en/community" style="color: #000;">Join the forum</a> — introduce yourself</li>
          <li><a href="https://www.aitcommunity.org/en/challenges" style="color: #000;">Pick a challenge</a> — earn XP and get on the leaderboard</li>
          <li><a href="https://www.aitcommunity.org/en/benchmark" style="color: #000;">Run the benchmark</a> — test your AI agent</li>
          <li><a href="https://www.aitcommunity.org/en/events" style="color: #000;">RSVP to an event</a> — meet the community in Amsterdam</li>
        </ul>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="font-size: 12px; color: #999;">AIT Community · Amsterdam</p>
      </div>
    `,
  });
}

/**
 * Confirmation email when a challenge solution is submitted.
 */
export async function sendChallengeSubmissionConfirmation(
  to: string,
  displayName: string,
  challengeTitle: string,
  challengeSlug: string,
) {
  const resend = getResend();
  if (!resend) return;

  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `Solution submitted: ${challengeTitle}`,
    html: `
      <div style="font-family: monospace; max-width: 600px; margin: 0 auto;">
        <h2 style="font-size: 18px;">Solution received!</h2>
        <p>Hi ${displayName},</p>
        <p>Your solution for <strong>${challengeTitle}</strong> has been submitted and is pending review.</p>
        <p style="margin-top: 24px;">
          <a href="https://www.aitcommunity.org/en/challenges/${challengeSlug}" style="color: #000; font-weight: bold;">
            View challenge →
          </a>
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="font-size: 12px; color: #999;">AIT Community</p>
      </div>
    `,
  });
}

/**
 * Notify thread author when someone replies to their forum thread.
 */
export async function sendForumReplyNotification(
  to: string,
  authorName: string,
  replierName: string,
  threadTitle: string,
  threadSlug: string,
) {
  const resend = getResend();
  if (!resend) return;

  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `${replierName} replied to your thread`,
    html: `
      <div style="font-family: monospace; max-width: 600px; margin: 0 auto;">
        <h2 style="font-size: 18px;">New reply on your thread</h2>
        <p>Hi ${authorName},</p>
        <p><strong>${replierName}</strong> replied to your thread: <em>${threadTitle}</em></p>
        <p style="margin-top: 24px;">
          <a href="https://www.aitcommunity.org/en/community/${threadSlug}" style="color: #000; font-weight: bold;">
            View reply →
          </a>
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="font-size: 12px; color: #999;">AIT Community · <a href="https://www.aitcommunity.org/en/settings" style="color: #999;">Unsubscribe</a></p>
      </div>
    `,
  });
}
