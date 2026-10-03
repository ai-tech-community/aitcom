"use client";

import * as React from "react";
import { CircleAlertIcon, InfoIcon } from "lucide-react";
import { useFormatter, useLocale, useNow, useTranslations } from "next-intl";

import {
  FIELD_REJECTION_KEYS,
  FIELD_RENDERERS,
} from "@/components/collectors/field-renderers";
import {
  DashboardSection,
  statusFromQueries,
} from "@/components/dashboard/dashboard-section";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { Link, useRouter } from "@/i18n/navigation";
import {
  coerceInput,
  type FieldValue,
  formFieldsFor,
} from "@/lib/collectors/form-fields";
import { api, type RouterOutputs } from "@/trpc/react";

type StartResult = RouterOutputs["collectors"]["start"];
type QuotaReason = NonNullable<
  Extract<StartResult, { ok: false }>["quotaReason"]
>;

/**
 * Why the last start did not go through. Kept as data, not as a sentence, so
 * the message is written at render time (the relative "in 3 hours" stays
 * current while the member waits on the page).
 */
type Problem =
  | { kind: "fields" }
  | { kind: "quota"; reason: QuotaReason; retryAt: string | null }
  | { kind: "unavailable" }
  | { kind: "failed" };

function problemOf(result: Extract<StartResult, { ok: false }>): Problem {
  switch (result.reason) {
    case "invalid_input":
      return { kind: "fields" };
    case "quota":
      return {
        kind: "quota",
        reason: result.quotaReason ?? "platform_busy",
        retryAt: result.retryAt ?? null,
      };
    case "disabled":
    case "unknown_collector":
      return { kind: "unavailable" };
  }
}

