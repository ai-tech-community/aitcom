"use client";

import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";

/** Sharing tools only: these links do not publish an external listing. */
export function RegistrationSourceLinks({
  eventId,
  secondary = false,
}: {
  eventId: number;
  secondary?: boolean;
}) {
  const locale = useLocale() === "nl" ? "nl" : "en";
  const t = useTranslations("events.attendeeList");
  const tr = useTranslations("redesign.events");
  const query = api.events.registrationSourceLinks.useQuery({
    eventId,
    locale,
  });
  if (query.isLoading)
    return secondary ? null : (
      <p role="status" className="text-muted-foreground text-sm">
        {t("sourceLinksLoading")}
      </p>
    );
  if (query.isError)
    return secondary ? (
      <section aria-label={t("sourceLinks")} className="space-y-0.5">
        <h3 className="text-sm font-medium">{t("sourceLinks")}</h3>
        <div className="flex flex-wrap items-center gap-x-2 text-xs">
          <p role="status" className="text-muted-foreground">
            {tr("sourceLinksUnavailable")}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs underline underline-offset-4 max-sm:min-h-11"
            onClick={() => void query.refetch()}
          >
            {t("sourceLinksRetry")}
          </Button>
        </div>
      </section>
    ) : (
      <div className="flex flex-wrap items-center gap-2">
        <p role="alert" className="text-sm">
          {t("sourceLinksError")}
        </p>
        <Button variant="outline" onClick={() => void query.refetch()}>
          {t("sourceLinksRetry")}
        </Button>
      </div>
    );
  if (!query.data?.length) return null;
  return (
    <section aria-label={t("sourceLinks")} className="space-y-2">
      <h3 className="text-sm font-medium">{t("sourceLinks")}</h3>
      <p className="text-muted-foreground max-w-prose text-sm">
        {t("sourceLinksHint")}
      </p>
      <div className="flex flex-wrap gap-2">
        {query.data.map(({ source, url }) => (
          <Button
            key={source}
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url);
                toast.success(t("sourceLinkCopied"));
              } catch {
                toast.error(t("sourceLinkCopyError"));
              }
            }}
          >
            {t("sourceLinkCopy", { source: t(`sources.${source}`) })}
          </Button>
        ))}
      </div>
    </section>
  );
}
