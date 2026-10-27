"use client";

import { Fragment, useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Link } from "@/i18n/navigation";
import {
  AUTO_DRAFT_CADENCES,
  AUTO_DRAFT_LOOK_BACKS,
  AUTO_DRAFT_SOURCE_ORDER,
  AUTO_DRAFT_SOURCES,
  AUTO_DRAFT_WHEN_READY,
  AUTO_PUBLISH_DAYS_MAX,
  MONTH_DAY_MAX,
  sourceMaxLimit,
  type AutoDraftSettings,
  type AutoDraftSettingsInput,
} from "@/lib/magazines/auto-draft";
import { magazineSettingsPath } from "@/lib/magazines/paths";
import { ISSUE_LAYOUTS, ISSUE_VISIBILITIES } from "@/lib/magazines/values";
import { api, type RouterOutputs } from "@/trpc/react";

import { readEditorError } from "../editor-errors";
import { PublicOptIn, publicOptInRequired } from "../public-opt-in";
import { useScheduleTime } from "../use-schedule-time";

type SettingsData = NonNullable<
  RouterOutputs["magazines"]["autoDraftSettings"]
>;
type Draft = Omit<AutoDraftSettingsInput, "confirmUnlistedPublic">;

function draftOf({
  publicConfirmedBy: _by,
  publicConfirmedAt: _at,
  ...settings
}: AutoDraftSettings): Draft {
  return settings;
}

const selectClass =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full min-w-0 rounded-md border px-3 text-sm outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50";
function inRange(value: number, max: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= max;
}

const radioClass =
  "accent-foreground focus-visible:ring-ring/50 size-4 shrink-0 focus-visible:ring-[3px] focus-visible:outline-none";

