import { escapeHtml } from "@/server/email-template";

export type HubMailLocale = "en" | "nl";

export function hubDmMailCopy(locale: HubMailLocale) {
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
  return value === "en" || value === "nl";
}

export function localeFromCookieHeader(
  cookie: string | null | undefined,
): HubMailLocale {
  if (cookie && /(?:^|;\s*)NEXT_LOCALE=nl(?:;|$)/.test(cookie)) return "nl";
  return "en";
}
