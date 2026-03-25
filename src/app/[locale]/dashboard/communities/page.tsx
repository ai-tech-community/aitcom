"use client";

import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
        <p className="text-muted-foreground">{t("noCommunities")}</p>
        <Button asChild>
          <Link href="/communities">{t("exploreCommunities")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h2 className="text-lg font-semibold tracking-tight">{t("title")}</h2>

      {/* Active memberships */}
      {active.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-muted-foreground font-mono text-xs font-medium uppercase tracking-wider">
            {t("active")} ({active.length})
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {active.map((m) => (
              <Card key={m.communityId}>
                <CardContent className="flex items-center justify-between gap-4 p-4">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/communities/${m.slug}` as never}
                      className="font-medium hover:underline"
                    >
                      {m.name}
                    </Link>
                    {m.description ? (
                      <p className="text-muted-foreground mt-0.5 line-clamp-1 text-sm">
                        {m.description}
                      </p>
                    ) : null}
                    <Badge variant="secondary" className="mt-1 text-xs">
                      {tRoles(m.role)}
                    </Badge>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {(m.role === "owner" || m.role === "admin") && (
                      <Button variant="outline" size="sm" asChild>
                        <Link
                          href={
                            `/communities/${m.slug}/settings` as never
                          }
                        >
                          <Settings className="mr-1 size-3.5" />
                          {t("manage")}
                        </Link>
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/communities/${m.slug}` as never}>
                        {t("view")}
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Pending memberships */}
      {pending.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-muted-foreground font-mono text-xs font-medium uppercase tracking-wider">
            {t("pending")} ({pending.length})
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {pending.map((m) => (
              <Card key={m.communityId} className="opacity-75">
                <CardContent className="flex items-center justify-between gap-4 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{m.name}</p>
                    {m.description ? (
                      <p className="text-muted-foreground mt-0.5 line-clamp-1 text-sm">
                        {m.description}
                      </p>
                    ) : null}
                    <Badge variant="outline" className="mt-1 text-xs">
                      {t("pending")}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
