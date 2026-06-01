"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { api } from "@/trpc/react";

export function RecommendedCommunities() {
  const t = useTranslations("discovery");
  const { data } = api.discovery.recommendedForMe.useQuery({ limit: 6 });
  if (!data || data.length === 0) return null;

  return (
    <section className="mb-8">
      <h2 className="mb-3 text-lg font-semibold">{t("recommendedTitle")}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.map((c) => (
          <Link
            key={c.communityId}
            href={`/communities/${c.slug}`}
            className="hover:border-foreground/30 rounded-lg border p-4 transition"
          >
            <div className="font-medium">{c.name}</div>
            {c.description ? (
              <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">
                {c.description}
              </p>
            ) : null}
            <p className="text-muted-foreground mt-2 text-xs">
              {t("memberCount", { count: c.memberCount })}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
