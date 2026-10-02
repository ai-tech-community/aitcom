"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { ErrorState } from "@/components/ui/error-state";
import { SectionLabel } from "@/components/ui/section-label";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Where a dashboard section's data stands. A discriminated union so a retry
 * handler can only exist next to an error.
 */
export type SectionStatus =
  | { kind: "loading" }
  | { kind: "error"; retry?: () => void }
  | { kind: "empty" }
  | { kind: "ready" };

/** The slice of a tRPC / TanStack query result a section needs. */
export type SectionQuery = {
  data: unknown;
  isPending: boolean;
  isError: boolean;
  refetch: () => unknown;
};

const READY: SectionStatus = { kind: "ready" };

/**
 * Derive a section's status from one or more queries.
 *
 * - error: a query failed and has no data to show (a failed background
 *   refetch keeps showing the data it already has). Retry refetches only the
 *   failed queries. Error wins over loading so a failure is never hidden
 *   behind a skeleton that waits on a sibling query.
 * - loading: a query has no data yet.
 * - empty / ready: everything loaded; `isEmpty` is the caller's call, since
 *   only it knows what "nothing here" means for its data.
 */
export function statusFromQueries(
  queries: SectionQuery | readonly SectionQuery[],
  { isEmpty = false }: { isEmpty?: boolean } = {},
): SectionStatus {
  const list: readonly SectionQuery[] = Array.isArray(queries)
    ? queries
    : [queries as SectionQuery];

  const failed = list.filter((q) => q.isError && q.data === undefined);
  if (failed.length > 0) {
    return {
      kind: "error",
      retry: () => {
        for (const q of failed) void q.refetch();
      },
    };
  }
  if (list.some((q) => q.isPending)) return { kind: "loading" };
  return isEmpty ? { kind: "empty" } : READY;
}

type SectionBodyProps = {
  status: SectionStatus;
  /**
   * Shown when the status is `empty` — usually an `<EmptyState>` that teaches
   * the next action. Omit it and an empty section is not rendered at all
   * (for supplementary content that should stay out of the way).
   */
  empty?: React.ReactNode;
  /**
   * Supplementary content (DESIGN.md No-Silent-Failure Rule): a failed load
   * hides the section instead of showing an error. Core sections leave this
   * off so a failure stays distinguishable from "nothing here".
   */
  optional?: boolean;
  /** Content-shaped loading placeholder. Defaults to three text bars. */
  skeleton?: React.ReactNode;
  children?: React.ReactNode;
};

/** Whether a section with this status and configuration renders anything. */
function isHidden({
  status,
  empty,
  optional,
}: Pick<SectionBodyProps, "status" | "empty" | "optional">): boolean {
  if (status.kind === "empty") return empty === undefined || empty === null;
  if (status.kind === "error") return optional === true;
  return false;
}

function DefaultSkeleton() {
  return (
    <div className="space-y-2 py-2" data-slot="section-skeleton">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}

/**
 * The state switch on its own: skeleton, error with retry, empty, or the
 * content. `DashboardSection` uses it for its body; use it directly for a
 * sub-block that has its own heading inside a section.
 */
function SectionBody({
  status,
  empty,
  optional,
  skeleton,
  children,
}: SectionBodyProps) {
  if (isHidden({ status, empty, optional })) return null;

  switch (status.kind) {
    case "loading":
      return <div aria-busy="true">{skeleton ?? <DefaultSkeleton />}</div>;
    case "error":
      return <ErrorState className="px-0 py-6" onRetry={status.retry} />;
    case "empty":
      return <>{empty}</>;
    case "ready":
      return <>{children}</>;
  }
}

type DashboardSectionProps = Omit<SectionBodyProps, "status"> & {
  /** Defaults to `ready`, for a section whose content needs no fetch. */
  status?: SectionStatus;
  /** Section name, written in sentence case; the kicker uppercases it. */
  title: React.ReactNode;
  /** Optional control on the heading row (a link or small button). */
  action?: React.ReactNode;
  /**
   * `plain` for the main column (heading rule, no box); `card` for the side
   * panel (a flat, border-defined card).
   */
  variant?: "plain" | "card";
  className?: string;
};

/**
 * The one shell every dashboard section uses: a `/ KICKER` heading (`h2`), an
 * optional action, and a body that owns loading, error, empty and ready. A
 * section that has nothing to show (empty without `empty`, or an optional
 * section that failed) renders nothing at all, heading included.
 */
function DashboardSection({
  title,
  action,
  variant = "plain",
  className,
  status = READY,
  empty,
  optional,
  skeleton,
  children,
}: DashboardSectionProps) {
  const headingId = React.useId();
  if (isHidden({ status, empty, optional })) return null;

  return (
    <section
      aria-labelledby={headingId}
      data-slot="dashboard-section"
      data-variant={variant}
      className={cn(
        variant === "card" && "border-border bg-card rounded-xl border p-4",
        className,
      )}
    >
      <div className="border-border flex items-center justify-between gap-3 border-b pb-2">
        <SectionLabel id={headingId} bordered={false}>
          {title}
        </SectionLabel>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="mt-4">
        <SectionBody
          status={status}
          empty={empty}
          optional={optional}
          skeleton={skeleton}
        >
          {children}
        </SectionBody>
      </div>
    </section>
  );
}

export { DashboardSection, SectionBody };
export type { DashboardSectionProps, SectionBodyProps };
