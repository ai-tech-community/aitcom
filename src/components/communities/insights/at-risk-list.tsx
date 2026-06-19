"use client";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";

export function AtRiskList({ slug }: { slug: string }) {
  const t = useTranslations("communities.insights");
  const tRoles = useTranslations("communities.roles");
  const { data, isLoading, isError, refetch } =
    api.insights.atRiskMembers.useQuery({ slug });
  return (
    <div className="rounded-lg border">
      <div className="border-b p-4">
        <h3 className="text-sm font-semibold">{t("atRiskTitle")}</h3>
        <p className="text-muted-foreground text-xs">{t("atRiskSubtitle")}</p>
      </div>
      {isLoading ? (
        <div
          role="status"
          aria-label={t("loading")}
          className="h-24 animate-pulse"
        />
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : !data || data.length === 0 ? (
        <EmptyState title={t("atRiskEmpty")} />
      ) : (
        <div className="divide-y">
          {data.map((m) => (
            <div
              key={m.userId}
              className="flex items-center justify-between gap-3 p-4"
            >
              <div className="flex items-center gap-3">
                <Avatar>
                  {m.image ? (
                    <AvatarImage src={m.image} alt={m.displayName ?? ""} />
                  ) : null}
                  <AvatarFallback>
                    {(m.displayName ?? "?")[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">
                    {m.displayName ?? "Member"}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {t("atRiskPrior", { count: m.priorContributions })}
                  </p>
                </div>
              </div>
              <Badge variant="secondary" className="text-xs">
                {tRoles(m.role)}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
