"use client";

import { useTranslations } from "next-intl";
import { CheckCircle2, Circle } from "lucide-react";

import { api } from "@/trpc/react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { deriveAgentReadiness } from "./agent-readiness";

function CheckRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      {ok ? (
        <CheckCircle2 className="size-4 shrink-0 text-green-600" aria-hidden />
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
  const { data: agent, isLoading: agentLoading } =
    api.agentManagement.getMyAgent.useQuery();
  const { data: commissions, isLoading: commissionsLoading } =
    api.commissions.listMine.useQuery();

  if (agentLoading || commissionsLoading) return null;

  const readiness = deriveAgentReadiness({
    agent: agent ?? null,
    commissions: commissions ?? [],
    requiredTaskTypes,
  });

  return (
    <div className="border-border rounded-md border p-4">
      <h4 className="text-sm font-semibold">{t("readinessTitle")}</h4>
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
        <p className="mt-2 font-mono text-xs text-amber-700">
          {t("readinessMissing", {
            types: readiness.missingTaskTypes.join(", "),
          })}
        </p>
      ) : null}
      {readiness.ready ? (
        <p className="mt-2 text-sm text-green-700">{t("readinessReady")}</p>
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
