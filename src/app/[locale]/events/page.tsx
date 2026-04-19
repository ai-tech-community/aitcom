import type { Metadata } from "next";
import type { Where } from "payload";
import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { getPayloadClient } from "@/server/payload";
import { Link } from "@/i18n/navigation";
import { buildAlternates, buildOgMeta } from "@/lib/metadata";
import {
  EVENT_FORMAT_LABELS,
  EVENT_FORMAT_OPTIONS,
  EVENT_FOCUS_OPTIONS,
  EVENT_TYPE_LABELS,
  EVENT_TYPES,
  type EventFocus,
  type EventFormat,
  type EventType,
} from "@/lib/event-metadata";
import { EventsFilterBar } from "@/components/events-filter-bar";

export const metadata: Metadata = {
  title: "Events",
  description:
    "Upcoming workshops, hackathons, deep-dives, and meetups from the AI Tech Community.",
  ...buildOgMeta(
    "Events",
    "Upcoming workshops, hackathons, deep-dives, and meetups from the AI Tech Community.",
    "Events",
  ),
  alternates: buildAlternates("/events"),
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${String(d.getDate()).padStart(2, "0")}`;
}

function getImageUrl(event: { coverImage?: unknown; image?: unknown }) {
  const media = event.coverImage ?? event.image;
  if (
    media &&
    typeof media === "object" &&
    "url" in media &&
    typeof media.url === "string"
  ) {
    return media.url;
  }
  return null;
}

function oneOf<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
): T | undefined {
  return value && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

type SP = Record<string, string | string[] | undefined>;

function firstParam(sp: SP, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const locale = await getLocale();
  const t = await getTranslations("events");
  const sp = await searchParams;

  const isPast = firstParam(sp, "past") === "1";
  const q = firstParam(sp, "q")?.trim();
  const type = oneOf<EventType>(firstParam(sp, "type"), EVENT_TYPES);
  const focus = oneOf<EventFocus>(firstParam(sp, "focus"), EVENT_FOCUS_OPTIONS);
  const format = oneOf<EventFormat>(
    firstParam(sp, "format"),
    EVENT_FORMAT_OPTIONS,
  );
  const fitRaw = Number(firstParam(sp, "fit"));
  const fit = Number.isFinite(fitRaw) && fitRaw >= 1 && fitRaw <= 10 ? fitRaw : undefined;

  const sortRaw = firstParam(sp, "sort");
  const sort: "date" | "fit" | "newest" =
    sortRaw === "fit" || sortRaw === "newest" ? sortRaw : "date";

  const pageRaw = Number(firstParam(sp, "page"));
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
  const perPage = 12;

  const now = new Date().toISOString();
  const conditions: Where[] = [{ status: { equals: "published" } }];
  conditions.push(
    isPast ? { date: { less_than: now } } : { date: { greater_than_equal: now } },
  );
  if (type) conditions.push({ type: { equals: type } });
  if (focus) conditions.push({ focus: { equals: focus } });
  if (format) conditions.push({ format: { equals: format } });
  if (fit) conditions.push({ aitFitScore: { greater_than_equal: fit } });
  if (q && q.length > 0) {
    conditions.push({
      or: [
        { title: { like: q } },
        { summary: { like: q } },
        { location: { like: q } },
      ],
    });
  }

  const sortParam =
    sort === "fit"
      ? "-aitFitScore"
      : sort === "newest"
        ? "-createdAt"
        : isPast
          ? "-date"
          : "date";

  const payload = await getPayloadClient();
  const { docs: events, totalPages, page: currentPage } = await payload.find({
    collection: "events",
    where: { and: conditions },
    sort: sortParam,
    locale: locale as "en" | "nl",
    draft: false,
    depth: 1,
    limit: perPage,
    page,
  });

  const hasFilters =
    !!q || !!type || !!focus || !!format || fit !== undefined;

  const baseParams = () => {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (type) next.set("type", type);
    if (focus) next.set("focus", focus);
    if (format) next.set("format", format);
    if (fit) next.set("fit", String(fit));
    if (sort !== "date") next.set("sort", sort);
    return next;
  };

  const buildTabHref = (past: boolean) => {
    const next = baseParams();
    if (past) next.set("past", "1");
    const qs = next.toString();
    return qs ? `/events?${qs}` : "/events";
  };

  const buildPageHref = (targetPage: number) => {
    const next = baseParams();
    if (isPast) next.set("past", "1");
    if (targetPage > 1) next.set("page", String(targetPage));
    const qs = next.toString();
    return qs ? `/events?${qs}` : "/events";
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-16 sm:px-12">
      <div className="border-border border-b pb-4">
        <h1 className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
          / {t("title").toUpperCase()}
        </h1>
      </div>

      <div className="mt-6 flex gap-1 font-mono text-xs tracking-wider">
        <Link
          href={buildTabHref(false)}
          className={`rounded border px-4 py-2 transition-colors ${
            !isPast
              ? "border-foreground bg-foreground text-background"
              : "border-border text-muted-foreground hover:bg-secondary/40"
          }`}
        >
          UPCOMING
        </Link>
        <Link
          href={buildTabHref(true)}
          className={`rounded border px-4 py-2 transition-colors ${
            isPast
              ? "border-foreground bg-foreground text-background"
              : "border-border text-muted-foreground hover:bg-secondary/40"
          }`}
        >
          PAST
        </Link>
      </div>

      <EventsFilterBar />

      {events.length === 0 ? (
        <p className="text-muted-foreground mt-12 text-center">
          {hasFilters
            ? "No events match these filters."
            : isPast
              ? "No past events yet."
              : t("noEvents")}
        </p>
      ) : (
        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          {events.map((event) => {
            const imageUrl = getImageUrl(event);
            const summary =
              typeof event.summary === "string" ? event.summary : "";
            return (
              <Link
                key={event.id}
                href={`/events/${event.slug}`}
                className="group border-border hover:bg-secondary/40 overflow-hidden rounded-xl border transition-colors"
              >
                {imageUrl && (
                  <div className="border-border overflow-hidden border-b">
                    <Image
                      src={imageUrl}
                      alt={event.title}
                      width={800}
                      height={450}
                      className="h-52 w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                    />
                  </div>
                )}
                <div className="space-y-4 p-5">
                  <div className="text-muted-foreground flex flex-wrap items-center gap-2 font-mono text-[11px] tracking-wider">
                    <span>{formatDate(event.date)}</span>
                    <span>•</span>
                    <span>{EVENT_TYPE_LABELS[event.type] ?? event.type}</span>
                    {event.format && (
                      <>
                        <span>•</span>
                        <span>
                          {EVENT_FORMAT_LABELS[event.format] ?? event.format}
                        </span>
                      </>
                    )}
                  </div>
                  <div>
                    <h2 className="text-xl leading-tight font-semibold">
                      {event.title}
                    </h2>
                    <p className="text-muted-foreground mt-2 text-sm">
                      {event.location}
                    </p>
                  </div>
                  {summary && (
                    <p className="text-foreground/80 line-clamp-3 text-sm leading-relaxed">
                      {summary}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    {event.focus && (
                      <span className="border-border text-muted-foreground rounded-full border px-2.5 py-1 text-[11px]">
                        {String(event.focus)}
                      </span>
                    )}
                    {typeof event.aitFitScore === "number" && (
                      <span className="bg-foreground text-background rounded-full px-2.5 py-1 text-[11px]">
                        AIT {event.aitFitScore}/10
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage ?? page}
          totalPages={totalPages}
          buildHref={buildPageHref}
        />
      )}
    </div>
  );
}

function Pagination({
  currentPage,
  totalPages,
  buildHref,
}: {
  currentPage: number;
  totalPages: number;
  buildHref: (p: number) => string;
}) {
  const pages: (number | "gap")[] = [];
  const push = (v: number | "gap") => {
    if (pages[pages.length - 1] !== v) pages.push(v);
  };
  for (let i = 1; i <= totalPages; i++) {
    if (
      i === 1 ||
      i === totalPages ||
      (i >= currentPage - 1 && i <= currentPage + 1)
    ) {
      push(i);
    } else {
      push("gap");
    }
  }

  const linkBase =
    "font-mono text-[11px] tracking-wider rounded border px-3 py-1.5 transition-colors";
  const inactive = "border-border text-muted-foreground hover:bg-secondary/40";
  const active = "border-foreground bg-foreground text-background";
  const disabled =
    "border-border text-muted-foreground/40 pointer-events-none cursor-default";

  return (
    <nav className="mt-10 flex flex-wrap items-center justify-center gap-1.5">
      {currentPage > 1 ? (
        <Link
          href={buildHref(currentPage - 1)}
          className={`${linkBase} ${inactive}`}
        >
          ← PREV
        </Link>
      ) : (
        <span className={`${linkBase} ${disabled}`}>← PREV</span>
      )}

      {pages.map((p, idx) =>
        p === "gap" ? (
          <span
            key={`gap-${idx}`}
            className="text-muted-foreground font-mono text-[11px] tracking-wider"
          >
            …
          </span>
        ) : (
          <Link
            key={p}
            href={buildHref(p)}
            className={`${linkBase} ${p === currentPage ? active : inactive}`}
          >
            {p}
          </Link>
        ),
      )}

      {currentPage < totalPages ? (
        <Link
          href={buildHref(currentPage + 1)}
          className={`${linkBase} ${inactive}`}
        >
          NEXT →
        </Link>
      ) : (
        <span className={`${linkBase} ${disabled}`}>NEXT →</span>
      )}
    </nav>
  );
}
