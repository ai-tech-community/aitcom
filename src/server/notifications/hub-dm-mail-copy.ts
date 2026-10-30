import { escapeHtml } from "@/server/email-template";
import { resolveLocale, type AppLocale } from "@/i18n/messages";
import { routing } from "@/i18n/routing";

export type HubMailLocale = AppLocale;

export function hubDmMailCopy(locale: HubMailLocale) {
  if (locale === "fr") {
    return {
      subject: "Vous avez un message dans la communauté",
      body: "Vous avez un message dans la communauté.",
      cta: "Ouvrir le Hub",
    };
  }
  if (locale === "nl") {
    return {
      subject: "Je hebt een bericht in de community",
      body: "Je hebt een bericht in de community.",
      cta: "Open Hub",
    };
  }
  return {
    subject: "You have a message in the community",
    body: "You have a message in the community.",
    cta: "Open Hub",
  };
}

/** Link-only ping. Never interpolates DM / invite / forum body. */
export function renderHubDmPingHtml(
  locale: HubMailLocale,
  hubUrl: string,
): string {
  const copy = hubDmMailCopy(locale);
  return `
      <div style="font-family: monospace; max-width: 600px; margin: 0 auto;">
        <p>${escapeHtml(copy.body)}</p>
        <p style="margin-top: 24px;">
          <a href="${escapeHtml(hubUrl)}" style="color: #000; font-weight: bold;">
            ${escapeHtml(copy.cta)} →
          </a>
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="font-size: 12px; color: #999;">AIT Community</p>
      </div>
    `;
}

export function isHubMailLocale(
  value: string | null | undefined,
): value is HubMailLocale {
  return routing.locales.some((locale) => locale === value);
}

export function localeFromCookieHeader(
  cookie: string | null | undefined,
): HubMailLocale {
  const value = /(?:^|;\s*)NEXT_LOCALE=([^;]*)/.exec(cookie ?? "")?.[1];
  return resolveLocale(value);
}
