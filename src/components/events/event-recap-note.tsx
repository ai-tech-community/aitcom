import {
  AI_ENGINEER_NEW_YORK_OFFICIAL_URL,
  aiEngineerNewYorkRecap,
} from "@/lib/events/seo-event-pages";

export function EventRecapNote({
  slug,
  locale,
}: {
  slug: string;
  locale: string;
}) {
  const recap = aiEngineerNewYorkRecap(slug, locale);
  if (!recap) return null;
  const lead =
    locale === "nl"
      ? "Toekomstige edities staan op de"
      : "Future editions are on the";
  const label = locale === "nl" ? "officiële site" : "official site";
  return (
    <p className="text-foreground/90 text-lg leading-relaxed">
      {recap.body} {lead}{" "}
      <a
        href={AI_ENGINEER_NEW_YORK_OFFICIAL_URL}
        target="_blank"
        rel="noreferrer"
        className="underline underline-offset-4"
      >
        {label}
      </a>
      .
    </p>
  );
}
