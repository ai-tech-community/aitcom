import { Resend } from "resend";
import {
  referralInvitePath,
  referralMailCopy,
  type ReferralLocale,
} from "@/lib/referral-invites";
import { CANONICAL_PRODUCTION_ORIGIN } from "@/server/better-auth/base-url";
import { referralOptOutToken } from "./tokens";
import {
  referralSecret,
  referralPhaseEnabled,
  referralEmailEnv,
  type ReferralEmailEnv,
} from "./config";

export type ReferralMessage = {
  id: string;
  recipientEmail: string;
  recipientHash: string;
  senderName: string;
  communityName: string;
  inviteCode: string;
  locale: ReferralLocale;
  phase: "invite" | "reminder";
};
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );

export function renderReferralEmail(message: ReferralMessage, secret: string) {
  const t = referralMailCopy[message.locale];
  const invite = `${CANONICAL_PRODUCTION_ORIGIN}${referralInvitePath(message.locale, message.inviteCode, message.id, message.phase === "reminder")}`;
  const token = referralOptOutToken(message.recipientHash, secret);
  const unsubscribe = `${CANONICAL_PRODUCTION_ORIGIN}/${message.locale}/invitations/unsubscribe?t=${encodeURIComponent(token)}`;
  const oneClick = `${CANONICAL_PRODUCTION_ORIGIN}/api/referral-invites/unsubscribe?t=${encodeURIComponent(token)}`;
  const subject = (message.phase === "reminder" ? t.reminder : t.subject)(
    message.senderName,
    message.communityName,
  ).replace(/[\r\n]+/g, " ");
  const paragraphs = [
    t.hello,
    t.body(message.senderName),
    ...(message.phase === "reminder" ? [t.reminderBody] : []),
    t.personal,
  ];
  return {
    subject,
    text: [
      t.heading,
      ...paragraphs,
      `${t.accept}: ${invite}`,
      t.signoff,
      "AIT Community",
      t.footer(message.senderName),
      `${t.unsubscribe}: ${unsubscribe}`,
    ].join("\n\n"),
    html: `<!doctype html><html lang="${message.locale}"><body><div style="font-family:'Geist Sans',Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#171717"><p style="font-size:24px;font-weight:bold">AIT Community</p><h1 style="font-size:32px;line-height:1.2">${escape(t.heading)}</h1>${paragraphs.map((text) => `<p style="font-size:16px;line-height:1.6">${escape(text)}</p>`).join("")}<p><strong>${escape(message.senderName)}</strong> · ${escape(message.communityName)}</p><p style="margin:28px 0"><a href="${escape(invite)}" style="background:#ff6900;color:#171717;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">${escape(t.accept)}</a></p><p>${escape(t.signoff)}<br>AIT Community</p><hr style="border:0;border-top:1px solid #e5e5e5;margin:28px 0"><p style="font-size:12px;line-height:1.6;color:#595959">${escape(t.footer(message.senderName))}<br><a href="${escape(unsubscribe)}" style="color:#595959">${escape(t.unsubscribe)}</a></p></div></body></html>`,
    headers: {
      "List-Unsubscribe": `<${oneClick}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}

export async function sendReferralEmail(
  message: ReferralMessage,
  env: ReferralEmailEnv = referralEmailEnv(),
): Promise<string | null> {
  if (!referralPhaseEnabled(message.phase, env)) return null;
  const content = renderReferralEmail(message, referralSecret(env));
  const { data, error } = await new Resend(env.RESEND_API_KEY).emails.send(
    {
      from: "AIT Community <noreply@mailer.aitcommunity.org>",
      to: message.recipientEmail,
      ...content,
    },
    { idempotencyKey: `referral/${message.id}/${message.phase}` },
  );
  if (error || !data?.id) throw new Error("Referral email was not accepted");
  return data.id;
}
