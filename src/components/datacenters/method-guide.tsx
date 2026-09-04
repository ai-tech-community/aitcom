import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { SectionLabel } from "@/components/ui/section-label";
import {
  CARBON_FREE_POWER_SOURCES,
  GREENWASH_GAP_FLAG_WHEN,
  GREENWASH_GAP_FORMULA,
  GREENWASH_GAP_MW,
  GREENWASH_GAP_SOURCE,
  LIVE_INVESTIGATION_PATH,
  NO_POWER_SOURCE_FORMULA,
  NO_POWER_SOURCE_TABLE,
  SUBSIDY_PER_JOB_APPLIES,
  SUBSIDY_PER_JOB_FORMULA,
  SUBSIDY_PER_JOB_SOURCE,
} from "@/lib/investigations/datacenter-flag-method";

export type DatacenterMethodKey =
  | "kicker"
  | "title"
  | "lead"
  | "disclaimerLead"
  | "disclaimerBody"
  | "backLink"
  | "liveLink"
  | "rulesNotCounts"
  | "subsidyTitle"
  | "subsidyWarrants"
  | "subsidyBody"
  | "subsidyAppliesLabel"
  | "powerTitle"
  | "powerWarrants"
  | "powerBody"
  | "greenwashTitle"
  | "greenwashWarrants"
  | "greenwashBody"
  | "greenwashFlagWhenLabel"
  | "greenwashUniverse"
  | "formulaLabel"
  | "sourceLabel"
  | "sourcesKicker"
  | "sourcesBody"
  | "citeNote";

export function MethodGuide({
  t,
}: {
  t: (key: DatacenterMethodKey) => string;
}) {
  return (
    <main className="mx-auto max-w-6xl px-6 py-16 sm:px-12">
      <nav className="text-muted-foreground text-xs">
        <Link
          href={LIVE_INVESTIGATION_PATH}
          className="hover:text-foreground hover:underline"
        >
          ← {t("backLink")}
        </Link>
      </nav>

      <SectionLabel as="div" className="mt-8">
        {t("kicker")}
      </SectionLabel>

      <div className="mt-8 max-w-2xl space-y-4">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {t("title")}
        </h1>
        <p className="text-muted-foreground text-lg leading-relaxed">
          {t("lead")}
        </p>
      </div>

      <div className="border-border bg-warning/10 mt-8 max-w-2xl rounded-md border border-dashed p-3 text-xs leading-relaxed">
        <strong className="text-warning">{t("disclaimerLead")}</strong>{" "}
        {t("disclaimerBody")}
      </div>

      <FlagSection
        title={t("subsidyTitle")}
        warrants={t("subsidyWarrants")}
        body={t("subsidyBody")}
        formulaLabel={t("formulaLabel")}
        formula={SUBSIDY_PER_JOB_FORMULA}
        sourceLabel={t("sourceLabel")}
        source={SUBSIDY_PER_JOB_SOURCE}
      >
        <p className="text-muted-foreground text-sm leading-relaxed">
          {t("subsidyAppliesLabel")}
        </p>
        <FormulaBlock value={SUBSIDY_PER_JOB_APPLIES} />
      </FlagSection>

      <FlagSection
        title={t("powerTitle")}
        warrants={t("powerWarrants")}
        body={t("powerBody")}
        formulaLabel={t("formulaLabel")}
        formula={NO_POWER_SOURCE_FORMULA}
        sourceLabel={t("sourceLabel")}
        source={NO_POWER_SOURCE_TABLE}
      />

      <FlagSection
        title={t("greenwashTitle")}
        warrants={t("greenwashWarrants")}
        body={t("greenwashBody")}
        formulaLabel={t("formulaLabel")}
        formula={GREENWASH_GAP_FORMULA}
        sourceLabel={t("sourceLabel")}
        source={GREENWASH_GAP_SOURCE}
      >
        <p className="text-muted-foreground text-sm leading-relaxed">
          {t("greenwashFlagWhenLabel")}
        </p>
        <FormulaBlock value={GREENWASH_GAP_FLAG_WHEN} />
        <p className="text-muted-foreground text-sm leading-relaxed">
          {t("greenwashUniverse")} {GREENWASH_GAP_MW}.{" "}
          {CARBON_FREE_POWER_SOURCES.join(", ")}.
        </p>
      </FlagSection>

      <section className="mt-16 max-w-2xl space-y-4">
        <SectionLabel>{t("sourcesKicker")}</SectionLabel>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {t("sourcesBody")}
        </p>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {t("rulesNotCounts")}
        </p>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {t("citeNote")}
        </p>
        <Link
          href={LIVE_INVESTIGATION_PATH}
          className="text-foreground text-sm font-medium underline-offset-4 hover:underline"
        >
          {t("liveLink")}
        </Link>
      </section>
    </main>
  );
}

function FlagSection({
  title,
  warrants,
  body,
  formulaLabel,
  formula,
  sourceLabel,
  source,
  children,
}: {
  title: string;
  warrants: string;
  body: string;
  formulaLabel: string;
  formula: string;
  sourceLabel: string;
  source: string;
  children?: ReactNode;
}) {
  return (
    <section className="border-border mt-12 max-w-2xl space-y-4 rounded-xl border p-6 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-muted-foreground font-mono text-xs tracking-wider uppercase">
          → <span>{warrants}</span>
        </p>
      </div>
      <p className="text-muted-foreground text-sm leading-relaxed">{body}</p>
      <div>
        <p className="text-muted-foreground font-mono text-xs tracking-wider uppercase">
          {formulaLabel}
        </p>
        <FormulaBlock value={formula} />
      </div>
      {children}
      <p className="text-muted-foreground font-mono text-xs tracking-wider uppercase">
        {sourceLabel}{" "}
        <span className="tracking-normal normal-case">{source}</span>
      </p>
    </section>
  );
}

function FormulaBlock({ value }: { value: string }) {
  return (
    <pre className="bg-muted mt-1 overflow-x-auto rounded px-3 py-2 font-mono text-xs">
      <code>{value}</code>
    </pre>
  );
}
