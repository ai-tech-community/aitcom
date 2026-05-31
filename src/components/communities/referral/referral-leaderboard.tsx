"use client";

import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";

export function ReferralLeaderboard() {
  const t = useTranslations("referral");
  const { data, isLoading } = api.referral.leaderboard.useQuery({ limit: 20 });

  return (
    <div className="space-y-4 rounded-lg border p-6">
      <h2 className="text-lg font-semibold">{t("leaderboardTitle")}</h2>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-muted h-10 animate-pulse rounded" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("empty")}</p>
      ) : (
        <ol className="space-y-2">
          {data.map((row, index) => (
            <li
              key={row.userId}
              className="flex items-center justify-between rounded-lg border px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground w-6 text-right text-sm font-medium">
                  #{index + 1}
                </span>
                <span className="text-sm font-medium">
                  {row.name ?? "Member"}
                </span>
              </div>
              <span className="text-muted-foreground text-sm">
                {t("referralCount", { count: row.referralCount })}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
