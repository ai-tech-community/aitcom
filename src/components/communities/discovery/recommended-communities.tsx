"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { Skeleton } from "@/components/ui/skeleton";

export function RecommendedCommunities() {
  const t = useTranslations("discovery");
  const { data: session } = authClient.useSession();
  const isAuthenticated = !!session?.user;

  // Personalized recommendations are a protectedProcedure — don't even fire it
  // for guests (it 401s and retries). The whole widget is member-only.
  const { data, isLoading, isError } = api.discovery.recommendedForMe.useQuery(
    { limit: 6 },
    { enabled: isAuthenticated },
  );
  if (!isAuthenticated) return null;
  if (isError) return null; // supplementary widget — may stay absent on error (No-Silent-Failure)
  if (isLoading) {
    return (
      <section className="mb-8">
        <Skeleton className="mb-3 h-6 w-48" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      </section>
    );
  }
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
