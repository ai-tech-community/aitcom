"use client";

import { useTranslations } from "next-intl";
import { KeyRoundIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { api } from "@/trpc/react";
import {
  BuilderLoadFailure,
  BuilderPanel,
  BuilderResource,
  BuilderSkeleton,
} from "./builder-ui";

export function BuilderAccountAccess() {
  const t = useTranslations("redesign.builder");
  const agent = api.agentManagement.getMyAgent.useQuery();
  const key = api.agentManagement.getKeyInfo.useQuery(undefined, {
    enabled: !!agent.data,
  });
  const reachable = agent.data?.status === "active" && !!key.data;
  const pending = agent.isPending || (!!agent.data && key.isPending);
  const failed = agent.isError || (!!agent.data && key.isError);

  return (
    <BuilderPanel
      id="builder-access"
      label={t("integrations.byAccount")}
      title={t(
        reachable ? "integrations.agentReach" : "integrations.agentTitle",
      )}
      icon={KeyRoundIcon}
      status={
        !pending &&
        !failed && (
          <Badge variant={reachable ? "success" : "outline"}>
            {t(
              reachable
                ? "key.active"
                : agent.data
                  ? "key.inactive"
                  : "integrations.agentMissing",
            )}
          </Badge>
        )
      }
    >
      {pending ? (
        <BuilderSkeleton
          label={t("integrations.agentLoading")}
          className="h-11"
        />
      ) : failed ? (
        <BuilderLoadFailure
          reason={t("integrations.agentLoadFailed")}
          status={(agent.error ?? key.error)?.data?.httpStatus}
          onRetry={() => void (agent.isError ? agent.refetch() : key.refetch())}
        />
      ) : null}
      <BuilderResource
        href="/dashboard/agent"
        label={t("integrations.manageAgent")}
        description={agent.data?.name ?? undefined}
      />
    </BuilderPanel>
  );
}
