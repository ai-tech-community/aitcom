import { Button } from "@/components/ui/button";
import { JsonLd } from "@/components/json-ld";
import { SectionLabel } from "@/components/ui/section-label";
import {
  PUBLIC_EVENTS_JOIN_HREF,
  publicEventPlace,
  publicEventsJsonLd,
  type PublicEventCard,
} from "@/lib/events/public-events";

export type PublicEventsKey =
  | "kicker"
  | "title"
  | "lead"
  | "joinCta"
  | "empty"
  | "eventPage"
  | "online";

export function PublicEventsPage({
  locale,
  t,
  events,
}: {
  locale: string;
  t: (key: PublicEventsKey) => string;
  events: PublicEventCard[];
}) {
  const copyLocale = locale === "nl" ? "nl" : "en";

  return (
    <main className="mx-auto max-w-3xl px-6 py-16 sm:px-12">
      {events.length > 0 ? <JsonLd data={publicEventsJsonLd(events)} /> : null}

      <SectionLabel as="div">{t("kicker")}</SectionLabel>

      <div className="mt-8 max-w-2xl space-y-3">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {t("title")}
        </h1>
        <p className="text-muted-foreground text-lg leading-relaxed">
          {t("lead")}
        </p>
      </div>

      <div className="mt-8">
        <Button asChild>
          <a href={PUBLIC_EVENTS_JOIN_HREF}>{t("joinCta")}</a>
        </Button>
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
            const external = !event.url.startsWith(
              "https://www.aitcommunity.org/",
            );
            return (
              <li
                key={event.id}
                data-public-event={event.id}
                className="border-border py-6 first:pt-0"
              >
                <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 font-mono text-xs tracking-wider">
                  <time dateTime={event.date}>{event.date}</time>
                  <span aria-hidden="true">·</span>
                  <span>{publicEventPlace(event, t("online"))}</span>
                </div>
                <h2 className="mt-2 text-xl font-semibold tracking-tight">
                  <a
                    href={event.url}
                    className="hover:text-foreground hover:underline"
                    {...(external
                      ? { target: "_blank", rel: "noopener noreferrer" }
                      : {})}
                  >
                    {event.title}
                  </a>
                </h2>
                {why ? (
                  <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                    {why}
                  </p>
                ) : null}
                <p className="mt-3">
                  <a
                    href={event.url}
                    className="text-foreground font-mono text-xs tracking-wider underline-offset-4 hover:underline"
                    {...(external
                      ? { target: "_blank", rel: "noopener noreferrer" }
                      : {})}
                  >
                    {t("eventPage")}
                  </a>
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
