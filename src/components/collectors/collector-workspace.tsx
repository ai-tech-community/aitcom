"use client";

import * as React from "react";
import { ChevronDownIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { PasteBox } from "@/components/collectors/paste-box";
import {
  SectionBody,
  type SectionStatus,
  statusFromQueries,
} from "@/components/dashboard/dashboard-section";
import { Link, usePathname } from "@/i18n/navigation";
import { PRESET_GROUPS, type PresetGroup } from "@/lib/collectors/presets";
import { startHref } from "@/lib/collectors/start-address";
import { cn } from "@/lib/utils";
import { COLLECTOR_ABOUT_PATH } from "@/server/collectors/identity";
import { api, type RouterOutputs } from "@/trpc/react";

type Preset = RouterOutputs["collectors"]["overview"]["presets"][number];

export type WorkspaceEntry =
  | { kind: "home" }
  | { kind: "runs" }
  | { kind: "preset"; presetId: string };

const BASE = "/dashboard/collectors";

function decoded(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** Which rail entry a collector page belongs to. Run pages belong to My runs. */
export function activeEntry(pathname: string): WorkspaceEntry {
  const rest = pathname.startsWith(BASE) ? pathname.slice(BASE.length) : "";
  if (rest === "/runs" || rest.startsWith("/runs/")) return { kind: "runs" };
  const start = /^\/new\/([^/]+)\/?$/.exec(rest);
  if (start) return { kind: "preset", presetId: decoded(start[1]!) };
  return { kind: "home" };
}

/** Presets by rail group, in rail order (custom last), empty groups left out. */
export function railGroups<P extends { group: PresetGroup }>(
  presets: readonly P[],
): { group: PresetGroup; presets: P[] }[] {
  return PRESET_GROUPS.map((group) => ({
    group,
    presets: presets.filter((p) => p.group === group),
  })).filter((g) => g.presets.length > 0);
}

function RailLink({
  href,
  current,
  children,
}: {
  href: string;
  current: boolean;
  children: React.ReactNode;
}) {
  // Active is ink plus weight and a bed (DESIGN.md: the Start run button
  // keeps the screen's one orange).
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={cn(
        "focus-visible:ring-ring/50 block rounded-md px-3 py-1.5 text-sm transition-colors outline-none focus-visible:ring-[3px]",
        current
          ? "bg-secondary text-foreground font-medium"
          : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

function RailGroup({
  group,
  presets,
  active,
}: {
  group: PresetGroup;
  presets: Preset[];
  active: WorkspaceEntry;
}) {
  const t = useTranslations("collectors.workspace");
  const labelId = React.useId();
  // The Custom page group has no label, so it has no message key.
  const label = group === "custom" ? null : t(`group.${group}`);
  const labelled = label !== null;
  return (
    <div
      className={cn(
        "flex flex-col gap-1",
        !labelled && "border-border border-t pt-3",
      )}
    >
      {labelled ? (
        <p
          id={labelId}
          className="text-muted-foreground px-3 text-xs font-medium"
        >
          {label}
        </p>
      ) : null}
      <ul
        aria-labelledby={labelled ? labelId : undefined}
        className="flex flex-col gap-0.5"
      >
        {presets.map((p) => (
          <li key={p.id}>
            <RailLink
              href={startHref(p.id)}
              current={active.kind === "preset" && active.presetId === p.id}
            >
              {p.title}
            </RailLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The rail's list. Only the presets wait on the overview query: "My runs"
 * is a fixed route, so it stays reachable while the sites load or fail.
 */
function RailList({
  presets,
  status,
  active,
}: {
  presets: readonly Preset[];
  status: SectionStatus;
  active: WorkspaceEntry;
}) {
  const t = useTranslations("collectors.workspace");
  return (
    <div className="flex flex-col gap-3">
      <SectionBody status={status} size="compact">
        <div className="flex flex-col gap-3">
          {railGroups(presets).map(({ group, presets: members }) => (
            <RailGroup
              key={group}
              group={group}
              presets={members}
              active={active}
            />
          ))}
        </div>
      </SectionBody>
      <div className="border-border border-t pt-3">
        <RailLink href={`${BASE}/runs`} current={active.kind === "runs"}>
          {t("myRuns")}
        </RailLink>
      </div>
    </div>
  );
}

/**
 * The collector workspace (spec "Collector workspace"): one persistent left
 * rail — paste box, presets by group, Custom page last, My runs — beside the
 * page. Mounted once by `collectors/layout.tsx`, so the rail keeps its state
 * while the member moves between pages. Below `lg` the list folds into a
 * disclosure picker above the page.
 */
export function CollectorWorkspace({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = useTranslations("collectors");
  const locale = useLocale() === "nl" ? "nl" : "en";
  const pathname = usePathname();
  const active = activeEntry(pathname);
  const overview = api.collectors.overview.useQuery({ locale });
  const presets = overview.data?.presets ?? [];
  const status = statusFromQueries(overview);
  const currentLabel =
    active.kind === "runs"
      ? t("workspace.myRuns")
      : active.kind === "preset"
        ? (presets.find((p) => p.id === active.presetId)?.title ??
          t("workspace.pickerNone"))
        : t("workspace.pickerNone");

  return (
    <div className="grid gap-8 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-5 lg:sticky lg:top-24 lg:self-start">
        <PasteBox />

        <nav
          aria-label={t("workspace.railLabel")}
          data-slot="rail-wide"
          className="hidden lg:block"
        >
          <RailList presets={presets} status={status} active={active} />
        </nav>

        {/* Keyed by page, so it folds shut after each choice. */}
        <details
          key={pathname}
          data-slot="rail-picker"
          className="border-border rounded-md border lg:hidden"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm [&::-webkit-details-marker]:hidden">
            <span className="min-w-0 truncate">
              <span className="text-muted-foreground">
                {t("workspace.picker")}{" "}
              </span>
              <span className="font-medium">{currentLabel}</span>
            </span>
            <ChevronDownIcon aria-hidden="true" className="size-4 shrink-0" />
          </summary>
          <nav
            aria-label={t("workspace.railLabel")}
            className="border-border border-t p-2"
          >
            <RailList presets={presets} status={status} active={active} />
          </nav>
        </details>

        {overview.data ? (
          <div className="border-border flex flex-col gap-1.5 border-t pt-3 text-[13px]">
            <span className="text-muted-foreground font-mono text-xs">
              {t("usage", {
                used: overview.data.usage.runsToday,
                limit: overview.data.usage.runsPerDay,
              })}
            </span>
            <Link
              href={COLLECTOR_ABOUT_PATH}
              className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
            >
              {t("aboutLink")}
            </Link>
          </div>
        ) : null}
      </div>

      <div className="min-w-0">{children}</div>
    </div>
  );
}
