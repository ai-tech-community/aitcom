"use client";

import { useTranslations } from "next-intl";

import { api } from "@/trpc/react";
import { PointsBoost } from "@/components/gamification/points-boost";

/**
 * Banner for the currently-active XP boost campaign (members.getActiveBoost).
 * Supplementary: renders nothing unless a boost is live, so it's invisible the
 * rest of the time.
 */
export function BoostWidget() {
  const t = useTranslations("points");
  const { data } = api.members.getActiveBoost.useQuery();

  if (!data) return null;

  return (
    <PointsBoost
      boost={{
        name: data.name,
        status: "active",
        multiplier: Number(data.multiplier),
        description: data.description ?? undefined,
        endDate: data.endsAt ?? undefined,
      }}
      cta={{
        text: data.ctaText ?? t("boostCta"),
        link: data.ctaLink ?? "#",
      }}
    />
  );
}
