"use client";

import { Zap } from "lucide-react";
import { useFormatter, useNow, useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { api } from "@/trpc/react";

const LINE = "flex min-h-8 items-center gap-2 text-sm";

/**
 * One line for the live XP boost campaign (members.getActiveBoost). It is the
 * panel's single Signal Orange element (One Voice Rule): the orange sits on
 * the non-text bolt, the text stays ink for contrast. Supplementary: renders
 * nothing unless a boost is live, and nothing if the lookup fails.
 */
export function BoostLine() {
  const t = useTranslations("dashboard.you");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const { data: boost } = api.members.getActiveBoost.useQuery();

  if (!boost) return null;

  const endsAt = boost.endsAt ? new Date(boost.endsAt) : null;
  const label = t("boost", {
    multiplier: Number(boost.multiplier),
    name: boost.name,
  });

  const content = (
    <>
      <Zap aria-hidden className="text-primary size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
      {endsAt && endsAt > now && (
        <span className="text-muted-foreground shrink-0 font-mono text-xs">
          {t("boostEnds", { relative: format.relativeTime(endsAt, now) })}
        </span>
      )}
    </>
  );

  if (!boost.ctaLink) return <p className={LINE}>{content}</p>;
  return (
    <a
      href={boost.ctaLink}
      title={boost.description ?? undefined}
      className={cn(
        LINE,
        "hover:bg-secondary/50 focus-visible:ring-ring/50 -mx-1 rounded-md px-1 transition-colors outline-none focus-visible:ring-[3px]",
      )}
    >
      {content}
    </a>
  );
}
