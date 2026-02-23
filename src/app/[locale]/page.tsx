import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ArrowUpRight } from "lucide-react";
import { AsciiLandscape } from "@/components/ascii-landscape";
import { getPayloadClient } from "@/server/payload";

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
      <span className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
        {children}
      </span>
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

  const features = [
    {
      fig: 1,
      title: t("features.workshops.title"),
      desc: t("features.workshops.description"),
    },
    {
      fig: 2,
      title: t("features.knowledge.title"),
      desc: t("features.knowledge.description"),
    },
    {
      fig: 3,
      title: t("features.community.title"),
      desc: t("features.community.description"),
    },
  ];

  return (
    <>
      {/* Hero with ASCII Landscape */}
      <section className="relative min-h-[70vh] overflow-hidden">
        <AsciiLandscape />
        <div className="relative z-10 px-4 pt-8 pb-6 sm:px-12 sm:pt-16 sm:pb-12">
          <GridMarkers />
          <div className="mt-4 space-y-0 sm:mt-8">
            <h1 className="text-[32px] leading-[0.95] font-light tracking-tighter sm:text-8xl lg:text-[96px]">
              {t("hero.title").split(" ").slice(0, 2).join(" ") === "AI Tech"
                ? "Welcome to"
                : t("hero.title").split(" ")[0]}
            </h1>
            <h1 className="text-[32px] leading-[0.95] font-extrabold tracking-tighter sm:text-8xl lg:text-[96px]">
              {t("hero.title")}
            </h1>
          </div>
          <p className="text-muted-foreground mt-4 max-w-175 text-sm leading-relaxed sm:mt-8 sm:text-xl">
            {t("hero.description")}
          </p>
          <GridMarkers />
        </div>
      </section>

      {/* Stats Ticker */}
      <div className="border-border grid grid-cols-2 gap-y-1 border-y px-4 py-3 sm:flex sm:items-center sm:gap-y-0 sm:overflow-x-auto sm:px-0 sm:py-2.5">
        <StatItem label="MEMBERS" value="500+" />
        <StatItem label="EVENTS" value="50+" />
        <StatItem label="WORKSHOPS" value="30+" />
        <StatItem label="HACKATHONS" value="12+" />
        <span className="col-span-2 sm:col-span-1">
          <StatItem label="COMPANIES" value="75+" />
        </span>
      </div>

      {/* Featured Section */}
      <section className="px-6 py-12 sm:px-12">
        <SectionLabel>/ {t("features.title").toUpperCase()}</SectionLabel>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feat) => (
            <div
              key={feat.fig}
              className="group border-border hover:border-foreground/30 overflow-hidden rounded-lg border border-dashed transition-colors"
            >
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-muted-foreground font-mono text-[10px] font-medium tracking-wider">
                  [ FIG. {feat.fig} ]
                </span>
                <ArrowUpRight className="text-muted-foreground group-hover:text-foreground h-3.5 w-3.5 transition-colors" />
              </div>
              <div className="bg-secondary h-48" />
              <div className="space-y-2 p-4 pb-5">
                <h3 className="text-lg font-bold">{feat.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {feat.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
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

      {/* CTA Cards */}
      <section className="px-6 py-12 sm:px-12">
        <div className="grid gap-6 sm:grid-cols-3">
          {[
            {
              title: t("join.attend.title"),
              desc: t("join.attend.description"),
            },
            { title: t("join.speak.title"), desc: t("join.speak.description") },
            {
              title: t("join.partner.title"),
              desc: t("join.partner.description"),
            },
          ].map((cta) => (
            <Link
              key={cta.title}
              href="/auth/signup"
              className="group border-border hover:border-foreground/30 flex h-44 flex-col items-center justify-center gap-2 rounded-xl border transition-colors"
            >
              <span className="group-hover:text-primary text-xl font-semibold">
                {cta.title}
              </span>
              <ArrowUpRight className="text-muted-foreground group-hover:text-primary h-5 w-5 transition-colors" />
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
