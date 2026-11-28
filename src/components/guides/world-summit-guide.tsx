import type { ReactNode } from "react";

import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { EventHeading } from "@/components/events/detail/event-heading";
import { SectionLabel } from "@/components/ui/section-label";
import { WORLD_SUMMIT_EVENT_MD } from "@/content/guides/world-summit-event";

import { GuideMarkdown } from "./guide-markdown";
import { GuideShell } from "./guide-shell";

export type WorldSummitKey = "kicker" | "title";

export function WorldSummitGuide({
  locale,
  t,
  children,
  backLabel,
}: {
  locale: string;
  t: (key: WorldSummitKey) => string;
  children?: ReactNode;
  backLabel?: string;
}) {
  const markdown =
    locale === "nl" ? WORLD_SUMMIT_EVENT_MD.nl : WORLD_SUMMIT_EVENT_MD.en;

  if (backLabel) {
    return (
      <article className="mx-auto max-w-6xl px-4 py-5 sm:px-8 sm:py-9">
        <Link
          href="/events"
          className="text-muted-foreground hover:text-foreground mb-3 inline-flex min-h-11 items-center gap-2 text-sm font-medium underline-offset-4 hover:underline"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          {backLabel}
        </Link>
        <EventHeading
          title={t("title")}
          labels={
            <SectionLabel as="div" bordered={false}>
              {t("kicker")}
            </SectionLabel>
          }
        />
        <GuideMarkdown className="mt-6 sm:mt-8">{markdown}</GuideMarkdown>
        {children}
      </article>
    );
  }
  return (
    <GuideShell kicker={t("kicker")} title={t("title")}>
      <GuideMarkdown>{markdown}</GuideMarkdown>
      {children}
    </GuideShell>
  );
}
