"use client";

import { useTranslations } from "next-intl";
import { CodeXmlIcon, PlugIcon } from "lucide-react";
import { BuilderCode } from "./builder-code";
import { useBuilderKeyControls } from "./builder-key-controls";
import { BuilderMcpCheck } from "./builder-mcp-check";
import {
  BuilderDisclosure,
  BuilderLoadFailure,
  BuilderPanel,
  BuilderSkeleton,
} from "./builder-ui";
import {
  agentMcpConfig,
  agentMcpRequest,
  builderMcpEndpoint,
} from "./mcp-config";

export function BuilderMcpPanel({
  agentId,
  credentialsHref = "/dashboard/agent#credentials",
  onChecking,
  onVerified,
}: {
  agentId: string;
  credentialsHref?: string;
  onChecking?: () => void;
  onVerified?: (credential: string) => void;
}) {
  const t = useTranslations("redesign.builder");
  const { keyInfo, fullKey } = useBuilderKeyControls();
  const key = fullKey ?? "YOUR_AGENT_API_KEY";
  const config = agentMcpConfig(builderMcpEndpoint, key);
  const request = agentMcpRequest(builderMcpEndpoint, fullKey);

  return (
    <BuilderPanel
      id="mcp"
      icon={PlugIcon}
      title={t("connect.title")}
      description={t("connect.description")}
    >
      {keyInfo.isPending && !fullKey ? (
        <BuilderSkeleton label={t("key.loading")} className="h-64" />
      ) : keyInfo.isError && !fullKey ? (
        <BuilderLoadFailure
          reason={t("key.loadFailed")}
          status={keyInfo.error?.data?.httpStatus}
          onRetry={() => void keyInfo.refetch()}
        />
      ) : (
        <div className="space-y-4">
          <p className="text-sm">
            {t(
              fullKey
                ? "connect.ready"
                : keyInfo.data
                  ? "connect.placeholder"
                  : "connect.missing",
            )}
          </p>
          <BuilderCode
            label={t("connect.config")}
            value={config}
            maskKey={fullKey ?? undefined}
          />
          <BuilderMcpCheck
            key={fullKey ?? keyInfo.data?.prefix ?? "no-key"}
            fullKey={fullKey}
            agentId={agentId}
            credentialsHref={credentialsHref}
            onChecking={onChecking}
            expectedPrefix={
              fullKey ? undefined : (keyInfo.data?.prefix ?? null)
            }
            onVerified={onVerified}
          />
          <BuilderDisclosure title={t("connect.request")} icon={CodeXmlIcon}>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {t(fullKey ? "connect.requestWithKey" : "connect.requestHelp")}
            </p>
            <BuilderCode
              label="curl"
              value={request}
              maskKey={fullKey ?? undefined}
            />
          </BuilderDisclosure>
        </div>
      )}
    </BuilderPanel>
  );
}
