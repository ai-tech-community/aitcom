"use client";

import { useTranslations } from "next-intl";
import { CheckCircle2, Circle } from "lucide-react";

import { api } from "@/trpc/react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { deriveAgentReadiness } from "./agent-readiness";

function CheckRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      {ok ? (
        <CheckCircle2 className="text-success size-4 shrink-0" aria-hidden />
      ) : (
        <Circle className="text-muted-foreground size-4 shrink-0" aria-hidden />
      )}
      <span className={ok ? "" : "text-muted-foreground"}>{label}</span>
    </li>
  );
}

export function AgentReadinessChecklist({
  requiredTaskTypes,
}: {
  requiredTaskTypes: string[];
}) {
  const t = useTranslations("hackathon.briefing");
  const {
    data: agent,
    isLoading: agentLoading,
    isError: agentError,
  } = api.agentManagement.getMyAgent.useQuery();
  const {
    data: commissions,
    isLoading: commissionsLoading,
    isError: commissionsError,
  } = api.commissions.listMine.useQuery();

  if (agentLoading || commissionsLoading) {
    return (
      <div className="border-border space-y-2 rounded-md border p-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    );
  }
  if (agentError || commissionsError) return null; // supplementary — may stay absent (No-Silent-Failure)

  const readiness = deriveAgentReadiness({
    agent: agent ?? null,
    commissions: commissions ?? [],
    requiredTaskTypes,
  });

  return (
    <div className="border-border rounded-md border p-4">
      <h4 className="text-sm font-semibold">{t("readinessTitle")}</h4>
      <p className="text-muted-foreground mt-1 text-xs">
        {t("commissionExplainer")}
      </p>
      <ul className="mt-2 space-y-1.5">
        <CheckRow ok={readiness.hasActiveAgent} label={t("readinessAgent")} />
        <CheckRow
          ok={readiness.hasActiveCommission}
          label={t("readinessCommission")}
        />
        <CheckRow
          ok={
            readiness.hasActiveCommission &&
            readiness.missingTaskTypes.length === 0
          }
          label={t("readinessAllowlist")}
        />
      </ul>
      {readiness.missingTaskTypes.length > 0 &&
      readiness.hasActiveCommission ? (
        <p className="text-warning mt-2 font-mono text-xs">
          {t("readinessMissing", {
            types: readiness.missingTaskTypes.join(", "),
          })}
        </p>
      ) : null}
      {readiness.ready ? (
        <p className="text-success mt-2 text-sm">{t("readinessReady")}</p>
      ) : (
        <div className="mt-3">
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/agent">{t("readinessCta")}</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
