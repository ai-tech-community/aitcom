"use client";

import { useId, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { WebhookIcon } from "lucide-react";
import { useConfirm } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { api, RouterOutputs } from "@/trpc/react";
import { BuilderCode } from "./builder-code";
import {
  canRotateWebhookSecret,
  useWebhookSecretRotation,
} from "./builder-webhook-rotation";
import { BuilderWebhookReference } from "./builder-webhook-reference";
import {
  BuilderFailure,
  BuilderFeedback,
  BuilderLoadFailure,
  BuilderPanel,
  BuilderRetry,
  BuilderSkeleton,
  builderControl,
} from "./builder-ui";

const categories = [
  "forum",
  "challenges",
  "inbox",
  "content",
  "events",
  "community",
  "benchmark",
] as const;
type Category = (typeof categories)[number];

type WebhookApi = typeof api.agentManagement;
type WebhookQuery = Pick<
  ReturnType<WebhookApi["getWebhook"]["useQuery"]>,
  "isPending" | "isError" | "isSuccess" | "refetch"
> & {
  error?: ReturnType<WebhookApi["getWebhook"]["useQuery"]>["error"];
  data: RouterOutputs["agentManagement"]["getWebhook"] | undefined;
};
type Mutation<
  K extends
    | "upsertWebhook"
    | "testWebhook"
    | "deleteWebhook"
    | "approveWebhook"
    | "rejectWebhook",
> = ReturnType<WebhookApi[K]["useMutation"]>;

export function BuilderWebhookForm({
  id = "webhook",
  rotationKey,
  agentId,
  onRotated,
  query,
  issuedSecret,
  onDismissSecret,
  save,
  test,
  remove,
  approve,
  reject,
}: {
  id?: string;
  rotationKey?: string | null;
  agentId?: string;
  onRotated?: (secret: string) => void;
  query: WebhookQuery;
  issuedSecret: string | null;
  onDismissSecret: () => void;
  save: Mutation<"upsertWebhook">;
  test: Mutation<"testWebhook">;
  remove: Mutation<"deleteWebhook">;
  approve: Mutation<"approveWebhook">;
  reject: Mutation<"rejectWebhook">;
}) {
  const t = useTranslations("redesign.builder.webhook");
  const confirm = useConfirm();
  const format = useFormatter();
  const formId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [draftUrl, setDraftUrl] = useState<string>();
  const [draftCategories, setDraftCategories] = useState<Category[]>();
  const [urlError, setUrlError] = useState(false);

  const webhook = query.data;
  const rotation = useWebhookSecretRotation((next) => onRotated?.(next));
  const canRotate = !!webhook && canRotateWebhookSecret(webhook, agentId);
  const url = draftUrl ?? webhook?.url ?? "";
  const selected =
    draftCategories ?? (webhook?.categories as Category[] | undefined) ?? [];
  const proposal = webhook?.status === "pending";
  const status = !webhook
    ? "empty"
    : proposal
      ? "pending"
      : test.isError
        ? "testFailed"
        : !webhook.isEnabled
          ? "disabled"
          : webhook.consecutiveFailures >= 3
            ? "degraded"
            : "enabled";
  const busy = [save, test, remove, approve, reject, rotation].some(
    (action) => action.isPending,
  );
  const failure = [save, remove, approve, reject].find(
    (action) => action.error,
  );
  const failureMessage = webhookFailure(
    failure?.error?.message ?? "",
    failure?.error?.data?.code,
  );
  const response = test.error?.message.match(
    /^Webhook test failed: (?:(?:HTTP )?([345][0-9]{2})(?:[ :]+|$))?([A-Z][A-Za-z -]{0,60})?$/,
  );
  const testMessage = response
    ? undefined
    : webhookFailure(test.error?.message ?? "", test.error?.data?.code);
  const testTime =
    (test.isSuccess || test.isError) &&
    t("testAt", {
      date: format.dateTime(test.submittedAt, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    });

  function clearFeedback() {
    for (const action of [save, remove, approve, reject, rotation])
      action.reset();
    setUrlError(false);
  }

  function clearDraft() {
    setDraftUrl(undefined);
    setDraftCategories(undefined);
  }

  function sendTest() {
    clearFeedback();
    test.mutate();
  }

  function decideProposal(action: "approve" | "reject") {
    clearFeedback();
    if (action === "approve") approve.mutate();
    else reject.mutate(undefined, { onSuccess: clearDraft });
  }

  async function deleteConfiguration() {
    const accepted = await confirm({
      title: t("remove"),
      description: t("removeConfirm"),
      confirmLabel: t("remove"),
      destructive: true,
    });
    if (!accepted) return;
    clearFeedback();
    remove.mutate(undefined, {
      onSuccess: () => {
        test.reset();
        clearDraft();
      },
    });
  }

  async function rotateSecret() {
    if (!canRotate || !webhook || !rotationKey || busy) return;
    const accepted = await confirm({
      title: t("signing.rotate"),
      description: t("signing.rotateConfirm"),
      confirmLabel: t("signing.rotate"),
      destructive: true,
    });
    if (!accepted) return;
    clearFeedback();
    test.reset();
    rotation.mutate({ webhook, key: rotationKey });
  }

  const rotationAvailability = !canRotate
    ? "unsupported"
    : rotationKey
      ? "available"
      : "requiresKey";
  const rotateAction = rotationAvailability === "available" && (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={builderControl}
      disabled={busy}
      onClick={() => void rotateSecret()}
    >
      {t(rotation.isPending ? "signing.rotating" : "signing.rotate")}
    </Button>
  );

  return (
    <BuilderPanel
      id={id}
      title={t("title")}
      description={t("description")}
      icon={WebhookIcon}
      status={
        query.isSuccess && (
          <Badge
            variant={
              status === "enabled" && test.isSuccess ? "success" : "outline"
            }
          >
            {t(`status.${status}`, {
              count: webhook?.consecutiveFailures ?? 0,
            })}
          </Badge>
        )
      }
    >
      {webhook && !proposal && query.isSuccess && (
        <div className="mb-4 space-y-2">
          {test.isError ? (
            <BuilderFailure
              status={response?.[1]}
              reason={
                response?.[2] ??
                (testMessage
                  ? t(`failureReason.${testMessage}`)
                  : t("failureTitle"))
              }
              detail={testTime}
              action={
                <BuilderRetry
                  label={t("testAgain")}
                  disabled={busy}
                  onClick={sendTest}
                />
              }
            >
              {t(testMessage ?? "testFailed")}
            </BuilderFailure>
          ) : (
            <>
              <div className="border-border flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-md border px-3 py-2">
                <p className="text-muted-foreground text-sm">
                  {t(url.trim() === webhook.url ? "testHelp" : "testDraftHelp")}
                </p>
                <Button
                  type="button"
                  variant="ink"
                  className={builderControl}
                  disabled={busy}
                  onClick={sendTest}
                >
                  {t(test.isPending ? "testing" : "test")}
                </Button>
              </div>
              {test.isSuccess && (
                <BuilderFeedback tone="success" detail={testTime}>
                  {t("testSuccess")}
                </BuilderFeedback>
              )}
            </>
          )}
        </div>
      )}
      {issuedSecret && (
        <div className="mb-4 space-y-2">
          <p role="status" className="text-sm font-medium">
            {t("secretHelp")}
          </p>
          <BuilderCode
            label={t("secret")}
            value={issuedSecret}
            controls={rotateAction}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={builderControl}
            onClick={onDismissSecret}
          >
            {t("signing.dismiss")}
          </Button>
        </div>
      )}
      {query.isPending ? (
        <BuilderSkeleton label={t("loading")} className="h-72" />
      ) : query.isError ? (
        <BuilderLoadFailure
          reason={t("loadFailed")}
          status={query.error?.data?.httpStatus}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <div className="space-y-4">
          {proposal ? (
            <div className="border-border bg-muted/35 space-y-3 rounded-lg border p-4">
              <p className="text-sm">{t("proposal")}</p>
              <code className="block font-mono text-sm break-all">
                {webhook.url}
              </code>
              <ul className="flex flex-wrap gap-2">
                {selected.map((category) => (
                  <li key={category}>
                    <Badge variant="outline">
                      {categories.includes(category)
                        ? t(`events.${category}`)
                        : category}
                    </Badge>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="ink"
                  className={builderControl}
                  disabled={busy}
                  onClick={() => decideProposal("approve")}
                >
                  {t(approve.isPending ? "approving" : "approve")}
                </Button>
                <Button
                  variant="outline"
                  className={builderControl}
                  disabled={busy}
                  onClick={() => decideProposal("reject")}
                >
                  {t("reject")}
                </Button>
              </div>
            </div>
          ) : (
            <form
              id={formId}
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                clearFeedback();
                if (!url.trim().startsWith("https://")) {
                  setUrlError(true);
                  return;
                }
                save.mutate(
                  { url: url.trim(), categories: selected },
                  {
                    onSuccess: () => {
                      if (url.trim() !== webhook?.url) test.reset();
                      clearDraft();
                    },
                  },
                );
              }}
            >
              <div className="space-y-1.5">
                <label
                  htmlFor="builder-webhook-url"
                  className="text-sm font-medium"
                >
                  {t("url")}
                </label>
                <Input
                  id="builder-webhook-url"
                  ref={input}
                  type="url"
                  required
                  value={url}
                  placeholder="https://example.com/webhook"
                  onChange={(event) => {
                    setDraftUrl(event.target.value);
                    setUrlError(false);
                  }}
                  className={builderControl}
                  aria-invalid={urlError}
                  aria-describedby="builder-webhook-url-help"
                  disabled={busy}
                />
                <p
                  id="builder-webhook-url-help"
                  className="text-muted-foreground text-xs"
                >
                  {t("urlHelp")}
                </p>
                {urlError && (
                  <BuilderFailure
                    reason={t("failureReason.publicUrl")}
                    action={
                      <BuilderRetry
                        label={t("editUrl")}
                        onClick={() => input.current?.focus()}
                      />
                    }
                  >
                    {t("publicUrl")}
                  </BuilderFailure>
                )}
              </div>
              <fieldset disabled={busy}>
                <legend className="mb-1.5 text-sm font-medium">
                  {t("subscriptions")}
                </legend>
                <div className="grid gap-x-4 sm:grid-cols-2">
                  {categories.map((category) => (
                    <label
                      key={category}
                      className="border-border flex min-h-11 cursor-pointer items-center gap-3 border-b text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={selected.includes(category)}
                        onChange={() =>
                          setDraftCategories(
                            selected.includes(category)
                              ? selected.filter((item) => item !== category)
                              : [...selected, category],
                          )
                        }
                        className="accent-foreground focus-visible:outline-ring size-4 focus-visible:outline-2 focus-visible:outline-offset-2"
                      />
                      {t(`events.${category}`)}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="submit"
                  variant={webhook ? "outline" : "ink"}
                  className={builderControl}
                  disabled={busy || !url.trim() || selected.length === 0}
                >
                  {t(save.isPending ? "saving" : webhook ? "update" : "save")}
                </Button>
                {webhook && (
                  <Button
                    type="button"
                    variant="ghost"
                    className={`${builderControl} text-destructive`}
                    disabled={busy}
                    onClick={() => void deleteConfiguration()}
                  >
                    {t("remove")}
                  </Button>
                )}
              </div>
            </form>
          )}
          {failure && (
            <BuilderFailure
              reason={t(
                failureMessage
                  ? `failureReason.${failureMessage}`
                  : "changeFailedTitle",
              )}
              status={failure.error?.data?.httpStatus}
              action={
                failureMessage === "forbidden" ? (
                  <BuilderRetry
                    label={t("reloadAccess")}
                    onClick={() => void query.refetch()}
                  />
                ) : failure === save ? (
                  <BuilderRetry
                    label={t("retrySave")}
                    type="submit"
                    form={formId}
                    disabled={busy || !url.trim() || selected.length === 0}
                  />
                ) : failure === remove ? (
                  <BuilderRetry
                    label={t("retryRemove")}
                    disabled={busy}
                    onClick={() => void deleteConfiguration()}
                  />
                ) : (
                  <BuilderRetry
                    label={t(
                      failure === approve ? "retryApprove" : "retryReject",
                    )}
                    disabled={busy}
                    onClick={() =>
                      decideProposal(failure === approve ? "approve" : "reject")
                    }
                  />
                )
              }
            >
              {t(
                failureMessage ??
                  (failure === save ? "saveFailed" : "changeFailed"),
              )}
            </BuilderFailure>
          )}
          {save.isSuccess && (
            <BuilderFeedback tone="success">{t("saveSuccess")}</BuilderFeedback>
          )}
          <BuilderWebhookReference
            configured={!!webhook && !proposal}
            hasIssuedSecret={!!issuedSecret}
            rotationAvailability={rotationAvailability}
            rotateAction={issuedSecret ? null : rotateAction}
            rotationFailure={
              rotation.isError && (
                <BuilderFailure
                  reason={t("signing.rotateFailed")}
                  status={rotation.error?.status}
                  action={
                    <BuilderRetry
                      label={t("signing.retryRotation")}
                      onClick={() => void rotateSecret()}
                      disabled={busy || !rotationKey}
                    />
                  }
                >
                  {t("signing.rotateRecovery")}
                </BuilderFailure>
              )
            }
          />
        </div>
      )}
    </BuilderPanel>
  );
}

function webhookFailure(reason: string, code?: string) {
  if (code === "FORBIDDEN") return "forbidden";
  if (reason.includes("redirect")) return "redirectFailed";
  if (/does not resolve|ENOTFOUND|EAI_AGAIN/i.test(reason)) return "dnsFailed";
  if (/private|internal|localhost|metadata/i.test(reason)) return "publicUrl";
  if (/timed?\s*out|timeout/i.test(reason)) return "timeoutFailed";
  if (/certificate|tls|ssl/i.test(reason)) return "tlsFailed";
  if (/ECONNREFUSED/i.test(reason)) return "refusedFailed";
}
