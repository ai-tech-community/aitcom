"use client";

import { ArrowRight, Zap } from "lucide-react";
import { useFormatter, useNow, useTranslations } from "next-intl";

import { api } from "@/trpc/react";

/**
 * The live XP boost campaign (members.getActiveBoost) in the "You" card: one
 * headline line, the admin's description, and the admin's call to action.
 * Shown to every signed-in member while a boost is live, whatever the state
 * of their profile or streak.
 *
 * Neutral on purpose: the dashboard's one Signal Orange is the active tab
 * (an active state, per the One Voice Rule), so the bolt is ink.
 * Supplementary: renders nothing unless a boost is live, or if the lookup
 * fails.
 */
export function BoostLine() {
  const t = useTranslations("dashboard.you");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const { data: boost } = api.members.getActiveBoost.useQuery();

  if (!boost) return null;

  const endsAt = boost.endsAt ? new Date(boost.endsAt) : null;

  return (
    <div
      data-slot="boost-line"
      className="border-border mt-4 space-y-1 border-t pt-3 text-sm"
    >
      <p className="flex items-center gap-2">
        <Zap aria-hidden className="text-foreground size-4 shrink-0" />
        <span className="min-w-0 flex-1 font-medium">
          {t("boost", {
            multiplier: Number(boost.multiplier),
            name: boost.name,
          })}
        </span>
        {endsAt && endsAt > now && (
          <span className="text-muted-foreground shrink-0 font-mono text-xs">
            {t("boostEnds", { relative: format.relativeTime(endsAt, now) })}
          </span>
        )}
      </p>
      {boost.description && (
        <p className="text-muted-foreground pl-6 text-xs">
          {boost.description}
        </p>
      )}
      {boost.ctaLink && (
        <a
          href={boost.ctaLink}
          className="text-foreground focus-visible:ring-ring/50 group ml-6 inline-flex min-h-8 items-center gap-1 rounded-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-[3px]"
        >
          {boost.ctaText ?? t("boostCta")}
          <ArrowRight
            aria-hidden
            className="size-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
          />
        </a>
      )}
    </div>
  );
}
