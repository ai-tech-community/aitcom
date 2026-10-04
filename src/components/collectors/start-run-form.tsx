"use client";

import * as React from "react";
import { ChevronDownIcon, CircleAlertIcon, InfoIcon } from "lucide-react";
import { useFormatter, useLocale, useNow, useTranslations } from "next-intl";

import {
  FIELD_REJECTION_KEYS,
  FIELD_RENDERERS,
} from "@/components/collectors/field-renderers";
import {
  SectionBody,
  statusFromQueries,
} from "@/components/dashboard/dashboard-section";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { Link, useRouter } from "@/i18n/navigation";
import {
  coerceInput,
  type FieldValue,
  type FormField,
  formFieldsFor,
  initialValue,
} from "@/lib/collectors/form-fields";
import {
  type PlacedProblems,
  placeProblems,
  problemCopy,
} from "@/lib/collectors/input-problems";
import {
  hasProblemIn,
  presetInitialValues,
  splitFields,
} from "@/lib/collectors/preset-form";
import { mainInput } from "@/lib/collectors/run-name";
import { cn } from "@/lib/utils";
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

const NO_FIELDS: FormField[] = [];
const NO_ASK: string[] = [];
const NO_BASE: Record<string, unknown> = {};

export type StartRunFormProps = {
  presetId: string;
  /** Values from a pasted link, by input field name. */
  prefill: Record<string, string>;
  /** The paste was recognised as this preset (not the Custom page fallback). */
  recognised: boolean;
};

/**
 * One start of a preset as a stable string: the preset and its start query,
 * prefill entries in name order. Equal values give an equal key, whatever
 * object they arrive in.
 */
function startKey({ presetId, prefill, recognised }: StartRunFormProps) {
  const entries = Object.entries(prefill).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  return JSON.stringify([presetId, recognised, entries]);
}

/** Where focus goes after a refused start (a new object for every refusal). */
type FocusTarget = { kind: "field"; name: string } | { kind: "alert" };

/**
 * A preset's start page. The workspace layout stays mounted and Next reuses
 * this page between presets and between pastes (a new paste changes only the
 * query), so the form is keyed by preset and start query: a new preset or a
 * new paste starts afresh, typed values and old problems included. The same
 * start handed in again (a server refresh, a new but equal prefill object)
 * keeps the key, so nothing the member typed is lost.
 */
export function StartRunForm(props: StartRunFormProps) {
  return <PresetStart key={startKey(props)} {...props} />;
}

