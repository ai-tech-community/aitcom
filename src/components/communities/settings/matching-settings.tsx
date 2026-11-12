"use client";

import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ConnectionTypeEditor } from "@/components/communities/matching/type-editor";

export function MatchingSettings({ slug }: { slug: string }) {
  const t = useTranslations("communities.manage");
  const setup = api.communityMatching.setup.useQuery({ slug });

  if (setup.isPending)
    return (
      <div className="space-y-4">
        <Skeleton className="h-12" />
        <Skeleton className="h-40" />
      </div>
    );
  if (setup.isError) return <ErrorState onRetry={setup.refetch} />;
  if (!setup.data.canManage)
    return (
      <p className="text-muted-foreground py-8 text-sm">{t("accessDenied")}</p>
    );

  return <ConnectionTypeEditor slug={slug} types={setup.data.types} />;
}
