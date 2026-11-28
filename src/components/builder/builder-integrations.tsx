"use client";

import { useId, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { CalendarDaysIcon } from "lucide-react";
import { useConfirm } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionLabel } from "@/components/ui/section-label";
import { BuilderAccountAccess } from "./builder-account-access";
import type { api, RouterOutputs } from "@/trpc/react";
import {
  BuilderFailure,
  BuilderFeedback,
  BuilderLoadFailure,
  BuilderPanel,
  BuilderRetry,
  BuilderSkeleton,
  builderControl,
} from "./builder-ui";

type LumaApi = typeof api.luma;
type Mutation<
  K extends
    | "connect"
    | "selectCalendar"
    | "updateConfig"
    | "testConnection"
    | "disconnect",
> = ReturnType<LumaApi[K]["useMutation"]>;

export function BuilderIntegrations({
  slug,
  query,
  connect,
  selectCalendar,
  toggle,
  test,
  disconnect,
}: {
  slug: string;
  query: Pick<
    ReturnType<LumaApi["getConfig"]["useQuery"]>,
    "isPending" | "isError" | "isSuccess" | "refetch"
  > & {
    error?: ReturnType<LumaApi["getConfig"]["useQuery"]>["error"];
    data: RouterOutputs["luma"]["getConfig"] | undefined;
  };
  connect: Mutation<"connect">;
  selectCalendar: Mutation<"selectCalendar">;
  toggle: Mutation<"updateConfig">;
  test: Mutation<"testConnection">;
  disconnect: Mutation<"disconnect">;
}) {
  const t = useTranslations("redesign.builder");
  const luma = useTranslations("communities.settings.integrations.luma");
  const format = useFormatter();
  const confirm = useConfirm();
  const keyFormId = useId();
  const [showKey, setShowKey] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [calendarId, setCalendarId] = useState("");

  const config = query.data;
  const connected = config && config.calendarApiId !== "";
  const calendars = connect.data?.calendars ?? [];
  const selected =
    calendars.find((calendar) => calendar.api_id === calendarId) ??
    calendars[0];
  const actions = [connect, selectCalendar, toggle, test, disconnect] as const;
  const busy = actions.some((action) => action.isPending);
  const failure = [connect, selectCalendar, toggle, disconnect].find(
    (action) => action.error && (!connected || action !== connect),
  );
  const forbidden = failure?.error?.data?.code === "FORBIDDEN";
  const failed =
    failure === connect && connect.error?.data?.code === "BAD_REQUEST"
      ? "badKey"
      : "changeFailed";

  const testTime =
    (test.isSuccess || test.isError) &&
    t("integrations.testAt", {
      date: format.dateTime(test.submittedAt, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    });

  function clearFeedback() {
    selectCalendar.reset();
    toggle.reset();
    disconnect.reset();
  }

  function testLuma() {
    clearFeedback();
    test.mutate({ communitySlug: slug });
  }

  function openKeyForm() {
    connect.reset();
    setShowKey(true);
  }

  function retryLumaChange() {
    if (failure === disconnect) void disconnectLuma();
    if (failure === selectCalendar && selected) {
      clearFeedback();
      selectCalendar.mutate({
        communitySlug: slug,
        calendarApiId: selected.api_id,
        calendarName: selected.name,
      });
    }
    if (failure === toggle && toggle.variables) {
      const request = toggle.variables;
      clearFeedback();
      toggle.mutate(request);
    }
  }

  async function disconnectLuma() {
    const accepted = await confirm({
      description: luma("disconnectConfirm"),
      confirmLabel: luma("disconnect"),
      destructive: true,
    });
    if (!accepted) return;
    clearFeedback();
    setCalendarId("");
    connect.reset();
    disconnect.mutate(
      { communitySlug: slug },
      { onSuccess: () => test.reset() },
    );
  }

  return (
    <div className="max-w-3xl min-w-0">
      <header className="mb-5 sm:mb-7">
        <SectionLabel as="p" bordered={false}>
          {t("integrations.label")}
        </SectionLabel>
        <h2 className="font-community-heading mt-2 text-3xl font-semibold tracking-tight">
          {t("integrations.title")}
        </h2>
        <p className="text-muted-foreground mt-2 max-w-[60ch] text-sm leading-relaxed">
          {t("integrations.description")}
        </p>
      </header>

      <BuilderAccountAccess />

      <BuilderPanel
        id="luma"
        label={t("integrations.byCommunity")}
        title={luma("title")}
        description={luma("description")}
        icon={CalendarDaysIcon}
        status={
          query.isSuccess && (
            <Badge
              variant={
                connected && config.isEnabled && !test.isError
                  ? "success"
                  : "outline"
              }
            >
              {connected
                ? test.isError
                  ? t("integrations.checkFailed")
                  : luma(config.isEnabled ? "enabled" : "disabled")
                : t("integrations.notConnected")}
            </Badge>
          )
        }
      >
        {query.isPending ? (
          <BuilderSkeleton label={t("integrations.loading")} className="h-24" />
        ) : query.isError ? (
          <BuilderLoadFailure
            reason={t("integrations.loadFailed")}
            status={query.error?.data?.httpStatus}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <div className="space-y-3">
            {connected ? (
              <>
                <p className="text-sm">
                  <span className="text-muted-foreground">
                    {luma("calendarLabel")}
                  </span>{" "}
                  <strong dir="auto">{config.calendarName}</strong>
                </p>
                {config.lastSyncCheck && (
                  <p className="text-muted-foreground font-mono text-xs">
                    {luma("lastSync")}{" "}
                    {format.dateTime(new Date(config.lastSyncCheck), {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    className={builderControl}
                    disabled={busy}
                    onClick={() => {
                      clearFeedback();
                      toggle.mutate({
                        communitySlug: slug,
                        isEnabled: !config.isEnabled,
                      });
                    }}
                  >
                    {t(
                      config.isEnabled
                        ? "integrations.pause"
                        : "integrations.enable",
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    className={builderControl}
                    disabled={busy}
                    onClick={testLuma}
                  >
                    {luma(test.isPending ? "testing" : "testConnection")}
                  </Button>
                  <Button
                    variant="ghost"
                    className={`${builderControl} text-destructive`}
                    disabled={busy}
                    onClick={() => void disconnectLuma()}
                  >
                    {luma("disconnect")}
                  </Button>
                </div>
              </>
            ) : selected ? (
              <div className="space-y-2">
                <label
                  className="block text-sm font-medium"
                  htmlFor="builder-luma-calendar"
                >
                  {t("integrations.selectCalendar")}
                </label>
                <select
                  id="builder-luma-calendar"
                  className="border-input bg-background focus-visible:ring-ring min-h-11 w-full max-w-md rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
                  value={selected.api_id}
                  onChange={(event) => setCalendarId(event.target.value)}
                  disabled={busy}
                >
                  {calendars.map((calendar) => (
                    <option key={calendar.api_id} value={calendar.api_id}>
                      {calendar.name}
                    </option>
                  ))}
                </select>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    className={builderControl}
                    disabled={busy}
                    onClick={() => {
                      clearFeedback();
                      selectCalendar.mutate({
                        communitySlug: slug,
                        calendarApiId: selected.api_id,
                        calendarName: selected.name,
                      });
                    }}
                  >
                    {t("integrations.useCalendar")}
                  </Button>
                  <Button
                    variant="ghost"
                    className={builderControl}
                    disabled={busy}
                    onClick={() => {
                      clearFeedback();
                      setCalendarId("");
                      connect.reset();
                    }}
                  >
                    {t("cancel")}
                  </Button>
                </div>
              </div>
            ) : showKey ? (
              <form
                id={keyFormId}
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  clearFeedback();
                  connect.mutate(
                    { communitySlug: slug, apiKey: apiKey.trim() },
                    {
                      onSuccess: () => {
                        setApiKey("");
                        setShowKey(false);
                      },
                    },
                  );
                }}
              >
                <div className="space-y-1.5">
                  <label
                    className="text-sm font-medium"
                    htmlFor="builder-luma-key"
                  >
                    {luma("apiKeyLabel")}
                  </label>
                  <Input
                    id="builder-luma-key"
                    type="password"
                    value={apiKey}
                    required
                    autoComplete="off"
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder={luma("apiKeyPlaceholder")}
                    className={builderControl}
                    aria-describedby="builder-luma-key-help"
                    disabled={busy}
                  />
                  <p
                    id="builder-luma-key-help"
                    className="text-muted-foreground text-xs"
                  >
                    {luma("apiKeyHelp")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="submit"
                    variant="outline"
                    className={builderControl}
                    disabled={busy || !apiKey.trim()}
                  >
                    {luma(connect.isPending ? "connecting" : "connect")}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className={builderControl}
                    disabled={busy}
                    onClick={() => {
                      setShowKey(false);
                      setApiKey("");
                      connect.reset();
                    }}
                  >
                    {t("cancel")}
                  </Button>
                </div>
              </form>
            ) : (
              <>
                {connect.isSuccess ? (
                  <BuilderFeedback
                    action={
                      <BuilderRetry
                        label={t("integrations.differentKey")}
                        onClick={openKeyForm}
                      />
                    }
                  >
                    {t("integrations.noCalendars")}
                  </BuilderFeedback>
                ) : (
                  <Button
                    variant="outline"
                    className={builderControl}
                    onClick={openKeyForm}
                  >
                    {t("integrations.connectLuma")}
                  </Button>
                )}
              </>
            )}
            {failure && (
              <BuilderFailure
                status={failure.error?.data?.httpStatus}
                reason={t(
                  `integrations.failureReason.${forbidden ? "forbidden" : failed}`,
                )}
                action={
                  forbidden ? (
                    <BuilderRetry
                      label={t("retryAccess")}
                      onClick={() => void query.refetch()}
                    />
                  ) : failure === connect ? (
                    <BuilderRetry
                      label={t("retry")}
                      type="submit"
                      form={keyFormId}
                      disabled={busy || !apiKey.trim()}
                    />
                  ) : (
                    <BuilderRetry
                      label={t("retry")}
                      disabled={busy}
                      onClick={retryLumaChange}
                    />
                  )
                }
              >
                {t(`integrations.${forbidden ? "forbidden" : failed}`)}
              </BuilderFailure>
            )}
            {connected && test.isSuccess && (
              <BuilderFeedback tone="success" detail={testTime}>
                {luma("testSuccess")}
              </BuilderFeedback>
            )}
            {connected && test.isError && (
              <BuilderFailure
                status={test.error?.data?.httpStatus}
                reason={t(
                  test.error?.data?.code === "FORBIDDEN"
                    ? "integrations.failureReason.forbidden"
                    : "integrations.checkFailed",
                )}
                detail={testTime}
                action={
                  <BuilderRetry
                    label={t(
                      test.error?.data?.code === "FORBIDDEN"
                        ? "retryAccess"
                        : "integrations.retryTest",
                    )}
                    disabled={busy}
                    onClick={
                      test.error?.data?.code === "FORBIDDEN"
                        ? () => void query.refetch()
                        : testLuma
                    }
                  />
                }
              >
                {t(
                  test.error?.data?.code === "FORBIDDEN"
                    ? "integrations.forbidden"
                    : "integrations.testFailed",
                )}
              </BuilderFailure>
            )}
          </div>
        )}
      </BuilderPanel>
    </div>
  );
}
