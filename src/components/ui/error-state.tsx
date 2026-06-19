"use client";

import * as React from "react";
import { AlertTriangleIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type ErrorStateProps = {
  /** Short headline. Defaults to a generic load-failure line. */
  title?: React.ReactNode;
  /** One line explaining what to do. */
  description?: React.ReactNode;
  /** Retry handler — typically a tRPC query's `refetch`. */
  onRetry?: () => void;
  /** Retry button label. */
  retryLabel?: React.ReactNode;
  className?: string;
};

/**
 * Consistent inline error state with recovery. Use anywhere a data fetch can
 * fail — never let a failed query fall through to a silent empty/`null`, which
 * makes "failed to load" indistinguishable from "nothing here". The alert icon
 * is the non-color cue paired with the destructive accent.
 */
function ErrorState({
  title,
  description,
  onRetry,
  retryLabel,
  className,
}: ErrorStateProps) {
  const t = useTranslations("common");
  const heading = title ?? t("errorTitle");
  const desc = description ?? t("errorDescription");
  return (
    <div
      role="alert"
      data-slot="error-state"
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-12 text-center",
        className,
      )}
    >
      <AlertTriangleIcon
        className="text-destructive size-8"
        aria-hidden="true"
      />
      <div className="space-y-1">
        <p className="text-foreground text-sm font-medium">{heading}</p>
        {desc && (
          <p className="text-muted-foreground mx-auto max-w-prose text-sm">
            {desc}
          </p>
        )}
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          {retryLabel ?? t("retry")}
        </Button>
      )}
    </div>
  );
}

export { ErrorState };