function PresetStart({
  presetId,
  prefill: givenPrefill,
  recognised,
}: StartRunFormProps) {
  // The prefill this start opened with. A new prefill with other values
  // changes the key (a new form); an equal one in a new object must not
  // remake the starting values, whose rows carry ids.
  const [prefill] = React.useState(givenPrefill);
  const t = useTranslations("collectors");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const router = useRouter();
  const locale = useLocale() === "nl" ? "nl" : "en";
  const overview = api.collectors.overview.useQuery({ locale });
  const data = overview.data;
  const preset = data?.presets.find((p) => p.id === presetId);
  const collector = preset
    ? data?.collectors.find((c) => c.id === preset.collectorId)
    : undefined;
  const fields = React.useMemo(
    () =>
      preset && collector
        ? formFieldsFor({
            fields: preset.fields,
            inputJsonSchema: collector.inputJsonSchema,
          })
        : null,
    [preset, collector],
  );
  const formFields = fields?.ok ? fields.fields : NO_FIELDS;
  const ask = preset?.ask ?? NO_ASK;
  const base = preset?.base ?? NO_BASE;
  const { asked, settings } = React.useMemo(
    () => splitFields(formFields, ask),
    [formFields, ask],
  );
  // Made once per form: a rows field's starting rows carry ids, and new ids
  // on every render would remount their inputs.
  const initialValues = React.useMemo(
    () => presetInitialValues(formFields, base, prefill),
    [formFields, base, prefill],
  );

  const [values, setValues] = React.useState<Record<string, FieldValue>>({});
  const [acknowledged, setAcknowledged] = React.useState(false);
  const [placed, setPlaced] = React.useState<PlacedProblems | null>(null);
  const [problem, setProblem] = React.useState<Problem | null>(null);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [focusTarget, setFocusTarget] = React.useState<FocusTarget | null>(
    null,
  );
  const fieldAreas = React.useRef(new Map<string, HTMLElement>());
  const alertRef = React.useRef<HTMLDivElement>(null);
  const settingsId = React.useId();
  // What the last start sent: the server names rows by their place in it.
  const sent = React.useRef<Record<string, FieldValue> | null>(null);

  const valueOf = (field: FormField): FieldValue =>
    values[field.name] ?? initialValues[field.name] ?? initialValue(field);
  const currentValues = () =>
    Object.fromEntries(formFields.map((f) => [f.name, valueOf(f)]));

  const start = api.collectors.start.useMutation({
    onSuccess: (result: StartResult) => {
      if (result.ok) {
        router.push(`/dashboard/collectors/runs/${result.runId}`);
        return;
      }
      const where = placeProblems(
        formFields,
        sent.current ?? currentValues(),
        result.fieldErrors ?? {},
      );
      setPlaced(where);
      // A refused value behind "Show settings" must not stay hidden.
      if (hasProblemIn(settings, where)) setSettingsOpen(true);
      setProblem(problemOf(result));
      const first = [...asked, ...settings].find((f) =>
        hasProblemIn([f], where),
      );
      setFocusTarget(
        first ? { kind: "field", name: first.name } : { kind: "alert" },
      );
    },
    onError: (error) => {
      // The server saw no earlier run, but this screen did not ask for the
      // first-use note: reload so the note (and its checkbox) shows up.
      if (error.message === "ACKNOWLEDGEMENT_REQUIRED") void overview.refetch();
      setProblem({ kind: "failed" });
      setFocusTarget({ kind: "alert" });
    },
  });

  // After a refused start, take the member to what needs fixing: the first
  // refused field (its refused input, else its first input), else the alert.
  // Runs after the render that placed the problems and opened the settings.
  React.useEffect(() => {
    if (!focusTarget) return;
    const area =
      focusTarget.kind === "field"
        ? fieldAreas.current.get(focusTarget.name)
        : undefined;
    const target =
      area?.querySelector<HTMLElement>('[aria-invalid="true"]') ??
      area?.querySelector<HTMLElement>("input, textarea, select") ??
      alertRef.current;
    target?.focus();
  }, [focusTarget]);

  const needsAck = data?.needsAcknowledgement ?? false;
  const runsPerDay = data?.usage.runsPerDay ?? 0;

  /** A server problem in words: its own, else the field's general note. */
  function problemWords(code: string | undefined, field: FormField) {
    if (code === undefined) return null;
    const copy = problemCopy(code);
    return copy
      ? t(copy.key, copy.values)
      : t(FIELD_REJECTION_KEYS[field.kind]);
  }

  function cellErrorsOf(field: FormField) {
    const rows = placed?.cells[field.name];
    if (!rows) return undefined;
    return Object.fromEntries(
      Object.entries(rows).map(([rowId, columns]) => [
        rowId,
        Object.fromEntries(
          Object.entries(columns).map(([column, codes]) => [
            column,
            problemWords(codes[0], field) ?? "",
          ]),
        ),
      ]),
    );
  }

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

  function renderField(field: FormField) {
    const Render = FIELD_RENDERERS[field.kind];
    return (
      // A layout-free wrapper: lets focus find this field's inputs.
      <div
        key={field.name}
        className="contents"
        ref={(node) => {
          if (node) fieldAreas.current.set(field.name, node);
          else fieldAreas.current.delete(field.name);
        }}
      >
        <Render
          field={field}
          id={`field-${field.name}`}
          value={valueOf(field)}
          error={problemWords(placed?.fields[field.name]?.[0], field)}
          cellErrors={cellErrorsOf(field)}
          onChange={(v) => setValues((prev) => ({ ...prev, [field.name]: v }))}
        />
      </div>
    );
  }

  const backToList = (
    <Button asChild variant="outline">
      <Link href="/dashboard/collectors">{t("start.backToList")}</Link>
    </Button>
  );

  const detail = preset ? mainInput(prefill, preset.ask[0]) : null;

  return (
    <SectionBody
      status={statusFromQueries(overview, { isEmpty: !preset || !collector })}
      empty={<EmptyState title={t("start.notFound")} action={backToList} />}
    >
      {!preset || !collector ? null : !fields?.ok ? (
        <EmptyState title={t("start.unsupported")} action={backToList} />
      ) : (
        <div className="flex max-w-3xl flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-semibold tracking-tight">
              {preset.title}
            </h2>
            <p className="text-muted-foreground max-w-prose text-[15px] leading-relaxed">
              {preset.summary}
            </p>
            {recognised ? (
              <p className="text-sm">
                {detail
                  ? t.rich("start.recognisedDetail", {
                      name: preset.title,
                      detail,
                      address: (chunks) => (
                        <span className="font-mono text-[13px]">{chunks}</span>
                      ),
                    })
                  : t("start.recognised", { name: preset.title })}{" "}
                <Link
                  href="/dashboard/collectors"
                  className="font-medium underline underline-offset-4"
                >
                  {t("start.pickAnother")}
                </Link>
              </p>
            ) : null}
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
                <h3
                  id="collectors-first-use"
                  className="text-[15px] font-semibold"
                >
                  {t("start.firstUseTitle")}
                </h3>
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
              setPlaced(null);
              setProblem(null);
              sent.current = currentValues();
              start.mutate({
                presetId,
                input: coerceInput(formFields, sent.current),
                acknowledged,
              });
            }}
          >
            {asked.map(renderField)}

            {settings.length > 0 ? (
              <div className="flex flex-col gap-5">
                <div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-expanded={settingsOpen}
                    aria-controls={settingsId}
                    onClick={() => setSettingsOpen((open) => !open)}
                  >
                    <ChevronDownIcon
                      aria-hidden="true"
                      className={cn(
                        "transition-transform motion-reduce:transition-none",
                        settingsOpen && "rotate-180",
                      )}
                    />
                    {settingsOpen
                      ? t("start.hideSettings")
                      : t("start.showSettings")}
                  </Button>
                </div>
                <div
                  id={settingsId}
                  hidden={!settingsOpen}
                  className="flex flex-col gap-5"
                >
                  {settings.map(renderField)}
                </div>
              </div>
            ) : null}

            <p className="text-muted-foreground border-border border-t pt-4 font-mono text-xs">
              {t("start.limits", {
                items: format.number(collector.limits.maxItems),
                pages: collector.limits.maxPages,
                seconds: Math.round(collector.limits.maxDurationMs / 1000),
                perDay: runsPerDay,
              })}
            </p>

            {problem ? (
              <Alert ref={alertRef} tabIndex={-1} variant="destructive">
                <CircleAlertIcon aria-hidden="true" />
                <AlertDescription>{problemMessage(problem)}</AlertDescription>
              </Alert>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {/* The screen's one orange action (DESIGN.md One Voice Rule). */}
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
    </SectionBody>
  );
}
