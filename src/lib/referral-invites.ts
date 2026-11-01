import { z } from "zod";

export const REFERRAL_BATCH_LIMIT = 10;
export const REFERRAL_DAILY_LIMIT = 50;
export const REFERRAL_RETENTION_DAYS = 14;
export const REFERRAL_REMINDER_DAYS = 4;
export const referralLocales = ["en", "nl", "fr"] as const;
export type ReferralLocale = (typeof referralLocales)[number];
export const referralSenderFallback: Record<ReferralLocale, string> = {
  en: "An AIT member",
  nl: "Een AIT-lid",
  fr: "Un membre AIT",
};

export function parseReferralEmails(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[\s,;]+/)
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}
export function validReferralEmail(email: string): boolean {
  return email.length <= 255 && z.email().safeParse(email).success;
}
export const referralBatchInput = z.object({
  slug: z.string().min(1).default("ait"),
  requestId: z.uuid(),
  emails: z
    .array(z.string().trim().toLowerCase().pipe(z.email().max(255)))
    .min(1)
    .max(REFERRAL_BATCH_LIMIT),
  locale: z.enum(referralLocales).default("en"),
});

export const referralMailCopy = {
  en: {
    subject: (name: string, community: string) =>
      `${name} invited you to ${community}`,
    reminder: (name: string, community: string) =>
      `Your invitation from ${name} to ${community}`,
    heading: "A familiar face. A new community.",
    hello: "Hi there,",
    body: (name: string) =>
      `${name} thinks you’d feel at home here. AIT brings together people who are curious about AI and enjoy building things together.`,
    personal:
      "Come meet people, exchange ideas, and find something to build together.",
    accept: "Accept invitation",
    signoff: "See you in the community,",
    footer: (name: string) =>
      `You received this invitation because ${name} entered your email address.`,
    unsubscribe: "Stop receiving invitations",
    reminderBody:
      "Your invitation is still open. This is the only reminder we’ll send.",
  },
  nl: {
    subject: (name: string, community: string) =>
      `${name} heeft je uitgenodigd voor ${community}`,
    reminder: (name: string, community: string) =>
      `Je uitnodiging van ${name} voor ${community}`,
    heading: "Een bekend gezicht. Een nieuwe community.",
    hello: "Hoi,",
    body: (name: string) =>
      `${name} denkt dat je je hier thuis zult voelen. AIT brengt mensen samen die nieuwsgierig zijn naar AI en graag samen dingen bouwen.`,
    personal:
      "Ontmoet mensen, wissel ideeën uit en vind iets om samen te bouwen.",
    accept: "Uitnodiging accepteren",
    signoff: "Tot in de community,",
    footer: (name: string) =>
      `Je ontvangt deze uitnodiging omdat ${name} je e-mailadres heeft ingevuld.`,
    unsubscribe: "Geen uitnodigingen meer ontvangen",
    reminderBody:
      "Je uitnodiging staat nog open. Dit is de enige herinnering die we sturen.",
  },
  fr: {
    subject: (name: string, community: string) =>
      `${name} vous invite à rejoindre ${community}`,
    reminder: (name: string, community: string) =>
      `Votre invitation de ${name} à rejoindre ${community}`,
    heading: "Un visage familier. Une nouvelle communauté.",
    hello: "Bonjour,",
    body: (name: string) =>
      `${name} pense que vous vous sentirez bien ici. AIT réunit des personnes curieuses de l’IA qui aiment créer ensemble.`,
    personal:
      "Rencontrez des personnes, échangez des idées et trouvez un projet à construire ensemble.",
    accept: "Accepter l’invitation",
    signoff: "À bientôt dans la communauté,",
    footer: (name: string) =>
      `Vous recevez cette invitation car ${name} a renseigné votre adresse e-mail.`,
    unsubscribe: "Ne plus recevoir d’invitations",
    reminderBody:
      "Votre invitation est toujours ouverte. Ceci est notre seul rappel.",
  },
};

/** Ref and campaign values are attribution, never authorization. */
export function referralInvitePath(
  locale: string,
  code: string,
  deliveryId?: string,
  reminder = false,
): string {
  const query = new URLSearchParams({
    ref: code,
    utm_source: "member",
    utm_medium: "email",
    utm_campaign: reminder ? "friend-invite-reminder" : "friend-invite",
  });
  if (deliveryId) query.set("delivery", deliveryId);
  return `/${locale}/invite/${encodeURIComponent(code)}?${query}`;
}

export function inviteAttributionSearch(
  query: Record<string, string | string[] | undefined>,
): string {
  const params = new URLSearchParams();
  for (const key of [
    "delivery",
    "ref",
    "utm_source",
    "utm_medium",
    "utm_campaign",
  ]) {
    const value = query[key];
    if (typeof value === "string" && value.length <= 255)
      params.set(key, value);
  }
  return params.size ? `?${params}` : "";
}