export function AutoDraftSettingsForm({ slug }: { slug: string }) {
  const t = useTranslations("magazineEditor.autoDraft");
  const query = api.magazines.autoDraftSettings.useQuery({ slug });
  if (query.isLoading)
    return (
      <div aria-hidden="true" className="space-y-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );
  if (query.isError || !query.data)
    return (
      <ErrorState
        title={t("settingsLoadFailed")}
        retryLabel={t("tryAgain")}
        onRetry={() => void query.refetch()}
      />
    );
  return <SettingsEditor slug={slug} data={query.data} />;
}

function SettingsEditor({ slug, data }: { slug: string; data: SettingsData }) {
  const t = useTranslations("magazineEditor.autoDraft");
  const tErrors = useTranslations("magazineEditor.errors");
  const displayTime = useScheduleTime();
  const utils = api.useUtils();
  const id = useId();
  const [draft, setDraft] = useState<Draft>(() => draftOf(data.settings));
  const [saved, setSaved] = useState(data.settings);
  const [confirmed, setConfirmed] = useState(false);
  const [savedMessage, setSavedMessage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = api.magazines.saveAutoDraftSettings.useMutation({
    onSuccess: (settings) => {
      setSaved(settings);
      setDraft(draftOf(settings));
      setConfirmed(false);
      setSavedMessage(true);
      void utils.magazines.autoDraftSettings.invalidate({ slug });
      void utils.magazines.autoDraftHistory.invalidate({ slug });
      void utils.magazines.listIssues.invalidate({ slug });
    },
    onError: (err) => setError(tErrors(readEditorError(err).key)),
  });
  const update = (patch: Partial<Draft>) => {
    setError(null);
    setSavedMessage(false);
    setDraft((current) => ({ ...current, ...patch }));
  };
  // Inheritance copies the magazine's own recorded visibility. Only an explicit
  // override needs a confirmation on the automatic-draft settings row.
  const optInRequired =
    draft.visibility !== null &&
    publicOptInRequired({
      next: draft.visibility,
      saved: { ...saved, visibility: saved.visibility ?? "members" },
      community: data.community,
    });
  const disabled = !data.canManage || save.isPending;
  const numbersValid =
    inRange(draft.autoPublishDays, AUTO_PUBLISH_DAYS_MAX) &&
    AUTO_DRAFT_SOURCE_ORDER.every((source) =>
      inRange(draft.sources[source]!.max, sourceMaxLimit(source)),
    );
  const canSave = !disabled && numbersValid && (!optInRequired || confirmed);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSave) return;
    setError(null);
    setSavedMessage(false);
    save.mutate({
      slug,
      ...draft,
      confirmUnlistedPublic: optInRequired && confirmed,
    });
  };
  const readyHelpId = `${id}-ready-help`;
  const scheduleUnchanged =
    draft.enabled === saved.enabled &&
    draft.cadence === saved.cadence &&
    draft.monthDay === saved.monthDay &&
    draft.weekday === saved.weekday;
  const nextDescriptionId = !scheduleUnchanged
    ? `${id}-next-save`
    : data.nextDraftAt
      ? `${id}-next`
      : undefined;

  return (
    <form onSubmit={submit} className="@container min-w-0 space-y-6">
      {!data.canManage && (
        <p id={`${id}-read-only`} className="text-muted-foreground text-sm">
          {t("readOnly")}
        </p>
      )}
      <fieldset
        disabled={disabled}
        aria-describedby={!data.canManage ? `${id}-read-only` : undefined}
        className="min-w-0 space-y-8"
      >
        <legend className="sr-only">{t("settingsTitle")}</legend>
        <fieldset className="space-y-3">
          <legend className="mb-3 text-base font-semibold">
            {t("enabled")}
          </legend>
          <div className="flex items-center gap-3">
            <Switch
              id={`${id}-enabled`}
              checked={draft.enabled}
              disabled={disabled}
              onCheckedChange={(enabled) => update({ enabled })}
              aria-describedby={nextDescriptionId}
              className="data-[state=checked]:bg-foreground dark:data-[state=checked]:[&_[data-slot=switch-thumb]]:bg-background"
            />
            <Label htmlFor={`${id}-enabled`}>{t("enabled")}</Label>
          </div>
          {!scheduleUnchanged ? (
            <p id={`${id}-next-save`} className="text-muted-foreground text-sm">
              {t("nextDraftUpdatesOnSave")}
            </p>
          ) : data.nextDraftAt ? (
            <p id={`${id}-next`} className="text-muted-foreground text-sm">
              {t.rich("nextDraft", {
                date: displayTime(data.nextDraftAt),
                timestamp: (chunks) => (
                  <time dateTime={data.nextDraftAt!} className="font-mono">
                    {chunks}
                  </time>
                ),
              })}
            </p>
          ) : null}
        </fieldset>
        <fieldset className="min-w-0 space-y-3">
          <legend className="mb-3 text-base font-semibold">
            {t("howOften")}
          </legend>
          <div className="grid items-center gap-4 @sm:grid-cols-2">
            {AUTO_DRAFT_CADENCES.map((cadence) => (
              <Fragment key={cadence}>
                <div className="flex items-center gap-2 @sm:col-start-1">
                  <input
                    id={`${id}-cadence-${cadence}`}
                    className={radioClass}
                    type="radio"
                    name={`${id}-cadence`}
                    value={cadence}
                    checked={draft.cadence === cadence}
                    onChange={() => update({ cadence })}
                  />
                  <Label
                    htmlFor={`${id}-cadence-${cadence}`}
                    className="leading-snug"
                  >
                    {t(`cadences.${cadence}`)}
                  </Label>
                </div>
                {cadence === "monthly" && (
                  <div className="min-w-0 space-y-2 @sm:col-start-2 @sm:row-start-1">
                    <Label htmlFor={`${id}-month-day`}>{t("monthDay")}</Label>
                    <select
                      id={`${id}-month-day`}
                      className={selectClass}
                      value={draft.monthDay}
                      disabled={disabled || draft.cadence !== "monthly"}
                      onChange={(event) =>
                        update({ monthDay: Number(event.target.value) })
                      }
                    >
                      {Array.from(
                        { length: MONTH_DAY_MAX },
                        (_, index) => index + 1,
                      ).map((day) => (
                        <option key={day} value={day}>
                          {day}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {cadence === "weekly" && (
                  <div className="min-w-0 space-y-2 @sm:col-start-2 @sm:row-span-2 @sm:row-start-2">
                    <Label htmlFor={`${id}-weekday`}>{t("weekday")}</Label>
                    <select
                      id={`${id}-weekday`}
                      className={selectClass}
                      value={draft.weekday}
                      disabled={
                        disabled ||
                        (draft.cadence !== "weekly" &&
                          draft.cadence !== "biweekly")
                      }
                      onChange={(event) =>
                        update({ weekday: Number(event.target.value) })
                      }
                    >
                      {Array.from({ length: 7 }, (_, index) => index + 1).map(
                        (day) => (
                          <option key={day} value={day}>
                            {t(`weekdays.${day}`)}
                          </option>
                        ),
                      )}
                    </select>
                  </div>
                )}
              </Fragment>
            ))}
          </div>
        </fieldset>
        <fieldset className="space-y-3">
          <legend className="mb-3 text-base font-semibold">
            {t("lookBack")}
          </legend>
          {AUTO_DRAFT_LOOK_BACKS.map((lookBack) => (
            <div key={lookBack} className="flex items-center gap-2">
              <input
                id={`${id}-look-back-${lookBack}`}
                className={radioClass}
                type="radio"
                name={`${id}-look-back`}
                checked={draft.lookBack === lookBack}
                onChange={() => update({ lookBack })}
              />
              <Label htmlFor={`${id}-look-back-${lookBack}`}>
                {t(`lookBacks.${lookBack}`)}
              </Label>
            </div>
          ))}
        </fieldset>
        <fieldset className="min-w-0">
          <legend className="mb-3 text-base font-semibold">
            {t("whatToPick")}
          </legend>
          <div className="divide-y border-y">
            {AUTO_DRAFT_SOURCE_ORDER.map((source) => {
              const facts = AUTO_DRAFT_SOURCES[source];
              const config = draft.sources[source]!;
              const sourceId = `${id}-source-${source}`;
              const labelId = `${sourceId}-label`;
              const upToId = `${sourceId}-up-to`;
              const sourceHelpId = `${sourceId}-help`;
              const maxInvalid = !inRange(config.max, sourceMaxLimit(source));
              const maxErrorId = maxInvalid
                ? `${sourceId}-max-error`
                : undefined;
              const helpId =
                !data.hasTopics && facts.needsTopics
                  ? `${sourceId}-topics`
                  : undefined;
              return (
                <div
                  key={source}
                  className="flex min-w-0 flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-start gap-2">
                      <Checkbox
                        id={sourceId}
                        tone="ink"
                        disabled={disabled}
                        checked={config.enabled}
                        aria-describedby={[sourceHelpId, helpId]
                          .filter(Boolean)
                          .join(" ")}
                        onCheckedChange={(checked) =>
                          update({
                            sources: {
                              ...draft.sources,
                              [source]: {
                                ...config,
                                enabled: checked === true,
                                max: inRange(config.max, facts.maxLimit)
                                  ? config.max
                                  : facts.defaults.max,
                              },
                            },
                          })
                        }
                        className="mt-0.5"
                      />
                      <Label
                        id={labelId}
                        htmlFor={sourceId}
                        className="leading-snug"
                      >
                        {t(`sources.${source}`)}
                      </Label>
                    </div>
                    <p
                      id={sourceHelpId}
                      className="text-muted-foreground text-sm"
                    >
                      {t(`sourceHelp.${source}`)}
                    </p>
                    {helpId && (
                      <p id={helpId} className="text-muted-foreground text-sm">
                        <Link
                          href={magazineSettingsPath(slug)}
                          className="underline underline-offset-4"
                        >
                          {t("addTopics")}
                        </Link>
                      </p>
                    )}
                  </div>
                  {facts.maxLimit > 1 && (
                    <div className="flex items-center gap-2">
                      <Label id={upToId} htmlFor={`${sourceId}-max`}>
                        {t.rich("upTo", {
                          comma: (chunks) => (
                            <span className="sr-only">{chunks}</span>
                          ),
                        })}
                      </Label>
                      <Input
                        id={`${sourceId}-max`}
                        type="number"
                        min={1}
                        max={sourceMaxLimit(source)}
                        step={1}
                        value={Number.isFinite(config.max) ? config.max : ""}
                        required
                        aria-invalid={maxInvalid || undefined}
                        disabled={disabled || !config.enabled}
                        aria-labelledby={`${upToId} ${labelId}`}
                        aria-describedby={
                          [helpId, maxErrorId].filter(Boolean).join(" ") ||
                          undefined
                        }
                        onChange={(event) =>
                          update({
                            sources: {
                              ...draft.sources,
                              [source]: {
                                ...config,
                                max: event.target.valueAsNumber,
                              },
                            },
                          })
                        }
                        className="w-20 font-mono"
                      />
                    </div>
                  )}
                  {maxErrorId && (
                    <p
                      id={maxErrorId}
                      className="text-destructive w-full text-sm"
                    >
                      {t("numberRange", { max: sourceMaxLimit(source) })}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </fieldset>
        <fieldset>
          <legend className="sr-only">{t("neverReuse")}</legend>
          <div className="flex items-start gap-2">
            <Checkbox
              id={`${id}-never-reuse`}
              tone="ink"
              disabled={disabled}
              checked={draft.neverReuse}
              onCheckedChange={(checked) =>
                update({ neverReuse: checked === true })
              }
              className="mt-0.5"
            />
            <Label htmlFor={`${id}-never-reuse`} className="leading-snug">
              {t("neverReuse")}
            </Label>
          </div>
        </fieldset>
        <fieldset className="min-w-0 space-y-4">
          <legend className="mb-3 text-base font-semibold">
            {t("draftsLookLike")}
          </legend>
          <div className="grid gap-4 @sm:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <Label htmlFor={`${id}-layout`}>{t("layout")}</Label>
              <select
                id={`${id}-layout`}
                className={selectClass}
                value={draft.layout}
                onChange={(event) =>
                  update({ layout: event.target.value as Draft["layout"] })
                }
              >
                {ISSUE_LAYOUTS.map((layout) => (
                  <option key={layout} value={layout}>
                    {t(`layouts.${layout}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor={`${id}-visibility`}>{t("visibility")}</Label>
              <select
                id={`${id}-visibility`}
                className={selectClass}
                value={draft.visibility ?? "inherit"}
                onChange={(event) => {
                  setConfirmed(false);
                  update({
                    visibility:
                      event.target.value === "inherit"
                        ? null
                        : (event.target.value as Draft["visibility"]),
                  });
                }}
              >
                <option value="inherit">
                  {t("inheritVisibility", {
                    current: t(
                      `visibilities.${data.magazineDefaultVisibility ?? "members"}`,
                    ),
                  })}
                </option>
                {ISSUE_VISIBILITIES.map((visibility) => (
                  <option key={visibility} value={visibility}>
                    {t(`visibilities.${visibility}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {optInRequired && (
            <PublicOptIn
              communityIsPrivate={data.communityIsPrivate}
              value={draft.visibility!}
              confirmed={confirmed}
              onConfirmedChange={setConfirmed}
            />
          )}
        </fieldset>
        <fieldset className="space-y-3">
          <legend className="mb-3 text-base font-semibold">
            {t("whenReady")}
          </legend>
          {AUTO_DRAFT_WHEN_READY.map((whenReady) => (
            <div key={whenReady} className="flex items-start gap-2">
              <input
                id={`${id}-when-ready-${whenReady}`}
                type="radio"
                className={`${radioClass} mt-0.5`}
                name={`${id}-when-ready`}
                checked={draft.whenReady === whenReady}
                aria-describedby={readyHelpId}
                onChange={() =>
                  update({
                    whenReady,
                    autoPublishDays: inRange(
                      draft.autoPublishDays,
                      AUTO_PUBLISH_DAYS_MAX,
                    )
                      ? draft.autoPublishDays
                      : saved.autoPublishDays,
                  })
                }
              />
              <Label
                htmlFor={`${id}-when-ready-${whenReady}`}
                className="leading-snug"
              >
                {t(`whenReadyOptions.${whenReady}`, {
                  days: inRange(draft.autoPublishDays, AUTO_PUBLISH_DAYS_MAX)
                    ? draft.autoPublishDays
                    : saved.autoPublishDays,
                })}
              </Label>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3">
            <Label htmlFor={`${id}-publish-days`}>{t("autoPublishDays")}</Label>
            <Input
              id={`${id}-publish-days`}
              type="number"
              min={1}
              max={AUTO_PUBLISH_DAYS_MAX}
              step={1}
              value={
                Number.isFinite(draft.autoPublishDays)
                  ? draft.autoPublishDays
                  : ""
              }
              required
              aria-invalid={
                !inRange(draft.autoPublishDays, AUTO_PUBLISH_DAYS_MAX) ||
                undefined
              }
              disabled={disabled || draft.whenReady !== "auto_publish"}
              aria-describedby={[
                readyHelpId,
                !inRange(draft.autoPublishDays, AUTO_PUBLISH_DAYS_MAX)
                  ? `${id}-days-error`
                  : null,
              ]
                .filter(Boolean)
                .join(" ")}
              onChange={(event) =>
                update({ autoPublishDays: event.target.valueAsNumber })
              }
              className="w-20 font-mono"
            />
          </div>
          {!inRange(draft.autoPublishDays, AUTO_PUBLISH_DAYS_MAX) && (
            <p id={`${id}-days-error`} className="text-destructive text-sm">
              {t("numberRange", { max: AUTO_PUBLISH_DAYS_MAX })}
            </p>
          )}
          <p
            id={readyHelpId}
            className="text-muted-foreground max-w-prose text-sm"
          >
            {t("whenReadyHelp")}
          </p>
        </fieldset>
      </fieldset>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <p role="status" className="text-sm">
        {savedMessage ? t("saved") : null}
      </p>
      {data.canManage && (
        <Button type="submit" variant="default" disabled={!canSave}>
          {t("save")}
        </Button>
      )}
    </form>
  );
}
