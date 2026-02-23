import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ArrowUpRight } from "lucide-react";
import { AsciiLandscape } from "@/components/ascii-landscape";

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
    <div className="flex items-center gap-2 px-6">
      <span className="text-muted-foreground font-mono text-[11px] tracking-wider">
        {label}:
      </span>
      <span className="text-primary font-mono text-[11px] font-bold tracking-wider">
        {value}
      </span>
    </div>
  );
}

export default function Home() {
  const t = useTranslations();

  const eventData = [
    {
      id: "intro-to-rag-pipelines",
      date: "2026.3.08",
      name: "Intro to RAG Pipelines",
      type: "WORKSHOP",
      highlight: false,
    },
    {
      id: "fine-tuning-llms-in-production",
      date: "2026.3.15",
      name: "Fine-tuning LLMs in Production",
      type: "DEEP-DIVE",
      highlight: false,
    },
    {
      id: "ai-agents-hackathon-build-ship",
      date: "2026.3.22",
      name: "AI Agents Hackathon \u2014 Build & Ship",
      type: "HACKATHON",
      highlight: true,
    },
    {
      id: "prompt-engineering-masterclass",
      date: "2026.4.05",
      name: "Prompt Engineering Masterclass",
      type: "WORKSHOP",
      highlight: false,
    },
    {
      id: "mlops-notebook-to-production",
      date: "2026.4.19",
      name: "MLOps: From Notebook to Production",
      type: "DEEP-DIVE",
      highlight: false,
    },
  ];

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
      <section className=" relative min-h-[70vh] overflow-hidden ">
        <AsciiLandscape />
        <div className="relative z-10 px-6 pt-16 pb-12 sm:px-12">
          <GridMarkers />
          <div className="mt-8 space-y-0">
            <h1 className="text-6xl leading-[0.95] font-light tracking-tighter sm:text-8xl lg:text-[96px]">
              {t("hero.title").split(" ").slice(0, 2).join(" ") === "AI Tech"
                ? "Welcome to"
                : t("hero.title").split(" ")[0]}
            </h1>
            <h1 className="text-6xl leading-[0.95] font-extrabold tracking-tighter sm:text-8xl lg:text-[96px]">
              {t("hero.title")}
            </h1>
          </div>
          <p className="text-muted-foreground mt-8 max-w-175 text-lg leading-relaxed sm:text-xl">
            {t("hero.description")}
          </p>
          <GridMarkers />
        </div>
      </section>

      {/* Stats Ticker */}
      <div className="border-border flex items-center overflow-x-auto border-y py-2.5">
        <StatItem label="COMMUNITY MEMBERS" value="500+" />
        <span className="text-border font-mono text-[11px]">|</span>
        <StatItem label="EVENTS HOSTED" value="50+" />
        <span className="text-border font-mono text-[11px]">|</span>
        <StatItem label="WORKSHOPS" value="30+" />
        <span className="text-border font-mono text-[11px]">|</span>
        <StatItem label="HACKATHONS" value="12+" />
        <span className="text-border font-mono text-[11px]">|</span>
        <StatItem label="COMPANIES" value="75+" />
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

        {/* Table Header */}
        <div className="border-border flex items-center border-b px-4 py-2.5">
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
        {eventData.map((event) => (
          <div
            key={event.id}
            className={`flex items-center border-b px-4 py-3.5 transition-colors ${
              event.highlight
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border hover:bg-secondary/50"
            }`}
          >
            <div className="flex w-32 items-center gap-3">
              <div
                className={`h-2 w-2 rounded-full ${
                  event.highlight ? "bg-primary-foreground" : "bg-foreground"
                }`}
              />
              <span className="font-mono text-[13px]">{event.date}</span>
            </div>
            <span className="flex-1 font-medium">{event.name}</span>
            <span
              className={`rounded border px-2.5 py-0.5 font-mono text-[11px] font-medium tracking-wider ${
                event.highlight
                  ? "border-primary-foreground"
                  : "border-border text-muted-foreground"
              }`}
            >
              {event.type}
            </span>
            <span
              className={`ml-4 font-mono text-lg font-light ${
                event.highlight
                  ? "text-primary-foreground"
                  : "text-muted-foreground"
              }`}
            >
              +
            </span>
          </div>
        ))}
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
