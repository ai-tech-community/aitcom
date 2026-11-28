"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { api } from "@/trpc/react";
import { useBuilderKeyControls } from "./builder-key-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BuilderFailure,
  BuilderFeedback,
  BuilderRetry,
  builderControl,
} from "./builder-ui";
import { checkMcpConnection, type McpCheck } from "./mcp-config";

export function BuilderMcpCheck({
  fullKey,
  agentId,
  expectedPrefix,
  credentialsHref,
  onChecking,
  onVerified,
}: {
  fullKey: string | null;
  agentId: string;
  expectedPrefix?: string | null;
  credentialsHref: string;
  onChecking?: () => void;
  onVerified?: (credential: string) => void;
}) {
  const t = useTranslations("redesign.builder.connect");
  const [key, setKey] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<McpCheck & { prefix?: string }>();
  const credential = (fullKey ?? key).trim();
  const failed = !!result && result.outcome !== "passed";
  const rejected = result?.outcome === "invalidKey";
  const manageKey = t("manageKey");

  async function runCheck() {
    setPending(true);
    onChecking?.();
    const check = await checkMcpConnection(credential, expectedPrefix);
    const prefix =
      credential.length > 15
        ? credential.match(/^ait_sk_[A-Za-z0-9_-]{8}/)?.[0]
        : undefined;
    setPending(false);
    setResult({ ...check, prefix });
    if (check.outcome === "passed") onVerified?.(credential);
  }

  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (credential && !pending) void runCheck();
      }}
    >
      <p className="text-muted-foreground text-sm">{t("checkHelp")}</p>
      {!fullKey && (
        <label className="grid w-full max-w-xs gap-1.5 text-sm font-medium">
          {t("checkKey")}
          <Input
            type="password"
            autoComplete="off"
            spellCheck={false}
            required
            value={key}
            className={builderControl}
            disabled={pending}
            onChange={(event) => {
              setKey(event.target.value);
              if (!failed) setResult(undefined);
            }}
          />
        </label>
      )}

      {failed ? (
        <BuilderFailure
          status={result.status}
          reason={t(`reason.${result.outcome}`)}
          action={
            <>
              <BuilderRetry
                label={t(pending ? "checking" : "checkAgain")}
                type="submit"
                disabled={pending || !credential}
              />
              {rejected && (
                <Button
                  asChild
                  variant="link"
                  size="sm"
                  className={`${builderControl} text-foreground underline`}
                >
                  {credentialsHref.startsWith("#") ? (
                    <a href={credentialsHref}>{manageKey}</a>
                  ) : (
                    <Link href={credentialsHref}>{manageKey}</Link>
                  )}
                </Button>
              )}
            </>
          }
        >
          {rejected && result.prefix && (
            <>
              {t.rich("prefixTried", {
                prefix: result.prefix,
                code: (chunks) => <code className="font-mono">{chunks}</code>,
              })}{" "}
            </>
          )}
          {t(`checkResult.${result.outcome}`)}
        </BuilderFailure>
      ) : (
        <div className="flex flex-wrap items-start gap-2">
          <Button
            type="submit"
            variant="outline"
            className={builderControl}
            disabled={pending || !credential}
          >
            {t(pending ? "checking" : "checkConnection")}
          </Button>
          {result?.outcome === "passed" && !pending && (
            <div className="min-w-0 flex-1 basis-64">
              <BuilderFeedback tone="success">
                {result.status !== undefined && (
                  <span className="me-2 font-mono text-xs">
                    HTTP {result.status}
                  </span>
                )}
                {t("checkResult.passed")}
              </BuilderFeedback>
              <BuilderAssistantActivity agentId={agentId} />
            </div>
          )}
        </div>
      )}
    </form>
  );
}

function BuilderAssistantActivity({ agentId }: { agentId: string }) {
  const t = useTranslations("redesign.builder.connect");
  const format = useFormatter();
  const { activeKey } = useBuilderKeyControls();
  const issuedAt = activeKey ? new Date(activeKey.createdAt).getTime() : null;

  function callAfterIssue(
    agent?: { id: string; lastActiveAt?: Date | null } | null,
  ) {
    const time =
      agent?.id === agentId && agent.lastActiveAt
        ? new Date(agent.lastActiveAt)
        : null;
    return issuedAt !== null && time && time.getTime() > issuedAt ? time : null;
  }

  const agent = api.agentManagement.getMyAgent.useQuery(undefined, {
    refetchInterval: (query) =>
      callAfterIssue(query.state.data) ? false : 5000,
  });
  const time = callAfterIssue(agent.data);

  return (
    <p role="status" className="text-muted-foreground mt-2 text-sm">
      {time
        ? t.rich("assistantConnected", {
            date: format.dateTime(time, {
              dateStyle: "medium",
              timeStyle: "short",
            }),
            time: (chunks) => (
              <time dateTime={time.toISOString()} className="font-mono">
                {chunks}
              </time>
            ),
          })
        : t("assistantWaiting")}
    </p>
  );
}
