"use client";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
export function CollectorAgentAccess() {
  const t = useTranslations("collectors.agentAccess");
  const query = api.collectors.agentAccess.useQuery();
  const utils = api.useUtils();
  const mutation = api.collectors.setAgentAccess.useMutation({
    onSuccess: () => {
      void utils.collectors.agentAccess.invalidate();
    },
  });
  if (!query.data)
    return query.isError ? (
      <p className="text-muted-foreground text-sm" role="alert">
        {t("loadError")}
      </p>
    ) : null;
  return (
    <section
      className="border-border flex flex-col gap-3 border-t pt-5"
      aria-label={t("title")}
    >
      <h3 className="text-base font-medium">{t("title")}</h3>
      <p className="text-muted-foreground text-sm">
        {t("help")}{" "}
        <Link href="/collectors/about" className="underline underline-offset-4">
          {t("rules")}
        </Link>
      </p>
      {query.data.hasKey ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm" role="status">
            {query.data.allowed ? t("enabled") : t("disabled")}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={mutation.isPending}
            onClick={() =>
              mutation.mutate({
                allowed: !query.data.allowed,
                acknowledged: true,
              })
            }
          >
            {query.data.allowed ? t("revoke") : t("allow")}
          </Button>
        </div>
      ) : (
        <Link
          href="/dashboard/agent"
          className="text-sm underline underline-offset-4"
        >
          {t("setup")}
        </Link>
      )}
      {mutation.isError ? (
        <p role="alert" className="text-destructive text-sm">
          {t("error")}
        </p>
      ) : null}
    </section>
  );
}
