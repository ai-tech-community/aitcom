import { createTranslator } from "next-intl";

import { loadMessages, type AppLocale } from "@/i18n/messages";
import { gatedMailRecipient } from "@/lib/email/recipient-gate";
import {
  issuePath,
  MAGAZINE_SUBSCRIPTION_CONFIRM_PATH,
} from "@/lib/magazines/paths";
import { CANONICAL_PRODUCTION_ORIGIN } from "@/server/better-auth/base-url";
import { sendGatedEmail } from "@/server/email";
import { escapeHtml } from "@/server/email-template";

export type MagazineMail = { subject: string; html: string; text: string };
export type OutgoingMagazineMail = MagazineMail & {
  headers?: Record<string, string>;
};
export type MagazineMailer = {
  send(to: string, mail: OutgoingMagazineMail): Promise<boolean>;
  recipient(to: string): string | null;
  sleep?: (ms: number) => Promise<void>;
};

export function defaultMagazineMailer(): MagazineMailer {
  const env = {
    VERCEL_ENV: process.env.VERCEL_ENV,
    NODE_ENV: process.env.NODE_ENV,
  };
  const recipient = (to: string) => gatedMailRecipient(to, env);
  return {
    recipient,
    send: (to, mail) =>
      sendGatedEmail(to, mail, env, {
        refusedMessage: "Magazine email refused",
        rejectedMessage: "Resend rejected the magazine email",
        logPrefix: "magazines",
        retryOnRateLimit: true,
        onRejected: "refuse",
        recipient,
      }),
  };
}

/** One plain layout; all dynamic values are escaped at the HTML boundary. */
export function renderMagazineMail(parts: {
  subject: string;
  heading: string;
  paragraphs: readonly string[];
  action: { label: string; href: string };
  footer: readonly string[];
  unsubscribe?: { label: string; href: string };
}): MagazineMail {
  const link = ({ label, href }: { label: string; href: string }) =>
    `<a href="${escapeHtml(href)}" style="color: #111;">${escapeHtml(label)}</a>`;
  const html = `<div style="font-family: 'Geist Sans', ui-sans-serif, system-ui, sans-serif; font-size: 16px; line-height: 1.5; color: #111; background: #fff; max-width: 600px; margin: 0 auto;">
    <h1 style="font-size: 24px;">${escapeHtml(parts.heading)}</h1>
    ${parts.paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n")}
    <p>${link(parts.action)}</p>
    <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
    ${parts.footer.map((p) => `<p style="font-size: 14px; color: #595959;">${escapeHtml(p)}</p>`).join("\n")}
    ${parts.unsubscribe ? `<p style="font-size: 14px;">${link(parts.unsubscribe)}</p>` : ""}
  </div>`;
  const text = [
    parts.heading,
    ...parts.paragraphs,
    `${parts.action.label}: ${parts.action.href}`,
    ...parts.footer,
    ...(parts.unsubscribe
      ? [`${parts.unsubscribe.label}: ${parts.unsubscribe.href}`]
      : []),
  ].join("\n\n");
  return { subject: parts.subject, html, text };
}

export function magazineConfirmUrl(locale: AppLocale, token: string): string {
  return `${CANONICAL_PRODUCTION_ORIGIN}/${locale}${MAGAZINE_SUBSCRIPTION_CONFIRM_PATH}?t=${encodeURIComponent(token)}`;
}

export async function confirmationMail(input: {
  locale: AppLocale;
  magazineName: string;
  confirmUrl: string;
}): Promise<MagazineMail> {
  const t = createTranslator({
    locale: input.locale,
    messages: await loadMessages(input.locale),
    namespace: "magazineMail",
  });
  const values = { magazine: input.magazineName };
  return renderMagazineMail({
    subject: t("confirm.subject", values),
    heading: t("confirm.heading", values),
    paragraphs: [t("confirm.body", values)],
    action: { label: t("confirm.action"), href: input.confirmUrl },
    footer: [t("confirm.expires"), t("confirm.ignore"), t("footer")],
  });
}

export function absoluteIssueUrl(
  locale: AppLocale,
  magazine: { slug: string },
  issue: { slug: string },
): string {
  return `${CANONICAL_PRODUCTION_ORIGIN}/${locale}${issuePath(magazine, issue)}`;
}

export function magazineUnsubscribeUrl(
  locale: AppLocale,
  token: string,
): string {
  return `${CANONICAL_PRODUCTION_ORIGIN}/${locale}/unsubscribe?t=${encodeURIComponent(token)}`;
}

export async function issueMail(input: {
  locale: AppLocale;
  magazineName: string;
  communityName: string;
  issue: { number: number; title: string };
  issueUrl: string;
  unsubscribeUrl: string;
}): Promise<MagazineMail> {
  const t = createTranslator({
    locale: input.locale,
    messages: await loadMessages(input.locale),
    namespace: "magazineMail",
  });
  const values = {
    magazine: input.magazineName,
    community: input.communityName,
    number: input.issue.number,
    title: input.issue.title,
  };
  return renderMagazineMail({
    subject: t("issue.subject", values),
    heading: input.issue.title,
    paragraphs: [t("issue.lead", values)],
    action: { label: t("issue.action"), href: input.issueUrl },
    footer: [t("issue.why", values), t("footer")],
    unsubscribe: { label: t("issue.unsubscribe"), href: input.unsubscribeUrl },
  });
}
