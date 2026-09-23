import { Fragment } from "react";

import { PromoteJoinCta } from "@/components/join/promote-join-cta";
import { JsonLd } from "@/components/json-ld";
import { SectionLabel } from "@/components/ui/section-label";
import {
  PUBLIC_EVENTS_JOIN_HREF,
  isPublicEventUrl,
  publicEventPlace,
  publicEventsJsonLd,
  toPublicEventDate,
  type PublicEventCard,
} from "@/lib/events/public-events";

export type PublicEventsKey =
  | "kicker"
  | "title"
  | "lead"
  | "memberLead"
  | "joinCta"
  | "hubCta"
  | "empty"
  | "eventPage"
  | "online";

/** Retired from `/en/events` — the public route is the fat CMS listing. */
export function PublicEventsPage({
  locale,
  t,
  events,
  promoteJoin = true,
}: {
  locale: string;
  t: (key: PublicEventsKey) => string;
  events: PublicEventCard[];
  promoteJoin?: boolean;
}) {
  const copyLocale = locale === "nl" ? "nl" : "en";
  const eventJsonLd = publicEventsJsonLd(events);

  return (
    <main className="mx-auto max-w-3xl px-6 py-16 sm:px-12">
      {eventJsonLd.map((data, index) => (
        <JsonLd
          key={`event-jsonld-${typeof data.url === "string" ? data.url : index}`}
          data={data}
        />
      ))}

      <SectionLabel as="div">{t("kicker")}</SectionLabel>

      <div className="mt-8 max-w-2xl space-y-3">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {t("title")}
        </h1>
        <p className="text-muted-foreground text-lg leading-relaxed">
          {promoteJoin ? t("lead") : t("memberLead")}
        </p>
      </div>

      <div className="mt-8">
        <PromoteJoinCta
          promoteJoin={promoteJoin}
          guestHref={PUBLIC_EVENTS_JOIN_HREF}
          guestLabel={t("joinCta")}
          hubLabel={t("hubCta")}
        />
      </div>

      {events.length === 0 ? (
        <p className="text-muted-foreground mt-12 text-sm leading-relaxed">
          {t("empty")}
        </p>
      ) : (
        <ul className="mt-12 divide-y">
          {events.map((event) => {
            const why =
              event.why[copyLocale].length > 0
                ? event.why[copyLocale]
                : event.why.en;
            const date = toPublicEventDate(event.date);
            const place = publicEventPlace(event, t("online"));
            const url = isPublicEventUrl(event.url) ? event.url : null;
            const title = event.title.trim();
            const external = Boolean(
              url && !url.startsWith("https://www.aitcommunity.org/"),
            );
            const linkProps = external
              ? { target: "_blank" as const, rel: "noopener noreferrer" }
              : {};

            return (
              <li
                key={event.id}
                data-public-event={event.id}
                className="border-border py-6 first:pt-0"
              >
                {date || place ? (
                  <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 font-mono text-xs tracking-wider">
                    {[
                      date ? (
                        <time key="date" dateTime={date}>
                          {date}
                        </time>
                      ) : null,
                      place ? <span key="place">{place}</span> : null,
                    ]
                      .filter(Boolean)
                      .map((node, index) => (
                        <Fragment key={index}>
                          {index > 0 ? <span aria-hidden="true">·</span> : null}
                          {node}
                        </Fragment>
                      ))}
                  </div>
                ) : null}
                {title ? (
                  <h2 className="mt-2 text-xl font-semibold tracking-tight">
                    {url ? (
                      <a
                        href={url}
                        className="hover:text-foreground hover:underline"
                        {...linkProps}
                      >
                        {title}
                      </a>
                    ) : (
                      title
                    )}
                  </h2>
                ) : null}
                {why ? (
                  <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                    {why}
                  </p>
                ) : null}
                {url ? (
                  <p className="mt-3">
                    <a
                      href={url}
                      className="text-foreground font-mono text-xs tracking-wider underline-offset-4 hover:underline"
                      {...linkProps}
                    >
                      {t("eventPage")}
                    </a>
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
