import { resolveLocale, type AppLocale } from "@/i18n/messages";
import { getLocale, getTranslations } from "next-intl/server";

import { SectionLabel } from "@/components/ui/section-label";
import { GUIDE_PATHS, JOIN_PATH } from "@/lib/seo-guides";

/** Locale-prefixed guides and join. The HTML href is what a crawler reads. */
function eventHubHrefs(locale: AppLocale) {
  return [JOIN_PATH, ...Object.values(GUIDE_PATHS)].map(
    (path) => `/${locale}${path}`,
  );
}
export const EVENT_HUB_HREFS = {
  en: eventHubHrefs("en"),
  nl: eventHubHrefs("nl"),
  fr: eventHubHrefs("fr"),
};

/**
 * Server-rendered links from events to the three guides and join.
 * Plain anchors so the locale prefix is in the HTML for both EN and NL.
 */
export async function EventHubLinks() {
  const locale = await getLocale();
  const hubLocale = resolveLocale(locale);
  const t = await getTranslations("events");
  const doors = await getTranslations("hubDoors");
  const hrefs = EVENT_HUB_HREFS[hubLocale];
  const links = [
    {
      href: hrefs[0],
      label: doors("joinLabel"),
      desc: doors("joinDesc"),
    },
    {
      href: hrefs[1],
      label: doors("registerLabel"),
      desc: doors("registerDesc"),
    },
    {
      href: hrefs[2],
      label: doors("registryLabel"),
      desc: doors("registryDesc"),
    },
    {
      href: hrefs[3],
      label: doors("agentReadyLabel"),
      desc: doors("agentReadyDesc"),
    },
  ] as const;

  return (
    <section aria-labelledby="event-hub-links-title" className="mt-10">
      <SectionLabel id="event-hub-links-title">
        {t("hubLinksKicker")}
      </SectionLabel>
      <p className="text-muted-foreground mt-3 max-w-2xl text-sm leading-relaxed">
        {t("hubLinksLead")}
      </p>
      <ul className="mt-4">
        {links.map((link) => (
          <li key={link.href} className="border-border border-b py-3.5">
            <a
              href={link.href}
              className="focus-visible:ring-ring text-base leading-snug font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
            >
              {link.label}
            </a>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              {link.desc}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