/** The start-a-run screen: one collector's form, drawn from its schema. */
export function StartRunForm({ collectorId }: { collectorId: string }) {
  const t = useTranslations("collectors");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const router = useRouter();
  const locale = useLocale() === "nl" ? "nl" : "en";
  const overview = api.collectors.overview.useQuery({ locale });
  const data = overview.data;
  const collector = data?.collectors.find((c) => c.id === collectorId);
  const fields = collector ? formFieldsFor(collector) : null;

  const [values, setValues] = React.useState<Record<string, FieldValue>>({});
  const [acknowledged, setAcknowledged] = React.useState(false);
  const [rejected, setRejected] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [problem, setProblem] = React.useState<Problem | null>(null);

  const start = api.collectors.start.useMutation({
    onSuccess: (result: StartResult) => {
      if (result.ok) {
        router.push(`/dashboard/collectors/runs/${result.runId}`);
        return;
      }
      setRejected(new Set(Object.keys(result.fieldErrors ?? {})));
      setProblem(problemOf(result));
    },
    onError: (error) => {
      // The server saw no earlier run, but this screen did not ask for the
      // first-use note: reload so the note (and its checkbox) shows up.
      if (error.message === "ACKNOWLEDGEMENT_REQUIRED") void overview.refetch();
      setProblem({ kind: "failed" });
    },
  });

  const needsAck = data?.needsAcknowledgement ?? false;
  const runsPerDay = data?.usage.runsPerDay ?? 0;

  function problemMessage(p: Problem): string {
    switch (p.kind) {
      case "fields":
        return t("start.fixFields");
      case "quota":
        return p.reason === "daily_limit" && p.retryAt
          ? t("start.quota.daily_limit_retry", {
              limit: runsPerDay,
              when: format.relativeTime(new Date(p.retryAt), now),
            })
          : t(`start.quota.${p.reason}`, { limit: runsPerDay });
      case "unavailable":
        return t("start.notFound");
      case "failed":
        return t("start.failed");
    }
  }

  const backToList = (
    <Button asChild variant="outline">
      <Link href="/dashboard/collectors">{t("start.backToList")}</Link>
    </Button>
  );

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-2 text-[13px]"
      >
        <Link
          href="/dashboard/collectors"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          {t("breadcrumb.collectors")}
        </Link>
        <span aria-hidden="true" className="text-muted-foreground">
          /
        </span>
        <span aria-current="page" className="text-foreground/80 truncate">
          {collector?.title ?? collectorId}
        </span>
      </nav>

      <DashboardSection
        title={t("title")}
        status={statusFromQueries(overview, { isEmpty: !collector })}
        empty={<EmptyState title={t("start.notFound")} action={backToList} />}
      >
        {!collector ? null : !fields?.ok ? (
          <EmptyState title={t("start.unsupported")} action={backToList} />
        ) : (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2.5">
                <h3 className="text-2xl font-semibold tracking-tight">
                  {collector.title}
                </h3>
                <Badge variant="secondary">{t(`kind.${collector.kind}`)}</Badge>
              </div>
              <p className="text-muted-foreground max-w-prose text-[15px] leading-relaxed">
                {collector.description}
              </p>
            </div>

            {needsAck ? (
              <section
                aria-labelledby="collectors-first-use"
                className="bg-sidebar border-border flex flex-col gap-3 rounded-xl border px-6 py-5"
              >
                <div className="flex items-center gap-2.5">
                  <InfoIcon
                    aria-hidden="true"
                    className="text-info size-[18px]"
                  />
                  <h4
                    id="collectors-first-use"
                    className="text-[15px] font-semibold"
                  >
                    {t("start.firstUseTitle")}
                  </h4>
                </div>
                <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
                  <li>{t("start.firstUse1")}</li>
                  <li>{t("start.firstUse2")}</li>
                  <li>{t("start.firstUse3")}</li>
                  <li>{t("start.firstUse4")}</li>
                </ul>
                <div className="flex items-start gap-2.5 pt-1">
                  <Checkbox
                    id="collectors-acknowledge"
                    tone="ink"
                    checked={acknowledged}
                    onCheckedChange={(c) => setAcknowledged(c === true)}
                  />
                  <Label
                    htmlFor="collectors-acknowledge"
                    className="text-sm font-normal"
                  >
                    {t("start.acknowledge")}
                  </Label>
                </div>
              </section>
            ) : null}

            <form
              noValidate
              className="border-border flex flex-col gap-5 rounded-xl border p-6 shadow-sm"
              onSubmit={(e) => {
                e.preventDefault();
                setRejected(new Set());
                setProblem(null);
                start.mutate({
                  collectorId,
                  input: coerceInput(fields.fields, values),
                  acknowledged,
                });
              }}
            >
              {fields.fields.map((field) => {
                const Render = FIELD_RENDERERS[field.kind];
                return (
                  <Render
                    key={field.name}
                    field={field}
                    id={`field-${field.name}`}
                    value={
                      values[field.name] ??
                      (field.kind === "checkbox" ? false : "")
                    }
                    error={
                      rejected.has(field.name)
                        ? t(FIELD_REJECTION_KEYS[field.kind])
                        : null
                    }
                    onChange={(v) =>
                      setValues((prev) => ({ ...prev, [field.name]: v }))
                    }
                  />
                );
              })}

              <p className="text-muted-foreground border-border border-t pt-4 font-mono text-xs">
                {t("start.limits", {
                  items: format.number(collector.limits.maxItems),
                  pages: collector.limits.maxPages,
                  seconds: Math.round(collector.limits.maxDurationMs / 1000),
                  perDay: runsPerDay,
                })}
              </p>

              {problem ? (
                <Alert variant="destructive">
                  <CircleAlertIcon aria-hidden="true" />
                  <AlertDescription>{problemMessage(problem)}</AlertDescription>
                </Alert>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button
                  type="submit"
                  disabled={start.isPending || (needsAck && !acknowledged)}
                >
                  {start.isPending ? t("start.submitting") : t("start.submit")}
                </Button>
                <Button asChild variant="ghost">
                  <Link href="/dashboard/collectors">{t("start.cancel")}</Link>
                </Button>
              </div>
            </form>
          </div>
        )}
      </DashboardSection>
    </div>
  );
}
