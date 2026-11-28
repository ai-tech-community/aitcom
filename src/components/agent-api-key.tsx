"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/agent/shared";
import { KeyRoundIcon, ArrowRightIcon } from "lucide-react";
import { isOpenCommunitiesEnabled } from "@/lib/communities/redesign-flag";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { BuilderNewKey } from "@/components/builder/builder-code";
import {
  BuilderKeyFailure,
  useBuilderKeyControls,
} from "@/components/builder/builder-key-controls";
import { BuilderKeyPermissions } from "@/components/builder/builder-key-permissions";
import {
  BuilderLoadFailure,
  BuilderPanel,
  BuilderSkeleton,
  builderControl,
} from "@/components/builder/builder-ui";
import { useRevealedKey } from "@/components/agent/revealed-key-context";

export function AgentApiKey() {
  return isOpenCommunitiesEnabled() ? (
    <BuilderCredential />
  ) : (
    <LegacyAgentApiKey />
  );
}

function LegacyAgentApiKey() {
  const t = useTranslations("agent");
  const { fullKey, setFullKey } = useRevealedKey();
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const keyInfo = api.agentManagement.getKeyInfo.useQuery();
  const utils = api.useUtils();

  const generateKey = api.agentManagement.generateKey.useMutation({
    onSuccess: (data) => {
      setFullKey(data.key);
      setConfirmRegenerate(false);
      void utils.agentManagement.getKeyInfo.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const revokeKey = api.agentManagement.revokeKey.useMutation({
    onSuccess: () => {
      setFullKey(null);
      void utils.agentManagement.getKeyInfo.invalidate();
    },
  });

  const hasExistingKey = !!keyInfo.data;

  const handleRegenerateClick = () => {
    if (!hasExistingKey) {
      generateKey.mutate();
      return;
    }
    if (!confirmRegenerate) {
      setConfirmRegenerate(true);
      return;
    }
    generateKey.mutate();
  };

  return (
    <div className="space-y-4">
      {keyInfo.isLoading ? (
        <p className="text-muted-foreground text-sm">Loading key info...</p>
      ) : keyInfo.data ? (
        <div className="space-y-3">
          <div className="border-border bg-secondary rounded border px-4 py-3">
            <div className="flex items-center justify-between">
              <code className="text-foreground font-mono text-sm break-all">
                {fullKey ?? `${keyInfo.data.prefix}...`}
              </code>
              {fullKey && <CopyButton text={fullKey} />}
            </div>
            <div className="mt-2 flex items-center gap-3">
              <span className="text-muted-foreground text-xs">
                {keyInfo.data.lastUsedAt
                  ? `Last used ${new Date(keyInfo.data.lastUsedAt).toLocaleDateString()}`
                  : "Never used"}
              </span>
            </div>
          </div>

          {fullKey ? (
            <div className="border-warning/30 bg-warning/10 rounded border px-3 py-3">
              <p className="text-warning font-mono text-xs font-medium tracking-wider">
                ⚠ COPY NOW — KEY WILL NOT BE SHOWN AGAIN
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                For security, AIT stores only a hash of the key. Once you leave
                or reload this page, only the prefix remains visible. If you
                lose it, use Regenerate to issue a new one.
              </p>
            </div>
          ) : (
            <p className="text-muted-foreground text-xs">
              Lost the key? Use <strong>Regenerate</strong> to issue a new one.
              This invalidates the old key — any agent runtime currently using
              it will stop working until you update its config.
            </p>
          )}

          <div className="flex items-center gap-2">
            <Button
              variant="destructive"
              size="xs"
              onClick={() => revokeKey.mutate()}
              disabled={revokeKey.isPending}
              className="font-mono text-xs tracking-wider"
            >
              {revokeKey.isPending ? "..." : t("revokeKey")}
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          No active API key. Generate one to allow your agent to connect.
        </p>
      )}

      {confirmRegenerate && hasExistingKey ? (
        <div className="border-destructive/40 bg-destructive/5 space-y-2 rounded border p-3">
          <p className="text-foreground text-sm">
            Regenerate will{" "}
            <strong>invalidate the current key immediately</strong>. Any agent
            runtime using it will stop working until you paste the new key into
            its config. Continue?
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="destructive"
              size="sm"
              className="font-mono text-xs tracking-wider"
              onClick={handleRegenerateClick}
              disabled={generateKey.isPending}
            >
              {generateKey.isPending ? "..." : "YES, REGENERATE"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="font-mono text-xs tracking-wider"
              onClick={() => setConfirmRegenerate(false)}
              disabled={generateKey.isPending}
            >
              CANCEL
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          className="w-full font-mono text-xs tracking-wider"
          onClick={handleRegenerateClick}
          disabled={generateKey.isPending}
        >
          {generateKey.isPending
            ? "Generating..."
            : hasExistingKey
              ? t("regenerateKey")
              : t("generateKey")}
        </Button>
      )}
    </div>
  );
}

function BuilderCredential() {
  const t = useTranslations("redesign.builder");
  const format = useFormatter();
  const { keyInfo, activeKey, fullKey, busy, generate, revoke, changeKey } =
    useBuilderKeyControls();
  const active = !!activeKey || !!fullKey;

  const status = (keyInfo.isSuccess || fullKey) && (
    <Badge variant={active ? "success" : "outline"}>
      {t(active ? "key.active" : "key.inactive")}
    </Badge>
  );
  const details =
    keyInfo.isPending && !fullKey ? (
      <BuilderSkeleton label={t("key.loading")} />
    ) : keyInfo.isError && !fullKey ? (
      <BuilderLoadFailure
        reason={t("key.loadFailed")}
        status={keyInfo.error?.data?.httpStatus}
        onRetry={() => void keyInfo.refetch()}
      />
    ) : (
      <div className="@container">
        <div
          className={
            activeKey
              ? "grid items-start gap-4 @2xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] @2xl:gap-6"
              : undefined
          }
        >
          <div className="min-w-0 space-y-4">
            {fullKey ? (
              <div className="space-y-2">
                <p className="text-sm font-medium" role="status">
                  {t("key.copyNow")}
                </p>
                <BuilderNewKey key={fullKey} value={fullKey} />
                <p className="text-muted-foreground text-sm">
                  {t("key.copyNowHelp")}
                </p>
              </div>
            ) : !activeKey ? (
              <p className="text-muted-foreground text-sm">{t("key.empty")}</p>
            ) : null}
            {activeKey && (
              <dl className="border-border grid grid-cols-2 gap-3 border-y py-3 text-sm">
                {!fullKey && (
                  <div>
                    <dt className="text-muted-foreground">{t("key.title")}</dt>
                    <dd className="mt-1 font-mono text-xs break-all">
                      {activeKey.prefix}…
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="text-muted-foreground">
                    {t("key.createdLabel")}
                  </dt>
                  <dd className="mt-1 font-mono text-xs">
                    {format.dateTime(new Date(activeKey.createdAt), {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </dd>
                </div>
              </dl>
            )}
            <BuilderKeyFailure />
            <div className="flex flex-wrap gap-2">
              {fullKey && (
                <Button asChild variant="ink" className={builderControl}>
                  <Link href="/dashboard/agent?tab=connect">
                    {t("key.openConnect")} <ArrowRightIcon aria-hidden />
                  </Link>
                </Button>
              )}
              <Button
                className={builderControl}
                variant={active ? "outline" : "ink"}
                onClick={() => void changeKey("generate")}
                disabled={
                  busy || !keyInfo.isSuccess || (!!fullKey && !activeKey)
                }
              >
                {t(
                  generate.isPending
                    ? "key.generating"
                    : active
                      ? "key.rotate"
                      : "key.generate",
                )}
              </Button>
              {active && (
                <Button
                  className={`${builderControl} text-destructive`}
                  variant="ghost"
                  onClick={() => void changeKey("revoke")}
                  disabled={
                    busy || !keyInfo.isSuccess || (!!fullKey && !activeKey)
                  }
                >
                  {t(revoke.isPending ? "key.revoking" : "key.revoke")}
                </Button>
              )}
            </div>
          </div>
          {activeKey && <BuilderKeyPermissions scopes={activeKey.scopes} />}
        </div>
      </div>
    );

  return (
    <BuilderPanel
      id="credentials"
      icon={KeyRoundIcon}
      title={t("key.title")}
      description={t("key.description")}
      status={status}
    >
      {details}
    </BuilderPanel>
  );
}
