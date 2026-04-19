"use client";

import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Settings } from "lucide-react";

export default function MyCommunities() {
  const t = useTranslations("communities.dashboard");
  const tRoles = useTranslations("communities.roles");

  const { data: memberships, isLoading } =
    api.communities.getMyCommunities.useQuery();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner className="size-6" />
      </div>
    );
  }

  const active = memberships?.filter((m) => m.status === "active") ?? [];
  const pending =
    memberships?.filter(
      (m) => m.status === "pending_approval" || m.status === "invited",
    ) ?? [];

  if (!memberships?.length) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="text-muted-foreground text-sm">{t("noCommunities")}</p>
        <Link
          href="/communities"
          className="text-primary hover:text-primary/80 font-mono text-xs tracking-wider underline underline-offset-4"
        >
          {t("exploreCommunities")}
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="border-border border-b pb-4">
        <span className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
          / {t("title").toUpperCase()}
        </span>
      </div>

      {/* Active memberships */}
      {active.length > 0 && (
        <div className="mt-6">
          <h3 className="text-muted-foreground font-mono text-xs font-medium tracking-wider uppercase">
            {t("active")} ({active.length})
          </h3>
          <div className="mt-2">
            {active.map((m) => (
              <Link
                key={m.communityId}
                href={`/communities/${m.slug}` as never}
                className="border-border hover:bg-secondary/50 flex flex-col gap-1.5 border-b px-4 py-3.5 transition-colors sm:flex-row sm:items-center sm:gap-0"
              >
                <span className="text-[15px] leading-snug font-medium sm:flex-1">
                  {m.name}
                </span>

                {m.description ? (
                  <span className="text-muted-foreground line-clamp-1 text-sm sm:flex-1">
                    {m.description}
                  </span>
                ) : null}

                <span className="border-border text-muted-foreground rounded border px-2 py-0.5 font-mono text-[10px] font-medium tracking-wider sm:ml-3">
                  {tRoles(m.role).toUpperCase()}
                </span>

                {(m.role === "owner" || m.role === "admin") && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-1.5 w-fit font-mono text-[10px] tracking-wider sm:mt-0 sm:ml-3"
                    asChild
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Link href={`/communities/${m.slug}/settings` as never}>
                      <Settings className="mr-1 size-3" />
                      {t("manage")}
                    </Link>
                  </Button>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Pending memberships */}
      {pending.length > 0 && (
        <div className="mt-6">
          <h3 className="text-muted-foreground font-mono text-xs font-medium tracking-wider uppercase">
            {t("pending")} ({pending.length})
          </h3>
          <div className="mt-2">
            {pending.map((m) => (
              <div
                key={m.communityId}
                className="border-border flex flex-col gap-1.5 border-b px-4 py-3.5 opacity-75 sm:flex-row sm:items-center sm:gap-0"
              >
                <span className="text-[15px] leading-snug font-medium sm:flex-1">
                  {m.name}
                </span>

                {m.description ? (
                  <span className="text-muted-foreground line-clamp-1 text-sm sm:flex-1">
                    {m.description}
                  </span>
                ) : null}

                <span className="border-border text-muted-foreground rounded border border-dashed px-2 py-0.5 font-mono text-[10px] tracking-wider sm:ml-3">
                  {t("pending").toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
