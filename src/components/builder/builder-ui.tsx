import { useTranslations } from "next-intl";
import type { ComponentProps, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRightIcon, ChevronDownIcon, type LucideIcon } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { SectionLabel } from "@/components/ui/section-label";
import { Skeleton } from "@/components/ui/skeleton";

export const builderControl =
  "min-h-11 sm:min-h-9 shadow-none motion-reduce:transition-none";
export const webhookGuideUrl =
  "https://github.com/ai-tech-community/aitcom/blob/main/docs/agents/realtime-webhooks.md";

export function BuilderPanel({
  id,
  label,
  title,
  description,
  icon: Icon,
  status,
  children,
}: {
  id: string;
  label?: string;
  title: string;
  description?: string;
  icon?: LucideIcon;
  status?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      aria-describedby={label ? `${id}-scope` : undefined}
      className="border-border scroll-mt-24 border-t py-5 sm:py-6"
    >
      {label && (
        <SectionLabel
          id={`${id}-scope`}
          as="p"
          bordered={false}
          className="mb-3"
        >
          {label}
        </SectionLabel>
      )}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2
          id={`${id}-title`}
          className="font-community-heading flex min-w-0 items-center gap-2.5 text-xl font-semibold tracking-tight"
        >
          {Icon && (
            <Icon
              aria-hidden
              className="text-muted-foreground size-5 shrink-0"
            />
          )}
          {title}
        </h2>
        {status}
      </div>
      {description && (
        <p className="text-muted-foreground mt-1.5 max-w-[65ch] text-sm leading-relaxed">
          {description}
        </p>
      )}
      <div className="mt-4 min-w-0">{children}</div>
    </section>
  );
}

export function BuilderResource({
  href,
  label,
  description,
  icon: Icon,
}: {
  href: string;
  label: string;
  description?: string;
  icon?: LucideIcon;
}) {
  const className =
    "border-border hover:bg-muted/50 focus-visible:ring-ring/60 flex min-h-11 items-center gap-3 border-b px-2 py-2.5 focus-visible:ring-2 focus-visible:outline-none";
  const content = (
    <>
      {Icon && (
        <Icon aria-hidden className="text-muted-foreground size-4 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        {description && (
          <p className="text-muted-foreground mt-0.5 text-sm">{description}</p>
        )}
      </div>
      <ArrowRightIcon
        aria-hidden
        className="text-muted-foreground size-4 shrink-0"
      />
    </>
  );
  return href.startsWith("/") ? (
    <Link href={href} className={className}>
      {content}
    </Link>
  ) : (
    <a href={href} className={className}>
      {content}
    </a>
  );
}

export function BuilderSkeleton({
  label,
  className = "h-36",
}: {
  label: string;
  className?: string;
}) {
  return (
    <div role="status">
      <span className="sr-only">{label}</span>
      <Skeleton className={className} aria-hidden />
    </div>
  );
}

export function BuilderFeedback({
  children,
  tone = "error",
  title,
  detail,
  action,
  inlineAction = false,
}: {
  children: ReactNode;
  tone?: "error" | "success";
  title?: ReactNode;
  detail?: ReactNode;
  action?: ReactNode;
  inlineAction?: boolean;
}) {
  return (
    <div
      data-tone={tone}
      className={`rounded-md border px-3 py-2 text-sm ${inlineAction ? "flex flex-wrap items-center gap-x-4 gap-y-2" : ""} ${tone === "error" ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-success/30 bg-success/5 text-success"}`}
    >
      <div
        className={inlineAction ? "min-w-0 flex-1 basis-64" : undefined}
        role={tone === "error" ? "alert" : "status"}
      >
        {title && <p className="font-semibold">{title}</p>}
        <p className={title ? "text-foreground mt-1" : undefined}>{children}</p>
        {detail && (
          <p className="text-muted-foreground mt-1 text-xs">{detail}</p>
        )}
      </div>
      {action && (
        <div
          className={`flex flex-wrap gap-2 ${inlineAction ? "shrink-0" : "mt-2"}`}
        >
          {action}
        </div>
      )}
    </div>
  );
}

export function BuilderFailure({
  status,
  reason,
  children,
  action,
  detail,
}: {
  status?: number | string;
  reason: ReactNode;
  children: ReactNode;
  action: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <BuilderFeedback
      inlineAction
      title={
        <>
          {status !== undefined && (
            <>
              <span className="font-mono text-xs">HTTP {status}</span>
              <span aria-hidden="true"> · </span>
            </>
          )}
          {reason}
        </>
      }
      detail={detail}
      action={action}
    >
      {children}
    </BuilderFeedback>
  );
}

export function BuilderLoadFailure({
  reason,
  status,
  onRetry,
}: {
  reason: string;
  status?: number;
  onRetry: () => void;
}) {
  const t = useTranslations("common");
  return (
    <BuilderFailure
      reason={reason}
      status={status}
      action={<BuilderRetry label={t("retry")} onClick={onRetry} />}
    >
      {t("errorDescription")}
    </BuilderFailure>
  );
}

export function BuilderRetry({
  label,
  ...props
}: Pick<
  ComponentProps<typeof Button>,
  "onClick" | "disabled" | "type" | "form"
> & {
  label: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={`${builderControl} text-foreground`}
      {...props}
    >
      {label}
    </Button>
  );
}

export function BuilderDisclosure({
  title,
  children,
  icon: Icon,
  open,
}: {
  title: string;
  children: ReactNode;
  icon?: LucideIcon;
  open?: boolean;
}) {
  return (
    <details
      open={open}
      className="min-w-0 [&[open]>summary>svg:last-child]:rotate-180"
    >
      <summary className="hover:bg-muted/60 focus-visible:outline-ring flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md px-2 text-sm font-medium focus-visible:outline-2 [&::-webkit-details-marker]:hidden">
        {Icon && <Icon aria-hidden className="size-4" />}
        <span className="flex-1">{title}</span>
        <ChevronDownIcon aria-hidden className="text-muted-foreground size-4" />
      </summary>
      <div className="min-w-0 space-y-3 pb-4">{children}</div>
    </details>
  );
}
