"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useId, type ReactNode } from "react";

import { ErrorState } from "@/components/ui/error-state";
import { SectionLabel } from "@/components/ui/section-label";
import { Skeleton } from "@/components/ui/skeleton";

export type ListQuery = {
  isLoading: boolean;
  isError: boolean;
  refetch: () => unknown;
};

/** One desk list: its label, then rows, a skeleton, an error or a hint. */
export function DeskList({
  label,
  query,
  empty,
  children,
}: {
  label: string;
  query: ListQuery;
  /** The teaching line when the list is empty; null when it has rows. */
  empty: string | null;
  children: ReactNode;
}) {
  const t = useTranslations("magazineEditor.desk");
  const labelId = useId();
  return (
    <section aria-labelledby={labelId} className="flex min-w-0 flex-col gap-3">
      <SectionLabel as="h3" id={labelId}>
        {label}
      </SectionLabel>
      {query.isLoading ? (
        <div className="flex flex-col gap-2" aria-hidden="true">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : query.isError ? (
        <ErrorState
          className="items-start px-0 py-4 text-left"
          title={t("loadFailed")}
          description=""
          retryLabel={t("tryAgain")}
          onRetry={() => void query.refetch()}
        />
      ) : empty !== null ? (
        <p className="text-muted-foreground text-sm">{empty}</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">{children}</ul>
      )}
    </section>
  );
}

/** Mono date of the last change to a row. */
export function UpdatedAt({ value }: { value: string }) {
  const format = useFormatter();
  return (
    <time
      dateTime={value}
      className="text-muted-foreground shrink-0 font-mono text-xs"
    >
      {format.dateTime(new Date(value), { day: "numeric", month: "short" })}
    </time>
  );
}
