"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";

export function StorylineLoadError() {
  const t = useTranslations("newsStories");
  const router = useRouter();
  return (
    <ErrorState
      title={t("unavailable")}
      description={t("loadFailed")}
      onRetry={() => router.refresh()}
      retryLabel={t("retry")}
    />
  );
}

export function StorylineEmpty({ searching = false }: { searching?: boolean }) {
  const t = useTranslations("newsStories");
  return (
    <EmptyState
      title={t(searching ? "noMatches" : "empty")}
      action={
        <Link href="/news" className="text-sm underline underline-offset-4">
          {t("archive")}
        </Link>
      }
    />
  );
}

export function StorylineLoading() {
  const t = useTranslations("newsStories");
  return (
    <div role="status" className="mt-4 space-y-3">
      <span className="sr-only">{t("loading")}</span>
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-20 w-full" />
    </div>
  );
}
