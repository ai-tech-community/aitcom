import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ArrowUpRight } from "lucide-react";
import { AsciiLandscape } from "@/components/ascii-landscape";
import { FeatureModals } from "@/components/feature-modals";
import { HeroTitle } from "@/components/hero-title";
import { getPayloadClient } from "@/server/payload";
import { db } from "@/server/db";
import { user } from "@/server/db/schema";
import { count } from "drizzle-orm";
import Image from "next/image";
import type { Metadata } from "next";
import { buildAlternates, buildOgMeta } from "@/lib/metadata";
import { JsonLd } from "@/components/json-ld";

const typeLabels: Record<string, string> = {
  workshop: "WORKSHOP",
  hackathon: "HACKATHON",
  deep_dive: "DEEP-DIVE",
  meetup: "MEETUP",
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${String(d.getDate()).padStart(2, "0")}`;
}

function GridMarkers() {
  return (
    <div className="flex w-full justify-between">
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className="text-border font-mono text-sm select-none">
          +
        </span>
      ))}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-border border-b pb-4">
      <h2 className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
        {children}
      </h2>
    </div>
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1 sm:gap-2 sm:px-6 sm:py-0">
      <span className="text-muted-foreground font-mono text-[10px] tracking-wider sm:text-[11px]">
        {label}:
      </span>
      <span className="text-primary font-mono text-[10px] font-bold tracking-wider sm:text-[11px]">
        {value}
      </span>
    </div>
  );
}

export const metadata: Metadata = {
  ...buildOgMeta(
    "AIT Community — AI Tech Community Netherlands",
    "A community for technical innovators in the Netherlands. We foster collaboration through workshops, deep-dives, and hackathons focused on AI and automation.",
  ),
  alternates: buildAlternates(""),
};

export default async function Home() {
  const locale = await getLocale();
  const t = await getTranslations();

  const payload = await getPayloadClient();
  const { docs: events } = await payload.find({
    collection: "events",
    where: {
      status: { equals: "published" },
      date: { greater_than_equal: new Date().toISOString() },
    },
    sort: "date",
    limit: 5,
    locale: locale as "en" | "nl",
    draft: false,
  });

  const { docs: featuredSponsors } = await payload.find({
    collection: "sponsors",
    where: {
      status: { equals: "active" },
      featured: { equals: true },
    },
    limit: 20,
    depth: 1,
  });

  // Fetch real counts for stats ticker
  const [memberCount, eventCount, sponsorCount] = await Promise.all([
    db.select({ value: count() }).from(user).then((r) => r[0]?.value ?? 0),
    payload.find({ collection: "events", where: { status: { not_equals: "draft" } }, limit: 0 }).then((r) => r.totalDocs),
    payload.find({ collection: "sponsors", where: { status: { equals: "active" } }, limit: 0 }).then((r) => r.totalDocs),
  ]);

  const workshopCount = await payload.find({
    collection: "events",
    where: { type: { in: ["workshop", "deep_dive"] }, status: { not_equals: "draft" } },
    limit: 0,
  }).then((r) => r.totalDocs);

  const hackathonCount = await payload.find({
    collection: "events",
    where: { type: { equals: "hackathon" }, status: { not_equals: "draft" } },
    limit: 0,
  }).then((r) => r.totalDocs);

  return (
    <>
      <JsonLd
        data={{
          "@type": "Organization",
          name: "AIT Community",
          url: "https://aitcommunity.org",
          logo: "https://aitcommunity.org/logo.png",
          description:
            "A community for technical innovators in the Netherlands. Workshops, hackathons, and deep-dives on AI and automation.",
        }}
      />
      {/* Hero with ASCII Landscape */}
      <section className="relative min-h-[70vh] overflow-hidden">
        <AsciiLandscape />
        <div className="relative z-10 px-4 pt-8 pb-6 sm:px-12 sm:pt-16 sm:pb-12">
          <GridMarkers />
          <div className="mt-4 space-y-0 sm:mt-8">
            <HeroTitle
              greeting={
                t("hero.title").split(" ").slice(0, 2).join(" ") === "AI Tech"
                  ? "Welcome to"
                  : t("hero.title").split(" ")[0]!
              }
              title={t("hero.title")}
            />
          </div>
          <p className="text-muted-foreground mt-4 max-w-175 text-sm leading-relaxed sm:mt-8 sm:text-xl">
            {t("hero.description")}
          </p>
          <GridMarkers />
        </div>
      </section>

      {/* Stats Ticker */}
      <div className="border-border grid grid-cols-2 gap-y-1 border-y px-4 py-3 sm:flex sm:items-center sm:gap-y-0 sm:overflow-x-auto sm:px-0 sm:py-2.5">
        <StatItem label="MEMBERS" value={String(memberCount)} />
        <StatItem label="EVENTS" value={String(eventCount)} />
        <StatItem label="WORKSHOPS" value={String(workshopCount)} />
        <StatItem label="HACKATHONS" value={String(hackathonCount)} />
        <span className="col-span-2 sm:col-span-1">
          <StatItem label="SPONSORS" value={String(sponsorCount)} />
        </span>
      </div>

      {/* Featured Section */}
      <section className="px-6 py-12 sm:px-12">
        <SectionLabel>/ {t("features.title").toUpperCase()}</SectionLabel>
        <FeatureModals />
      </section>

      {/* Events Feed */}
      <section className="px-6 py-12 sm:px-12">
        <SectionLabel>/ {t("events.title").toUpperCase()}</SectionLabel>

        {events.length === 0 ? (
          <p className="text-muted-foreground mt-8 text-center font-mono text-xs tracking-wider">
            {t("events.noEvents")}
          </p>
        ) : (
          <>
            {/* Table Header — desktop only */}
            <div className="border-border hidden items-center border-b px-4 py-2.5 sm:flex">
              <span className="text-muted-foreground w-32 font-mono text-[11px] font-medium tracking-wider">
                / DATE
              </span>
              <span className="text-muted-foreground flex-1 font-mono text-[11px] font-medium tracking-wider">
                / NAME
              </span>
              <span className="text-muted-foreground font-mono text-[11px] font-medium tracking-wider">
                / TYPE
              </span>
            </div>

            {/* Event Rows */}
            {events.map((event) => {
              // Highlight the first hackathon, or the first event if none
              const isHackathon = event.type === "hackathon";
              return (
                <Link
                  key={event.id}
                  href={`/events/${event.slug}`}
                  className={`flex flex-col gap-1.5 border-b px-4 py-3.5 transition-colors sm:flex-row sm:items-center sm:gap-0 ${
                    isHackathon
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:bg-secondary/50"
                  }`}
                >
                  {/* Title — first on mobile */}
                  <span className="text-[15px] font-medium leading-snug sm:order-2 sm:flex-1">
                    {event.title}
                  </span>

                  {/* Date + type on mobile */}
                  <div className="flex items-center gap-3 sm:order-1 sm:w-32">
                    <div
                      className={`h-2 w-2 rounded-full ${
                        isHackathon ? "bg-primary-foreground" : "bg-foreground"
                      }`}
                    />
                    <span className="font-mono text-[12px] sm:text-[13px]">
                      {formatDate(event.date)}
                    </span>
                    {/* Type badge — inline on mobile */}
                    <span
                      className={`rounded border px-2 py-0.5 font-mono text-[10px] font-medium tracking-wider sm:hidden ${
                        isHackathon
                          ? "border-primary-foreground"
                          : "border-border text-muted-foreground"
                      }`}
                    >
                      {typeLabels[event.type] ?? event.type}
                    </span>
                  </div>

                  {/* Type badge — desktop only */}
                  <span
                    className={`hidden rounded border px-2.5 py-0.5 font-mono text-[11px] font-medium tracking-wider sm:order-3 sm:inline ${
                      isHackathon
                        ? "border-primary-foreground"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    {typeLabels[event.type] ?? event.type}
                  </span>
                  <span
                    className={`ml-4 hidden font-mono text-lg font-light sm:order-4 sm:inline ${
                      isHackathon
                        ? "text-primary-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    +
                  </span>
                </Link>
              );
            })}

            {/* View All link */}
            <div className="mt-4 text-right">
              <Link
                href="/events"
                className="text-muted-foreground hover:text-foreground font-mono text-xs tracking-wider transition-colors"
              >
                {t("events.viewAll")} →
              </Link>
            </div>
          </>
        )}
      </section>

      {/* Sponsors Strip */}
      {featuredSponsors.length > 0 && (
        <section className="px-6 py-12 sm:px-12">
          <SectionLabel>
            / {t("sponsors.currentSponsors").toUpperCase()}
          </SectionLabel>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-8">
            {featuredSponsors.map((sponsor) => {
              const logo =
                typeof sponsor.logo === "object"
                  ? sponsor.logo
                  : null;
              return logo?.url ? (
                <a
                  key={sponsor.id}
                  href={sponsor.website ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="opacity-60 transition-opacity hover:opacity-100"
                >
                  <Image
                    src={logo.url}
                    alt={sponsor.name}
                    width={120}
                    height={48}
                    className="h-8 w-auto object-contain sm:h-12"
                  />
                </a>
              ) : null;
            })}
          </div>
        </section>
      )}

      {/* CTA Cards */}
      <section className="px-6 py-12 sm:px-12">
        <div className="grid gap-6 sm:grid-cols-3">
          {[
            {
              title: t("join.attend.title"),
              desc: t("join.attend.description"),
              href: "/events" as const,
            },
            {
              title: t("join.speak.title"),
              desc: t("join.speak.description"),
              href: "/community" as const,
            },
            {
              title: t("join.partner.title"),
              desc: t("join.partner.description"),
              href: "/sponsors" as const,
            },
          ].map((cta) => (
            <Link
              key={cta.title}
              href={cta.href}
              className="group border-border hover:border-foreground/30 flex h-44 flex-col items-center justify-center gap-2 rounded-xl border px-6 text-center transition-colors"
            >
              <span className="group-hover:text-primary text-xl font-semibold">
                {cta.title}
              </span>
              <p className="text-muted-foreground text-xs leading-relaxed">
                {cta.desc}
              </p>
              <ArrowUpRight className="text-muted-foreground group-hover:text-primary h-5 w-5 transition-colors" />
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
